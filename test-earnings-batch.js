const { execSync } = require('child_process');

console.log('Starting verification simulation: Batch Ingestion');

// Simulate calling the scheduler logic manually
// In a real e2e test we would call the API, but here we can just verify the Yahoo Finance connectivity
// and data structure by running a small script that mimics the service.

const yahooFinance = require('yahoo-finance2').default || require('yahoo-finance2');

const TEST_SYMBOLS = ['RELIANCE.NS', 'TCS.NS', 'ZOMATO.NS', 'TRENT.NS'];

async function testBatch() {
    console.log(`Processing batch of ${TEST_SYMBOLS.length} stocks...`);
    const start = Date.now();

    for (const symbol of TEST_SYMBOLS) {
        try {
            console.log(`Fetching ${symbol}...`);
            const res = await yahooFinance.quoteSummary(symbol, { modules: ['calendarEvents', 'earnings'] });

            const events = res.calendarEvents?.earnings;
            const earningsDate = events?.earningsDate?.[0];

            console.log(`- ${symbol}: Earnings Date: ${earningsDate ? new Date(earningsDate).toDateString() : 'Not Found'}`);

            // Artificial delay to mimic "Sipping" rate limit protection
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`- ${symbol}: Failed`, e.message);
        }
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`Batch finished in ${duration.toFixed(2)}s`);
}

testBatch();
