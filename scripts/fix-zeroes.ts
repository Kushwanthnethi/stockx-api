import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning up Zero Prices ---');

    const zeroStocks = await prisma.stock.findMany({
        where: {
            currentPrice: 0
        }
    });

    console.log(`Found ${zeroStocks.length} stocks with zero price.`);

    if (zeroStocks.length > 0) {
        const result = await prisma.stock.updateMany({
            where: {
                currentPrice: 0
            },
            data: {
                currentPrice: null,
                lastUpdated: new Date(0) // Set to epoch to force immediate re-fetch
            }
        });
        console.log(`Updated ${result.count} stocks to NULL price.`);
    }

    console.log('--- Done ---');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
