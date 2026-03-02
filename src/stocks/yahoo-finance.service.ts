
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class YahooFinanceService {
    private readonly logger = new Logger(YahooFinanceService.name);
    private yahooFinance: any = null;

    private isCircuitOpen = false;
    private circuitOpenUntil = 0;
    private consecutiveErrors = 0;
    private readonly MAX_CONSECUTIVE_ERRORS = 5;
    private readonly CIRCUIT_BREAKER_DURATION = 5 * 60 * 1000; // 5 minutes

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

    /**
     * Executes a Yahoo Finance call with retry logic and circuit breaking.
     */
    async resilientCall<T>(module: string, method: string, ...args: any[]): Promise<T> {
        if (this.isCircuitOpen) {
            if (Date.now() < this.circuitOpenUntil) {
                this.logger.warn(`Circuit is OPEN for Yahoo Finance. Skipping ${module}.${method}`);
                throw new Error('Yahoo Finance Circuit Breaker is active');
            }
            this.isCircuitOpen = false;
            this.consecutiveErrors = 0;
            this.logger.log('Circuit closed. Resuming Yahoo Finance calls.');
        }

        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const client = await this.getClient();
                // Check if the module exists on the client
                if (!client[module]) {
                    throw new Error(`Yahoo Finance module "${module}" not found.`);
                }
                const result = await client[module](...args);

                // Success: reset error counter
                this.consecutiveErrors = 0;
                return result as T;
            } catch (error: any) {
                lastError = error;
                const isRateLimit = error.message?.includes('429') ||
                    error.message?.includes('crumb') ||
                    error.message?.includes('Too Many Requests');

                if (isRateLimit) {
                    this.consecutiveErrors++;
                    if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
                        this.openCircuit();
                        throw new Error('Yahoo Finance Rate Limit hit too many times. Circuit opened.');
                    }

                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
                        this.logger.warn(`Yahoo Rate Limit (429) on ${module}.${method}. Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                }

                // For non-rate-limit errors or if retries exhausted
                this.logger.error(`Yahoo Finance call failed (${module}.${method}): ${error.message}`);
                throw error;
            }
        }
        throw lastError;
    }

    private openCircuit() {
        this.isCircuitOpen = true;
        this.circuitOpenUntil = Date.now() + this.CIRCUIT_BREAKER_DURATION;
        this.logger.error(`🚨 Yahoo Finance Circuit OPENED for ${this.CIRCUIT_BREAKER_DURATION / 1000}s due to consecutive 429s.`);
    }

    get isLimited() {
        return this.isCircuitOpen && Date.now() < this.circuitOpenUntil;
    }
}
