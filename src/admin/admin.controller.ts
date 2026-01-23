import { Controller, Get, Query, UseGuards, UnauthorizedException, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('stats')
    async getStats(@Req() req: any) {
        this.checkAdminRole(req.user);
        return this.adminService.getStats();
    }

    @Get('users')
    async getUsers(
        @Req() req: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
        @Query('search') search: string = ''
    ) {
        this.checkAdminRole(req.user);
        return this.adminService.getUsers(Number(page), Number(limit), search);
    }

    private checkAdminRole(user: any) {
        // In JWT strategy, user might just contain basic info. 
        // We rely on the validateUser from strategy which returns full user object usually,
        // OR if strategy returns simple payload, we might need to fetch.
        // Based on auth.service, validateUser returns keys excluding passwordHash, so `role` should be there.
        if (user.role !== 'ADMIN') {
            throw new UnauthorizedException('Admin access required');
        }
    }
}
