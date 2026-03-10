import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// @ts-ignore
import { SmartAPI } from 'smartapi-javascript';
// @ts-ignore
const { TOTP } = require("totp-generator");

async function bootstrap() {
    console.log('--- Raw Angel One Auth Test ---');
    console.log(`API Key: ${process.env.ANGEL_API_KEY ? 'Set' : 'Missing'}`);
    console.log(`Secret Key: ${process.env.ANGEL_SECRET_KEY ? 'Set' : 'Missing'}`);
    console.log(`Client ID: ${process.env.ANGEL_CLIENT_ID ? 'Set' : 'Missing'}`);
    console.log(`PIN: ${process.env.ANGEL_PIN ? 'Set' : 'Missing'}`);
    console.log(`TOTP Secret: ${process.env.ANGEL_TOTP_SECRET ? 'Set' : 'Missing'}`);

    const smartApi = new SmartAPI({
        api_key: process.env.ANGEL_API_KEY,
    });

    try {
        const { otp: totp } = await TOTP.generate(process.env.ANGEL_TOTP_SECRET);
        console.log('Generated TOTP:', totp);

        console.log('Attempting login logic...');
        const result = await smartApi.generateSession(
            process.env.ANGEL_CLIENT_ID,
            process.env.ANGEL_PIN,
            totp
        );

        if (result.status) {
            console.log('✅ Login Successful!');
            console.log('JWT Token (first 20 chars):', result.data.jwtToken.substring(0, 20) + '...');
            console.log('Feed Token (first 20 chars):', result.data.feedToken.substring(0, 20) + '...');
        } else {
            console.log('❌ Login Failed.', result.message || JSON.stringify(result));
        }
    } catch (e: any) {
        console.error('❌ Exception during login:', e.message);
    }
}

bootstrap();
