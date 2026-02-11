const yahooFinance = require('yahoo-finance2').default;

async function check() {
    console.log('Testing INDUSTOWER.NS...');

    // Global config is the key
    yahooFinance.setGlobalConfig({
        validation: { logErrors: false }
    });

    try {
        const res = await yahooFinance.fundamentalsTimeSeries('INDUSTOWER.NS', {
            period1: '2023-01-01',
            module: 'financials',
            type: 'quarterly'
        }, { validate: false });

        console.log('Data length:', res ? res.length : 0);
        if (res && res.length > 0) {
            console.log('First entry sample:', JSON.stringify(res[0], null, 2));
        } else {
            console.log('No data from fundamentalsTimeSeries');

            console.log('Trying quoteSummary...');
            const summary = await yahooFinance.quoteSummary('INDUSTOWER.NS', {
                modules: ['incomeStatementHistoryQuarterly', 'financialData']
            }, { validate: false });

            const q = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
            console.log('QuoteSummary quarters:', q.length);
            if (q.length > 0) {
                console.log('Sample quarter:', JSON.stringify(q[0], null, 2));
            }
        }
    } catch (e) {
        console.error('Error in test:', e.message);
    }
}

check();
