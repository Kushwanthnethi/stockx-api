
import { YahooFinanceService } from './src/stocks/yahoo-finance.service';

async function test() {
    const service = new YahooFinanceService();
    console.log('Testing Resilient Call...');

    try {
        // Test a successful call
        console.log('--- Test 1: Successful Call ---');
        const result = await service.resilientCall<any>('quote', 'quote', 'AAPL');
        console.log('Success: AAPL Price:', result.regularMarketPrice);

        // Test multiple calls in a row
        console.log('\n--- Test 2: Sequential Calls ---');
        for (let i = 0; i < 3; i++) {
            const r = await service.resilientCall<any>('quote', 'quote', 'MSFT');
            console.log(`Call ${i + 1} success: MSFT Price:`, r.regularMarketPrice);
        }

        console.log('\nVerification Complete.');
    } catch (e) {
        console.error('Test Failed:', e.message);
    }
}

test();
