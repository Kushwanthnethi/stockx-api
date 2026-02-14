const { default: yahooFinance } = require('yahoo-finance2');

async function test() {
    const symbol = 'HINDALCO.NS';
    console.log(`Fetching data for ${symbol}...`);

    try {
        // Mimic getQuarterlyDetails logic
        const querySymbol = symbol;

        console.log('--- Attempting Primary Fetch (financials-quarterly) ---');
        let data = [];
        try {
            const res = await yahooFinance.fundamentalsTimeSeries(querySymbol, {
                period1: '2023-01-01',
                module: 'financials',
                type: 'quarterly'
            }, { validate: false });

            if (Array.isArray(res)) {
                data = res;
            } else if (res && typeof res === 'object') {
                // @ts-ignore
                const wrapped = res.timeseries?.result || res.result;
                data = Array.isArray(wrapped) ? wrapped : [];
            }
            console.log(`Primary Fetch Result Count: ${data.length}`);
        } catch (e) {
            console.log('Primary Fetch Failed:', e.message);
        }

        if (data.length === 0) {
            console.log('--- Attempting Fallbacks ---');
            const summary = await yahooFinance.quoteSummary(querySymbol, {
                modules: ['incomeStatementHistoryQuarterly', 'earnings', 'price']
            }, { validate: false });

            // Fallback 1
            const history = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
            console.log(`Fallback 1 (incomeStatementHistoryQuarterly) Count: ${history.length}`);
            if (history.length > 0) {
                const first = history[0];
                console.log('Fallback 1 First Item keys:', Object.keys(first));
                console.log('Fallback 1 Revenue:', first.totalRevenue);
            }

            // Fallback 2
            const earningsHistory = summary.earnings?.financialsChart?.quarterly || [];
            console.log(`Fallback 2 (earnings) Count: ${earningsHistory.length}`);
            if (earningsHistory.length > 0) {
                console.log('Fallback 2 First Item:', earningsHistory[earningsHistory.length - 1]);
            }
        } else {
            console.log('Primary Fetch succeeded. First item:', JSON.stringify(data[0], null, 2));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
