
const YahooFinance = require('yahoo-finance2').default;

async function searchSymbol() {
    try {
        const yf = new YahooFinance();

        const queries = ['Premier', 'Premier Energies', 'Premier Limited'];

        for (const q of queries) {
            console.log(`\nSearching for: "${q}"`);
            const res = await yf.search(q);
            if (res.quotes) {
                res.quotes.forEach(item => {
                    if (item.symbol.includes('.NS') || item.symbol.includes('.BO')) {
                        console.log(`- [${item.symbol}] ${item.shortname} (${item.longname}) - ${item.typeDisp}`);
                    }
                });
            }
        }

    } catch (e) {
        console.error(e);
    }
}

searchSymbol();
