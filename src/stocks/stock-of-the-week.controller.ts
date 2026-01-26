
import { Controller, Get, Post } from '@nestjs/common';
import { StockOfTheWeekService } from './stock-of-the-week.service';

@Controller('stocks/weekly')
export class StockOfTheWeekController {
    constructor(private readonly sowService: StockOfTheWeekService) { }

    @Get('latest')
    async getLatest() {
        return this.sowService.getLatestPick();
    }

    @Get('archive')
    async getArchive() {
        return this.sowService.getArchive();
    }

    // Admin/Dev only - trigger manually
    @Post('trigger')
    async triggerSelection() {
        return this.sowService.selectStockOfTheWeek();
    }
}
