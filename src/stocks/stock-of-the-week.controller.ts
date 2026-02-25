import { Controller, Get, Post, Query } from '@nestjs/common';
import { StockOfTheWeekService } from './stock-of-the-week.service';
import { SowReportService } from './sow-report.service';

@Controller('stocks/weekly')
export class StockOfTheWeekController {
  constructor(
    private readonly sowService: StockOfTheWeekService,
    private readonly sowReportService: SowReportService,
  ) { }

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

  // SOW Report: record today's prices manually
  @Post('record-daily')
  async recordDaily() {
    return this.sowReportService.triggerManualReport();
  }

  @Post('send-report')
  async sendReport(
    @Query('testEmail') testEmail?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;

    return this.sowReportService.triggerMonthlyManual(testEmail, monthNum, yearNum);
  }
}
