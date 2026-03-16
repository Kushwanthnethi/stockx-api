import { PrismaClient } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';
import { NIFTY_500 } from '../stocks/market-data';
import { ADDITIONAL_STOCKS } from '../stocks/massive-market-data';
import { DISCOVERED_STOCKS } from '../stocks/discovered-stocks';

type CandidateStock = {
  symbol: string;
  companyName: string;
  exchange: 'NSE' | 'BSE';
  isin?: string;
};

const prisma = new PrismaClient();
const yahooFinance = new YahooFinance();

const SEARCH_TERMS = [
  'Waaree Energies',
  'NSE',
  'BSE',
  'India Ltd',
  'India Limited',
  'Power',
  'Energy',
  'Bank',
  'Pharma',
  'Finance',
  'Capital',
  'Technology',
  'Infra',
  'Motors',
  'Steel',
  'Chemicals',
  'Consumer',
  'Healthcare',
  'Midcap',
  'Smallcap',
];

const MUST_TRACK_STOCKS: CandidateStock[] = [
  { symbol: 'WAAREEENER.NS', companyName: 'Waaree Energies Limited', exchange: 'NSE' },
  { symbol: 'HYUNDAI.NS', companyName: 'Hyundai Motor India Limited', exchange: 'NSE' },
  { symbol: 'SWIGGY.NS', companyName: 'Swiggy Limited', exchange: 'NSE' },
  { symbol: 'OLAELEC.NS', companyName: 'Ola Electric Mobility Limited', exchange: 'NSE' },
  { symbol: 'NTPCGREEN.NS', companyName: 'NTPC Green Energy Limited', exchange: 'NSE' },
];

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function inferExchange(symbol: string): 'NSE' | 'BSE' {
  if (symbol.endsWith('.BO')) return 'BSE';
  return 'NSE';
}

function isIndianEquitySymbol(symbol: string): boolean {
  return symbol.endsWith('.NS') || symbol.endsWith('.BO');
}

function buildBaseCandidates(): Map<string, CandidateStock> {
  const map = new Map<string, CandidateStock>();

  const staticUniverse = [...NIFTY_500, ...ADDITIONAL_STOCKS, ...DISCOVERED_STOCKS];
  for (const item of staticUniverse) {
    const symbol = normalizeSymbol(item.symbol);
    if (!isIndianEquitySymbol(symbol)) continue;
    map.set(symbol, {
      symbol,
      companyName: normalizeName(item.companyName || symbol),
      exchange: inferExchange(symbol),
    });
  }

  for (const item of MUST_TRACK_STOCKS) {
    map.set(item.symbol, item);
  }

  return map;
}

async function discoverCandidatesFromSearch(existing: Map<string, CandidateStock>) {
  for (const term of SEARCH_TERMS) {
    try {
      const result: any = await yahooFinance.search(
        term,
        {
          quotesCount: 50,
          newsCount: 0,
        },
        { validateResult: false },
      );

      for (const quote of result.quotes || []) {
        const symbol = normalizeSymbol((quote as any).symbol || '');
        if (!symbol || !isIndianEquitySymbol(symbol)) continue;

        const companyName = normalizeName(
          ((quote as any).longname || (quote as any).shortname || symbol) as string,
        );

        if (!existing.has(symbol)) {
          existing.set(symbol, {
            symbol,
            companyName,
            exchange: inferExchange(symbol),
          });
        }
      }
    } catch (error: any) {
      console.warn(`[discover] Search failed for term "${term}": ${error?.message || error}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function fetchIsin(symbol: string): Promise<string | undefined> {
  try {
    const quote = await yahooFinance.quote(symbol, undefined, { validateResult: false });
    const maybeIsin = (quote as any)?.isin;
    if (typeof maybeIsin === 'string' && maybeIsin.trim()) {
      return maybeIsin.trim().toUpperCase();
    }
  } catch {
    // Keep this non-fatal; we can still dedupe by symbol.
  }

  return undefined;
}

async function main() {
  console.log('[sync] Building candidate universe...');
  const candidateMap = buildBaseCandidates();
  await discoverCandidatesFromSearch(candidateMap);

  const candidates = Array.from(candidateMap.values());
  console.log(`[sync] Candidate symbols collected: ${candidates.length}`);

  const existingStocks = await prisma.stock.findMany({
    select: {
      symbol: true,
      isin: true,
      companyName: true,
    },
  });

  const existingSymbols = new Set(existingStocks.map((s) => normalizeSymbol(s.symbol)));
  const existingIsins = new Set(
    existingStocks
      .map((s) => (s.isin || '').trim().toUpperCase())
      .filter((value) => value.length > 0),
  );

  const missingBySymbol = candidates.filter((candidate) => !existingSymbols.has(candidate.symbol));
  console.log(`[sync] Missing by symbol: ${missingBySymbol.length}`);

  let inserted = 0;
  let skippedByIsin = 0;
  let skippedAlreadyPresent = 0;
  let errored = 0;

  for (const candidate of missingBySymbol) {
    try {
      const isin = await fetchIsin(candidate.symbol);
      if (isin && existingIsins.has(isin)) {
        skippedByIsin += 1;
        continue;
      }

      const quote = await yahooFinance.quote(candidate.symbol, undefined, { validateResult: false });
      const currentPrice = (quote as any)?.regularMarketPrice ?? 0;
      const marketCap = (quote as any)?.marketCap ?? 0;

      await prisma.stock.upsert({
        where: { symbol: candidate.symbol },
        update: {
          companyName: candidate.companyName,
          exchange: candidate.exchange,
          isin: isin || undefined,
          currentPrice,
          marketCap,
          lastUpdated: new Date(),
        },
        create: {
          symbol: candidate.symbol,
          companyName: candidate.companyName,
          exchange: candidate.exchange,
          isin,
          currentPrice,
          marketCap,
          lastUpdated: new Date(),
        },
      });

      if (isin) existingIsins.add(isin);
      existingSymbols.add(candidate.symbol);
      inserted += 1;
    } catch (error: any) {
      if ((error as any)?.code === 'P2002') {
        skippedAlreadyPresent += 1;
      } else {
        errored += 1;
        console.warn(`[sync] Failed for ${candidate.symbol}: ${error?.message || error}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  console.log('-----------------------------------');
  console.log(`[sync] Total candidates: ${candidates.length}`);
  console.log(`[sync] Missing by symbol: ${missingBySymbol.length}`);
  console.log(`[sync] Added new stocks: ${inserted}`);
  console.log(`[sync] Skipped by ISIN duplicate: ${skippedByIsin}`);
  console.log(`[sync] Skipped existing/conflict: ${skippedAlreadyPresent}`);
  console.log(`[sync] Errors: ${errored}`);
  console.log('-----------------------------------');

  const waaree = await prisma.stock.findMany({
    where: {
      OR: [{ symbol: { contains: 'WAAREE', mode: 'insensitive' } }, { companyName: { contains: 'Waaree', mode: 'insensitive' } }],
    },
    select: { symbol: true, companyName: true, exchange: true, isin: true },
  });

  if (waaree.length > 0) {
    console.log('[sync] Waaree-related stocks in DB:');
    waaree.forEach((row) => {
      console.log(`  ${row.symbol} | ${row.companyName} | ${row.exchange} | ${row.isin || 'NA'}`);
    });
  }
}

main()
  .catch((error) => {
    console.error('[sync] Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
