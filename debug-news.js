
async function testNews() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default;
        const yahooFinance = new YahooFinance();

        const queries = [
            'India Stock Market',
            'Nifty 50',
            'Sensex',
            'Indian Economy'
        ];

        for (const q of queries) {
            console.log(`\n--- News for: "${q}" ---`);
            const result = await yahooFinance.search(q, { newsCount: 5 });
            if (result.news) {
                result.news.forEach(n => {
                    console.log(`[${new Date(n.providerPublishTime).toLocaleTimeString()}] ${n.title} (${n.publisher})`);
                });
            } else {
                console.log('No news found.');
            }
        }

    } catch (e) {
        console.error(e);
    }
}

testNews();
