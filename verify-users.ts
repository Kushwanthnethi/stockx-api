
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const usersToVerify = [
        'varshithnethi@gmail.com',
        'bhavaninethi1@gmail.com'
    ];

    console.log('Verifying users...');

    for (const email of usersToVerify) {
        try {
            const user = await prisma.user.update({
                where: { email },
                data: { isVerified: true },
            });
            console.log(`Verified user: ${user.email} (${user.id})`);
        } catch (e) {
            console.error(`Failed to verify user: ${email}. Does the user exist?`, e.message);
        }
    }

    console.log('Verification process complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
