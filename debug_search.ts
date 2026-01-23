
async function debugSearch() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default as any;
        const yahooFinance = new YahooFinance();

        console.log("Searching 'IN' with fuzzy...");
        // Type definition might not show it, but try passing it
        const result = await yahooFinance.search('IN', { quotesCount: 50, newsCount: 0, enableFuzzyQuery: true });

        console.log(`Count: ${result.quotes.length}`);
        const indus = result.quotes.find((q: any) => q.symbol === 'INDUSTOWER.NS');
        if (indus) console.log("Found Indus!");
        else console.log("Indus NOT found.");

        // Also try searching for 'INDUSTOWER'
        console.log("Searching 'INDUSTOWER'...");
        const result2 = await yahooFinance.search('INDUSTOWER', { quotesCount: 10 });
        console.log(`Count: ${result2.quotes.length}`);
        const indus2 = result2.quotes.find((q: any) => q.symbol === 'INDUSTOWER.NS');
        if (indus2) console.log("Found Indus via 'INDUSTOWER'!");

    } catch (error) {
        console.error("Error", error);
    }
}

debugSearch();
