
async function test() {
    try {
        console.log('Testing IPCALAB data...');
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;

        let yf;
        try {
            yf = new YahooFinance();
        } catch (e) {
            yf = YahooFinance;
        }

        const symbol = 'IPCALAB.NS';

        console.log('--- Checking Fallback 1 (incomeStatementHistoryQuarterly) ---');
        const summary1 = await yf.quoteSummary(symbol, {
            modules: ['incomeStatementHistoryQuarterly']
        }, { validate: false });

        const history = summary1.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        console.log(`Fallback 1 Count: ${history.length}`);
        if (history.length > 0) {
            const first = history[0]; // Latest
            console.log('Fallback 1 First Item Keys:', Object.keys(first));
            console.log('Revenue:', JSON.stringify(first.totalRevenue, null, 2));
            console.log('Net Income:', JSON.stringify(first.netIncome, null, 2));
            console.log('Operating Income:', JSON.stringify(first.operatingIncome, null, 2));
            console.log('EBIT:', JSON.stringify(first.ebit, null, 2));
            console.log('Basic EPS:', JSON.stringify(first.basicEps, null, 2));
        }

        console.log('--- Checking Fallback 2 (Earnings Module) ---');
        const summary2 = await yf.quoteSummary(symbol, {
            modules: ['earnings']
        }, { validate: false });

        const earningsHistory = summary2.earnings?.financialsChart?.quarterly || [];
        if (earningsHistory.length > 0) {
            const last = earningsHistory[earningsHistory.length - 1];
            console.log('Last Quarter Item:', JSON.stringify(last, null, 2));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
