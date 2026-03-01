import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) { }

  async create(userId: string, actorId: string, type: string, postId?: string) {
    if (userId === actorId) return; // Don't notify self-actions

    return this.prisma.notification.create({
      data: {
        userId,
        actorId,
        type,
        postId,
      },
    });
  }

  async findAll(userId: string, type?: string) {
    const where: any = { userId };
    if (type) {
      where.type = type;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            handle: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        post: {
          select: {
            id: true,
            content: true,
          },
        },
      },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }
}
