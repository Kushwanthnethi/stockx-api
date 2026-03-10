const { PrismaClient } = require('@prisma/client');

async function check() {
    const prisma = new PrismaClient();
    const result = await prisma.appConfig.findUnique({
        where: { key: 'angel_token_local' }
    });
    console.log("DB RESULT:");
    console.dir(result, { depth: null });
    if (result && result.value) {
        console.log("PARSED VALUE:");
        console.dir(JSON.parse(result.value), { depth: null });
    }
    await prisma.$disconnect();
}
check();
