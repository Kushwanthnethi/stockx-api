import yahooFinance from 'yahoo-finance2';

async function test() {
  console.log('--- DIAGNOSTIC START ---');
  try {
    const pkg = await import('yahoo-finance2');
    console.log('Type of pkg.default:', typeof pkg.default);
    // Check if it looks like a class (function) or object
    if (typeof pkg.default === 'function') {
      console.log('pkg.default is a FUNCTION (Class?)');
      try {
        const instance = new (pkg.default as any)();
        console.log('Successfully instantiated with new');
      } catch (e: any) {
        console.log('Failed to instantiate with new:', e.message);
      }
    } else {
      console.log('pkg.default is an OBJECT (Instance?)');
      // Check if we can use it directly
      if (typeof (pkg.default as any).quoteSummary === 'function') {
        console.log('pkg.default has quoteSummary method');
      }
    }
  } catch (e: any) {
    console.error('Import check failed:', e?.message);
  }

  const symbols = ['RELIANCE.NS'];

  for (const symbol of symbols) {
    try {
      console.log(`Fetching ${symbol}...`);
      const data = (await yahooFinance.quoteSummary(symbol, {
        modules: ['price'],
        validateResult: false,
      })) as any;

      console.log(`SUCCESS: ${symbol} price=${data.price?.regularMarketPrice}`);
    } catch (error: any) {
      console.error(`FAILED ${symbol}: ${error?.message}`);
      if (error?.message?.includes('Cookie')) {
        console.log('Use of cookie required detected.');
      }
    }
  }
  console.log('--- DIAGNOSTIC END ---');
}

test();
