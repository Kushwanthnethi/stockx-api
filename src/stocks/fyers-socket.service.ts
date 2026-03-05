import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { fyersDataSocket } from 'fyers-api-v3';
import { FyersService } from './fyers.service';
import { StocksGateway } from './stocks.gateway';
import { SymbolMapper } from './utils/symbol-mapper.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FyersSocketService implements OnModuleInit {
    private readonly logger = new Logger(FyersSocketService.name);
    private socket: any;
    private isConnected = false;
    private currentSubscribedSymbols: Set<string> = new Set();


    constructor(
        private fyersService: FyersService,
        private stocksGateway: StocksGateway,
        private configService: ConfigService,
        private prisma: PrismaService,
    ) { }

    async onModuleInit() {
        this.logger.log('Initializing Fyers Socket Service...');

        // Connect after a delay to allow the system to stabilize
        setTimeout(() => this.connect(), 5000);

        // Periodically check if we need to connect (if token was missing initially)
        setInterval(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, 5000);

        // Periodically sync subscriptions from the gateway (every 2s for high responsiveness)
        setInterval(() => this.syncSubscriptions(), 2000);
    }

    async connect() {
        const token = await this.fyersService.getAccessToken();
        if (!token) {
            this.logger.warn('Fyers Token missing. WebSocket connection pending...');
            return;
        }

        const appId = this.configService.get<string>('FYERS_APP_ID')?.replace(/['"]/g, '').trim();
        const fullToken = `${appId}:${token}`;

        try {
            this.socket = fyersDataSocket.getInstance(fullToken);

            this.socket.on('connect', () => {
                this.isConnected = true;
                this.logger.log('Fyers DataSocket Connected ✅');
                // Set a small delay before syncing subscriptions to let connection stabilize
                setTimeout(() => this.syncSubscriptions(true), 2000);
            });

            this.socket.on('message', (message: any) => {
                this.handleMessage(message);
            });

            // Catch WS errors to prevent app crashes (e.g., 502 Bad Gateway)
            this.socket.on('error', async (error: any) => {
                const errorMsg = error.message || error;
                this.logger.warn(`Fyers DataSocket Error Caught: ${errorMsg}`);
                this.isConnected = false;

                if (typeof errorMsg === 'string' && (errorMsg.includes('403') || errorMsg.includes('401'))) {
                    this.logger.error(`Token rejected by Fyers (403/401). Clearing invalid token.`);
                    await this.fyersService.clearToken();
                    return;
                }

                // Wait 10s before attempting reconnect automatically
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.logger.log('Attempting manual reconnect after error...');
                        this.socket?.connect();
                    }
                }, 10000);
            });

            this.socket.on('close', (event?: any) => {
                this.isConnected = false;
                this.logger.warn(`Fyers DataSocket Closed ❌ (Code: ${event?.code}, Reason: ${event?.reason})`);

                // Wait for potential new tokens to be generated before reconnecting
                setTimeout(() => {
                    if (!this.isConnected) {
                        this.logger.log('Attempting manual reconnect after close...');
                        this.socket?.connect();
                    }
                }, 15000);
            });

            this.socket.connect();
            this.socket.autoreconnect();

            // Critical fix for `ws` library throwing "Unexpected server response: 502" asynchronously
            if (this.socket.ws && typeof this.socket.ws.on === 'function') {
                this.socket.ws.on('error', (err: any) => {
                    this.logger.warn(`Underlying WS Error: ${err.message}`);
                });
            }
        } catch (error) {
            this.logger.error('Failed to initialize Fyers DataSocket:', error.message);
        }
    }

    private handleMessage(message: any) {
        // ALWAYS LOG FULL JSON FOR DEBUG ON INDICES
        if (message.n?.includes('INDEX') || message.s?.includes('INDEX')) {
            this.logger.debug(`[WebSocket] Index Update Received: ${message.n || message.s} | Price: ${message.lp || message.ltp || message.iv}`);
        }

        // Fyers uses diverse symbols: n, symbol, s, tk (token), ts
        const fyersSymbol = message.n || message.symbol || message.s || message.tk || message.ts;

        // Price can be in lp, last_price, ltp, or iv (for indices)
        const price = message.lp || message.last_price || message.ltp || message.iv;

        if (price && fyersSymbol) {
            const yahooSymbol = SymbolMapper.fromFyers(fyersSymbol);

            // If mapping worked or it's a direct index name
            if (yahooSymbol) {
                // Tick log suppressed — fires on every price update. Use debug to re-enable.
                // this.logger.debug(`[WebSocket] Index Update: ${fyersSymbol} -> ${yahooSymbol} | Price: ${price}`);

                this.stocksGateway.sendPriceUpdate(yahooSymbol, {
                    price: price,
                    change: message.ch || message.cng || 0,
                    changePercent: message.chPercent || message.chp || message.nc || 0,
                    symbol: yahooSymbol,
                });

                // Update Database for all stocks to ensure freshness on refresh/load
                this.prisma.stock.update({
                    where: { symbol: yahooSymbol },
                    data: {
                        currentPrice: price,
                        changePercent: message.chPercent || message.chp || message.nc || 0,
                        lastUpdated: new Date(),
                    }
                }).catch(() => {
                    // Silent catch - sectoral indices or new symbols might not be in DB yet
                });
            }
        }
    }

    private async syncSubscriptions(force = false) {
        if (!this.isConnected || !this.socket) return;

        const neededSymbols = this.stocksGateway.getAllSubscribedSymbols();

        const symbolsToAdd = neededSymbols.filter((s) => !this.currentSubscribedSymbols.has(s));

        if (symbolsToAdd.length > 0) {
            const indexSymbols = symbolsToAdd.filter(s => s.startsWith('NIFTY') || s === 'SENSEX');
            const stockSymbols = symbolsToAdd.filter(s => !(s.startsWith('NIFTY') || s === 'SENSEX'));

            if (indexSymbols.length > 0) {
                const fyersIndices = indexSymbols.map(s => SymbolMapper.toFyers(s));
                this.logger.log(`Subscribing to Fyers Indices (Lite Mode): ${fyersIndices.join(', ')}`);
                this.socket.subscribe(fyersIndices, false);
            }

            if (stockSymbols.length > 0) {
                const fyersStocks = stockSymbols.map(s => SymbolMapper.toFyers(s));
                this.logger.log(`Subscribing to Fyers Stocks (Lite Mode): ${fyersStocks.join(', ')}`);
                this.socket.subscribe(fyersStocks, false);
            }

            symbolsToAdd.forEach((s) => this.currentSubscribedSymbols.add(s));
        }

        if (force && this.currentSubscribedSymbols.size > 0) {
            const symbols = Array.from(this.currentSubscribedSymbols);
            const indexSymbols = symbols.filter(s => s.startsWith('NIFTY') || s === 'SENSEX');
            const stockSymbols = symbols.filter(s => !(s.startsWith('NIFTY') || s === 'SENSEX'));

            if (indexSymbols.length > 0) {
                const fyersIndices = indexSymbols.map(s => SymbolMapper.toFyers(s));
                this.logger.log(`Re-subscribing to Fyers Indices (Lite Mode): ${fyersIndices.join(', ')}`);
                this.socket.subscribe(fyersIndices, false);
            }

            if (stockSymbols.length > 0) {
                const fyersStocks = stockSymbols.map(s => SymbolMapper.toFyers(s));
                this.logger.log(`Re-subscribing to Fyers Stocks (Lite Mode): ${fyersStocks.join(', ')}`);
                this.socket.subscribe(fyersStocks, false);
            }
        }
    }
}
