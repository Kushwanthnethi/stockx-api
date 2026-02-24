export class SymbolMapper {
    static toFyers(yahooSymbol: string): string {
        if (!yahooSymbol) return '';

        // Normalize for mapping logic (RELIANCE -> RELIANCE.NS)
        let sym = yahooSymbol.toUpperCase();

        // Indices mapping
        if (sym === '^NSEI' || sym === 'NIFTY 50') return 'NSE:NIFTY50-INDEX';
        if (sym === '^BSESN' || sym === 'SENSEX') return 'BSE:SENSEX-INDEX';
        if (sym === '^NSEBANK' || sym === 'NSEBANK' || sym === 'NIFTY BANK') return 'NSE:NIFTYBANK-INDEX';

        // Add suffix if missing (default to NSE)
        if (!sym.includes('.') && !sym.startsWith('^')) {
            sym = `${sym}.NS`;
        }

        // NSE Stocks (default to EQ)
        if (sym.endsWith('.NS')) {
            return `NSE:${sym.replace('.NS', '')}-EQ`;
        }

        // BSE Stocks
        if (sym.endsWith('.BO')) {
            return `BSE:${sym.replace('.BO', '')}-EQ`;
        }

        return sym;
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
