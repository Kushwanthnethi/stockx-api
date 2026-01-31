import yahooFinance from 'yahoo-finance2';

async function main() {
  console.log('Testing Search...');
  try {
    const result: any = await yahooFinance.search('Tata', {
      quotesCount: 1,
      newsCount: 0,
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Search Failed:', e);
  }
}
main();
