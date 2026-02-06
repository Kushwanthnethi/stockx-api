import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StocksService } from './stocks.service';
import { StocksController } from './stocks.controller';
import { StockOfTheWeekService } from './stock-of-the-week.service';
import { StockOfTheWeekController } from './stock-of-the-week.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { VerdictsService } from './verdicts.service';
import { VerdictsController } from './verdicts.controller';
import { AIConfigService } from './ai-config.service';
import { ScrapeController } from '../controllers/scrape.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [StocksController, StockOfTheWeekController, VerdictsController, ScrapeController],
  providers: [
    StocksService,
    StockOfTheWeekService,
    VerdictsService,
    AIConfigService,
  ],
  exports: [StocksService, AIConfigService],
})
export class StocksModule { }
