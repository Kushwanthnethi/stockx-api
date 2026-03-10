
const yahooFinance = new (require('yahoo-finance2').default)();

async function debugChart() {
    try {
        const symbol = '20MICRONS.NS';
        const now = Math.floor(Date.now() / 1000);
        const yesterday = now - (24 * 60 * 60 * 4); // 4 days back
        const result = await yahooFinance.chart(symbol, {
            interval: '1m',
            period1: yesterday,
            period2: now
        });

        console.log(`Results for ${symbol}: ${result.quotes.length} points`);
        console.log('First 20 points:');
        console.log(result.quotes.slice(0, 20));
        console.log('Last 20 points:');
        console.log(result.quotes.slice(-20));

        const validPrices = result.quotes.map((q: any) => q.close).filter((p: any) => p !== null && p !== undefined);
        const minPrice = Math.min(...validPrices);
        const maxPrice = Math.max(...validPrices);
        console.log(`Min Price: ${minPrice}, Max Price: ${maxPrice}`);

        const lowerOutliers = result.quotes.filter((q: any) => q.close < 100 && q.close !== null);
        console.log(`Outliers < 100: ${lowerOutliers.length}`);
        if (lowerOutliers.length > 0) {
            console.log('Sample outliers:', lowerOutliers.slice(0, 10));
        }

        const nullQuotes = result.quotes.filter((q: any) => q.close === null || q.close === undefined);
        console.log(`Summary: Total=${result.quotes.length}, Nulls=${nullQuotes.length}`);

        if (nullQuotes.length > 0) {
            console.log('First 5 null quotes:');
            console.log(nullQuotes.slice(0, 5));
        }

        const zeroQuotes = result.quotes.filter((q: any) => q.close === 0);
        console.log(`Summary: Zeros=${zeroQuotes.length}`);

    } catch (err) {
        console.error(err);
    }
}

debugChart();
