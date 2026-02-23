import axios from 'axios';
import * as fs from 'fs';
import yahooFinance from 'yahoo-finance2';

async function checkAll() {
    const tokenJson = JSON.parse(fs.readFileSync('fyers_token.json', 'utf8'));
    const token = tokenJson.access_token;

    console.log(`Checking Nifty 50 Price at ${new Date().toLocaleTimeString()}...`);

    // 1. Yahoo
    try {
        const yf: any = new (yahooFinance as any)({ validation: { logErrors: false } });
        const result = await yf.quote('^NSEI');
        console.log(`[Yahoo]  ^NSEI Price: ${result.regularMarketPrice} (${result.regularMarketChangePercent}%)`);
    } catch (e: any) {
        console.log(`[Yahoo]  Error: ${e.message}`);
    }

    // 2. Fyers
    try {
        const fyers = await axios.get(`https://api-t1.fyers.in/data/quotes?symbols=NSE:NIFTY50-INDEX`, {
            headers: { 'Authorization': `I6VDS70P79:${token}` }
        });
        const d = (fyers.data.d[0] as any).v;
        console.log(`[Fyers]  NSE:NIFTY50-INDEX Price: ${d.lp} (${d.chp}%)`);
    } catch (e: any) {
        console.log(`[Fyers]  Error: ${e.message}`);
    }

    // 3. Google (Simple scraper)
    try {
        const res = await axios.get('https://www.google.com/finance/quote/NIFTY_50:INDEXNSE');
        const match = res.data.match(/data-last-price="([^"]+)"/);
        if (match) {
            console.log(`[Google] NIFTY_50 Price: ${match[1]}`);
        } else {
            console.log(`[Google] Scrape failed to find data-last-price`);
        }
    } catch (e: any) {
        console.log(`[Google] Error: ${e.message}`);
    }
}

checkAll();
