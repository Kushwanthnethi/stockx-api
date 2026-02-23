import { fyersModel } from 'fyers-api-v3';
import * as fs from 'fs';
import * as path from 'path';

async function testFyersHistory() {
    const tokenFilePath = path.join(process.cwd(), 'fyers_token.json');
    if (!fs.existsSync(tokenFilePath)) {
        console.error('Fyers token not found at:', tokenFilePath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(tokenFilePath, 'utf8'));
    const token = data.access_token;

    // Hardcoded App ID for test if not in env
    const appId = "6H828V9UNK-100";

    const fyers = new fyersModel();
    fyers.setAppId(appId);
    fyers.setAccessToken(token);

    const symbol = 'NSE:RELIANCE-EQ';
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Testing 1D History for ${symbol} from ${yesterday} to ${today}...`);
    try {
        const res1d = await fyers.getHistory({
            symbol,
            resolution: '1',
            date_format: '1',
            range_from: yesterday,
            range_to: today,
            cont_flag: '1',
        });
        console.log('1D History Result:', res1d.s, 'Candles:', res1d.candles?.length || 0);
        if (res1d.candles && res1d.candles.length > 0) {
            console.log('First candle:', res1d.candles[0]);
        }
    } catch (e) {
        console.error('1D Error:', e.message);
    }

    console.log(`\nTesting 1W History for ${symbol} from ${weekAgo} to ${today}...`);
    try {
        const res1w = await fyers.getHistory({
            symbol,
            resolution: '5',
            date_format: '1',
            range_from: weekAgo,
            range_to: today,
            cont_flag: '1',
        });
        console.log('1W History Result:', res1w.s, 'Candles:', res1w.candles?.length || 0);
    } catch (e) {
        console.error('1W Error:', e.message);
    }
}

testFyersHistory();
