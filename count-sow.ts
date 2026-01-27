
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.stockOfTheWeek.count();
    console.log(`Total Stock of the Week records: ${count}`);

    const all = await prisma.stockOfTheWeek.findMany({
        orderBy: { weekStartDate: 'desc' },
        select: { weekStartDate: true, stockSymbol: true }
    });
    console.log(all);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
