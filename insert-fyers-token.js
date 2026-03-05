const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    try {
        const tokenRaw = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBfaWQiOiI2SDgyOFY5VU5LIiwidXVpZCI6ImNkYTk5ZGI4MThkYzRmOGJiZTM3YTNmNWZmN2I4ZjU0IiwiaXBBZGRyIjoiIiwibm9uY2UiOiIiLCJzY29wZSI6IiIsImRpc3BsYXlfbmFtZSI6IkZBSTU1NDIzIiwib21zIjoiSzEiLCJoc21fa2V5IjoiNGIyNzhjYTU4MmI3Nzg2YTBlYzNkN2YwYjNlZWQ1MWExZGE2ZTQxMGUwMjliMTE1NGY1Y2VlYzkiLCJpc0RkcGlFbmFibGVkIjoiTiIsImlzTXRmRW5hYmxlZCI6Ik4iLCJhdWQiOiJbXCJkOjFcIixcImQ6MlwiLFwieDowXCIsXCJ4OjFcIl0iLCJleHAiOjE3NzI3MTQ4MzMsImlhdCI6MTc3MjY4NDgzMywiaXNzIjoiYXBpLmxvZ2luLmZ5ZXJzLmluIiwibmJmIjoxNzcyNjg0ODMzLCJzdWIiOiJhdXRoX2NvZGUifQ.PCdWqe7woaXgI9HT4oWx__WphE8HvR8AH-4dwg_4rpA";
        const data = JSON.stringify({
            access_token: tokenRaw,
            date: new Date().toISOString(),
        });

        await prisma.appConfig.upsert({
            where: { key: 'fyers_token_v4' },
            update: { value: data },
            create: { key: 'fyers_token_v4', value: data },
        });

        console.log('Successfully inserted Formatted Fyers Token into Neon Database!');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
