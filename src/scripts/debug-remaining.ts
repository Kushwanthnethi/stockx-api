import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debug() {
  const symbols = ['GSK.NS', 'GSKPHARMA.NS', 'GTPL.NS'];
  const stocks = await prisma.stock.findMany({
    where: { symbol: { in: symbols } },
  });
  console.log('Stock Details:', stocks);
}

debug();
