import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    const res = await prisma.userPortfolioAnalysis.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3
    });
    console.log(JSON.stringify(res, null, 2));
    await prisma.$disconnect();
}
check();
