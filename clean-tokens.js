const { PrismaClient } = require('@prisma/client');

async function clean() {
    const prisma = new PrismaClient();
    try {
        await prisma.appConfig.deleteMany({
            where: {
                key: { in: ['FYERS_ACCESS_TOKEN', 'fyers_access_token'] }
            }
        });
        console.log('Successfully deleted all old Fyers keys from database');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

clean();
