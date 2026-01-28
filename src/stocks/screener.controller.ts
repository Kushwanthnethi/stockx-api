import { Controller, Get, Query } from '@nestjs/common';
import { ScreenerService } from './screener.service';

@Controller('screener')
export class ScreenerController {
    constructor(private readonly screenerService: ScreenerService) { }

    @Get()
    async getScreener(@Query('type') type: string = 'gainers') {
        return this.screenerService.getScreenerData(type);
    }
}
