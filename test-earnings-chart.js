async function main() {
    const pkg = require('yahoo-finance2');
    const YahooFinance = pkg.default || pkg;
    const yahooFinance = new YahooFinance();

    const symbols = ['TCS.NS', 'RELIANCE.NS'];

    for (const symbol of symbols) {
        try {
            const result = await yahooFinance.quoteSummary(symbol, {
                modules: ['earnings']
            });

            if (result.earnings && result.earnings.earningsChart && result.earnings.earningsChart.quarterly) {
                console.log(`\n--- ${symbol} Earnings Chart ---`);
                result.earnings.earningsChart.quarterly.forEach(q => {
                    console.log(`  Qtr: ${q.date}, Est: ${q.estimate}, Act: ${q.actual}`);
                });
            } else {
                console.log(`No Earnings Chart for ${symbol}`);
            }
        } catch (e) {
            console.error(`Error for ${symbol}:`, e.message);
        }
    }
}

main();
