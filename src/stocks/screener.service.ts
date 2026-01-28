import { Injectable, Logger } from '@nestjs/common';

export interface ScreenerFilter {
    type: 'gainers' | 'losers' | 'active' | 'undervalued' | 'tech_growth';
    marketCapCategory?: 'large' | 'mid' | 'small' | 'all';
    count?: number;
}

@Injectable()
export class ScreenerService {
    private readonly logger = new Logger(ScreenerService.name);
    private yahooFinance: any = null;

    // Simple in-memory cache to avoid hitting Yahoo too hard for fundamentals
    // Key: symbol, Value: { data: object, timestamp: number }
    private fundamentalsCache = new Map<string, { data: any, timestamp: number }>();

    private async getYahooClient() {
        if (this.yahooFinance) return this.yahooFinance;
        try {
            const pkg = await import('yahoo-finance2');
            const YahooFinanceClass = pkg.default || pkg;
            if (typeof YahooFinanceClass === 'function') {
                this.yahooFinance = new YahooFinanceClass({ validation: { logErrors: true } });
            } else {
                this.yahooFinance = YahooFinanceClass;
            }
        } catch (e) {
            this.logger.error('Failed to initialize YahooFinance client', e);
            throw e;
        }
        return this.yahooFinance;
    }

    async getScreenerData(filter: ScreenerFilter) {
        try {
            const yahooFinance = await this.getYahooClient();
            const { type, marketCapCategory = 'all', count = 50 } = filter;

            let scrId = 'day_gainers';
            if (type === 'losers') scrId = 'day_losers';
            else if (type === 'active') scrId = 'most_actives';
            else if (type === 'undervalued') scrId = 'undervalued_growth_stocks';
            else if (type === 'tech_growth') scrId = 'growth_technology_stocks';

            // 1. Fetch RAW list (fetch extra to allow for market cap filtering)
            // Fetching 250 to ensure we have enough after filtering for market cap
            const queryOptions = {
                scrIds: scrId,
                count: 100, // Yahoo limit per request is usually around 100 or 250
                region: 'IN',
                lang: 'en-IN'
            };

            this.logger.log(`Fetching raw screener: ${scrId}`);
            const result = await yahooFinance.screener(queryOptions, { validateResult: false });

            if (!result || !result.quotes || result.quotes.length === 0) return [];

            // 2. Initial Filter: strict Indan exchanges
            const validExchanges = ['NSI', 'NSE', 'BSE', 'BOM'];
            let quotes = result.quotes.filter((q: any) => {
                const isIndianExchange = validExchanges.includes(q.exchange);
                const hasIndianSuffix = q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));
                return isIndianExchange || hasIndianSuffix;
            });

            // 3. Enrich with Market Cap & Fundamentals (if missing in screener result)
            // Note: Screener result HAS marketCap, but often lacks ROE, Debt, Sales Growth.
            // We need to fetch details for the VISIBLE set.

            // First, filter by Market Cap Category using the *screeners* market cap if available
            // Large Cap: > 20,000 Cr. Mid: 5k-20k. Small: < 5k.
            // Yahoo marketCap is in raw numeric value.
            // 20,000 Cr = 20,000 * 1,00,00,000 = 200,000,000,000 (200 Billion)

            const LARGE_CAP_THRESHOLD = 20000 * 10000000;
            const SMALL_CAP_THRESHOLD = 5000 * 10000000;

            if (marketCapCategory !== 'all') {
                quotes = quotes.filter((q: any) => {
                    const mc = q.marketCap || 0;
                    if (marketCapCategory === 'large') return mc >= LARGE_CAP_THRESHOLD;
                    if (marketCapCategory === 'mid') return mc >= SMALL_CAP_THRESHOLD && mc < LARGE_CAP_THRESHOLD;
                    if (marketCapCategory === 'small') return mc < SMALL_CAP_THRESHOLD;
                    return true;
                });
            }

            // Slice to requested count *before* fetching heavy details to save time
            const quotesToEnrich = quotes.slice(0, count);

            // 4. Parallel Enrich (Queue or Batch)
            // We need: PE, ROE, ROCE (approx), Sales Growth, Profit Growth, Debt
            const enrichedQuotes = await Promise.all(quotesToEnrich.map(async (q: any) => {
                return await this.enrichStockData(q.symbol, q);
            }));

            // 5. Final Transform
            return enrichedQuotes;

        } catch (error) {
            this.logger.error(`Screener fetch failed: ${error.message}`);
            return [];
        }
    }

    private async enrichStockData(symbol: string, baseData: any) {
        // Check cache (15 min expiry)
        const CACHE_TTL = 15 * 60 * 1000;
        const cached = this.fundamentalsCache.get(symbol);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return { ...baseData, ...cached.data };
        }

        try {
            const yf = await this.getYahooClient();
            // Fetch key modules for fundamentals
            const modules = ['financialData', 'defaultKeyStatistics', 'summaryDetail'];

            // Handle suffix logic
            let querySymbol = symbol;
            if (!symbol.endsWith('.NS') && !symbol.endsWith('.BO')) querySymbol += '.NS'; // Default to NSE

            const res = await yf.quoteSummary(querySymbol, { modules });

            const financials = res.financialData || {};
            const stats = res.defaultKeyStatistics || {};
            const summary = res.summaryDetail || {};

            const enriched = {
                // Base override (more accurate realtime)
                price: financials.currentPrice || baseData.regularMarketPrice,
                marketCap: summary.marketCap || baseData.marketCap,
                peRatio: summary.trailingPE || baseData.trailingPE,

                // Deep Fundamentals
                bookValue: stats.bookValue,
                dividendYield: summary.dividendYield,
                roe: financials.returnOnEquity,
                roce: financials.returnOnAssets, // Proxy for ROCE (Yahoo doesn't give direct ROCE)
                totalDebt: financials.totalDebt,
                revenueGrowth: financials.revenueGrowth, // Sales growth (YoY quarterly usually)
                earningsGrowth: financials.earningsGrowth, // Profit growth

                // Extra
                sector: (res.summaryProfile as any)?.sector,
            };

            // Update Cache
            this.fundamentalsCache.set(symbol, { data: enriched, timestamp: Date.now() });

            return { ...baseData, ...enriched };

        } catch (e) {
            // If details fail, return base data
            return baseData;
        }
    }
}
