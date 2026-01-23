import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PostsService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService
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

    async findAll(userId?: string) {
        const posts = await this.prisma.post.findMany({
            where: { isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: {
                user: true,
                originalPost: {
                    include: {
                        user: true,
                    }
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
                    postId: { in: posts.map(p => p.id) }
                },
                select: { postId: true }
            });
            const likedPostIds = new Set(likedPosts.map(lp => lp.postId));

            const bookmarkedPosts = await this.prisma.interaction.findMany({
                where: {
                    userId: userId,
                    type: 'BOOKMARK',
                    postId: { in: posts.map(p => p.id) }
                },
                select: { postId: true }
            });
            const bookmarkedPostIds = new Set(bookmarkedPosts.map(bp => bp.postId));

            const following = await this.prisma.follow.findMany({
                where: { followerId: userId },
                select: { followeeId: true }
            });
            const followingIds = new Set(following.map(f => f.followeeId));

            return posts.map(post => ({
                ...post,
                likedByMe: likedPostIds.has(post.id),
                bookmarkedByMe: bookmarkedPostIds.has(post.id),
                isFollowingAuthor: followingIds.has(post.userId),
                originalPost: post.originalPost ? {
                    ...post.originalPost,
                    isFollowingAuthor: followingIds.has(post.originalPost.userId)
                } : null
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
                await this.notificationsService.create(post.userId, userId, 'LIKE', postId);
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
            await this.notificationsService.create(post.userId, userId, 'COMMENT', postId);
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
        const originalPost = await this.prisma.post.findUnique({ where: { id: originalPostId } });
        if (!originalPost) throw new Error('Post not found');

        // Check if user already reshared this post
        const existingReshare = await this.prisma.post.findFirst({
            where: {
                userId: userId,
                originalPostId: originalPostId
            },
            include: {
                user: true,
                originalPost: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (existingReshare) {
            return existingReshare;
        }

        // Create a new post as a reshare
        const reshare = await this.prisma.post.create({
            data: {
                content: "", // Content can be empty for a simple reshare
                userId: userId,
                originalPostId: originalPostId,
            },
            include: {
                user: true,
                originalPost: {
                    include: {
                        user: true
                    }
                }
            }
        });

        // Increment reshare count on original
        await this.prisma.post.update({
            where: { id: originalPostId },
            data: { reshareCount: { increment: 1 } }
        });

        return reshare;
    } async delete(id: string) {
        return this.prisma.post.update({
            where: { id },
            data: { isDeleted: true },
        });
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

        return bookmarks.map(b => b.post);
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
                    mode: 'insensitive'
                },
                isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            include: {
                user: true,
                originalPost: {
                    include: {
                        user: true,
                    }
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
                    postId: { in: posts.map(p => p.id) }
                },
                select: { postId: true }
            });
            const likedPostIds = new Set(likedPosts.map(lp => lp.postId));

            const bookmarkedPosts = await this.prisma.interaction.findMany({
                where: {
                    userId: userId,
                    type: 'BOOKMARK',
                    postId: { in: posts.map(p => p.id) }
                },
                select: { postId: true }
            });
            const bookmarkedPostIds = new Set(bookmarkedPosts.map(bp => bp.postId));

            const following = await this.prisma.follow.findMany({
                where: { followerId: userId },
                select: { followeeId: true }
            });
            const followingIds = new Set(following.map(f => f.followeeId));

            return posts.map(post => ({
                ...post,
                likedByMe: likedPostIds.has(post.id),
                bookmarkedByMe: bookmarkedPostIds.has(post.id),
                isFollowingAuthor: followingIds.has(post.userId),
                originalPost: post.originalPost ? {
                    ...post.originalPost,
                    isFollowingAuthor: followingIds.has(post.originalPost.userId)
                } : null
            }));
        }

        return posts;
    }
}
