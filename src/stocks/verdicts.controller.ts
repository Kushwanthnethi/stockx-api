import { Controller, Get, Post, Logger } from '@nestjs/common';
import { VerdictsService } from './verdicts.service';

@Controller('stocks/verdicts')
export class VerdictsController {
  private readonly logger = new Logger(VerdictsController.name);

  constructor(private readonly verdictsService: VerdictsService) {}

  @Get('nifty50')
  getNifty50Verdicts() {
    return this.verdictsService.getNifty50Verdicts();
  }

  // Admin or Dev trigger to force refresh
  @Post('refresh-all')
  async forceRefresh() {
    this.logger.log('Manual refresh triggered via /refresh-all');
    // Triggering async
    const stocks = await this.verdictsService.getNifty50Verdicts();
    return { message: 'Smart refresh cycle triggered.' };
  }
}
