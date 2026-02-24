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
ROLE: You are the Chief Investment Officer (CIO) at StockX. You manage long-only capital with fiduciary responsibility. Every recommendation must reflect capital preservation, disciplined risk assessment, and probability-weighted returns. This platform is strictly for investments — NOT intraday trading. Your responsibility: protect downside, capture asymmetric upside.

USER QUERY: "${query}"
STOCK: ${symbol}

MARKET DATA:
- Current Price: ₹${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}% today)
- 52W Range: ₹${quote.fiftyTwoWeekLow} – ₹${quote.fiftyTwoWeekHigh}
- Sector / Industry: ${fundamentals.sector || 'N/A'} / ${fundamentals.industry || 'N/A'}
- P/E: ${fundamentals.pe?.toFixed(2) ?? 'N/A'} | P/B: ${fundamentals.pb?.toFixed(2) ?? 'N/A'}
- ROE: ${fundamentals.roe ? (fundamentals.roe * 100).toFixed(2) + '%' : 'N/A'} | ROA: ${fundamentals.roa ? (fundamentals.roa * 100).toFixed(2) + '%' : 'N/A'}
- Revenue Growth: ${fundamentals.revenueGrowth ? (fundamentals.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'} | Earnings Growth: ${fundamentals.earningsGrowth ? (fundamentals.earningsGrowth * 100).toFixed(2) + '%' : 'N/A'}
- Debt/Equity: ${fundamentals.debtToEquity?.toFixed(2) ?? 'N/A'} | Current Ratio: ${fundamentals.currentRatio?.toFixed(2) ?? 'N/A'}
- Analyst Target (Mean): ₹${fundamentals.targetHigh ?? 'N/A'}
- Insider Holding: ${fundamentals.insidersPercent ? (fundamentals.insidersPercent * 100).toFixed(1) + '%' : 'N/A'} | Institutional Holding: ${fundamentals.institutionsPercent ? (fundamentals.institutionsPercent * 100).toFixed(1) + '%' : 'N/A'}
- Technical Trend: ${technicals.trend} | RSI(14): ${technicals.rsi?.toFixed(2)} | MACD Histogram: ${technicals.macdHistogram?.toFixed(4)}
- Support: ₹${technicals.support?.toFixed(2)} | Resistance: ₹${technicals.resistance?.toFixed(2)}
- Volume Shock: ${technicals.volumeShock}
- Recent News: ${news.slice(0, 5).map((n: any) => n.title).join(' || ')}

INSTRUCTIONS — MANDATORY OUTPUT FORMAT:

First, silently detect the investment horizon from the query:
- Short-Term Investment = 3–6 months
- Medium-Term Investment = 6–24 months  
- Long-Term Investment = 3–5+ years
- If unspecified → assume Medium-Term

Then apply dynamic weight to your analysis:
- Short-Term: Business Quality 20%, Growth Visibility 30%, Valuation 20%, Technical Structure 20%, Risk Stability 10%
- Medium-Term: Business Quality 35%, Growth Visibility 35%, Valuation 20%, Technical Structure 5%, Risk Stability 5%
- Long-Term: Business Quality 50%, Growth Visibility 25%, Valuation 15%, Technical Structure 0%, Risk Stability 10%

Now produce your full CIO-grade report using EXACTLY the sections below. Do not omit any section. Do not use cheerful emojis or marketing tone. Write with the gravity of a fund manager.

---

## CIO Investment Brief: ${symbol}

**Detected Horizon:** [Short-Term / Medium-Term / Long-Term]

---

### 1. Context

[Open with 2–3 professional sentences that acknowledge the user's stated capital (if any), reference the investment horizon, and set a calm, responsible tone. Include a subtle trust-building line if the user mentioned a specific capital amount — e.g., "I understand this ₹X represents meaningful capital. Our approach prioritizes disciplined compounding over short-term excitement." Do NOT be dramatic or use hype.]

---

### 2. Final Verdict

**Verdict: BUY / HOLD / AVOID**
**Conviction Level:** High / Medium / Low
**Conviction Score:** XX / 100

[One sentence explaining the primary driver of this verdict.]

---

### 3. Investment Thesis

**Core Business Driver:**
[What does this company primarily do and why is that business durable or under threat?]

**Earnings Growth Visibility:**
[Is earnings growth visible for the next 2–3 years? What drives it?]

**Competitive Positioning:**
[Is there a moat? Market leadership or commoditized business?]

**Valuation vs Peers:**
[Is the stock cheap, fairly valued, or expensive relative to sector peers and its own history?]

---

### 4. Valuation Logic

[Answer three questions concisely:
1. Is the current valuation justified by the growth rate?
2. What is the margin of safety, if any?
3. Is there a re-rating probability — and what would trigger it?]

---

### 5. Risk Matrix

| Risk Category | Key Risk | Severity |
|---|---|---|
| Business Risk | [Specific risk] | Low / Moderate / High |
| Sector Risk | [Specific risk] | Low / Moderate / High |
| Financial Risk | [Specific risk] | Low / Moderate / High |
| Regulatory / Macro Risk | [Specific risk] | Low / Moderate / High |

**Overall Risk Classification:** Low / Moderate / Elevated

---

### 6. Scenario Modeling

| Scenario | Probability | Expected CAGR | Price Target |
|---|---|---|---|
| Bull Case | X% | +XX% p.a. | ₹XXXX |
| Base Case | X% | +XX% p.a. | ₹XXXX |
| Bear Case | X% | -XX% p.a. | ₹XXXX |

**Probability-Weighted Expected Return:** ~XX% CAGR

[One sentence on what would drive the bull or bear case.]

---

### 7. Risk-Adjusted Return Profile

- **Expected CAGR (Base):** X–Y%
- **Estimated Downside Risk:** Z%
- **Risk / Reward Ratio:** 1 : N

[If R:R is below 1:2, explicitly state that conviction is reduced accordingly.]

---

### 8. Capital Deployment Plan

[Tailor this section to the user's mentioned capital amount. If no amount is mentioned, use a generic ₹1,00,000 example.]

- **Approach:** Lump Sum / Staggered Entry
- **Deploy Now (%):** X% at current levels (₹XXXX)
- **Deploy on Correction (%):** Y% if price corrects to ₹XXXX
- **Maximum Suggested Portfolio Exposure:** Z% of total investable capital

[One sentence on rationale for the staggering strategy.]

---

### 9. Exit Discipline

[Choose the appropriate triggers based on detected horizon:]

**For Short-Term:** Invalidation level = ₹XXXX (price action breakdown below this level exits the thesis)
**For Medium-Term:** Exit if [specific earnings or business metric] deteriorates for [N] consecutive quarters
**For Long-Term:** Exit only if [structural business deterioration trigger — e.g., market share loss > X%, management change, regulatory reversal]

[No random stop losses. Only thesis-based exits.]

---

*Disclaimer: This analysis is AI-generated for educational and informational purposes only. It does not constitute financial advice. Always conduct independent research before making investment decisions.*
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
