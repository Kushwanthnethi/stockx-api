import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from '../stocks/stocks.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class VerdictsService implements OnModuleInit {
    private readonly logger = new Logger(VerdictsService.name);
    private genAI: GoogleGenerativeAI;

    // Define constants for batch processing
    private readonly BATCH_SIZE = 5;

    constructor(
        private prisma: PrismaService,
        private stocksService: StocksService
    ) {
        const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.replace(/["']/g, "").trim() : "";
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        } else {
            this.logger.warn('GEMINI_API_KEY not found. AI verdicts will be disabled.');
        }
    }

    async onModuleInit() {
        // Optional: Check if we have data on startup, if not, maybe trigger?
        // For now, we strictly follow the cron schedule or manual trigger.
    }

    // Run every Sunday at 3:00 AM (Weekly)
    // Using CronExpression.EVERY_WEEKEND (technically runs Sat/Sun, but we can be specific)
    // '0 3 * * 0' = 3:00 AM every Sunday
    @Cron('0 3 * * 0')
    async handleWeeklyRefresh() {
        this.logger.log('Starting weekly verdict authentication...');
        await this.generateVerdicts('LARGE_CAP');
        await this.generateVerdicts('MID_CAP');
        this.logger.log('Weekly verdict generation completed.');
    }

    async getVerdicts(category: string) {
        return this.prisma.stockVerdict.findMany({
            where: { category },
            orderBy: { convictionScore: 'desc' },
            include: { stock: true }
        });
    }

    async forceRefresh() {
        this.logger.log('Manual refresh triggered.');
        // Run in background to not block HTTP request
        this.generateVerdicts('LARGE_CAP');
        this.generateVerdicts('MID_CAP');
        return { message: 'Refresh triggered in background' };
    }

    private async generateVerdicts(category: 'LARGE_CAP' | 'MID_CAP') {
        try {
            this.logger.log(`Generating verdicts for ${category}...`);

            // 1. Select Universe
            let stocks = [];
            if (category === 'LARGE_CAP') {
                // Top 20 by Market Cap
                stocks = await this.prisma.stock.findMany({
                    orderBy: { marketCap: 'desc' },
                    take: 20
                });
            } else {
                // Mid Caps (Approx Rank 50-150)
                // Since we don't have rank, we skip 50 and take 30
                stocks = await this.prisma.stock.findMany({
                    orderBy: { marketCap: 'desc' },
                    skip: 50,
                    take: 30
                });
            }

            // 2. Process in Batches
            for (let i = 0; i < stocks.length; i += this.BATCH_SIZE) {
                const batch = stocks.slice(i, i + this.BATCH_SIZE);
                this.logger.log(`Processing batch ${i / this.BATCH_SIZE + 1} for ${category}...`);

                await Promise.all(batch.map(stock => this.processStock(stock, category)));

                // Rate limit safety
                await new Promise(r => setTimeout(r, 2000));
            }

            this.logger.log(`Completed ${category} generation.`);

        } catch (e) {
            this.logger.error(`Failed to generate verdicts for ${category}`, e);
        }
    }

    private async processStock(stock: any, category: string) {
        if (!this.genAI) return;

        try {
            // Get fresh news
            const news = await this.stocksService.getStockNews(stock.symbol);
            const topNews = news.slice(0, 3).map((n: any) => `- ${n.title}`).join('\n');

            const prompt = `
            Analyze this Indian stock: ${stock.symbol} (${stock.companyName}).
            Category: ${category}
            
            Financials:
            - Price: ${stock.currentPrice}
            - PE Ratio: ${stock.peRatio}
            - ROE: ${stock.returnOnEquity}
            - Market Cap: ${stock.marketCap}
            
            Recent News:
            ${topNews || "No recent major news."}
            
            Task:
            Generate a concise investment verdict for a retail investor.
            Format as JSON:
            {
                "verdict": "BUY" | "SELL" | "HOLD" | "WAIT",
                "convictionScore": 0-100 (integer),
                "headline": "Punchy 5-7 word headline",
                "rationale": "2 sentences explaining why. Focus on valuation and growth.",
                "catalyst": "One specific trigger (e.g. Q3 Results, Sector Rotation)"
            }
            `;

            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });

            // Generate
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const data = JSON.parse(responseText);

            // Save
            await this.prisma.stockVerdict.upsert({
                where: {
                    stockId_category: {
                        stockId: stock.symbol,
                        category: category
                    }
                },
                update: {
                    verdict: data.verdict,
                    convictionScore: data.convictionScore,
                    headline: data.headline,
                    rationale: data.rationale,
                    catalyst: data.catalyst,
                    updatedAt: new Date()
                },
                create: {
                    stockId: stock.symbol,
                    category: category,
                    verdict: data.verdict,
                    convictionScore: data.convictionScore,
                    headline: data.headline,
                    rationale: data.rationale,
                    catalyst: data.catalyst,
                }
            });

        } catch (e) {
            this.logger.warn(`Failed to process verdict for ${stock.symbol}: ${e.message}`);
        }
    }
}
