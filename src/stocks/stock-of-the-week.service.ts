import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { Cron } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { AIConfigService } from './ai-config.service';

@Injectable()
export class StockOfTheWeekService implements OnModuleInit {
  private readonly logger = new Logger(StockOfTheWeekService.name);

  private getCurrentSundayIST(): Date {
    const now = new Date();
    // IST is UTC + 5:30
    const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const dayOfWeek = istNow.getUTCDay(); // 0 (Sun) to 6 (Sat)
    const date = istNow.getUTCDate();

    // Move to the most recent Sunday
    const sundayDate = new Date(istNow);
    sundayDate.setUTCDate(date - dayOfWeek);
    sundayDate.setUTCHours(0, 0, 0, 0);

    // Convert back to real UTC (subtract the offset)
    return new Date(sundayDate.getTime() - 5.5 * 60 * 60 * 1000);
  }

  constructor(
    private prisma: PrismaService,
    private stocksService: StocksService,
    private aiConfig: AIConfigService,
  ) { }

  async onModuleInit() {
    this.logger.log(`AI Ready: ${this.aiConfig.activeKeyCount} keys active.`);

    // 1. Calculate current week's Sunday
    const currentSunday = this.getCurrentSundayIST();

    // 2. Fetch latest record
    const latest = await this.prisma.stockOfTheWeek.findFirst({
      orderBy: { weekStartDate: 'desc' },
    });

    const isOutdated = !latest || latest.weekStartDate.getTime() < currentSunday.getTime();
    const isIncomplete = latest && latest.narrative && latest.narrative.length < 200;

    if (isOutdated || isIncomplete) {
      this.logger.log(
        `Stock of the Week ${isOutdated ? 'outdated' : 'incomplete'}. Running selection/repair for ${currentSunday.toISOString()}...`,
      );
      // Wait for 5s to ensure everything else is initialized
      setTimeout(() => this.handleWeeklySelection(), 5000);
    }

    // Always run a sync for Max High on startup for active picks
    setTimeout(() => this.syncMaxHigh(), 10000);
  }

  // Run every Sunday at 2:00 AM
  @Cron('0 2 * * 0')
  async handleWeeklySelection() {
    this.logger.log('Starting weekly stock selection process...');
    await this.selectStockOfTheWeek();
  }

  private async generateNarrative(stock: any): Promise<string> {
    // Legacy method kept for interface compatibility if needed, but main logic is now inside decideWinnerWithAI
    return 'Legacy narrative generation called directly. This should not happen in new flow.';
  }

  async selectStockOfTheWeek() {
    try {
      // 1. Fetch Universe (Nifty 50 + Others)
      const [allStocks, recentWinners] = await Promise.all([
        this.stocksService.findAll(),
        this.prisma.stockOfTheWeek.findMany({
          orderBy: { weekStartDate: 'desc' },
          take: 4,
          select: { stockSymbol: true },
        }),
      ]);

      const winnerSymbols = new Set(recentWinners.map((w) => w.stockSymbol));
      this.logger.log(`Excluding ${winnerSymbols.size} recent winners from candidates.`);

      // Filter for valid data
      const candidates = allStocks.filter(
        (s) =>
          s.currentPrice !== null &&
          s.marketCap !== null &&
          s.peRatio !== null &&
          s.returnOnEquity !== null &&
          s.high52Week !== null &&
          s.changePercent !== null &&
          !winnerSymbols.has(s.symbol),
      ) as ((typeof allStocks)[0] & {
        currentPrice: number;
        marketCap: number;
        peRatio: number;
        returnOnEquity: number;
        high52Week: number;
        changePercent: number;
      })[];

      if (candidates.length === 0) {
        this.logger.warn(`No valid candidates found for Stock of the Week. Checked ${allStocks.length} total stocks.`);
        return;
      }
      this.logger.log(`Found ${candidates.length} candidates out of ${allStocks.length} total stocks.`);

      // 2. Score & Shortlist Finalists
      const scored = candidates.map((stock) => {
        const score = this.calculateConvictionScore(stock);
        return { ...stock, score };
      });

      // Sort by score desc and take TOP 5
      scored.sort((a, b) => b.score - a.score);
      const finalists = scored.slice(0, 5);

      this.logger.log(
        `Top 5 Finalists Identified: ${finalists.map((f) => f.symbol).join(', ')}`,
      );

      // 3. AI Decision Phase
      let winningPick;
      let finalNarrative;
      let finalScore;

      this.logger.log(`AI Exhausted Status: ${this.aiConfig.isAllExhausted}. Keys active: ${this.aiConfig.activeKeyCount}`);
      if (!this.aiConfig.isAllExhausted) {
        const decision = await this.decideWinnerWithAI(finalists);
        if (decision) {
          winningPick =
            finalists.find((f) => f.symbol === decision.symbol) || finalists[0];
          finalNarrative = decision.narrative;
          finalScore = decision.score || winningPick.score;
          this.logger.log(
            `🤖 AI Overruled Math. Winner: ${winningPick.symbol} (Score: ${finalScore})`,
          );
        } else {
          this.logger.warn('AI Decision failed. Fallback to #1 Math Pick.');
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
      const sundayDate = this.getCurrentSundayIST();

      await this.prisma.stockOfTheWeek.upsert({
        where: { weekStartDate: sundayDate },
        update: {
          stockSymbol: winningPick.symbol,
          convictionScore: finalScore,
          narrative: finalNarrative,
          priceAtSelection: winningPick.currentPrice,
          maxHigh: winningPick.currentPrice,
          targetPrice: winningPick.currentPrice * 1.15,
          stopLoss: winningPick.currentPrice * 0.9,
        },
        create: {
          weekStartDate: sundayDate,
          stockSymbol: winningPick.symbol,
          convictionScore: finalScore,
          narrative: finalNarrative,
          priceAtSelection: winningPick.currentPrice,
          maxHigh: winningPick.currentPrice,
          targetPrice: winningPick.currentPrice * 1.15,
          stopLoss: winningPick.currentPrice * 0.9,
        },
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
    if (stock.revenueGrowth > 0.1) score += 5;

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

  private async decideWinnerWithAI(
    finalists: any[],
    retryCount = 0,
  ): Promise<{ symbol: string; narrative: string; score: number } | null> {
    this.logger.log(
      `Gathering news for finalists: ${finalists.map(f => f.symbol).join(', ')}...${retryCount > 0 ? ' (Retry ' + retryCount + ')' : ''}`,
    );

    // Fetch news for all 5 in parallel
    const enrichedFinalists = await Promise.all(
      finalists.map(async (f) => {
        this.logger.log(`Fetching news for finalist: ${f.symbol}`);
        const news = await this.stocksService.getStockNews(f.symbol);
        this.logger.log(`Found ${news?.length || 0} news items for ${f.symbol}`);
        const topNews = news
          .slice(0, 2)
          .map(
            (n: any) =>
              `- ${n.title} (${new Date(n.publishedAt).toLocaleDateString()})`,
          )
          .join('\n');
        return {
          ...f,
          newsSnippet: topNews || 'No recent major news.',
        };
      }),
    );

    const prompt = `
        Act as a Senior Portfolio Manager for the Indian Stock Market.
        I have mathematically shortlisted 5 strong candidates.
        
        Your Goal: Review their financials AND recent news, then pick the ONE single best stock for a **4-Week Holding Period (approx. 1 Month)**.
        
        THE CANDIDATES:
        ${enrichedFinalists
        .map(
          (f) => `
        [${f.symbol}] ${f.companyName}
        - Price: ₹${f.currentPrice}, Trend: ${f.changePercent > 0 ? '+' : ''}${f.changePercent.toFixed(2)}%
        - PE: ${f.peRatio?.toFixed(1)}, ROE: ${(f.returnOnEquity * 100).toFixed(1)}%
        - Sector: ${f.sector}
        - Recent News/Buzz:
        ${f.newsSnippet}
        `,
        )
        .join('\n------------------------\n')}
        
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
        model: 'models/gemini-flash-latest',
        isSOW: true,
      });

      if (!model) {
        this.logger.warn('AI Model unavailable for decision making (null returned from aiConfig).');
        return null;
      }

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      this.logger.log(`AI Response received. Length: ${responseText.length}`);

      this.logger.log(`AI Response (first 100): ${responseText.substring(0, 100)}...`);

      // Robust JSON extraction
      let data: any = null;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanJson = jsonMatch[0]
            .replace(/\\n/g, '\n') // Handle escaped newlines if any
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
          data = JSON.parse(cleanJson);
        }
      } catch (parseError) {
        this.logger.error('JSON Parse Error from AI response', parseError);
        this.logger.debug('Full AI Response for debugging:', responseText);
      }

      if (!data) {
        this.logger.warn('AI response data is null after parsing attempts.');
        return null;
      }

      // Validate symbol exists in our list (handle potential AI hallucination of symbol format)
      const winnerSymbol = (data.winner_symbol || data.symbol || '').toUpperCase();
      this.logger.log(`AI selected symbol: ${winnerSymbol}`);
      const matchedStats = finalists.find(
        (f) =>
          f.symbol.toUpperCase() === winnerSymbol ||
          f.symbol.split('.')[0].toUpperCase() === winnerSymbol.split('.')[0] ||
          winnerSymbol.includes(f.symbol.split('.')[0].toUpperCase()),
      );

      const thesis = data.thesis_markdown || data.narrative || data.thesis || data.investment_thesis || data.analysis || data.rationale;

      if (matchedStats && thesis) {
        this.logger.log(`AI Selection Validated: ${matchedStats.symbol}. Thesis length: ${thesis.length}`);
        return {
          symbol: matchedStats.symbol,
          narrative: thesis,
          score: data.conviction_score || data.score || matchedStats.score,
        };
      } else {
        this.logger.warn(
          `AI Selection Mismatch: symbol=${winnerSymbol} (Matched? ${!!matchedStats}), thesis length=${thesis?.length || 0}`,
        );
        this.logger.debug('Full AI Response for debugging:', responseText);
      }
      return null;
    } catch (e: any) {
      if (e.message?.includes('429') || e.message?.includes('quota')) {
        let delaySeconds = 60;
        try {
          const retryInfo = e.errorDetails?.find((d: any) =>
            d.details?.some((inner: any) => inner.retryDelay),
          );
          const detail = retryInfo?.details?.find(
            (inner: any) => inner.retryDelay,
          );
          if (detail?.retryDelay) {
            const match = detail.retryDelay.match(/(\d+)s/);
            if (match) delaySeconds = parseInt(match[1]) + 5;
          }
        } catch (err) { }

        this.aiConfig.handleQuotaExceeded(delaySeconds, true);

        // RETRY LOGIC: Try one more time with the new key after a small backoff
        if (retryCount < 1 && !this.aiConfig.isAllExhausted) {
          this.logger.log(
            'Quota hit during selection. Key rotated. Retrying in 5s...',
          );
          await this.aiConfig.delay(5000);
          return this.decideWinnerWithAI(finalists, retryCount + 1);
        }
      } else {
        this.logger.error('AI Decision Making Error', e);
      }
      return null;
    }
  }

  async getLatestPick() {
    return this.prisma.stockOfTheWeek.findFirst({
      orderBy: { weekStartDate: 'desc' },
      include: { stock: true },
    });
  }

  async getArchive() {
    return this.prisma.stockOfTheWeek.findMany({
      orderBy: { weekStartDate: 'desc' },
      include: { stock: true },
      skip: 1, // Skip the latest one (current)
    });
  }

  // Daily Sync for Max High - Runs every day at 6:00 PM IST (UTC 12:30 PM)
  @Cron('0 13 * * *')
  async syncMaxHigh() {
    this.logger.log('Syncing Max High for all active Stock of the Week picks...');
    try {
      // Get picks that haven't been finalized (archived/closed)
      // or those that are the current week's picks
      const activePicks = await this.prisma.stockOfTheWeek.findMany({
        where: {
          finalPrice: null,
        },
      });

      if (activePicks.length === 0) {
        this.logger.log('No active picks requiring Max High sync.');
        return;
      }

      this.logger.log(`Found ${activePicks.length} picks to sync.`);

      for (const pick of activePicks) {
        // FindOne logic includes currentPrice fetching from Yahoo
        const currentData = await this.stocksService.findOne(pick.stockSymbol);

        if (currentData && currentData.currentPrice) {
          const currentPrice = currentData.currentPrice;
          const oldMax = pick.maxHigh || pick.priceAtSelection;

          if (currentPrice > oldMax) {
            await this.prisma.stockOfTheWeek.update({
              where: { id: pick.id },
              data: { maxHigh: currentPrice },
            });
            this.logger.log(`Updated Max High for ${pick.stockSymbol}: ${currentPrice}`);
          } else if (pick.maxHigh === null) {
            // Initialize if somehow null
            await this.prisma.stockOfTheWeek.update({
              where: { id: pick.id },
              data: { maxHigh: pick.priceAtSelection },
            });
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to sync Max High prices', e);
    }
  }

  async reset() {
    this.logger.warn('Resetting all Stock of the Week data...');
    return this.prisma.stockOfTheWeek.deleteMany({});
  }
}
