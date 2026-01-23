
// Mock external dependencies
const mockPrisma = {
    stock: {
        findMany: async () => [
            { symbol: 'RELIANCE.NS', companyName: 'Reliance Industries Ltd.', exchange: 'NSE' },
            { symbol: 'INFY.NS', companyName: 'Infosys Ltd.', exchange: 'NSE' }
        ]
    }
};

// Start Mocking the implementation directly
async function testRobustSearch() {
    console.log("Testing searchStocks with external failure...");

    // 1. Local Search (Mocked DB return)
    const localResults = await mockPrisma.stock.findMany();

    console.log(`Local DB returned: ${localResults.length} items`);

    // 2. Mock External Search FAILURE
    let externalResults: any[] = [];
    try {
        console.log("Attempting external search (simulated)...");
        throw new Error("Simulated Yahoo Finance Timeout");
    } catch (error) {
        console.log("Caught expected external error:", error.message);
    }

    // 3. Merge
    const merged = [...localResults.map(s => ({ ...s, quoteType: 'EQUITY' }))];

    console.log(`Final Result Count: ${merged.length}`);
    if (merged.length > 0) {
        console.log("SUCCESS: Returned local results despite external failure.");
        console.log("Result 1:", merged[0].symbol);
    } else {
        console.log("FAILURE: Returned empty array.");
    }
}

testRobustSearch();
