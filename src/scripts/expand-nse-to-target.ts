import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import YahooFinance from 'yahoo-finance2';

type MasterRow = {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  instrumenttype: string;
  exch_seg: string;
};

type Candidate = {
  symbol: string;
  companyName: string;
  exchange: 'NSE';
};

const prisma = new PrismaClient();
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const TARGET_TOTAL = Number(process.env.STOCK_TARGET || '2000');
const MASTER_PATH = path.join(process.cwd(), 'data', 'OpenAPIScripMaster.json');

const EXCLUDED_NAME_PATTERNS = [
  /ETF/i,
  /INAV/i,
  /TEST/i,
  /MUTUAL/i,
  /FUND/i,
  /INDEX/i,
  /NIFTY/i,
  /SENSEX/i,
  /BANKNIFTY/i,
  /FINNIFTY/i,
  /MIDCPNIFTY/i,
  /VIX/i,
  /GOLD/i,
  /SILVER/i,
  /LIQUID/i,
  /BEES/i,
  /GILT/i,
];

function isExcludedText(value: string): boolean {
  return EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(value));
}

function toCandidate(row: MasterRow): Candidate | null {
  if (row.exch_seg !== 'NSE') return null;
  if (row.instrumenttype) return null;
  if (row.expiry) return null;
  if (!row.symbol || !row.name) return null;
  if (!/-(EQ|BE)$/.test(row.symbol)) return null;
  if (isExcludedText(row.symbol) || isExcludedText(row.name)) return null;

  const baseSymbol = row.symbol.replace(/-(EQ|BE)$/,'').trim().toUpperCase();
  if (!/^[A-Z0-9&-]+$/.test(baseSymbol)) return null;
  if (baseSymbol.length < 2) return null;

  return {
    symbol: `${baseSymbol}.NS`,
    companyName: row.name.trim(),
    exchange: 'NSE',
  };
}

async function isTradableEquity(symbol: string) {
  try {
    const quote: any = await yahooFinance.quote(symbol, undefined, { validateResult: false });
    const isEquity = quote?.quoteType === 'EQUITY' || quote?.typeDisp === 'Equity';
    const isNse = String(quote?.fullExchangeName || quote?.exchange || '').toUpperCase().includes('NSE');
    const hasPrice = Number(quote?.regularMarketPrice || 0) > 0;
    const longName = String(quote?.longName || '').trim();
    const shortName = String(quote?.shortName || '').trim();
    const combinedName = `${symbol} ${shortName} ${longName}`;
    const looksExcluded = isExcludedText(combinedName);

    if (!isEquity || !isNse || !hasPrice || looksExcluded) {
      return null;
    }

    return {
      companyName: String(quote?.longName || quote?.shortName || symbol).trim(),
      currentPrice: Number(quote?.regularMarketPrice || 0),
      marketCap: Number(quote?.marketCap || 0),
    };
  } catch {
    return null;
  }
}

async function main() {
  const raw = fs.readFileSync(MASTER_PATH, 'utf8');
  const masterRows = JSON.parse(raw) as MasterRow[];

  const uniqueCandidates = new Map<string, Candidate>();
  for (const row of masterRows) {
    const candidate = toCandidate(row);
    if (!candidate) continue;
    if (!uniqueCandidates.has(candidate.symbol)) {
      uniqueCandidates.set(candidate.symbol, candidate);
    }
  }

  const currentTotal = await prisma.stock.count();
  const needed = Math.max(0, TARGET_TOTAL - currentTotal);

  console.log(`[expand] Current total: ${currentTotal}`);
  console.log(`[expand] Target total: ${TARGET_TOTAL}`);
  console.log(`[expand] Need to add: ${needed}`);
  console.log(`[expand] NSE candidate pool: ${uniqueCandidates.size}`);

  if (needed === 0) {
    return;
  }

  const existingStocks = await prisma.stock.findMany({
    select: { symbol: true, isin: true },
  });
  const existingSymbols = new Set(existingStocks.map((row) => row.symbol.toUpperCase()));
  const existingIsins = new Set(existingStocks.map((row) => (row.isin || '').trim().toUpperCase()).filter(Boolean));

  let inserted = 0;
  let checked = 0;
  let skippedInvalid = 0;
  let skippedExisting = 0;

  for (const candidate of uniqueCandidates.values()) {
    if (inserted >= needed) break;
    checked += 1;

    if (existingSymbols.has(candidate.symbol)) {
      skippedExisting += 1;
      continue;
    }

    const verified = await isTradableEquity(candidate.symbol);
    if (!verified) {
      skippedInvalid += 1;
      continue;
    }

    let isin: string | undefined;
    try {
      const quote: any = await yahooFinance.quote(candidate.symbol, undefined, { validateResult: false });
      isin = typeof quote?.isin === 'string' ? quote.isin.trim().toUpperCase() : undefined;
    } catch {
      isin = undefined;
    }

    if (isin && existingIsins.has(isin)) {
      skippedExisting += 1;
      continue;
    }

    await prisma.stock.upsert({
      where: { symbol: candidate.symbol },
      update: {
        companyName: verified.companyName,
        exchange: 'NSE',
        isin,
        currentPrice: verified.currentPrice,
        marketCap: verified.marketCap,
        lastUpdated: new Date(),
      },
      create: {
        symbol: candidate.symbol,
        companyName: verified.companyName,
        exchange: 'NSE',
        isin,
        currentPrice: verified.currentPrice,
        marketCap: verified.marketCap,
        lastUpdated: new Date(),
      },
    });

    existingSymbols.add(candidate.symbol);
    if (isin) existingIsins.add(isin);
    inserted += 1;

    if (inserted % 25 === 0) {
      console.log(`[expand] Added ${inserted}/${needed}...`);
    }
  }

  const finalTotal = await prisma.stock.count();
  console.log('-----------------------------------');
  console.log(`[expand] Checked candidates: ${checked}`);
  console.log(`[expand] Inserted: ${inserted}`);
  console.log(`[expand] Skipped existing: ${skippedExisting}`);
  console.log(`[expand] Skipped invalid: ${skippedInvalid}`);
  console.log(`[expand] Final total: ${finalTotal}`);
  console.log('-----------------------------------');
}

main()
  .catch((error) => {
    console.error('[expand] Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });