const yf = require('yahoo-finance2');
// Try both patterns
const yahooFinance = yf.default || yf;

async function test() {
    try {
        console.log('Testing yahoo finance...');
        const symbol = 'TATAMOTORS.NS';
        // 'summaryDetail' gives PE, marketCap, etc.
        // 'defaultKeyStatistics' gives PB ratio (priceToBook)
        // 'price' gives regularMarketPrice
        const result = await yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail', 'defaultKeyStatistics'] });

        console.log('Price:', result.price?.regularMarketPrice);
        console.log('PE:', result.summaryDetail?.trailingPE);
        console.log('PB:', result.defaultKeyStatistics?.priceToBook);
        console.log('Market Cap:', result.summaryDetail?.marketCap);
        console.log('Success');
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
