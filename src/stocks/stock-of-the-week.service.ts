
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
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        } else {
            this.logger.warn('GEMINI_API_KEY not found. AI features will be disabled.');
        }
    }

    async onModuleInit() {
        // Auto-seed on startup if empty
        const count = await this.prisma.stockOfTheWeek.count();
        if (count === 0) {
            this.logger.log('No Stock of the Week found. Running initial selection...');
            // Delay slightly to ensure DB connection
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
            // Check if we already have a pick for this week (Sunday)
            const today = new Date();
            const sundayDate = new Date(today);
            sundayDate.setHours(0, 0, 0, 0);
            // Adjust to the Sunday of this week (if today is Sunday, usage is correct, else find prev/next Sunday logic)
            // Since this runs on Sunday, today matches. 
            // If manually running, we might want to align to 'Coming Sunday' or 'Last Sunday'.
            // Let's assume the "Week Start Date" is the date of publication.

            await this.prisma.stockOfTheWeek.create({
                data: {
                    weekStartDate: sundayDate,
                    stockSymbol: topPick.symbol,
                    convictionScore: topPick.score,
                    narrative: narrative,
                    priceAtSelection: topPick.currentPrice,
                    // Simple targets for now
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

        try {
            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
        Act as a professional financial analyst for the Indian Stock Market.
        Write a convincing "Stock of the Week" thesis for ${stock.companyName} (${stock.symbol}).
        
        Key Data:
        - Price: ₹${stock.currentPrice}
        - PE Ratio: ${stock.peRatio}
        - ROE: ${(stock.returnOnEquity * 100).toFixed(2)}%
        - Market Cap: ₹${(stock.marketCap / 10000000).toFixed(2)} Crores
        - Sector: ${stock.sector || 'N/A'}
        - Description: ${stock.description?.substring(0, 200)}...

        Structure:
        1. **The Opportunity**: Why now? (Brief hook)
        2. **Key Drivers**: Mention 2-3 strong fundamental points (Growth, Margins, etc).
        3. **Risks**: One key risk to watch.
        4. **Verdict**: A confident concluding sentence.

        Tone: Professional, calm, insightful. No hype. Max 250 words.
      `;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (e) {
            this.logger.error("AI Generation failed", e);
            return `Strong fundamental pick in the ${stock.sector} sector with solid ROE of ${(stock.returnOnEquity * 100).toFixed(1)}%.`;
        }
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
