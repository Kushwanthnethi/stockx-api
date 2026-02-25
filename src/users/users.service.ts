import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: {
    email: string;
    firstName: string;
    lastName: string;
    picture?: string;
    password?: string;
  }) {
    // Generate a handle from names
    const baseHandle = (data.firstName + data.lastName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    let handle = baseHandle;
    // ensure at least some length
    if (handle.length < 3) {
      handle = 'user' + Math.floor(Math.random() * 10000);
    }

    let counter = 1;
    while (await this.prisma.user.findUnique({ where: { handle } })) {
      handle = `${baseHandle}${counter}`;
      counter++;
    }

    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : 'oauth-user';

    return this.prisma.user.create({
      data: {
        email: data.email,
        handle: handle,
        avatarUrl: data.picture,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: passwordHash,
      },
    });
  }

  findAll() {
    return this.prisma.user.findMany();
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByHandle(handle: string) {
    return this.prisma.user.findUnique({
      where: { handle },
      include: {
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });
  }

  async updateProfile(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      bio?: string;
      avatarUrl?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async followUser(followerId: string, followeeId: string) {
    if (followerId === followeeId) throw new Error('Cannot follow yourself');

    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followeeId: {
          followerId,
          followeeId,
        },
      },
    });

    if (existingFollow) {
      return existingFollow;
    }

    return this.prisma.follow.create({
      data: {
        followerId,
        followeeId,
      },
    });
  }

  async unfollowUser(followerId: string, followeeId: string) {
    return this.prisma.follow.deleteMany({
      where: {
        followerId,
        followeeId,
      },
    });
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new Error('Cannot block yourself');

    // Also force unfollow if blocking
    await this.unfollowUser(blockerId, blockedId);
    await this.unfollowUser(blockedId, blockerId);

    // Upsert block
    return this.prisma.block.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
      create: {
        blockerId,
        blockedId,
      },
      update: {},
    });
  }

  // Check if followerId follows followeeId
  async isFollowing(followerId: string, followeeId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followeeId: {
          followerId,
          followeeId,
        },
      },
    });
    return !!follow;
  }

  async getFollowers(userId: string) {
    const followers = await this.prisma.follow.findMany({
      where: { followeeId: userId },
      include: {
        follower: {
          select: {
            id: true,
            handle: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
    });
    return followers.map((f) => f.follower);
  }

  async getFollowing(userId: string) {
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        followee: {
          select: {
            id: true,
            handle: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
    });
    return following.map((f) => f.followee);
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.updateProfile(id, updateUserDto);
  }

  remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }

  async recordVisit(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to midnight

    try {
      // Upsert ensures we don't crash on duplicate key, and only create if not exists
      return await this.prisma.userVisit.upsert({
        where: {
          userId_visitDate: {
            userId,
            visitDate: today,
          },
        },
        create: {
          userId,
          visitDate: today,
        },
        update: {}, // Do nothing if exists
      });
    } catch (e) {
      // Ignore race conditions or errors
      return null;
    }
  }

  async getUserVisits(userId: string) {
    // Get visits for the current year (2026 onwards)
    const startDate = new Date('2026-01-01');
    const visits = await this.prisma.userVisit.findMany({
      where: {
        userId,
        visitDate: {
          gte: startDate,
        },
      },
      select: {
        visitDate: true,
      },
    });

    // Grouping isn't strictly needed as we store one per day, but let's return counts just in case we change logic later
    // or just return dates. Front-end expects generic "count".
    // Actually, since unique constraint is user+date, count is always 1 per date.
    const visitMap = new Map<string, number>();
    visits.forEach((v) => {
      const dateStr = v.visitDate.toISOString().split('T')[0];
      visitMap.set(dateStr, 1);
    });

    return Array.from(visitMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }

  async updatePassword(email: string, rawPassword: string) {
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    return this.prisma.user.update({
      where: { email },
      data: { passwordHash },
    });
  }

  async updatePreferences(userId: string, prefs: { receiveReport?: boolean }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(prefs.receiveReport !== undefined && { receiveReport: prefs.receiveReport }),
      },
      select: {
        id: true,
        receiveReport: true,
      },
    });
  }
}
