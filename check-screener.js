const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance();

async function run() {
    try {
        console.log('Fetching India Day Gainers...');
        // Common screener IDs: 'day_gainers', 'most_actives', 'day_losers', 'undervalued_growth_stocks' (region US usually)
        // For India, we might need specific queries or just check if generic ones work with region 'IN'.

        // Attempt 1: Using predefined screener (often limited to US or global top)
        // Yahoo Finance query 1: scrIds='day_gainers'
        const res1 = await yf.screener({ scrIds: 'day_gainers', count: 25, region: 'IN', lang: 'en-IN' });
        console.log('Res1 (Day Gainers):', res1.quotes.length, 'stocks found.');
        if (res1.quotes.length > 0) console.log('Sample:', res1.quotes[0].symbol);

        // Attempt 2: "Most Actives"
        const res2 = await yf.screener({ scrIds: 'most_actives', count: 25, region: 'IN', lang: 'en-IN' });
        console.log('Res2 (Most Actives):', res2.quotes.length, 'stocks found.');
        if (res2.quotes.length > 0) console.log('Sample:', res2.quotes[0].symbol);

        // Attempt 3: Try to find a way to query "all" for India?
        // Often controlled via `quotetype="EQUITY"` and `region="IN"`.
        // The library might not support arbitrary query validation easily, but let's test basics.

    } catch (e) {
        console.error('Screener fetch failed:', e);
    }
}

run();
