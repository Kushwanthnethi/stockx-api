import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { AIConfigService } from './ai-config.service';
import { GroqService } from '../services/groq.service';

@Injectable()
export class VerdictsService implements OnModuleInit {
  private readonly logger = new Logger(VerdictsService.name);
  private isRefreshing = false;
  private refreshQueue: string[] = [];
  private isWorkerRunning = false;

  // ========== CACHING LAYER ==========
  private verdictCache: { data: any; timestamp: number } | null = null;
  private institutionalCache = new Map<string, any>();
  private isPreComputing = false;
  private preComputeTimer: NodeJS.Timeout | null = null;
  private readonly CACHE_TTL = 5 * 1000; // 5 seconds
  private readonly PRECOMPUTE_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly BATCH_SIZE = 5;
  private readonly BATCH_DELAY = 4000; // 4s between each stock in a batch
  private readonly BATCH_GAP = 10000; // 10s between batches

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
    private groqService: GroqService,
  ) { }

  async onModuleInit() {
    this.markNifty50Stocks();
    // Start background pre-computation after 15s startup delay
    setTimeout(() => {
      this.preComputeInstitutionalData();
    }, 15000);
    // Schedule periodic refresh every 30 minutes
    this.preComputeTimer = setInterval(
      () => this.preComputeInstitutionalData(),
      this.PRECOMPUTE_INTERVAL,
    );
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

  // ========== PRE-COMPUTE (Background, rate-limited) ==========
  private async preComputeInstitutionalData() {
    if (this.isPreComputing) {
      this.logger.log('[Pre-Compute] Already running, skipping.');
      return;
    }
    this.isPreComputing = true;
    this.logger.log('[Pre-Compute] Starting institutional data pre-computation...');
    const startTime = Date.now();

    try {
      const stocks = await (this.prisma as any).stock.findMany({
        where: { isNifty50: true },
        select: { symbol: true, changePercent: true },
      });

      // Process in sequential batches of BATCH_SIZE
      for (let i = 0; i < stocks.length; i += this.BATCH_SIZE) {
        const batch = stocks.slice(i, i + this.BATCH_SIZE);
        this.logger.log(
          `[Pre-Compute] Batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(stocks.length / this.BATCH_SIZE)} (${batch.map((s: any) => s.symbol.split('.')[0]).join(', ')})`,
        );

        for (const stock of batch) {
          try {
            const tech = await this.stocksService.getTechnicalAnalysis(stock.symbol);
            // Use a lighter earnings call — just quoteSummary, skip the heavy quarterly data
            const details = await this.stocksService
              .getEarningsDetails(stock.symbol)
              .catch(() => null);

            const instVerdict = this.calculateInstitutionalVerdict(
              tech,
              details,
              stock.changePercent,
            );

            this.institutionalCache.set(stock.symbol, {
              technical: tech,
              institutional: instVerdict,
              details,
              cachedAt: Date.now(),
            });
          } catch (e: any) {
            this.logger.warn(`[Pre-Compute] Failed for ${stock.symbol}: ${e.message}`);
          }

          // Delay between each stock within a batch
          await this.delay(this.BATCH_DELAY);
        }

        // Longer delay between batches
        if (i + this.BATCH_SIZE < stocks.length) {
          this.logger.log('[Pre-Compute] Batch complete, cooling down...');
          await this.delay(this.BATCH_GAP);
        }
      }

      // Invalidate the full response cache so next request picks up new data
      this.verdictCache = null;

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `[Pre-Compute] ✓ Complete. ${this.institutionalCache.size} stocks cached in ${elapsed}s`,
      );
    } catch (e: any) {
      this.logger.error('[Pre-Compute] Failed:', e.message);
    } finally {
      this.isPreComputing = false;
    }
  }

  // ========== GET VERDICTS (serves from cache — instant) ==========
  async getNifty50Verdicts() {
    // Serve from cache if fresh
    if (
      this.verdictCache &&
      Date.now() - this.verdictCache.timestamp < this.CACHE_TTL
    ) {
      this.logger.debug('[Verdicts] Serving from cache (instant)');
      return this.verdictCache.data;
    }

    this.logger.log('[Verdicts] Building response from DB + institutional cache...');

    const stocks = await (this.prisma as any).stock.findMany({
      where: { isNifty50: true },
      include: { verdicts: { orderBy: { generatedAt: 'desc' }, take: 1 } },
    });

    // Background check: see if any verdicts need refresh
    if (!this.isRefreshing) {
      this.runSmartRefreshCycle(stocks).catch((err) => {
        this.logger.error('Error in background refresh cycle', err);
        this.isRefreshing = false;
      });
    }

    // Build response using PRE-COMPUTED institutional data (no live Yahoo calls!)
    const defaultInstitutional = {
      verdict: 'HOLD',
      score: 0,
      confidence: 50,
      breakdown: { analysts: 'Neutral', earnings: 'Neutral', tech: 'Neutral' },
    };

    const stocksWithInstitutional = stocks.map((s: any) => {
      const cached = this.institutionalCache.get(s.symbol);
      return {
        symbol: s.symbol,
        companyName: s.companyName,
        currentPrice: s.currentPrice,
        changePercent: s.changePercent,
        technical: cached?.technical || null,
        institutional: cached?.institutional || defaultInstitutional,
        verdict: s.verdicts?.[0] || null,
      };
    });

    // Filter out bad data
    const BLACKLIST = ['TATAMOTORS.NS', 'SBIW.NS', 'SBICARD.NS'];
    const validStocks = stocksWithInstitutional.filter(
      (s: any) =>
        !BLACKLIST.includes(s.symbol) && s.currentPrice > 0 && s.companyName,
    );

    const response = {
      stocks: validStocks,
      aiStatus: {
        isRefreshing: this.isRefreshing,
        activeKeys: this.aiConfig.activeKeyCount,
        totalKeys: this.aiConfig.totalKeysCount,
        nextResetAt: this.aiConfig.nextResetTimestamp,
        queueLength: this.refreshQueue.length,
        isPreComputing: this.isPreComputing,
        institutionalCacheSize: this.institutionalCache.size,
      },
    };

    // Cache the full response
    this.verdictCache = { data: response, timestamp: Date.now() };
    this.logger.log(`[Verdicts] Response cached. ${validStocks.length} stocks.`);

    return response;
  }

  // ========== SMART REFRESH (AI Verdict generation) ==========
  async runSmartRefreshCycle(stocks: any[]) {
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
      if (this.aiConfig.isOverloaded) {
        this.logger.warn(
          'AI WORKER: Service currently overloaded. Sleeping for 1 minute.',
        );
        await this.delay(60000);
        continue;
      }

      this.logger.log(
        `AI WORKER: Starting batch. Progress: ${this.refreshQueue.length} remaining.`,
      );

      const batch = this.refreshQueue.splice(0, 5);
      let successCount = 0;

      for (const symbol of batch) {
        await this.delay(3000);

        const success = await this.generateSingleVerdict(symbol);
        if (success) successCount++;

        if (this.aiConfig.isAllExhausted) {
          this.logger.warn(
            'AI WORKER: All keys exhausted. Pausing and re-queuing.',
          );
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
        await this.delay(30000);
      }
    }

    this.logger.log('AI WORKER: Queue empty. Sleeping.');
    this.isWorkerRunning = false;
    this.isRefreshing = false;
    // Invalidate cache so next request reflects new verdicts
    this.verdictCache = null;
  }

  async generateSingleVerdict(
    symbol: string,
    retryCount = 0,
  ): Promise<boolean> {
    try {
      this.logger.debug(
        `Generating Verdict for ${symbol}...${retryCount > 0 ? ' (Retry ' + retryCount + ')' : ''}`,
      );

      const stock = await this.stocksService.findOne(symbol);
      if (!stock) {
        this.logger.warn(`Stock ${symbol} not found. Skipping verdict.`);
        return false;
      }
      const news = await this.stocksService.getStockNews(symbol);
      const earnings = await this.stocksService
        .getEarningsDetails(symbol)
        .catch(() => null);

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

      let responseText = '';
      const startTime = Date.now();

      try {
        this.logger.debug(`Calling Groq API for ${symbol}...`);
        responseText = await this.groqService.generateCompletion(prompt);
        this.logger.debug(`Groq API responded for ${symbol} in ${Date.now() - startTime}ms.`);
      } catch (groqError: any) {
        this.logger.warn(`Groq API failed for ${symbol} (${groqError.message}). Falling back to Gemini cloud AI...`);

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
        const fallbackStartTime = Date.now();
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        this.logger.debug(
          `Gemini API responded for ${symbol} in ${Date.now() - fallbackStartTime}ms.`,
        );
      }

      const cleanJson = responseText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const data = JSON.parse(cleanJson);

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

        this.aiConfig.handleQuotaExceeded(delaySeconds, 'shared');

        if (retryCount < 1 && !this.aiConfig.isAllExhausted) {
          this.logger.log(
            `Quota hit during ${symbol}. Key rotated. Retrying in 5s...`,
          );
          await this.delay(5000);
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
        this.aiConfig.handleServiceOverload(60, 'shared');
      } else {
        this.logger.error(`Failed to generate verdict for ${symbol}`, e);
      }
      return false;
    }
  }

  private calculateInstitutionalVerdict(
    tech: any,
    details: any,
    change24h: number,
  ) {
    let score = 0;

    // 1. ANALYST CONSENSUS (40% Weight -> max 4 points)
    if (details?.recommendationMean) {
      const mean = details.recommendationMean;
      if (mean <= 1.5)
        score += 4;
      else if (mean <= 2.5)
        score += 2;
      else if (mean >= 4.0)
        score -= 4;
      else if (mean >= 3.5) score -= 2;
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
