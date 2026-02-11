
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const userCount = await prisma.user.count();
        const stockCount = await prisma.stock.count();
        const postCount = await prisma.post.count();
        const financialCount = await prisma.financialResult.count();
        console.log(`Users: ${userCount}`);
        console.log(`Stocks: ${stockCount}`);
        console.log(`Posts: ${postCount}`);
        console.log(`FinancialResults: ${financialCount}`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
