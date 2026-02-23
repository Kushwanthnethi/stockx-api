import { io } from 'socket.io-client';
import { fyersDataSocket } from 'fyers-api-v3';
import * as fs from 'fs';

async function test() {
    const tokenJson = JSON.parse(fs.readFileSync('fyers_token.json', 'utf8'));
    const token = tokenJson.access_token;
    const appId = "6H828V9UNK-100";
    const fullToken = `${appId}:${token}`;

    console.log(`Connecting with AppID: ${appId}`);
    const socket = fyersDataSocket.getInstance(fullToken);

    socket.on('connect', () => {
        console.log('Fyers Connected ✅');
        const symbols = ['NSE:NIFTY50-INDEX', 'NSE:NIFTYBANK-INDEX', 'BSE:SENSEX-INDEX'];
        console.log(`Subscribing to (Lite mode): ${symbols.join(', ')}`);
        socket.subscribe(symbols, false); // Lite mode for indices
    });

    socket.on('message', (msg: any) => {
        if (Array.isArray(msg.data)) {
            msg.data.forEach((item: any) => processMessage(item));
        } else {
            processMessage(msg);
        }
    });

    function processMessage(message: any) {
        const fyersSymbol = message.n || message.symbol || message.s || message.tk || message.ts;
        const price = message.lp || message.last_price || message.iv;

        if (price && fyersSymbol) {
            console.log(`[Socket] Symbol: ${fyersSymbol} | Price: ${price} | Ch: ${message.ch || message.cng} | ChP: ${message.chp || message.nc}`);
        } else {
            // Log other messages if needed
            // console.log('Other Message:', JSON.stringify(message));
        }
    }

    socket.on('error', (err: any) => console.log('Error:', err));
    socket.connect();

    setTimeout(() => {
        console.log('Test finished.');
        process.exit(0);
    }, 20000);
}

test();
