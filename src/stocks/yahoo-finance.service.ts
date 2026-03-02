
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
                    suppressNotices: ['yahooSurvey'],
                    logger: {
                        info: (...args: any[]) => { },
                        warn: (...args: any[]) => {
                            if (args[0] && typeof args[0] === 'string' && args[0].includes('Could not determine entry type')) {
                                return;
                            }
                            console.warn(...args);
                        },
                        error: (...args: any[]) => { },
                        debug: (...args: any[]) => { },
                        dir: (...args: any[]) => { }
                    }
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
