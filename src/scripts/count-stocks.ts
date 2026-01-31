import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.stock.count();
  console.log(`\n-----------------------------------`);
  console.log(`✅ TOTAL STOCKS IN DATABASE: ${count}`);
  console.log(`-----------------------------------\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
