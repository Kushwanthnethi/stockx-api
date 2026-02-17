import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StrategistController } from './strategist.controller';
import { StrategistService } from './strategist.service';

import { StocksModule } from '../stocks/stocks.module';

import { GroqService } from '../services/groq.service';

@Module({
    imports: [ConfigModule, StocksModule],
    controllers: [StrategistController],
    providers: [StrategistService, GroqService],
})
export class StrategistModule { }
