
import * as dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

async function testModel(modelName: string) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    console.log(`\nTesting: ${modelName}`);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    try {
        const result = await model.generateContent("Say hi");
        const response = await result.response;
        console.log(`PASS: ${modelName} => ${response.text().substring(0, 20)}`);
        return true;
    } catch (e: any) {
        console.log(`FAIL: ${modelName}`);
        // Log short error to avoid tool truncation
        if (e.message) console.log("ERR: " + e.message.substring(0, 60));
        return false;
    }
}

async function run() {
    await testModel("gemini-1.5-flash");
    await testModel("models/gemini-1.5-flash");
    await testModel("gemini-pro");
}

run();
