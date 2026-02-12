
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCount() {
    const count = await prisma.stock.count();
    console.log(`Current Stock Count: ${count}`);
}

checkCount()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
