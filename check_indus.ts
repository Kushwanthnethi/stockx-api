
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDB() {
    try {
        const stock = await prisma.stock.findUnique({
            where: { symbol: 'INDUSTOWER.NS' }
        });

        if (stock) {
            console.log("SUCCESS: Found INDUSTOWER.NS in DB!");
            console.log(stock);
        } else {
            console.log("FAILURE: INDUSTOWER.NS not found in DB.");
        }
    } catch (error) {
        console.error("DB Error", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDB();
