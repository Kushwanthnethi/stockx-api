import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @UseGuards(AuthGuard('jwt'))
    findAll(@Req() req: any) {
        return this.notificationsService.findAll(req.user.userId);
    }
}
