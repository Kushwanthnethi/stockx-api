
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { Cron } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { AIConfigService } from './ai-config.service';

@Injectable()
export class StockOfTheWeekService implements OnModuleInit {
    private readonly logger = new Logger(StockOfTheWeekService.name);

    constructor(
        private prisma: PrismaService,
        private stocksService: StocksService,
        private aiConfig: AIConfigService
    ) { }

    async onModuleInit() {
        this.logger.log(`AI Ready: ${this.aiConfig.activeKeyCount} keys active.`);

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

    private async generateNarrative(stock: any): Promise<string> {
        // Legacy method kept for interface compatibility if needed, but main logic is now inside decideWinnerWithAI
        return "Legacy narrative generation called directly. This should not happen in new flow.";
    }

    async selectStockOfTheWeek() {
        try {
            // 1. Fetch Universe (Nifty 50 + Others)
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

            // 2. Score & Shortlist Finalists
            const scored = candidates.map(stock => {
                const score = this.calculateConvictionScore(stock);
                return { ...stock, score };
            });

            // Sort by score desc and take TOP 5
            scored.sort((a, b) => b.score - a.score);
            const finalists = scored.slice(0, 5);

            this.logger.log(`Top 5 Finalists Identified: ${finalists.map(f => f.symbol).join(', ')}`);

            // 3. AI Decision Phase
            let winningPick;
            let finalNarrative;
            let finalScore;

            if (!this.aiConfig.isAllExhausted) {
                const decision = await this.decideWinnerWithAI(finalists);
                if (decision) {
                    winningPick = finalists.find(f => f.symbol === decision.symbol) || finalists[0];
                    finalNarrative = decision.narrative;
                    finalScore = decision.score || winningPick.score;
                    this.logger.log(`🤖 AI Overruled Math. Winner: ${winningPick.symbol} (Score: ${finalScore})`);
                } else {
                    this.logger.warn("AI Decision failed. Fallback to #1 Math Pick.");
                    winningPick = finalists[0];
                    // Generate basic narrative as fallback
                    finalNarrative = `Strong fundamental pick in the ${winningPick.sector} sector with solid ROE of ${(winningPick.returnOnEquity * 100).toFixed(1)}%.`;
                    finalScore = winningPick.score;
                }
            } else {
                winningPick = finalists[0];
                finalNarrative = `Strong fundamental pick in the ${winningPick.sector} sector with solid ROE of ${(winningPick.returnOnEquity * 100).toFixed(1)}% (AI Unavailable).`;
                finalScore = winningPick.score;
            }

            // 4. Save to DB
            const today = new Date();
            const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
            const diff = today.getDate() - dayOfWeek;
            const sundayDate = new Date(today.setDate(diff));
            sundayDate.setHours(0, 0, 0, 0);

            await this.prisma.stockOfTheWeek.upsert({
                where: { weekStartDate: sundayDate },
                update: {
                    stockSymbol: winningPick.symbol,
                    convictionScore: finalScore,
                    narrative: finalNarrative,
                    priceAtSelection: winningPick.currentPrice,
                    targetPrice: winningPick.currentPrice * 1.15,
                    stopLoss: winningPick.currentPrice * 0.90,
                },
                create: {
                    weekStartDate: sundayDate,
                    stockSymbol: winningPick.symbol,
                    convictionScore: finalScore,
                    narrative: finalNarrative,
                    priceAtSelection: winningPick.currentPrice,
                    targetPrice: winningPick.currentPrice * 1.15,
                    stopLoss: winningPick.currentPrice * 0.90,
                }
            });

            this.logger.log(`Stock of the Week published: ${winningPick.symbol}`);
            return winningPick;

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

    private async decideWinnerWithAI(finalists: any[], retryCount = 0): Promise<{ symbol: string, narrative: string, score: number } | null> {
        this.logger.log(`Gathering news for finalists...${retryCount > 0 ? ' (Retry ' + retryCount + ')' : ''}`);

        // Fetch news for all 5 in parallel
        const enrichedFinalists = await Promise.all(finalists.map(async (f) => {
            const news = await this.stocksService.getStockNews(f.symbol);
            const topNews = news.slice(0, 2).map((n: any) => `- ${n.title} (${new Date(n.publishedAt).toLocaleDateString()})`).join('\n');
            return {
                ...f,
                newsSnippet: topNews || "No recent major news."
            };
        }));

        const prompt = `
        Act as a Senior Portfolio Manager for the Indian Stock Market.
        I have mathematically shortlisted 5 strong candidates.
        
        Your Goal: Review their financials AND recent news, then pick the ONE single best stock for a **4-Week Holding Period (approx. 1 Month)**.
        
        THE CANDIDATES:
        ${enrichedFinalists.map(f => `
        [${f.symbol}] ${f.companyName}
        - Price: ₹${f.currentPrice}, Trend: ${f.changePercent > 0 ? '+' : ''}${f.changePercent.toFixed(2)}%
        - PE: ${f.peRatio?.toFixed(1)}, ROE: ${(f.returnOnEquity * 100).toFixed(1)}%
        - Sector: ${f.sector}
        - Recent News/Buzz:
        ${f.newsSnippet}
        `).join('\n------------------------\n')}
        
        INSTRUCTIONS:
        1. Focus on the next 30 days. Look for catalysts (Results, Monthly Expiry trends, Sector rotation) that will play out over a month.
        2. Compare them. Look for "Red Flags" in the news.
        3. Pick the WINNER.
        4. Write a professional "Investment Thesis" for the winner (300 words).
        
        OUTPUT FORMAT (JSON ONLY):
        {
            "winner_symbol": "RELIANCE.NS",
            "conviction_score": 92,
            "thesis_markdown": "1. **Investment Rationale**\n..."
        }
        
        For the thesis_markdown, follow this structure:
        1. **Investment Rationale** (Why this stock beat the others?)
        2. **Technical Setup** (Price action & 30-day outlook)
        3. **Key Risks**
        4. **The Verdict** (Explicitly mention the 4-week horizon)
        `;

        try {
            const model = this.aiConfig.getModel({
                model: "gemini-2.0-flash"
            });

            if (!model) return null;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            this.logger.log(`AI Response: ${responseText.substring(0, 100)}...`);

            const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
            const data = JSON.parse(cleanJson);

            // Validate symbol exists in our list (handle potential AI hallucination of symbol format)
            const matchedStats = finalists.find(f => f.symbol === data.winner_symbol || f.symbol.split('.')[0] === data.winner_symbol.split('.')[0]);

            if (matchedStats && data.thesis_markdown) {
                return {
                    symbol: matchedStats.symbol, // Use our trusted symbol
                    narrative: data.thesis_markdown,
                    score: data.conviction_score || matchedStats.score // Use AI score if reasonable
                };
            }
            return null;

        } catch (e: any) {
            if (e.message?.includes('429') || e.message?.includes('quota')) {
                let delaySeconds = 60;
                try {
                    const retryInfo = e.errorDetails?.find((d: any) => d.details?.some((inner: any) => inner.retryDelay));
                    const detail = retryInfo?.details?.find((inner: any) => inner.retryDelay);
                    if (detail?.retryDelay) {
                        const match = detail.retryDelay.match(/(\d+)s/);
                        if (match) delaySeconds = parseInt(match[1]) + 5;
                    }
                } catch (err) { }

                this.aiConfig.handleQuotaExceeded(delaySeconds);

                // RETRY LOGIC: Try one more time with the new key after a small backoff
                if (retryCount < 1 && !this.aiConfig.isAllExhausted) {
                    this.logger.log("Quota hit during selection. Key rotated. Retrying in 5s...");
                    await this.aiConfig.delay(5000);
                    return this.decideWinnerWithAI(finalists, retryCount + 1);
                }
            } else {
                this.logger.error("AI Decision Making Error", e);
            }
            return null;
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

    async reset() {
        this.logger.warn('Resetting all Stock of the Week data...');
        return this.prisma.stockOfTheWeek.deleteMany({});
    }
}
