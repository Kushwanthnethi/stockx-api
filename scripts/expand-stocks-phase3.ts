
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandStocksPhase3() {
    console.log('🚀 Starting Stock Expansion Phase 3 (Alphabetical Deep Dive)...');

    let currentCount = await prisma.stock.count();
    console.log(`📊 Start Count: ${currentCount}`);

    if (currentCount >= 1000) {
        console.log("✅ Already reached 1000!");
        return;
    }

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));

    const candidateSymbols = new Set<string>();

    // 2-letter combinations: AA to ZZ
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    // We need about 120 more. 
    // Detailed search on "A" to "Z" (single letter) usually gives top market cap.
    // "AA", "AB"... gives deeper.

    for (const c1 of alphabet) {
        // Check count periodically
        if (currentCount >= 1020) break;

        const batchTerms = [];
        for (const c2 of alphabet) {
            batchTerms.push(`${c1}${c2}`);
        }

        console.log(`🔍 Scanning prefix ${c1}...`);

        const batchCandidates = new Set<string>();

        // Concurrently search for this letter's pairs
        const BATCH_SIZE = 5;
        for (let i = 0; i < batchTerms.length; i += BATCH_SIZE) {
            const subBatch = batchTerms.slice(i, i + BATCH_SIZE);
            await Promise.all(subBatch.map(async (term) => {
                try {
                    // Add "India" to context to prefer Indian stocks or use region: 'IN'
                    const result = await yahooFinance.search(term, { quotesCount: 50, newsCount: 0, region: 'IN' });
                    // @ts-ignore
                    if (result.quotes) {
                        // @ts-ignore
                        result.quotes.forEach(q => {
                            if (!q.symbol) return;

                            let clean = q.symbol;
                            if (!clean.endsWith('.NS') && !clean.endsWith('.BO')) return;

                            if (!existingSet.has(clean)) {
                                batchCandidates.add(clean);
                            }
                        });
                    }
                } catch (e) { }
            }));
            await new Promise(r => setTimeout(r, 100));
        }

        if (batchCandidates.size === 0) continue;

        // Validate & Insert immediately for this chunk
        console.log(`   > Found ${batchCandidates.size} candidates for '${c1}'. Validating...`);
        let addedForChar = 0;

        for (const symbol of Array.from(batchCandidates)) {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice > 0) {
                    const volume = quote.regularMarketVolume || 0;
                    if (volume > 20) { // Very loose logic for Phase 3 to ensure we get numbers
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
                        addedForChar++;
                        existingSet.add(symbol); // Add to set so we don't try again
                    }
                }
            } catch (e) { }
        }

        currentCount += addedForChar;
        console.log(`   > Added ${addedForChar} new stocks. Total DB: ${currentCount}`);
    }

    console.log(`\n🎉 Phase 3 DONE! Final DB Count: ${currentCount}`);
}

expandStocksPhase3()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
