import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PostsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) { }

  // ... (create and findAll remain same)

  async create(userId: string, createPostDto: CreatePostDto) {
    return this.prisma.post.create({
      data: {
        content: createPostDto.content,
        userId: userId,
        imageUrl: createPostDto.imageUrl,
      },
      include: {
        user: true,
        _count: {
          select: { comments: true },
        },
      },
    });
  }

  async findAll(userId?: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    // Fetches in parallel for performance
    if (userId) {
      const [blocked, reported, posts] = await Promise.all([
        this.prisma.block.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        this.prisma.interaction.findMany({
          where: { userId, type: 'REPORT' },
          select: { postId: true },
        }),
        this.prisma.post.findMany({
          where: { isDeleted: false }, // We filter ID/UserId later to avoid double query complexity, or we can do 2-step
          // Actually, we can't do 2-step easily if we want purely parallel. 
          // Better approach: Get blocked/reported first (fast), then get posts, then get likes/bookmarks (parallel).
        })
      ]);
      // Wait, that changed the logic. The logical flow was:
      // 1. Get Blocked/Reported
      // 2. Get Posts (filtering out blocked/reported)
      // 3. Get Likes/Bookmarks/Following FOR THOSE POSTS.

      // So we can only parallelize Step 1 and Step 3.
    }

    // Let's rewrite strictly to parallelize where possible.

    let blockedIds: string[] = [];
    let reportedPostIds: string[] = [];

    if (userId) {
      const [blocked, reported] = await Promise.all([
        this.prisma.block.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        this.prisma.interaction.findMany({
          where: { userId, type: 'REPORT' },
          select: { postId: true },
        }),
      ]);
      blockedIds = blocked.map((b) => b.blockedId);
      reportedPostIds = reported.map((r) => r.postId);
    }

    const whereClause: any = { isDeleted: false };
    if (userId) {
      if (blockedIds.length > 0) whereClause.userId = { notIn: blockedIds };
      if (reportedPostIds.length > 0) whereClause.id = { notIn: reportedPostIds };
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      take: limit,
      skip: skip,
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        originalPost: {
          include: {
            user: true,
          },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    if (userId && posts.length > 0) {
      const postIds = posts.map((p) => p.id);
      const userIds = new Set(posts.map((p) => p.userId));
      // Also include original post users for following check
      posts.forEach(p => {
        if (p.originalPost) userIds.add(p.originalPost.userId);
      });

      const [likedPosts, bookmarkedPosts, following] = await Promise.all([
        this.prisma.interaction.findMany({
          where: {
            userId: userId,
            type: 'LIKE',
            postId: { in: postIds },
          },
          select: { postId: true },
        }),
        this.prisma.interaction.findMany({
          where: {
            userId: userId,
            type: 'BOOKMARK',
            postId: { in: postIds },
          },
          select: { postId: true },
        }),
        this.prisma.follow.findMany({
          where: {
            followerId: userId,
            followeeId: { in: Array.from(userIds) }
          },
          select: { followeeId: true },
        })
      ]);

      const likedPostIds = new Set(likedPosts.map((lp) => lp.postId));
      const bookmarkedPostIds = new Set(bookmarkedPosts.map((bp) => bp.postId));
      const followingIds = new Set(following.map((f) => f.followeeId));

      return posts.map((post) => ({
        ...post,
        likedByMe: likedPostIds.has(post.id),
        bookmarkedByMe: bookmarkedPostIds.has(post.id),
        isFollowingAuthor: followingIds.has(post.userId),
        originalPost: post.originalPost
          ? {
            ...post.originalPost,
            isFollowingAuthor: followingIds.has(post.originalPost.userId),
          }
          : null,
      }));
    }

    return posts;
  }

  async toggleLike(userId: string, postId: string) {
    // Check if already liked
    const existingLike = await this.prisma.interaction.findUnique({
      where: {
        userId_postId_type: {
          userId,
          postId,
          type: 'LIKE',
        },
      },
    });

    if (existingLike) {
      // Unlike
      await this.prisma.interaction.delete({
        where: { id: existingLike.id },
      });
      return this.prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
    } else {
      // Like
      await this.prisma.interaction.create({
        data: {
          userId,
          postId,
          type: 'LIKE',
        },
      });

      // Notify post owner
      const post = await this.prisma.post.findUnique({ where: { id: postId } });
      if (post) {
        await this.notificationsService.create(
          post.userId,
          userId,
          'LIKE',
          postId,
        );
      }

      return this.prisma.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
    }
  }

  async createComment(userId: string, postId: string, content: string) {
    const comment = await this.prisma.comment.create({
      data: {
        content,
        userId,
        postId,
      },
      include: {
        user: true,
      },
    });

    // Notify post owner
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (post) {
      await this.notificationsService.create(
        post.userId,
        userId,
        'COMMENT',
        postId,
      );
    }

    return comment;
  }

  async getComments(postId: string) {
    return this.prisma.comment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: true,
      },
    });
  }

  async sharePost(postId: string) {
    return this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
    });
  }

  async resharePost(userId: string, originalPostId: string) {
    // Fetch original post
    const originalPost = await this.prisma.post.findUnique({
      where: { id: originalPostId },
    });
    if (!originalPost) throw new Error('Post not found');

    // Check if user already reshared this post
    const existingReshare = await this.prisma.post.findFirst({
      where: {
        userId: userId,
        originalPostId: originalPostId,
      },
      include: {
        user: true,
        originalPost: {
          include: {
            user: true,
          },
        },
      },
    });

    if (existingReshare) {
      return existingReshare;
    }

    // Create a new post as a reshare
    const reshare = await this.prisma.post.create({
      data: {
        content: '', // Content can be empty for a simple reshare
        userId: userId,
        originalPostId: originalPostId,
      },
      include: {
        user: true,
        originalPost: {
          include: {
            user: true,
          },
        },
      },
    });

    // Increment reshare count on original
    await this.prisma.post.update({
      where: { id: originalPostId },
      data: { reshareCount: { increment: 1 } },
    });

    return reshare;
  }

  async delete(userId: string, id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new Error('Post not found');

    // Check if user is owner or admin
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (post.userId !== userId && user?.role !== 'ADMIN') {
      throw new Error('Unauthorized');
    }

    return this.prisma.post.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async update(userId: string, id: string, content: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new Error('Post not found');
    if (post.userId !== userId) throw new Error('Unauthorized');

    return this.prisma.post.update({
      where: { id },
      data: { content, updatedAt: new Date() },
    });
  }

  async reportPost(userId: string, postId: string) {
    // Create interaction with type REPORT
    // We use upsert to prevent double reporting crashing
    const existingReport = await this.prisma.interaction.findUnique({
      where: {
        userId_postId_type: {
          userId,
          postId,
          type: 'REPORT',
        },
      },
    });

    if (existingReport) return { reported: true };

    await this.prisma.interaction.create({
      data: {
        userId,
        postId,
        type: 'REPORT',
      },
    });
    return { reported: true };
  }

  async toggleBookmark(userId: string, postId: string) {
    // Check if already bookmarked
    const existingBookmark = await this.prisma.interaction.findUnique({
      where: {
        userId_postId_type: {
          userId,
          postId,
          type: 'BOOKMARK',
        },
      },
    });

    if (existingBookmark) {
      // Remove bookmark
      await this.prisma.interaction.delete({
        where: { id: existingBookmark.id },
      });
      return { bookmarked: false };
    } else {
      // Add bookmark
      await this.prisma.interaction.create({
        data: {
          userId,
          postId,
          type: 'BOOKMARK',
        },
      });
      return { bookmarked: true };
    }
  }

  async getBookmarks(userId: string) {
    const bookmarks = await this.prisma.interaction.findMany({
      where: {
        userId,
        type: 'BOOKMARK',
      },
      include: {
        post: {
          include: {
            user: true,
            originalPost: { include: { user: true } },
            _count: {
              select: { comments: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookmarks.map((b) => b.post);
  }

  async findBySymbol(symbol: string, userId?: string) {
    // Search for posts containing $SYMBOL (e.g. $RELIANCE)
    // We strip the suffix .NS usually, so RELIANCE.NS -> RELIANCE
    const cleanSymbol = symbol.split('.')[0].toUpperCase();
    const tag = `$${cleanSymbol}`;

    const posts = await this.prisma.post.findMany({
      where: {
        content: {
          contains: tag,
          mode: 'insensitive',
        },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: true,
        originalPost: {
          include: {
            user: true,
          },
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    if (userId) {
      const likedPosts = await this.prisma.interaction.findMany({
        where: {
          userId: userId,
          type: 'LIKE',
          postId: { in: posts.map((p) => p.id) },
        },
        select: { postId: true },
      });
      const likedPostIds = new Set(likedPosts.map((lp) => lp.postId));

      const bookmarkedPosts = await this.prisma.interaction.findMany({
        where: {
          userId: userId,
          type: 'BOOKMARK',
          postId: { in: posts.map((p) => p.id) },
        },
        select: { postId: true },
      });
      const bookmarkedPostIds = new Set(bookmarkedPosts.map((bp) => bp.postId));

      const following = await this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
      });
      const followingIds = new Set(following.map((f) => f.followeeId));

      return posts.map((post) => ({
        ...post,
        likedByMe: likedPostIds.has(post.id),
        bookmarkedByMe: bookmarkedPostIds.has(post.id),
        isFollowingAuthor: followingIds.has(post.userId),
        originalPost: post.originalPost
          ? {
            ...post.originalPost,
            isFollowingAuthor: followingIds.has(post.originalPost.userId),
          }
          : null,
      }));
    }

    return posts;
  }
}
