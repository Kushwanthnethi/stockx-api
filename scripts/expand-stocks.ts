
import { PrismaClient } from '@prisma/client';
// @ts-ignore
const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();
const axios = require('axios');

const prisma = new PrismaClient();

async function expandStocks() {
    console.log('🚀 Starting Stock Expansion Process (v4 - with CSV)...');

    // 1. Get existing stocks
    const existingStocks = await prisma.stock.findMany({ select: { symbol: true } });
    const existingSet = new Set(existingStocks.map(s => s.symbol));
    console.log(`📊 Current DB has ${existingSet.size} stocks.`);

    const candidateSymbols = new Set<string>();
    const addCandidate = (symbol: string) => {
        // Normalize
        let cleanSymbol = symbol.trim();
        if (!cleanSymbol.endsWith('.NS') && !cleanSymbol.endsWith('.BO')) {
            // We might lose some info here without exchange data, but usually .NS is safe default for NSE
            // actually better to rely on what Yahoo gives us if possible, or skip if ambiguous
            return;
        }

        if (!existingSet.has(cleanSymbol)) {
            candidateSymbols.add(cleanSymbol);
        }
    };


    // 1.5 Fetch Nifty Lists via CSV (Multiple Sources)
    const csvUrls = [
        'https://raw.githubusercontent.com/kprohith/nse-stock-analysis/master/ind_nifty500list.csv',
        'https://raw.githubusercontent.com/kprohith/nse-stock-analysis/master/ind_niftysmallcap250list.csv',
        'https://raw.githubusercontent.com/kprohith/nse-stock-analysis/master/ind_niftymidcap150list.csv',
        'https://raw.githubusercontent.com/kprohith/nse-stock-analysis/master/ind_niftymicrocap250_list.csv'
    ];

    for (const url of csvUrls) {
        try {
            console.log(`📥 Fetching list from ${url}...`);
            const { data } = await axios.get(url);
            const rows = data.split('\n');
            let csvCount = 0;
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i].split(',');
                if (row.length > 2) {
                    const symbol = row[2].trim(); // Symbol column
                    if (symbol && symbol !== 'Symbol') {
                        addCandidate(`${symbol}.NS`);
                        csvCount++;
                    }
                }
            }
            console.log(`✅ Extracted ${csvCount} symbols from CSV.`);
        } catch (e) {
            console.warn(`Failed to fetch CSV ${url}:`, e instanceof Error ? e.message : "Error");
        }
    }

    // 2. Discover via Screeners (Better for bulk)
    const screenerIds = [
        'day_gainers', 'day_losers', 'most_actives', 'undervalued_growth_stocks',
        'growth_technology_stocks', 'undervalued_large_caps', 'aggressive_small_caps',
        'portfolio_anchors', 'solid_large_caps', 'small_cap_gainers'
    ];

    console.log(`📡 Scraping ${screenerIds.length} Screeners...`);
    for (const id of screenerIds) {
        try {
            const res = await yahooFinance.screener({ scrIds: id, count: 100, region: 'IN', lang: 'en-IN' }, { validateResult: false });
            // @ts-ignore
            if (res.quotes) {
                // @ts-ignore
                res.quotes.forEach(q => {
                    if (!q.symbol) return;
                    let symbol = q.symbol;
                    if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) {
                        if (q.exchange === 'NSE' || q.exchange === 'NSI') symbol += '.NS';
                        else if (q.exchange === 'BSE') symbol += '.BO';
                    }
                    addCandidate(symbol);
                });
            }
        } catch (e) {
            console.warn(`Screener ${id} failed:`, e instanceof Error ? e.message : e);
        }
    }

    // 3. Discover via Search (Massive List)
    const searchTerms = [
        // Broad Indices/Groups
        'Nifty', 'Sensex', 'Midcap', 'Smallcap', 'Microcap',
        // Corporate Groups
        'Tata', 'Adani', 'Birla', 'Mahindra', 'Godrej', 'Bajaj', 'HDFC', 'ICICI', 'Reliance', 'Jindal', 'Murugappa', 'TVS', 'L&T',
        // Industries (Specific)
        'Cement', 'Steel', 'Sugar', 'Textile', 'Chemical', 'Power', 'Hotel', 'Hospital',
        'Paper', 'Paints', 'Media', 'Real Estate', 'Infrastructure', 'Oil', 'Gas', 'Mining',
        'Pharma', 'Biotech', 'Fertilizer', 'Agro', 'Pesticides', 'Seeds',
        'Auto', 'Tyres', 'Battery', 'Forging', 'Engineering', 'Bearings', 'Cables', 'Wires',
        'Electronics', 'Software', 'Hardware', 'Telecom', 'Network',
        'Logistics', 'Shipping', 'Transport', 'Airlines', 'Defence', 'Aerospace',
        'Jewellery', 'Gold', 'Diamonds', 'Retail', 'Fashion', 'Apparel', 'Footwear',
        'FMCG', 'Food', 'Beverages', 'Dairy', 'Tea', 'Coffee', 'Rice',
        'Ceramics', 'Glass', 'Plastics', 'Rubber', 'Packaging', 'Printing',
        'Finance', 'Investment', 'Insurance', 'Bank', 'Broking', 'Wealth',
        // Alphabetical + Common Suffixes (To find "X Industries", "Y Ltd")
        'A Industries', 'B Industries', 'C Industries', 'D Industries', 'E Industries',
        'F Industries', 'G Industries', 'H Industries', 'I Industries', 'J Industries',
        'K Industries', 'L Industries', 'M Industries', 'N Industries', 'O Industries',
        'P Industries', 'R Industries', 'S Industries', 'T Industries', 'U Industries',
        'V Industries', 'W Industries', 'Z Industries',
        'A Ltd', 'B Ltd', 'C Ltd', 'D Ltd', 'S Ltd', 'R Ltd', 'T Ltd', 'M Ltd', 'K Ltd'
    ];

    console.log(`🔍 Searching ${searchTerms.length} terms...`);
    const searchConcurrency = 5;
    for (let i = 0; i < searchTerms.length; i += searchConcurrency) {
        const batch = searchTerms.slice(i, i + searchConcurrency);
        await Promise.all(batch.map(async (term) => {
            try {
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
        // small delay
        await new Promise(r => setTimeout(r, 100));
    }

    const candidatesArray = Array.from(candidateSymbols);
    console.log(`🧐 Found ${candidatesArray.length} NEW potential candidates.`);

    if (candidatesArray.length === 0) {
        console.log("⚠️ Still no candidates. Exiting.");
        return;
    }

    // 4. Validate & Insert
    console.log('🕵️ Validating candidates...');
    let addedCount = 0;

    // Process all candidates
    const batchToProcess = candidatesArray;

    const BATCH_SIZE = 20; // Increased concurrency
    for (let i = 0; i < batchToProcess.length; i += BATCH_SIZE) {
        const batch = batchToProcess.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (symbol) => {
            try {
                const quote = await yahooFinance.quote(symbol);
                if (quote && quote.regularMarketPrice && quote.regularMarketPrice > 0) {
                    const volume = quote.regularMarketVolume || 0;
                    const avgVolume = quote.averageDailyVolume3Month || 0;

                    if (volume > 100 || avgVolume > 1000) {
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
                            process.stdout.write(`\r✅ Added: ${symbol} (${quote.shortName})        `);
                        } catch (e) { }
                    }
                }
            } catch (e) { }
        }));

        // throttle reduced
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n🎉 DONE! Added ${addedCount} new stocks.`);
}

expandStocks()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
