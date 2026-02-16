import { Controller, Post, Body } from '@nestjs/common';
import { StrategistService } from './strategist.service';

@Controller('strategist')
export class StrategistController {
    constructor(private readonly strategistService: StrategistService) { }

    @Post('analyze')
    async analyze(@Body('query') query: string) {
        if (!query) {
            return { error: 'Query is required.' };
        }
        return await this.strategistService.analyze(query);
    }
}
