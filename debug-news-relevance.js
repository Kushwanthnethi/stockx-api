const Parser = require('rss-parser');
const axios = require('axios');

async function debugNews() {
    const symbol = 'RELIANCE.NS';
    const companyName = 'Reliance Industries';
    const parser = new Parser();

    // 1. Google News RSS (Ticker)
    console.log('--- 1. Google News RSS (Ticker: RELIANCE.NS) ---');
    try {
        const url = `https://news.google.com/rss/search?q=${symbol}+stock&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(url);
        console.log(`Found ${feed.items?.length || 0} items.`);
        feed.items?.slice(0, 5).forEach((n, i) => console.log(`${i + 1}. ${n.title} (${n.pubDate})`));
    } catch (e) { console.error(e.message); }

    // 2. Google News RSS (Company Name)
    console.log('\n--- 2. Google News RSS (Company Name: Reliance Industries) ---');
    try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(companyName)}+stock+news&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(url);
        console.log(`Found ${feed.items?.length || 0} items.`);
        feed.items?.slice(0, 5).forEach((n, i) => console.log(`${i + 1}. ${n.title} (${n.pubDate})`));
    } catch (e) { console.error(e.message); }

    // 3. Yahoo Finance Search (if we can mock it here easily)
    // For now let's just stick to Google News RSS as it's the most likely candidate for "better relevance"
}

debugNews();
