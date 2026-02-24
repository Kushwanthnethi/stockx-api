import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { AIConfigService } from './ai-config.service';

@Injectable()
export class VerdictsService implements OnModuleInit {
  private readonly logger = new Logger(VerdictsService.name);
  private isRefreshing = false;
  private refreshQueue: string[] = [];
  private isWorkerRunning = false;

  private readonly NIFTY_50_SYMBOLS = [
    'RELIANCE.NS',
    'TCS.NS',
    'HDFCBANK.NS',
    'ICICIBANK.NS',
    'INFY.NS',
    'BHARTIARTL.NS',
    'ITC.NS',
    'SBIN.NS',
    'LICI.NS',
    'LT.NS',
    'HINDUNILVR.NS',
    'BAJFINANCE.NS',
    'HCLTECH.NS',
    'KOTAKBANK.NS',
    'M&M.NS',
    'ADANIENT.NS',
    'SUNPHARMA.NS',
    'MARUTI.NS',
    'TITAN.NS',
    'AXISBANK.NS',
    'ULTRACEMCO.NS',
    'ASIANPAINT.NS',
    'NTPC.NS',
    'ADANIPORTS.NS',
    'POWERGRID.NS',
    'ONGC.NS',
    'WIPRO.NS',
    'COALINDIA.NS',
    'NESTLEIND.NS',
    'BAJAJFINSV.NS',
    'JSWSTEEL.NS',
    'ADANIGREEN.NS',
    'TATASTEEL.NS',
    'GRASIM.NS',
    'TECHM.NS',
    'HDFCLIFE.NS',
    'INDUSINDBK.NS',
    'LTIM.NS',
    'HINDALCO.NS',
    'DIVISLAB.NS',
    'ADANIPOWER.NS',
    'CIPLA.NS',
    'EICHERMOT.NS',
    'BPCL.NS',
    'BRITANNIA.NS',
    'APOLLOHOSP.NS',
    'HAL.NS',
    'TATACONSUM.NS',
  ];

  constructor(
    private prisma: PrismaService,
    private stocksService: StocksService,
    private aiConfig: AIConfigService,
  ) { }

  async onModuleInit() {
    this.markNifty50Stocks();
  }

  // Helper to ensure isNifty50 flag is set correctly
  private async markNifty50Stocks() {
    try {
      this.logger.log(
        `Marking ${this.NIFTY_50_SYMBOLS.length} stocks as Nifty 50...`,
      );
      await (this.prisma as any).stock.updateMany({
        where: { symbol: { in: this.NIFTY_50_SYMBOLS } },
        data: { isNifty50: true },
      });
      this.logger.log('Nifty 50 stocks marked.');
    } catch (e: any) {
      this.logger.error('Failed to mark Nifty 50 stocks', e.message);
    }
  }

  // SMART REFRESH Logic
  // Triggers: New News, New Quarterly Results, or Verdict is too old (> 7 days)
  async getNifty50Verdicts() {
    const stocks = await (this.prisma as any).stock.findMany({
      where: { isNifty50: true },
      include: { verdicts: { orderBy: { generatedAt: 'desc' }, take: 1 } },
    });

    // Background check: Iterate and see if any need refresh
    // We don't await this so the UI is fast. Passively update.
    if (!this.isRefreshing) {
      this.runSmartRefreshCycle(stocks).catch((err) => {
        this.logger.error('Error in background refresh cycle', err);
        this.isRefreshing = false;
      });
    } else {
      this.logger.log('Refresh cycle already in progress. Skipping trigger.');
    }

    // Fetch detailed data for everyone to calculate institutional verdict
    const stocksWithInstitutional = await Promise.all(
      stocks.map(async (s: any) => {
        const tech = await this.stocksService.getTechnicalAnalysis(s.symbol);
        const details = await this.stocksService
          .getEarningsDetails(s.symbol)
          .catch(() => null);

        // Calculate Institutional Score
        const instVerdict = this.calculateInstitutionalVerdict(
          tech,
          details,
          s.changePercent,
        );

        return {
          symbol: s.symbol,
          companyName: s.companyName,
          currentPrice: s.currentPrice,
          changePercent: s.changePercent,
          technical: tech,
          institutional: instVerdict,
          verdict: s.verdicts?.[0] || null,
        };
      }),
    );

    // Explicitly filter out bad data and blacklisted stocks
    const BLACKLIST = ['TATAMOTORS.NS', 'SBIW.NS', 'SBICARD.NS'];
    const validStocks = stocksWithInstitutional.filter(
      (s) =>
        !BLACKLIST.includes(s.symbol) && s.currentPrice > 0 && s.companyName,
    );

    // Return current state
    try {
      return {
        stocks: validStocks,
        aiStatus: {
          isRefreshing: this.isRefreshing,
          activeKeys: this.aiConfig.activeKeyCount,
          totalKeys: this.aiConfig.totalKeysCount,
          nextResetAt: this.aiConfig.nextResetTimestamp,
          queueLength: this.refreshQueue.length,
        },
      };
    } catch (e: any) {
      this.logger.error('Error formatting verdicts data', e.message);
      return { stocks: [], aiStatus: null };
    }
  }

  async runSmartRefreshCycle(stocks: any[]) {
    // Find stocks needing update
    const toRefresh: string[] = [];
    for (const stock of stocks) {
      const latestVerdict = stock.verdicts[0];
      let needsUpdate = false;

      if (!latestVerdict) {
        needsUpdate = true;
      } else {
        const hoursSinceLast =
          (Date.now() - new Date(latestVerdict.generatedAt).getTime()) /
          (1000 * 60 * 60);
        if (hoursSinceLast > 24 * 7) needsUpdate = true;

        // Add logic for results/news if needed, but for now simple heartbeat/no-verdict
        // to avoid too many API calls during testing.
      }

      if (needsUpdate && !this.refreshQueue.includes(stock.symbol)) {
        toRefresh.push(stock.symbol);
      }
    }

    if (toRefresh.length > 0) {
      this.refreshQueue.push(...toRefresh);
      this.logger.log(
        `Added ${toRefresh.length} stocks to refresh queue. Total: ${this.refreshQueue.length}`,
      );
      this.startWorker();
    }
  }

  private async startWorker() {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;
    this.isRefreshing = true;
    this.processQueueWorker().catch((err) => {
      this.logger.error('Worker failed', err);
      this.isWorkerRunning = false;
      this.isRefreshing = false;
    });
  }

  private async processQueueWorker() {
    while (this.refreshQueue.length > 0) {
      // Check for service-wide overload
      if (this.aiConfig.isOverloaded) {
        this.logger.warn(
          'AI WORKER: Service currently overloaded. Sleeping for 1 minute.',
        );
        await this.aiConfig.delay(60000);
        continue;
      }

      this.logger.log(
        `AI WORKER: Starting batch. Progress: ${this.refreshQueue.length} remaining.`,
      );

      // PROCESS BATCH OF 5
      const batch = this.refreshQueue.splice(0, 5);
      let successCount = 0;

      for (const symbol of batch) {
        // Gap between stocks in a batch
        await this.aiConfig.delay(3000);

        const success = await this.generateSingleVerdict(symbol);
        if (success) successCount++;

        if (this.aiConfig.isAllExhausted) {
          this.logger.warn(
            'AI WORKER: All keys exhausted. pausing and re-queuing current batch.',
          );
          // Re-queue remaining of this batch if we hit quota midway
          const idx = batch.indexOf(symbol);
          if (idx !== -1) {
            const remaining = batch.slice(idx);
            this.refreshQueue.unshift(...remaining);
          }
          break;
        }
      }

      this.logger.log(
        `AI WORKER: Batch finished (${successCount}/${batch.length} success).`,
      );

      if (this.refreshQueue.length > 0) {
        this.logger.log('AI WORKER: Taking a 30s breath before next batch...');
        await this.aiConfig.delay(30000); // 30s breath between batches
      }
    }

    this.logger.log('AI WORKER: Queue empty. Sleeping.');
    this.isWorkerRunning = false;
    this.isRefreshing = false;
  }

  async generateSingleVerdict(
    symbol: string,
    retryCount = 0,
  ): Promise<boolean> {
    try {
      this.logger.debug(
        `Generating Verdict for ${symbol}...${retryCount > 0 ? ' (Retry ' + retryCount + ')' : ''}`,
      );

      // 1. Gather Data
      const stock = await this.stocksService.findOne(symbol);
      if (!stock) {
        this.logger.warn(`Stock ${symbol} not found. Skipping verdict.`);
        return false;
      }
      const news = await this.stocksService.getStockNews(symbol);
      const earnings = await this.stocksService
        .getEarningsDetails(symbol)
        .catch(() => null);

      // 2. Prepare Prompt
      const prompt = `
            Analyze ${stock.companyName} (${stock.symbol}) for a BUY/SELL/HOLD verdict.
            
            Data:
            - Price: ${stock.currentPrice} (${stock.changePercent}%)
            - PE: ${stock.peRatio}, PB: ${stock.pbRatio}
            - ROE: ${stock.returnOnEquity}
            - Latest Qtr Earnings: ${earnings ? JSON.stringify((earnings as any).latestQuarter) : 'N/A'}
            
            Recent News headers:
            ${news
          .slice(0, 3)
          .map((n: any) => `- ${n.title}`)
          .join('\n')}

            Task:
            Provide a verdict based on technicals (30-day view) and fundamentals.
            If news is negative (fraud, lawsuit), rating should likely be SELL/HOLD.
            If brokerage upgrades mentioned in news, factor that in.

            Output JSON only:
            {
                "verdict": "BUY" | "SELL" | "HOLD",
                "confidence": 85,
                "rationale": "[HEADLINE] One-sentence punchy insight. [TRIGGERS] Trigger 1 | Trigger 2. [CONTENT] Detailed markdown rationale..."
            }
            `;

      // 2. Traffic Guard (Phase 2)
      await this.aiConfig.waitForAvailability();

      const model = this.aiConfig.getModel({
        model: 'gemini-2.0-flash',
      });

      if (!model) {
        this.logger.error(
          `No AI model available for ${symbol}. All keys might be exhausted.`,
        );
        return false;
      }

      this.logger.debug(`Calling Gemini API for ${symbol}...`);
      const startTime = Date.now();
      const result = await model.generateContent(prompt);
      const endTime = Date.now();
      this.logger.debug(
        `Gemini API responded for ${symbol} in ${endTime - startTime}ms.`,
      );
      const responseText = result.response.text();
      const cleanJson = responseText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const data = JSON.parse(cleanJson);

      // 3. Save
      await (this.prisma as any).stockVerdict.create({
        data: {
          stockSymbol: symbol,
          verdict: data.verdict,
          confidence: data.confidence,
          rationale: data.rationale,
          validUntil: new Date(
            Date.now() + (data.valid_duration_days || 7) * 24 * 60 * 60 * 1000,
          ),
        },
      });

      this.logger.log(`[Verdict] ✓ ${symbol}: ${data.verdict} (${data.confidence}%)`);
      return true;
    } catch (e: any) {
      if (e.message?.includes('429') || e.message?.includes('quota')) {
        let delaySeconds = 60;
        try {
          // Gemini API returns retryDelay in details
          const retryInfo = e.errorDetails?.find((d: any) =>
            d.details?.some((inner: any) => inner.retryDelay),
          );
          const detail = retryInfo?.details?.find(
            (inner: any) => inner.retryDelay,
          );
          if (detail?.retryDelay) {
            const match = detail.retryDelay.match(/(\d+)s/);
            if (match) delaySeconds = parseInt(match[1]) + 5; // Add buffer
          }
        } catch (err) { }

        this.aiConfig.handleQuotaExceeded(delaySeconds, 'shared');

        // RETRY LOGIC: Try one more time with the new key after a small backoff
        if (retryCount < 1 && !this.aiConfig.isAllExhausted) {
          this.logger.log(
            `Quota hit during ${symbol}. Key rotated. Retrying in 5s...`,
          );
          await this.aiConfig.delay(5000);
          return this.generateSingleVerdict(symbol, retryCount + 1);
        }
      } else if (
        e.message?.includes('503') ||
        e.message?.includes('overloaded') ||
        e.message?.includes('unavailable')
      ) {
        this.logger.error(
          `Model Overloaded for ${symbol}. Triggering global cooldown.`,
        );
        this.aiConfig.handleServiceOverload(60, 'shared'); // 1 min pause
      } else {
        this.logger.error(`Failed to generate veredict for ${symbol}`, e);
      }
      return false;
    }
  }

  private calculateInstitutionalVerdict(
    tech: any,
    details: any,
    change24h: number,
  ) {
    let score = 0; // -10 to +10

    // 1. ANALYST CONSENSUS (40% Weight -> max 4 points)
    if (details?.recommendationMean) {
      const mean = details.recommendationMean;
      if (mean <= 1.5)
        score += 4; // Strong Buy
      else if (mean <= 2.5)
        score += 2; // Buy
      else if (mean >= 4.0)
        score -= 4; // Sell
      else if (mean >= 3.5) score -= 2; // Underperform
    }

    // 2. EARNINGS PERFORMANCE (30% Weight -> max 3 points)
    if (details?.verdict) {
      if (details.verdict === 'BEAT') score += 3;
      if (details.verdict === 'MISS') score -= 3;
    }
    if (details?.financials?.revenueGrowth > 0.15) score += 1;

    // 3. TECHNICAL MOMENTUM (30% Weight -> max 3 points)
    if (tech?.signal === 'BUY') score += 3;
    if (tech?.signal === 'SELL') score -= 3;
    if (change24h > 3) score += 1;
    if (change24h < -3) score -= 1;

    // Final Mapping
    let verdict = 'HOLD';
    const confidence = 50 + Math.abs(score) * 4;
    if (score >= 5) verdict = 'BUY';
    if (score <= -5) verdict = 'SELL';

    return {
      verdict,
      score,
      confidence: Math.min(confidence, 95),
      breakdown: {
        analysts: details?.recommendationMean || 'Neutral',
        earnings: details?.verdict || 'Neutral',
        tech: tech?.trend || 'Neutral',
      },
    };
  }
}
