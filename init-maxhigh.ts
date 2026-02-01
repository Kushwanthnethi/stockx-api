
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Initializing maxHigh for existing records...");
        const records = await prisma.stockOfTheWeek.findMany();

        for (const r of records) {
            if (r.maxHigh === null) {
                await prisma.stockOfTheWeek.update({
                    where: { id: r.id },
                    data: { maxHigh: r.priceAtSelection }
                });
                console.log(`Initialized ${r.stockSymbol} with ${r.priceAtSelection}`);
            } else {
                console.log(`Skipping ${r.stockSymbol}, already has maxHigh: ${r.maxHigh}`);
            }
        }
        console.log("Initialization complete.");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
