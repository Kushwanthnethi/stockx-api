import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StocksService } from '../stocks/stocks.service';
import { TRACKED_STOCKS } from './constants';

@Injectable()
export class EarningsScheduler {
    private readonly logger = new Logger(EarningsScheduler.name);
    private isJobRunning = false;

    constructor(private readonly stocksService: StocksService) { }

    // Run every hour to check for immediate updates (TODAY/TOMORROW)
    // This is the "Sipping" strategy - frequently check small subset
    @Cron(CronExpression.EVERY_HOUR)
    async handleHourlyCheck() {
        if (this.isJobRunning) {
            this.logger.warn('Previous job still running, skipping hourly check.');
            return;
        }
        this.isJobRunning = true;

        try {
            this.logger.log('Starting hourly earnings check...');

            // 1. Get stocks that might be reporting soon (or reported recently without update)
            // For simplicity in this PoC, we will check stocks that are already marked as UPCOMING
            // and have a date close to today.
            const today = new Date();

            // Fetch upcoming from DB to see if we need to verify status
            const upcoming = await this.stocksService.getEarningsFromDB(200);

            const stocksToCheck = upcoming.filter(s => {
                if (!s.date) return false;
                const diffTime = Math.abs(new Date(s.date).getTime() - today.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 2; // Check stocks within 2 day window
            }).map(s => s.symbol);

            if (stocksToCheck.length > 0) {
                this.logger.log(`Checking ${stocksToCheck.length} stocks for immediate result updates...`);
                await this.processBatch(stocksToCheck);
            } else {
                this.logger.log('No immediate earnings updates expected.');
            }

        } catch (error) {
            this.logger.error('Error in hourly earnings check', error);
        } finally {
            this.isJobRunning = false;
        }
    }

    // Run once a day at 2 AM to refresh the FULL calendar
    // This ensures future dates are populated
    @Cron('0 2 * * *')
    async handleDailyRefresh() {
        if (this.isJobRunning) return;
        this.isJobRunning = true;

        try {
            this.logger.log('Starting daily full earnings calendar refresh...');
            // Refresh all tracked stocks
            await this.processBatch(TRACKED_STOCKS);
        } catch (e) {
            this.logger.error('Error in daily refresh', e);
        } finally {
            this.isJobRunning = false;
        }
    }

    // Helper to process a list of symbols in small batches with delay
    private async processBatch(symbols: string[]) {
        const BATCH_SIZE = 5;
        const DELAY_MS = 2000; // 2 seconds between batches

        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);
            this.logger.log(`Processing batch ${i / BATCH_SIZE + 1}: ${batch.join(', ')}`);

            await Promise.all(batch.map(symbol => this.stocksService.updateEarnings(symbol)));

            if (i + BATCH_SIZE < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }
        this.logger.log('Batch processing completed.');
    }
}
