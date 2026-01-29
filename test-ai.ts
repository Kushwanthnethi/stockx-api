import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

async function testAI() {
    const rawKey = process.env.GEMINI_API_KEY || "";
    const key = rawKey.split(',')[0].replace(/["']/g, "").trim();

    if (!key) {
        console.error("No API key found.");
        return;
    }

    console.log(`Testing with key starting with: ${key.substring(0, 8)}...`);

    const modelsToTest = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash"
    ];

    for (const modelName of modelsToTest) {
        try {
            console.log(`\n--- Testing model: ${modelName} ---`);
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello?");
            console.log(`✅ Success with ${modelName}:`, result.response.text());
            break; // Stop if we find a working one
        } catch (e: any) {
            console.error(`❌ Failed with ${modelName}:`, e.message);
        }
    }
}

testAI();
