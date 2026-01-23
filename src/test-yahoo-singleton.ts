
import yahooFinance from 'yahoo-finance2';

async function test() {
    console.log('Testing Singleton pattern...');
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass = pkg.default as any;

        // Create ONE instance
        const yf = new YahooFinanceClass({
            validation: { logErrors: false }
        });

        const symbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS'];

        for (const symbol of symbols) {
            try {
                console.log(`Fetching ${symbol}...`);
                const data = await yf.quoteSummary(symbol, { modules: ['price'] });
                console.log(`SUCCESS ${symbol}: ${data.price?.regularMarketPrice}`);
            } catch (e: any) {
                console.error(`FAILED ${symbol}:`, e.message);
            }
        }

    } catch (e: any) {
        console.error('Fatal:', e);
    }
}

test();
