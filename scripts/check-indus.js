const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        const stock = await prisma.stockOfTheWeek.findFirst({
            where: { stockSymbol: 'INDUSTOWER.NS' },
            orderBy: { weekStartDate: 'desc' }
        });

        if (stock) {
            console.log(`Stock: ${stock.stockSymbol}`);
            console.log(`Target Price: ${stock.targetPrice}`);
            console.log(`Max High: ${stock.maxHigh}`);
            console.log(`Entry Price: ${stock.priceAtSelection}`);

            const target = stock.targetPrice;
            const high = stock.maxHigh || 0;
            const percentage = (high / target) * 100;

            console.log(`Current High is ${percentage.toFixed(2)}% of Target`);
            console.log(`Required for stamp (98%): ${(target * 0.98).toFixed(2)}`);

            const percentNeeded = ((target * 0.98 - high) / target) * 100;
            if (percentNeeded > 0) {
                console.log(`Needs ${percentNeeded.toFixed(2)}% more to reach stamp threshold.`);
            } else {
                console.log(`Stamp should be VISIBLE.`);
            }

        } else {
            console.log('Indus Towers not found in StockOfTheWeek history');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
