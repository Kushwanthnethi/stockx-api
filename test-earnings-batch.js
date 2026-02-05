const { execSync } = require('child_process');

console.log('Starting verification simulation: Constant Membership Check');

// Simulate calling the scheduler logic manually
// In a real e2e test we would call the API, but here we are verifying that the symbols are correctly defined in constants.

// Simulate check against constants
const { NIFTY_50, MIDCAP_100 } = require('./src/cron/constants');
const TEST_SYMBOLS = ['RELIANCE.NS', 'TCS.NS', 'ZOMATO.NS', 'TRENT.NS'];

console.log('Verifying Membership Logic:');
TEST_SYMBOLS.forEach(sym => {
    const n50 = NIFTY_50.includes(sym);
    const mid = MIDCAP_100.includes(sym);
    console.log(`${sym} -> Nifty50: ${n50}, Midcap100: ${mid}`);
});
