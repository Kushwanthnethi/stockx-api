
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // Note: listModels might not be exposed directly on the main class in all versions, 
        // but looking at source/docs usually it's via a model manager or similar.
        // However, simplest test is to try generating with a few common names.

        // Actually, newer SDKs don't expose listModels easily via the top-level class without modelManager which isn't always documented clearly for simple usage.
        // Let's manually try a few known ones.

        const candidates = [
            "gemini-1.5-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro",
            "gemini-pro",
            "gemini-1.0-pro",
            "gemini-2.0-flash-exp",
            "gemini-1.5-flash-001",
            "gemini-1.5-flash-002",
            "gemini-pro-vision",
            "embedding-001",
            "aqa"
        ];


        console.log("Testing models...");

        for (const modelName of candidates) {
            process.stdout.write(`Testing ${modelName}: `);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello.");
                const response = await result.response;
                console.log("SUCCESS");
            } catch (e) {
                console.log("FAILED - " + e.message.split('\n')[0]);
            }
        }

    } catch (error) {
        console.error("Fatal Error:", error);
    }
}

listModels();
