
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const records = await prisma.stockOfTheWeek.findMany({
        orderBy: { weekStartDate: 'desc' },
        include: { stock: true }
    });

    console.log('--- Stock of the Week Records ---');
    records.forEach(r => {
        console.log(`ID: ${r.id}`);
        console.log(`Week Start: ${r.weekStartDate.toISOString()}`);
        console.log(`Symbol: ${r.stockSymbol}`);
        console.log(`Narrative Length: ${r.narrative.length}`);
        console.log(`Narrative Preview: ${r.narrative.substring(0, 50)}...`);
        console.log('-----------------------------------');
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
