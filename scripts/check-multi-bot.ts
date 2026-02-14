
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findUnique({ where: { handle: 'stocksxbot' } });
    if (!user) {
        console.log('Bot user not found');
        return;
    }
    const posts = await prisma.post.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 3
    });
    if (posts.length > 0) {
        const fs = require('fs');
        let output = '';
        posts.forEach((post, i) => {
            output += `--- POST ${i + 1} (${post.createdAt.toISOString()}) ---\n`;
            output += post.content + '\n';
            output += '-------------------------------------------\n\n';
        });
        fs.writeFileSync('bot_posts_output.txt', output);
        console.log('Output written to bot_posts_output.txt');
    } else {
        console.log('No posts found for bot.');
    }
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
