import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const totalUsers = await this.prisma.user.count();
    const totalPosts = await this.prisma.post.count({
      where: { isDeleted: false },
    });
    const totalStocks = await this.prisma.stock.count();

    // Active users: Users who visited today
    // Assuming we track 'lastLogin' or similar, but for now let's use userVisits if available,
    // or just 'new users today' as a proxy if visits aren't robustly populated yet.
    // Based on `users.service.ts`, there is `recordVisit`. So let's count unique UserVisits for today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeUsers = await this.prisma.userVisit.count({
      where: {
        visitDate: {
          gte: today,
        },
      },
    });

    return {
      totalUsers,
      totalPosts,
      totalStocks,
      activeUsers,
    };
  }

  async getUsers(page: number, limit: number, search: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { handle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          handle: true,
          role: true,
          createdAt: true,
          avatarUrl: true,
          _count: {
            select: { posts: true, followers: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
