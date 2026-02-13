
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

    // Pool of bot handles to rotate through
    private readonly BOT_HANDLES = [
        'stocksxbot', 'stocksxbot_2', 'stocksxbot_3', 'stocksxbot_4', 'stocksxbot_5',
        'stocksxbot_6', 'stocksxbot_7', 'stocksxbot_8', 'stocksxbot_9', 'stocksxbot_10'
    ];

    constructor(
        private prisma: PrismaService,
        private aiConfig: AIConfigService,
    ) {
        this.logger.log('NewsBotService Instance Created with Multi-Bot Support');
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
            // 1. Fetch Indian Stock Market News
            const indiaFeedUrl = 'https://news.google.com/rss/search?q=Indian+Stock+Market&hl=en-IN&gl=IN&ceid=IN:en';
            const indiaFeed = await this.parser.parseURL(indiaFeedUrl);

            // 2. Fetch Global Economy News (impacting India)
            const globalFeedUrl = 'https://news.google.com/rss/search?q=Global+Economy+India+Impact&hl=en-IN&gl=IN&ceid=IN:en';
            const globalFeed = await this.parser.parseURL(globalFeedUrl);

            this.logger.log(`Fetched ${indiaFeed.items?.length || 0} India items and ${globalFeed.items?.length || 0} Global items.`);

            const allItems = [...(indiaFeed.items || []), ...(globalFeed.items || [])];

            if (allItems.length === 0) {
                this.logger.warn('No news found in RSS feeds.');
                return;
            }

            // 3. Select a Random Bot Identity
            const randomHandle = this.BOT_HANDLES[Math.floor(Math.random() * this.BOT_HANDLES.length)];
            const botUser = await this.prisma.user.findUnique({
                where: { handle: randomHandle },
            });

            if (!botUser) {
                this.logger.error(`Selected Bot user @${randomHandle} not found! Run seed-bots.ts.`);
                return;
            }
            this.logger.log(`Selected Bot Identity: ${botUser.firstName} ${botUser.lastName} (@${randomHandle})`);

            // 4. Collect Fresh News Items (Deduplicated)
            const freshItems = [];
            const checkLimit = 20; // Look at top 20 combined
            // Simple shuffle or just take top from both? Let's interleave or just take top 
            // from combined to ensure we get the absolute latest.
            // Sorting by pubDate is better.
            allItems.sort((a, b) => {
                const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
                return dateB - dateA;
            });

            const latestPool = allItems.slice(0, checkLimit);

            for (const item of latestPool) {
                if (!item.title || !item.link) continue;

                // Check for duplicate in last 24h across ALL bot users
                // We want to avoid posting the same news event even if a different bot posts it?
                // Or just avoid exact title match?
                // Let's check global duplicates to avoid spam.
                const duplicate = await this.prisma.post.findFirst({
                    where: {
                        // Check if ANY bot has posted this recently to avoid repetition
                        user: { handle: { in: this.BOT_HANDLES } },
                        content: { contains: item.title.substring(0, 30) },
                        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                    }
                });

                if (!duplicate) {
                    freshItems.push(item);
                }

                if (freshItems.length >= 8) break; // Collect enough candidates for AI to choose from
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
        SOURCE: ${item.source || 'News'}
        `).join('\n------------------\n');

        const prompt = `
        Act as "StocksX Bot", a premium AI market analyst.
        Your goal is to provide a "Market Pulse" update that combines Indian Market News AND Key International Developments affecting India (like Fed rates, crude oil, US tech stocks, etc.).

        NEWS ITEMS:
        ${newsContext}

        CONSTRAINTS & FORMAT:
        - If the news is trivial, output "SKIP".
        - Start with: 📊 **StocksX Market Pulse**
        - Select the top 3-4 most impactful stories from the list. 
        - Ensure a mix of domestic (India) and global (US/World) news if available.
        - Format as bullet points (•).
        - Use concise, professional financial language.
        - For each point, explain the *impact* on Indian investors.
        - Mention tickers as $TICKER (e.g. $NIFTY50, $HDFCBANK, $TSLA, $AAPL).
        - End each bullet with [Read More](LINK).

        Example Item:
        • US Federal Reserve holds rates steady, signaling a positive cue for emerging markets. Impact: $NIFTY50 likely to open gap-up. 🌍 [Read More](...)
        
        Output ONLY the content.
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
