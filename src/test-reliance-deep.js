async function check() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass = pkg.default || pkg;

        const yf = new YahooFinanceClass({
            validation: { logErrors: false },
            suppressNotices: ['yahooSurvey']
        });

        const symbol = 'RELIANCE.NS';
        console.log(`Deep check for ${symbol}...`);

        // 1. Try earnings module
        console.log('\n--- quoteSummary (earnings module) ---');
        const resEarnings = await yf.quoteSummary(symbol, {
            modules: ['earnings']
        }, { validate: false });

        const qE = resEarnings.earnings?.financialsChart?.quarterly || [];
        console.log(`Earnings quarterly count: ${qE.length}`);
        if (qE.length > 0) {
            console.log('Sample earnings:', JSON.stringify(qE[0]));
        }

        // 2. Try fundamentalsTimeSeries with 'all'
        console.log('\n--- fundamentalsTimeSeries (all) ---');
        const resAll = await yf.fundamentalsTimeSeries(symbol, {
            period1: '2023-01-01',
            module: 'all',
            type: 'quarterly'
        }, { validate: false });
        console.log(`Fundamentals all count: ${resAll ? resAll.length : 0}`);

    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

check();
