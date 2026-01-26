
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function fixStockAnalysis() {
    console.log("Starting manual repair of Stock of the Week...");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ CRITICAL: GEMINI_API_KEY not found in .env file.");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // We will get models dynamically inside the try/catch

    try {
        const latest = await prisma.stockOfTheWeek.findFirst({
            orderBy: { weekStartDate: 'desc' },
            include: { stock: true }
        });

        if (!latest) {
            console.error("❌ No Stock of the Week record found to fix.");
            return;
        }

        console.log(`Found active pick: ${latest.stockSymbol}`);

        const stock = latest.stock;
        const prompt = `
        Act as a senior equity research analyst for the Indian Stock Market (NIFTY 50 universe).
        Write a comprehensive, deep-dive "Investment Thesis" for ${latest.stockSymbol}.
        
        Key Data Points:
        - Current Price: ₹${latest.priceAtSelection}
        - ROE: ${stock.returnOnEquity ? (stock.returnOnEquity * 100).toFixed(2) : 'N/A'}%
        - P/E Ratio: ${stock.peRatio}
        - Sector: ${stock.sector}
        
        Structure your response exactly as follows (keep the headers):
        
        1. **Investment Rationale**
        Analyze the company's competitive advantage and why it is a compelling buy.
        
        2. **Technical Setup**
        Comment on the price action and momentum.
        
        3. **Key Risks**
        Identify 1-2 critical risks.
        
        4. **The Verdict**
        A clear, decisive concluding statement.
        
        Keep the tone institutional-grade. Total length: 300-400 words.
        `;

        let narrative = "";
        let usedModel = "gemini-1.5-flash";

        try {
            console.log(`Attempting generation with ${usedModel}...`);
            const model = genAI.getGenerativeModel({ model: usedModel });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            narrative = response.text();
            console.log("✅ AI Generation successful with 1.5-flash!");
        } catch (firstError: any) {
            console.warn(`⚠️ 1.5-flash failed: ${firstError.message}`);
            console.log("Attempting fallback to gemini-pro...");
            usedModel = "gemini-pro";
            try {
                const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
                const resultPro = await modelPro.generateContent(prompt);
                const responsePro = await resultPro.response;
                narrative = responsePro.text();
                console.log("✅ AI Generation successful with gemini-pro!");
            } catch (secondError: any) {
                console.error("❌ All models failed.");
                console.error(secondError.toString());
                return;
            }
        }

        if (narrative && narrative.length > 100) {
            await prisma.stockOfTheWeek.update({
                where: { id: latest.id },
                data: { narrative: narrative }
            });
            console.log("✅ Database updated successfully.");
            console.log("Please REFRESH the website to see the changes.");
        } else {
            console.warn("⚠️ Generated narrative was too short, not updating DB.");
        }

    } catch (error) {
        console.error("Unexpected error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

fixStockAnalysis();
