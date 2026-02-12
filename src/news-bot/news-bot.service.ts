
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AIConfigService } from '../stocks/ai-config.service';
// @ts-ignore
import Parser = require('rss-parser');
import * as crypto from 'crypto';

@Injectable()
export class NewsBotService {
    private readonly logger = new Logger(NewsBotService.name);
    private parser = new Parser();
    private readonly BOT_HANDLE = 'stocksxbot';

    constructor(
        private prisma: PrismaService,
        private aiConfig: AIConfigService,
    ) {
        this.logger.log('NewsBotService Instance Created');
    }

    // Run every 2 hours
    @Cron('0 */2 * * *')
    async handleCron() {
        this.logger.log('🤖 StocksX Bot: Checking for breaking news...');
        await this.processNewsFeed();
    }

    async processNewsFeed() {
        this.logger.log('Starting processNewsFeed()...');
        try {
            // 1. Fetch RSS Feed (Google News - Indian Stock Market)
            const feedUrl = 'https://news.google.com/rss/search?q=Indian+Stock+Market&hl=en-IN&gl=IN&ceid=IN:en';
            this.logger.log(`Fetching RSS from: ${feedUrl}`);
            const feed = await this.parser.parseURL(feedUrl);
            this.logger.log(`Found ${feed.items?.length || 0} items in feed.`);

            if (!feed.items || feed.items.length === 0) {
                this.logger.warn('No news found in RSS feed.');
                return;
            }

            // 2. Get Bot User ID
            const botUser = await this.prisma.user.findUnique({
                where: { handle: this.BOT_HANDLE },
            });

            if (!botUser) {
                this.logger.error(`Bot user @${this.BOT_HANDLE} not found! Run seed-bot.ts.`);
                return;
            }

            // 3. Collect Fresh News Items (Group up to 5 items)
            const freshItems = [];
            const checkLimit = 10; // Look at top 10 for duplicates
            const latestPool = feed.items.slice(0, checkLimit);

            for (const item of latestPool) {
                if (!item.title || !item.link) continue;

                // Check for duplicate in last 24h
                const duplicate = await this.prisma.post.findFirst({
                    where: {
                        userId: botUser.id,
                        content: { contains: item.title.substring(0, 30) },
                        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                    }
                });

                if (!duplicate) {
                    freshItems.push(item);
                }

                if (freshItems.length >= 5) break;
            }

            if (freshItems.length === 0) {
                this.logger.log('No new fresh items to post.');
                return;
            }

            this.logger.log(`Found ${freshItems.length} fresh news items. Generating consolidated pulse post.`);
            await this.generateAndPostConsolidated(freshItems, botUser.id);

        } catch (error) {
            this.logger.error('Failed to process news feed', error);
        }
    }

    private async generateAndPostConsolidated(items: any[], userId: string): Promise<boolean> {
        // Prepare news context for AI
        const newsContext = items.map((item, idx) => `
        ITEM ${idx + 1}:
        TITLE: ${item.title}
        CONTENT: ${item.contentSnippet || ''}
        LINK: ${item.link}
        `).join('\n------------------\n');

        const prompt = `
        Act as "StocksX Bot", a high-end financial news anchor. 
        Create a consolidated "Morning/Market Pulse" update based on the news items provided.
        
        NEWS ITEMS:
        ${newsContext}

        CONSTRAINTS:
        - Start with: 📊 **StocksX Market Pulse**
        - For each relevant news item, provide a single bullet point (use "•").
        - Each point should be a concise summary + the market impact.
        - Mentions stocks as $TICKER (e.g. $RELIANCE, $NIFTY50).
        - Use 1 relevant emoji per bullet.
        - VERY IMPORTANT: At the end of EACH bullet point, add a markdown link like this: [Read More](LINK)
        - DO NOT add introduction text or outro text. Just the header and bullets.
        
        Output ONLY the structured market pulse text.
        `;

        try {
            this.logger.log('Generating AI Consolidated content...');
            const model = this.aiConfig.getModel({ model: 'models/gemini-flash-latest', isSOW: false });
            if (!model) {
                this.logger.error('No AI Model available.');
                return false;
            }

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const postContent = response.text().trim();

            if (!postContent) {
                this.logger.warn('AI generated empty content.');
                return false;
            }

            // 6. Post to Feed
            await this.prisma.post.create({
                data: {
                    userId: userId,
                    content: postContent,
                }
            });

            this.logger.log(`🚀 Successfully posted consolidated pulse with ${items.length} items.`);
            return true;

        } catch (e) {
            this.logger.error('AI Consolidated Processing failed', e.message);
            return false;
        }
    }
}
