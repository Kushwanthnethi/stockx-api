import { Module } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';
import { StockOfTheWeekService } from './stock-of-the-week.service';
import { StockOfTheWeekController } from './stock-of-the-week.controller';
import { ScreenerService } from './screener.service';
import { ScreenerController } from './screener.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StocksController, StockOfTheWeekController, ScreenerController],
  providers: [StocksService, StockOfTheWeekService, ScreenerService],
})
export class StocksModule { }


