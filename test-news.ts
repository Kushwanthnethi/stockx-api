import yahooFinance from 'yahoo-finance2';

async function testNews() {
    try {
        const result = await yahooFinance.search('India Stock Market', { newsCount: 5 });
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(error);
    }
}

testNews();
