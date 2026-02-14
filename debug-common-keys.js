
async function test() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        let yf;
        try { yf = new YahooFinance(); } catch (e) { yf = YahooFinance; }

        const symbols = ['RELIANCE.NS', 'HINDALCO.NS', 'TCS.NS', 'FORTIS.NS'];

        console.log('Checking availability of potential new fields...');

        for (const symbol of symbols) {
            console.log(`\n--- ${symbol} ---`);
            try {
                const summary = await yf.quoteSummary(symbol, {
                    modules: ['incomeStatementHistoryQuarterly']
                }, { validate: false });

                const history = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
                if (history.length > 0) {
                    const q = history[0];
                    const getValue = (val) => (val?.raw !== undefined ? val.raw : val);

                    const revenue = getValue(q.totalRevenue);
                    const costOfRev = getValue(q.costOfRevenue);
                    const grossProfit = getValue(q.grossProfit);
                    const sellingGeneralAdmin = getValue(q.sellingGeneralAdministrative);
                    const netIncome = getValue(q.netIncome);

                    console.log('Revenue:', revenue);
                    console.log('Cost of Revenue:', costOfRev);
                    console.log('Gross Profit:', grossProfit);
                    console.log('SG&A:', sellingGeneralAdmin);

                    // Derived Check
                    if (revenue && netIncome) {
                        console.log('Calculatable Net Margin %:', ((netIncome / revenue) * 100).toFixed(2) + '%');
                    } else {
                        console.log('Calculatable Net Margin %: NOT POSSIBLE');
                    }
                } else {
                    console.log('No quarterly history found.');
                }
            } catch (e) {
                console.log('Error:', e.message);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
