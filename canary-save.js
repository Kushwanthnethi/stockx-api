const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Writing canary...');
    const data = JSON.stringify({
        access_token: 'mock_token_' + Date.now(),
        date: new Date().toISOString(),
    });
    await prisma.appConfig.upsert({
        where: { key: 'fyers_token_v4' },
        create: { key: 'fyers_token_v4', value: data },
        update: { value: data }
    });
    console.log('Canary write complete.');
}

main().finally(() => prisma.$disconnect());
