
async function test1D(symbol: string) {
    console.log(`Testing 1D for ${symbol}`);
    const pkg = await import('yahoo-finance2');
    const YahooFinance = pkg.default as any;
    const yahooFinance = new YahooFinance();

    const range = '1d';
    const queryOptions: any = {};
    const now = new Date();
    const fromDate = new Date();

    // Mimic the service logic
    fromDate.setDate(now.getDate() - 7);
    queryOptions.interval = '15m'; // Intraday
    queryOptions.period1 = Math.floor(fromDate.getTime() / 1000);
    queryOptions.period2 = Math.floor(now.getTime() / 1000);

    console.log("Query Options:", queryOptions);

    try {
        console.log("Fetching chart data...");
        // Add timeout like in service
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));

        // Use chart instead of historical
        const fetchPromise = yahooFinance.chart(symbol, queryOptions);

        let result = await Promise.race([fetchPromise, timeout]) as any;

        console.log("Chart Result Type:", typeof result);
        if (result) {
            console.log("Has quotes?", !!result.quotes);
            if (result.quotes && result.quotes.length > 0) {
                console.log("First quote:", result.quotes[0]);
                console.log("Last quote:", result.quotes[result.quotes.length - 1]);
                console.log("Count:", result.quotes.length);

                // Test Filtering Logic
                const lastDate = new Date(result.quotes[result.quotes.length - 1].date);
                const lastDateStr = lastDate.toDateString();
                console.log("Last Date Str (Local):", lastDateStr);

                const filtered = result.quotes.filter((q: any) => new Date(q.date).toDateString() === lastDateStr);
                console.log(`Filtered Result Count: ${filtered.length}`);

            } else {
                console.log("No quotes in result");
                console.log("Keys:", Object.keys(result));
            }
        }
    } catch (e) {
        console.error("Error fetching history:", e);
    }
}

test1D('INDUSTOWER.NS');
