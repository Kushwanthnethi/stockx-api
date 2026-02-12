
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandStocksPhase2() {
    console.log('🚀 Starting Stock Expansion Phase 2 (Generic Sweep)...');

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));
    console.log(`📊 Current DB has ${existingSet.size} stocks.`);

    const candidateSymbols = new Set<string>();
    const addCandidate = (symbol: string) => {
        let cleanSymbol = symbol.trim();
        if (!cleanSymbol.endsWith('.NS') && !cleanSymbol.endsWith('.BO')) return;
        if (!existingSet.has(cleanSymbol)) candidateSymbols.add(cleanSymbol);
    };

    // Generic suffixes/terms that appear in many company names
    const searchTerms = [
        'Enterprises', 'Solutions', 'Technologies', 'Global', 'Systems', 'Services',
        'Construct', 'Projects', 'Developers', 'Realty', 'Power', 'Energy', 'Green',
        'Solar', 'Wind', 'Infra', 'Build', 'Estates', 'Properties', 'Housing',
        'Pharma', 'Labs', 'Drugs', 'Health', 'Care', 'Life', 'Bio',
        'Foods', 'Agro', 'Farms', 'Sugar', 'Tea', 'Coffee', 'Spices',
        'Spinning', 'Weaving', 'Mills', 'Textiles', 'Garments', 'Apparel', 'Fashion',
        'Chemicals', 'Petro', 'Plast', 'Polymers', 'Rubbers', 'Fertilizers',
        'Finance', 'Capital', 'Invest', 'Holdings', 'Securities', 'Fincorp', 'Leasing',
        'Auto', 'Motors', 'Components', 'Forgings', 'Castings', 'Gears',
        'Electricals', 'Electronics', 'Digital', 'Soft', 'Tech', 'Data', 'Networks',
        'India Ltd', 'India Limited', 'Inds Ltd', 'Co Ltd'
    ];

    console.log(`🔍 Searching ${searchTerms.length} generic terms...`);

    // High concurrency to be fast
    const batchSize = 10;
    for (let i = 0; i < searchTerms.length; i += batchSize) {
        const batch = searchTerms.slice(i, i + batchSize);
        await Promise.all(batch.map(async (term) => {
            try {
                await new Promise(r => setTimeout(r, Math.random() * 500)); // Jitter
                const result = await yahooFinance.search(term, { quotesCount: 50, newsCount: 0, region: 'IN' });
                // @ts-ignore
                if (result.quotes) {
                    // @ts-ignore
                    result.quotes.forEach(q => {
                        if (q.quoteType !== 'EQUITY' || !q.symbol) return;
                        addCandidate(q.symbol);
                    });
                }
            } catch (e) { }
        }));
        process.stdout.write(`\r✅ Scanned terms: ${Math.min(i + batchSize, searchTerms.length)}/${searchTerms.length}`);
    }

    const candidatesArray = Array.from(candidateSymbols);
    console.log(`\n🧐 Found ${candidatesArray.length} NEW potential candidates.`);

    if (candidatesArray.length === 0) return;

    // Validate & Insert
    console.log('🕵️ Validating candidates...');
    let addedCount = 0;

    // Process ALL
    const processBatchSize = 25;
    for (let i = 0; i < candidatesArray.length; i += processBatchSize) {
        const batch = candidatesArray.slice(i, i + processBatchSize);

        await Promise.all(batch.map(async (symbol) => {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice && quote.regularMarketPrice > 0) {
                    const volume = quote.regularMarketVolume || 0;
                    const avgVolume = quote.averageDailyVolume3Month || 0;

                    if (volume > 50 || avgVolume > 500) { // Slightly looser for microcaps in Phase 2
                        try {
                            await prisma.stock.create({
                                data: {
                                    symbol: symbol,
                                    companyName: quote.displayName || quote.shortName || quote.longName || symbol,
                                    exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE',
                                    currentPrice: quote.regularMarketPrice,
                                    changePercent: quote.regularMarketChangePercent || 0,
                                    marketCap: quote.marketCap || 0,
                                    lastUpdated: new Date()
                                }
                            });
                            addedCount++;
                        } catch (e) { }
                    }
                }
            } catch (e) { }
        }));

        process.stdout.write(`\r✅ Processed: ${Math.min(i + processBatchSize, candidatesArray.length)}/${candidatesArray.length} | Added: ${addedCount}`);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🎉 Phase 2 DONE! Added ${addedCount} new stocks.`);
}

expandStocksPhase2()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
