const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const key = 'persistence_test_' + Date.now();
    console.log(`Writing test key: ${key}`);

    await prisma.appConfig.upsert({
        where: { key: key },
        create: { key: key, value: 'test' },
        update: { value: 'test' }
    });

    let record = await prisma.appConfig.findUnique({ where: { key } });
    console.log(`Initial check: ${record ? 'Found' : 'NOT FOUND'}`);

    for (let i = 1; i <= 5; i++) {
        await new Promise(r => setTimeout(r, 1000));
        record = await prisma.appConfig.findUnique({ where: { key } });
        console.log(`Check at ${i}s: ${record ? 'Found' : 'NOT FOUND'}`);
    }
}

main().finally(() => prisma.$disconnect());
