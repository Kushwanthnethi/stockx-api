
async function test() {
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinance = pkg.default || pkg;
        let yf;
        try { yf = new YahooFinance(); } catch (e) { yf = YahooFinance; }

        const symbols = ['HINDALCO.NS', 'RELIANCE.NS', 'IPCALAB.NS'];

        console.log('Checking availability of pre-calculated growth fields...');

        for (const symbol of symbols) {
            console.log(`\n--- ${symbol} ---`);
            try {
                const summary = await yf.quoteSummary(symbol, {
                    modules: ['financialData', 'defaultKeyStatistics']
                }, { validate: false });

                const fd = summary.financialData || {};
                const ks = summary.defaultKeyStatistics || {};

                console.log('Financial Data - Revenue Growth:', fd.revenueGrowth);
                console.log('Financial Data - Earnings Growth:', fd.earningsGrowth);
                console.log('Key Stats - Earnings Quarterly Growth:', ks.earningsQuarterlyGrowth);
                console.log('Key Stats - Net Income To Common:', ks.netIncomeToCommon);

            } catch (e) {
                console.log('Error:', e.message);
            }
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
