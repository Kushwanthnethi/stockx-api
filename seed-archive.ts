
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Create a dummy past record
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7); // Last week

    // Need a stock first
    const stock = await prisma.stock.findFirst();
    if (!stock) {
        console.log('No stocks found');
        return;
    }

    await prisma.stockOfTheWeek.create({
        data: {
            weekStartDate: pastDate,
            stockSymbol: stock.symbol,
            convictionScore: 80,
            narrative: 'Historical test pick.',
            priceAtSelection: stock.currentPrice || 100,
            targetPrice: (stock.currentPrice || 100) * 1.1,
            stopLoss: (stock.currentPrice || 100) * 0.9,
            finalPrice: (stock.currentPrice || 100) * 1.05, // Closed with profit
            createdAt: pastDate
        }
    });

    console.log('Dummy archive record created.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
