import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AngelOneSocketService } from './angel-one-socket.service';

@WebSocketGateway({
    cors: {
        origin: ['http://localhost:3000', 'https://stocksx.in', 'https://www.stocksx.in'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
})
export class StocksGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(StocksGateway.name);
    private subscribedSymbols: Map<string, Set<string>> = new Map();

    // Bidirectional alias map: Angel One internal symbols <-> display labels
    private readonly symbolAliasMap: Map<string, string[]> = new Map([
        ['^NSEI', ['NIFTY 50']],
        ['^NSEBANK', ['NIFTY BANK']],
        ['^BSESN', ['SENSEX']],
        ['^CNXIT', ['NIFTY IT']],
        ['^CNXPHARMA', ['NIFTY PHARMA']],
        ['^CNXAUTO', ['NIFTY AUTO']],
        ['^CNXFMCG', ['NIFTY FMCG']],
        ['^CNXMETAL', ['NIFTY METAL']],
        ['^CNXREALTY', ['NIFTY REALTY']],
        ['^CNXENERGY', ['NIFTY ENERGY']],
        ['^NSEMDCP50', ['NIFTY MIDCAP 50']],
        ['NIFTY 50', ['^NSEI']],
        ['NIFTY BANK', ['^NSEBANK']],
        ['SENSEX', ['^BSESN']],
        ['NIFTY IT', ['^CNXIT']],
        ['NIFTY PHARMA', ['^CNXPHARMA']],
        ['NIFTY AUTO', ['^CNXAUTO']],
        ['NIFTY FMCG', ['^CNXFMCG']],
        ['NIFTY METAL', ['^CNXMETAL']],
        ['NIFTY REALTY', ['^CNXREALTY']],
        ['NIFTY ENERGY', ['^CNXENERGY']],
        ['NIFTY MIDCAP 50', ['^NSEMDCP50']],
    ]);

    handleConnection(client: Socket) {
        this.logger.debug(`Client connected: ${client.id}`);
        this.subscribedSymbols.set(client.id, new Set());
    }

    handleDisconnect(client: Socket) {
        this.logger.debug(`Client disconnected: ${client.id}`);
        this.subscribedSymbols.delete(client.id);
    }

    @SubscribeMessage('subscribeStock')
    handleSubscribe(client: Socket, symbol: string) {
        if (!symbol) return;

        // Normalize symbol (RELIANCE -> RELIANCE.NS, but keep NIFTY 50 as is)
        let normalizedSymbol = symbol.toUpperCase();
        const isIndex = normalizedSymbol.startsWith('NIFTY') || normalizedSymbol === 'SENSEX' || normalizedSymbol.startsWith('^');

        if (!normalizedSymbol.includes('.') && !isIndex) {
            normalizedSymbol = `${normalizedSymbol}.NS`;
        }

        this.logger.debug(`Client ${client.id} subscribing to ${normalizedSymbol}`);

        if (!this.subscribedSymbols.has(client.id)) {
            this.subscribedSymbols.set(client.id, new Set());
        }
        this.subscribedSymbols.get(client.id)?.add(normalizedSymbol);

        client.join(`stock_${normalizedSymbol}`);
        return { event: 'subscribed', data: normalizedSymbol };
    }

    @SubscribeMessage('unsubscribeStock')
    handleUnsubscribe(client: Socket, symbol: string) {
        if (!symbol) return;

        let normalizedSymbol = symbol.toUpperCase();
        const isIndex = normalizedSymbol.startsWith('NIFTY') || normalizedSymbol === 'SENSEX' || normalizedSymbol.startsWith('^');

        if (!normalizedSymbol.includes('.') && !isIndex) {
            normalizedSymbol = `${normalizedSymbol}.NS`;
        }

        this.logger.debug(`Client ${client.id} unsubscribing from ${normalizedSymbol}`);

        if (this.subscribedSymbols.has(client.id)) {
            this.subscribedSymbols.get(client.id)?.delete(normalizedSymbol);
        }

        client.leave(`stock_${normalizedSymbol}`);
        return { event: 'unsubscribed', data: normalizedSymbol };
    }

    sendPriceUpdate(symbol: string, data: any) {
        // Emit to the primary room
        const primaryRoom = `stock_${symbol}`;
        this.server.to(primaryRoom).emit('priceUpdate', data);

        // Also emit to all alias rooms (e.g., ^NSEI -> NIFTY 50)
        const aliases = this.symbolAliasMap.get(symbol);
        if (aliases) {
            for (const alias of aliases) {
                const aliasRoom = `stock_${alias}`;
                // Emit with data.symbol set to the alias so frontend's check passes
                this.server.to(aliasRoom).emit('priceUpdate', { ...data, symbol: alias });
            }
        }
    }

    getAllSubscribedSymbols(): string[] {
        const allSymbols = new Set<string>();
        this.subscribedSymbols.forEach((symbols) => {
            symbols.forEach((s) => allSymbols.add(s));
        });
        return Array.from(allSymbols);
    }
}
