const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Database Cleanup Started ---');

    // Explicitly list the garbage keys we want to remove
    const keysToRemove = [
        'test_token',
        'canary_1772696290990',
        'test'
        // fyers_token_v4 is NOT in this list
    ];

    try {
        const deletedCount = await prisma.appConfig.deleteMany({
            where: {
                key: {
                    in: keysToRemove
                }
            }
        });
        console.log(`Successfully removed ${deletedCount.count} junk records.`);

        // Also remove any other canary keys just in case
        const canaryDeleted = await prisma.appConfig.deleteMany({
            where: {
                key: {
                    startsWith: 'canary'
                }
            }
        });
        console.log(`Successfully removed ${canaryDeleted.count} additional canary records.`);

        const remaining = await prisma.appConfig.findMany();
        console.log('Remaining Keys in DB:', remaining.map(r => r.key));
    } catch (err) {
        console.error('Cleanup failed:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
