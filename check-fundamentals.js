const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance();

async function run() {
    const symbol = 'RELIANCE.NS';
    console.log(`Fetching fundamentals for ${symbol}...`);
    try {
        const result = await yf.quoteSummary(symbol, {
            modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
        });

        console.log('--- Financial Data ---');
        console.log('ROE:', result.financialData.returnOnEquity);
        console.log('ROA:', result.financialData.returnOnAssets);
        console.log('Revenue Growth:', result.financialData.revenueGrowth);
        console.log('Gross Margins:', result.financialData.grossMargins);
        console.log('EBITDA Margins:', result.financialData.ebitdaMargins);

        console.log('--- Key Statistics ---');
        console.log('Book Value:', result.defaultKeyStatistics.bookValue);
        console.log('Price/Book:', result.defaultKeyStatistics.priceToBook);
        console.log('Trailing PE:', result.summaryDetail.trailingPE);
        console.log('Dividend Yield:', result.summaryDetail.dividendYield);

        // ROCE is typically EBIT / (Total Assets - Current Liabilities)
        // Yahoo might not give it directly, we might check if we can calc it or if it's hidden.

    } catch (e) {
        console.error('Fetch failed:', e.message);
    }
}

run();
