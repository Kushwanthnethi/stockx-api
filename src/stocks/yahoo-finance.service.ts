
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class YahooFinanceService {
    private readonly logger = new Logger(YahooFinanceService.name);
    private yahooFinance: any = null;

    constructor() { }

    async getClient() {
        if (this.yahooFinance) return this.yahooFinance;

        try {
            // Dynamic import to handle ESM/CommonJS quirks
            // @ts-ignore
            const pkg = await import('yahoo-finance2');
            const YahooFinanceClass = pkg.default || pkg;

            if (typeof YahooFinanceClass === 'function') {
                const config = {
                    validation: { logErrors: false },
                };
                // @ts-ignore
                this.yahooFinance = new YahooFinanceClass(config);
            } else {
                this.yahooFinance = YahooFinanceClass;
            }
            this.logger.log('Yahoo Finance client initialized (Singleton)');
        } catch (e) {
            this.logger.error('Failed to initialize YahooFinance client', e);
            throw e;
        }
        return this.yahooFinance;
    }
}
