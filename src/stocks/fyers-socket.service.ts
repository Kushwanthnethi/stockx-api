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

        const appId = this.configService.get<string>('FYERS_APP_ID')?.replace(/['"]/g, '');
        const fullToken = `${appId}:${token}`;

        try {
            this.socket = fyersDataSocket.getInstance(fullToken);

            this.socket.on('connect', () => {
                this.isConnected = true;
                this.logger.log('Fyers DataSocket Connected ✅');
                this.syncSubscriptions(true);
            });

            this.socket.on('message', (message: any) => {
                this.handleMessage(message);
            });

            this.socket.on('error', (error: any) => {
                this.logger.error('Fyers DataSocket Error:', error);
            });

            this.socket.on('close', () => {
                this.isConnected = false;
                this.logger.warn('Fyers DataSocket Closed ❌');
            });

            this.socket.connect();
            this.socket.autoreconnect();
        } catch (error) {
            this.logger.error('Failed to initialize Fyers DataSocket:', error.message);
        }
    }

    private handleMessage(message: any) {
        // ALWAYS LOG FULL JSON FOR DEBUG
        // this.logger.log(`[WebSocket] Message Received: ${JSON.stringify(message)}`);
        // Special: If the message is nested in 'data' array (seen in logs)
        if (Array.isArray(message.data)) {
            message.data.forEach((item: any) => this.handleMessage(item));
            return;
        }

        // this.logger.log(`[WebSocket] Handling Item: ${JSON.stringify(message)}`);

        // Fyers uses diverse symbols: n, symbol, s, tk (token), ts
        const fyersSymbol = message.n || message.symbol || message.s || message.tk || message.ts;

        // Price can be in lp, last_price, ltp, or iv (for indices)
        const price = message.lp || message.last_price || message.ltp || message.iv;

        if (price && fyersSymbol) {
            const yahooSymbol = SymbolMapper.fromFyers(fyersSymbol);

            // If mapping worked or it's a direct index name
            if (yahooSymbol) {
                // DEBUG LOG for indices
                if (fyersSymbol.includes('INDEX') || ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'Nifty 50', 'Sensex', 'Nifty Bank'].includes(fyersSymbol)) {
                    this.logger.log(`[WebSocket] Index Update Matched: ${fyersSymbol} -> ${yahooSymbol} | Price: ${price} | Ch: ${message.ch || message.cng} | ChP: ${message.chp || message.nc}`);
                }

                this.stocksGateway.sendPriceUpdate(yahooSymbol, {
                    price: price,
                    change: message.ch || message.cng || 0,
                    changePercent: message.chp || message.nc || 0,
                    symbol: yahooSymbol,
                });

                // Update Database for Indices to ensure freshness on refresh
                const isIndexFyers = fyersSymbol.includes('INDEX') || ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'Nifty 50', 'Sensex', 'Nifty Bank'].includes(fyersSymbol);
                if (isIndexFyers) {
                    this.prisma.stock.update({
                        where: { symbol: yahooSymbol },
                        data: {
                            currentPrice: price,
                            changePercent: message.chp || message.nc || 0,
                            lastUpdated: new Date(),
                        }
                    }).catch(err => this.logger.error(`Failed to update DB for index ${yahooSymbol}: ${err.message}`));
                }
            }
        }
    }

    private async syncSubscriptions(force = false) {
        if (!this.isConnected || !this.socket) return;

        const neededSymbols = this.stocksGateway.getAllSubscribedSymbols();

        const symbolsToAdd = neededSymbols.filter((s) => !this.currentSubscribedSymbols.has(s));

        if (symbolsToAdd.length > 0) {
            const indexNames = ['NIFTY 50', 'SENSEX', 'NIFTY BANK'];
            const indexSymbols = symbolsToAdd.filter(s => indexNames.includes(s));
            const stockSymbols = symbolsToAdd.filter(s => !indexNames.includes(s));

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
            const indexNames = ['NIFTY 50', 'SENSEX', 'NIFTY BANK'];
            const indexSymbols = symbols.filter(s => indexNames.includes(s));
            const stockSymbols = symbols.filter(s => !indexNames.includes(s));

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
