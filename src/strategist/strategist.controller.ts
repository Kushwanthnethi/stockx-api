import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { StrategistService } from './strategist.service';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('strategist')
export class StrategistController {
    constructor(private readonly strategistService: StrategistService) { }

    @UseGuards(OptionalJwtAuthGuard)
    @Post('analyze')
    async analyze(@Body('query') query: string) {
        if (!query || typeof query !== 'string') {
            throw new BadRequestException('Query is required and must be a string.');
        }
        
        const cleanQuery = query.trim();
        if (cleanQuery.length === 0) {
            throw new BadRequestException('Query cannot be empty.');
        }
        
        if (cleanQuery.length > 500) {
            throw new BadRequestException('Query is too long. Please keep it under 500 characters.');
        }

        return await this.strategistService.analyze(cleanQuery);
    }
}
