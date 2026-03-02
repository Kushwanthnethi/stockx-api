import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StocksService } from '../stocks/stocks.service';
import { SymbolMapper } from '../stocks/utils/symbol-mapper.util';
import { FyersService } from '../stocks/fyers.service';

async function debugHistory() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const stocksService = app.get(StocksService);
    const fyersService = app.get(FyersService);

    const symbol = 'RELIANCE';
    const fyersSymbol = SymbolMapper.toFyers(symbol);

    const today = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Fetching history for ${fyersSymbol} from ${past} to ${today}...`);

    const fyersHistory = await fyersService.getHistory(fyersSymbol, '1', past, today);

    if (fyersHistory && fyersHistory.length > 0) {
        console.log(`Total points received: ${fyersHistory.length}`);

        const lastCandle = fyersHistory[fyersHistory.length - 1];
        const lastDate = new Date(lastCandle[0] * 1000);
        const latestDayStr = lastDate.toISOString().split('T')[0];

        console.log(`Last candle: ${lastDate.toISOString()} (Timestamp: ${lastCandle[0]})`);
        console.log(`Filtering for day: ${latestDayStr}`);

        let matchCount = 0;
        fyersHistory.forEach((c: any) => {
            const cDate = new Date(c[0] * 1000);
            if (cDate.toISOString().split('T')[0] === latestDayStr) {
                matchCount++;
            }
        });

        console.log(`Points matching ${latestDayStr}: ${matchCount}`);

        if (matchCount < 5) {
            console.log("DUMPING FIRST 5 AND LAST 5 MATCHES (OR ALL IF FEW):");
            const matches = fyersHistory.filter((c: any) => new Date(c[0] * 1000).toISOString().split('T')[0] === latestDayStr);
            matches.forEach((m: any, i: number) => console.log(`${i}: ${new Date(m[0] * 1000).toISOString()} - ${m[4]}`));

            console.log("\nDUMPING LAST 10 POINTS FROM FULL HISTORY:");
            fyersHistory.slice(-10).forEach((m: any, i: number) => console.log(`${i}: ${new Date(m[0] * 1000).toISOString()} - ${m[4]}`));
        }
    } else {
        console.log('No history returned.');
    }

    await app.close();
}

debugHistory().catch(console.error);
