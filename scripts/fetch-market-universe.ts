
import fs from 'fs';
import path from 'path';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();

async function fetchUniverse() {
    console.log('🚀 Starting Market Universe Expansion...');
    const uniqueStocks = new Map<string, string>(); // Symbol -> Name

    // 1. Fetch from diverse Screeners
    const screeners = [
        'day_gainers', 'day_losers', 'most_actives',
        'undervalued_growth_stocks', 'growth_technology_stocks',
        'undervalued_large_caps', 'aggressive_small_caps',
        'portfolio_anchors', 'solid_large_caps'
    ];

    for (const id of screeners) {
        try {
            console.log(`📡 Scraping Screener: ${id}...`);
            const res = await yahooFinance.screener({ scrIds: id, count: 100, region: 'IN', lang: 'en-IN' }, { validateResult: false }) as any;
            console.log(`   > Screener ${id}: Found ${res?.quotes?.length || 0} items.`);
            if (res.quotes) {
                res.quotes.forEach((q: any) => {
                    let symbol = q.symbol;
                    if (!symbol) return;

                    // Normalize Indian symbols
                    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) {
                        if (q.exchange === 'NSI' || q.exchange === 'NSE') {
                            symbol += '.NS';
                        } else if (q.exchange === 'BSE') {
                            symbol += '.BO';
                        } else {
                            // If we scraped 'IN' region but no suffix/exchange match, 
                            // we might assume NS or log it.
                            // For now, let's log one to see.
                            // console.log(`Skipping unknown exchange: ${q.symbol} (${q.exchange})`);
                            return;
                        }
                    }

                    uniqueStocks.set(symbol, q.shortName || q.longName || symbol);
                });
                console.log(`   > Valid stocks retained: ${uniqueStocks.size}`);
            }
        } catch (e: any) {
            console.warn(`⚠️  Screener ${id} failed: ${e.message}`);
        }
    }

    // 2. Fetch specific NIFTY Indices components (manual fallback list to ensure quality)
    // We can add a few hardcoded known lists if screener misses them
    // For now, let's rely on screener + maybe query "NIFTY"

    // 3. Search Queries for major groups
    const queries = [
        'Nifty', 'Sensex', 'Bank',
        'Tata', 'Adani', 'Reliance', 'Infosys', 'Birla', 'Mahindra',
        'HDFC', 'ICICI', 'Axis', 'Kotak', 'Bajaj', 'Maruti', 'Hero', 'TVS',
        'Sun Pharma', 'Cipla', 'Dr Reddy', 'L&T', 'Wipro', 'HCL', 'Tech Mahindra',
        'ITC', 'HUL', 'Nestle', 'Britannia', 'Asian Paints', 'Titan',
        'Jindal', 'Vedanta', 'Coal India', 'NTPC', 'Power Grid', 'ONGC', 'IOC', 'BPCL',
        'Zomato', 'Paytm', 'Nykaa', 'PolicyBazaar', 'Delhivery',
        'Steel India', 'Cement India', 'Sugar India', 'Paper India', 'Textile India',
        'Chemical India', 'Pharma India', 'Bank India', 'Finance India', 'Power India'
    ];
    for (const q of queries) {
        try {
            console.log(`🔍 Searching: ${q}...`);
            const res = await yahooFinance.search(q, { quotesCount: 50, newsCount: 0 }, { validateResult: false, region: 'IN' }) as any;
            res.quotes.forEach((q: any) => {
                // Accept IF valid Indian exchange OR explicitly ends with .NS/.BO
                // Some search results 'A India' might return .BO, which is fine.
                if (q.quoteType === 'EQUITY') {
                    let symbol = q.symbol;
                    if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
                        uniqueStocks.set(symbol, q.shortName || q.longName || symbol);
                    } else if (q.exchange === 'NSI' || q.exchange === 'NSE') {
                        uniqueStocks.set(symbol + '.NS', q.shortName || q.longName || symbol);
                    } else if (q.exchange === 'BSE') {
                        uniqueStocks.set(symbol + '.BO', q.shortName || q.longName || symbol);
                    }
                }
            });
        } catch (e) { }
    }

    // 4. Aggressive Alphabetical Search (To reach 1000-2000+ stocks)
    console.log('🔤 Starting Alphabetical Scan (A-Z) with "India" suffix...');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (const char of alphabet) {
        try {
            const query = `${char} India`;
            const res = await yahooFinance.search(query, { quotesCount: 50, newsCount: 0 }, { validateResult: false, region: 'IN' }) as any;
            if (res.quotes) {
                res.quotes.forEach((q: any) => {
                    if (q.quoteType === 'EQUITY') {
                        let symbol = q.symbol;
                        if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) {
                            uniqueStocks.set(symbol, q.shortName || q.longName || symbol);
                        } else if (q.exchange === 'NSI' || q.exchange === 'NSE') {
                            uniqueStocks.set(symbol + '.NS', q.shortName || q.longName || symbol);
                        } else if (q.exchange === 'BSE') {
                            uniqueStocks.set(symbol + '.BO', q.shortName || q.longName || symbol);
                        }
                    }
                });
            }
            process.stdout.write(`\r✅ Scanned ${query}... Total so far: ${uniqueStocks.size}`);
        } catch (e) {
            // Ignore errors
        }
    }
    console.log('\n');

    console.log(`✅ Total Unique Stocks Found: ${uniqueStocks.size}`);

    const resultList = Array.from(uniqueStocks.entries()).map(([symbol, companyName]) => ({
        symbol,
        companyName
    }));

    // Sort alphabetically
    resultList.sort((a, b) => a.symbol.localeCompare(b.symbol));

    const fileContent = `
export const EXPANDED_MARKET_DATA = ${JSON.stringify(resultList, null, 2)};
    `.trim();

    const outputPath = path.join(__dirname, '..', 'src', 'stocks', 'expanded-market-data.ts');
    fs.writeFileSync(outputPath, fileContent);
    console.log(`💾 Saved ${resultList.length} stocks to ${outputPath}`);
}

fetchUniverse();
