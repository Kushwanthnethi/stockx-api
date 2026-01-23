
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDB() {
    try {
        const stock = await prisma.stock.findFirst({
            where: { symbol: { contains: 'RELIANCE', mode: 'insensitive' } }
        });

        if (stock) {
            console.log("SUCCESS: Found RELIANCE in DB!");
            console.log(stock.symbol);
        } else {
            console.log("FAILURE: RELIANCE not found in DB.");
        }
    } catch (error) {
        console.error("DB Error", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDB();
