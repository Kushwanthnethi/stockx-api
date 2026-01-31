import yahooFinance from 'yahoo-finance2';
import * as fs from 'fs';
import * as path from 'path';

// Output file
const OUTPUT_FILE = path.join(__dirname, '../stocks/discovered-stocks.ts');

const SEARCH_TERMS = [
  'Industries',
  'India',
  'Limited',
  'Services',
  'Solutions',
  'Global',
  'Enterprises',
  'Tech',
  'Systems',
  'Pharma',
  'Chemicals',
  'Energy',
  'Power',
  'Steel',
  'Textile',
  'Exports',
  'Finance',
  'Capital',
  'Investments',
  'Holdings',
  'Infrastructure',
  'Realty',
  'Foods',
  'Sugars',
  'Mills',
  'Paper',
  'Synthetics',
  'Polymers',
  'Agro',
  'Bio',
  'Labs',
  'Health',
  'Care',
  'Motors',
  'Auto',
  'Engineering',
  'Electricals',
  'Electronics',
  'Networks',
  'Media',
  'Entertainment',
  'Construction',
  'Projects',
  'Trading',
  'Marketing',
  'Logistics',
  'Shipping',
  'Transport',
  'Jewell',
  'Gold',
  'Silver',
  'Metals',
  'Alloys',
  'Cements',
  'Ceramics',
  'Plast',
  'Rub',
  'Glass',
  'Decor',
  'Home',
  'Life',
  'Solar',
  'Green',
];

async function main() {
  console.log('Starting Stock Discovery...');
  const newStocks = new Map<string, string>(); // symbol -> name

  for (const term of SEARCH_TERMS) {
    console.log(`Searching for term: "${term}"...`);
    try {
      let results: any;
      try {
        results = await yahooFinance.search(term, {
          newsCount: 0,
          quotesCount: 50,
        });
      } catch (err: any) {
        console.log(`Warning/Error for ${term}:`, err.message || err);
        // Continue if possible?
        // yahoo-finance2 might throw on "Notices".
        if (err.result) results = err.result;
        else continue;
      }

      for (const item of results.quotes) {
        const quote = item;
        if (quote.symbol && quote.symbol.endsWith('.NS')) {
          const name = quote.longname || quote.shortname || term;
          newStocks.set(quote.symbol, name);
        }
      }
    } catch (e) {
      console.error(`Error searching ${term}:`, e);
    }
    // Polite delay
    await new Promise((r) => setTimeout(r, 500));
  }

  // Generate File Content
  console.log(`Discovered ${newStocks.size} unique potential stocks.`);

  let fileContent = `export const DISCOVERED_STOCKS = [\n`;
  for (const [symbol, name] of newStocks.entries()) {
    const cleanName = name.replace(/'/g, "\\'");
    fileContent += `    { symbol: '${symbol}', companyName: '${cleanName}' },\n`;
  }
  fileContent += `];\n`;

  fs.writeFileSync(OUTPUT_FILE, fileContent);
  console.log(`Wrote discovered stocks to ${OUTPUT_FILE}`);
}

main();
