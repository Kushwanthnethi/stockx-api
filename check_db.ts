
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDB() {
    try {
        const indus = await prisma.stock.findFirst({
            where: {
                OR: [
                    { symbol: { contains: 'INDUS', mode: 'insensitive' } },
                    { companyName: { contains: 'INDUS', mode: 'insensitive' } }
                ]
            }
        });

        if (indus) {
            console.log("FOUND IN DB:", indus.symbol, indus.companyName);
        } else {
            console.log("NOT FOUND IN DB");
        }

        // Also check total count
        const count = await prisma.stock.count();
        console.log(`Total stocks in DB: ${count}`);

    } catch (error) {
        console.error("DB Error", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkDB();
