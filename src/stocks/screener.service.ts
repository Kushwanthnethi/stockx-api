import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ScreenerService {
    private readonly logger = new Logger(ScreenerService.name);
    private yahooFinance: any = null;

    private async getYahooClient() {
        if (this.yahooFinance) return this.yahooFinance;

        try {
            const pkg = await import('yahoo-finance2');
            const YahooFinanceClass = pkg.default || pkg;

            if (typeof YahooFinanceClass === 'function') {
                this.yahooFinance = new YahooFinanceClass({
                    validation: { logErrors: true }
                });
            } else {
                this.yahooFinance = YahooFinanceClass;
            }
        } catch (e) {
            this.logger.error('Failed to initialize YahooFinance client', e);
            throw e;
        }
        return this.yahooFinance;
    }

    async getScreenerData(type: string = 'day_gainers', count: number = 20) {
        try {
            const yahooFinance = await this.getYahooClient();

            // Map frontend friendly types to Yahoo Screener IDs
            // Yahoo predefined screeners: 'day_gainers', 'day_losers', 'most_actives'
            // These often default to US, but with region='IN' they *should* work for India (NSE/BSE).

            let scrId = 'day_gainers';
            switch (type) {
                case 'gainers': scrId = 'day_gainers'; break;
                case 'losers': scrId = 'day_losers'; break;
                case 'active': scrId = 'most_actives'; break;
                // Additional premium ones we can try
                case 'undervalued': scrId = 'undervalued_growth_stocks'; break;
                case 'tech_growth': scrId = 'growth_technology_stocks'; break;
                default: scrId = type;
            }

            this.logger.log(`Fetching screener: ${scrId} for region IN`);

            const queryOptions = {
                scrIds: scrId,
                count: count * 3, // Fetch more to allow for filtering
                region: 'IN',
                lang: 'en-IN'
            };

            const result = await yahooFinance.screener(queryOptions, { validateResult: false });

            if (!result || !result.quotes) {
                return [];
            }

            // Filter for Indian exchanges only
            const validExchanges = ['NSI', 'NSE', 'BSE', 'BOM'];

            const filteredQuotes = result.quotes.filter((q: any) => {
                const isIndianExchange = validExchanges.includes(q.exchange);
                const hasIndianSuffix = q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO'));
                return isIndianExchange || hasIndianSuffix;
            });

            // Transform generic quotes to our app's standard format
            return filteredQuotes.slice(0, count).map((q: any) => ({
                symbol: q.symbol,
                companyName: q.shortName || q.longName || q.symbol,
                price: q.regularMarketPrice,
                change: q.regularMarketChange,
                changePercent: q.regularMarketChangePercent,
                volume: q.regularMarketVolume,
                marketCap: q.marketCap,
                peRatio: q.trailingPE,
                fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: q.fiftyTwoWeekLow,
                exchange: q.exchange
            }));

        } catch (error) {
            this.logger.error(`Failed to fetch screener data for ${type}: ${error.message}`);
            // Fallback: Return empty array so UI doesn't crash
            return [];
        }
    }
}
