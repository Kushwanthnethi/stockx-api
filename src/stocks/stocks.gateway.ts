import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:3001',
            'https://stockx-web.vercel.app',
            'https://www.stocksx.info',
            'https://stocksx.info',
        ],
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
        const roomName = `stock_${symbol}`;
        const room = this.server.sockets.adapter.rooms.get(roomName);
        const count = room ? room.size : 0;

        // Tick logs suppressed — too noisy for prod. Re-enable via debug if needed.
        // this.logger.debug(`[Gateway] Emitting ${symbol} update to ${count} clients. Price: ${data.price}`);

        this.server.to(roomName).emit('priceUpdate', data);
    }

    getAllSubscribedSymbols(): string[] {
        const allSymbols = new Set<string>();
        this.subscribedSymbols.forEach((symbols) => {
            symbols.forEach((s) => allSymbols.add(s));
        });
        return Array.from(allSymbols);
    }
}
