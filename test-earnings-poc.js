const yf = require('yahoo-finance2');

async function checkEarnings(symbol) {
    try {
        // Based on logs, yf.default is a Class. Let's try instantiating it.
        const yahooFinance = new yf.default();
        const result = await yahooFinance.quoteSummary(symbol, { modules: ['calendarEvents', 'earnings'] });
        console.log(`\nResults for ${symbol}:`);
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(`Error for ${symbol}:`, e);
    }
}

(async () => {
    await checkEarnings('RELIANCE.NS');
})();
