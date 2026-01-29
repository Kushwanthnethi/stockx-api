import { Module } from '@nestjs/common';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';
import { StockOfTheWeekService } from './stock-of-the-week.service';
import { StockOfTheWeekController } from './stock-of-the-week.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StocksController, StockOfTheWeekController],
  providers: [StocksService, StockOfTheWeekService],
  exports: [StocksService],
})
export class StocksModule { }

