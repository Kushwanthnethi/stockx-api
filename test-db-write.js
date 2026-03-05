const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Saving test token...");
        await prisma.appConfig.upsert({
            where: { key: 'test_token' },
            create: { key: 'test_token', value: '123' },
            update: { value: '123' }
        });
        console.log("Saved.");

        const rows = await prisma.appConfig.findMany();
        console.log("Rows:");
        rows.forEach(r => console.log(r.key, r.value.substring(0, 20)));
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
