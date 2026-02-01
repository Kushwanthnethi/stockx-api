
import { PrismaClient } from '@prisma/client';
import { StocksService } from './src/stocks/stocks.service';
import { StockOfTheWeekService } from './src/stocks/stock-of-the-week.service';
import { AIConfigService } from './src/stocks/ai-config.service';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

async function main() {
    const logBatch = (msg: string) => {
        console.log(msg);
        fs.appendFileSync('manual_sow_debug.log', msg + '\n');
    };

    fs.writeFileSync('manual_sow_debug.log', 'Starting manual SOW trigger...\n');

    const prisma = new PrismaClient();
    const stocksService = new StocksService(prisma as any);
    const aiConfig = new AIConfigService();

    // Patch logger to capture logs
    const mockLogger = {
        log: (msg: string) => logBatch(`[LOG] ${msg}`),
        warn: (msg: string) => logBatch(`[WARN] ${msg}`),
        error: (msg: string, err?: any) => logBatch(`[ERROR] ${msg} ${err ? JSON.stringify(err) : ''}`),
        debug: (msg: string) => logBatch(`[DEBUG] ${msg}`),
    };

    const sowService = new StockOfTheWeekService(
        prisma as any,
        stocksService,
        aiConfig
    );
    (sowService as any).logger = mockLogger;

    logBatch('Triggering manual Stock of the Week selection...');
    try {
        const result = await sowService.selectStockOfTheWeek();
        logBatch(`Selection successful: ${result?.symbol}`);
    } catch (error: any) {
        logBatch(`Selection failed: ${error?.message || error}`);
    } finally {
        await prisma.$disconnect();
    }
}

main();
