
const { default: yahooFinance } = require('yahoo-finance2');


async function test() {
    try {
        const { default: yahooFinance } = await import('yahoo-finance2');

        const symbol = 'ABB.NS';
        const result = await yahooFinance.quoteSummary(symbol, {
            modules: ['price', 'summaryDetail', 'defaultKeyStatistics']
        });

        console.log('Symbol:', symbol);
        console.log('Price:', result.price?.regularMarketPrice);
        console.log('Prev Close:', result.price?.regularMarketPreviousClose);
        console.log('Change (Abs):', result.price?.regularMarketChange);
        console.log('Change (%):', result.price?.regularMarketChangePercent);

        if (result.price?.regularMarketPrice && result.price?.regularMarketPreviousClose) {
            const calcChange = result.price.regularMarketPrice - result.price.regularMarketPreviousClose;
            const calcPercent = (calcChange / result.price.regularMarketPreviousClose) * 100;
            console.log('Calculated Change:', calcChange);
            console.log('Calculated Percent:', calcPercent);
        }

    } catch (e) {
        console.error(e);
    }
}

test();
