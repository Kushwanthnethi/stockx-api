import { YahooFinanceService } from './src/stocks/yahoo-finance.service';
// @ts-ignore
import Parser = require('rss-parser');

async function debugNews() {
    const symbol = 'RELIANCE.NS';
    const companyName = 'Reliance Industries';
    const parser = new Parser();

    // 1. Current Approach: yahooFinance.search(symbol.replace('.NS', ''))
    console.log('--- 1. Current Approach (Yahoo Search with ticker prefix) ---');
    try {
        const yf = require('yahoo-finance2').default;
        const res1 = await yf.search(symbol.replace('.NS', ''), { newsCount: 5 });
        console.log(`Found ${res1.news?.length || 0} items.`);
        res1.news?.forEach((n: any, i: number) => console.log(`${i + 1}. ${n.title} (${n.publisher})`));
    } catch (e) { console.error(e); }

    // 2. Ticker Search: yahooFinance.search(symbol)
    console.log('\n--- 2. Ticker Search (Yahoo Search with full ticker) ---');
    try {
        const yf = require('yahoo-finance2').default;
        const res2 = await yf.search(symbol, { newsCount: 5 });
        console.log(`Found ${res2.news?.length || 0} items.`);
        res2.news?.forEach((n: any, i: number) => console.log(`${i + 1}. ${n.title} (${n.publisher})`));
    } catch (e) { console.error(e); }

    // 3. Company Name Search: yahooFinance.search(companyName)
    console.log('\n--- 3. Company Name Search (Yahoo Search) ---');
    try {
        const yf = require('yahoo-finance2').default;
        const res3 = await yf.search(companyName, { newsCount: 5 });
        console.log(`Found ${res3.news?.length || 0} items.`);
        res3.news?.forEach((n: any, i: number) => console.log(`${i + 1}. ${n.title} (${n.publisher})`));
    } catch (e) { console.error(e); }

    // 4. Google News RSS (Ticker)
    console.log('\n--- 4. Google News RSS (Ticker) ---');
    try {
        const url = `https://news.google.com/rss/search?q=${symbol}+stock&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(url);
        console.log(`Found ${feed.items?.length || 0} items.`);
        feed.items?.slice(0, 5).forEach((n: any, i: number) => console.log(`${i + 1}. ${n.title}`));
    } catch (e) { console.error(e); }

    // 5. Google News RSS (Company Name)
    console.log('\n--- 5. Google News RSS (Company Name) ---');
    try {
        const url = `https://news.google.com/rss/search?q=${companyName}+stock+news&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(url);
        console.log(`Found ${feed.items?.length || 0} items.`);
        feed.items?.slice(0, 5).forEach((n: any, i: number) => console.log(`${i + 1}. ${n.title}`));
    } catch (e) { console.error(e); }
}

debugNews();
