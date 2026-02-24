const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$executeRawUnsafe("UPDATE stocks SET last_updated = NOW() - INTERVAL '2 days' WHERE symbol IN ('RELIANCE.NS', 'HDFCBANK.NS', 'ITC.NS', 'TCS.NS', 'INFY.NS')")
    .then(r => { console.log('Reset', r, 'stocks'); return p.$disconnect(); })
    .catch(e => { console.error(e); p.$disconnect(); });
