
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.stock.count();
    console.log(`Total stocks in database: ${count}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
