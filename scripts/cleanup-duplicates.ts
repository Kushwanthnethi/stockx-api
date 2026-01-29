import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const allStocks = await prisma.stock.findMany({
        select: { symbol: true }
    });

    // Identify bad symbols: No dot (.), No caret (^), assuming NS/BO suffix required for stocks
    const badSymbols = allStocks
        .map(s => s.symbol)
        .filter(s => !s.endsWith('.NS') && !s.endsWith('.BO') && !s.startsWith('^'));

    console.log(`Found ${badSymbols.length} potential duplicates/bad symbols.`);
    console.log('Sample:', badSymbols.slice(0, 10));

    if (badSymbols.length > 0) {
        const result = await prisma.stockVerdict.deleteMany({
            where: {
                stockId: { in: badSymbols }
            }
        });
        console.log(`Deleted ${result.count} duplicate verdicts.`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
