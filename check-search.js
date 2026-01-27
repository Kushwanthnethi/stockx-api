const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance();

async function run() {
    const queries = ['A India', 'Reliance India', 'Steel India'];
    for (const q of queries) {
        console.log(`Testing Search RAW output for "${q}"...`);
        try {
            const res = await yf.search(q, { quotesCount: 5, newsCount: 0 }, { validateResult: false, region: 'IN' });
            console.log(`Results for ${q}:`, res.quotes ? res.quotes.length : 0);
            if (res.quotes && res.quotes.length > 0) {
                const sample = res.quotes[0];
                console.log(`Sample (${q}): Symbol=${sample.symbol}, Name=${sample.shortName}, Exch=${sample.exchange}`);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    }
}
run();
