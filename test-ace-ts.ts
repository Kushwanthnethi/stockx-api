
// @ts-nocheck
import yf from 'yahoo-finance2';

async function testAce() {
    try {
        const symbol = 'ACE.NS';
        console.log(`Fetching quote for: ${symbol}`);

        // Supress console warnings
        const originalWarn = console.warn;
        console.warn = () => { };

        // The error suggests importing might be tricky in ts-node context without esModuleInterop
        // Try accessing .default if it exists on the imported object, or use it directly
        const client = yf.default || yf;

        const quote = await client.quote(symbol);

        console.warn = originalWarn;

        console.log('Quote:', quote ? 'Success' : 'Failed');
        if (quote) {
            console.log('Price:', quote.regularMarketPrice);
            console.log('Name:', quote.shortName);
        }
    } catch (e: any) {
        console.error('Error fetching ACE.NS:', e.message);
    }
}

testAce();
