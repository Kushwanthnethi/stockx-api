
async function test() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default;
        const yahooFinance = new YahooFinance();

        const queries = ['RELIANCE', 'ZOMATO', 'INFY', 'TATASTEEL'];

        for (const q of queries) {
            console.log(`--- Searching for ${q} ---`);
            const result = await yahooFinance.search(q);
            // Print exchange and symbol for all results to see what we're filtering out
            result.quotes.forEach(quote => {
                console.log(`Symbol: ${quote.symbol}, Exchange: ${quote.exchange}, Param: ${quote.typeDisp || quote.quoteType}, isYF: ${quote.isYahooFinance}`);
            });
        }

    } catch (e) {
        console.error(e);
    }
}

test();
