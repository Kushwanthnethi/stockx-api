const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function pollDB() {
    let lastStatus = null;
    setInterval(async () => {
        try {
            const record = await prisma.appConfig.findUnique({
                where: { key: 'fyers_access_token' }
            });
            const status = record ? 'Present' : 'Missing';
            if (status !== lastStatus) {
                console.log(`[${new Date().toLocaleTimeString()}] Token status changed to: ${status}`);
                lastStatus = status;
            }
        } catch (err) {
            console.error(err);
        }
    }, 1000);
}

pollDB();
