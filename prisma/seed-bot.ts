
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedBotUser() {
    const email = 'bot@stocksx.com';
    const handle = 'stocksxbot'; // Lowercase handle
    const password = process.env.BOT_PASSWORD || 'StocksXBot2026!';

    console.log(`Checking for bot user: @${handle}...`);

    const existing = await prisma.user.findUnique({ where: { handle } });

    if (existing) {
        console.log('✅ Bot user already exists.');
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Use an avatar from a public source or asset
    const avatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=stocksx';

    await prisma.user.create({
        data: {
            email,
            handle,
            firstName: 'StocksX',
            lastName: 'Bot',
            passwordHash: hashedPassword,
            isVerified: true,
            bio: '🤖 Automated Market News & Insights. Delivering high-speed updates powered by AI.',
            avatarUrl,
            role: 'ADMIN' // Give admin role so it's trusted
        }
    });

    console.log('🎉 Created Bot User: @stocksxbot');
}

seedBotUser()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
