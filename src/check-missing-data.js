const yahooFinance = require('yahoo-finance2').default;

async function checkStock() {
    const symbol = 'INDUSTOWER.NS';
    console.log(`Checking data for ${symbol}...`);

    // In commonjs, yahooFinance might be the default export or the object itself
    let yf = yahooFinance;
    if (typeof yf.setGlobalConfig !== 'function') {
        // Fallback for different import styles
        yf = require('yahoo-finance2');
    }

    try {
        const res = await yf.fundamentalsTimeSeries(symbol, {
            period1: '2023-01-01',
            module: 'financials',
            type: 'quarterly'
        }, { validate: false });

        console.log('Result for INDUSTOWER.NS:');
        console.log(JSON.stringify(res, null, 2));

        if (!res || res.length === 0) {
            console.log('--- NO DATA RETURNED BY fundamentalsTimeSeries ---');

            console.log('Trying quoteSummary as fallback...');
            const summary = await yf.quoteSummary(symbol, {
                modules: ['incomeStatementHistoryQuarterly']
            }, { validate: false });
            console.log('Summary result fields:', Object.keys(summary));
            if (summary.incomeStatementHistoryQuarterly) {
                console.log('Found incomeStatementHistoryQuarterly data');
            } else {
                console.log('incomeStatementHistoryQuarterly is missing in quoteSummary too');
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
        // Try one more way to initialize
        try {
            const YahooFinance = require('yahoo-finance2').default;
            const yf2 = new YahooFinance();
            const res2 = await yf2.fundamentalsTimeSeries(symbol, { period1: '2023-01-01', module: 'financials', type: 'quarterly' }, { validate: false });
            console.log('Retry result success:', !!res2);
        } catch (e2) {
            console.error('Retry failed:', e2.message);
        }
    }
}

checkStock();
