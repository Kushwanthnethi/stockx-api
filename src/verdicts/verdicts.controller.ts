import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { VerdictsService } from './verdicts.service';

@Controller('verdicts')
export class VerdictsController {
    constructor(private readonly verdictsService: VerdictsService) { }

    @Get()
    async getVerdicts(@Query('category') category: string = 'LARGE_CAP') {
        const cat = category.toUpperCase() === 'MID_CAP' ? 'MID_CAP' : 'LARGE_CAP';
        return this.verdictsService.getVerdicts(cat);
    }

    // Admin or debugging endpoint to trigger generation manually
    // In production, you'd add @UseGuards(AdminGuard)
    @Post('refresh')
    async triggerRefresh() {
        return this.verdictsService.forceRefresh();
    }
}
