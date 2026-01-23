import { PrismaClient } from '@prisma/client';
import { NIFTY_100 } from '../src/stocks/market-data';
import { seedInvestors } from './seed-investors';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // Clear existing data in correct order to avoid Foreign Key errors
    await prisma.interaction.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.postStock.deleteMany({});
    await prisma.investorStock.deleteMany({});
    await prisma.investor.deleteMany({});

    // Now safe to delete Posts
    await prisma.post.deleteMany({});

    // Cleanup specific unwanted stocks (e.g. AAPL)
    await prisma.stock.deleteMany({
        where: {
            symbol: {
                in: ['AAPL']
            }
        }
    });

    // Create Users (Keeping users for testing convenience, but no posts)
    const user1 = await prisma.user.upsert({
        where: { email: 'arjun@example.com' },
        update: {},
        create: {
            email: 'arjun@example.com',
            handle: 'arjun_invests',
            firstName: 'Arjun',
            lastName: 'Mehta',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arjun',
            bio: 'Long term investor. Bullish on India story.',
        },
    });

    const user2 = await prisma.user.upsert({
        where: { email: 'priya@example.com' },
        update: {},
        create: {
            email: 'priya@example.com',
            handle: 'priya_charts',
            firstName: 'Priya',
            lastName: 'Sharma',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
            bio: 'Technical Analyst. I trade what I see.',
        },
    });

    // Create Stocks
    // Seed Nifty 100 Stocks
    console.log('Seeding Nifty 100 stocks...');
    for (const stock of NIFTY_100) {
        await prisma.stock.upsert({
            where: { symbol: stock.symbol },
            update: {}, // Don't overwrite if exists
            create: {
                symbol: stock.symbol,
                companyName: stock.companyName,
                exchange: 'NSE',
                currentPrice: 0,
                changePercent: 0,
                marketCap: 0,
            },
        });
    }
    console.log('Stocks seeded.');

    // Seed Indices (NIFTY 50 & SENSEX) - Critical for Home Page Ticker
    console.log('Seeding Indices...');
    const indices = [
        { symbol: 'NIFTY 50', companyName: 'Nifty 50 Index', currentPrice: 24500, changePercent: 0.5, exchange: 'NSE' },
        { symbol: 'SENSEX', companyName: 'S&P BSE SENSEX', currentPrice: 80500, changePercent: 0.6, exchange: 'BSE' }
    ];
    for (const index of indices) {
        await prisma.stock.upsert({
            where: { symbol: index.symbol },
            update: {}, // Keep existing if there
            create: {
                symbol: index.symbol,
                companyName: index.companyName,
                exchange: index.exchange,
                currentPrice: index.currentPrice,
                changePercent: index.changePercent,
                marketCap: 0,
            },
        });
    }
    console.log('Indices seeded.');

    console.log('Stocks seeded.');

    // Seed Investors (Rich Profiles)
    console.log('Seeding Investors...');
    await seedInvestors(prisma);
    console.log('Investors seeded.');

    // Add Feed Posts so the timeline isn't empty
    console.log('Seeding posts...');

    await prisma.post.create({
        data: {
            userId: user1.id, // Arjun
            content: 'Nifty crossing 24k looks imminent! Banks are leading the rally. Bullish on $HDFCBANK. #Nifty50 #StockMarket',
        }
    });

    await prisma.post.create({
        data: {
            userId: user2.id, // Priya
            content: 'Technical breakout seen in $TATAMOTORS above 850 levels. Volume is strong! 🚀 #Breakout #Trading',
            imageUrl: 'https://images.unsplash.com/photo-1611974765270-ca1258634369?auto=format&fit=crop&q=80&w=600&h=400' // Generic chart image
        }
    });

    await prisma.post.create({
        data: {
            userId: user1.id, // Arjun
            content: 'Just analyzed the quarterly results for $INFY. Margins are stable but guidance is weak. Staying cautious.',
        }
    });

    console.log(`Seeding finished. Posts created.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
