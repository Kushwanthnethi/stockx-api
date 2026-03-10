import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { SymbolMapper } from './utils/symbol-mapper.util';

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

@Injectable()
export class AngelInstrumentService implements OnModuleInit {
    private readonly logger = new Logger(AngelInstrumentService.name);
    private instruments: Map<string, AngelInstrument> = new Map(); // token -> Instrument
    private symbolToTokenMap: Map<string, string> = new Map(); // Yahoo Symbol -> Angel Token
    private readonly url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
    private readonly dirPath = path.join(__dirname, '..', '..', 'data');
    private readonly filePath = path.join(this.dirPath, 'OpenAPIScripMaster.json');

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

            for (const item of parsedData) {
                // We mainly care about NSE/BSE Equities and Indices
                if (item.exch_seg === 'NSE' || item.exch_seg === 'BSE') {
                    this.instruments.set(item.token, item);

                    // Convert Angel Symbol back to our standard (usually Yahoo format)
                    let standardSymbol = item.symbol;

                    // Specific mapping for Indices
                    if (item.exch_seg === 'NSE' && item.instrumenttype === 'AMXIDX') {
                        if (item.name === 'NIFTY') standardSymbol = '^NSEI';
                        else if (item.name === 'BANKNIFTY') standardSymbol = '^NSEBANK';
                        // Add more indices as needed
                    } else if (item.exch_seg === 'BSE' && item.instrumenttype === 'AMXIDX') {
                        if (item.name === 'SENSEX') standardSymbol = '^BSESN';
                    } else if (item.exch_seg === 'NSE' && item.symbol.endsWith('-EQ')) {
                        standardSymbol = item.symbol.replace('-EQ', '.NS');
                    } else if (item.exch_seg === 'BSE') {
                        standardSymbol = `${item.symbol}.BO`;
                    }

                    this.symbolToTokenMap.set(standardSymbol, item.token);
                }
            }

            // Hardcode crucial indices (token format: 99926XXX for NSE indices)
            this.symbolToTokenMap.set('^NSEI', '99926000'); // Nifty 50
            this.symbolToTokenMap.set('NIFTY 50', '99926000');
            this.symbolToTokenMap.set('^NSEBANK', '99926009'); // Nifty Bank
            this.symbolToTokenMap.set('NIFTY BANK', '99926009');
            this.symbolToTokenMap.set('^BSESN', '99919000'); // Sensex
            this.symbolToTokenMap.set('SENSEX', '99919000');
            // Sectoral Indices
            this.symbolToTokenMap.set('^CNXIT', '99926008');
            this.symbolToTokenMap.set('NIFTY IT', '99926008');
            this.symbolToTokenMap.set('^CNXPHARMA', '99926023');
            this.symbolToTokenMap.set('NIFTY PHARMA', '99926023');
            this.symbolToTokenMap.set('^CNXAUTO', '99926029');
            this.symbolToTokenMap.set('NIFTY AUTO', '99926029');
            this.symbolToTokenMap.set('^CNXFMCG', '99926021');
            this.symbolToTokenMap.set('NIFTY FMCG', '99926021');
            this.symbolToTokenMap.set('^CNXMETAL', '99926030');
            this.symbolToTokenMap.set('NIFTY METAL', '99926030');
            this.symbolToTokenMap.set('^CNXREALTY', '99926018');
            this.symbolToTokenMap.set('NIFTY REALTY', '99926018');
            this.symbolToTokenMap.set('^CNXENERGY', '99926020');
            this.symbolToTokenMap.set('NIFTY ENERGY', '99926020');
            this.symbolToTokenMap.set('^NSEMDCP50', '99926014');
            this.symbolToTokenMap.set('NIFTY MIDCAP 50', '99926014');

            // Hardcode aliases for renamed/mismatched stocks
            // Yahoo symbol -> Angel One token (where DB has old/different name)
            this.symbolToTokenMap.set('ZOMATO.NS', '5097');      // Zomato → Eternal
            this.symbolToTokenMap.set('AU_BANK.NS', '21238');    // AU_BANK → AUBANK
            this.symbolToTokenMap.set('GMRINFRA.NS', '13528');   // GMR Infra → GMR Airports
            this.symbolToTokenMap.set('L&TFH.NS', '24948');      // L&T Finance Holdings → LTF

            this.logger.log(`Parsed ${this.instruments.size} instruments into memory.`);
        } catch (err) {
            this.logger.error(`Error parsing instruments: ${err.message}`);
        }
    }

    getToken(symbol: string): string | null {
        // Try direct lookup
        if (this.symbolToTokenMap.has(symbol)) {
            return this.symbolToTokenMap.get(symbol)!;
        }

        // Try appending/manipulating suffixes if direct lookup failed
        let alternateSymbol = symbol;
        if (!symbol.includes('.') && !symbol.startsWith('^')) {
            alternateSymbol = `${symbol}.NS`;
            if (this.symbolToTokenMap.has(alternateSymbol)) {
                return this.symbolToTokenMap.get(alternateSymbol)!;
            }
        }

        // Final attempt, strip suffix and just look for the base name in EQ segment
        const baseSymbol = symbol.split('.')[0];
        for (const [key, token] of this.symbolToTokenMap.entries()) {
            if (key.startsWith(baseSymbol) && key.includes('.NS')) {
                return token;
            }
        }

        this.logger.warn(`Could not find Angel Token for symbol: ${symbol}`);
        return null;
    }

    getSymbol(token: string): string | null {
        // Find by mapping — prefer Yahoo-format symbols (^NSEI, ^CNXIT, etc.)
        // because the gateway's alias map routes these to display labels
        let firstMatch: string | null = null;
        for (const [sym, t] of this.symbolToTokenMap.entries()) {
            if (t === token) {
                if (sym.startsWith('^')) return sym;
                // For equities, prefer .NS/.BO format over raw names
                if (!firstMatch || sym.includes('.')) firstMatch = sym;
            }
        }
        if (firstMatch) return firstMatch;

        const instrument = this.instruments.get(token);
        if (instrument) {
            if (instrument.exch_seg === 'NSE' && instrument.symbol.endsWith('-EQ')) {
                return instrument.symbol.replace('-EQ', '.NS');
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
}
