
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandNuclear() {
    console.log('🚀 Starting Stock Expansion Phase Nuclear (Randomized Digits)...');

    // Many Indian stocks have numbers or are just weird Tickers
    // Also search for very common Indian last names or words

    const searchTerms = [
        // Numbers often appear in small caps or older listings
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
        // Common Indian Business Names/Terms
        'Venkateshwara', 'Balaji', 'Krishna', 'Rama', 'Lakshmi', 'Saraswati', 'Durga', 'Shiva', 'Ganesh',
        'Maruti', 'Hindustan', 'Bharat', 'Indian', 'National', 'Global', 'World', 'International',
        'Enterprises', 'Exports', 'Imports', 'Trading', 'Investments', 'Finance', 'Capital',
        'Cotton', 'Spinning', 'Textiles', 'Mills', 'Sugar', 'Paper', 'Plastics', 'Rubbers',
        'Chemicals', 'Pharma', 'Labs', 'Drugs', 'Health', 'Medicare',
        'Agro', 'Foods', 'Beverages', 'Tea', 'Coffee', 'Spices',
        'Steel', 'Iron', 'Metals', 'Alloys', 'Forgings', 'Castings',
        'Power', 'Energy', 'Solar', 'Wind', 'Green', 'Enviro',
        'Infra', 'Realty', 'Constructions', 'Projects', 'Developers', 'Housing',
        'Soft', 'Systems', 'Tech', 'Infotech', 'Data', 'Networks', 'Solutions'
    ];

    // Generate random 3 letter combos too
    for (let i = 0; i < 500; i++) {
        let term = '';
        for (let j = 0; j < 3; j++) term += String.fromCharCode(65 + Math.floor(Math.random() * 26));
        searchTerms.push(term);
    }

    // Shuffle
    for (let i = searchTerms.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [searchTerms[i], searchTerms[j]] = [searchTerms[j], searchTerms[i]];
    }

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));
    let currentCount = existingSet.size;

    console.log(`Starting with ${currentCount} stocks. Target: 1500.`);

    const BATCH_SIZE = 20;
    for (let i = 0; i < searchTerms.length; i += BATCH_SIZE) {
        if (currentCount >= 1520) break; // Buffer

        const batch = searchTerms.slice(i, i + BATCH_SIZE);
        const candidates = new Set<string>();

        await Promise.all(batch.map(async (term) => {
            try {
                // Search "term" in IN region
                const result = await yahooFinance.search(term, { quotesCount: 50, newsCount: 0, region: 'IN' });
                // @ts-ignore
                if (result.quotes) {
                    // @ts-ignore
                    result.quotes.forEach(q => {
                        if (!q.symbol) return;
                        let s = q.symbol;
                        if (!s.endsWith('.NS') && !s.endsWith('.BO')) return;
                        if (!existingSet.has(s)) candidates.add(s);
                    });
                }
            } catch (e) { }
        }));

        // Validate
        const candidatesArr = Array.from(candidates);
        // Process only a subset if too many to avoid rate limits? No, go fast.

        for (const symbol of candidatesArr) {
            if (currentCount >= 1520) break;
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice > 0) {
                    const vol = quote.regularMarketVolume || 0;
                    const avgVol = quote.averageDailyVolume3Month || 0;

                    if (vol > 0 || avgVol > 10) { // Very permissive
                        await prisma.stock.create({
                            data: {
                                symbol: symbol,
                                companyName: quote.displayName || quote.shortName || symbol,
                                exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE',
                                currentPrice: quote.regularMarketPrice,
                                changePercent: quote.regularMarketChangePercent || 0,
                                marketCap: quote.marketCap || 0,
                                lastUpdated: new Date()
                            }
                        });
                        currentCount++;
                        existingSet.add(symbol);
                        process.stdout.write(`\r✅ Added: ${symbol} (${currentCount})`);
                    }
                }
            } catch (e) { }
        }
        process.stdout.write(`\r✅ Processed batch ${i}/${searchTerms.length}. Count: ${currentCount}          `);
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`\n🎉 Nuclear Phase DONE! Final Count: ${currentCount}`);
}

expandNuclear()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
