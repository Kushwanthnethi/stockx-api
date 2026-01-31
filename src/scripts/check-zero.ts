import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkZeroPrice() {
  const stocks = await prisma.stock.findMany({
    where: {
      OR: [{ currentPrice: 0 }, { currentPrice: null }],
    },
    select: { symbol: true, currentPrice: true, marketCap: true },
  });

  if (stocks.length === 0) {
    console.log('No stocks with 0 price found.');
  } else {
    console.log(`Found ${stocks.length} stocks with 0 price:`);
    stocks
      .slice(0, 20)
      .forEach((s) =>
        console.log(`${s.symbol}: Price=${s.currentPrice}, MC=${s.marketCap}`),
      );
  }
}

checkZeroPrice();
