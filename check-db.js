
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const stockCount = await prisma.stock.count();
    const watchlistCount = await prisma.watchlist.count();
    console.log(`Stocks: ${stockCount}`);
    console.log(`Watchlist: ${watchlistCount}`);
    const stocks = await prisma.stock.findMany({ take: 5 });
    console.log('Sample Stocks:', JSON.stringify(stocks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
