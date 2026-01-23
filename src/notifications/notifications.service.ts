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

    async findAll(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                actor: {
                    select: {
                        id: true,
                        handle: true,
                        firstName: true,
                        lastName: true,
                        avatarUrl: true,
                    }
                },
                post: {
                    select: {
                        id: true,
                        content: true,
                    }
                }
            },
        });
    }
}
