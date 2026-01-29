import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const allStocks = await prisma.stock.findMany({
        select: { symbol: true, marketCap: true },
        orderBy: { marketCap: 'desc' }
    });

    console.log(`Total stocks: ${allStocks.length}`);

    const nonNs = allStocks.filter(s => !s.symbol.endsWith('.NS'));
    console.log(`Non-.NS stocks count: ${nonNs.length}`);
    console.log('Sample non-.NS:', nonNs.slice(0, 5));

    const withCap = allStocks.filter(s => s.marketCap !== null && s.marketCap > 0);
    console.log(`Stocks with Market Cap: ${withCap.length}`);
    console.log('Top 10 by Market Cap:', withCap.slice(0, 10));

    const verdicts = await prisma.stockVerdict.findMany();
    console.log(`Total Verdicts: ${verdicts.length}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
