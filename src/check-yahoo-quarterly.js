const yf = require('yahoo-finance2');
const yahooFinance = yf.default || yf;

async function checkQuarterly() {
    const symbol = 'RELIANCE.NS'; // Use a major stock
    console.log(`Checking data for ${symbol}...`);
    try {
        const result = await yahooFinance.quoteSummary(symbol, {
            modules: ['incomeStatementHistoryQuarterly', 'balanceSheetHistoryQuarterly', 'cashflowStatementHistoryQuarterly', 'defaultKeyStatistics', 'financialData']
        });

        // Check if data exists
        if (result.incomeStatementHistoryQuarterly) {
            const history = result.incomeStatementHistoryQuarterly.incomeStatementHistory;
            if (history && history.length > 0) {
                console.log('--- Latest Quarterly Result ---');
                const latest = history[0];
                console.log(JSON.stringify(latest, null, 2));

                console.log('\n--- Computed Fields for Screener.in ---');
                // Screener.in fields:
                // Sales
                console.log('Sales:', latest.totalRevenue.raw);
                // Expenses = Total Revenue - Operating Profit? Or Cost of Revenue + Operating Expenses?
                // Operating Profit
                console.log('Operating Profit:', latest.operatingIncome.raw);
                // Other Income
                // Interest -> interestExpense
                console.log('Interest:', latest.interestExpense.raw);
                // Depreciation -> ? usually in cash flow or income statement if explicit
                // Profit before tax
                console.log('PBT:', latest.incomeBeforeTax.raw);
                // Net Profit
                console.log('Net Profit:', latest.netIncome.raw);

            } else {
                console.log('incomeStatementHistory is empty.');
            }
        } else {
            console.log('Module incomeStatementHistoryQuarterly returned undefined.');
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

checkQuarterly();
