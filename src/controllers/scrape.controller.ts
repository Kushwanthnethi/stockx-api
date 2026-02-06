
import { Controller, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { BseScraperService } from '../services/bse-scraper.service';

@Controller('api/scrape')
export class ScrapeController {

    @Get(':symbol')
    async scrapeFundamentals(@Param('symbol') symbol: string) {
        // Basic validation: 6 digit code or Symbol mapping
        // For this POC, we assume the user passes the Scrip Code directly or we map it.
        // Let's assume the user passes '500325' for Reliance.

        if (!symbol) {
            throw new HttpException('Symbol/Scrip Code is required', HttpStatus.BAD_REQUEST);
        }

        try {
            console.log(`Received scrape request for ${symbol}`);
            // In a real app, looking up the Scrip Code from the Symbol (e.g. RELIANCE -> 500325) happens here.
            // For now, we trust the input is the code.
            const filePath = await BseScraperService.getLatestFinancialPdf(symbol);

            if (!filePath) {
                throw new HttpException('No PDF found for this company', HttpStatus.NOT_FOUND);
            }

            return {
                status: 'success',
                message: 'PDF downloaded successfully',
                filePath: filePath,
                // In real flow: Trigger Parser here -> Update DB -> Return JSON
            };

        } catch (error) {
            console.error('Scrape controller error:', error);
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Failed to scrape data',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : null
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
