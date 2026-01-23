
async function testFinancials(symbol: string) {
    console.log(`Testing Financials for ${symbol}`);
    const pkg = await import('yahoo-finance2');
    const YahooFinance = pkg.default as any;
    const yahooFinance = new YahooFinance();

    try {
        const result = await yahooFinance.quoteSummary(symbol, {
            modules: ['earnings', 'financialData']
        });

        console.log("Earnings Module Present:", !!result.earnings);

        if (result.earnings) {
            console.log("Earnings Chart Quarterly:", JSON.stringify(result.earnings.earningsChart?.quarterly, null, 2));
            console.log("Financials Chart Quarterly:", JSON.stringify(result.earnings.financialsChart?.quarterly, null, 2));
        }

    } catch (e) {
        console.error("Error fetching financials:", e);
    }
}

testFinancials('RELIANCE.NS');
