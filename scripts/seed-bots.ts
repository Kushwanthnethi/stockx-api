
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding StocksX Bots...');

    const bots = [
        { handle: 'stocksxbot', email: 'bot@stocksx.com', color: 'ffdfbf' }, // Orange/Skin
        { handle: 'stocksxbot_2', email: 'bot2@stocksx.com', color: 'f24e1e' }, // Red (Ren?)
        { handle: 'stocksxbot_3', email: 'bot3@stocksx.com', color: '0d8abc' }, // Blue
        { handle: 'stocksxbot_4', email: 'bot4@stocksx.com', color: 'a6ff00' }, // Green
        { handle: 'stocksxbot_5', email: 'bot5@stocksx.com', color: 'd902ee' }, // Purple
        { handle: 'stocksxbot_6', email: 'bot6@stocksx.com', color: '00d1b2' }, // Teal
        { handle: 'stocksxbot_7', email: 'bot7@stocksx.com', color: 'ffdd57' }, // Yellow
        { handle: 'stocksxbot_8', email: 'bot8@stocksx.com', color: 'ff3860' }, // Pink
        { handle: 'stocksxbot_9', email: 'bot9@stocksx.com', color: '363636' }, // Dark/Black
        { handle: 'stocksxbot_10', email: 'bot10@stocksx.com', color: '8c9b9d' }, // Grey
    ];

    // Using DiceBear v9 with PNG support for better compatibility
    const avatarBase = 'https://api.dicebear.com/9.x/bottts/png';

    for (const bot of bots) {
        // Use 'baseColor' to color the robot contextually if supported, or just seed.
        // For bottts, changing the seed changes the robot.
        // We can also add a background color.
        const avatarUrl = `${avatarBase}?seed=${bot.handle}&backgroundColor=${bot.color}`;

        // We can also use the local artifact paths if we upload them to cloud storage, 
        // but for now, let's use a reliable placeholder or the ones we generate if successful.
        // Since this script runs on the server, it needs public URLs. 

        // Check if user exists
        const existing = await prisma.user.findUnique({
            where: { handle: bot.handle },
        });

        if (!existing) {
            await prisma.user.create({
                data: {
                    handle: bot.handle,
                    email: bot.email,
                    firstName: 'StocksX',
                    lastName: 'Bot',
                    passwordHash: crypto.randomBytes(16).toString('hex'), // Random password
                    isVerified: true,
                    bio: 'AI-powered market insights and real-time updates.',
                    avatarUrl: avatarUrl, // Using Dicebear for now as reliable distinct avatars
                    role: 'ADMIN', // Giving admin role just in case, or USER
                },
            });
            console.log(`✅ Created bot: @${bot.handle}`);
        } else {
            // Update existing bot's details if needed
            await prisma.user.update({
                where: { handle: bot.handle },
                data: {
                    firstName: 'StocksX',
                    lastName: 'Bot',
                    avatarUrl: avatarUrl, // Update avatar to ensure consistency
                    isVerified: true
                }
            });
            console.log(`🔄 Updated bot: @${bot.handle}`);
        }
    }

    console.log('✨ Bot seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
