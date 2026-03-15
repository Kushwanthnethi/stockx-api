import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RiskLevel = 'safe' | 'review' | 'high';

const HIGH_RISK_TERMS = ['scam', 'fraud', 'hate', 'kill', 'attack', 'nsfw', 'terror'];
const REVIEW_TERMS = ['rumor', 'leak', 'insider', 'manipulate', 'panic', 'dump', 'pump'];

const inferRiskLevel = (content: string): RiskLevel => {
  const normalized = content.toLowerCase();
  if (HIGH_RISK_TERMS.some((term) => normalized.includes(term))) return 'high';
  if (REVIEW_TERMS.some((term) => normalized.includes(term))) return 'review';
  return 'safe';
};

const startOfDay = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const formatDay = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

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

  async getInsights() {
    const now = new Date();
    const startToday = startOfDay(now);
    const sevenDaysAgo = new Date(startToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      newUsersLast7Days,
      newUsersPrev7Days,
      postsLast7Days,
      postsPrev7Days,
      stockFreshness,
      stocksWithPrice,
      stocksWithChange,
      visitsLast7Days,
      postsLast24Hours,
      recentPosts,
      topAuthors,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000),
            lt: sevenDaysAgo,
          },
        },
      }),
      this.prisma.post.count({
        where: {
          isDeleted: false,
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.post.count({
        where: {
          isDeleted: false,
          createdAt: {
            gte: new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000),
            lt: sevenDaysAgo,
          },
        },
      }),
      this.prisma.stock.count({
        where: {
          lastUpdated: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.stock.count({ where: { currentPrice: { not: null } } }),
      this.prisma.stock.findMany({
        where: { changePercent: { not: null } },
        select: { changePercent: true },
      }),
      this.prisma.userVisit.findMany({
        where: { visitDate: { gte: sevenDaysAgo } },
        select: { visitDate: true, count: true },
      }),
      this.prisma.post.findMany({
        where: {
          isDeleted: false,
          createdAt: { gte: last24Hours },
        },
        select: { createdAt: true },
      }),
      this.prisma.post.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 250,
        select: {
          id: true,
          createdAt: true,
          content: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              handle: true,
            },
          },
        },
      }),
      this.prisma.user.findMany({
        orderBy: { posts: { _count: 'desc' } },
        take: 5,
        select: {
          handle: true,
          firstName: true,
          lastName: true,
          _count: {
            select: { posts: true },
          },
        },
      }),
    ]);

    const percentDelta = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const dailySeed = Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(sevenDaysAgo);
      day.setDate(sevenDaysAgo.getDate() + index);
      return {
        key: day.toISOString().slice(0, 10),
        label: formatDay(day),
        newUsers: 0,
        activeUsers: 0,
      };
    });

    const dailyMap = new Map(dailySeed.map((item) => [item.key, item]));

    visitsLast7Days.forEach((visit) => {
      const key = new Date(visit.visitDate).toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (entry) {
        entry.activeUsers += 1;
      }
    });

    const newUsersByDay = await this.prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    });

    newUsersByDay.forEach((user) => {
      const key = new Date(user.createdAt).toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (entry) {
        entry.newUsers += 1;
      }
    });

    const marketMovers = stocksWithChange.reduce(
      (acc, stock) => {
        const change = stock.changePercent ?? 0;
        if (change >= 2) acc.gainers += 1;
        if (change <= -2) acc.losers += 1;
        return acc;
      },
      { gainers: 0, losers: 0 },
    );

    const hourlyActivityMap = new Map<number, number>();
    for (let hour = 0; hour < 24; hour += 1) {
      hourlyActivityMap.set(hour, 0);
    }
    postsLast24Hours.forEach((post) => {
      const hour = new Date(post.createdAt).getHours();
      hourlyActivityMap.set(hour, (hourlyActivityMap.get(hour) || 0) + 1);
    });

    const moderationCounts = recentPosts.reduce(
      (acc, post) => {
        const risk = inferRiskLevel(post.content || '');
        acc[risk] += 1;
        return acc;
      },
      { safe: 0, review: 0, high: 0 },
    );

    const highRiskRecent = recentPosts.filter(
      (post) => inferRiskLevel(post.content || '') === 'high',
    ).length;

    const systemHealthScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (stockFreshness / Math.max(1, stocksWithPrice)) * 45 +
            ((recentPosts.length - highRiskRecent) / Math.max(1, recentPosts.length)) * 35 +
            (newUsersLast7Days >= newUsersPrev7Days ? 20 : 12),
        ),
      ),
    );

    return {
      growth: {
        users7d: newUsersLast7Days,
        usersDeltaPct: percentDelta(newUsersLast7Days, newUsersPrev7Days),
        posts7d: postsLast7Days,
        postsDeltaPct: percentDelta(postsLast7Days, postsPrev7Days),
      },
      trends: {
        dailyUsers: dailySeed,
        hourlyPosts: Array.from(hourlyActivityMap.entries()).map(([hour, posts]) => ({
          label: `${String(hour).padStart(2, '0')}:00`,
          posts,
        })),
      },
      moderation: {
        safe: moderationCounts.safe,
        review: moderationCounts.review,
        high: moderationCounts.high,
      },
      market: {
        pricedStocks: stocksWithPrice,
        freshStocks: stockFreshness,
        movers: marketMovers,
      },
      systemHealth: {
        score: systemHealthScore,
        staleStocks: Math.max(stocksWithPrice - stockFreshness, 0),
        highRiskQueue: highRiskRecent,
      },
      topAuthors: topAuthors.map((author) => ({
        handle: author.handle,
        name: `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'Unknown',
        posts: author._count.posts,
      })),
    };
  }
}
