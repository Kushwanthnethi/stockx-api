
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

            // --- NEW LOGIC: Check Frequency of Index Updates ---
            // We want to limit generic "Nifty/Sensex" updates to once every 4 posts (approx).
            // Check the last 3 posts from ANY bot.
            const lastBotPosts = await this.prisma.post.findMany({
                where: {
                    user: { handle: { in: this.BOT_HANDLES } }
                },
                orderBy: { createdAt: 'desc' },
                take: 3
            });

            const hasRecentIndexUpdate = lastBotPosts.some(p =>
                p.content.includes('$NIFTY50') || p.content.includes('$SENSEX')
            );

            const skipIndices = hasRecentIndexUpdate;
            if (skipIndices) {
                this.logger.log('📉 Recent Index Update found. Skipping Nifty/Sensex for this post to keep content fresh.');
            } else {
                this.logger.log('📈 Time for an Index Update. This post will include Nifty/Sensex commentary.');
            }
            // ---------------------------------------------------

            // --- WEEKEND MODE LOGIC ---
            // On Weekends (Sat/Sun), reduce frequency.
            // Only post at "Peak Hours": 9 AM, 1 PM, 5 PM, 9 PM.
            // At other times, use STRICT FILTER (only Breaking News).
            const now = new Date();
            const day = now.getDay(); // 0 = Sunday, 6 = Saturday
            const hour = now.getHours();
            const isWeekend = day === 0 || day === 6;
            const allowedWeekendHours = [9, 13, 17, 21];

            let strictImportanceFilter = false;

            if (isWeekend) {
                // If it's a weekend and not a peak hour, enforce strict filter.
                // We use a range match (e.g., if cron runs at 9:05, strictly 9 match is okay)
                // Cron is every 2 hours: 0, 2, 4... 8, 10, 12...
                // Our Cron is '0 */2 * * *' => 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22
                // Closest allowed hours in cron schedule:
                // 9 -> Cron runs at 8 or 10. Let's adjust allowed hours to match Cron capabilities or check loosely.
                // Actually, let's map Cron hours to desired "slots".
                // Desired: ~9 AM -> Cron 8 or 10
                // Desired: ~1 PM -> Cron 12 or 14
                // Desired: ~5 PM -> Cron 16 or 18
                // Desired: ~9 PM -> Cron 20 or 22

                // Let's say we allow posting if hour is 8, 10, 12, 14, 16, 18, 20, 22? No that's all day.
                // Let's pick specific cron hours that align nicely.
                // Morning: 8 or 10 (Pick 10)
                // Afternoon: 12 or 14 (Pick 14)
                // Evening: 16 or 18 (Pick 18)
                // Night: 20 or 22 (Pick 22)
                // So Allowed Cron Hours = [10, 14, 18, 22]

                const peakCronHours = [10, 14, 18, 22];

                if (!peakCronHours.includes(hour)) {
                    strictImportanceFilter = true;
                    this.logger.log(`😴 Weekend Off-Hour (${hour}:00). Enabling STRICT IMPORTANCE FILTER (Breaking News Only).`);
                } else {
                    this.logger.log(`🔔 Weekend Peak Hour (${hour}:00). Standard posting enabled.`);
                }
            }
            // --------------------------

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
            await this.generateAndPostConsolidated(freshItems, botUser.id, skipIndices, strictImportanceFilter, lastBotPosts[0]?.content);

        } catch (error) {
            this.logger.error('Failed to process news feed', error);
        }
    }

    private async generateAndPostConsolidated(items: any[], userId: string, skipIndices: boolean, strictImportanceFilter: boolean, lastPostContent?: string): Promise<boolean> {
        // Prepare news context for AI
        const newsContext = items.map((item, idx) => `
        ITEM ${idx + 1}:
        TITLE: ${item.title}
        CONTENT: ${item.contentSnippet || ''}
        LINK: ${item.link}
        SOURCE: ${item.source || 'News'}
        `).join('\n------------------\n');

        const indexInstruction = skipIndices
            ? `IMPORTANT: DO NOT mention broad market indices ($NIFTY50, $SENSEX) in this update. We recently updated on them. Focus strictly on specific company news, sector movements (e.g. IT, Auto, Banks), and global cues.`
            : `Start with a concise sentnece on the broader market mood ($NIFTY50 / $SENSEX).`;

        const weekendInstruction = strictImportanceFilter
            ? `
            ⚠️ WEEKEND MODE ACTIVE:
            You are currently in "Quiet Mode". 
            Evaluate the news items STRICTLY.
            - If there is NO major breaking news (e.g. natural disaster, war, massive regulatory ban, unexpected crash), output "SKIP".
            - Do NOT post about routine earnings, minor price movements, or general analysis.
            - Only post if it is URGENT or HIGH IMPACT.
            `
            : ``;

        const avoidanceInstruction = lastPostContent
            ? `
            IMPORTANT REDUNDANCY CHECK:
            Here is the content of our PREVIOUS post:
            """
            ${lastPostContent}
            """
            DO NOT output any news items that cover the EXACT SAME topics or stories as the previous post (e.g. if we already posted about specific company earnings, funding, or valuations, completely ignore those stories).
            You MUST wait to group fresh news. If you cannot find at least 3 completely fresh and non-redundant news stories in the list, you MUST output exactly "SKIP". Do not post just 1 or 2 items.`
            : ``;

        const prompt = `
        Act as "StocksX Bot", a premium AI market analyst.
        Your goal is to provide a "Market Pulse" update based on the news below.
        
        ${indexInstruction}

        ${weekendInstruction}

        ${avoidanceInstruction}

        NEWS ITEMS:
        ${newsContext}

        CONSTRAINTS & FORMAT:
        - If the news is trivial, output "SKIP".
        - Start with: 📊 **StocksX Market Pulse** (only if you decide to post)
        - Select the top 3-4 most impactful stories from the list. 
        - Ensure a mix of domestic (India) and global (US/World) news if available.
        - Format as bullet points (•).
        - Use concise, professional financial language.
        - For each point, explain the *impact* on Indian investors.
        - Mention tickers as $TICKER (e.g. $HDFCBANK, $TSLA, $AAPL).
        - End each bullet with [Read More](LINK).

        Example Item:
        • US Federal Reserve holds rates steady, signaling a positive cue for emerging markets. Impact: Banking stocks likely to see buying interest. 🌍 [Read More](...)
        
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
