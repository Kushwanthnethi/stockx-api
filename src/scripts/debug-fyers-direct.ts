import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function debugFyers() {
    const record = await prisma.appConfig.findUnique({
        where: { key: 'fyers_access_token' }
    });

    if (!record) {
        console.error('No Fyers token found');
        return;
    }

    const data = JSON.parse(record.value);
    console.log('Token data from DB:', data.date);
    const token = data.access_token;
    const appId = process.env.FYERS_APP_ID?.replace(/['"]/g, '');

    const symbol = 'NSE:NIFTY50-INDEX';
    const resolution = '1';
    const today = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Requesting history for ${symbol} from ${past} to ${today}`);

    try {
        const url = `https://api-t1.fyers.in/data/history?symbol=${symbol}&resolution=${resolution}&date_format=1&range_from=${past}&range_to=${today}&cont_flag=1`;
        const response = await axios.get(url, {
            headers: {
                'Authorization': `${appId}:${token}`
            }
        });

        const candles = response.data.candles;
        if (candles && candles.length > 0) {
            console.log(`Total candles: ${candles.length}`);

            // Check the last candle
            const last = candles[candles.length - 1];
            const lastDate = new Date(last[0] * 1000);

            console.log(`\nLAST CANDLE:`);
            console.log(`Unix: ${last[0]}`);
            console.log(`Human (UTC): ${lastDate.toUTCString()}`);
            console.log(`Human (ISO): ${lastDate.toISOString()}`);
            console.log(`Human (Local-ish): ${lastDate.toString()}`);

            // Analyze the day transition
            const dayMap = new Map();
            candles.forEach((c: any) => {
                const d = new Date(c[0] * 1000).toISOString().split('T')[0];
                dayMap.set(d, (dayMap.get(d) || 0) + 1);
            });

            console.log('\nDay Distribution (based on ISO/UTC):');
            dayMap.forEach((count, day) => {
                console.log(`${day}: ${count} points`);
            });

            // Check for potential IST issues. If it's 12:35 PM IST, UTC is 7:05 AM.
            // If the market opened at 9:15 AM IST, UTC is 3:45 AM.
            // All points should be within '2026-03-02'.

        } else {
            console.log('No candles returned:', response.data);
        }
    } catch (err: any) {
        console.error('Error:', err.response?.data || err.message);
    }

    await prisma.$disconnect();
}

debugFyers();
