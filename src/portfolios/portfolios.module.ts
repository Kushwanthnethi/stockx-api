import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PortfoliosController } from './portfolios.controller';
import { PortfoliosService } from './portfolios.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GroqService } from '../services/groq.service';

@Module({
    imports: [PrismaModule, ConfigModule],
    controllers: [PortfoliosController],
    providers: [PortfoliosService, GroqService],
    exports: [PortfoliosService]
})
export class PortfoliosModule { }
