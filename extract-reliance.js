const fs = require('fs');
const https = require('https');
const pdf = require('pdf-parse');

const PDF_URL = 'https://www.ril.com/getattachment/9a83e77f-17d4-42eb-aa6e-e77a28e945c7/integrated-annual-report-2023-24.aspx'; // Found via search-web (simplified link for POC)
const OUTPUT_FILE = './reliance-ar-2024.pdf';

async function downloadPDF(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

function extractFinancials(data) {
    console.log(`\n--- Analyzed ${data.numpages} pages ---`);

    // Simple heuristic: Look for "Balance Sheet" and "Assets" on the same page
    // This is VERY naive, but proves we can read the text.
    const text = data.text;
    const pages = text.split(/\f/); // Form feed often separates pages in simple extraction

    let balanceSheetPage = -1;

    for (let i = 0; i < pages.length; i++) {
        const pageText = pages[i];
        if (pageText.includes("Balance Sheet") && pageText.includes("ASSETS")) {
            console.log(`\n[SUCCESS] Potential Balance Sheet found on Page ${i + 1}`);
            console.log("--- Snippet ---");
            console.log(pageText.substring(0, 500) + "...\n"); // Print first 500 chars
            balanceSheetPage = i;
            break;
        }
    }

    if (balanceSheetPage === -1) {
        console.log("\n[WARNING] Could not find a page with 'Balance Sheet' and 'ASSETS'. The PDF might be an image scan or formatted differently.");
    }
}

async function run() {
    console.log(`Downloading Annual Report from ${PDF_URL}...`);
    try {
        // Note: For this POC, if the direct link fails or is behind a bot check,
        // we might fail here. In real-world, we'd use Puppeteer.
        // I'll try a known public link if the official one fails.
        // Let's assume for this step the download works or I'll simulate with a dummy if blocked.

        // Actually, RIL.com might block node-fetch/https agents. 
        // Let's try downloading. if it fails, I will report that we need Puppeteer.
        await downloadPDF(PDF_URL, OUTPUT_FILE);
        console.log("Download complete. parsing...");

        const dataBuffer = fs.readFileSync(OUTPUT_FILE);
        const data = await pdf(dataBuffer);

        extractFinancials(data);

    } catch (e) {
        console.error("POC Error:", e.message);
    }
}

run();
