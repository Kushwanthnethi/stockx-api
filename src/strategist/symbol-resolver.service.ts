import { Injectable, Logger } from '@nestjs/common';
import { YahooFinanceService } from '../stocks/yahoo-finance.service';
import { GroqService } from '../services/groq.service';

// Import all stock data (Massive Lexicon)
import { ADDITIONAL_STOCKS as massive } from '../stocks/massive-market-data';
import { MICRO_STOCKS as micro1 } from '../stocks/microcap-data';
import { MICRO_STOCKS_2 as micro2 } from '../stocks/microcap-data-2';
import { MICRO_STOCKS_3 as micro3 } from '../stocks/microcap-data-3';
import { EXPANDED_MARKET_DATA as expanded } from '../stocks/expanded-market-data';
import { ADDITIONAL_STOCKS as extended } from '../stocks/extended-market-data';
import { NIFTY_500 as market } from '../stocks/market-data';
import { NANO_STOCKS as nano } from '../stocks/nano-stocks';

export interface StockMapping {
    symbol: string;
    companyName: string;
}

@Injectable()
export class SymbolResolverService {
    private readonly logger = new Logger(SymbolResolverService.name);
    private readonly masterList: StockMapping[] = [];

    private readonly NICKNAMES: Record<string, string> = {
        'SBI': 'SBIN.NS',
        'STATE BANK': 'SBIN.NS',
        'RELIANCE': 'RELIANCE.NS',
        'M&M': 'M&M.NS',
        'MAHINDRA': 'M&M.NS',
        'LIC': 'LICI.NS',
        'LICI': 'LICI.NS',
        'TATA MOTORS': 'TATAMOTORS.NS',
        'TATA STEEL': 'TATASTEEL.NS',
        'TCS': 'TCS.NS',
        'INFY': 'INFY.NS',
        'INFOSYS': 'INFY.NS',
        'HDFC': 'HDFCBANK.NS',
        'HDFC BANK': 'HDFCBANK.NS',
        'ICICI': 'ICICIBANK.NS',
        'ICICI BANK': 'ICICIBANK.NS',
        'PAYTM': 'PAYTM.NS',
        'ZOMATO': 'ZOMATO.NS',
        'ADANI ENT': 'ADANIENT.NS',
        'ADANI': 'ADANIENT.NS',
        'IRFC': 'IRFC.NS',
        'RVNL': 'RVNL.NS',
        'HAL': 'HAL.NS',
        'BEL': 'BEL.NS',
        'IRCTC': 'IRCTC.NS',
        'NYKAA': 'NYKAA.NS',
        'JIO': 'JIOFIN.NS',
        'JIO FINANCIAL': 'JIOFIN.NS',
        'RELIANCE INDUSTRIES': 'RELIANCE.NS',
        'STBK': 'SBIN.NS',
        'HINDALCO': 'HINDALCO.NS',
        'VEDANTA': 'VEDL.NS',
        'BPCL': 'BPCL.NS',
        'ONGC': 'ONGC.NS',
        'COAL INDIA': 'COALINDIA.NS',
        'TATAMOTORS': 'TATAMOTORS.NS',
        'INDUSTOWERS': 'INDUSTOWER.NS',
        'INDUSTOWER': 'INDUSTOWER.NS',
        'INDUS TOWERS': 'INDUSTOWER.NS'
    };

    constructor(
        private yfService: YahooFinanceService,
        private groqService: GroqService
    ) {
        // Consolidate list on init to create a "World Class" lexicon
        // We use a Map to dedup by symbol
        const dedupMap = new Map<string, string>();

        [...market, ...massive, ...micro1, ...micro2, ...micro3, ...expanded, ...extended, ...nano].forEach(s => {
            if (s && s.symbol && s.companyName) {
                dedupMap.set(s.symbol, s.companyName);
            }
        });

        this.masterList = Array.from(dedupMap.entries()).map(([symbol, companyName]) => ({ symbol, companyName }));
        this.logger.log(`SymbolResolver initialized with ${this.masterList.length} unique local stocks.`);
    }

    async resolve(query: string): Promise<string | null> {
        try {
            const upperQuery = query.toUpperCase().trim();
            const words = upperQuery.split(/\s+/);

            // 1. Regex Match (Strict) - High Accuracy for Tickers
            // Updated to support numeric symbols (BSE codes are 6-digit numbers)
            const symbolRegex = /\b([A-Z]{2,15}|[0-9]{6})(\.(NS|BO))?\b/g;
            const matches = upperQuery.match(symbolRegex) || [];
            const explicitMatch = matches.find(m => m.includes('.NS') || m.includes('.BO'));
            if (explicitMatch) return explicitMatch;

            // Check for numeric code without suffix - highly likely a BSE code
            const numericCode = matches.find(m => /^[0-9]{6}$/.test(m));
            if (numericCode) return `${numericCode}.BO`;

            // BSE Prefix Detection (e.g., "BSE: RELIANCE" or "BSE 543210")
            const bsePrefixMatch = upperQuery.match(/\bBSE[\s:]+([A-Z0-9.]+)\b/i);
            if (bsePrefixMatch) {
                const term = bsePrefixMatch[1].trim();
                const resolved = await this.resolve(term); // Recursive check or simple transform
                if (resolved) return resolved.replace('.NS', '.BO');
                return await this.verifiedYahooSearch(term, true); // True for BSE priority
            }

            // 2. Exact Nickname Word Match (Highest priority after explicit symbols)
            for (const [nick, sym] of Object.entries(this.NICKNAMES)) {
                // Check for whole word match to avoid false positives (e.g., "HAL" in "SHALL")
                const nickRegex = new RegExp(`\\b${nick}\\b`, 'i');
                if (nickRegex.test(upperQuery)) {
                    this.logger.log(`Nickname match: ${nick} -> ${sym}`);
                    return sym;
                }
            }

            // 3. AI Extraction for long/conversational queries (Smart Clean)
            // If the query is long, use AI to isolate the entity first
            let cleanSearchTerm = upperQuery;
            if (words.length > 3) {
                this.logger.log(`Long query detected (${words.length} words). Using AI to extract entity...`);
                const aiExtracted = await this.extractEntityWithAI(query);
                if (aiExtracted && aiExtracted !== 'NONE') {
                    cleanSearchTerm = aiExtracted;
                    this.logger.log(`AI cleaned query: "${upperQuery}" -> "${cleanSearchTerm}"`);
                }
            } else {
                // Short query: simple noise removal
                const noiseWords = ['BUY', 'SELL', 'PRICE', 'TARGET', 'ACTION', 'VERDICT', 'MOVE', 'NEXT', 'HOLD', 'ENTRY', 'STOP', 'LOSS', 'ZONE', 'STOCK', 'SHARE', 'SHARES', 'ANALYZE', 'CHECK', 'TELL', 'ME', 'ABOUT'];
                noiseWords.forEach(word => {
                    const reg = new RegExp(`\\b${word}\\b`, 'gi');
                    cleanSearchTerm = cleanSearchTerm.replace(reg, '');
                });
                cleanSearchTerm = cleanSearchTerm.trim();
            }

            if (cleanSearchTerm.length < 2) return null;

            // 4. Fuzzy Local Match (Now Space-Agnostic)
            const localMatch = this.fuzzySearch(cleanSearchTerm);
            if (localMatch) {
                this.logger.log(`Local match found for "${cleanSearchTerm}": ${localMatch.symbol}`);
                return localMatch.symbol;
            }

            // 5. Final fallback: AI Extraction + Verified Search
            // (Only if we haven't already used AI or if the AI clean failed to find a local match)
            if (words.length <= 3) {
                const aiExtracted = await this.extractEntityWithAI(query);
                if (aiExtracted && aiExtracted !== 'NONE') {
                    const localMatchAfterAI = this.fuzzySearch(aiExtracted);
                    if (localMatchAfterAI) return localMatchAfterAI.symbol;
                    const isBSE = upperQuery.includes('BSE');
                    return await this.verifiedYahooSearch(aiExtracted, isBSE);
                }
            } else {
                // For long queries where AI was already used, try Yahoo Search on the AI results
                const isBSE = upperQuery.includes('BSE');
                return await this.verifiedYahooSearch(cleanSearchTerm, isBSE);
            }

            return null;
        } catch (error) {
            this.logger.error('Symbol resolution failed', error);
            return null;
        }
    }

    private async extractEntityWithAI(query: string): Promise<string> {
        try {
            const prompt = `
            Task: Extract the specific Indian stock or company name being discussed in this user query.
            Query: "${query}"
            
            Rules:
            1. Return ONLY the clean company name (e.g., "State Bank of India", "Reliance Industries").
            2. If a ticker is mentioned (e.g., "RELIANCE"), return that.
            3. Do not include price, target, or actions. Just the entity.
            4. If no stock is identified, return "NONE".
            
            Result:`;
            const result = await this.groqService.generateCompletion(prompt);
            return result.trim().replace(/"/g, '').toUpperCase();
        } catch (e) {
            return 'NONE';
        }
    }

    private fuzzySearch(term: string): StockMapping | null {
        const clean = term.toUpperCase().replace(/\s+/g, ''); // Space-agnostic term

        // Exact Symbol match
        let match = this.masterList.find(s => s.symbol.replace('.NS', '').replace('.BO', '').replace(/\s+/g, '') === clean);
        if (match) return match;

        // Exact Name match (Space-agnostic)
        match = this.masterList.find(s => s.companyName.toUpperCase().replace(/\s+/g, '') === clean);
        if (match) return match;

        // Starts with name (Space-agnostic)
        match = this.masterList.find(s => s.companyName.toUpperCase().replace(/\s+/g, '').startsWith(clean));
        if (match) return match;

        // Starts with symbol
        match = this.masterList.find(s => s.symbol.toUpperCase().replace(/\s+/g, '').startsWith(clean));
        if (match) return match;

        // Contains name (Space-agnostic)
        if (clean.length > 3) {
            match = this.masterList.find(s => s.companyName.toUpperCase().replace(/\s+/g, '').includes(clean));
        }

        return match || null;
    }

    private async verifiedYahooSearch(name: string, bsePriority: boolean = false): Promise<string | null> {
        try {
            const yf = await this.yfService.getClient();
            const res = await yf.search(name, { quotesCount: 5 });
            if (res.quotes && res.quotes.length > 0) {
                if (bsePriority) {
                    const bseMatch = res.quotes.find((q: any) => q.symbol.endsWith('.BO'));
                    if (bseMatch) return bseMatch.symbol;
                }

                // Priority to Indian stocks (.NS or .BO)
                const indian = res.quotes.find((q: any) => q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));
                if (indian) return indian.symbol;
            }
        } catch (e) {
            return null;
        }
        return null;
    }
}
