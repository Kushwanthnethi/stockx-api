import yahooFinance from 'yahoo-finance2';

async function test() {
    const symbol = 'LICI.NS';
    try {
        console.log(`Fetching Balance Sheet for ${symbol}...`);
        const data = await yahooFinance.quoteSummary(symbol, {
            modules: ['balanceSheetHistory', 'financialData', 'defaultKeyStatistics']
        }) as any;

        console.log('--- BALANCE SHEET ---');
        console.log(JSON.stringify(data.balanceSheetHistory, null, 2));

        console.log('--- FINANCIAL DATA ---');
        console.log(JSON.stringify(data.financialData, null, 2));

    } catch (error: any) {
        console.error(`FAILED: ${error.message}`);
    }
}

test();
