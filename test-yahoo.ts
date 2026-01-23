import yahooFinance from 'yahoo-finance2';

async function test() {
    try {
        console.log('Testing yahoo finance (TS)...');
        const symbol = 'TATAMOTORS.NS';
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
