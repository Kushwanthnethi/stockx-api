
async function test() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default;

        console.log('Type of default:', typeof YahooFinance);

        const yf = new YahooFinance();
        console.log('Instance created successfully');

        const symbol = 'ABB.NS';
        const result = await yf.quoteSummary(symbol, {
            modules: ['price']
        });
        console.log('Quote fetched:', result.price?.regularMarketPrice);

    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
