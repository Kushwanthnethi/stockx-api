
const yahooFinance = require('yahoo-finance2').default;

async function testNews() {
    try {
        const symbol = 'KFINTECH.NS';
        console.log(`Searching for news for: ${symbol}`);
        const res = await yahooFinance.search(symbol, { newsCount: 3 });
        console.log('Results:', JSON.stringify(res.news, null, 2));

        const symbol2 = 'RELIANCE.NS';
        console.log(`Searching for news for: ${symbol2}`);
        const res2 = await yahooFinance.search(symbol2, { newsCount: 3 });
        console.log('Results:', JSON.stringify(res2.news, null, 2));

    } catch (e) {
        console.error(e);
    }
}

testNews();
