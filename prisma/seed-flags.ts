import { PrismaClient } from '@prisma/client';
import { NIFTY_50_STOCKS, NIFTY_MIDCAP_100_STOCKS } from '../src/cron/constants';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Index Flag Population...');

    // Update Nifty 50
    console.log(`Updating ${NIFTY_50_STOCKS.length} Nifty 50 stocks...`);
    const n50Update = await prisma.stock.updateMany({
        where: {
            symbol: {
                in: NIFTY_50_STOCKS
            }
        },
        data: {
            isNifty50: true
        }
    });
    console.log(`Marked ${n50Update.count} stocks as Nifty 50.`);

    // Update Midcap 100
    console.log(`Updating ${NIFTY_MIDCAP_100_STOCKS.length} Midcap 100 stocks...`);
    const midUpdate = await prisma.stock.updateMany({
        where: {
            symbol: {
                in: NIFTY_MIDCAP_100_STOCKS
            }
        },
        data: {
            isMidcap100: true
        }
    });
    console.log(`Marked ${midUpdate.count} stocks as Midcap 100.`);

    // Reset others (optional, but good for cleanup if needed, skipping for safety now to avoid resetting good data if constants are partial)
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
