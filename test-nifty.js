const pkg = require('yahoo-finance2');
const yahooFinance = pkg.default;

async function test() {
    const yf = new yahooFinance({ validation: { logErrors: false } });

    try {
        console.log("Fetching ^NSEI Only...");
        const nifty = await yf.quoteSummary('^NSEI', { modules: ['price', 'summaryDetail'] });
        console.log("NIFTY Result:", JSON.stringify(nifty.price, null, 2));
    } catch (e) {
        console.error("NIFTY Failed:", e.message);
        if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
    }
}

test();
