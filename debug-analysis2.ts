import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugAnalysis() {
    const portfolio = await prisma.userPortfolio.findFirst();
    if (!portfolio) {
        console.log("No portfolio found");
        return;
    }

    console.log("Portfolio ID:", portfolio.id);

    const analyses = await prisma.userPortfolioAnalysis.findMany({
        where: { portfolioId: portfolio.id },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${analyses.length} analyses for this portfolio.`);
    if (analyses.length > 0) {
        console.log("Latest:", JSON.stringify({
            id: analyses[0].id,
            score: analyses[0].healthScore,
            createdAt: analyses[0].createdAt
        }, null, 2));

        if (analyses.length > 1) {
            console.log("Previous:", JSON.stringify({
                id: analyses[1].id,
                score: analyses[1].healthScore,
                createdAt: analyses[1].createdAt
            }, null, 2));
        }
    }

    await prisma.$disconnect();
}

debugAnalysis();
