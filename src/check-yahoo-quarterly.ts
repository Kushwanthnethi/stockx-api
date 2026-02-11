async function checkQuarterly() {
    const symbol = 'TCS.NS';
    console.log(`Checking data for ${symbol}...`);
    try {
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass: any = pkg.default || pkg;

        const yf = new YahooFinanceClass();

        // This is the key for some versions/setups
        if (yf.setGlobalConfig) {
            yf.setGlobalConfig({
                validation: { logErrors: false },
                suppressNotices: ['yahooSurvey']
            });
        }

        const res = await yf.fundamentalsTimeSeries(symbol, {
            period1: '2024-01-01',
            module: 'financials',
            type: 'quarterly'
        }, { validate: false });

        console.log('--- SUCCESS ---');
        console.log(`Found ${res.length} quarters.`);
        if (res.length > 0) {
            const latest = res[res.length - 1];
            console.log('Mapping Check:');
            console.log({
                date: latest.date,
                매출: latest.totalRevenue, // Sales
                영업이익: latest.operatingIncome, // Operating Profit
                이자비용: latest.interestExpense, // Interest
                세전이익: latest.pretaxIncome, // PBT
                당기순이익: latest.netIncome // Net Profit
            });
            console.log('Full Keys:', Object.keys(latest));
        }

    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.result) {
            console.log('Partial result available from error!');
            const res = error.result;
            if (res && res.length > 0) {
                console.log('Latest Data Point from partial:', JSON.stringify(res[res.length - 1], null, 2));
            }
        }
    }
}

checkQuarterly();
