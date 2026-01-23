
import { Controller, Get, Param } from '@nestjs/common';
import { InvestorsService } from './investors.service';

@Controller('investors')
export class InvestorsController {
    constructor(private readonly investorsService: InvestorsService) { }

    @Get()
    findAll() {
        return this.investorsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.investorsService.findOne(id);
    }
}
