
const yf = require('yahoo-finance2').default; // Try default export first

async function testAce() {
    try {
        const symbol = 'ACE.NS';
        console.log(`Fetching quote for: ${symbol}`);

        // Supress console warnings from library
        const originalWarn = console.warn;
        console.warn = () => { };

        const quote = await yf.quote(symbol);

        console.warn = originalWarn;

        console.log('Quote:', quote ? 'Success' : 'Failed');
        if (quote) {
            console.log('Price:', quote.regularMarketPrice);
            console.log('Shortname:', quote.shortName);
        }
    } catch (e) {
        console.error('Error fetching ACE.NS:', e.message);
        console.error('Full Error:', e);
    }
}

testAce();
