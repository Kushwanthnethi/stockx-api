import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { NewsBotService } from '../src/news-bot/news-bot.service';
import { AIConfigService } from '../src/stocks/ai-config.service';
import { ConfigService } from '@nestjs/config';

// Mock ConfigService to return env vars
class MockConfigService extends ConfigService {
    get(key: string): string {
        return process.env[key] || '';
    }
}

async function main() {
    console.log('🤖 Manual Test: NewsBotService');

    // 1. Setup Prisma
    const prisma = new PrismaClient();
    await prisma.$connect();
    console.log('✅ Prisma Connected');

    // 2. Setup AI Config
    const configService = new MockConfigService();
    const aiConfig = new AIConfigService(configService);
    aiConfig.onModuleInit(); // Load keys
    console.log('✅ AI Config Initialized');

    // 3. Setup NewsBot
    // @ts-ignore - mismatch between PrismaClient and PrismaService types irrelevant for this test
    const newsBot = new NewsBotService(prisma, aiConfig);

    // 4. Run Logic
    await newsBot.processNewsFeed();

    await prisma.$disconnect();
}

main().catch(console.error);
