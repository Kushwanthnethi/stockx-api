require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function check() {
    console.log('--- DB DIAGNOSTIC ---');
    console.log('Process.env.DATABASE_URL:', process.env.DATABASE_URL ? (process.env.DATABASE_URL.substring(0, 30) + '...') : 'NULL');

    const prisma = new PrismaClient();
    try {
        const config = await prisma.appConfig.findMany();
        console.log(`AppConfig record count: ${config.length}`);
        config.forEach(c => {
            console.log(`- ${c.key}: ${c.value.substring(0, 30)}... (last updated: ${c.updatedAt})`);
        });
    } catch (e) {
        console.error('Prisma error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
