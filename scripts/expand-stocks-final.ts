
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandStocksFinal() {
    console.log('🚀 Starting Stock Expansion Final (Names & Places)...');

    let currentCount = await prisma.stock.count();
    console.log(`📊 Start Count: ${currentCount}`);

    if (currentCount >= 1500) {
        console.log("✅ Already reached 1500!");
        return;
    }

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));

    const searchTerms = [
        // Common Indian Names (Many companies named after people)
        'Ram', 'Krishna', 'Shiva', 'Ganesh', 'Lakshmi', 'Saraswati', 'Durga', 'Hanuman',
        'Raja', 'Rani', 'Kumar', 'Kumari', 'Devi', 'Prasad', 'Singh', 'Sharma', 'Gupta',
        'Patel', 'Shah', 'Jain', 'Agarwal', 'Mehta', 'Reddy', 'Rao', 'Nair', 'Menon',
        'Rohan', 'Rahul', 'Amit', 'Sumit', 'Raj', 'Ravi', 'Vijay', 'Anil', 'Sunil',
        'Sanjay', 'Manoj', 'Suresh', 'Ramesh', 'Dinesh', 'Mahesh', 'Vishal', 'Vikas',
        'Aditi', 'Priya', 'Neha', 'Pooja', 'Sneha', 'Anjali', 'Meera', 'Divya', 'Nisha',
        // Cities & States
        'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata',
        'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane',
        'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra',
        'Maharashtra', 'Gujarat', 'Karnataka', 'Tamil', 'Bengal', 'Punjab', 'Rajasthan',
        'Kerala', 'Andhra', 'Telangana', 'Odisha', 'Bihar', 'Uttar', 'Madhya',
        // Commodities/Business
        'Gold', 'Silver', 'Diamond', 'Jewellery', 'Exports', 'Imports', 'Traders',
        'Logistics', 'Carriers', 'Movers', 'Packers', 'Consultants', 'Advisors',
        'Motors', 'Automotives', 'Spares', 'Parts', 'Tools', 'Machines', 'Works',
        'Chemicals', 'Pharma', 'Labs', 'Drugs', 'Health', 'Care', 'Life', 'Bio'
    ];

    // Shuffle
    for (let i = searchTerms.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [searchTerms[i], searchTerms[j]] = [searchTerms[j], searchTerms[i]];
    }

    console.log(`🔍 Scanning ${searchTerms.length} terms...`);

    const BATCH_SIZE = 15;
    for (let i = 0; i < searchTerms.length; i += BATCH_SIZE) {
        if (currentCount >= 1515) break;

        const batch = searchTerms.slice(i, i + BATCH_SIZE);
        const candidates = new Set<string>();

        await Promise.all(batch.map(async (term) => {
            try {
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

        const uniqueCandidates = Array.from(candidates);
        for (const symbol of uniqueCandidates) {
            if (currentCount >= 1515) break;
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice > 0) {
                    const vol = quote.regularMarketVolume || 0;
                    if (vol > 0) {
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
        process.stdout.write(`\r✅ Processed batch ${i}/${searchTerms.length}. DB: ${currentCount}          `);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🎉 Final Phase DONE! Count: ${currentCount}`);
}

expandStocksFinal()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
