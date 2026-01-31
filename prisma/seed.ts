
import { PrismaClient } from '@prisma/client';
import yahooFinance from 'yahoo-finance2';
import * as bcrypt from 'bcrypt';
import { NIFTY_500 } from '../src/stocks/market-data';
import { ADDITIONAL_STOCKS } from '../src/stocks/massive-market-data';
import { DISCOVERED_STOCKS as MICRO_STOCKS } from '../src/stocks/discovered-stocks';
import { seedInvestors } from './seed-investors';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // Create Admin User
    console.log('Seeding Admin User...');
    const adminEmail = 'admin@stockx.com';
    const adminPassword = 'Kush@admins';
    const adminHashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminUser = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            passwordHash: adminHashedPassword,
            role: 'ADMIN',
        },
        create: {
            email: adminEmail,
            handle: 'admin',
            firstName: 'System',
            lastName: 'Admin',
            passwordHash: adminHashedPassword,
            role: 'ADMIN',
            bio: 'System Administrator',
            avatarUrl: 'https://ui-avatars.com/api/?name=System+Admin&background=0D8ABC&color=fff'
        },
    });
    console.log(`Admin user seeded: ${adminUser.email}`);

    // Create Users
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
    const allStocks = [...NIFTY_500, ...ADDITIONAL_STOCKS, ...MICRO_STOCKS];
    // Remove duplicates based on symbol
    const uniqueStocks = Array.from(new Map(allStocks.map(item => [item.symbol, item])).values());

    console.log(`Seeding expanded stock list (Total: ${uniqueStocks.length})...`);
    console.log('NOTE: Performing LIVE VALIDATION with Yahoo Finance to prevent dead stocks.');

    const BATCH_SIZE = 50;
    let processedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < uniqueStocks.length; i += BATCH_SIZE) {
        const batch = uniqueStocks.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(uniqueStocks.length / BATCH_SIZE);

        console.log(`[Phase ${batchNumber}/${totalBatches}] Validating stocks ${i + 1} to ${Math.min(i + BATCH_SIZE, uniqueStocks.length)}...`);

        // 1. Get Symbols for Batch
        const symbols = batch.map(s => s.symbol);

        try {
            // 2. Fetch Live Data API
            const quotes = await yahooFinance.quote(symbols, { validateResult: false });

            // Map results for easy lookup
            const quoteMap = new Map(quotes.map(q => [q.symbol, q]));

            for (const stock of batch) {
                const quote = quoteMap.get(stock.symbol) as any;

                // 3. VALIDATION LOGIC
                const isValid = quote &&
                    quote.regularMarketPrice &&
                    quote.regularMarketPrice > 0 &&
                    (quote.marketCap || 0) > 0;

                if (isValid) {
                    await prisma.stock.upsert({
                        where: { symbol: stock.symbol },
                        update: {},
                        create: {
                            symbol: stock.symbol,
                            companyName: stock.companyName,
                            exchange: 'NSE',
                            currentPrice: quote?.regularMarketPrice || 0,
                            changePercent: quote?.regularMarketChangePercent || 0,
                            marketCap: quote?.marketCap || 0,
                            peRatio: quote?.trailingPE || null,
                        },
                    });
                } else {
                    skippedCount++;
                }
            }
        } catch (error) {
            console.error(`Batch failed for symbols: ${symbols[0]}...`, error);
        }

        processedCount += batch.length;
        // 2 second delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`Seeding Complete. Processed: ${processedCount}. Skipped (Dead): ${skippedCount}.`);

    // Seed Indices (NIFTY 50 & SENSEX)
    console.log('Seeding Indices...');
    const indices = [
        { symbol: 'NIFTY 50', companyName: 'Nifty 50 Index', currentPrice: 24500, changePercent: 0.5, exchange: 'NSE' },
        { symbol: 'SENSEX', companyName: 'S&P BSE SENSEX', currentPrice: 80500, changePercent: 0.6, exchange: 'BSE' }
    ];
    for (const index of indices) {
        await prisma.stock.upsert({
            where: { symbol: index.symbol },
            update: {},
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

    // Seed Investors
    console.log('Seeding Investors...');
    await seedInvestors(prisma);
    console.log('Investors seeded.');

    // Seed Posts
    const postCount = await prisma.post.count();
    if (postCount === 0) {
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
                imageUrl: 'https://images.unsplash.com/photo-1611974765270-ca1258634369?auto=format&fit=crop&q=80&w=600&h=400'
            }
        });
        await prisma.post.create({
            data: {
                userId: user1.id, // Arjun
                content: 'Just analyzed the quarterly results for $INFY. Margins are stable but guidance is weak. Staying cautious.',
            }
        });
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
