
async function test() {
    try {
        console.log('Testing yahoo finance (JS dynamic import)...');
        const pkg = await import('yahoo-finance2');
        const yahooFinance = pkg.default || pkg;

        const symbol = 'HINDALCO.NS'; // Using a stock known to have data
        console.log(`Fetching data for ${symbol}...`);

        const result = await yahooFinance.quoteSummary(symbol, { modules: ['incomeStatementHistoryQuarterly', 'earnings'] });

        console.log('--- Quarter 0 (Latest) ---');
        const history = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        if (history.length > 0) {
            const q = history[0];
            console.log('Keys:', Object.keys(q));
            console.log('Total Revenue:', q.totalRevenue);
            console.log('Net Income:', q.netIncome);
            console.log('Operating Income:', q.operatingIncome);
            console.log('Basic EPS:', q.basicEps); // Checking if this exists
        } else {
            console.log('No income statement history found.');
        }

        console.log('--- Earnings Module ---');
        const earnings = result.earnings?.financialsChart?.quarterly || [];
        if (earnings.length > 0) {
            console.log('Latest Earnings Quarter:', earnings[earnings.length - 1]);
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
