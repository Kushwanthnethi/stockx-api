import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding stock prices...');

    const updates = [
        {
            symbol: 'TATAMOTORS',
            currentPrice: 945.60,
            changePercent: 1.2,
            marketCap: 3450000000000,
            peRatio: 18.5,
            pbRatio: 4.2,
            high52Week: 1020.00,
            low52Week: 600.00
        },
        {
            symbol: 'RELIANCE',
            currentPrice: 2850.30,
            changePercent: -0.5,
            marketCap: 19500000000000,
            peRatio: 28.1,
            pbRatio: 2.1,
            high52Week: 3000.00,
            low52Week: 2200.00
        },
        {
            symbol: 'TCS',
            currentPrice: 3890.15,
            changePercent: 0.8,
            marketCap: 14000000000000,
            peRatio: 29.5,
            pbRatio: 12.3,
            high52Week: 4100.00,
            low52Week: 3200.00
        },
        {
            symbol: 'INFY',
            currentPrice: 1650.45,
            changePercent: 0.2,
            marketCap: 6800000000000,
            peRatio: 24.5,
            pbRatio: 8.1,
            high52Week: 1750.00,
            low52Week: 1300.00
        },
        {
            symbol: 'HDFCBANK',
            currentPrice: 1540.00,
            changePercent: -1.0,
            marketCap: 11000000000000,
            peRatio: 19.8,
            pbRatio: 3.1,
            high52Week: 1700.00,
            low52Week: 1400.00
        }
    ];

    for (const u of updates) {
        await prisma.stock.update({
            where: { symbol: u.symbol },
            data: {
                currentPrice: u.currentPrice,
                changePercent: u.changePercent,
                marketCap: u.marketCap,
                peRatio: u.peRatio,
                pbRatio: u.pbRatio,
                high52Week: u.high52Week,
                low52Week: u.low52Week,
                lastUpdated: new Date()
            }
        });
        console.log(`Updated ${u.symbol}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
