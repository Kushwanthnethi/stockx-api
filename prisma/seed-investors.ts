import { PrismaClient } from '@prisma/client';

export async function seedInvestors(prisma: PrismaClient) {
    console.log('Seeding investors (Rich Profiles)...');

    // 1. Rakesh Jhunjhunwala (The Big Bull)
    const jhunjhunwala = await prisma.investor.create({
        data: {
            name: 'Rakesh Jhunjhunwala (Rare Ent.)',
            bio: 'Known as the "Big Bull" of India. His portfolio is managed by Rare Enterprises. He was a master of patience and conviction.',
            imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Rakesh_Jhunjhunwala.jpg/220px-Rakesh_Jhunjhunwala.jpg',
            strategy: 'Long-term Value & Growth',
            netWorth: '₹46,185 Cr',
            lastUpdated: new Date()
        }
    });

    // 2. Vijay Kedia (SMILE Master)
    const kedia = await prisma.investor.create({
        data: {
            name: 'Vijay Kedia',
            bio: 'Dr. Vijay Kedia is known for his "SMILE" philosophy: Small in size, Medium in experience, Large in aspiration, Extra-large in market potential.',
            imageUrl: 'https://pbs.twimg.com/profile_images/1359744887019122690/6HzaWn0D_400x400.jpg',
            strategy: 'SMILE / Mid & Small Caps',
            netWorth: '₹1,500 Cr+',
            lastUpdated: new Date()
        }
    });

    // 3. Dolly Khanna (Small Cap Queen)
    const dolly = await prisma.investor.create({
        data: {
            name: 'Dolly Khanna',
            bio: 'Chennai-based investor known for identifying multibaggers in chemical, textile, and manufacturing sectors early in their cycle.',
            imageUrl: 'https://trendlyne-media-mumbai-new.s3.amazonaws.com/profile/Dolly-Khanna.jpg', // Placeholder
            strategy: 'Small Cap / Cyclicals',
            netWorth: '₹800 Cr+',
            lastUpdated: new Date()
        }
    });

    // 4. Ashish Kacholia (Lucky Investor)
    const kacholia = await prisma.investor.create({
        data: {
            name: 'Ashish Kacholia',
            bio: 'Known as the "Lucky Investor", he focuses on high-quality mid and small-cap companies with strong growth triggers.',
            imageUrl: 'https://trendlyne-media-mumbai-new.s3.amazonaws.com/profile/Ashish-Kacholia.jpg',
            strategy: 'Quality Small Caps',
            netWorth: '₹3,200 Cr+',
            lastUpdated: new Date()
        }
    });


    // --- Seed Stocks for these Investors ---
    const stocksToSeed = [
        // RJ
        { symbol: 'TITAN.NS', name: 'Titan Company' },
        { symbol: 'TATACOMM.NS', name: 'Tata Communications' },
        { symbol: 'CRISIL.NS', name: 'CRISIL Ltd' },
        // Kedia
        { symbol: 'TEJASNET.NS', name: 'Tejas Networks' },
        { symbol: 'VAIBHAVGBL.NS', name: 'Vaibhav Global' },
        { symbol: 'ATULAUTO.NS', name: 'Atul Auto' },
        // Dolly
        { symbol: 'CHENNPETRO.NS', name: 'Chennai Petroleum' },
        { symbol: 'UJJIVAN.NS', name: 'Ujjivan Financial' },
        // Kacholia
        { symbol: 'SAFARI.NS', name: 'Safari Industries' },
        { symbol: 'GRAVITA.NS', name: 'Gravita India' }
    ];

    for (const s of stocksToSeed) {
        await prisma.stock.upsert({
            where: { symbol: s.symbol },
            update: {},
            create: {
                symbol: s.symbol,
                companyName: s.name,
                exchange: 'NSE'
            }
        });
    }

    // --- Assign Stocks ---

    // RJ
    await prisma.investorStock.createMany({
        data: [
            { investorId: jhunjhunwala.id, stockSymbol: 'TITAN.NS', status: 'HELD', quantity: '5.29%', averagePrice: 3500 },
            { investorId: jhunjhunwala.id, stockSymbol: 'TATACOMM.NS', status: 'HELD', quantity: '1.8%', averagePrice: 1800 },
            { investorId: jhunjhunwala.id, stockSymbol: 'CRISIL.NS', status: 'HELD', quantity: '5.4%', averagePrice: 4200 },
        ]
    });

    // Kedia
    await prisma.investorStock.createMany({
        data: [
            { investorId: kedia.id, stockSymbol: 'TEJASNET.NS', status: 'HELD', quantity: '1.9%', averagePrice: 850 },
            { investorId: kedia.id, stockSymbol: 'VAIBHAVGBL.NS', status: 'HELD', quantity: '1.2%', averagePrice: 400 },
            { investorId: kedia.id, stockSymbol: 'ATULAUTO.NS', status: 'HELD', quantity: '2.5%', averagePrice: 300 },
        ]
    });

    // Dolly
    await prisma.investorStock.createMany({
        data: [
            { investorId: dolly.id, stockSymbol: 'CHENNPETRO.NS', status: 'HELD', quantity: '1.1%', averagePrice: 900 },
            { investorId: dolly.id, stockSymbol: 'UJJIVAN.NS', status: 'HELD', quantity: '1.3%', averagePrice: 550 },
        ]
    });

    // Kacholia
    await prisma.investorStock.createMany({
        data: [
            { investorId: kacholia.id, stockSymbol: 'SAFARI.NS', status: 'HELD', quantity: '2.1%', averagePrice: 4500 },
            { investorId: kacholia.id, stockSymbol: 'GRAVITA.NS', status: 'HELD', quantity: '1.8%', averagePrice: 1200 },
        ]
    });


    console.log('Seeding investors finished.');
}
