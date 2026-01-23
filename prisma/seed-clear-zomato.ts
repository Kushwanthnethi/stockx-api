
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Clearing ZOMATO.NS data to force refresh...');
    try {
        const deleted = await prisma.stock.deleteMany({
            where: {
                symbol: {
                    in: ['ZOMATO', 'ZOMATO.NS']
                }
            }
        });
        console.log(`Deleted ${deleted.count} records for Zomato.`);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
