
const yahooFinance = require('yahoo-finance2').default;

async function main() {
    const symbol = 'COALINDIA.NS';
    const fromDate = '2026-01-25'; // Pick date
    const toDate = '2026-02-01';   // Today

    try {
        console.log(`Checking history for ${symbol} from ${fromDate} to ${toDate}...`);
        const history = await yahooFinance.historical(symbol, {
            period1: fromDate,
            period2: toDate,
            interval: '1d'
        });

        let maxHigh = 0;
        history.forEach(day => {
            console.log(`${day.date.toISOString().split('T')[0]}: High ${day.high}`);
            if (day.high > maxHigh) {
                maxHigh = day.high;
            }
        });

        console.log(`\nCalculated Max High: ${maxHigh}`);

        const quote = await yahooFinance.quote(symbol);
        console.log(`Current Market Price (CMP): ${quote.regularMarketPrice}`);

    } catch (e) {
        console.error(e);
    }
}

main();
