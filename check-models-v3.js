
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = "AIzaSyBXcUaJWyv88d2nu6PqLf26S_P8BdxlR7w";

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    console.log("-----------------------------------------");
    console.log("Checking gemini-1.5-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-1.5-flash");
    } catch (e) {
        console.log("Failed gemini-1.5-flash. Error Name: ", e.name);
        console.log("Error Message: ", e.message);
    }

    console.log("-----------------------------------------");
    console.log("Checking gemini-1.5-flash-001...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-1.5-flash-001");
    } catch (e) {
        console.log("Failed gemini-1.5-flash-001. Error Name: ", e.name);
        console.log("Error Message: ", e.message);
    }

    console.log("-----------------------------------------");
    console.log("Checking models/gemini-1.5-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
        const result = await model.generateContent("Hello");
        console.log("Success with models/gemini-1.5-flash");
    } catch (e) {
        console.log("Failed models/gemini-1.5-flash. Error Name: ", e.name);
        console.log("Error Message: ", e.message);
    }

    console.log("-----------------------------------------");
    console.log("Checking gemini-2.0-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent("Hello");
        console.log("Success with gemini-2.0-flash");
    } catch (e) {
        console.log("Failed gemini-2.0-flash. Error Name: ", e.name);
        console.log("Error Message: ", e.message);
    }
}

listModels();
