
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

async function expandPhase4() {
    console.log('🚀 Starting Stock Expansion Phase 4 (Niche Search)...');

    let currentCount = await prisma.stock.count();
    const target = 1000;
    if (currentCount >= target + 50) return; // Buffer

    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));

    const searchTerms = [
        // Industries - Niche
        'Spinning Mills', 'Weaving Mills', 'Textile Mills', 'Tea Estates', 'Coffee Estates',
        'Rubber Co', 'Paper Mills', 'Sugar Mills', 'Flour Mills', 'Solvent', 'Vanaspati',
        // Finance - Non-Banking
        'Fincap', 'Finlease', 'Finvest', 'Securities', 'Credit', 'Capital', 'Investments',
        'Holdings', 'Fiscal', 'Financial', 'Mercantile',
        // Chemicals/Pharma
        'Organics', 'Synthetics', 'Polymers', 'Plastics', 'Resins', 'Intermediates',
        'Pharmaceuticals', 'Drugs', 'Laboratories', 'Bio', 'Remedies', 'Life Sciences',
        // Infra/Realty
        'Buildcon', 'Infratech', 'Propmart', 'Shelters', 'Abodes', 'Estates', 'Nirman',
        'Developers', 'Projects', 'Constructions', 'Infrastructure', 'Housing',
        // Trade/Services
        'Exim', 'Exports', 'Imports', 'Traders', 'Trading', 'Agencies', 'Marketing',
        'Distributors', 'Retail', 'Logistics', 'Carriers', 'Movers',
        // Tech/Media
        'Soft', 'Infotech', 'Datamatics', 'Systems', 'Networks', 'Technologies',
        'Computers', 'Digital', 'Media', 'Entertainment', 'Communications',
        // Manufacturing
        'Forgings', 'Castings', 'Gears', 'Auto', 'Components', 'Engineering', 'Tools',
        'Electricals', 'Electronics', 'Appliances', 'Cables', 'Wires',
        // Generic/Indian
        'Shree', 'Sai', 'Jai', 'Om', 'Krishna', 'Ram', 'Raja', 'Rani', 'Maharaja',
        'Ganga', 'Yamuna', 'Surya', 'Chandra', 'Star', 'Moon', 'Sun', 'Galaxy',
        'City', 'Urban', 'Rural', 'State', 'National', 'Indian', 'Bharat', 'Hindustan'
    ];

    console.log(`🔍 Scanning ${searchTerms.length} niche terms...`);

    const candidateSymbols = new Set<string>();

    const BATCH_SIZE = 10;
    for (let i = 0; i < searchTerms.length; i += BATCH_SIZE) {
        if (currentCount >= target + 20) break;

        const batch = searchTerms.slice(i, i + BATCH_SIZE);
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
                        if (!existingSet.has(s)) candidateSymbols.add(s);
                    });
                }
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 100)); // nice delay
    }

    console.log(`Found ${candidateSymbols.size} unique candidates. Validating...`);
    let added = 0;

    // Validate & Insert
    const candidates = Array.from(candidateSymbols);
    const CHUNK = 20;
    for (let i = 0; i < candidates.length; i += CHUNK) {
        const chunk = candidates.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async (symbol) => {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice > 0) {
                    const vol = quote.regularMarketVolume || 0;
                    const avgVol3m = quote.averageDailyVolume3Month || 0;
                    if (vol > 10 || avgVol3m > 100) { // Very permissive for expansion
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
                        added++;
                        currentCount++;
                        process.stdout.write(`\r✅ Added: ${symbol}`);
                    }
                }
            } catch (e) { }
        }));
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🎉 Phase 4 DONE! Added ${added} new stocks. Final Count: ${currentCount}`);
}

expandPhase4()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
