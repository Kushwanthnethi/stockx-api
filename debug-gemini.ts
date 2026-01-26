
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

async function run() {
    const apiKey = process.env.GEMINI_API_KEY || "";
    console.log(`KEY_Start: ${apiKey.substring(0, 5)}...`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        console.log("SENDING_REQ");
        const result = await model.generateContent("Hi");
        const response = await result.response;
        console.log("SUCCESS: " + response.text());
    } catch (e: any) {
        console.log("ERROR_MSG_START");
        console.log(e.message);
        console.log("ERROR_MSG_END");
    }
}

run();
