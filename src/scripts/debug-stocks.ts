import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Connecting to DB...');
  const count = await prisma.stock.count();
  console.log(`Total Count: ${count}`);

  const stocks = await prisma.stock.findMany({
    select: { symbol: true, companyName: true },
    orderBy: { symbol: 'asc' },
    take: 20,
  });

  console.log('--- First 20 Stocks ---');
  stocks.forEach((s) => console.log(`${s.symbol}: ${s.companyName}`));

  const lastStocks = await prisma.stock.findMany({
    select: { symbol: true },
    orderBy: { symbol: 'desc' },
    take: 20,
  });
  console.log('--- Last 20 Stocks ---');
  lastStocks.forEach((s) => console.log(s.symbol));

  // Check specific microcap
  const micro = await prisma.stock.findUnique({
    where: { symbol: 'EASEMYTRIP.NS' },
  });
  console.log('--- EASEMYTRIP.NS Check ---');
  console.log(micro ? 'FOUND' : 'NOT FOUND');

  // Check specific Nifty
  const nifty = await prisma.stock.findUnique({
    where: { symbol: 'RELIANCE.NS' },
  });
  console.log('--- RELIANCE.NS Check ---');
  console.log(nifty ? 'FOUND' : 'NOT FOUND');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
