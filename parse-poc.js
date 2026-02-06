const fs = require('fs');

const INPUT_FILE = './reliance-mock.txt';

async function parseLocalData() {
    console.log(`Reading local simulation file: ${INPUT_FILE}...`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error("Error: Mock data not found.");
        return;
    }

    const text = fs.readFileSync(INPUT_FILE, 'utf-8');

    console.log("\n--- Full Extracted Text (Simulated) ---");
    console.log(text.substring(0, 500) + "...[truncated]");
    console.log("\n---------------------------------------");

    // --- THE "MINI-SCREENER" LOGIC ---
    // This is the core logic we would deploy to production
    console.log("\nAnalyzing for Financials...");

    // 1. Identify Context
    if (text.includes("Balance Sheet") && text.includes("ASSETS")) {
        console.log("[PASS] Document identified as a Balance Sheet.");
    }

    // 2. Extract Specific Line Items (Regex demo)
    console.log("[INFO] Attempting to extract 'Total Equity' and 'Total Assets'...");

    // Regex logic: Find the label, allow for spaces/pipes, capture the first number group
    // \s* matches spaces, \| matches the pipe separator if present
    const equityRegex = /Total Equity\s*\|\s*([\d,]+)/;
    const assetsRegex = /TOTAL ASSETS\s*\|\s*([\d,]+)/;

    const equityMatch = text.match(equityRegex);
    const assetsMatch = text.match(assetsRegex);

    let extracted = false;

    if (equityMatch) {
        console.log(`-> [SUCCESS] Extracted Total Equity: ₹ ${equityMatch[1]} Cr`);
        extracted = true;
    }
    if (assetsMatch) {
        console.log(`-> [SUCCESS] Extracted Total Assets: ₹ ${assetsMatch[1]} Cr`);
        extracted = true;
    }

    if (!extracted) {
        console.log("[FAIL] Could not match patterns. Tweaking regex required.");
    } else {
        console.log("\n[CONCLUSION] Feasibility Confirmed: Logic captures data from unstructured text.");
    }
}

parseLocalData();
