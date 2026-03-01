const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const total = await p.stock.count();
    const bigCap = await p.stock.count({ where: { marketCap: { gt: 100000000000 } } });
    const qualified = await p.stock.count({
        where: {
            currentPrice: { not: null },
            marketCap: { gt: 100000000000 },
            peRatio: { not: null },
            returnOnEquity: { not: null },
            high52Week: { not: null },
            changePercent: { not: null },
        },
    });
    const nifty = await p.stock.count({ where: { isNifty50: true } });
    const midcap = await p.stock.count({ where: { isMidcap100: true } });

    console.log('=== SOW Stock Universe ===');
    console.log('Total stocks in DB:       ', total);
    console.log('Market cap > 10k Cr:      ', bigCap);
    console.log('Fully qualified for SOW:  ', qualified);
    console.log('Nifty 50 flagged:         ', nifty);
    console.log('Midcap 100 flagged:       ', midcap);
    console.log('');
    console.log('FLOW: ' + total + ' total → ' + bigCap + ' big cap → ' + qualified + ' qualified → 7 finalists → 1 winner');

    await p.$disconnect();
}

main();
