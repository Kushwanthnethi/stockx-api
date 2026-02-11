async function check() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass = pkg.default || pkg;

        let yf;
        if (typeof YahooFinanceClass === 'function') {
            yf = new YahooFinanceClass({
                validation: { logErrors: false },
                suppressNotices: ['yahooSurvey']
            });
        } else {
            yf = YahooFinanceClass;
        }

        const symbol = 'RELIANCE.NS';
        console.log(`Checking ${symbol}...`);

        // 1. Try fundamentalsTimeSeries
        console.log('--- fundamentalsTimeSeries ---');
        const res = await yf.fundamentalsTimeSeries(symbol, {
            period1: '2023-01-01',
            module: 'financials',
            type: 'quarterly'
        }, { validate: false });

        console.log('Result length:', res ? res.length : 0);
        if (res && res.length > 0) {
            console.log('Sample data keys:', Object.keys(res[0]));
        }

        // 2. Try quoteSummary fallback
        console.log('\n--- quoteSummary (fallback module) ---');
        const summary = await yf.quoteSummary(symbol, {
            modules: ['incomeStatementHistoryQuarterly', 'price']
        }, { validate: false });

        const history = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        console.log('History length:', history.length);
        if (history.length > 0) {
            console.log('Sample history date:', history[0].endDate?.fmt);
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    }
}

check();
