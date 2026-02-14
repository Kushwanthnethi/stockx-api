
async function test() {
    try {
        console.log('Testing HINDALCO data...');
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;

        let yf;
        try {
            yf = new YahooFinance();
        } catch (e) {
            yf = YahooFinance; // It might be an instance already
        }

        const symbol = 'HINDALCO.NS';

        console.log('--- Checking Fallback 1 (incomeStatementHistoryQuarterly) ---');
        const summary1 = await yf.quoteSummary(symbol, {
            modules: ['incomeStatementHistoryQuarterly']
        }, { validate: false });

        const history = summary1.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        console.log(`Fallback 1 Count: ${history.length}`);
        if (history.length > 0) {
            const first = history[0];
            console.log('Fallback 1 First Item Keys:', Object.keys(first));
            console.log('Fallback 1 Revenue:', JSON.stringify(first.totalRevenue, null, 2));
            console.log('Fallback 1 Net Income:', JSON.stringify(first.netIncome, null, 2));
        }

        console.log('--- Checking Fallback 2 (Earnings Module) ---');
        const summary = await yf.quoteSummary(symbol, {
            modules: ['earnings']
        }, { validate: false });

        const earningsHistory = summary.earnings?.financialsChart?.quarterly || [];
        console.log(`Fallback 2 Count: ${earningsHistory.length}`);

        if (earningsHistory.length > 0) {
            const last = earningsHistory[earningsHistory.length - 1];
            console.log('Last Quarter Item:', JSON.stringify(last, null, 2));
            console.log('Revenue Type:', typeof last.revenue);
            console.log('Revenue Value:', last.revenue);
            if (typeof last.revenue === 'object') {
                console.log('Revenue Raw:', last.revenue.raw);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
