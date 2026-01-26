
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

async function run() {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) { console.log("NO_KEY"); return; }

    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("Listing models...");

    try {
        // There isn't a direct listModels on genAI instance in basic usage, 
        // usually it's a separate API call, but let's try a simple generation with a fallback model 
        // or just try to trap the specific error better.

        // Actually the SDK has no listModels? 
        // It might be better to just try "gemini-pro" as a fallback.

        const models = ["gemini-1.5-flash", "gemini-1.0-pro", "gemini-pro"];

        for (const m of models) {
            console.log(`TRYING: ${m}`);
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("Test");
                const response = await result.response;
                console.log(`SUCCESS with ${m}`);
                return;
            } catch (e: any) {
                console.log(`FAIL ${m}: ${e.message.substring(0, 50)}`);
            }
        }
    } catch (e: any) {
        console.log("FATAL: " + e.message);
    }
}

run();
