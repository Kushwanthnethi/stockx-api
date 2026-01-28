import { Controller, Get, Query } from '@nestjs/common';
import { ScreenerService } from './screener.service';

@Controller('screener')
export class ScreenerController {
    constructor(private readonly screenerService: ScreenerService) { }

    @Get()
    async getScreener(
        @Query('type') type: string = 'gainers',
        @Query('cap') cap: string = 'all',
        @Query('count') count: string = '20'
    ) {
        return this.screenerService.getScreenerData({
            type: type as any,
            marketCapCategory: cap as any,
            count: parseInt(count, 10)
        });
    }
}
