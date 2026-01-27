const pkg = require('yahoo-finance2');
const yahooFinance = pkg.default; // Usually the default export is the library instance or class

async function test() {
    console.log("Yahoo Finance Type:", typeof yahooFinance);

    try {
        // If it's a class, instantiate it (like in the service)
        // stockx-api uses: const YahooFinanceClass = pkg.default; new YahooFinanceClass(...)
        // Let's try to see if we can just use it directly or need to instantiate
        let yf = yahooFinance;
        if (typeof yahooFinance === 'function') {
            try {
                yf = new yahooFinance({ validation: { logErrors: false } });
            } catch (e) {
                console.log("Could not instantiate, using directly");
            }
        }

        console.log("Fetching ^NSEI (NIFTY 50)...");
        const nifty = await yf.quoteSummary('^NSEI', { modules: ['price', 'summaryDetail'] });
        console.log("NIFTY 50:", JSON.stringify(nifty.price, null, 2));

        console.log("Fetching ^BSESN (SENSEX)...");
        const sensex = await yf.quoteSummary('^BSESN', { modules: ['price', 'summaryDetail'] });
        console.log("SENSEX:", JSON.stringify(sensex.price, null, 2));

    } catch (e) {
        console.error("API Error:", e);
    }
}

test();
