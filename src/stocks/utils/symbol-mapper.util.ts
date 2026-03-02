export class SymbolMapper {
    static toFyers(yahooSymbol: string): string {
        if (!yahooSymbol) return '';

        // Normalize for mapping logic (RELIANCE -> RELIANCE.NS)
        let sym = yahooSymbol.toUpperCase().replace(/\s+/g, ' '); // Normalize spaces

        // Indices mapping
        if (sym === '^NSEI' || sym === 'NIFTY 50') return 'NSE:NIFTY50-INDEX';
        if (sym === '^BSESN' || sym === 'SENSEX') return 'BSE:SENSEX-INDEX';
        if (sym === '^NSEBANK' || sym === 'NSEBANK' || sym === 'NIFTY BANK') return 'NSE:NIFTYBANK-INDEX';
        if (sym === '^CNXIT' || sym === 'NIFTY IT') return 'NSE:NIFTYIT-INDEX';
        if (sym === '^CNXPHARMA' || sym === 'NIFTY PHARMA') return 'NSE:NIFTYPHARMA-INDEX';
        if (sym === '^CNXAUTO' || sym === 'NIFTY AUTO') return 'NSE:NIFTYAUTO-INDEX';
        if (sym === '^CNXFMCG' || sym === 'NIFTY FMCG') return 'NSE:NIFTYFMCG-INDEX';
        if (sym === '^CNXMETAL' || sym === 'NIFTY METAL') return 'NSE:NIFTYMETAL-INDEX';
        if (sym === '^CNXREALTY' || sym === 'NIFTY REALTY') return 'NSE:NIFTYREALTY-INDEX';
        if (sym === '^CNXENERGY' || sym === 'NIFTY ENERGY') return 'NSE:NIFTYENERGY-INDEX';
        if (sym === '^NSEMDCP50' || sym === 'NIFTY MIDCAP 50') return 'NSE:NIFTYMIDCAP50-INDEX';

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
        const upperFyers = fyersSymbol.toUpperCase();

        // Comprehensive Index Map for reverse lookup
        if (upperFyers === 'NSE:NIFTY50-INDEX' || upperFyers === 'NIFTY50' || upperFyers === 'NIFTY 50') return 'NIFTY 50';
        if (upperFyers === 'BSE:SENSEX-INDEX' || upperFyers === 'SENSEX') return 'SENSEX';
        if (upperFyers === 'NSE:NIFTYBANK-INDEX' || upperFyers === 'NIFTYBANK' || upperFyers === 'NIFTY BANK') return 'NIFTY BANK';
        if (upperFyers === 'NSE:NIFTYIT-INDEX' || upperFyers === 'NIFTYIT' || upperFyers === 'NIFTY IT') return 'NIFTY IT';
        if (upperFyers === 'NSE:NIFTYPHARMA-INDEX' || upperFyers === 'NIFTYPHARMA' || upperFyers === 'NIFTY PHARMA') return 'NIFTY PHARMA';
        if (upperFyers === 'NSE:NIFTYAUTO-INDEX' || upperFyers === 'NIFTYAUTO' || upperFyers === 'NIFTY AUTO') return 'NIFTY AUTO';
        if (upperFyers === 'NSE:NIFTYFMCG-INDEX' || upperFyers === 'NIFTYFMCG' || upperFyers === 'NIFTY FMCG') return 'NIFTY FMCG';
        if (upperFyers === 'NSE:NIFTYMETAL-INDEX' || upperFyers === 'NIFTYMETAL' || upperFyers === 'NIFTY METAL') return 'NIFTY METAL';
        if (upperFyers === 'NSE:NIFTYREALTY-INDEX' || upperFyers === 'NIFTYREALTY' || upperFyers === 'NIFTY REALTY') return 'NIFTY REALTY';
        if (upperFyers === 'NSE:NIFTYENERGY-INDEX' || upperFyers === 'NIFTYENERGY' || upperFyers === 'NIFTY ENERGY') return 'NIFTY ENERGY';
        if (upperFyers === 'NSE:NIFTYMIDCAP50-INDEX' || upperFyers === 'NIFTYMIDCAP50' || upperFyers === 'NIFTY MIDCAP 50') return 'NIFTY MIDCAP 50';

        // Stock mapping (NSE:RELIANCE-EQ -> RELIANCE.NS)
        const match = fyersSymbol.match(/(NSE|BSE):(.+)-(EQ|INDEX)/);
        if (match) {
            const exchange = match[1];
            const name = match[2];
            const type = match[3];

            if (type === 'INDEX') {
                // If it's an index but not in our explicit map, try to return a friendly name
                return name.replace('NIFTY', 'NIFTY ');
            }

            return exchange === 'NSE' ? `${name}.NS` : `${name}.BO`;
        }

        return fyersSymbol;
    }
}
