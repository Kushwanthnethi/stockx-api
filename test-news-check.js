const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance();

async function checkNews() {
    try {
        console.log('Fetching news for "India Stock Market"...');
        const result = await yf.search('India Stock Market', { newsCount: 5 });
        console.log('News items found:', result.news ? result.news.length : 0);
        if (result.news && result.news.length > 0) {
            console.log('Sample Headline:', result.news[0].title);
            console.log('Sample Link:', result.news[0].link);
            console.log('Sample Time:', new Date(result.news[0].providerPublishTime * 1000).toString());
        } else {
            console.log('No news found.');
        }
    } catch (e) {
        console.error('News fetch failed:', e);
    }
}

checkNews();
