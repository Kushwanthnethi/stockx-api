
import { PrismaClient } from '@prisma/client';
const fs = require('fs');
const path = require('path');

// Manually read the file to bypass TS module resolution hell
const dataPath = path.join(process.cwd(), 'src', 'stocks', 'expanded-market-data.ts');
const fileContent = fs.readFileSync(dataPath, 'utf-8');
// Extract the array part: export const EXPANDED_MARKET_DATA = [...];
const match = fileContent.match(/export const EXPANDED_MARKET_DATA = (\[[\s\S]*?\]);/);
let EXPANDED_MARKET_DATA: any[] = [];

if (match && match[1]) {
    try {
        EXPANDED_MARKET_DATA = JSON.parse(match[1]);
    } catch (e) {
        console.error("Failed to parse expanded market data JSON");
    }
} else {
    console.error("Could not find EXPANDED_MARKET_DATA in file");
}

const prisma = new PrismaClient();

async function main() {
    console.log(`🚀 Seeding ${EXPANDED_MARKET_DATA.length} Indian Stocks...`);
    let count = 0;

    // Process in chunks to be safe with DB connections
    const batchSize = 50;
    for (let i = 0; i < EXPANDED_MARKET_DATA.length; i += batchSize) {
        const batch = EXPANDED_MARKET_DATA.slice(i, i + batchSize);

        await Promise.all(batch.map((stock: any) =>
            prisma.stock.upsert({
                where: { symbol: stock.symbol },
                update: {
                    // Update name if changed
                    companyName: stock.companyName,
                },
                create: {
                    symbol: stock.symbol,
                    companyName: stock.companyName,
                    exchange: stock.symbol.includes('.BO') ? 'BSE' : 'NSE', // Simple inference
                    currentPrice: 0,
                    changePercent: 0,
                    marketCap: 0,
                    lastUpdated: new Date()
                },
            }).catch(e => console.error(`Failed ${stock.symbol}: ${e.message}`))
        ));

        count += batch.length;
        process.stdout.write(`\r✅ Processed: ${count}/${EXPANDED_MARKET_DATA.length}`);
    }

    console.log(`\n🎉 Seed Complete! Stocks upserted: ${count}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
