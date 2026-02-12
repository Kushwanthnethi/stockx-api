
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandScreeners() {
    console.log('🚀 Starting Stock Expansion via Screeners...');

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));
    console.log(`📊 Current DB has ${existingSet.size} stocks.`);

    const screenerIds = [
        'day_gainers', 'day_losers', 'most_actives',
        'undervalued_growth_stocks', 'growth_technology_stocks',
        'undervalued_large_caps', 'aggressive_small_caps',
        'portfolio_anchors', 'solid_large_caps', 'small_cap_gainers',
        'top_mutual_fund_holders', 'most_shorted_stocks'
    ];

    let addedCount = 0;

    for (const id of screenerIds) {
        try {
            console.log(`📡 Scraping Screener: ${id}...`);
            const res = await yahooFinance.screener({ scrIds: id, count: 100, region: 'IN', lang: 'en-IN' }, { validateResult: false });

            // @ts-ignore
            if (res.quotes) {
                // @ts-ignore
                const quotes = res.quotes;
                console.log(`   > Found ${quotes.length} items.`);

                for (const q of quotes) {
                    if (!q.symbol) continue;
                    let symbol = q.symbol;

                    // Normalize
                    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) {
                        if (q.exchange === 'NSE' || q.exchange === 'NSI') symbol += '.NS';
                        else if (q.exchange === 'BSE') symbol += '.BO';
                        else continue;
                    }

                    if (existingSet.has(symbol)) continue;

                    // Validate & Insert
                    // @ts-ignore
                    if (q.regularMarketPrice > 0) {
                        // @ts-ignore
                        const vol = q.regularMarketVolume || 0;
                        // @ts-ignore
                        const avgVol = q.averageDailyVolume3Month || 0;

                        if (vol > 0 || avgVol > 50) {
                            try {
                                await prisma.stock.create({
                                    data: {
                                        symbol: symbol,
                                        // @ts-ignore
                                        companyName: q.displayName || q.shortName || symbol,
                                        exchange: symbol.endsWith('.BO') ? 'BSE' : 'NSE',
                                        // @ts-ignore
                                        currentPrice: q.regularMarketPrice,
                                        // @ts-ignore
                                        changePercent: q.regularMarketChangePercent || 0,
                                        // @ts-ignore
                                        marketCap: q.marketCap || 0,
                                        lastUpdated: new Date()
                                    }
                                });
                                addedCount++;
                                existingSet.add(symbol);
                                process.stdout.write(`\r✅ Added: ${symbol}`);
                            } catch (e) { }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Screener ${id} failed:`, e instanceof Error ? e.message : e);
        }
        process.stdout.write('\n');
    }

    console.log(`\n🎉 Screeners DONE! Added ${addedCount} new stocks.`);
}

expandScreeners()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
