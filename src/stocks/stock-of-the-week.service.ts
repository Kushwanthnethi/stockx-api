import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { Cron } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { AIConfigService } from './ai-config.service';

@Injectable()
export class StockOfTheWeekService implements OnModuleInit {
  private readonly logger = new Logger(StockOfTheWeekService.name);
  private lastSyncTime: number = 0;
  private readonly SYNC_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours

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

    // Always run a sync for Max High on startup for active picks, but with cooldown
    const now = Date.now();
    if (now - this.lastSyncTime > this.SYNC_COOLDOWN) {
      this.logger.log('Cooldowned startup sync for Max High triggered.');
      setTimeout(() => this.syncMaxHigh(), 12000);
    } else {
      this.logger.log('Skipping startup sync due to cooldown.');
    }
  }

  // Run every Sunday at 12:00 PM IST (6:30 AM UTC)
  @Cron('30 6 * * 0')
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
          s.marketCap > 100000000000 && // Filter: Market Cap > ₹10,000 Cr (1 Cr = 10^7, 10k Cr = 10^11) 
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

      // 2. Score & Shortlist Finalists (Multi-Factor Model)
      const scored = candidates.map((stock) => {
        const { total, pillars } = this.calculateConvictionScore(stock);
        return { ...stock, score: total, pillars };
      });

      // Sort by score desc and take TOP 7
      scored.sort((a, b) => b.score - a.score);
      const finalists = scored.slice(0, 7);

      // Log pillar-wise breakdown for each finalist
      for (const f of finalists) {
        this.logger.log(
          `📊 ${f.symbol} [${f.score}/100] — Prof:${f.pillars.profitability} Grw:${f.pillars.growth} Val:${f.pillars.valuation} Hlth:${f.pillars.financialHealth} Mom:${f.pillars.momentum} QBonus:${f.pillars.qualityBonus} MoS:${f.pillars.mosBonus}`,
        );
      }

      this.logger.log(
        `Top 7 Finalists Identified: ${finalists.map((f) => `${f.symbol}(${f.score})`).join(', ')}`,
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
          finalScore = decision.score || winningPick.score as number;
          this.logger.log(
            `🤖 AI Overruled Math. Winner: ${winningPick.symbol} (Score: ${finalScore})`,
          );
        } else {
          this.logger.warn('AI Decision failed. Fallback to #1 Math Pick.');
          winningPick = finalists[0];
          // Generate basic narrative as fallback
          finalNarrative = `Strong fundamental pick in the ${winningPick.sector} sector with solid ROE of ${(winningPick.returnOnEquity * 100).toFixed(1)}%.`;
          finalScore = winningPick.score as number;
        }
      } else {
        winningPick = finalists[0];
        finalNarrative = `Strong fundamental pick in the ${winningPick.sector} sector with solid ROE of ${(winningPick.returnOnEquity * 100).toFixed(1)}% (AI Unavailable).`;
        finalScore = winningPick.score as number;
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

  /** Clamp a value between min and max, then scale to 0–maxPts */
  private clamp(value: number, min: number, max: number, maxPts: number): number {
    if (value <= min) return 0;
    if (value >= max) return maxPts;
    return ((value - min) / (max - min)) * maxPts;
  }

  /** Inverse clamp: lower values score higher */
  private clampInverse(value: number, idealLow: number, badHigh: number, maxPts: number): number {
    if (value <= idealLow) return maxPts;
    if (value >= badHigh) return 0;
    return ((badHigh - value) / (badHigh - idealLow)) * maxPts;
  }

  /** Sweet-spot clamp: values in middle range score highest */
  private clampSweetSpot(value: number, low: number, idealLow: number, idealHigh: number, high: number, maxPts: number): number {
    if (value >= idealLow && value <= idealHigh) return maxPts;
    if (value < idealLow) return this.clamp(value, low, idealLow, maxPts);
    return this.clampInverse(value, idealHigh, high, maxPts);
  }

  private calculateConvictionScore(stock: any): { total: number; pillars: Record<string, number> } {
    // ============================
    // PILLAR 1: PROFITABILITY (25 pts max)
    // ============================
    const roe = (stock.returnOnEquity ?? 0) * 100; // Convert decimal to %
    const profitMargin = (stock.profitMargins ?? 0) * 100;
    const operatingMargin = (stock.operatingMargins ?? 0) * 100;

    const p1_roe = this.clamp(roe, 0, 25, 10);           // 0–25% → 0–10 pts
    const p1_profit = this.clamp(profitMargin, 0, 25, 8); // 0–25% → 0–8 pts
    const p1_opMargin = this.clamp(operatingMargin, 0, 30, 7); // 0–30% → 0–7 pts
    const pillar1 = p1_roe + p1_profit + p1_opMargin;

    // ============================
    // PILLAR 2: GROWTH (20 pts max)
    // ============================
    const revGrowth = (stock.revenueGrowth ?? 0) * 100;
    const earnGrowth = (stock.earningsGrowth ?? 0) * 100;
    const epsGrowth = (stock.epsGrowth ?? 0) * 100;

    const p2_rev = this.clamp(revGrowth, 0, 30, 8);      // 0–30% → 0–8 pts
    const p2_earn = this.clamp(earnGrowth, -10, 40, 7);   // -10–40% → 0–7 pts
    const p2_eps = this.clamp(epsGrowth, 0, 30, 5);       // 0–30% → 0–5 pts
    const pillar2 = p2_rev + p2_earn + p2_eps;

    // ============================
    // PILLAR 3: VALUATION (20 pts max)
    // ============================
    const pe = stock.peRatio ?? 50;
    const peg = stock.pegRatio ?? 3;
    const evEbitda = stock.evEbitda ?? 30;

    // Sector-aware PE scoring: tech/pharma tolerate higher PE
    const sector = (stock.sector || '').toLowerCase();
    const isGrowthSector = ['technology', 'healthcare', 'consumer cyclical'].some(s => sector.includes(s));
    const peMax = isGrowthSector ? 40 : 25; // Growth sectors get wider PE band

    const p3_pe = pe > 0 ? this.clampInverse(pe, 5, peMax, 8) : 0;  // Lower PE → higher score
    const p3_peg = peg > 0 ? this.clampInverse(peg, 0.5, 2.5, 6) : 0; // PEG < 0.5 = max, > 2.5 = 0
    const p3_evEbitda = evEbitda > 0 ? this.clampInverse(evEbitda, 5, 25, 6) : 0;
    const pillar3 = p3_pe + p3_peg + p3_evEbitda;

    // ============================
    // PILLAR 4: FINANCIAL HEALTH (20 pts max)
    // ============================
    const debtToEquity = stock.debtToEquity ?? 200;
    const currentRatio = stock.currentRatio ?? 0;
    const interestCoverage = stock.interestCoverageRatio ?? 0;
    const fcfMargin = (stock.fcfMargin ?? 0) * 100;

    const p4_de = this.clampInverse(debtToEquity, 0, 200, 6);    // D/E: 0 = best, 200+ = worst
    const p4_cr = this.clampSweetSpot(currentRatio, 0.5, 1.2, 3.0, 5.0, 5); // Sweet spot 1.2–3.0
    const p4_ic = this.clamp(interestCoverage, 0, 10, 5);         // Higher is better
    const p4_fcf = this.clamp(fcfMargin, -5, 20, 4);              // Positive FCF margin is good
    const pillar4 = p4_de + p4_cr + p4_ic + p4_fcf;

    // ============================
    // PILLAR 5: MOMENTUM & TECHNICALS (15 pts max)
    // ============================
    const high52 = stock.high52Week || stock.currentPrice;
    const proximity = high52 > 0 ? (stock.currentPrice / high52) * 100 : 0; // % of 52W high
    const changePct = stock.changePercent ?? 0;
    const divYield = (stock.dividendYield ?? 0) * 100;

    const p5_proximity = this.clamp(proximity, 60, 100, 7);  // 60–100% of 52W high → 0–7 pts
    const p5_change = this.clamp(changePct, -5, 5, 5);       // -5% to +5% → 0–5 pts
    const p5_div = this.clamp(divYield, 0, 4, 3);            // 0–4% yield → 0–3 pts
    const pillar5 = p5_proximity + p5_change + p5_div;

    // ============================
    // BONUS POINTS
    // ============================
    // Quality Trifecta: ROE > 15%, D/E < 1, positive FCF
    const qualityBonus = (roe > 15 && debtToEquity < 100 && fcfMargin > 0) ? 3 : 0;

    // Margin of Safety: Price below Graham Number or Intrinsic Value
    const grahamSafe = stock.grahamNumber && stock.currentPrice < stock.grahamNumber;
    const intrinsicSafe = stock.intrinsicValue && stock.currentPrice < stock.intrinsicValue;
    const mosBonus = (grahamSafe || intrinsicSafe) ? 2 : 0;

    // ============================
    // TOTAL
    // ============================
    const rawTotal = pillar1 + pillar2 + pillar3 + pillar4 + pillar5 + qualityBonus + mosBonus;
    const total = Math.min(Math.round(rawTotal), 99);

    return {
      total,
      pillars: {
        profitability: Math.round(pillar1 * 10) / 10,
        growth: Math.round(pillar2 * 10) / 10,
        valuation: Math.round(pillar3 * 10) / 10,
        financialHealth: Math.round(pillar4 * 10) / 10,
        momentum: Math.round(pillar5 * 10) / 10,
        qualityBonus,
        mosBonus,
      },
    };
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
          .slice(0, 3)
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

    const prompt = `You are a Senior Portfolio Manager at a top-tier Indian asset management firm.
You have access to a proprietary multi-factor quantitative model that has scored 7 candidates across 5 pillars:
- **Profitability** (25pts): ROE, Net Margins, Operating Margins
- **Growth** (20pts): Revenue, Earnings, and EPS growth rates
- **Valuation** (20pts): PE ratio (sector-adjusted), PEG, EV/EBITDA
- **Financial Health** (20pts): Debt/Equity, Current Ratio, Interest Coverage, FCF Margin
- **Momentum** (15pts): 52-Week High Proximity, Recent Trend, Dividend Yield
- **Bonus**: Quality Trifecta (+3 for ROE>15% + low debt + positive FCF), Margin of Safety (+2 if price < intrinsic value)

## YOUR TASK
Select the **ONE best stock** for a **4-Week Holding Period** from these 7 candidates.

## THE CANDIDATES
${enrichedFinalists
        .map(
          (f) => `
### [${f.symbol}] ${f.companyName}
| Metric | Value |
|--------|-------|
| Quant Score | **${f.score}/100** |
| Profitability | ${f.pillars?.profitability ?? 'N/A'}/25 |
| Growth | ${f.pillars?.growth ?? 'N/A'}/20 |
| Valuation | ${f.pillars?.valuation ?? 'N/A'}/20 |
| Financial Health | ${f.pillars?.financialHealth ?? 'N/A'}/20 |
| Momentum | ${f.pillars?.momentum ?? 'N/A'}/15 |
| Bonuses | Quality=${f.pillars?.qualityBonus ?? 0}, MoS=${f.pillars?.mosBonus ?? 0} |
| Price | Rs.${f.currentPrice} (${f.changePercent > 0 ? '+' : ''}${f.changePercent.toFixed(2)}%) |
| PE / ROE | ${f.peRatio?.toFixed(1)} / ${(f.returnOnEquity * 100).toFixed(1)}% |
| D/E / EV/EBITDA | ${f.debtToEquity?.toFixed(1) ?? 'N/A'} / ${f.evEbitda?.toFixed(1) ?? 'N/A'} |
| Op. Margin | ${f.operatingMargins ? (f.operatingMargins * 100).toFixed(1) + '%' : 'N/A'} |
| Sector | ${f.sector} |
| Near 52W High? | ${f.high52Week && f.currentPrice > f.high52Week * 0.9 ? 'YES - CAUTION' : 'No'} |

**Recent News:** ${f.newsSnippet}
`,
        )
        .join('\\n---\\n')}

## ANALYSIS FRAMEWORK (Follow these steps in order)

**Step 1 - Elimination Round:**
Eliminate any stocks with critical red flags: D/E above 150, negative operating margins, major negative news (governance scandal, regulatory action, earnings miss), or already at 52-week high with weak fundamentals (overbought trap).

**Step 2 - News & Catalyst Scoring (IMPORTANT):**
For EACH surviving candidate, assign a **News Score from 0 to 10** based on:
- **Positive catalysts this week** (upcoming earnings, analyst upgrades, order wins, expansion news, policy tailwinds) → +2 to +4 pts each
- **Sector momentum** (is this sector in favor right now? FII/DII buying trends) → +1 to +3 pts
- **Negative signals** (downgrades, profit warnings, legal issues, sector headwinds) → -2 to -4 pts each
- **Timeliness** (is this the RIGHT WEEK to enter this stock?) → +1 to +3 pts
A stock with no significant news gets 3-4. A stock with strong positive catalysts this week gets 7-10. A stock with negative news gets 0-2.

**Step 3 - Risk-Reward Assessment:**
For remaining candidates evaluate: (a) Upside Potential - what catalyst drives price up in next 30 days? (b) Downside Risk - what could go wrong? (c) Conviction Level - how confident given data quality and news strength?

**Step 4 - Final Selection:**
Combine Quant Score + News Score to determine the final pick. A stock with Quant 65 + News 9 (=74) may beat a stock with Quant 80 + News 2 (=82) if the catalyst is time-sensitive. Use your judgment.

## OUTPUT FORMAT (STRICT JSON ONLY - no extra text before or after):
{
    "winner_symbol": "SYMBOL.NS",
    "conviction_score": 85,
    "news_scores": {
        "SYMBOL1.NS": {"score": 7, "reason": "Strong Q3 results expected"},
        "SYMBOL2.NS": {"score": 3, "reason": "No major catalyst"},
        "SYMBOL3.NS": {"score": 8, "reason": "Sector rotation + policy boost"}
    },
    "thesis_markdown": "1. **Why This Stock?**\\n..."
}

## THESIS STRUCTURE (for thesis_markdown, write approximately 350 words):
1. **Why This Stock?** - Comparative analysis: why this beat the other 6. Reference both quant scores AND your news scores.
2. **This Week's Edge** - What makes THIS WEEK the right time to pick this stock? Reference specific news items and your news score reasoning.
3. **Fundamental Edge** - Profitability, growth trajectory, and balance sheet quality vs peers.
4. **Technical View** - Current price action, support/resistance levels, momentum signals.
5. **Risk Factors** - Top 2-3 risks that could invalidate the thesis.
6. **The Verdict** - Clear 4-week outlook with expected return range and stop-loss rationale.
`;

    try {
      // 2. Traffic Guard (Phase 2)
      await this.aiConfig.waitForAvailability();

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
        // Log AI's news scoring if available
        if (data.news_scores) {
          this.logger.log(`📰 AI News Scores:`);
          for (const [sym, info] of Object.entries(data.news_scores as Record<string, { score: number; reason: string }>)) {
            this.logger.log(`   ${sym}: ${info.score}/10 — ${info.reason}`);
          }
        }
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

        this.aiConfig.handleQuotaExceeded(delaySeconds, 'sow');

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
      include: { stock: true, dailyPrices: { orderBy: { date: 'asc' } } },
    });
  }

  async getArchive() {
    return this.prisma.stockOfTheWeek.findMany({
      orderBy: { weekStartDate: 'desc' },
      include: { stock: true, dailyPrices: { orderBy: { date: 'asc' } } },
      skip: 1, // Skip the latest one (current)
    });
  }

  // Daily Sync for Max High - Runs every day at 6:00 PM IST (UTC 12:30 PM)
  @Cron('0 13 * * *')
  async syncMaxHigh() {
    this.lastSyncTime = Date.now();
    this.logger.log('Syncing Max High for all active Stock of the Week picks (Batch Mode)...');
    try {
      // Get picks that haven't been finalized (archived/closed)
      const activePicks = await this.prisma.stockOfTheWeek.findMany({
        where: { finalPrice: null },
      });

      if (activePicks.length === 0) {
        this.logger.log('No active picks requiring Max High sync.');
        return;
      }

      const symbols = activePicks.map(p => p.stockSymbol);
      this.logger.log(`Syncing ${symbols.length} active picks: ${symbols.join(', ')}`);

      // 1. Batch fetch quotes (updates Stock DB internally)
      const quotes = await this.stocksService.getQuotes(symbols);

      // 2. Update SOW performance tracking
      for (const pick of activePicks) {
        const quote = quotes.find(q => q.symbol === pick.stockSymbol);

        if (quote && quote.regularMarketDayHigh) {
          const dayHigh = quote.regularMarketDayHigh;
          const oldMax = pick.maxHigh || pick.priceAtSelection;

          if (dayHigh > oldMax) {
            await this.prisma.stockOfTheWeek.update({
              where: { id: pick.id },
              data: { maxHigh: dayHigh },
            });
            this.logger.log(`New ATH for ${pick.stockSymbol} in SOW tracking: ${dayHigh}`);
          } else if (pick.maxHigh === null) {
            await this.prisma.stockOfTheWeek.update({
              where: { id: pick.id },
              data: { maxHigh: pick.priceAtSelection },
            });
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to sync Max High prices', e.message);
    }
  }

  async reset() {
    this.logger.warn('Resetting all Stock of the Week data...');
    return this.prisma.stockOfTheWeek.deleteMany({});
  }
}
