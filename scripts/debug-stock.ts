import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StocksService } from '../src/stocks/stocks.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const stocksService = app.get(StocksService);
    const symbol = 'ZOMATO.NS';

    console.log(`Debug fetching ${symbol}...`);
    try {
        const stock = await stocksService.findOne(symbol);
        console.log('Result Stock:', JSON.stringify(stock, null, 2));
    } catch (e) {
        console.error('Debug fetch failed:', e);
    }

    await app.close();
}

bootstrap();
