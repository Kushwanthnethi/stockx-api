
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

            // 3. Process Top Items (Limit to top 5 to check freshness)
            // Reverse to post oldest first if multiple are new? No, usually newest is best.
            const latestItems = feed.items.slice(0, 5);

            for (const item of latestItems) {
                try {
                    if (!item.title || !item.link) continue;

                    // Better: Check if any post by bot in last 24h contains this Title
                    const duplicate = await this.prisma.post.findFirst({
                        where: {
                            userId: botUser.id,
                            content: { contains: item.title.substring(0, 30) },
                            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                        }
                    });

                    if (duplicate) {
                        this.logger.debug(`Skipping duplicate news: ${item.title}`);
                        continue;
                    }

                    this.logger.log(`Found fresh news: ${item.title}`);
                    const success = await this.generateAndPost(item, botUser.id);
                    if (success) {
                        this.logger.log('✅ Post successful. Stopping loop.');
                        break;
                    }
                } catch (e) {
                    this.logger.error(`Error processing item: ${item.title}`, e);
                }
            }

        } catch (error) {
            this.logger.error('Failed to process news feed', error);
        }
    }

    private async generateAndPost(item: any, userId: string): Promise<boolean> {
        // 5. AI Summarization
        const prompt = `
        Act as "StocksX Bot", a smart financial news anchor on a social media app.
        Summarize this news into a short, engaging post (max 2-3 sentences).
        
        HEADLINE: ${item.title}
        LINK: ${item.link}

        Guidelines:
        - Use 1-2 relevant emojis.
        - Mentions stocks as $TICKER if applicable.
        - Add #India #StockMarket.
        - End with the source link.
        
        Output ONLY the text.
        `;

        try {
            this.logger.log('Generating AI content...');
            // Using a more standard model string
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

            this.logger.log(`🚀 Successfully posted: ${item.title}`);
            return true;

        } catch (e) {
            this.logger.error('AI Processing failed', e.message);
            return false;
        }
    }
}
