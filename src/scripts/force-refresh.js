
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.stock.deleteMany({
        where: { symbol: 'RELIANCE.NS' }
    });
    console.log('Deleted RELIANCE.NS from DB to force refresh.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
