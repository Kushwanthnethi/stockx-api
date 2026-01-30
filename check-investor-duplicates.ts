
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for duplicate investors...');
    const investors = await prisma.investor.findMany();

    const nameMap = new Map<string, number>();
    const duplicates: string[] = [];

    for (const inv of investors) {
        const count = nameMap.get(inv.name) || 0;
        nameMap.set(inv.name, count + 1);
        if (count === 1) { // Found a second one
            duplicates.push(inv.name);
        }
    }

    if (duplicates.length > 0) {
        console.log('Found duplicates for:', duplicates);
        for (const name of duplicates) {
            const all = await prisma.investor.findMany({ where: { name } });
            console.log(`\nDuplicate details for "${name}":`);
            all.forEach(i => console.log(` - ID: ${i.id}, Name: ${i.name}, Updated: ${i.lastUpdated}`));
        }
    } else {
        console.log('No duplicates found in the DB.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
