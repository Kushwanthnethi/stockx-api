
const YahooFinance = require('yahoo-finance2').default;

async function testAceBse() {
    try {
        const symbol = 'ACE.BO';
        console.log(`Fetching quote for: ${symbol}`);
        const quote = await YahooFinance.quote(symbol);
        console.log('Quote:', quote ? 'Success' : 'Failed');
        if (quote) {
            console.log('Price:', quote.regularMarketPrice);
        }
    } catch (e) {
        console.error('Error fetching ACE.BO:', e.message);
    }
}

testAceBse();
