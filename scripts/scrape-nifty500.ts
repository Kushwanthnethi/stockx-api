
// @ts-ignore
import axios from 'axios';
// @ts-ignore
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

async function scrapeNifty500() {
    console.log('🚀 Starting NIFTY 500 Scrape from Wikipedia...');
    const csvUrl = 'https://raw.githubusercontent.com/kprohith/nse-stock-analysis/master/ind_nifty500list.csv';

    try {
        console.log(`Fetching CSV from: ${csvUrl}`);
        const { data } = await axios.get(csvUrl);
        const rows = data.split('\n');
        const stocks: { symbol: string; companyName: string }[] = [];

        // Header: Company Name, Industry, Symbol, Series, ISIN Code
        // Row: "3M India Ltd.", "Consumer Goods", "3MINDIA", "EQ", "INE470A01017"

        // Skip header
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].split(',');
            if (row.length > 2) {
                const companyName = row[0].trim();
                const symbol = row[2].trim();

                if (symbol && companyName && symbol !== 'Symbol') {
                    stocks.push({
                        symbol: `${symbol}.NS`,
                        companyName: companyName
                    });
                }
            }
        }

        console.log(`✅ Fetched ${stocks.length} stocks from CSV.`);

        if (stocks.length < 100) {
            console.error("⚠️ Scrape count seems low. Cheerio might have missed the table selector.");
        }

        // Save to file
        const fileContent = `
export const EXPANDED_MARKET_DATA = ${JSON.stringify(stocks, null, 2)};
        `.trim();

        const outputPath = path.join(process.cwd(), 'src', 'stocks', 'expanded-market-data.ts');
        fs.writeFileSync(outputPath, fileContent);
        console.log(`💾 Saved to ${outputPath}`);

    } catch (e) {
        console.error('❌ Failed to scrape:', e);
    }
}

scrapeNifty500();
