export class SymbolMapper {
    static toFyers(yahooSymbol: string): string {
        if (!yahooSymbol) return '';
        // Indices mapping
        if (yahooSymbol === '^NSEI' || yahooSymbol === 'NIFTY 50') return 'NSE:NIFTY50-INDEX';
        if (yahooSymbol === '^BSESN' || yahooSymbol === 'SENSEX') return 'BSE:SENSEX-INDEX';
        if (yahooSymbol === '^NSEBANK' || yahooSymbol === 'NSEBANK' || yahooSymbol === 'NIFTY BANK') return 'NSE:NIFTYBANK-INDEX';

        // NSE Stocks (default to EQ)
        if (yahooSymbol.endsWith('.NS')) {
            return `NSE:${yahooSymbol.replace('.NS', '')}-EQ`;
        }

        // BSE Stocks
        if (yahooSymbol.endsWith('.BO')) {
            return `BSE:${yahooSymbol.replace('.BO', '')}-EQ`;
        }

        return yahooSymbol;
    }

    static fromFyers(fyersSymbol: string): string {
        // Indices mapping (supports both canonical and friendly names from socket)
        if (fyersSymbol === 'NSE:NIFTY50-INDEX' || fyersSymbol === 'Nifty 50') return 'NIFTY 50';
        if (fyersSymbol === 'BSE:SENSEX-INDEX' || fyersSymbol === 'SENSEX') return 'SENSEX';
        if (fyersSymbol === 'NSE:NIFTYBANK-INDEX' || fyersSymbol === 'Nifty Bank') return 'NIFTY BANK';

        // Stock mapping (NSE:RELIANCE-EQ -> RELIANCE.NS)
        const match = fyersSymbol.match(/(NSE|BSE):(.+)-(EQ|INDEX)/);
        if (match) {
            const exchange = match[1];
            const name = match[2];
            return exchange === 'NSE' ? `${name}.NS` : `${name}.BO`;
        }

        return fyersSymbol;
    }
}
