
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { Cron } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class StockOfTheWeekService implements OnModuleInit {
    private readonly logger = new Logger(StockOfTheWeekService.name);
    private genAI: GoogleGenerativeAI;

    constructor(
        private prisma: PrismaService,
        private stocksService: StocksService,
    ) {
        // Robust sanitization: remove whitespace AND quotes (User error common in Env Vars)
        const rawKey = process.env.GEMINI_API_KEY || "";
        const apiKey = rawKey.replace(/["']/g, "").trim();

        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.logger.log(`AI Initialized with Key: ${apiKey.substring(0, 5)}... (Length: ${apiKey.length})`);
        } else {
            this.logger.warn('GEMINI_API_KEY not found. AI features will be disabled.');
        }
    }

    async onModuleInit() {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (apiKey) {
            const masked = apiKey.length > 8 ? apiKey.substring(0, 8) + '...' : '***';
            this.logger.log(`Using API Key starting with: ${masked}`);
        }

        // Debug: List available models to verify connectivity and key permissions
        if (this.genAI) {
            try {
                const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent("Test");
                await result.response;
                this.logger.log("✅ Startup AI Verification Passed: gemini-1.5-flash is accessible.");
            } catch (e: any) {
                this.logger.error(`❌ Startup AI Verification Failed: ${e.message}`);
                // Try to infer issue
                if (e.message.includes("404")) this.logger.error("-> Hint: Project API not enabled. Go to https://aistudio.google.com/app/apikey to ensure you have the right key type.");
            }
        }

        // Auto-seed on startup if empty
        const latest = await this.prisma.stockOfTheWeek.findFirst({
            orderBy: { weekStartDate: 'desc' }
        });

        if (!latest || (latest.narrative && latest.narrative.length < 200)) {
            this.logger.log('Stock of the Week missing or has incomplete narrative. Running selection/repair...');
            setTimeout(() => this.handleWeeklySelection(), 5000);
        }
    }

    // Run every Sunday at 12:00 PM
    @Cron('0 12 * * 0')
    async handleWeeklySelection() {
        this.logger.log('Starting weekly stock selection process...');
        await this.selectStockOfTheWeek();
    }

    async selectStockOfTheWeek() {
        try {
            // 1. Fetch Universe (Nifty 50 + Others)
            // For now, we use the stocks already in our DB or fetch a fresh batch
            const allStocks = await this.stocksService.findAll();

            // Filter for valid data
            const candidates = allStocks.filter(s =>
                s.currentPrice !== null &&
                s.marketCap !== null &&
                s.peRatio !== null &&
                s.returnOnEquity !== null &&
                s.high52Week !== null &&
                s.changePercent !== null
            ) as (typeof allStocks[0] & {
                currentPrice: number;
                marketCap: number;
                peRatio: number;
                returnOnEquity: number;
                high52Week: number;
                changePercent: number;
            })[];

            if (candidates.length === 0) {
                this.logger.warn('No valid candidates found for Stock of the Week.');
                return;
            }

            // 2. Score Candidates
            const scored = candidates.map(stock => {
                const score = this.calculateConvictionScore(stock);
                return { ...stock, score };
            });

            // Sort by score desc
            scored.sort((a, b) => b.score - a.score);

            const topPick = scored[0];
            this.logger.log(`Top pick selected: ${topPick.symbol} with score ${topPick.score}`);

            // 3. Generate Narrative
            const narrative = await this.generateNarrative(topPick);

            // 4. Save to DB
            // Calculate the Sunday of the current week (Start of Week)
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
            const diff = today.getDate() - dayOfWeek;
            const sundayDate = new Date(today.setDate(diff));
            sundayDate.setHours(0, 0, 0, 0);

            await this.prisma.stockOfTheWeek.upsert({
                where: { weekStartDate: sundayDate },
                update: {
                    stockSymbol: topPick.symbol,
                    convictionScore: topPick.score,
                    narrative: narrative,
                    priceAtSelection: topPick.currentPrice,
                    targetPrice: topPick.currentPrice * 1.15,
                    stopLoss: topPick.currentPrice * 0.90,
                },
                create: {
                    weekStartDate: sundayDate,
                    stockSymbol: topPick.symbol,
                    convictionScore: topPick.score,
                    narrative: narrative,
                    priceAtSelection: topPick.currentPrice,
                    targetPrice: topPick.currentPrice * 1.15,
                    stopLoss: topPick.currentPrice * 0.90,
                }
            });

            this.logger.log(`Stock of the Week published: ${topPick.symbol}`);
            return topPick;

        } catch (error) {
            this.logger.error('Failed to select Stock of the Week', error);
            throw error;
        }
    }

    private calculateConvictionScore(stock: any): number {
        let score = 50; // Base score

        // Fundamentals (40%)
        if (stock.returnOnEquity > 15) score += 10;
        if (stock.returnOnEquity > 20) score += 5;
        if (stock.profitMargins > 0.15) score += 10;
        if (stock.revenueGrowth > 0.10) score += 5;

        // Valuation (30%)
        // Assuming sector PE generic check (e.g. < 25 is good, but varies by sector)
        if (stock.peRatio < 25 && stock.peRatio > 0) score += 10;
        if (stock.pegRatio && stock.pegRatio < 1.5) score += 10;

        // Momentum / Tech (30%)
        if (stock.currentPrice > stock.high52Week * 0.9) score += 10; // Near High
        if (stock.changePercent > 0) score += 5;

        // Cap at 99
        return Math.min(Math.floor(score), 99);
    }

    private async generateNarrative(stock: any): Promise<string> {
        if (!this.genAI) return "AI Narrative unavailable (Missing Key).";

        const prompt = `
        Act as a senior equity research analyst for the Indian Stock Market (NIFTY 50 universe).
        Write a comprehensive, deep-dive "Investment Thesis" for ${stock.companyName} (${stock.symbol}).
        
        Key Data Points:
        - Current Price: ₹${stock.currentPrice}
        - P/E Ratio: ${stock.peRatio ? stock.peRatio.toFixed(2) : 'N/A'} (Sector Avg: ~25)
        - ROE: ${stock.returnOnEquity ? (stock.returnOnEquity * 100).toFixed(2) : 'N/A'}%
        - Market Cap: ₹${(stock.marketCap / 10000000).toFixed(2)} Crores
        - 52W High: ₹${stock.high52Week}
        - Sector: ${stock.sector || 'N/A'}
        
        Your analysis must be structured, professional, and trustworthy. Do not use emojis or marketing fluff.
        
        Structure your response exactly as follows (keep the headers):
        
        1. **Investment Rationale**
        Analyze the company's competitive advantage, recent financial performance, and why it is a compelling buy right now. Mention the ROE and Valuation specifically.
        
        2. **Technical Setup**
        Comment on the price action relative to 52-week highs and momentum (based on the price change).
        
        3. **Key Risks**
        Identify 1-2 critical risks (regulatory, sector-specific, or valuation concerns).
        
        4. **The Verdict**
        A clear, decisive concluding statement on why this is the Stock of the Week.
        
        Keep the tone institutional-grade (like detailed brokerage reports). Total length: 300-400 words.
      `;

        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];

        for (const modelName of modelsToTry) {
            try {
                this.logger.log(`Attempting generation with model: ${modelName}`);
                const model = this.genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                if (text && text.length > 50) return text;
            } catch (e: any) {
                this.logger.warn(`Model ${modelName} failed: ${e.message}`);
                // Continue to next model
            }
        }

        this.logger.error("AI Generation failed completely (all models attempted).");
        return `Strong fundamental pick in the ${stock.sector} sector with solid ROE of ${(stock.returnOnEquity * 100).toFixed(1)}%.`;
    }

    async getLatestPick() {
        return this.prisma.stockOfTheWeek.findFirst({
            orderBy: { weekStartDate: 'desc' },
            include: { stock: true }
        });
    }

    async getArchive() {
        return this.prisma.stockOfTheWeek.findMany({
            orderBy: { weekStartDate: 'desc' },
            include: { stock: true },
            skip: 1 // Skip the latest one (current)
        });
    }
}
