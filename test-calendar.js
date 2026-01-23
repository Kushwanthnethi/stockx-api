
const pkg = require('yahoo-finance2').default;
const yahooFinance = new pkg({ validation: { logErrors: false } });

async function test() {
    const symbol = 'RELIANCE.NS';
    console.log(`Testing calendarEvents for ${symbol}...`);
    try {
        const res = await yahooFinance.quoteSummary(symbol, {
            modules: ['calendarEvents', 'price'],
            validateResult: false
        });
        console.log('RELIANCE Result:', JSON.stringify(res, null, 2));

        const tcs = await yahooFinance.quoteSummary('TCS.NS', {
            modules: ['calendarEvents', 'price'],
            validateResult: false
        });
        console.log('TCS Result:', JSON.stringify(tcs, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

test();
