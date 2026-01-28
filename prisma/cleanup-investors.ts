import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning up Investor data...');
    // Delete all investor stocks first due to FK
    await prisma.investorStock.deleteMany({});
    console.log('Deleted InvestorStocks.');

    // Delete all investors
    await prisma.investor.deleteMany({});
    console.log('Deleted Investors.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
