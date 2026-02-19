import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIConfigService } from '../stocks/ai-config.service';
import * as TechnicalIndicators from 'technicalindicators';
import { GroqService } from '../services/groq.service';
import { YahooFinanceService } from '../stocks/yahoo-finance.service';
import { SymbolResolverService } from './symbol-resolver.service';

@Injectable()
export class StrategistService {
    private readonly logger = new Logger(StrategistService.name);

    private strategyCache: Map<string, { result: string, timestamp: number, isFallback?: boolean }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(
        private configService: ConfigService,
        private aiConfig: AIConfigService,
        private groqService: GroqService,
        private yfService: YahooFinanceService,
        private symbolResolver: SymbolResolverService
    ) { }

    private async getYahooClient() {
        return this.yfService.getClient();
    }

    async analyze(query: string) {
        this.logger.log(`Analyzing query: ${query}`);

        // 1. Identify Stock Symbol using the robust SymbolResolverService
        const symbol = await this.extractSymbol(query);
        if (!symbol) {
            return {
                error: "I couldn't identify the stock symbol. Please mention the stock name clearly (e.g., 'Target for Reliance')."
            };
        }

        this.logger.log(`Identified Symbol: ${symbol}`);

        let quote, history, fundamentals, news, technicals, strategy;

        try {
            // 2. Fetch Holistic Data
            quote = await this.fetchQuote(symbol);

            if (!quote || !quote.regularMarketPrice) {
                return { error: `Could not fetch data for ${symbol}. Please check the symbol.` };
            }

            const newsQuery = quote.shortName || quote.longName || symbol;
            const cleanNewsQuery = newsQuery.replace(/Limited|Ltd\.?|Incorporated|Inc\.?|Corp\.?|Corporation/gi, '').trim();

            [history, fundamentals, news] = await Promise.all([
                this.fetchHistory(symbol),
                this.fetchFundamentals(symbol),
                this.fetchNews(cleanNewsQuery)
            ]);

            // 3. Calculate Technicals
            technicals = this.calculateTechnicals(history, quote.regularMarketPrice);

            // 4. Generate AI Strategy
            const strategyResult = await this.generateStrategy(query, symbol, quote, technicals, fundamentals, news);
            strategy = strategyResult.result;

            if (strategyResult.isFallback) {
                quote.isFallback = true;
            }

        } catch (err) {
            this.logger.error("Analysis pipeline failed", err);
            return { error: "Failed to generate comprehensive analysis. Please try again later." };
        }

        return {
            symbol,
            quote,
            technicals,
            fundamentals,
            news,
            strategy,
            isFallback: quote.isFallback || false
        };
    }

    async extractSymbol(query: string): Promise<string | null> {
        return await this.symbolResolver.resolve(query);
    }

    private async generateStrategy(query: string, symbol: string, quote: any, technicals: any, fundamentals: any, news: any[], retryCount = 0): Promise<any> {
        const cacheKey = `${symbol}_${query.toLowerCase().trim()}`;
        const cached = this.strategyCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached;
        }

        try {
            const prompt = `
            ROLE: You are the "StockX Private Wealth Strategist" - a world-class, empathetic Hedge Fund Manager. Your goal is to provide a highly structured, professional, and personalized "Million Dollar Strategy".

            USER CONTEXT: 
            The user is talking about ${symbol}. 
            Query: "${query}"
            If the user mentioned their entry price, quantity, or specific goals, ADDRESS THEM DIRECTLY and empathetically in the Executive Summary.
            
            DATA:
            - Price: ${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}%)
            - Sector/Industry: ${fundamentals.sector} | ${fundamentals.industry}
            - 52W High/Low: ${quote.fiftyTwoWeekHigh} / ${quote.fiftyTwoWeekLow}
            - Technicals: RSI=${technicals.rsi?.toFixed(2)}, MACD=${technicals.macdHistogram?.toFixed(2)}, Trend=${technicals.trend}, Volume Shock=${technicals.volumeShock}
            - Fundamentals: P/E=${fundamentals.pe?.toFixed(2)}, P/B=${fundamentals.pb?.toFixed(2)}, ROE=${fundamentals.roe ? (fundamentals.roe * 100).toFixed(2) : 'N/A'}%
            - Ownership: Insiders=${fundamentals.insidersPercent ? (fundamentals.insidersPercent * 100).toFixed(2) : 'N/A'}%, Institutions=${fundamentals.institutionsPercent ? (fundamentals.institutionsPercent * 100).toFixed(2) : 'N/A'}%
            - News: ${news.slice(0, 5).map((n: any) => n.title).join(' | ')}

            OUTPUT FORMAT (MANDATORY):
            # 🚀 Million Dollar Verdict: [BUY/SELL/HOLD]
            **Conviction**: [High/Medium/Low] | **Timeframe**: [Short/Medium/Long-term]

            💼 **Executive Summary**
            [Personalized greeting and connection. Empathize with their position or query. Give a quick summary of the alpha, mentioning high-impact signals like Volume Shocks or Institutional footprints if relevant.]

            🔍 **Deep Technical & Fundamental Analysis**
            [Provide a sophisticated, institutional-grade breakdown. Analyze the convergence of RSI, MACD, and Price Action. Evaluate fundamental health (P/E, ROE, Growth) relative to its SECTOR and INDUSTRY. Mention Institutional behavior or Volume abnormalities if they provide an edge. Synthesize news sentiment with technical trends to provide a comprehensive "Why" behind the verdict.]

            ⚡ **Action Plan & Checkpoints**
            - 🎯 **Entry Zone**: [Price range with reasoning]
            - 🏁 **Target 1 (Conservative)**: [Price with reasoning]
            - 🚀 **Target 2 (Aggressive)**: [Price with reasoning]
            - 🛑 **Stop Loss**: [Price with reasoning]

            ⚠️ **Risk Assessment**
            - [Key risk 1]
            - [Key risk 2]

            _Disclaimer: This is AI-generated analysis for educational purposes. Always do your own research._
            `;

            const startTime = Date.now();
            const result = await this.groqService.generateCompletion(prompt);

            // Simulating analysis time for UX
            const elapsed = Date.now() - startTime;
            if (elapsed < 3000) await new Promise(r => setTimeout(r, 3000 - elapsed));

            const response = {
                result,
                timestamp: Date.now(),
                isFallback: quote.isFallback || false
            };
            this.strategyCache.set(cacheKey, response);
            return response;
        } catch (error: any) {
            this.logger.error("Groq Generation Failed", error);
            throw error;
        }
    }

    private async fetchQuote(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const q = await yf.quote(symbol);
            if (q && q.regularMarketPrice) return q;

            // Fallback to Google Finance for basic price
            return await this.fetchGoogleFinanceExtended(symbol);
        } catch (e) {
            return await this.fetchGoogleFinanceExtended(symbol);
        }
    }

    private async fetchGoogleFinanceExtended(symbol: string) {
        try {
            let googleSymbol = symbol;
            let exchange = 'NSE';
            if (symbol.endsWith('.NS')) googleSymbol = symbol.replace('.NS', '');
            else if (symbol.endsWith('.BO')) { googleSymbol = symbol.replace('.BO', ''); exchange = 'BOM'; }

            const url = `https://www.google.com/finance/quote/${googleSymbol}:${exchange}`;
            // @ts-ignore
            const axios = (await import('axios')).default;
            const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

            const priceMatch = data.match(/<div class="YMlKec fxKbKc">[^0-9]*([0-9,]+\.?[0-9]*)<\/div>/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;

            // Extract Change Percent
            let changePercent = 0;
            const changeMatch = data.match(/<div class="[^"]*">[+]?(-?[0-9,]+\.?[0-9]*)%<\/div>/);
            const simpleMatch = data.match(/[+-][0-9,]+\.?[0-9]{1,2}%/);

            if (changeMatch && changeMatch[1]) {
                changePercent = parseFloat(changeMatch[1].replace(/,/g, ''));
            } else if (simpleMatch) {
                changePercent = parseFloat(simpleMatch[0].replace('%', '').replace('+', '').replace(/,/g, ''));
            }

            const extractStat = (label: string): number => {
                const regex = new RegExp(`${label}<\\/div>[^<]*<div[^>]*>([^<]*)<\\/div>`, 'i');
                const m = data.match(regex);
                if (m && m[1]) {
                    let valStr = m[1].replace(/,/g, '').trim();
                    if (valStr.includes('T')) return parseFloat(valStr) * 1e12;
                    if (valStr.includes('B')) return parseFloat(valStr) * 1e9;
                    if (valStr.includes('M')) return parseFloat(valStr) * 1e6;
                    if (valStr.includes('Cr')) return parseFloat(valStr) * 1e7;
                    return parseFloat(valStr) || 0;
                }
                return 0;
            };

            return {
                symbol,
                regularMarketPrice: price,
                regularMarketChangePercent: changePercent,
                marketCap: extractStat('Market cap'),
                trailingPE: extractStat('P/E ratio'),
                isFallback: true
            } as any;
        } catch (e) { return null; }
    }

    private async fetchHistory(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const past = new Date();
            past.setDate(past.getDate() - 400);
            return await yf.historical(symbol, { period1: past, period2: new Date(), interval: '1d' });
        } catch (e) { return []; }
    }

    private async fetchFundamentals(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const res = await yf.quoteSummary(symbol, {
                modules: [
                    'summaryDetail',
                    'financialData',
                    'defaultKeyStatistics',
                    'recommendationTrend',
                    'assetProfile',
                    'majorHoldersBreakdown'
                ]
            });
            return {
                pe: res.summaryDetail?.trailingPE,
                pb: res.defaultKeyStatistics?.priceToBook,
                roe: res.financialData?.returnOnEquity,
                roa: res.financialData?.returnOnAssets,
                revenueGrowth: res.financialData?.revenueGrowth,
                earningsGrowth: res.financialData?.earningsGrowth,
                debtToEquity: res.financialData?.debtToEquity,
                currentRatio: res.financialData?.currentRatio,
                targetHigh: res.financialData?.targetMeanPrice,
                recommendationTrend: res.recommendationTrend?.trend?.[0],
                sector: res.assetProfile?.sector,
                industry: res.assetProfile?.industry,
                insidersPercent: res.majorHoldersBreakdown?.insidersPercent,
                institutionsPercent: res.majorHoldersBreakdown?.institutionsPercent
            };
        } catch (e) { return {}; }
    }

    private async fetchNews(query: string) {
        try {
            const yf = await this.getYahooClient();
            const res = await yf.search(query, { newsCount: 5 });
            return res.news || [];
        } catch (e) { return []; }
    }

    private calculateTechnicals(history: any[], currentPrice: number) {
        if (!history || history.length < 50) return { rsi: 50, trend: 'NEUTRAL', macdHistogram: 0, support: currentPrice, resistance: currentPrice };

        const closes = history.map((c: any) => c.close);
        const highs = history.map((c: any) => c.high);
        const lows = history.map((c: any) => c.low);

        // RSI
        const rsiArr = TechnicalIndicators.RSI.calculate({ values: closes, period: 14 });

        // EMA 200 for Trend
        const ema200Arr = TechnicalIndicators.EMA.calculate({ period: Math.min(200, closes.length - 1), values: closes });
        const ema200 = ema200Arr[ema200Arr.length - 1] || 0;

        // MACD
        const macdInput = { values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false };
        const macdArr = TechnicalIndicators.MACD.calculate(macdInput);
        const latestMACD = macdArr[macdArr.length - 1];

        // Support/Resistance (Pivot Points)
        const last = history[history.length - 1];
        const pp = (last.high + last.low + last.close) / 3;
        const r1 = 2 * pp - last.low;
        const s1 = 2 * pp - last.high;

        // Volume Shock Detection
        const volumes = history.map((c: any) => c.volume);
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const lastVolume = volumes[volumes.length - 1];
        const volumeShock = lastVolume > (avgVolume * 1.5);

        return {
            rsi: rsiArr[rsiArr.length - 1] || 50,
            ema200: ema200,
            trend: currentPrice > ema200 ? 'BULLISH' : 'BEARISH',
            macdHistogram: latestMACD?.histogram || 0,
            support: s1 || currentPrice * 0.98,
            resistance: r1 || currentPrice * 1.02,
            volumeShock: volumeShock ? 'POSITIVE' : 'NEUTRAL',
            avgVolume
        };
    }
}
