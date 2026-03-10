import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { AngelOneService } from './angel-one.service';

@Controller('stocks')
export class StocksController {
  constructor(
    private readonly stocksService: StocksService,
    private readonly angelOneService: AngelOneService
  ) { }

  @Get('angel-auth-test')
  async testAngelAuth() {
    console.log('--- Testing Angel Auth via API ---');
    const result = await this.angelOneService.login();
    if (result) {
      return {
        status: 'success',
        jwt: this.angelOneService.getJwtToken()?.substring(0, 20) + '...',
        feed: this.angelOneService.getFeedToken()?.substring(0, 20) + '...'
      };
    }
    return { status: 'failed' };
  }

  @Get()
  findAll() {
    return this.stocksService.findAll();
  }

  @Get('market')
  getMarketSummary(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.stocksService.getMarketSummary(Number(page), Number(limit));
  }

  @Get('trending')
  getTrending() {
    return this.stocksService.getTrending();
  }

  @Get('market-movers')
  getMarketMovers() {
    return this.stocksService.getMarketMovers();
  }

  @Get('indices')
  getIndices() {
    return this.stocksService.getIndices();
  }

  @Post('batch')
  getBatch(@Body('symbols') symbols: string[]) {
    return this.stocksService.getBatch(symbols);
  }

  @Get('news')
  getMarketNews() {
    return this.stocksService.getMarketNews();
  }

  @Get('earnings-calendar')
  getEarningsCalendar() {
    return this.stocksService.getEarningsCalendar();
  }

  @Get(':symbol/earnings-analysis')
  getEarningsDetails(@Param('symbol') symbol: string) {
    return this.stocksService.getEarningsDetails(symbol);
  }

  @Get(':symbol/quarterly')
  getQuarterlyResults(@Param('symbol') symbol: string) {
    return this.stocksService.getQuarterlyDetails(symbol);
  }

  @Get(':symbol/news')
  async getStockNews(@Param('symbol') symbol: string) {
    return this.stocksService.getStockNews(symbol.toUpperCase());
  }

  @Get(':symbol/peers')
  async getPeers(@Param('symbol') symbol: string) {
    return this.stocksService.getPeers(symbol.toUpperCase());
  }

  @Get('search')
  async search(@Query('q') query: string) {
    if (!query) return [];
    return this.stocksService.searchStocks(query);
  }

  @Get(':symbol/history')
  getHistory(
    @Param('symbol') symbol: string,
    @Query('range') range: '1d' | '1w' | '1mo' | '3mo' | '1y',
  ) {
    return this.stocksService.getHistory(symbol, range);
  }

  @Get(':symbol')
  findOne(@Param('symbol') symbol: string) {
    return this.stocksService.findOne(symbol.toUpperCase());
  }

  @Post(':symbol/watch')
  toggleWatchlist(
    @Param('symbol') symbol: string,
    @Body('userId') userId: string, // In real app, get from req.user
  ) {
    return this.stocksService.toggleWatchlist(userId, symbol.toUpperCase());
  }

  @Get('user/:userId/watchlist')
  getWatchlist(@Param('userId') userId: string) {
    return this.stocksService.getWatchlist(userId);
  }
}
