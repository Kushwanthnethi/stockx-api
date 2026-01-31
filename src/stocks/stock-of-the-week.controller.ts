import { Controller, Get, Post } from '@nestjs/common';
import { StockOfTheWeekService } from './stock-of-the-week.service';

@Controller('stocks/weekly')
export class StockOfTheWeekController {
  constructor(private readonly sowService: StockOfTheWeekService) {}

  @Get('latest')
  async getLatest() {
    const pick = await this.sowService.getLatestPick();
    if (pick) {
      console.log(
        `[API] Serving Stock of the Week: ${pick.stockSymbol}, Narrative Length: ${pick.narrative?.length}`,
      );
    }
    return pick;
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

  @Post('reset')
  async reset() {
    return this.sowService.reset();
  }
}
