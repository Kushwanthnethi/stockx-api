import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIConfigService } from '../stocks/ai-config.service';
import * as TechnicalIndicators from 'technicalindicators';
import { GroqService } from '../services/groq.service';

@Injectable()
export class StrategistService {
    private readonly logger = new Logger(StrategistService.name);
    private yf: any;

    private static readonly COMMON_STOCKS: Record<string, string> = {
        // Nifty 50 / Major Large Caps
        'RELIANCE': 'RELIANCE', 'TCS': 'TCS', 'HDFCBANK': 'HDFCBANK', 'ICICIBANK': 'ICICIBANK',
        'INFY': 'INFY', 'BHARTIARTL': 'BHARTIARTL', 'ITC': 'ITC', 'SBIN': 'SBIN', 'SBI': 'SBIN',
        'LICI': 'LICI', 'LIC': 'LICI', 'HINDUNILVR': 'HINDUNILVR', 'LT': 'LT', 'BAJFINANCE': 'BAJFINANCE',
        'HCLTECH': 'HCLTECH', 'MARUTI': 'MARUTI', 'SUNPHARMA': 'SUNPHARMA', 'ADANIENT': 'ADANIENT',
        'TATAMOTORS': 'TATAMOTORS', 'TITAN': 'TITAN', 'AXISBANK': 'AXISBANK', 'ONGC': 'ONGC',
        'NTPC': 'NTPC', 'ULTRACEMCO': 'ULTRACEMCO', 'POWERGRID': 'POWERGRID', 'M&M': 'M&M',
        'MAHINDRA': 'M&M', 'TATASTEEL': 'TATASTEEL', 'COALINDIA': 'COALINDIA', 'JSWSTEEL': 'JSWSTEEL',
        'BAJAJFINSV': 'BAJAJFINSV', 'ADANIPORTS': 'ADANIPORTS', 'BPCL': 'BPCL', 'KOTAKBANK': 'KOTAKBANK',
        'NESTLEIND': 'NESTLEIND', 'NESTLE': 'NESTLEIND', 'GRASIM': 'GRASIM', 'EICHERMOT': 'EICHERMOT',
        'DRREDDY': 'DRREDDY', 'CIPLA': 'CIPLA', 'TATAELXSI': 'TATAELXSI', 'TECHM': 'TECHM',
        'WIPRO': 'WIPRO', 'ADANIGREEN': 'ADANIGREEN', 'ADANIPOWER': 'ADANIPOWER', 'HAL': 'HAL',
        'HINDUSTAN AERONAUTICS': 'HAL', 'BEL': 'BEL', 'BHARAT ELECTRONICS': 'BEL', 'VBL': 'VBL',
        'VARUN BEVERAGES': 'VBL', 'IOC': 'IOC', 'VEDL': 'VEDL', 'VEDANTA': 'VEDL', 'DLF': 'DLF',
        'SIEMENS': 'SIEMENS', 'LTIM': 'LTIM', 'LTIMINDTREE': 'LTIM', 'PIDILITIND': 'PIDILITIND',
        'TRENT': 'TRENT', 'INDIGO': 'INDIGO', 'INTERGLOBE': 'INDIGO', 'ZOMATO': 'ZOMATO',
        'GAIL': 'GAIL', 'AMBUJACEM': 'AMBUJACEM', 'PNB': 'PNB', 'BANKBARODA': 'BANKBARODA',
        'CANBK': 'CANBK', 'DIVISLAB': 'DIVISLAB', 'DABUR': 'DABUR', 'GODREJCP': 'GODREJCP',
        'SHREECEM': 'SHREECEM', 'CHOLAFIN': 'CHOLAFIN', 'TVSMOTOR': 'TVSMOTOR', 'HAVELLS': 'HAVELLS',
        'ABB': 'ABB', 'INDUSINDBK': 'INDUSINDBK', 'NAUKRI': 'NAUKRI', 'INFOEDGE': 'NAUKRI',
        'POLYCAB': 'POLYCAB', 'JIOFIN': 'JIOFIN', 'JIO FINANCIAL': 'JIOFIN', 'AUBANK': 'AUBANK',
        'ALKEM': 'ALKEM', 'HDFCLIFE': 'HDFCLIFE', 'SBILIFE': 'SBILIFE', 'ICICIPRULI': 'ICICIPRULI',
        'MOTHERSON': 'MOTHERSON', 'SAMVARDHANA': 'MOTHERSON', 'LODHA': 'LODHA', 'MACROTECH': 'LODHA',
        'SRF': 'SRF', 'IRFC': 'IRFC', 'RVNL': 'RVNL', 'IRCON': 'IRCON', 'RITES': 'RITES',
        'RAILTEL': 'RAILTEL', 'SJVN': 'SJVN', 'NHPC': 'NHPC', 'TORNTPOWER': 'TORNTPOWER',
        'TATACHEM': 'TATACHEM', 'TATAPOWER': 'TATAPOWER', 'PATANJALI': 'PATANJALI', 'MARICO': 'MARICO',
        'APOLLOHOSP': 'APOLLOHOSP', 'BOSCHLTD': 'BOSCHLTD', 'COLPAL': 'COLPAL', 'BERGEPAINT': 'BERGEPAINT',
        'ICICIGI': 'ICICIGI', 'SBICARD': 'SBICARD', 'INDUSTOWER': 'INDUSTOWER', 'BHARATFORG': 'BHARATFORG',
        'UNITEDSPIRITS': 'MCDOWELL-N', 'MCDOWELL': 'MCDOWELL-N', 'JINDALSTEL': 'JINDALSTEL',
        'JSWENERGY': 'JSWENERGY', 'LUPIN': 'LUPIN', 'AUROPHARMA': 'AUROPHARMA', 'PERSISTENT': 'PERSISTENT',
        'KPITTECH': 'KPITTECH', 'COFORGE': 'COFORGE', 'MUTHOOTFIN': 'MUTHOOTFIN', 'PIIND': 'PIIND',
        'ASHOKLEY': 'ASHOKLEY', 'ASTRAL': 'ASTRAL', 'CUMMINSIND': 'CUMMINSIND', 'ABCAPITAL': 'ABCAPITAL',
        'ADITYA BIRLA CAPITAL': 'ABCAPITAL', 'OBEROIRLTY': 'OBEROIRLTY', 'PHOENIXLTD': 'PHOENIXLTD',
        'PRESTIGE': 'PRESTIGE', 'GODREJPROP': 'GODREJPROP', 'MANYATA': 'EMBASSY', 'EMBASSY': 'EMBASSY',
        'SUZLON': 'SUZLON', 'IDEA': 'IDEA', 'VODAFONE IDEA': 'IDEA', 'YESBANK': 'YESBANK',
        'IDFCFIRSTB': 'IDFCFIRSTB', 'FEDERALBNK': 'FEDERALBNK', 'BANDHANBNK': 'BANDHANBNK',
        'INDIANB': 'INDIANB', 'UNIONBANK': 'UNIONBANK', 'MAHABANK': 'MAHABANK', 'UCOBANK': 'UCOBANK',
        'IOB': 'IOB', 'CENTRALBK': 'CENTRALBK', 'J&KBANK': 'J&KBANK', 'KARURVYSYA': 'KARURVYSYA',
        'CUB': 'CUB', 'CITY UNION': 'CUB', 'RBLBANK': 'RBLBANK', 'PAYTM': 'PAYTM',
        'ONE97': 'PAYTM', 'NYKAA': 'NYKAA', 'FSN': 'NYKAA', 'DELHIVERY': 'DELHIVERY',
        'PBFINTECH': 'POLICYBZR', 'POLICYBAZAAR': 'POLICYBZR', 'STARHEALTH': 'STARHEALTH',
        'M&MFIN': 'M&MFIN', 'L&TFH': 'L&TFH', 'SHRIRAMFIN': 'SHRIRAMFIN', 'LICHSGFIN': 'LICHSGFIN',
        'POONAWALLA': 'POONAWALLA', 'MANAPPURAM': 'MANAPPURAM', 'CREDITACC': 'CREDITACC',
        'MRF': 'MRF', 'BALKRISIND': 'BALKRISIND', 'APOLLOTYRE': 'APOLLOTYRE', 'CEATLTD': 'CEATLTD',
        'JKTYRE': 'JKTYRE', 'PAGEIND': 'PAGEIND', 'BATAINDIA': 'BATAINDIA', 'RELAXO': 'RELAXO',
        'METROBRAND': 'METROBRAND', 'KALYANKJIL': 'KALYANKJIL', 'RAJESHEXPO': 'RAJESHEXPO',
        'VOLTAS': 'VOLTAS', 'WHIRLPOOL': 'WHIRLPOOL', 'BLUESTARCO': 'BLUESTARCO', 'CROMPTON': 'CROMPTON',
        'TTKPRESTIG': 'TTKPRESTIG', 'KAJARIACER': 'KAJARIACER', 'CENTURYPLY': 'CENTURYPLY',
        'SUPREMEIND': 'SUPREMEIND', 'FINCABLES': 'FINCABLES', 'KEI': 'KEI', 'DIXON': 'DIXON',
        'AMBER': 'AMBER', 'HONAUT': 'HONAUT', '3MINDIA': '3MINDIA', 'SCHAEFFLER': 'SCHAEFFLER',
        'SKFINDIA': 'SKFINDIA', 'TIMKEN': 'TIMKEN', 'AIAENG': 'AIAENG', 'THERMAX': 'THERMAX',
        'TRIVENI': 'TRIVENI', 'PRAJIND': 'PRAJIND', 'NBCC': 'NBCC', 'HUDCO': 'HUDCO',
        'ACE': 'ACE', 'ACTION CONST': 'ACE', 'ENGINERSIN': 'ENGINERSIN', 'EIL': 'ENGINERSIN',
        'BHEL': 'BHEL', 'COCHINSHIP': 'COCHINSHIP', 'MAZDOCK': 'MAZDOCK', 'GRSE': 'GRSE',
        'BDL': 'BDL', 'DATAPATTNS': 'DATAPATTNS', 'MTARTECH': 'MTARTECH', 'PARAS': 'PARAS',
        'SOLARINDS': 'SOLARINDS', 'ZEN': 'ZENTEC', 'ZENTEC': 'ZENTEC', 'ASTRAMICRO': 'ASTRAMICRO',
        'BEML': 'BEML', 'ANANTRAJ': 'ANANTRAJ', 'ANANT RAJ': 'ANANTRAJ', 'BSE': 'BSE',
        'CDSL': 'CDSL', 'MCX': 'MCX', 'IEX': 'IEX', 'CAMS': 'CAMS',
        'ANGELONE': 'ANGELONE', 'MOTILALOFS': 'MOTILALOFS', 'IIFL': 'IIFL',
        'EXIDEIND': 'EXIDEIND', 'AMARAJABAT': 'AMARAJABAT', 'HBLPOWER': 'HBLPOWER',
        'MAPMYINDIA': 'MAPMYINDIA', 'CEINFO': 'MAPMYINDIA', 'NAZARA': 'NAZARA', 'EASEMYTRIP': 'EASEMYTRIP',
        'RATEGAIN': 'RATEGAIN', 'TRACXN': 'TRACXN', 'ROUTE': 'ROUTE', 'LATENTVIEW': 'LATENTVIEW',
        'HAPPSTMNDS': 'HAPPSTMNDS', 'TANLA': 'TANLA', 'SONACOMS': 'SONACOMS', 'JBMA': 'JBMA',
        'OLECTRA': 'OLECTRA', 'JBM AUTO': 'JBMA', 'GREAVESCOT': 'GREAVESCOT',
        'CASTROLIND': 'CASTROLIND', 'OIL': 'OIL', 'GSPL': 'GSPL', 'IGL': 'IGL',
        'MGL': 'MGL', 'GUJGASLTD': 'GUJGASLTD', 'PETRONET': 'PETRONET', 'CHENNPETRO': 'CHENNPETRO',
        'MRPL': 'MRPL', 'HINDPETRO': 'HINDPETRO', 'DEEPAKNTR': 'DEEPAKNTR', 'NAVINFLUOR': 'NAVINFLUOR',
        'AARTIIND': 'AARTIIND', 'ATUL': 'ATUL', 'UPL': 'UPL',
        'COROMANDEL': 'COROMANDEL', 'CHAMBLFERT': 'CHAMBLFERT', 'FACT': 'FACT',
        'RCF': 'RCF', 'GNFC': 'GNFC', 'GSFC': 'GSFC', 'NFL': 'NFL',
        'ZEEL': 'ZEEL', 'SUNTV': 'SUNTV', 'PVRINOX': 'PVRINOX', 'PVR': 'PVRINOX',
        'INOXLEISUR': 'PVRINOX', 'NETWORK18': 'NETWORK18', 'TV18BRDCST': 'TV18BRDCST',
        'ARE&M': 'ARE&M', 'AMARA RAJA': 'ARE&M',
        'PREMIER ENERGIES': 'PREMIERENE.NS', 'PREMIER': 'PREMIERENE.NS', 'PREMIERENE': 'PREMIERENE.NS'
    };

    private strategyCache: Map<string, { result: string, timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(
        private configService: ConfigService,
        private aiConfig: AIConfigService,
        private groqService: GroqService
    ) { }

    // ... (rest of class)

    private async generateStrategy(query: string, symbol: string, quote: any, technicals: any, fundamentals: any, news: any[], retryCount = 0): Promise<string> {
        // 1. Check Cache
        const cacheKey = `${symbol}_${query.toLowerCase().trim()}`;
        const cached = this.strategyCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            this.logger.log(`Serving cached strategy for ${symbol}`);
            return cached.result;
        }

        try {
            // Pro Prompt: Full "Hedge Fund Analyst" Persona for Groq/Llama 3
            const prompt = `
            ROLE: You are a world-class Hedge Fund Manager & Customer Success Obsessed Analyst at "StockX Strategist".
            YOUR GOAL: Provide a "Million Dollar Strategy" for the user. Your tone must be professional yet enthusiastic, highly detailed, and "customer-obsessed". Treat the user like a valued partner.

            TASK: Analyze ${symbol} based on the provided data and the user's query: "${query}".

            DATA:
            - Price: ${quote.regularMarketPrice} (${quote.regularMarketChangePercent?.toFixed(2)}%)
            - 52W High/Low: ${quote.fiftyTwoWeekHigh} / ${quote.fiftyTwoWeekLow}
            - Technicals:
                - RSI (14): ${technicals.rsi?.toFixed(2)} (Overbought > 70, Oversold < 30)
                - MACD: ${technicals.macd.MACD?.toFixed(2)} | Signal: ${technicals.macd.signal?.toFixed(2)} | Hist: ${technicals.macd.histogram?.toFixed(2)}
                - EMAs: 20=${technicals.ema20?.toFixed(2)}, 50=${technicals.ema50?.toFixed(2)}, 200=${technicals.ema200?.toFixed(2)}
                - Bollinger Bands: Upper=${technicals.bb?.upper?.toFixed(2)}, Lower=${technicals.bb?.lower?.toFixed(2)}
                - ATR (Volatility): ${technicals.atr?.toFixed(2)}
                - ROC (Momentum): ${technicals.roc?.toFixed(2)}
                - Trend: ${quote.regularMarketPrice > technicals.ema200 ? 'BULLISH (Above 200EMA)' : 'BEARISH (Below 200EMA)'}
                - Support (S1): ${technicals.pivotPoints?.s1?.toFixed(2)} | Resistance (R1): ${technicals.pivotPoints?.r1?.toFixed(2)}
            - Fundamentals:
                - P/E: ${fundamentals.pe?.toFixed(2)} | P/B: ${fundamentals.pb?.toFixed(2)}
                - ROE: ${fundamentals.roe ? (fundamentals.roe * 100).toFixed(2) : 'N/A'}% | ROA: ${fundamentals.roa ? (fundamentals.roa * 100).toFixed(2) : 'N/A'}%
                - Growth: Rev=${fundamentals.revenueGrowth ? (fundamentals.revenueGrowth * 100).toFixed(2) : 'N/A'}% | Earnings=${fundamentals.earningsGrowth ? (fundamentals.earningsGrowth * 100).toFixed(2) : 'N/A'}%
                - Debt/Equity: ${fundamentals.debtToEquity?.toFixed(2)} | Current Ratio: ${fundamentals.currentRatio?.toFixed(2)}
                - Target High: ${fundamentals.targetHigh}
            - Institutional Sentiment (Brokerages):
                - Trend: ${JSON.stringify(fundamentals.recommendationTrend || 'N/A')}
                - Recent Actions: ${fundamentals.upgrades ? fundamentals.upgrades.map((u: any) => `${u.action} to ${u.toGrade} by ${u.firm}`).join(' | ') : 'N/A'}
            - Recent News Headlines (Focus on Tenders/Contracts/Upgrades): ${news.slice(0, 5).map((n: any) => n.title).join(' | ')}

            INSTRUCTIONS:
            1. **Language Style**: Use **SIMPLE, DIRECT, and EASY TO UNDERSTAND English**. Avoid fancy vocabulary or complex sentence structures. Write as if you are explaining to a friend in India. Be clear and straightforward.
            2. **Hook the User**: Start with a high-energy, impactful executive summary. If they bought at a good price, congratulate them! If they are trapped, offer a rescue plan.
            3. **Deep Dive**: Don't just list numbers. Explain *why* the RSI or MACD matters right now. Connect the dots between the fundamental valuation (P/E) and the technical price action.
            4. **Be Decisive**: Give a clear BUY, SELL, or HOLD verdict. No hedging.
            5. **Structuring**: Use the exact Markdown format below.

            OUTPUT FORMAT (Markdown):

            ## 🚀 Million Dollar Verdict: [BUY / SELL / HOLD]
            **Conviction**: [Low / Medium / High] | **Timeframe**: [Short-term / Medium-term / Long-term]

            ### 💼 Executive Summary
            (A 3-4 sentence high-level overview. directly addressing the user's query with enthusiasm and insight. use simple words.)

            ### 🔍 Deep Technical & Fundamental Analysis
            (Two detailed paragraphs. First, analyze the price action, trends, and indicators like RSI/MACD. Second, discuss the valuation, fundamentals, and news impact. Explain the "Story" behind the stock. Keep language simple.)

            ### ⚡ Action Plan & Checkpoints
            - **🎯 Entry Zone**: [Specific Price Range] (Explain why)
            - **🏁 Target 1 (Conservative)**: [Price]
            - **🚀 Target 2 (Aggressive)**: [Price] (Based on 52W High or Fib levels)
            - **🛑 Stop Loss**: [Price] (Strict protection level)

            ### ⚠️ Risk Assessment
            (Bullet points on what could go wrong - e.g., "High P/E ratio makes it vulnerable to earnings misses" or "macroeconomic headwinds".)

            ---
            *Disclaimer: This is AI-generated analysis for educational purposes. Always do your own research.*
            `;

            const MIN_EXECUTION_TIME = 6000; // 6 seconds for "Deep Analysis" UX
            const startTime = Date.now();

            const strategistResponse = await this.groqService.generateCompletion(prompt);

            const elapsedTime = Date.now() - startTime;
            if (elapsedTime < MIN_EXECUTION_TIME) {
                const delay = MIN_EXECUTION_TIME - elapsedTime;
                this.logger.log(`UX Delay: Holding response for ${delay}ms to simulate thinking...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Save to Cache
            this.strategyCache.set(cacheKey, { result: strategistResponse, timestamp: Date.now() });

            return strategistResponse;
        } catch (error: any) {
            if (error.message === 'GROQ_RATE_LIMIT') {
                if (retryCount < 3) {
                    const waitTime = (retryCount + 1) * 2000; // 2s, 4s, 6s
                    this.logger.warn(`Groq Rate Limit. Retrying in ${waitTime / 1000}s (Attempt ${retryCount + 1})...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    return this.generateStrategy(query, symbol, quote, technicals, fundamentals, news, retryCount + 1);
                }
                return "## ⚠️ System Busy\n\nOur AI Strategist is experiencing high demand on Groq. Please try again in 1 minute.";
            }
            this.logger.error("Groq Strategy Generation Failed", error);
            throw error;
        }
    }

    private async getYahooClient() {
        if (this.yf) return this.yf;
        try {
            // @ts-ignore
            const pkg = await import('yahoo-finance2');
            const YahooFinanceClass = pkg.default || pkg;

            if (typeof YahooFinanceClass === 'function') {
                // @ts-ignore
                this.yf = new YahooFinanceClass({
                    validation: { logErrors: false },
                    suppressNotices: ['yahooSurvey', 'ripHistorical']
                });
            } else if (YahooFinanceClass && typeof (YahooFinanceClass as any).quote === 'function') {
                this.yf = YahooFinanceClass;
            } else {
                throw new Error('Yahoo Finance exports not recognized');
            }
            return this.yf;
        } catch (error) {
            this.logger.error('Failed to initialize Yahoo Finance client', error);
            throw error;
        }
    }


    async analyze(query: string) {
        this.logger.log(`Analyzing query: ${query}`);

        // 1. Identify Stock Symbol using AI (Simple extraction)
        let symbol = await this.extractSymbol(query);
        if (!symbol) {
            return {
                error: "I couldn't identify the stock symbol. Please mention the stock name clearly (e.g., 'Target for Reliance')."
            };
        }

        this.logger.log(`Identified Symbol: ${symbol}`);

        // FIX: Ensure no double extension (e.g. PREMIERENE.NS.NS)
        if (symbol.endsWith('.NS.NS')) symbol = symbol.replace('.NS.NS', '.NS');
        if (symbol.endsWith('.BO.BO')) symbol = symbol.replace('.BO.BO', '.BO');

        let quote, history, fundamentals, news, technicals, strategy;

        try {
            // 2. Fetch Holistic Data
            // We fetch quote first to get the company name for better news search
            quote = await this.fetchQuote(symbol);

            if (!quote || !quote.regularMarketPrice) {
                return { error: `Could not fetch data for ${symbol}. Please check the symbol.` };
            }

            // Use company name for news if available, otherwise symbol
            const newsQuery = quote.shortName || quote.longName || symbol;
            const cleanNewsQuery = newsQuery.replace(/Limited|Ltd\.?|Incorporated|Inc\.?|Corp\.?|Corporation/gi, '').trim();

            this.logger.log(`Fetching news for: ${cleanNewsQuery} (derived from ${newsQuery})`);

            [history, fundamentals, news] = await Promise.all([
                this.fetchHistory(symbol), // 300 days for 200DMA
                this.fetchFundamentals(symbol),
                this.fetchNews(cleanNewsQuery)
            ]);

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

    private async extractSymbol(query: string, retryCount = 0): Promise<string | null> {
        try {
            const upperQuery = query.toUpperCase();
            const commonWords = new Set(['BOUGHT', 'SHARES', 'SHARE', 'PRICE', 'TARGET', 'ACTION', 'VERDICT', 'MOVE', 'NEXT', 'SELL', 'BUY', 'HOLD', 'ENTRY', 'STOP', 'LOSS', 'ZONE']);

            const symbolRegex = /\b[A-Z0-9-]{3,15}(\.(NS|BO))?\b/g;
            const matches = upperQuery.match(symbolRegex) || [];

            const explicitMatch = matches.find(m => m.includes('.NS') || m.includes('.BO'));
            if (explicitMatch) return explicitMatch;

            const candidates = matches.filter(m => !commonWords.has(m) && !/^\d+$/.test(m));
            if (candidates.length === 1) {
                const mapped = this.getCommonMapping(candidates[0]);
                return mapped || candidates[0];
            }

            const mappedResult = this.checkCommonMapping(upperQuery);
            if (mappedResult) return mappedResult;

            // 2. Stronger Regex for strict usage as last resort
            // Looks for patterns like "TATASTEEL", "TATASTEEL.NS", "INE..." (ISIN)
            const strictRegex = /\b[A-Z]{3,15}(\.NS|\.BO)?\b/g;
            const potentialSymbols = upperQuery.match(strictRegex) || [];

            // Filter out common words again just in case
            const validSymbols = potentialSymbols.filter(s => !commonWords.has(s));

            if (validSymbols.length > 0) {
                // Priority to .NS/.BO
                const explicit = validSymbols.find(s => s.endsWith('.NS') || s.endsWith('.BO'));
                if (explicit) return explicit;

                // Otherwise take the first valid looking ticker
                const first = validSymbols[0];
                const mapped = this.getCommonMapping(first);
                if (mapped) return mapped;
            }

            // 3. Dynamic Search Fallback (The "Every Possible Entity" Check)
            // If regex and static mapping fail, use Yahoo Finance Search API
            const cleanQuery = query.replace(/\b(price|target|analysis|prediction|forecast|news|buy|sell|hold|stock|share|market)\b/gi, '').trim();
            if (cleanQuery.length > 2) {
                this.logger.log(`Dynamic Search for Symbol: ${cleanQuery}`);
                try {
                    const yf = await this.getYahooClient();
                    const searchRes = await yf.search(cleanQuery, { newsCount: 0, quotesCount: 5 });

                    if (searchRes.quotes && searchRes.quotes.length > 0) {
                        // Priority 1: Exact Match on Shortname or Symbol
                        const exactMatch = searchRes.quotes.find((q: any) =>
                            (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')) &&
                            (q.shortname?.toUpperCase() === cleanQuery.toUpperCase() || q.symbol.replace('.NS', '').replace('.BO', '') === cleanQuery.toUpperCase())
                        );
                        if (exactMatch) return exactMatch.symbol;

                        // Priority 2: Any NSE/BSE stock
                        const indianStock = searchRes.quotes.find((q: any) => q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));
                        if (indianStock) return indianStock.symbol;
                    }
                } catch (searchErr) {
                    this.logger.warn(`Dynamic search failed for ${cleanQuery}`, searchErr);
                }
            }

            // AI Fallback
            this.logger.log(`Regex/Mapping extraction failed for query: "${query}". Attempting AI extraction fallback...`);
            const aiSymbol = await this.extractSymbolWithAI(query);
            if (aiSymbol) {
                this.logger.log(`AI extracted symbol: ${aiSymbol}`);
                return aiSymbol;
            }

            this.logger.warn(`Could not extract symbol via Regex, Mapping, or AI.`);
            return null;
        } catch (error: any) {
            this.logger.error('Symbol extraction failed', error);
            return null;
        }
    }

    private async extractSymbolWithAI(query: string): Promise<string | null> {
        try {
            const prompt = `
            Task: Extract the stock ticker symbol from the following user query for the Indian stock market (NSE/BSE).
            Query: "${query}"
            
            Rules:
            1. Return ONLY the ticker symbol followed by .NS (for NSE) or .BO (for BSE).
            2. If you are unsure but know the company name, return the most likely symbol (e.g., "Reliance" -> "RELIANCE.NS").
            3. If no stock ticker can be identified, return "NONE".
            4. Do not include any explanation or extra text.
            
            Example:
            Query: "Check price for State Bank"
            Result: SBIN.NS
            
            Example:
            Query: "Analyze Tata Motors"
            Result: TATAMOTORS.NS
            `;

            const result = await this.groqService.generateCompletion(prompt);
            const trimmed = result.trim().toUpperCase();

            if (trimmed === 'NONE' || trimmed.includes(' ')) return null;

            // Validate format (very basic)
            if (trimmed.length >= 3 && (trimmed.includes('.NS') || trimmed.includes('.BO'))) {
                return trimmed;
            }

            // If it returned a symbol without exchange, assume .NS
            if (trimmed.length >= 2 && trimmed.length <= 15 && !trimmed.includes('.')) {
                return `${trimmed}.NS`;
            }

            // Sanity check for double extension
            if (trimmed.endsWith('.NS.NS')) {
                return trimmed.replace('.NS.NS', '.NS');
            }

            return trimmed.includes('.') ? trimmed : `${trimmed}.NS`;

            return null;
        } catch (error) {
            this.logger.error('AI Symbol Extraction failed', error);
            return null;
        }
    }

    private async fetchQuote(symbol: string) {
        // Helper for retry logic
        const fetchWithRetry = async (sym: string, retries = 2) => {
            try {
                const yf = await this.getYahooClient();
                for (let i = 0; i <= retries; i++) {
                    try {
                        const q = await yf.quote(sym);
                        if (q && q.regularMarketPrice) return q;
                    } catch (e) {
                        if (i === retries) throw e;
                        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Linear backoff
                    }
                }
            } catch (err) { return null; }
            return null;
        };

        try {
            let quote = await fetchWithRetry(symbol);

            if (!quote) {
                // Determine alternative symbol
                let alternative = null;
                if (symbol.endsWith('.NS')) alternative = symbol.replace('.NS', '.BO');
                else if (symbol.endsWith('.BO')) alternative = symbol.replace('.BO', '.NS');

                if (alternative) {
                    this.logger.warn(`Primary fetch failed for ${symbol}, trying alternative: ${alternative}`);
                    try {
                        quote = await fetchWithRetry(alternative);
                    } catch (e) {
                        this.logger.error(`Alternative fetch failed for ${alternative}`);
                    }
                }
            }

            return quote;
        } catch (e: any) {
            this.logger.error(`Fetch quote completely failed for ${symbol}`, e);
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
            const res = await yf.quoteSummary(symbol, { modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'upgradeDowngradeHistory', 'recommendationTrend'] });
            return {
                pe: res.summaryDetail?.trailingPE,
                pb: res.defaultKeyStatistics?.priceToBook,
                roe: res.financialData?.returnOnEquity,
                roa: res.financialData?.returnOnAssets,
                debtToEquity: res.financialData?.debtToEquity,
                revenueGrowth: res.financialData?.revenueGrowth,
                earningsGrowth: res.financialData?.earningsGrowth,
                totalCash: res.financialData?.totalCash,
                totalDebt: res.financialData?.totalDebt,
                currentRatio: res.financialData?.currentRatio,
                margins: res.financialData?.profitMargins,
                targetHigh: res.financialData?.targetMeanPrice,
                recommendationTrend: res.recommendationTrend?.trend?.[0], // Latest trend
                upgrades: res.upgradeDowngradeHistory?.history?.slice(0, 3) // Latest 3 actions
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


        // Bollinger Bands
        const bbInput = { period: 20, values: closes, stdDev: 2 };
        const bb = TechnicalIndicators.BollingerBands.calculate(bbInput);
        const currentBB = bb[bb.length - 1];

        // ATR (for Volatility & Stops)
        const atrInput = { high: highs, low: lows, close: closes, period: 14 };
        const atr = TechnicalIndicators.ATR.calculate(atrInput);
        const currentATR = atr[atr.length - 1];

        // ROC (Rate of Change - Momentum)
        const rocInput = { values: closes, period: 12 };
        const roc = TechnicalIndicators.ROC.calculate(rocInput);
        const currentROC = roc[roc.length - 1];

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
            bb: currentBB,
            atr: currentATR,
            roc: currentROC,
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
