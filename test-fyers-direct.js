const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { fyersModel } = require('fyers-api-v3');
require('dotenv').config();

async function main() {
    try {
        console.log("1. Checking DB for Token");
        let tokenStr = null;

        // Try exact key first
        let record = await prisma.appConfig.findUnique({ where: { key: 'fyers_access_token' } });
        if (record) {
            console.log("Found key: 'fyers_access_token'");
            tokenStr = record.value;
        } else {
            record = await prisma.appConfig.findUnique({ where: { key: 'FYERS_ACCESS_TOKEN' } });
            if (record) {
                console.log("Found key: 'FYERS_ACCESS_TOKEN'");
                tokenStr = record.value;
            }
        }

        if (!tokenStr) {
            console.log("❌ No token found in Database under either key.");
            return;
        }

        console.log("2. Parsing Token String");
        let activeToken = null;
        try {
            const parsed = JSON.parse(tokenStr);
            activeToken = parsed.access_token;
            console.log("✅ Parsed JSON format safely.");
        } catch (e) {
            console.log("⚠️ Token was not JSON, assuming raw string.");
            activeToken = tokenStr;
        }

        console.log(`Active Token String (First 20 chars): ${activeToken.substring(0, 20)}...`);

        console.log("3. Initializing Fyers Model with Token");
        const appId = process.env.FYERS_APP_ID || '';
        const fyers = new fyersModel();
        fyers.setAppId(appId);
        fyers.setAccessToken(activeToken);

        console.log("4. Fetching Reliance History as Test");
        const response = await fyers.getHistory({
            symbol: 'NSE:RELIANCE-EQ',
            resolution: '1D',
            date_format: '1',
            range_from: '2025-01-01',
            range_to: '2025-02-01',
            cont_flag: '1',
        });

        console.log("Response:", response.s === 'ok' ? '✅ SUCCESS' : '❌ FAILED');
        if (response.s !== 'ok') {
            console.log(response);
        } else {
            console.log(`Received ${response.candles.length} history candles.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
