import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
// @ts-ignore
import * as yahooFinance from 'yahoo-finance2';
import * as TechnicalIndicators from 'technicalindicators';

@Injectable()
export class StrategistService {
    private readonly logger = new Logger(StrategistService.name);
    private genAI: GoogleGenerativeAI;
    private model: any;
    private yf: any;

    private static readonly COMMON_STOCKS: Record<string, string> = {
        'RELIANCE': 'RELIANCE', 'TATA MOTORS': 'TATAMOTORS', 'HDFC BANK': 'HDFCBANK',
        'INFY': 'INFY', 'ITC': 'ITC', 'SBI': 'SBIN', 'SBIN': 'SBIN', 'BAJFINANCE': 'BAJFINANCE',
        'ZOMATO': 'ZOMATO', 'INDUS TOWERS': 'INDUSTOWER', 'BHARTI AIRTEL': 'BHARTIARTL',
        'COAL INDIA': 'COALINDIA', 'ADANI ENT': 'ADANIENT', 'ASIAN PAINTS': 'ASIANPAINT',
        'MARUTI': 'MARUTI', 'TITAN': 'TITAN', 'ULTRATECH': 'ULTRACEMCO', 'WIPRO': 'WIPRO',
        'NESTLE': 'NESTLEIND', 'JSW STEEL': 'JSWSTEEL', 'GRASIM': 'GRASIM', 'L&T': 'LT',
        'POWERGRID': 'POWERGRID', 'NTPC': 'NTPC', 'TATA STEEL': 'TATASTEEL', 'HCL TECH': 'HCLTECH',
        'BSE': 'BSE'
    };

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('STRATEGIST_GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.error('STRATEGIST_GEMINI_API_KEY is not set in environment variables!');
        } else {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        }
    }

    // ... (rest of class)

    private async generateStrategy(query: string, symbol: string, quote: any, technicals: any, fundamentals: any, news: any[]) {
        if (!this.model) return "AI Model not configured.";

        try {
            // ... (keep existing prompt construction) ...

            const prompt = `
            Act as "StocksX Strategist", a top-tier Hedge Fund AI Analyst.
            
            USER QUERY: "${query}"
            STOCK: ${symbol} (${quote.longName || symbol})
            Current Price: ${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}%)
            
            [TECHNICAL ANALYSIS]
            RSI (14): ${technicals.rsi}
            MACD: ${technicals.macd.MACD?.toFixed(2)} (Signal: ${technicals.macd.signal?.toFixed(2)}, Histogram: ${technicals.macd.histogram?.toFixed(2)})
            EMAs: EMA20=${technicals.ema20}, EMA50=${technicals.ema50}, EMA200=${technicals.ema200}
            Trend: Price is ${quote.regularMarketPrice > technicals.ema200 ? 'ABOVE' : 'BELOW'} 200 EMA.
            Support/Resistance: ${JSON.stringify(technicals.pivotPoints)}
            
            [FUNDAMENTALS]
            PE Ratio: ${fundamentals.trailingPE?.toFixed(2)}
            Market Cap: ${(fundamentals.marketCap / 10000000).toFixed(2)} Cr
            ROE: ${(fundamentals.returnOnEquity * 100).toFixed(2)}%
            Debt/Equity: ${fundamentals.debtToEquity?.toFixed(2)}
            
            [NEWS SENTIMENT]
            ${news.slice(0, 3).map((n: any) => `- ${n.title}`).join('\n')}
            
            YOUR GOAL: Provide a "Million Dollar Strategy" for this specific situation.
            
            RESPONSE FORMAT (Markdown):
            
            ## 🎯 The Verdict: [BUY / SELL / HOLD / ACCUMULATE]
            **Conviction**: [High/Medium/Low] | **Timeframe**: [Short/Medium/Long Term]
            
            ### 🔍 Strategic Rationale
            (Explain WHY based on the data. Connect technicals with fundamentals. Be specific.)
            
            ### ⚡ Actionable Levels
            - **Entry Zone**: [Price Range]
            - **Target 1**: [Price]
            - **Target 2**: [Price]
            - **Stop Loss**: [Price]
            
            ### ⚠️ Risk Warning
            (What could go wrong? Specific to this stock/sector)
            `;

            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (error: any) {
            if (error.status === 429 || error.message?.includes('429')) {
                this.logger.warn('AI Rate Limit Exceeded');
                return "## ⚠️ System Busy\n\nOur AI Strategist is currently experiencing high demand. Please try again in a minute.";
            }
            throw error;
        }
    }

    private async getYahooClient() {
        if (this.yf) return this.yf;
        // @ts-ignore
        const pkg = await import('yahoo-finance2');
        const YahooFinanceClass = pkg.default || pkg;
        if (typeof YahooFinanceClass === 'function') {
            // @ts-ignore
            this.yf = new YahooFinanceClass({ validation: { logErrors: false } });
        } else {
            this.yf = YahooFinanceClass;
        }
        return this.yf;
    }


    async analyze(query: string) {
        this.logger.log(`Analyzing query: ${query}`);

        // 1. Identify Stock Symbol using AI (Simple extraction)
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
            [quote, history, fundamentals, news] = await Promise.all([
                this.fetchQuote(symbol),
                this.fetchHistory(symbol), // 300 days for 200DMA
                this.fetchFundamentals(symbol),
                this.fetchNews(symbol)
            ]);

            if (!quote || !quote.regularMarketPrice) {
                return { error: `Could not fetch data for ${symbol}. Please check the symbol.` };
            }

            // 3. Calculate Technicals
            technicals = this.calculateTechnicals(history, quote.regularMarketPrice);

            // 4. Generate AI Strategy
            strategy = await this.generateStrategy(query, symbol, quote, technicals, fundamentals, news);

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
            strategy
        };
    }

    private async extractSymbol(query: string): Promise<string | null> {
        try {
            const upperQuery = query.toUpperCase();
            const commonWords = new Set(['BOUGHT', 'SHARES', 'SHARE', 'PRICE', 'TARGET', 'ACTION', 'VERDICT', 'MOVE', 'NEXT', 'SELL', 'BUY', 'HOLD', 'ENTRY', 'STOP', 'LOSS', 'ZONE']);

            // 1. Direct Regex Match
            const symbolRegex = /\b[A-Z0-9-]{3,15}(\.(NS|BO))?\b/g;
            const matches = upperQuery.match(symbolRegex) || [];

            // Priority 1: Has .NS or .BO suffix (High confidence)
            const explicitMatch = matches.find(m => m.includes('.NS') || m.includes('.BO'));
            if (explicitMatch) return explicitMatch;

            // Priority 2: Filter out common words and pick the most likely candidate
            const candidates = matches.filter(m => !commonWords.has(m) && !/^\d+$/.test(m));
            if (candidates.length === 1) {
                // If it's a known symbol in our common map, use that mapping
                const mapped = this.getCommonMapping(candidates[0]);
                return mapped || candidates[0];
            }

            // Common mapping for popular stocks that might be missed
            const mappedResult = this.checkCommonMapping(upperQuery);
            if (mappedResult) return mappedResult;

            // 2. AI Extraction for complex or unmapped names
            if (!this.model) return null;

            const prompt = `
            Task: Identify the NSE/BSE stock symbol from the user's query.
            Query: "${query}"
            
            Rules:
            1. Return ONLY the symbol with .NS suffix (e.g. INDUSTOWER.NS, RELIANCE.NS).
            2. If multiple mentions, return the main one.
            3. Common mapping: "Indus Towers" -> INDUSTOWER.NS, "M&M" -> M&M.NS.
            4. If NO valid stock found, return "NULL".
            
            Output Example: RELIANCE.NS
            Output:`;

            const result = await this.model.generateContent(prompt);
            const text = result.response.text().trim().replace(/['"`]/g, '').split('\n')[0].split(' ')[0]; // Clean output

            return text === 'NULL' ? null : text;
        } catch (e) {
            this.logger.error('Symbol extraction failed', e);
            return null;
        }
    }

    private async fetchQuote(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            return await yf.quote(symbol);
        } catch (e) {
            this.logger.error(`Quote fetch failed for ${symbol}`, e);
            return null;
        }
    }

    private async fetchHistory(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const today = new Date();
            const past = new Date();
            past.setDate(today.getDate() - 400); // Fetch enough for 200 EMA

            return await yf.historical(symbol, {
                period1: past,
                period2: today,
                interval: '1d'
            });
        } catch (e) {
            return [];
        }
    }

    private async fetchFundamentals(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const res = await yf.quoteSummary(symbol, { modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics'] });
            return {
                pe: res.summaryDetail?.trailingPE,
                pb: res.defaultKeyStatistics?.priceToBook,
                roe: res.financialData?.returnOnEquity,
                debtToEquity: res.financialData?.debtToEquity,
                margins: res.financialData?.profitMargins,
                targetHigh: res.financialData?.targetMeanPrice
            };
        } catch (e) { return {}; }
    }

    private async fetchNews(symbol: string) {
        try {
            const yf = await this.getYahooClient();
            const res = await yf.search(symbol, { newsCount: 3 });
            return res.news || [];
        } catch (e) { return []; }
    }

    private calculateTechnicals(history: any[], currentPrice: number) {
        if (!history || history.length < 200) return null;

        const closes = history.map((c: any) => c.close);
        const highs = history.map((c: any) => c.high);
        const lows = history.map((c: any) => c.low);

        // RSI
        const rsiInput = { values: closes, period: 14 };
        const rsi = TechnicalIndicators.RSI.calculate(rsiInput);
        const currentRSI = rsi[rsi.length - 1];

        // MACD
        const macdInput = { values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false };
        const macd = TechnicalIndicators.MACD.calculate(macdInput);
        const currentMACD = macd[macd.length - 1];
        const macdHistogram = currentMACD ? currentMACD.histogram : 0;


        // EMAs
        const ema20Arr = TechnicalIndicators.EMA.calculate({ period: 20, values: closes });
        const ema50Arr = TechnicalIndicators.EMA.calculate({ period: 50, values: closes });
        const ema200Arr = TechnicalIndicators.EMA.calculate({ period: 200, values: closes });

        const ema20 = ema20Arr[ema20Arr.length - 1];
        const ema50 = ema50Arr[ema50Arr.length - 1];
        const ema200 = ema200Arr[ema200Arr.length - 1];


        // Support/Resistance (Simple Pivot Points based on last candle)
        const last = history[history.length - 1];
        const pp = (last.high + last.low + last.close) / 3;
        const r1 = 2 * pp - last.low;
        const s1 = 2 * pp - last.high;

        return {
            rsi: currentRSI,
            macd: currentMACD,
            ema20,
            ema50,
            ema200,
            support: s1,
            resistance: r1,
            trend: currentPrice > ema200 ? 'BULLISH' : 'BEARISH',
            pivotPoints: { s1, r1, pp }
        };
    }

    private getCommonMapping(symbol: string): string | null {
        const val = StrategistService.COMMON_STOCKS[symbol];
        return val ? val + '.NS' : null;
    }

    private checkCommonMapping(query: string): string | null {
        for (const [key, val] of Object.entries(StrategistService.COMMON_STOCKS)) {
            if (query.includes(key)) return val + '.NS';
        }
        return null;
    }
}
