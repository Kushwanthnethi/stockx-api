const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const records = await prisma.appConfig.findMany();
    console.log('--- Current DB Content ---');
    console.log(JSON.stringify(records, null, 2));
    console.log('--- End ---');
}

main().finally(() => prisma.$disconnect());
