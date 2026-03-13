import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { SymbolMapper } from './utils/symbol-mapper.util';
import { TRACKED_STOCKS } from '../cron/constants';

export interface AngelInstrument {
    token: string;
    symbol: string;
    name: string;
    expiry?: string;
    strike?: string;
    lotsize: string;
    instrumenttype: string;
    exch_seg: string;
    tick_size: string;
}

export interface AngelMappingHealth {
    checked: number;
    mapped: number;
    missing: number;
    missingSymbols: string[];
    indexTokens: Record<string, string | null>;
}

@Injectable()
export class AngelInstrumentService implements OnModuleInit {
    private readonly logger = new Logger(AngelInstrumentService.name);
    private instruments: Map<string, AngelInstrument> = new Map(); // token -> Instrument
    private symbolToTokenMap: Map<string, string> = new Map(); // Yahoo Symbol -> Angel Token
    private tokenToPrimarySymbolMap: Map<string, string> = new Map(); // token -> primary app symbol
    private readonly url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
    private readonly dirPath = path.join(__dirname, '..', '..', 'data');
    private readonly filePath = path.join(this.dirPath, 'OpenAPIScripMaster.json');

    private readonly indexSymbolAliases: Record<string, string[]> = {
        '^NSEI': ['NIFTY 50', 'NIFTY50'],
        '^NSEBANK': ['NIFTY BANK', 'BANKNIFTY'],
        '^BSESN': ['SENSEX'],
        '^CNXIT': ['NIFTY IT'],
        '^CNXPHARMA': ['NIFTY PHARMA'],
        '^CNXAUTO': ['NIFTY AUTO'],
        '^CNXFMCG': ['NIFTY FMCG'],
        '^CNXMETAL': ['NIFTY METAL'],
        '^CNXREALTY': ['NIFTY REALTY'],
        '^CNXENERGY': ['NIFTY ENERGY'],
        '^NSEMDCP50': ['NIFTY MIDCAP 50'],
    };

    private readonly renamedStockAliases: Record<string, string[]> = {
        // Angel One canonical now differs from legacy/Yahoo symbols used in app data.
        'ETERNAL.NS': ['ZOMATO.NS'],
        'AUBANK.NS': ['AU_BANK.NS'],
        'GMRAIRPORT.NS': ['GMRINFRA.NS'],
        'LTF.NS': ['L&TFH.NS'],
    };

    async onModuleInit() {
        // Ensure data directory exists
        if (!fs.existsSync(this.dirPath)) {
            fs.mkdirSync(this.dirPath, { recursive: true });
        }
        await this.loadInstruments();
    }

    private async downloadInstruments(): Promise<boolean> {
        this.logger.log('Downloading latest Angel One Instrument Master...');
        return new Promise((resolve) => {
            const file = fs.createWriteStream(this.filePath);
            https.get(this.url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    this.logger.log('Instrument Master downloaded successfully.');
                    resolve(true);
                });
            }).on('error', (err) => {
                fs.unlink(this.filePath, () => { }); // Delete the file async
                this.logger.error(`Error downloading Instrument Master: ${err.message}`);
                resolve(false);
            });
        });
    }

    private async loadInstruments() {
        let shouldDownload = true;

        if (fs.existsSync(this.filePath)) {
            const stats = fs.statSync(this.filePath);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Start of today

            if (stats.mtime >= today) {
                // File is up to date (downloaded today)
                shouldDownload = false;
            }
        }

        if (shouldDownload) {
            const success = await this.downloadInstruments();
            if (!success && !fs.existsSync(this.filePath)) {
                this.logger.error('Failed to acquire Instrument Master. Symbol mapping will fail.');
                return;
            }
        }

        this.logger.log('Parsing Angel One Instrument Master...');
        try {
            const data = fs.readFileSync(this.filePath, 'utf8');
            const parsedData: AngelInstrument[] = JSON.parse(data);

            this.instruments.clear();
            this.symbolToTokenMap.clear();
            this.tokenToPrimarySymbolMap.clear();

            const nseCashEquityByBase: Map<string, AngelInstrument> = new Map();
            const bseCashEquityByBase: Map<string, AngelInstrument> = new Map();
            const nseIndexByName: Map<string, AngelInstrument> = new Map();
            const bseIndexByName: Map<string, AngelInstrument> = new Map();

            for (const item of parsedData) {
                if (item.exch_seg !== 'NSE' && item.exch_seg !== 'BSE') continue;

                this.instruments.set(item.token, item);

                // Keep only cash-equity rows for stocks; this avoids stale/wrong mappings.
                const isNseCashEquity = item.exch_seg === 'NSE' && item.symbol.endsWith('-EQ');
                const bseBaseSymbol = item.symbol.replace('-EQ', '').toUpperCase();
                const looksLikeBseTicker = /^[A-Z][A-Z0-9&.-]{0,19}$/.test(bseBaseSymbol) && !/^\d+$/.test(bseBaseSymbol);
                const isBseCashEquity =
                    item.exch_seg === 'BSE'
                    && item.instrumenttype !== 'AMXIDX'
                    && looksLikeBseTicker;
                const isNseIndex = item.exch_seg === 'NSE' && item.instrumenttype === 'AMXIDX';
                const isBseIndex = item.exch_seg === 'BSE' && item.instrumenttype === 'AMXIDX';

                if (isNseCashEquity) {
                    const base = item.symbol.replace('-EQ', '').toUpperCase();
                    nseCashEquityByBase.set(base, item);
                }

                if (isBseCashEquity) {
                    const base = bseBaseSymbol;
                    bseCashEquityByBase.set(base, item);
                }

                if (isNseIndex) {
                    nseIndexByName.set(item.name.toUpperCase(), item);
                }

                if (isBseIndex) {
                    bseIndexByName.set(item.name.toUpperCase(), item);
                }
            }

            // Build NSE/BSE equity mappings.
            for (const [base, item] of nseCashEquityByBase.entries()) {
                const appSymbol = `${base}.NS`;
                this.symbolToTokenMap.set(appSymbol, item.token);
                this.tokenToPrimarySymbolMap.set(item.token, appSymbol);
            }

            for (const [base, item] of bseCashEquityByBase.entries()) {
                const appSymbol = `${base}.BO`;
                this.symbolToTokenMap.set(appSymbol, item.token);
                if (!this.tokenToPrimarySymbolMap.has(item.token)) {
                    this.tokenToPrimarySymbolMap.set(item.token, appSymbol);
                }
            }

            // Build index mappings using well-known names. If an index isn't found in the latest
            // master file, fallback token maintains continuity.
            const indexTokenFallbacks: Record<string, string> = {
                '^NSEI': '99926000',
                '^NSEBANK': '99926009',
                '^BSESN': '99919000',
                '^CNXIT': '99926008',
                '^CNXPHARMA': '99926023',
                '^CNXAUTO': '99926029',
                '^CNXFMCG': '99926021',
                '^CNXMETAL': '99926030',
                '^CNXREALTY': '99926018',
                '^CNXENERGY': '99926020',
                '^NSEMDCP50': '99926014',
            };

            const indexNameKeys: Record<string, string[]> = {
                '^NSEI': ['NIFTY'],
                '^NSEBANK': ['BANKNIFTY'],
                '^BSESN': ['SENSEX'],
                '^CNXIT': ['NIFTY IT'],
                '^CNXPHARMA': ['NIFTY PHARMA'],
                '^CNXAUTO': ['NIFTY AUTO'],
                '^CNXFMCG': ['NIFTY FMCG'],
                '^CNXMETAL': ['NIFTY METAL'],
                '^CNXREALTY': ['NIFTY REALTY'],
                '^CNXENERGY': ['NIFTY ENERGY'],
                '^NSEMDCP50': ['NIFTY MIDCAP 50'],
            };

            for (const [canonicalIndex, nameKeys] of Object.entries(indexNameKeys)) {
                let token: string | undefined;

                const lookupMap = canonicalIndex === '^BSESN' ? bseIndexByName : nseIndexByName;
                for (const nameKey of nameKeys) {
                    const hit = lookupMap.get(nameKey.toUpperCase());
                    if (hit) {
                        token = hit.token;
                        break;
                    }
                }

                if (!token) token = indexTokenFallbacks[canonicalIndex];
                this.symbolToTokenMap.set(canonicalIndex, token);
                this.tokenToPrimarySymbolMap.set(token, canonicalIndex);

                const aliases = this.indexSymbolAliases[canonicalIndex] || [];
                aliases.forEach((alias) => this.symbolToTokenMap.set(alias.toUpperCase(), token!));
            }

            // Add backward-compatible aliases for renamed NSE stocks so legacy DB symbols still work.
            for (const [canonical, oldSymbols] of Object.entries(this.renamedStockAliases)) {
                const token = this.symbolToTokenMap.get(canonical);
                if (!token) continue;
                oldSymbols.forEach((legacy) => this.symbolToTokenMap.set(legacy, token));
            }

            this.auditTrackedSymbolCoverage();

            this.logger.log(`Parsed ${this.instruments.size} instruments into memory. Resolved ${this.symbolToTokenMap.size} symbol mappings.`);
        } catch (err) {
            this.logger.error(`Error parsing instruments: ${err.message}`);
        }
    }

    private auditTrackedSymbolCoverage() {
        const missing = TRACKED_STOCKS.filter((s) => !this.symbolToTokenMap.has(s));
        if (missing.length > 0) {
            const sample = missing.slice(0, 25).join(', ');
            this.logger.warn(`Angel mapping missing for ${missing.length} tracked symbols. Sample: ${sample}`);
        } else {
            this.logger.log(`Angel mapping coverage OK for all ${TRACKED_STOCKS.length} tracked stocks.`);
        }
    }

    getToken(symbol: string): string | null {
        let normalizedInput = (symbol || '').toUpperCase().trim();
        if (normalizedInput === 'NIFTY 50' || normalizedInput === 'NIFTY50') normalizedInput = '^NSEI';
        if (normalizedInput === 'NIFTY BANK' || normalizedInput === 'BANKNIFTY') normalizedInput = '^NSEBANK';
        if (normalizedInput === 'SENSEX') normalizedInput = '^BSESN';
        if (!normalizedInput) return null;

        // 1) Direct lookup
        if (this.symbolToTokenMap.has(normalizedInput)) {
            return this.symbolToTokenMap.get(normalizedInput)!;
        }

        // 2) Try NSE/BSE expansions for bare symbols.
        if (!normalizedInput.includes('.') && !normalizedInput.startsWith('^')) {
            const nse = `${normalizedInput}.NS`;
            const bse = `${normalizedInput}.BO`;
            if (this.symbolToTokenMap.has(nse)) return this.symbolToTokenMap.get(nse)!;
            if (this.symbolToTokenMap.has(bse)) return this.symbolToTokenMap.get(bse)!;
        }

        // 3) Exact base matching only (never prefix match) to avoid wrong token selection
        //    like M&M.NS accidentally mapping to M&MFIN.NS.
        if (normalizedInput.includes('.')) {
            const [base, suffix] = normalizedInput.split('.');
            const candidate = `${base}.${suffix}`;
            if (this.symbolToTokenMap.has(candidate)) {
                return this.symbolToTokenMap.get(candidate)!;
            }
        }

        this.logger.warn(`Could not find Angel Token for symbol: ${symbol} (normalized: ${normalizedInput})`);
        return null;
    }

    getSymbol(token: string): string | null {
        const primary = this.tokenToPrimarySymbolMap.get(token);
        if (primary) return primary;

        const instrument = this.instruments.get(token);
        if (instrument) {
            if (instrument.exch_seg === 'NSE' && instrument.symbol.endsWith('-EQ')) {
                return instrument.symbol.replace('-EQ', '.NS');
            }
            if (instrument.exch_seg === 'BSE') {
                const base = instrument.symbol.replace('-EQ', '').toUpperCase();
                return `${base}.BO`;
            }
            return instrument.symbol;
        }
        return null;
    }

    getExchangeSegment(token: string): string {
        const instrument = this.instruments.get(token);
        if (instrument) return instrument.exch_seg;
        // NSE index tokens start with 99926, BSE index tokens with 99919
        if (token.startsWith('99926')) return 'NSE';
        if (token.startsWith('99919')) return 'BSE';
        return token.length > 5 ? 'BSE' : 'NSE';
    }

    getMappingHealth(symbols: string[]): AngelMappingHealth {
        const normalized = Array.from(new Set((symbols || []).map((s) => (s || '').toUpperCase().trim()).filter(Boolean)));
        const missingSymbols = normalized.filter((s) => !this.getToken(s));

        const indexKeys = ['^NSEI', '^NSEBANK', '^BSESN', '^CNXIT', '^CNXPHARMA', '^CNXAUTO', '^CNXFMCG', '^CNXMETAL', '^CNXREALTY', '^CNXENERGY', '^NSEMDCP50'];
        const indexTokens: Record<string, string | null> = {};
        indexKeys.forEach((k) => {
            indexTokens[k] = this.getToken(k);
        });

        return {
            checked: normalized.length,
            mapped: normalized.length - missingSymbols.length,
            missing: missingSymbols.length,
            missingSymbols,
            indexTokens,
        };
    }
}
