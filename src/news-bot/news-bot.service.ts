
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
        Act as "StocksX Bot", a high-end financial news anchor for Indian investors.
        Your goal is to provide a concise "Market Pulse" summary of ONLY significant, high-impact news.

        NEWS ITEMS:
        ${newsContext}

        CONSTRAINTS & QUALITY FILTER:
        - If NONE of the news items are significant or market-moving for Indian investors, output ONLY the word "SKIP".
        - Trivial updates, general global news with no India link, or repetitive technical noise should be ignored.
        - If there is important news:
            - Start with: 📊 **StocksX Market Pulse**
            - For each significant news item, provide a single bullet point (use "•").
            - Each point should be a concise summary + the market impact.
            - Mention stocks as $TICKER (e.g. $RELIANCE, $NIFTY50).
            - Use 1 relevant emoji per bullet.
            - End each bullet with a markdown link: [Read More](LINK)
            - DO NOT add introduction or outro text.
        
        Output ONLY the structured market pulse text or "SKIP".
        `;

        try {
            this.logger.log('Generating AI Consolidated content with Quality Filter...');
            const model = this.aiConfig.getModel({ model: 'models/gemini-flash-latest', isSOW: false });
            if (!model) {
                this.logger.error('No AI Model available.');
                return false;
            }

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const postContent = response.text().trim();

            if (!postContent || postContent.toUpperCase() === 'SKIP') {
                this.logger.log('AI filtered out news as unimportant. Skipping post.');
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
