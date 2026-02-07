import { Controller, Get, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BseScraperService } from '../services/bse-scraper.service';

@Controller('api/scrape')
export class ScrapeController {
    private readonly logger = new Logger(ScrapeController.name);

    constructor(private readonly scraperService: BseScraperService) { }

    @Get(':symbol')
    async scrapeFundamentals(@Param('symbol') symbol: string) {
        if (!symbol) {
            throw new HttpException('Symbol/Scrip Code is required', HttpStatus.BAD_REQUEST);
        }

        this.logger.log(`Received scrape request for ${symbol}`);

        try {
            const result = await this.scraperService.scrapeAndSave(symbol);

            if (result.status === 'error') {
                throw new HttpException(result.message || 'Unknown Error', HttpStatus.BAD_REQUEST);
            }

            return {
                status: 'success',
                message: 'Financials scraped and saved successfully',
                data: result.data
            };

        } catch (error) {
            this.logger.error('Scrape controller error:', error);
            throw new HttpException({
                status: HttpStatus.INTERNAL_SERVER_ERROR,
                error: 'Failed to scrape data',
                message: error instanceof Error ? error.message : String(error) || 'Unknown error'
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
