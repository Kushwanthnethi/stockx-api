const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance();

async function run() {
    console.log('Testing single screener RAW output...');
    try {
        const res = await yf.screener({ scrIds: 'day_gainers', count: 1, region: 'IN', lang: 'en-IN' }, { validateResult: false });
        if (res.quotes && res.quotes.length > 0) {
            console.log('Sample Quote:', JSON.stringify(res.quotes[0], null, 2));
        } else {
            console.log('No quotes found.');
            console.log('Full Res:', JSON.stringify(res, null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
