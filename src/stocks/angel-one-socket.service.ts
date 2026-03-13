import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AngelOneService } from './angel-one.service';
import { AngelInstrumentService } from './angel-instrument.service';
import { StocksGateway } from './stocks.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { TRACKED_STOCKS } from '../cron/constants';
// @ts-ignore
import { WebSocketV2 } from 'smartapi-javascript';

@Injectable()
export class AngelOneSocketService implements OnModuleInit {
    private readonly logger = new Logger(AngelOneSocketService.name);
    private readonly dbUpdateThrottleMs = 10_000;
    private readonly maxRecentPrices = 30;
    private socket: any;
    private isConnected = false;
    private currentSubscribedTokens: Set<string> = new Set();
    private permanentSubscribedTokens: Set<string> = new Set();
    private permanentSubsInitialized = false;
    // Reconnect logic
    private reconnectTimeout: any;
    private lastDbUpdateMap: Map<string, number> = new Map();
    private latestQuoteBySymbol: Map<string, { price: number; change: number; changePercent: number; timestamp: number }> = new Map();
    private recentPricesBySymbol: Map<string, number[]> = new Map();

    // Keep DB index rows in sync for both internal and display symbols.
    private readonly internalToDbSymbolsMap: Map<string, string[]> = new Map([
        ['^NSEI', ['^NSEI', 'NIFTY 50']],
        ['^NSEBANK', ['^NSEBANK', 'NIFTY BANK']],
        ['^BSESN', ['^BSESN', 'SENSEX']],
        ['^CNXIT', ['^CNXIT']],
        ['^CNXPHARMA', ['^CNXPHARMA']],
        ['^CNXAUTO', ['^CNXAUTO']],
        ['^CNXFMCG', ['^CNXFMCG']],
        ['^CNXMETAL', ['^CNXMETAL']],
        ['^CNXREALTY', ['^CNXREALTY']],
        ['^CNXENERGY', ['^CNXENERGY']],
        ['^NSEMDCP50', ['^NSEMDCP50']],
    ]);

    // Map display labels to internal symbols for subscription resolution
    private readonly displayToInternalMap: Map<string, string> = new Map([
        ['NIFTY 50', '^NSEI'],
        ['NIFTY BANK', '^NSEBANK'],
        ['BANKNIFTY', '^NSEBANK'],
        ['SENSEX', '^BSESN'],
        ['NIFTY IT', '^CNXIT'],
        ['NIFTY PHARMA', '^CNXPHARMA'],
        ['NIFTY AUTO', '^CNXAUTO'],
        ['NIFTY FMCG', '^CNXFMCG'],
        ['NIFTY METAL', '^CNXMETAL'],
        ['NIFTY REALTY', '^CNXREALTY'],
        ['NIFTY ENERGY', '^CNXENERGY'],
        ['NIFTY MIDCAP 50', '^NSEMDCP50'],
    ]);

    constructor(
        private angelService: AngelOneService,
        private instrumentService: AngelInstrumentService,
        private stocksGateway: StocksGateway,
        private prisma: PrismaService,
    ) { }

    async onModuleInit() {
        this.logger.log('Initializing Angel One Socket Service...');

        // Connect after a delay to ensure tokens are loaded/instruments parsed
        setTimeout(() => this.connect(), 3000);

        // Periodically sync subscriptions from the gateway
        setInterval(() => this.syncSubscriptions(), 2000);
    }

    async connect() {
        let feedToken = this.angelService.getFeedToken();
        let jwtToken = this.angelService.getJwtToken();
        const clientId = this.angelService.getClientId();
        const apiKey = this.angelService.getApiKey();

        if (!feedToken || !jwtToken) {
            this.logger.warn('Angel One credentials/tokens missing. Attempting explicit login before connecting...');
            const success = await this.angelService.login();
            if (success) {
                feedToken = this.angelService.getFeedToken();
                jwtToken = this.angelService.getJwtToken();
            } else {
                this.logger.error('Failed explicit login for WebSocket. Will retry in 10 seconds.');
                this.reconnectTimeout = setTimeout(() => this.connect(), 10000);
                return;
            }
        }

        if (!clientId || !apiKey) {
            this.logger.error('Missing static Client ID or API Key. WebSocket cannot connect.');
            return;
        }

        try {
            this.logger.log('Attempting to connect to Angel One Smart WebSocket V2...');
            this.socket = new WebSocketV2({
                jwttoken: jwtToken,
                apikey: apiKey,
                clientcode: clientId,
                feedtype: feedToken
            });

            this.socket.connect()
                .then(() => {
                    this.isConnected = true;
                    this.logger.log('✅ Angel One WebSocket Connected Successfully!');
                    setTimeout(() => this.syncSubscriptions(true), 2000);
                })
                .catch((err: any) => {
                    this.logger.error(`Angel One WebSocket Connection Failed: ${err?.message || err}`);
                    this.handleReconnect();
                });

            this.socket.on('tick', (data: any) => {
                this.handleMessage(data);
            });

            this.socket.on('error', (err: any) => {
                this.logger.error(`Angel One WebSocket Error: ${err?.message || err}`);
            });

            this.socket.on('close', () => {
                this.logger.warn('Angel One WebSocket Closed.');
                this.isConnected = false;
                this.handleReconnect();
            });

        } catch (error) {
            this.logger.error('Failed to initialize Angel One WebSocket:', error.message);
            this.handleReconnect();
        }
    }

    private handleReconnect() {
        this.isConnected = false;
        // Reset subscription state so they are re-established on new connection
        this.permanentSubsInitialized = false;
        this.currentSubscribedTokens.clear();
        this.permanentSubscribedTokens.clear();
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
            if (!this.isConnected) {
                this.logger.log('Attempting Reconnection...');
                this.connect();
            }
        }, 10000);
    }

    getRuntimeStatus() {
        return {
            isConnected: this.isConnected,
            permanentSubscriptionsInitialized: this.permanentSubsInitialized,
            permanentTokenCount: this.permanentSubscribedTokens.size,
            dynamicTokenCount: this.currentSubscribedTokens.size,
            liveQuoteCount: this.latestQuoteBySymbol.size,
        };
    }

    private normalizeLookupSymbol(symbol: string): string {
        const raw = (symbol || '').toUpperCase().trim();
        if (!raw) return raw;

        const internal = this.displayToInternalMap.get(raw);
        if (internal) return internal;

        const isIndex = raw.startsWith('NIFTY') || raw === 'BANKNIFTY' || raw === 'SENSEX' || raw.startsWith('^');
        if (!raw.includes('.') && !isIndex) {
            return `${raw}.NS`;
        }

        return raw;
    }

    getLatestQuote(symbol: string, maxAgeMs = 15_000) {
        const normalized = this.normalizeLookupSymbol(symbol);
        const quote = this.latestQuoteBySymbol.get(normalized);
        if (!quote) return null;
        if (Date.now() - quote.timestamp > maxAgeMs) return null;
        return quote;
    }

    getRecentPrices(symbol: string, limit = 7) {
        const normalized = this.normalizeLookupSymbol(symbol);
        const values = this.recentPricesBySymbol.get(normalized) || [];
        return values.slice(-Math.max(1, limit));
    }

    private upsertLiveQuote(symbol: string, price: number, change: number, changePercent: number) {
        this.latestQuoteBySymbol.set(symbol, {
            price,
            change,
            changePercent,
            timestamp: Date.now(),
        });

        const series = this.recentPricesBySymbol.get(symbol) || [];
        series.push(price);
        if (series.length > this.maxRecentPrices) {
            series.shift();
        }
        this.recentPricesBySymbol.set(symbol, series);
    }

    private handleMessage(message: any) {
        if (!message) return;

        // Detailed Logging for Debugging - Commented out to avoid log flooding
        // this.logger.debug(`[Socket] Message received: ${JSON.stringify(message).substring(0, 200)}`);

        let token = message.token;
        if (typeof token === 'string') {
            token = token.replace(/\"/g, '').trim();
        }

        const price = Number(message.last_traded_price) / 100;
        const symbol = this.instrumentService.getSymbol(token);
        // this.logger.debug(`[Socket] Sanitized token: ${token}, Symbol: ${symbol}, Price: ${price}`);

        if (symbol && price > 0) {
            let change = 0;
            let changePercent = 0;

            if (message.close_price && Number(message.close_price) > 0) {
                const closePrice = Number(message.close_price) / 100;
                change = price - closePrice;
                changePercent = (change / closePrice) * 100;
            }

            this.stocksGateway.sendPriceUpdate(symbol, {
                price: price,
                change: change,
                changePercent: changePercent,
                symbol: symbol,
            });

            this.upsertLiveQuote(symbol, price, change, changePercent);

            // Update Database (Throttled to once per 30 seconds per stock to avoid DB overload)
            const targets = this.internalToDbSymbolsMap.get(symbol) || [symbol];

            for (const dbSymbol of targets) {
                this.upsertLiveQuote(dbSymbol, price, change, changePercent);

                const now = Date.now();
                const lastUpdate = this.lastDbUpdateMap.get(dbSymbol) || 0;
                if (now - lastUpdate <= this.dbUpdateThrottleMs) continue;

                this.lastDbUpdateMap.set(dbSymbol, now);
                this.prisma.stock.update({
                    where: { symbol: dbSymbol },
                    data: {
                        currentPrice: price,
                        changePercent: changePercent !== 0 ? changePercent : undefined,
                        lastUpdated: new Date(),
                    }
                }).catch(() => { });
            }
        }
    }

    private async syncSubscriptions(force = false) {
        if (!this.isConnected || !this.socket) {
            return;
        }

        // 1. Handle Permanent Subscriptions (Nifty 50, etc.) — only initialize once
        if (!this.permanentSubsInitialized) {
            this.permanentSubsInitialized = true;

            // A. Background stock subscriptions from TRACKED_STOCKS
            this.logger.log(`Initializing permanent subscriptions for ${TRACKED_STOCKS.length} background stocks...`);
            TRACKED_STOCKS.forEach(s => {
                const token = this.instrumentService.getToken(s);
                if (token) this.permanentSubscribedTokens.add(token);
            });

            // B. ALL indices in mode 2 (full quote) so we always get close_price for % change
            //    Without mode 2, Angel One only sends LTP (no close_price) → changePercent = 0
            const INDEX_SYMBOLS = [
                '^NSEI', '^NSEBANK', '^BSESN',
                '^CNXIT', '^CNXPHARMA', '^CNXAUTO', '^CNXFMCG',
                '^CNXMETAL', '^CNXREALTY', '^CNXENERGY', '^NSEMDCP50',
            ];
            INDEX_SYMBOLS.forEach(s => {
                const token = this.instrumentService.getToken(s);
                if (token) this.permanentSubscribedTokens.add(token);
                else this.logger.warn(`Could not find token for index: ${s}`);
            });

            // Subscribe to permanent tokens in FULL QUOTE mode (2) for complete OHLC/Change data
            const tokens = Array.from(this.permanentSubscribedTokens);
            const nseTokens = tokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'NSE');
            const bseTokens = tokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'BSE');

            if (nseTokens.length > 0) {
                this.socket.fetchData({ correlationID: 'perm_nse', action: 1, mode: 2, exchangeType: 1, tokens: nseTokens });
            }
            if (bseTokens.length > 0) {
                this.socket.fetchData({ correlationID: 'perm_bse', action: 1, mode: 2, exchangeType: 3, tokens: bseTokens });
            }
            this.logger.log(`Permanent subscriptions initialized: ${this.permanentSubscribedTokens.size} tokens (including ${INDEX_SYMBOLS.length} indices).`);
        }

        // 2. Handle Dynamic Subscriptions (User-driven)
        const neededSymbols = this.stocksGateway.getAllSubscribedSymbols();

        // Resolve display names to internal symbols (e.g., "NIFTY 50" -> "^NSEI")
        const resolvedSymbols = neededSymbols.map(s => this.displayToInternalMap.get(s) || s);

        const symbolsToAdd = resolvedSymbols.filter((s) => {
            const token = this.instrumentService.getToken(s);
            // Only add if not already in permanent or current sets
            return token && !this.currentSubscribedTokens.has(token) && !this.permanentSubscribedTokens.has(token);
        });

        if (symbolsToAdd.length > 0) {
            const tokensToAdd = symbolsToAdd.map(s => this.instrumentService.getToken(s)!).filter(t => t);
            const nseTokens = tokensToAdd.filter(t => this.instrumentService.getExchangeSegment(t) === 'NSE');
            const bseTokens = tokensToAdd.filter(t => this.instrumentService.getExchangeSegment(t) === 'BSE');

            if (nseTokens.length > 0) {
                this.logger.log(`Subscribing to ${nseTokens.length} new dynamic NSE tokens.`);
                this.socket.fetchData({ correlationID: 'dyn_nse', action: 1, mode: 2, exchangeType: 1, tokens: nseTokens });
            }
            if (bseTokens.length > 0) {
                this.logger.log(`Subscribing to ${bseTokens.length} new dynamic BSE tokens.`);
                this.socket.fetchData({ correlationID: 'dyn_bse', action: 1, mode: 2, exchangeType: 3, tokens: bseTokens });
            }

            tokensToAdd.forEach((t) => this.currentSubscribedTokens.add(t));
        }

        if (force) {
            // Re-subscribe to everything on reconnection
            const permTokens = Array.from(this.permanentSubscribedTokens);
            const dynTokens = Array.from(this.currentSubscribedTokens);

            const nsePerm = permTokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'NSE');
            const nseDyn = dynTokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'NSE');

            if (nsePerm.length > 0) this.socket.fetchData({ correlationID: 'f_p_nse', action: 1, mode: 2, exchangeType: 1, tokens: nsePerm });
            if (nseDyn.length > 0) this.socket.fetchData({ correlationID: 'f_d_nse', action: 1, mode: 2, exchangeType: 1, tokens: nseDyn });

            const bsePerm = permTokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'BSE');
            const bseDyn = dynTokens.filter(t => this.instrumentService.getExchangeSegment(t) === 'BSE');

            if (bsePerm.length > 0) this.socket.fetchData({ correlationID: 'f_p_bse', action: 1, mode: 2, exchangeType: 3, tokens: bsePerm });
            if (bseDyn.length > 0) this.socket.fetchData({ correlationID: 'f_d_bse', action: 1, mode: 2, exchangeType: 3, tokens: bseDyn });
        }
    }
}
