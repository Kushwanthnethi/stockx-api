
async function test() {
    try {
        console.log('Testing RELIANCE data...');
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;

        let yf;
        try {
            yf = new YahooFinance();
        } catch (e) {
            yf = YahooFinance;
        }

        const symbol = 'RELIANCE.NS';

        console.log('--- Checking Fallback 1 (incomeStatementHistoryQuarterly) ---');
        try {
            const summary1 = await yf.quoteSummary(symbol, {
                modules: ['incomeStatementHistoryQuarterly']
            }, { validate: false });

            const history = summary1.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
            console.log(`Fallback 1 Count: ${history.length}`);
            if (history.length > 0) {
                const first = history[0]; // Latest
                console.log('Revenue:', JSON.stringify(first.totalRevenue, null, 2));
                console.log('Net Income:', JSON.stringify(first.netIncome, null, 2));
                console.log('Operating Income:', JSON.stringify(first.operatingIncome, null, 2));
                console.log('EBIT:', JSON.stringify(first.ebit, null, 2));
                console.log('PBT (incomeBeforeTax):', JSON.stringify(first.incomeBeforeTax, null, 2));
                console.log('Interest Expense:', JSON.stringify(first.interestExpense, null, 2));
                console.log('Tax:', JSON.stringify(first.incomeTaxExpense, null, 2));
            }
        } catch (e) {
            console.log('Fallback 1 Failed:', e.message);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
