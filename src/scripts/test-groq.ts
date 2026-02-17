
import * as dotenv from 'dotenv';
dotenv.config();
import Groq from 'groq-sdk';

async function testGroq() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error("GROQ_API_KEY not found in .env");
        return;
    }
    console.log(`Testing Groq with key: ${apiKey.substring(0, 10)}...`);

    const groq = new Groq({ apiKey });

    try {
        console.log("Sending request to Llama 3...");
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: "Explain the importance of dividends in 5 words.",
                },
            ],
            model: "llama-3.3-70b-versatile",
        });

        console.log("Response:");
        console.log(chatCompletion.choices[0]?.message?.content);
        console.log("✅ Groq Test Passed!");
    } catch (error) {
        console.error("❌ Groq Test Failed:", error);
    }
}

testGroq();
