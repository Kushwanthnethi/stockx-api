
import { PrismaClient } from '@prisma/client';
import { NIFTY_100 } from './src/stocks/market-data';

const prisma = new PrismaClient();

async function main() {
    console.log('Safe Seeding Nifty 100 stocks...');
    let count = 0;
    for (const stock of NIFTY_100) {
        await prisma.stock.upsert({
            where: { symbol: stock.symbol },
            update: {
                // Update company name if changed, but keep other dynamic fields if they exist
                companyName: stock.companyName,
            },
            create: {
                symbol: stock.symbol,
                companyName: stock.companyName,
                exchange: 'NSE',
                currentPrice: 0,
                changePercent: 0,
                marketCap: 0,
                lastUpdated: new Date()
            },
        });
        count++;
    }
    console.log(`Stocks upserted: ${count}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
