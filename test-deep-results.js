async function main() {
    const pkg = require('yahoo-finance2');
    const YahooFinance = pkg.default || pkg;
    const yahooFinance = new YahooFinance();

    const symbols = ['TCS.NS', 'INFY.NS', 'RELIANCE.NS'];

    for (const symbol of symbols) {
        try {
            const result = await yahooFinance.quoteSummary(symbol, {
                modules: ['earningsHistory', 'earningsTrend', 'financialData', 'defaultKeyStatistics']
            });
            console.log(`\n--- ${symbol} Analysis ---`);

            if (result.earningsHistory && result.earningsHistory.history) {
                console.log('Recent History (Surprise):');
                // The history usually has 4 quarters. 0 is the oldest or newest? Usually newest last? Or reverse.
                // Let's print dates.
                result.earningsHistory.history.forEach(h => {
                    console.log(`  Date: ${h.quarter}, Est: ${h.epsEstimate?.fmt}, Act: ${h.epsActual?.fmt}, Surprise: ${h.surprisePercent?.fmt}`);
                });
            } else {
                console.log('No Earnings History found.');
            }

            if (result.earningsTrend && result.earningsTrend.trend) {
                console.log('Earnings Trend (Estimates for future):');
                // Current Qtr, Next Qtr, Current Year, Next Year
                result.earningsTrend.trend.forEach(t => {
                    console.log(`  Period: ${t.period}, Avg Est: ${t.earningsEstimate?.avg?.fmt}`);
                });
            }

        } catch (e) {
            console.error(`Error for ${symbol}:`, e.message);
        }
    }
}

main();
