import { PrismaClient } from '@prisma/client';

export async function seedInvestors(prisma: PrismaClient) {
    console.log('Seeding investors (Rich Profiles)...');

    // 1. Rakesh Jhunjhunwala (Rare Ent.)
    const jhunjhunwala = await prisma.investor.upsert({
        where: { name: 'Rakesh Jhunjhunwala (Rare Ent.)' },
        update: {},
        create: {
            name: 'Rakesh Jhunjhunwala (Rare Ent.)',
            bio: 'Known as the "Big Bull" of India, Rakesh Jhunjhunwala was a titan of the Indian stock market. His portfolio, managed by Rare Enterprises, focuses on long-term value creation. He famously held huge stakes in Titan and Tata Motors, believing in the India growth story.',
            imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Rakesh_Jhunjhunwala.jpg/220px-Rakesh_Jhunjhunwala.jpg',
            strategy: 'Long-term Value & Growth',
            netWorth: '₹46,185 Cr',
            lastUpdated: new Date()
        }
    });

    // 2. Vijay Kedia
    const kedia = await prisma.investor.upsert({
        where: { name: 'Vijay Kedia' },
        update: {},
        create: {
            name: 'Vijay Kedia',
            bio: 'Dr. Vijay Kedia is known for his "SMILE" philosophy: Small in size, Medium in experience, Large in aspiration, Extra-large in market potential. He identifies multi-baggers early in their growth cycle.',
            imageUrl: 'https://pbs.twimg.com/profile_images/1359744887019122690/6HzaWn0D_400x400.jpg',
            strategy: 'SMILE / Mid & Small Caps',
            netWorth: '₹1,500 Cr+',
            lastUpdated: new Date()
        }
    });

    // 3. Dolly Khanna
    const dolly = await prisma.investor.upsert({
        where: { name: 'Dolly Khanna' },
        update: {},
        create: {
            name: 'Dolly Khanna',
            bio: 'Chennai-based investor famous for identifying multibaggers in chemical, textile, and manufacturing sectors. Her portfolio is closely tracked for its high success rate in small-cap picks.',
            imageUrl: 'https://trendlyne.com/ui/assets/images/investor_avatar/Dolly-Khanna.jpg', // Better placeholder if possible
            strategy: 'Small Cap / Cyclicals',
            netWorth: '₹800 Cr+',
            lastUpdated: new Date()
        }
    });

    // 4. Ashish Kacholia
    const kacholia = await prisma.investor.upsert({
        where: { name: 'Ashish Kacholia' },
        update: {},
        create: {
            name: 'Ashish Kacholia',
            bio: 'Often called the "Big Whale" of the Indian stock market, he is known for his knack of picking quality mid and small-cap companies with strong growth triggers.',
            imageUrl: 'https://trendlyne.com/ui/assets/images/investor_avatar/Ashish-Kacholia.jpg',
            strategy: 'Quality Small Caps',
            netWorth: '₹3,200 Cr+',
            lastUpdated: new Date()
        }
    });

    // 5. Radhakishan Damani
    const damani = await prisma.investor.upsert({
        where: { name: 'Radhakishan Damani' },
        update: {},
        create: {
            name: 'Radhakishan Damani',
            bio: 'The founder of DMart and a mentor to Rakesh Jhunjhunwala. Typically a very private investor who holds large stakes in high-quality businesses for the very long term.',
            imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/77/Radhakishan_Damani.jpg',
            strategy: 'Deep Value & Compounders',
            netWorth: '₹2,30,000 Cr+',
            lastUpdated: new Date()
        }
    });


    // --- Seed Stocks for these Investors ---
    // Ensure these stocks exist before linking
    const stocksToSeed = [
        // RJ
        { symbol: 'TITAN.NS', name: 'Titan Company' },
        { symbol: 'TATACOMM.NS', name: 'Tata Communications' },
        { symbol: 'CRISIL.NS', name: 'CRISIL Ltd' },
        { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
        { symbol: 'CANBK.NS', name: 'Canara Bank' },
        { symbol: 'NCC.NS', name: 'NCC Ltd' },
        // Kedia
        { symbol: 'TEJASNET.NS', name: 'Tejas Networks' },
        { symbol: 'VAIBHAVGBL.NS', name: 'Vaibhav Global' },
        { symbol: 'ATULAUTO.NS', name: 'Atul Auto' },
        { symbol: 'ELECON.NS', name: 'Elecon Engineering' },
        { symbol: 'MAHLOG.NS', name: 'Mahindra Logistics' },
        // Dolly
        { symbol: 'CHENNPETRO.NS', name: 'Chennai Petroleum' },
        { symbol: 'UJJIVAN.NS', name: 'Ujjivan Financial' },
        { symbol: 'MANGALAM.NS', name: 'Mangalam Cement' },
        { symbol: 'KCP.NS', name: 'KCP Ltd' },
        // Kacholia
        { symbol: 'SAFARI.NS', name: 'Safari Industries' },
        { symbol: 'GRAVITA.NS', name: 'Gravita India' },
        { symbol: 'PCBL.NS', name: 'PCBL Ltd' },
        { symbol: 'AMIORG.NS', name: 'Ami Organics' },
        // Damani
        { symbol: 'DMART.NS', name: 'Avenue Supermarts' },
        { symbol: 'VSTIND.NS', name: 'VST Industries' },
        { symbol: 'ABCAPITAL.NS', name: 'Aditya Birla Capital' },
        { symbol: 'SUNDARMFIN.NS', name: 'Sundaram Finance' },
    ];

    for (const s of stocksToSeed) {
        await prisma.stock.upsert({
            where: { symbol: s.symbol },
            update: {},
            create: {
                symbol: s.symbol,
                companyName: s.name,
                exchange: 'NSE',
                // Default values if they don't exist yet, can be updated by price fetcher
                currentPrice: 0,
                marketCap: 0
            }
        });
    }

    // --- Helper to link stocks safely ---
    const linkStock = async (investorId: string, symbol: string, qty: string, price: number) => {
        // First delete existing link to avoid duplication/conflict logic complexity, then create fresh
        // Or use upsert on composite ID if applicable, but createMany is used below.
        // Prisma clean way: deleteMany for this investor & stock, then create.
        await prisma.investorStock.deleteMany({
            where: {
                investorId: investorId,
                stockSymbol: symbol
            }
        });

        await prisma.investorStock.create({
            data: {
                investorId: investorId,
                stockSymbol: symbol,
                status: 'HELD',
                quantity: qty,
                averagePrice: price
            }
        });
    };

    // RJ
    await linkStock(jhunjhunwala.id, 'TITAN.NS', '5.29%', 3500);
    await linkStock(jhunjhunwala.id, 'TATACOMM.NS', '1.8%', 1800);
    await linkStock(jhunjhunwala.id, 'CRISIL.NS', '5.4%', 4200);
    await linkStock(jhunjhunwala.id, 'TATAMOTORS.NS', '1.6%', 900);
    await linkStock(jhunjhunwala.id, 'NCC.NS', '12.5%', 250);
    await linkStock(jhunjhunwala.id, 'CANBK.NS', '1.4%', 110);


    // Kedia
    await linkStock(kedia.id, 'TEJASNET.NS', '1.9%', 850);
    await linkStock(kedia.id, 'VAIBHAVGBL.NS', '1.2%', 400);
    await linkStock(kedia.id, 'ATULAUTO.NS', '2.5%', 300);
    await linkStock(kedia.id, 'ELECON.NS', '1.8%', 950);
    await linkStock(kedia.id, 'MAHLOG.NS', '1.1%', 450);

    // Dolly
    await linkStock(dolly.id, 'CHENNPETRO.NS', '1.1%', 900);
    await linkStock(dolly.id, 'UJJIVAN.NS', '1.3%', 550);
    await linkStock(dolly.id, 'MANGALAM.NS', '1.5%', 700);
    await linkStock(dolly.id, 'KCP.NS', '2.1%', 200);

    // Kacholia
    await linkStock(kacholia.id, 'SAFARI.NS', '2.1%', 4500);
    await linkStock(kacholia.id, 'GRAVITA.NS', '1.8%', 1200);
    await linkStock(kacholia.id, 'PCBL.NS', '1.7%', 280);
    await linkStock(kacholia.id, 'AMIORG.NS', '1.9%', 1100);

    // Damani
    await linkStock(damani.id, 'DMART.NS', '74.6%', 3800);
    await linkStock(damani.id, 'VSTIND.NS', '32.1%', 3400);
    await linkStock(damani.id, 'SUNDARMFIN.NS', '2.4%', 3500);


    console.log('Seeding investors finished.');
}
