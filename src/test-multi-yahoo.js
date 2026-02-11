async function check() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass = pkg.default || pkg;

        const yf = new YahooFinanceClass({
            validation: { logErrors: false },
            suppressNotices: ['yahooSurvey']
        });

        const symbols = ['TCS.NS', 'RELIANCE.NS', 'INDUSTOWER.NS'];

        for (const symbol of symbols) {
            console.log(`\n--- Testing ${symbol} ---`);

            // 1. Fundamentals
            try {
                const res = await yf.fundamentalsTimeSeries(symbol, {
                    period1: '2023-01-01',
                    module: 'financials',
                    type: 'quarterly'
                }, { validate: false });
                console.log(`[Fundamentals] Result count: ${res ? res.length : 0}`);
            } catch (e) {
                console.log(`[Fundamentals] Failed: ${e.message}`);
            }

            // 2. Quote Summary
            try {
                const summary = await yf.quoteSummary(symbol, {
                    modules: ['incomeStatementHistoryQuarterly']
                }, { validate: false });
                const history = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
                console.log(`[QuoteSummary] History count: ${history.length}`);
            } catch (e) {
                console.log(`[QuoteSummary] Failed: ${e.message}`);
            }
        }

    } catch (e) {
        console.error('ERROR:', e);
    }
}

check();
