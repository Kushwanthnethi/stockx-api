
const YahooFinance = require('yahoo-finance2').default;

async function testNews() {
    try {
        const yf = new YahooFinance();

        const symbol = 'KFINTECH.NS';
        console.log(`Searching for news for: ${symbol}`);
        const res = await yf.search(symbol, { newsCount: 3 });

        if (res.news) {
            console.log('Results found:', res.news.length);
            res.news.forEach((n, i) => {
                console.log(`[${i + 1}] ${n.title} (${n.publisher})`);
            });
        } else {
            console.log('No news found in search results.');
        }

        // Test fallback strategy?
        // Maybe searching for just the name "KFin Technologies"
        const name = "KFin Technologies Limited";
        console.log(`\nSearching by name: ${name}`);
        const res2 = await yf.search(name, { newsCount: 3 });
        if (res2.news) {
            res2.news.forEach((n, i) => {
                console.log(`[${i + 1}] ${n.title} (${n.publisher})`);
            });
        }

    } catch (e) {
        console.error(e);
    }
}

testNews();
