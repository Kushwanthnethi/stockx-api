
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandPhase5() {
    console.log('🚀 Starting Stock Expansion Phase 5 (Current Target: 1500)...');

    let currentCount = await prisma.stock.count();
    console.log(`📊 Start Count: ${currentCount}`);

    if (currentCount >= 1500) {
        console.log("✅ Already reached 1500!");
        return;
    }

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // Strategy: 
    // 1. "Deep" alphabetical scan: 3-letter prefixes for common starting letters? 
    //    Actually 2-letter (AA..ZZ) is 26*26 = 676 queries. 
    //    Phase 3 likely only scratched the surface or stopped early.
    //    Let's run 2-letter scan again but FULLY.

    // We can randomize order to find "new" pockets if we stopped sequentially before
    const prefixes: string[] = [];
    for (const c1 of alphabet) {
        for (const c2 of alphabet) {
            prefixes.push(`${c1}${c2}`);
        }
    }

    // Shuffle to get better distribution if we stop early
    for (let i = prefixes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [prefixes[i], prefixes[j]] = [prefixes[j], prefixes[i]];
    }

    console.log(`🔍 Scanning ${prefixes.length} prefixes (Shuffled)...`);

    const BATCH_SIZE = 10;
    for (let i = 0; i < prefixes.length; i += BATCH_SIZE) {
        if (currentCount >= 1500) break;

        const batch = prefixes.slice(i, i + BATCH_SIZE);
        const candidates = new Set<string>();

        await Promise.all(batch.map(async (term) => {
            try {
                // Search "AB India", "AC India" to bias towards Indian results
                const result = await yahooFinance.search(term + " India", { quotesCount: 50, newsCount: 0, region: 'IN' });
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

        // Validate immediate batch
        if (candidates.size > 0) {
            const candidatesArr = Array.from(candidates);
            for (const symbol of candidatesArr) {
                if (currentCount >= 1500) break;
                try {
                    // Quick validation
                    // Optimistic check: if it showed up in "India" search and has extension, try fetching quote
                    const quote = await yahooFinance.quote(symbol);
                    if (quote && quote.regularMarketPrice > 0) {
                        const vol = quote.regularMarketVolume || 0;
                        const avgVol = quote.averageDailyVolume3Month || 0;
                        // Looser checks for Phase 2 to get microcaps
                        if (vol > 0 || avgVol > 50) {
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
                            process.stdout.write(`\r✅ Added: ${symbol} (${currentCount}/1500)`);
                        }
                    }
                } catch (e) { }
            }
        }

        // Progress
        process.stdout.write(`\r✅ Scanned: ${Math.min(i + BATCH_SIZE, prefixes.length)} prefixes... DB: ${currentCount}          `);
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🎉 Phase 5 DONE! Final Count: ${currentCount}`);
}

expandPhase5()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
