export class SymbolMapper {
    /**
     * Common normalization for symbols (e.g. RELIANCE -> RELIANCE.NS)
     * This is used as a fallback or pre-processing step.
     */
    static normalize(symbol: string): string {
        if (!symbol) return '';
        let sym = symbol.toUpperCase().trim();

        // Basic index normalization if needed
        if (sym === 'NIFTY 50' || sym === 'NIFTY50') return '^NSEI';
        if (sym === 'SENSEX') return '^BSESN';
        if (sym === 'NIFTY BANK' || sym === 'BANKNIFTY') return '^NSEBANK';

        // Add suffix if missing (default to NSE)
        if (!sym.includes('.') && !sym.startsWith('^')) {
            return `${sym}.NS`;
        }
        return sym;
    }
}
