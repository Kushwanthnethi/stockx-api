const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const rows = await prisma.appConfig.findMany();
        const fyersRow = rows.find(r => r.key.toLowerCase().includes('fyers'));
        if (fyersRow) {
            console.log("\n\n======== FYERS TOKEN FOUND ========\n");
            console.log(fyersRow.value);
            console.log("\n===================================\n\n");
        } else {
            console.log("No Fyers token found directly via Prisma script either.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
