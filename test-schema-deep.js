const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const url = process.env.DATABASE_URL || 'No URL?';
        console.log("DB URL Schema check:", url.includes('schema=') ? url.split('schema=')[1] : 'default (public)');
        const rows = await prisma.appConfig.findMany();
        console.log("AppConfig Rows:", rows.length);
        if (rows.length > 0) {
            rows.forEach(r => console.log(`- ${r.key}`));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
