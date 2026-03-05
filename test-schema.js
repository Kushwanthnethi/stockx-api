const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDb() {
    try {
        console.log("Checking AppConfig Table...");
        const rows = await prisma.appConfig.findMany();
        console.log(`Found ${rows.length} rows.`);
        rows.forEach(r => {
            console.log(`- Key: ${r.key}`);
            if (r.key.toLowerCase().includes('fyers')) {
                console.log(`  Value: ${r.value.substring(0, 50)}...`);
            }
        });
        console.log("\nIf this table is empty or missing your token, it means Prisma is writing to a different schema than Render is reading!");
    } catch (e) {
        console.error("DB Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDb();
