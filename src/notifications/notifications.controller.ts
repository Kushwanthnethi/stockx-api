import { Controller, Get, Patch, Param, Query, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query('type') type?: string) {
    return this.notificationsService.findAll(req.user.userId, type);
  }

  @Get('unread-count')
  @UseGuards(AuthGuard('jwt'))
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user.userId);
    return { count };
  }

  @Patch('read-all')
  @UseGuards(AuthGuard('jwt'))
  markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard('jwt'))
  markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }
}
