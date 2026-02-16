import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StrategistController } from './strategist.controller';
import { StrategistService } from './strategist.service';

@Module({
    imports: [ConfigModule],
    controllers: [StrategistController],
    providers: [StrategistService],
})
export class StrategistModule { }
