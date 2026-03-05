const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Cleaning up AppConfig...');

    // Delete all junk keys
    const junkKeys = ['canary_test', 'test_token', 'fyers_access_token'];
    await prisma.appConfig.deleteMany({
        where: {
            key: { in: junkKeys }
        }
    });

    // Also delete anything starting with canary_
    await prisma.appConfig.deleteMany({
        where: {
            key: { startsWith: 'canary_' }
        }
    });

    console.log('Saving mock fyers_token_v4...');
    const data = JSON.stringify({
        access_token: 'MOCK_TOKEN_PERSISTENCE_TEST_' + new Date().toISOString(),
        date: new Date().toISOString(),
    });

    await prisma.appConfig.upsert({
        where: { key: 'fyers_token_v4' },
        create: { key: 'fyers_token_v4', value: data },
        update: { value: data }
    });

    const final = await prisma.appConfig.findMany();
    console.log('Final DB Content:', JSON.stringify(final, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
