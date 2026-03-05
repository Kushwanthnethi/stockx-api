require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    console.log("Checking AppConfig Table...");
    const config = await prisma.appConfig.findMany();
    console.log("Found", config.length, "rows");
    console.log(JSON.stringify(config, null, 2));
    await prisma.$disconnect();
}

main().catch(console.error);
