import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StocksService } from '../stocks/stocks.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const stocksService = app.get(StocksService);

    const symbol = '20MICRONS.NS';
    console.log(`\n=== Outlier Detection for ${symbol} ===`);

    const ranges = ['1d', '1w', '1mo', '3mo', '1y'] as const;

    for (const range of ranges) {
        try {
            console.log(`\nRange: ${range}`);
            const data = await stocksService.getHistory(symbol, range);

            if (data.length === 0) {
                console.log('No data returned.');
                continue;
            }

            const prices = data.map((d: any) => d.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;

            console.log(`Points: ${data.length}`);
            console.log(`Min: ${minPrice}`);
            console.log(`Max: ${maxPrice}`);
            console.log(`Avg: ${avgPrice.toFixed(2)}`);

            const outliers = data.filter((d: any) => d.price < minPrice * 1.01 || d.price > maxPrice * 0.99);
            // Just check for extreme outliers relative to avg
            const extremeLow = data.filter((d: any) => d.price < avgPrice / 2);
            const extremeHigh = data.filter((d: any) => d.price > avgPrice * 2);

            if (extremeLow.length > 0) {
                console.log(`!!! Found ${extremeLow.length} extreme LOW outliers (price < ${avgPrice / 2})`);
                console.log('First 3:', extremeLow.slice(0, 3).map((d: any) => ({ date: d.date, price: d.price })));
            }
            if (extremeHigh.length > 0) {
                console.log(`!!! Found ${extremeHigh.length} extreme HIGH outliers (price > ${avgPrice * 2})`);
                console.log('First 3:', extremeHigh.slice(0, 3).map((d: any) => ({ date: d.date, price: d.price })));
            }

        } catch (error) {
            console.error(`Error fetching ${range}:`, error.message);
        }
    }

    await app.close();
    process.exit(0);
}

bootstrap();
