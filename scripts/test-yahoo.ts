const yahooFinance = require('yahoo-finance2').default; // ensure default export

async function run() {
    console.log('Fetching ZOMATO.NS...');
    try {
        const result = await yahooFinance.quoteSummary('ZOMATO.NS', { modules: ['price', 'summaryDetail'] });
        console.log('Success:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.log('Caught Error!');
        console.log('Error Keys:', Object.keys(e));
        if (e.result) {
            console.log('Partial Result:', JSON.stringify(e.result, null, 2));
        } else {
            console.log('No partial result in error.');
            console.log('Full Error:', e);
        }
    }
}

run();
