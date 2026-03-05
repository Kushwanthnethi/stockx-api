const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- DB Monitor Started ---');
    let lastContent = '';

    setInterval(async () => {
        try {
            const records = await prisma.appConfig.findMany();
            const currentContent = JSON.stringify(records);

            if (currentContent !== lastContent) {
                console.log(`[${new Date().toLocaleTimeString()}] DB CHANGE DETECTED:`);
                console.log(JSON.stringify(records, null, 2));
                lastContent = currentContent;
            }
        } catch (err) {
            console.error('Monitor error:', err.message);
        }
    }, 1000);
}

main();
