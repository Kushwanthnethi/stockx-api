
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NewsBotService } from './news-bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { AIConfigService } from '../stocks/ai-config.service';

@Module({
    imports: [ConfigModule],
    providers: [NewsBotService, PrismaService, AIConfigService],
})
export class NewsBotModule { }
