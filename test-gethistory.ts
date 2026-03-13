import { Test, TestingModule } from '@nestjs/testing';
import { StocksService } from './src/stocks/stocks.service';
import { PrismaService } from './src/prisma/prisma.service';
import { YahooFinanceService } from './src/stocks/yahoo-finance.service';
import { AngelOneService } from './src/stocks/angel-one.service';
import { AngelInstrumentService } from './src/stocks/angel-instrument.service';

async function bootstrap() {
    const moduleRef = await Test.createTestingModule({
        providers: [
            StocksService,
            PrismaService,
            YahooFinanceService,
            AngelOneService,
            AngelInstrumentService
        ],
    }).compile();

    const stocksService = moduleRef.get<StocksService>(StocksService);

    console.log("Fetching 1w history for M&M.NS...");
    const history = await stocksService.getHistory('M&M.NS', '1w');

    if (history.length > 0) {
        console.log(`Success: Got ${history.length} points.`);
        console.log(`First point:`, history[0]);
        console.log(`Last point:`, history[history.length - 1]);
    } else {
        console.log("Failed: Got 0 points.");
    }
}

bootstrap();
