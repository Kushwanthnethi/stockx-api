
// @ts-nocheck
import yahooFinance from 'yahoo-finance2';

async function test() {
    try {
        console.log('Testing ACE.NS (TS)...');
        const symbol = 'ACE.NS';

        // Suppress warnings
        const originalWarn = console.warn;
        console.warn = () => { };

        console.log(`Fetching quote for ${symbol}...`);
        const result = await yahooFinance.quote(symbol);

        console.warn = originalWarn;

        console.log('Symbol:', result.symbol);
        console.log('Price:', result.regularMarketPrice);
        console.log('Name:', result.shortName);
        console.log('Success');
    } catch (e) {
        console.error('Error fetching ACE.NS:', e);
    }
}

test();
