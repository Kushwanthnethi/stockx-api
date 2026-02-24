// Debug fundamentalsTimeSeries - find out exactly why it fails
async function test() {
    const pkg = await import('yahoo-finance2');
    const YF = pkg.default || pkg;
    const yf = typeof YF === 'function' ? new YF() : YF;

    // Test 1: minimal call
    console.log('Test 1: Minimal call...');
    try {
        const r1 = await yf.fundamentalsTimeSeries('RELIANCE.NS', {
            period1: '2022-01-01',
            type: ['annualTotalRevenue', 'annualNetIncome', 'annualTotalAssets']
        }, { validate: false });
        console.log('SUCCESS! Type:', typeof r1, 'isArray:', Array.isArray(r1));
        if (Array.isArray(r1)) {
            r1.forEach(item => {
                const rows = item.rows?.length || 0;
                if (rows > 0) {
                    const vals = item.rows.map(r => `${r.asOfDate}: ${r.reportedValue ?? r.value}`);
                    console.log(`  ✅ ${item.type}: ${vals.join(' | ')}`);
                } else {
                    console.log(`  ❌ ${item.type}: empty`);
                }
            });
        } else {
            console.log('Result:', JSON.stringify(r1).substring(0, 500));
        }
    } catch (e) {
        console.log('Test 1 FAILED:', e.message);
    }

    // Test 2: with module param
    console.log('\nTest 2: With module param...');
    try {
        const r2 = await yf.fundamentalsTimeSeries('RELIANCE.NS', {
            period1: '2022-01-01',
            module: 'financials',
            type: ['annualTotalRevenue', 'annualNetIncome']
        }, { validate: false });
        console.log('SUCCESS! Items:', Array.isArray(r2) ? r2.length : typeof r2);
    } catch (e) {
        console.log('Test 2 FAILED:', e.message);
    }

    // Test 3: with period1 as Date
    console.log('\nTest 3: period1 as Date...');
    try {
        const r3 = await yf.fundamentalsTimeSeries('RELIANCE.NS', {
            period1: new Date('2022-01-01'),
            type: ['annualTotalRevenue']
        }, { validate: false });
        console.log('SUCCESS! Items:', Array.isArray(r3) ? r3.length : typeof r3);
    } catch (e) {
        console.log('Test 3 FAILED:', e.message);
    }
}
test().catch(e => console.error('FATAL:', e.message));
