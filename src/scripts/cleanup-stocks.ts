
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
    console.log('Starting stock cleanup...');

    try {
        // 1. Identify candidates
        // We look for stocks where price is 0/null AND (marketCap is 0/null OR missing)
        // Actually, based on screenshot, some might have 0 price but valid other data? No, 0 price usually means bad data.
        // We'll be strict: Price <= 0 OR Price IS NULL. AND MarketCap <= 0 OR MarketCap IS NULL.

        const candidates = await prisma.stock.findMany({
            where: {
                OR: [
                    { currentPrice: { equals: 0 } },
                    { currentPrice: null },
                ],
                AND: {
                    OR: [
                        { marketCap: { equals: 0 } },
                        { marketCap: null }
                    ]
                }
            },
            select: { symbol: true, companyName: true }
        });

        console.log(`Found ${candidates.length} candidates for deletion.`);

        if (candidates.length === 0) {
            console.log('No cleanup needed.');
            return;
        }

        // Log the first few to verify
        console.log('Sample candidates:', candidates.slice(0, 5));

        // 2. Delete related records first to avoid foreign key constraints (P2003)
        // We need to delete from StockVerdict, Watchlist, PostStock, StockOfTheWeek, InvestorStock
        const symbols = candidates.map(c => c.symbol);

        console.log('Deleting related records...');

        const verdicts = await prisma.stockVerdict.deleteMany({
            where: { stockSymbol: { in: symbols } }
        });
        console.log(`Deleted ${verdicts.count} related verdicts.`);

        const watchlist = await prisma.watchlist.deleteMany({
            where: { stockSymbol: { in: symbols } }
        });
        console.log(`Deleted ${watchlist.count} watchlist entries.`);

        const postStocks = await prisma.postStock.deleteMany({
            where: { stockSymbol: { in: symbols } }
        });
        console.log(`Deleted ${postStocks.count} post references.`);

        const sotw = await prisma.stockOfTheWeek.deleteMany({
            where: { stockSymbol: { in: symbols } }
        });
        console.log(`Deleted ${sotw.count} SOTW entries.`);

        const investorStocks = await prisma.investorStock.deleteMany({
            where: { stockSymbol: { in: symbols } }
        });
        console.log(`Deleted ${investorStocks.count} investor holdings.`);

        // 3. Delete the stocks
        const result = await prisma.stock.deleteMany({
            where: {
                symbol: { in: symbols }
            }
        });

        console.log(`Successfully deleted ${result.count} stocks.`);

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
