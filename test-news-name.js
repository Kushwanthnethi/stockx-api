
const YahooFinance = require('yahoo-finance2').default;

async function testNews() {
    try {
        const yf = new YahooFinance();

        const name = "KFin Technologies";
        console.log(`\nSearching by name: ${name}`);
        const res2 = await yf.search(name, { newsCount: 3 });
        if (res2.news) {
            res2.news.forEach((n, i) => {
                console.log(`[${i + 1}] ${n.title} (${n.publisher})`);
            });
        } else {
            console.log("No news found for name.");
        }

    } catch (e) {
        console.error(e);
    }
}

testNews();
