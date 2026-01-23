
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import * as bcrypt from 'bcrypt';

async function main() {
    const email = 'admin@stockx.com';
    const password = 'Kush@admins';
    const passwordHash = await bcrypt.hash(password, 10);

    // Upsert user: create if not exists, update if exists
    const admin = await prisma.user.upsert({
        where: { email },
        update: {
            role: 'ADMIN',
            passwordHash: passwordHash
        },
        create: {
            email,
            handle: 'StockXAdmin',
            firstName: 'StockX',
            lastName: 'Admin',
            role: 'ADMIN',
            avatarUrl: 'https://github.com/shadcn.png', // Placeholder
            passwordHash: passwordHash,
        },
    });

    console.log('Admin user created/updated:', admin);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
