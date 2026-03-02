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
import { BseScraperService } from '../services/bse-scraper.service';

import { YahooFinanceService } from './yahoo-finance.service';
import { FyersService } from './fyers.service';
import { FyersController } from './fyers.controller';
import { StocksGateway } from './stocks.gateway';
import { FyersSocketService } from './fyers-socket.service';
import { SowReportService } from './sow-report.service';
import { MailService } from '../services/mail.service';
import { GroqService } from '../services/groq.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [StocksController, StockOfTheWeekController, VerdictsController, ScrapeController, FyersController],
  providers: [
    StocksService,
    StockOfTheWeekService,
    VerdictsService,
    AIConfigService,
    BseScraperService,
    YahooFinanceService,
    FyersService,
    StocksGateway,
    FyersSocketService,
    SowReportService,
    MailService,
    GroqService,
  ],
  exports: [StocksService, AIConfigService, YahooFinanceService, FyersService],
})
export class StocksModule { }

