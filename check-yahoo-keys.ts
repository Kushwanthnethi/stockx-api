import yahooFinance from 'yahoo-finance2';

async function test() {
    try {
        console.log('Testing yahoo finance (TS)...');
        const symbol = 'HINDALCO.NS';
        const result: any = await yahooFinance.quoteSummary(symbol, { modules: ['incomeStatementHistoryQuarterly', 'earnings'] });

        console.log('--- Income Statement History Quarterly ---');
        const history = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
        if (history.length > 0) {
            const q = history[0];
            console.log('Keys in latest quarter:', Object.keys(q));
            console.log('Revenue:', q.totalRevenue?.raw);
            console.log('Net Income:', q.netIncome?.raw);
            console.log('EPS (Basic):', JSON.stringify(q, null, 2));
        } else {
            console.log('No income statement history found.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
