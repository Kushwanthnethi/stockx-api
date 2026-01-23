async function main() {
    try {
        const pkg = require('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;

        const yahooFinance = new YahooFinance();

        const result = await yahooFinance.quoteSummary('AAPL', {
            modules: ['earnings', 'calendarEvents', 'defaultKeyStatistics']
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}
main();
