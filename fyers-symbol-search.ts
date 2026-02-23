
import axios from 'axios';
import * as fs from 'fs';

async function search() {
    const tokenJson = JSON.parse(fs.readFileSync('fyers_token.json', 'utf8'));
    const token = tokenJson.access_token;
    const appId = "I6VDS70P79"; // Found in logs/code previously or .env

    try {
        console.log("Searching for NIFTY symbols...");
        // Fyers doesn't have a direct "search" for indices in Data Socket symbols
        // but we can try common ones and see if they work via Quotes API
        const symbols = [
            'NSE:NIFTY50-INDEX',
            'NSE:NIFTYBANK-INDEX',
            'BSE:SENSEX-INDEX',
            'NSE:NIFTY 50',
            'NSE:NIFTY BANK',
            'BSE:SENSEX'
        ];

        const res = await axios.get(`https://api-t1.fyers.in/data/quotes?symbols=${symbols.join(',')}`, {
            headers: {
                'Authorization': `I6VDS70P79:${token}`
            }
        });

        fs.writeFileSync('fyers_quotes_result.json', JSON.stringify(res.data, null, 2));
        console.log("Quotes Results saved to fyers_quotes_result.json");
    } catch (e: any) {
        console.error("Search failed:", e.response?.data || e.message);
    }
}

search();
