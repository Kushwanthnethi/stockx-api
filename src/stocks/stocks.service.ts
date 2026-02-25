import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YahooFinanceService } from './yahoo-finance.service';
import { FyersService } from './fyers.service';
import { SymbolMapper } from './utils/symbol-mapper.util';
import {
  calculateTechnicalSignals,
  generateSyntheticRationale,
} from './utils/tech-analysis.util';
import { NIFTY_50_STOCKS, NIFTY_MIDCAP_100_STOCKS } from '../cron/constants';
// @ts-ignore
import Parser = require('rss-parser');

@Injectable()
export class StocksService {
  private parser = new Parser();
  private readonly logger = new Logger(StocksService.name);
  constructor(
    private prisma: PrismaService,
    private yahooFinanceService: YahooFinanceService,
    private fyersService: FyersService,
  ) { }

  private async getYahooClient() {
    return this.yahooFinanceService.getClient();
  }

  async getQuarterlyDetails(symbol: string) {
    const yf = await this.getYahooClient();
    let querySymbol = symbol;
    if (!symbol.includes('.') && !symbol.startsWith('^')) {
      querySymbol = `${symbol}.NS`;
    }

    let data: any[] = [];
    try {
      const res = await yf.fundamentalsTimeSeries(querySymbol, {
        period1: '2023-01-01',
        module: 'financials',
        type: 'quarterly'
      }, { validate: false });

      // Robust check for response format
      if (Array.isArray(res)) {
        data = res;
      } else if (res && typeof res === 'object') {
        // Handle nested results like { timeseries: { result: [...] } }
        const wrapped = (res as any).timeseries?.result || (res as any).result;
        data = Array.isArray(wrapped) ? wrapped : [];
      }
    } catch (e) {
      console.warn(`Primary fundamentals fetch failed for ${symbol}, proceeding to fallbacks. Error: ${e.message}`);
    }

    // Fallback Logic (Executes if data is empty OR if primary fetch failed)
    if (data.length === 0) {
      console.warn(`No time-series data for ${symbol}, trying quoteSummary fallbacks...`);

      try {
        // Fallback 1: incomeStatementHistoryQuarterly
        const summary = await yf.quoteSummary(querySymbol, {
          modules: ['incomeStatementHistoryQuarterly', 'earnings', 'price']
        }, { validate: false }).catch(() => null);

        if (summary) {
          const history = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
          if (history.length > 0) {
            return history.map((q: any) => {
              const getValue = (val: any) => (val?.raw !== undefined ? val.raw : val) || 0;
              const getDate = (val: any) => (val?.raw !== undefined ? val.raw : val);

              const sales = getValue(q.totalRevenue);
              const netProfit = getValue(q.netIncome);
              const pbt = getValue(q.incomeBeforeTax);
              const tax = getValue(q.incomeTaxExpense);
              const interest = getValue(q.interestExpense);
              const ebit = getValue(q.ebit);

              // Improved logic for Operating Profit / EBITDA
              // If operatingIncome is missing, try EBIT. If that's 0 (which is rare for profitable cos), try derived.
              let operatingProfit = getValue(q.operatingIncome);
              if (!operatingProfit) {
                operatingProfit = ebit || (pbt + interest);
              }
              // If STILL 0 and we have Net Profit, assume OP is at least Net Profit + Tax (very rough proxy, but better than 0 for display)
              if (!operatingProfit && netProfit > 0) {
                operatingProfit = pbt + interest;
              }

              const dateRaw = getDate(q.endDate);
              const dateVal = dateRaw ? dateRaw * 1000 : 0;

              // Basic EPS might be directly available in some payloads, but often missing in quarterly history
              // We can try to use 'netIncomeApplicableToCommonShares' / 'sharesOutstanding' if we had shares, but we don't here.
              // So for now, we rely on what's there or 0.
              const eps = getValue(q.basicEps);

              return {
                date: dateVal,
                formattedDate: dateVal ? new Date(dateVal).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-',
                sales,
                expenses: Math.max(0, sales - operatingProfit),
                operatingProfit,
                opmPercent: sales > 0 ? (operatingProfit / sales) * 100 : 0,
                otherIncome: pbt - operatingProfit,
                interest,
                depreciation: 0,
                pbt,
                taxPercent: pbt > 0 ? (tax / pbt) * 100 : 0,
                netProfit,
                netIncome: netProfit,
                eps,
                revenue: sales,
                ebitda: operatingProfit
              };
            }).reverse();
          }

          // Fallback 2: earnings module (very basic but reliable)
          const earningsHistory = summary.earnings?.financialsChart?.quarterly || [];
          if (earningsHistory.length > 0) {
            console.log(`Found ${earningsHistory.length} quarters in earnings module for ${symbol}`);
            return earningsHistory.map((q: any) => {
              const sales = q.revenue || 0;
              const netProfit = q.earnings || 0;

              return {
                date: q.date, // String like "1Q2025"
                formattedDate: q.date,
                sales,
                expenses: Math.max(0, sales - netProfit),
                operatingProfit: netProfit, // In earnings module, we often only have rev/earnings. Earnings ~ Net Profit. Proxy OP as Net Profit.
                opmPercent: sales > 0 ? (netProfit / sales) * 100 : 0,
                otherIncome: 0,
                interest: 0,
                depreciation: 0,
                pbt: netProfit,
                taxPercent: 0,
                netProfit,
                netIncome: netProfit,
                eps: 0, // Earnings module rarely has EPS. Leave as 0.
                revenue: sales,
                ebitda: netProfit // Proxy EBITDA as Net Profit (conservative)
              };
            });
          }
        }
      } catch (fbError) {
        console.error(`Fallback attempts also failed for ${symbol}`, fbError);
      }
      return [];
    }

    return data.map((q: any) => {
      const sales = q.totalRevenue || 0;
      const interest = q.interestExpense || 0;
      const pbt = q.pretaxIncome || 0;
      const tax = q.taxProvision || 0;
      const netProfit = q.netIncome || 0;
      const eps = q.basicEPS || 0;
      const depreciation = q.depreciationAmortizationDepletionIncomeStatement || 0;

      // Derived fields
      const operatingProfit = q.operatingIncome || (pbt + interest + depreciation);
      const expenses = Math.max(0, sales - operatingProfit);
      const opmPercent = sales > 0 ? (operatingProfit / sales) * 100 : 0;
      const taxPercent = pbt > 0 ? (tax / pbt) * 100 : 0;

      return {
        date: q.date,
        formattedDate: new Date(q.date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        sales,
        expenses,
        operatingProfit,
        opmPercent,
        otherIncome: (pbt - operatingProfit + interest + depreciation),
        interest,
        depreciation,
        pbt,
        taxPercent,
        netProfit,
        netIncome: netProfit,
        eps,
        revenue: sales,
        ebitda: operatingProfit
      };
    });
  }

  async getQuote(symbol: string) {
    const yahooFinance = await this.getYahooClient();
    let result = await yahooFinance.quote(symbol);
    if (Array.isArray(result)) result = result[0];
    return result;
  }

  async getQuotes(symbols: string[]) {
    try {
      this.logger.debug(`Fetching batch quotes for ${symbols.length} symbols...`);

      // 1. Map to Fyers Symbols
      const fyersSymbols = symbols.map(s => SymbolMapper.toFyers(s));
      const fyersQuotes = await this.fyersService.getQuotes(fyersSymbols);

      if (fyersQuotes && fyersQuotes.length > 0) {
        this.logger.debug(`Received ${fyersQuotes.length} quotes from Fyers.`);

        const results = [];
        for (const symbol of symbols) {
          const fyersSym = SymbolMapper.toFyers(symbol);
          const q = fyersQuotes.find((fq: any) => fq.n === fyersSym || fq.v?.n === fyersSym);

          if (q) {
            const price = q.lp || q.v?.lp || q.iv;
            const high = q.h || q.v?.h || price;

            if (price) {
              // Update DB in background
              await this.prisma.stock.update({
                where: { symbol },
                data: {
                  currentPrice: price,
                  changePercent: q.chp || q.v?.chp || 0,
                  high52Week: q.h52 || q.v?.h52,
                  low52Week: q.l52 || q.v?.l52,
                  lastUpdated: new Date(),
                },
              }).catch(e => this.logger.error(`Failed to update ${symbol} in DB:`, e.message));

              results.push({
                symbol,
                regularMarketPrice: price,
                regularMarketDayHigh: high,
              });
            }
          }
        }
        return results;
      }

      // 2. Fallback to Yahoo if Fyers fails/is empty
      this.logger.warn('Fyers batch quotes empty, falling back to Yahoo Finance...');
      const yahooFinance = await this.getYahooClient();
      const results = [];

      for (const symbol of symbols) {
        try {
          let q = await yahooFinance.quote(symbol);
          if (Array.isArray(q)) q = q[0];
          if (q) {
            results.push({
              symbol: q.symbol,
              regularMarketPrice: q.regularMarketPrice,
              regularMarketDayHigh: q.regularMarketDayHigh,
            });
            // Update DB
            await this.prisma.stock.update({
              where: { symbol: q.symbol },
              data: {
                currentPrice: q.regularMarketPrice,
                changePercent: q.regularMarketChangePercent,
                lastUpdated: new Date(),
              },
            }).catch(() => { });
          }
          // Small delay between Yahoo requests to avoid 429
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
          this.logger.error(`Yahoo fallback failed for ${symbol}:`, e.message);
        }
      }
      return results;
    } catch (error) {
      this.logger.error('Batch getQuotes failed:', error.message);
      return [];
    }
  }

  // Helper to scrape Google Finance price as a fallback
  private async fetchGooglePrice(symbol: string): Promise<number | null> {
    try {
      let googleSymbol = symbol;
      let exchange = 'NSE';

      if (symbol.endsWith('.NS')) {
        googleSymbol = symbol.replace('.NS', '');
        exchange = 'NSE';
      } else if (symbol.endsWith('.BO')) {
        googleSymbol = symbol.replace('.BO', '');
        exchange = 'BOM';
      }

      const url = `https://www.google.com/finance/quote/${googleSymbol}:${exchange}`;
      const axios = (await import('axios')).default;

      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const match = data.match(/<div class="YMlKec fxKbKc">[^0-9]*([0-9,]+\.?[0-9]*)<\/div>/);
      if (match && match[1]) {
        const priceStr = match[1].replace(/,/g, '');
        const price = parseFloat(priceStr);
        if (!isNaN(price)) {
          console.log(`Google Finance fallback success for ${symbol}: ${price}`);
          return price;
        }
      }
    } catch (e) {
      console.warn(`Google Finance fallback failed for ${symbol}`);
    }
    return null;
  }

  async findOne(symbol: string) {
    // Alias for branded name "Eternal" -> "ZOMATO.NS"
    if (symbol === 'ETERNAL') symbol = 'ZOMATO.NS';

    let stock = await this.prisma.stock.findUnique({
      where: { symbol },
      include: { investorStocks: { include: { investor: true } }, financials: true },
    });

    // If not found and no suffix, try appending .NS (common for Indian stocks)
    if (!stock && !symbol.includes('.') && !symbol.startsWith('^')) {
      const stockNS = await this.prisma.stock.findUnique({
        where: { symbol: `${symbol}.NS` },
        include: { investorStocks: { include: { investor: true } }, financials: true },
      });
      if (stockNS) {
        stock = stockNS;
        // Optionally update the original symbol to match found stock?
        // For now, just return the data. The frontend works with what's returned.
        symbol = stock.symbol;
      }
    }

    // Check if data is stale (Indices: 1 min, Stocks: 15 mins)
    const isSpecialIndex = symbol === 'NIFTY 50' || symbol === 'SENSEX' || symbol.startsWith('^');
    const staleThreshold = isSpecialIndex ? 1 * 60 * 1000 : 15 * 60 * 1000;
    const staleTime = new Date(Date.now() - staleThreshold);

    if (
      !stock ||
      stock.lastUpdated < staleTime ||
      stock.currentPrice === 0
    ) {
      try {
        this.logger.debug(`Fetching live data for ${symbol}...`);

        // Map names to Fyers symbols for indices
        if (symbol === 'NIFTY 50' || symbol === 'SENSEX' || symbol === 'NIFTY BANK' || symbol.startsWith('^')) {
          const fyersSymbol = SymbolMapper.toFyers(symbol);
          const fyersQuotes = await this.fyersService.getQuotes([fyersSymbol]);

          if (fyersQuotes && fyersQuotes.length > 0) {
            const q = fyersQuotes[0];
            const price = q.lp || q.v?.lp || q.iv; // iv is common for indices in lite mode

            if (price) {
              const dataToUpdate = {
                currentPrice: price,
                changePercent: q.chp || q.v?.chp || 0,
                lastUpdated: new Date(),
              };

              const updatedStock = await this.prisma.stock.upsert({
                where: { symbol },
                update: dataToUpdate,
                create: {
                  symbol,
                  companyName: symbol,
                  exchange: symbol.startsWith('BSE') ? 'BSE' : 'NSE',
                  ...dataToUpdate,
                },
              });
              return updatedStock;
            }
          }
        }

        const yahooFinance = await this.getYahooClient();

        // Normalize symbol for Yahoo and DB consistency
        let querySymbol = symbol;
        const isIndexName = ['NIFTY 50', 'SENSEX', 'NIFTY BANK'].includes(symbol.toUpperCase());
        if (!symbol.includes('.') && !symbol.startsWith('^') && !isIndexName) {
          querySymbol = `${symbol}.NS`;
        }

        // 1. Initial lookup with normalized symbol
        stock = await this.prisma.stock.findUnique({
          where: { symbol: querySymbol },
          include: { investorStocks: { include: { investor: true } }, financials: true },
        });

        // Try raw symbol if not found
        if (!stock && querySymbol !== symbol) {
          stock = await this.prisma.stock.findUnique({
            where: { symbol },
            include: { investorStocks: { include: { investor: true } }, financials: true },
          });
        }

        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const stockIsStale = !stock || stock.lastUpdated < fifteenMinutesAgo;

        if (!stockIsStale) {
          return stock;
        }

        let result: any;
        const isIndex = querySymbol.startsWith('^');

        // Trimmed modules to avoid rate limits and bloat
        const modules = isIndex
          ? ['price', 'summaryDetail']
          : [
            'price',
            'summaryDetail', // For PE, Market Cap, Div Yield
            'defaultKeyStatistics', // For PB, Book Value, Shares
            'financialData', // For EBITDA, Margins, Debt, Quick/Current Ratio
            'summaryProfile', // For Sector/Industry
            'incomeStatementHistory',
            'balanceSheetHistory',
            'cashflowStatementHistory',
          ];

        // Fetch from Yahoo
        try {
          result = await yahooFinance.quoteSummary(querySymbol, { modules });
        } catch (e: any) {
          // Fallback to original symbol if querySymbol failed
          if (querySymbol !== symbol) {
            try {
              result = await yahooFinance.quoteSummary(symbol, { modules });
              querySymbol = symbol;
            } catch (e2) {
              throw e; // Rethrow original error if even basic symbol fails
            }
          } else {
            throw e;
          }
        }

        const price = result.price?.regularMarketPrice;
        const previousClose = result.price?.regularMarketPreviousClose;
        // CRITICAL FIX: Do not overwrite with null/0 if we have an existing valid price
        const effectivePrice = price || previousClose || stock?.currentPrice || 0;

        const changes = result.price?.regularMarketChangePercent;
        const marketCap = result.summaryDetail?.marketCap;
        const pe = result.summaryDetail?.trailingPE;
        const pb = result.defaultKeyStatistics?.priceToBook;
        const high52 = result.summaryDetail?.fiftyTwoWeekHigh;
        const low52 = result.summaryDetail?.fiftyTwoWeekLow;

        // Extended Metrics
        const bookValue = result.defaultKeyStatistics?.bookValue;
        const divYield = result.summaryDetail?.dividendYield;
        const roe = result.financialData?.returnOnEquity;
        const roa = result.financialData?.returnOnAssets;
        const totalDebt = result.financialData?.totalDebt;
        const totalRevenue = result.financialData?.totalRevenue;
        const profitMargins = result.financialData?.profitMargins;
        const operatingMargins = result.financialData?.operatingMargins;

        // Advanced
        const description = result.summaryProfile?.longBusinessSummary;
        const currentRatio = result.financialData?.currentRatio;
        const debtToEquity = result.financialData?.debtToEquity;
        const freeCashflow = result.financialData?.freeCashflow;
        const earningsGrowth = result.financialData?.earningsGrowth;
        const revenueGrowth = result.financialData?.revenueGrowth;
        const ebitda = result.financialData?.ebitda;
        const quickRatio = result.financialData?.quickRatio;

        const getVal = (v: any, fallback = 0) => {
          if (v === null || v === undefined) return fallback;
          if (typeof v === 'number') return v;
          if (v.raw !== undefined) return v.raw;
          return fallback;
        };

        // 3. Custom Fundamental Calculations (Fallback for missing ratios)
        // For Indian stocks, balance sheet is often empty in quoteSummary. 
        // We only call the expensive time-series fetch if we don't have existing ratios
        // or if it's been more than 24 hours (fundamentals don't change fast).
        let timeSeriesData = null;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        // Trigger fundamentals fetch if ANY key metric is missing or data is >24h stale
        const needsFundamentals = !stock?.returnOnCapitalEmployed
          || !stock?.eps
          || !stock?.returnOnEquity
          || !stock?.bookValuePerShare
          || !stock?.grossMargin
          || (stock?.lastUpdated < oneDayAgo);

        if (needsFundamentals && (!isIndex)) {
          this.logger.debug(`Fetching time-series fundamentals for ${querySymbol}...`);
          timeSeriesData = await this.getYahooFundamentals(querySymbol);
        }

        const computed = this.calculateFundamentals(result, symbol, timeSeriesData);

        const chgPercent = changes !== undefined ? (changes * 100) : (stock?.changePercent || 0);
        const changeValue = (effectivePrice * (chgPercent / 100)) / (1 + (chgPercent / 100));

        const dataToUpdate = {
          currentPrice: effectivePrice,
          changePercent: chgPercent,
          marketCap: getVal(marketCap) ?? stock?.marketCap ?? null,
          peRatio: computed.pe ?? getVal(pe) ?? stock?.peRatio ?? null,
          pbRatio: computed.pb ?? getVal(pb) ?? stock?.pbRatio ?? null,
          high52Week: getVal(high52) ?? stock?.high52Week ?? null,
          low52Week: getVal(low52) ?? stock?.low52Week ?? null,
          // Core Fields
          bookValue: getVal(bookValue) ?? stock?.bookValue ?? null,
          dividendYield: getVal(divYield) ?? stock?.dividendYield ?? null,
          totalDebt: computed.totalDebt ?? getVal(totalDebt) ?? stock?.totalDebt ?? null,
          totalRevenue: getVal(totalRevenue) ?? stock?.totalRevenue ?? null,
          // Profile
          description: description || stock?.description || null,
          sector: result.summaryProfile?.sector || stock?.sector || null,
          // Profitability (prefer computed > Yahoo direct > existing DB)
          returnOnEquity: computed.returnOnEquity ?? roe ?? stock?.returnOnEquity ?? null,
          returnOnAssets: computed.returnOnAssets ?? roa ?? stock?.returnOnAssets ?? null,
          returnOnCapitalEmployed: computed.returnOnCapitalEmployed ?? stock?.returnOnCapitalEmployed ?? null,
          profitMargins: computed.profitMargins ?? profitMargins ?? stock?.profitMargins ?? null,
          operatingMargins: computed.operatingMargins ?? operatingMargins ?? stock?.operatingMargins ?? null,
          grossMargin: computed.grossMargin ?? stock?.grossMargin ?? null,
          // Financial Strength
          currentRatio: computed.currentRatio ?? currentRatio ?? stock?.currentRatio ?? null,
          debtToEquity: computed.debtToEquity ?? debtToEquity ?? stock?.debtToEquity ?? null,
          quickRatio: computed.quickRatio ?? quickRatio ?? stock?.quickRatio ?? null,
          interestCoverageRatio: computed.interestCoverageRatio ?? stock?.interestCoverageRatio ?? null,
          // Valuation
          eps: computed.eps ?? stock?.eps ?? null,
          bookValuePerShare: computed.bookValuePerShare ?? stock?.bookValuePerShare ?? null,
          evEbitda: computed.evEbitda ?? stock?.evEbitda ?? null,
          enterpriseValue: computed.enterpriseValue ?? stock?.enterpriseValue ?? null,
          ebitda: computed.ebitda ?? ebitda ?? stock?.ebitda ?? null,
          // Growth
          revenueGrowth: computed.revenueGrowth ?? revenueGrowth ?? stock?.revenueGrowth ?? null,
          earningsGrowth: computed.earningsGrowth ?? earningsGrowth ?? stock?.earningsGrowth ?? null,
          epsGrowth: computed.epsGrowth ?? stock?.epsGrowth ?? null,
          // Cash Flow
          operatingCashFlow: computed.operatingCashFlow ?? stock?.operatingCashFlow ?? null,
          capitalExpenditure: computed.capitalExpenditure ?? stock?.capitalExpenditure ?? null,
          freeCashflow: computed.freeCashflow ?? freeCashflow ?? stock?.freeCashflow ?? null,
          fcfMargin: computed.fcfMargin ?? stock?.fcfMargin ?? null,
          cashFlowToDebt: computed.cashFlowToDebt ?? stock?.cashFlowToDebt ?? null,
          ocfRatio: computed.ocfRatio ?? stock?.ocfRatio ?? null,
          // Advanced Valuation
          pegRatio: computed.pegRatio ?? stock?.pegRatio ?? null,
          grahamNumber: computed.grahamNumber ?? stock?.grahamNumber ?? null,
          intrinsicValue: computed.intrinsicValue ?? stock?.intrinsicValue ?? null,

          lastUpdated: new Date(),
        };

        const updatedStock = await this.prisma.stock.upsert({
          where: { symbol: querySymbol },
          update: dataToUpdate,
          create: {
            symbol: querySymbol,
            companyName: result.price?.shortName || symbol,
            exchange:
              result.price?.exchangeName ||
              (querySymbol.includes('.BO') ? 'BSE' : 'NSE'),
            ...dataToUpdate,
          },
          include: { investorStocks: { include: { investor: true } }, financials: true },
        });

        // Return with calculated absolute change
        return {
          ...updatedStock,
          change: changeValue
        };
      } catch (error) {
        console.error(`Failed to fetch data via Yahoo for ${symbol}:`, error);

        // FALLBACK: Try Google Finance scraping
        console.log(`Attempting Google Finance fallback for ${symbol}...`);
        const fallbackPrice = await this.fetchGooglePrice(symbol);

        if (fallbackPrice) {
          console.log(`Fallback successful. Updating ${symbol} with price ${fallbackPrice}`);
          const fallbackData: any = {
            currentPrice: fallbackPrice,
            companyName: stock?.companyName || symbol,
            exchange: symbol.includes('.BO') ? 'BSE' : 'NSE',
            lastUpdated: new Date(),
            // Preserve existing DB values — don't zero-out computed fundamentals
            marketCap: stock?.marketCap ?? null,
            peRatio: stock?.peRatio ?? null,
            pbRatio: stock?.pbRatio ?? null,
            high52Week: stock?.high52Week ?? null,
            low52Week: stock?.low52Week ?? null,
            bookValue: stock?.bookValue ?? null,
            dividendYield: stock?.dividendYield ?? null,
            returnOnEquity: stock?.returnOnEquity ?? null,
            returnOnAssets: stock?.returnOnAssets ?? null,
            totalDebt: stock?.totalDebt ?? null,
            totalRevenue: stock?.totalRevenue ?? null,
            profitMargins: stock?.profitMargins ?? null,
            operatingMargins: stock?.operatingMargins ?? null,
            currentRatio: stock?.currentRatio ?? null,
            debtToEquity: stock?.debtToEquity ?? null,
            freeCashflow: stock?.freeCashflow ?? null,
            earningsGrowth: stock?.earningsGrowth ?? null,
            revenueGrowth: stock?.revenueGrowth ?? null,
            ebitda: stock?.ebitda ?? null,
            quickRatio: stock?.quickRatio ?? null,
          };

          const updatedStock = await this.prisma.stock.upsert({
            where: { symbol },
            update: fallbackData,
            create: {
              symbol,
              ...fallbackData,
              description: null,
              sector: null
            },
            include: { investorStocks: { include: { investor: true } }, financials: true },
          });
          return updatedStock;
        }

        // CRITICAL: Update lastUpdated even on failure to prevent immediate retry loop (spamming API)
        if (stock) {
          await this.prisma.stock.update({
            where: { symbol },
            data: { lastUpdated: new Date() },
          });
          const chgPercent = stock.changePercent || 0;
          const changeValue = ((stock.currentPrice || 0) * (chgPercent / 100)) / (1 + (chgPercent / 100));
          return { ...stock, change: changeValue };
        }
      }
    }

    const chgPercent = stock?.changePercent || 0;
    const changeValue = ((stock?.currentPrice || 0) * (chgPercent / 100)) / (1 + (chgPercent / 100));
    return { ...stock, change: changeValue };
  }

  async updateEarnings(symbol: string) {
    try {
      const yahooFinance = await this.getYahooClient();

      // Handle suffix logic
      let querySymbol = symbol;
      if (!symbol.includes('.') && !symbol.startsWith('^')) {
        querySymbol = `${symbol}.NS`;
      }

      const res = await yahooFinance.quoteSummary(querySymbol, {
        modules: ['calendarEvents', 'earnings'],
      });

      const events = res.calendarEvents?.earnings;
      // Get nearest date
      let earningsDate: Date | null = null;
      if (events && events.earningsDate && events.earningsDate.length > 0) {
        earningsDate = new Date(events.earningsDate[0]);
      }

      const resultStatus = earningsDate
        ? (earningsDate < new Date() ? 'DECLARED' : 'UPCOMING')
        : null;

      // Check Index Membership from Constants
      const isNifty50 = NIFTY_50_STOCKS.includes(symbol);
      const isMidcap100 = NIFTY_MIDCAP_100_STOCKS.includes(symbol);

      // Update in DB
      await this.prisma.stock.upsert({
        where: { symbol },
        update: {
          earningsDate,
          resultStatus,
          isNifty50,
          isMidcap100,
          lastUpdated: new Date()
        },
        create: {
          symbol,
          companyName: symbol, // Fallback
          exchange: 'NSE',
          earningsDate,
          resultStatus,
          isNifty50,
          isMidcap100: isMidcap100,
          lastUpdated: new Date()
        }
      });

      return { symbol, earningsDate, resultStatus };

    } catch (error) {
      console.error(`Failed to update earnings for ${symbol}`, error);
      return null;
    }
  }

  async getEarningsFromDB(limit = 100) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stocks = await this.prisma.stock.findMany({
      where: {
        earningsDate: { not: null }
      },
      orderBy: { earningsDate: 'asc' },
      take: limit
    });

    // Transform to frontend format
    return stocks.map(s => ({
      symbol: s.symbol,
      companyName: s.companyName,
      date: s.earningsDate,
      formattedDate: s.earningsDate?.toDateString(),
      // We can create a valid BSE link dynamically
      pdfUrl: `https://www.bseindia.com/corporates/ann.html?scrip=${s.symbol.replace('.NS', '').replace('.BO', '')}&duration=Today`,
      revenue: s.totalRevenue || 0,
      profit: s.ebitda || 0,
      eps: 0,
      revenueGrowth: s.revenueGrowth || 0,
      isNifty50: s.isNifty50,
      isMidcap100: s.isMidcap100 // Ensure these are selected in findMany
    })).sort((a: any, b: any) => {
      // Sort closest to Today first
      return Math.abs(new Date(a.date).getTime() - today.getTime()) - Math.abs(new Date(b.date).getTime() - today.getTime());
    });
  }

  async getBatch(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];

    // Concurrently fetch/update each symbol using the existing robust findOne logic
    const promises = symbols.map((symbol) => this.findOne(symbol));
    const results = await Promise.all(promises);

    // Filter out nulls/undefined if any
    return results.filter((s) => s !== null && s !== undefined);
  }

  async getPeers(symbol: string) {
    const formattedSymbol = symbol.toUpperCase();
    const stock = await this.prisma.stock.findUnique({
      where: { symbol: formattedSymbol },
      select: { sector: true },
    });

    if (!stock || !stock.sector) {
      return [];
    }

    return this.prisma.stock.findMany({
      where: {
        sector: stock.sector,
        symbol: { not: formattedSymbol },
      },
      take: 4,
      orderBy: { marketCap: 'desc' },
    });
  }

  // Cache simple in-memory for demo (use Redis in prod)
  private earningsCache: any = null;
  private lastEarningsFetch: number = 0;

  async getEarningsCalendar() {
    // Return cached if fresh (< 6 hours)
    const now = Date.now();
    if (
      this.earningsCache &&
      now - this.lastEarningsFetch < 6 * 60 * 60 * 1000
    ) {
      return this.earningsCache;
    }

    // Use dynamic DB list if available, else fallback to constants
    const dbEarnings = await this.getEarningsFromDB();
    if (dbEarnings.length > 0) {
      this.earningsCache = dbEarnings;
      this.lastEarningsFetch = now;
      return dbEarnings;
    }

    // Fallback to hardcoded list if DB is empty (first run)
    const popularTickers = [
      // NIFTY 50
      'RELIANCE.NS',
      'TCS.NS',
      'HDFCBANK.NS',
      'ICICIBANK.NS',
      'INFY.NS',
      'BHARTIARTL.NS',
      'ITC.NS',
      'SBIN.NS',
      'LICI.NS',
      'HINDUNILVR.NS',
      'LT.NS',
      'BAJFINANCE.NS',
      'HCLTECH.NS',
      'MARUTI.NS',
      'SUNPHARMA.NS',
      'ADANIENT.NS',
      'TITAN.NS',
      'ONGC.NS',
      'AXISBANK.NS',
      'NTPC.NS',
      'ULTRACEMCO.NS',
      'POWERGRID.NS',
      'KOTAKBANK.NS',
      'M&M.NS',
      'WIPRO.NS',
      'COALINDIA.NS',
      'BAJAJ-AUTO.NS',
      'ADANIPORTS.NS',
      'ASIANPAINT.NS',
      'NESTLEIND.NS',
      'JSWSTEEL.NS',
      'GRASIM.NS',
      'TATASTEEL.NS',
      'TECHM.NS',
      'SBILIFE.NS',
      'HDFCLIFE.NS',
      'BRITANNIA.NS',
      'INDUSINDBK.NS',
      'CIPLA.NS',
      'TATAWCF.NS',
      'DIVISLAB.NS',
      'EICHERMOT.NS',
      'BAJAJFINSV.NS',
      'BPCL.NS',
      'TATACONSUM.NS',
      'DRREDDY.NS',
      'HEROMOTOCO.NS',
      'HINDALCO.NS',
      'APOLLOHOSP.NS',

      // key NEXT 50 / MIDCAPS relevant for retail
      'ZOMATO.NS',
      'DLF.NS',
      'HAL.NS',
      'JIOFIN.NS',
      'TRENT.NS',
      'VBL.NS',
      'SIEMENS.NS',
      'BEL.NS',
      'IOC.NS',
      'PFC.NS',
      'REC.NS',
      'GAIL.NS',
      'CHOLAFIN.NS',
      'BANKBARODA.NS',
      'INDIGO.NS',
      'TVSMOTOR.NS',
      'HAVELLS.NS',
      'ABB.NS',
      'GODREJCP.NS',
      'AMBUJACEM.NS',
    ];

    try {
      console.log('Fetching earnings calendar for broader market...');
      console.log('Fetching earnings calendar for broader market...');
      const yahooFinance = await this.getYahooClient();

      // Process in chunks to avoid rate limits or timeouts
      const chunkSize = 10;
      const allResults = [];

      for (let i = 0; i < popularTickers.length; i += chunkSize) {
        const chunk = popularTickers.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (symbol) => {
          try {
            let res;
            try {
              res = await yahooFinance.quoteSummary(symbol, {
                modules: [
                  'calendarEvents',
                  'price',
                  'financialData',
                  'defaultKeyStatistics',
                ],
              });
            } catch (validationError: any) {
              // Yahoo Finance throws on validation failure but often includes partial data in error.result
              if (validationError.result) {
                // console.warn(`Validation failed for ${symbol}, using partial result.`);
                res = validationError.result;
              } else {
                throw validationError;
              }
            }

            const events = res.calendarEvents?.earnings;
            // Relaxed check: if no specific earnings date, maybe allow if we have past data?
            // For now, strict on earningsDate presence for "Calendar" purpose.
            if (
              !events ||
              !events.earningsDate ||
              events.earningsDate.length === 0
            )
              return null;

            // Get nearest date
            const date = new Date(events.earningsDate[0]);

            // Get Key Financials (for context display)
            const revenue = res.financialData?.totalRevenue;
            const profit = res.financialData?.ebitda;
            const eps = res.defaultKeyStatistics?.trailingEps;
            const revenueGrowth = res.financialData?.revenueGrowth;

            // Check Index Membership
            const isNifty50 = NIFTY_50_STOCKS.includes(symbol);
            const isMidcap100 = NIFTY_MIDCAP_100_STOCKS.includes(symbol);

            return {
              symbol,
              companyName: res.price?.shortName || symbol,
              date: date,
              formattedDate: date.toDateString(),
              revenue: revenue || 0,
              profit: profit || 0,
              eps: eps || 0,
              revenueGrowth: revenueGrowth || 0,
              isNifty50,   // Added for fallback filtering
              isMidcap100, // Added for fallback filtering
              // Link to BSE Corporate Filings (Reliable source for original PDFs)
              pdfUrl: `https://www.bseindia.com/corporates/ann.html?scrip=${symbol.replace('.NS', '').replace('.BO', '')}&duration=Today`,
            };
          } catch (e) {
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        allResults.push(...chunkResults.filter((r) => r !== null));
      }

      // Sort: Most recent/upcoming first
      // Logic: Show dates closest to TODAY first (whether slightly past or future)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allResults.sort((a: any, b: any) => {
        return (
          Math.abs(a.date.getTime() - today.getTime()) -
          Math.abs(b.date.getTime() - today.getTime())
        );
      });

      // Return substantial list (e.g., top 50 relevant by date), or all if needed
      // User said "every stock... displayed in that page". So let's return all found.
      this.earningsCache = allResults;
      this.lastEarningsFetch = now;
      return this.earningsCache;
    } catch (e) {
      console.error('Failed to fetch earnings calendar', e);
      return [];
    }
  }

  async getEarningsDetails(symbol: string) {
    try {
      const yahooFinance = await this.getYahooClient();

      // Fix: If symbol has no suffix (e.g. "DRREDDY"), assume NSE (.NS)
      // This matches frontend routing which strips .NS
      let querySymbol = symbol;
      if (!symbol.includes('.') && !symbol.startsWith('^')) {
        querySymbol = `${symbol}.NS`;
      }

      const res = await yahooFinance.quoteSummary(querySymbol, {
        modules: [
          'earnings',
          'financialData',
          'defaultKeyStatistics',
          'price',
          'summaryDetail',
          'summaryProfile',
          'recommendationTrend',
        ],
      });

      // Fetch related news
      let newsItems = [];
      try {
        const newsRes = await yahooFinance.search(symbol, { newsCount: 3 });
        if (newsRes.news) {
          newsItems = newsRes.news.map((n: any) => ({
            title: n.title,
            link: n.link,
            publisher: n.publisher,
            publishedAt: n.providerPublishTime
              ? new Date(n.providerPublishTime * 1000).toISOString()
              : new Date().toISOString(),
          }));
        }
      } catch (newsError) {
        console.error('Failed to fetch news for earnings analysis', newsError);
      }

      const history = res.earnings?.earningsChart?.quarterly || [];
      const financials = res.financialData;

      // Analyze latest available quarter
      const latestQtr = history.length > 0 ? history[history.length - 1] : null;
      let verdict = 'NEUTRAL';
      let surprise = 0;

      if (latestQtr && latestQtr.actual && latestQtr.estimate) {
        surprise =
          ((latestQtr.actual - latestQtr.estimate) / latestQtr.estimate) * 100;
        if (surprise > 2) verdict = 'BEAT';
        else if (surprise < -2) verdict = 'MISS';
        else verdict = 'MET';
      }

      return {
        symbol: symbol.toUpperCase(),
        companyName: res.price?.shortName,
        price: res.price?.regularMarketPrice,
        currency: res.price?.currency,
        description: res.summaryProfile?.longBusinessSummary, // Note: not in modules above, might need to add if we want desc.
        // Actually 'summaryProfile' module is needed for description. Adding it to modules list below.

        verdict,
        surprisePercent: surprise,

        latestQuarter: latestQtr
          ? {
            period: latestQtr.date,
            estimate: latestQtr.estimate,
            actual: latestQtr.actual,
          }
          : null,

        history: history.map((h: any) => ({
          period: h.date,
          estimate: h.estimate,
          actual: h.actual,
        })),

        financials: {
          // P&L
          revenue: financials?.totalRevenue,
          revenueGrowth: financials?.revenueGrowth,
          grossProfit: financials?.grossProfits,
          ebitda: financials?.ebitda,
          netIncome: financials?.netIncomeToCommon,
          eps: res.defaultKeyStatistics?.trailingEps,

          // Margins
          grossMargin: financials?.grossMargins,
          operatingMargin: financials?.operatingMargins,
          profitMargin: financials?.profitMargins,

          // Balance Sheet & Cash Flow
          totalCash: financials?.totalCash,
          totalDebt: financials?.totalDebt,
          debtToEquity: financials?.debtToEquity,
          operatingCashflow: financials?.operatingCashflow,
          freeCashflow: financials?.freeCashflow,

          // Valuation
          pe: res.summaryDetail?.trailingPE,
          pegRatio: res.defaultKeyStatistics?.pegRatio,
          priceToBook: res.defaultKeyStatistics?.priceToBook,
        },

        // Add News for context
        news: newsItems,

        // Add analyst recommendations
        recommendations: res.recommendationTrend?.trend?.[0] || null,
        recommendationMean: res.financialData?.recommendationMean || null,

        // MERGED: Quarterly Analysis (QoQ, YoY)
        // MERGED: Quarterly Analysis (QoQ, YoY)
        quarterly: await (async () => {
          try {
            const qData = await this.getQuarterlyDetails(symbol);
            if (!qData || qData.length === 0) return null;

            // Sort Newest First
            const sorted = [...qData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const current = sorted[0];
            const prev = sorted[1];
            const yearAgo = sorted[4];

            const growth = (curr: number, base: number) => {
              if (curr === undefined || base === undefined || base === 0) return null;
              return (curr - base) / Math.abs(base);
            };

            return {
              quarters: sorted,
              comparisons: {
                current,
                prev,
                yearAgo,
                growth: {
                  qoq: {
                    revenue: growth(current?.sales, prev?.sales),
                    netIncome: growth(current?.netProfit, prev?.netProfit),
                    operatingIncome: growth(current?.operatingProfit, prev?.operatingProfit),
                    eps: growth(current?.eps, prev?.eps),
                  },
                  yoy: {
                    revenue: growth(current?.sales, yearAgo?.sales) || res.financialData?.revenueGrowth,
                    netIncome: growth(current?.netProfit, yearAgo?.netProfit) || res.defaultKeyStatistics?.earningsQuarterlyGrowth,
                    operatingIncome: growth(current?.operatingProfit, yearAgo?.operatingProfit),
                    eps: growth(current?.eps, yearAgo?.eps),
                  }
                }
              }
            };
          } catch (e) { return null; }
        })(),
      };
    } catch (e) {
      console.error(`Failed to fetch earnings details for ${symbol}`, e);
      throw new NotFoundException(`Earnings data for ${symbol} not found`);
    }
  }



  async findAll() {
    // Return all stocks in DB
    const stocks = await this.prisma.stock.findMany({
      orderBy: { lastUpdated: 'desc' },
    });

    // Background refresh for stocks with missing price (non-blocking)
    const staleStocks = stocks.filter(
      (s) => !s.currentPrice || s.currentPrice === 0,
    );
    if (staleStocks.length > 0) {
      console.log(
        `Triggering background refresh for ${staleStocks.length} new/stale stocks...`,
      );
      // Process in batches of 10 to avoid blasting the API
      // We don't await this so the UI loads instantly with what we have,
      // and data pops in on next refresh or via socket if we had one.
      this.getBatch(staleStocks.slice(0, 50).map((s) => s.symbol));
    }

    return stocks;
  }

  async getMarketSummary(page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      // 1. Fetch page of stocks from DB
      const dbStocks = await this.prisma.stock.findMany({
        take: limit,
        skip: offset,
        orderBy: { symbol: 'asc' }, // Or marketCap if available, but symbol is stable
      });

      if (dbStocks.length === 0) return [];

      // Relaxed threshold: 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const symbolsToFetch: string[] = [];

      // 2. Identify stale stocks
      for (const stock of dbStocks) {
        // If price is 0, or missing fundamentals (Market Cap/PE), or old -> fetch it
        if (
          !stock.currentPrice ||
          stock.currentPrice === 0 ||
          !stock.marketCap ||
          stock.lastUpdated < fifteenMinutesAgo
        ) {
          symbolsToFetch.push(stock.symbol);
        }
      }

      // 3. Trigger background refresh if needed (Fire and Forget)
      if (symbolsToFetch.length > 0) {
        // We do NOT await this. It runs in the background.
        this.refreshStocksMetadata(symbolsToFetch).catch((err) => {
          console.error('Background refresh failed:', err);
        });
      }

      // 5. Return current DB data immediately with calculated change
      return dbStocks.map(stock => {
        const chgPercent = stock.changePercent || 0;
        const changeValue = ((stock.currentPrice || 0) * (chgPercent / 100)) / (1 + (chgPercent / 100));
        return {
          ...stock,
          change: changeValue
        };
      });
    } catch (error) {
      console.error('Market summary fetch failed:', error);
      return [];
    }
  }

  /**
   * Internal helper for background stock metadata refresh
   */
  private async refreshStocksMetadata(symbols: string[]) {
    try {
      const yahooFinance = await this.getYahooClient();
      console.log(`[Background] Refreshing ${symbols.length} stocks...`);

      const results = [];
      const chunkSize = 10; // Increased chunk size for efficiency
      const delayBetweenChunks = 500; // Reduced delay as it's background

      for (let i = 0; i < symbols.length; i += chunkSize) {
        const chunk = symbols.slice(i, i + chunkSize);
        console.log(
          `[Background] Processing chunk ${Math.ceil((i + 1) / chunkSize)}/${Math.ceil(symbols.length / chunkSize)}`,
        );

        const chunkPromises = chunk.map((symbol) => {
          let querySymbol = symbol;
          if (symbol === 'NIFTY 50') querySymbol = '^NSEI';
          if (symbol === 'SENSEX') querySymbol = '^BSESN';

          return yahooFinance
            .quoteSummary(
              querySymbol.includes('.') || querySymbol.startsWith('^')
                ? querySymbol
                : `${querySymbol}.NS`,
              {
                modules: [
                  'price',
                  'summaryDetail',
                  'defaultKeyStatistics',
                  'financialData',
                ],
              },
            )
            .then((res: any) => ({ ...res, originalSymbol: symbol }))
            .catch((e: any) => {
              console.error(
                `[Background] Failed to refresh ${symbol} - ${e.message}`,
              );
              return null;
            });
        });

        const chunkResults = (await Promise.all(chunkPromises)).filter(
          (r) => r !== null,
        );
        results.push(...chunkResults);

        if (i + chunkSize < symbols.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenChunks),
          );
        }
      }

      // Update DB
      for (const data of results) {
        const symbol = data.originalSymbol;
        if (!symbol) continue;

        const price = data.price?.regularMarketPrice;

        const getV = (v: any) => {
          if (v === null || v === undefined) return undefined; // Don't overwrite if null
          if (typeof v === 'number') return v;
          if (v.raw !== undefined) return v.raw;
          return undefined;
        };

        await this.prisma.stock.update({
          where: { symbol: symbol },
          data: {
            currentPrice: price || undefined,
            changePercent: data.price?.regularMarketChangePercent !== undefined ? (data.price.regularMarketChangePercent * 100) : undefined,
            marketCap: getV(data.summaryDetail?.marketCap),
            peRatio: getV(data.summaryDetail?.trailingPE),
            pbRatio: getV(data.defaultKeyStatistics?.priceToBook),
            high52Week: getV(data.summaryDetail?.fiftyTwoWeekHigh),
            low52Week: getV(data.summaryDetail?.fiftyTwoWeekLow),
            bookValue: getV(data.defaultKeyStatistics?.bookValue),
            dividendYield: getV(data.summaryDetail?.dividendYield),
            returnOnEquity: getV(data.financialData?.returnOnEquity),
            returnOnAssets: getV(data.financialData?.returnOnAssets),
            totalDebt: getV(data.financialData?.totalDebt),
            totalRevenue: getV(data.financialData?.totalRevenue),
            profitMargins: getV(data.financialData?.profitMargins),
            operatingMargins: getV(data.financialData?.operatingMargins),
            lastUpdated: new Date(),
          },
        });
      }
      console.log(
        `[Background] Successfully updated ${results.length} stocks.`,
      );
    } catch (error) {
      console.error('[Background] Stocks refresh failed:', error);
    }
  }
  async getMarketNews() {
    try {
      const yahooFinance = await this.getYahooClient();

      const queries = [
        'India Stock Market',
        'Nifty 50',
        'Sensex',
        'Indian Economy',
      ];
      const requests = queries.map((q) =>
        yahooFinance.search(q, { newsCount: 10 }),
      );

      const results = await Promise.all(requests);

      // Combine and deduplicate
      const allNews = results.flatMap((r) => r.news || []);
      const uniqueNews = Array.from(
        new Map(allNews.map((item: any) => [item.uuid, item])).values(),
      );

      // Sort by time (newest first)
      uniqueNews.sort(
        (a: any, b: any) =>
          new Date(b.providerPublishTime).getTime() -
          new Date(a.providerPublishTime).getTime(),
      );

      return uniqueNews.slice(0, 20);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      return [];
    }
  }

  async getStockNews(symbol: string) {
    try {
      const stock = await this.prisma.stock.findUnique({
        where: { symbol },
        select: { companyName: true },
      });

      const companyName = stock?.companyName || symbol.replace('.NS', '').replace('.BO', '');
      const queries = [
        `${companyName} stock news`,
        `${symbol} stock`,
      ];

      console.log(`Fetching relevant news for ${companyName} (${symbol})...`);

      const allItems: any[] = [];
      const titles = new Set<string>();

      for (const q of queries) {
        try {
          const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
          const feed = await this.parser.parseURL(url);

          if (feed.items) {
            for (const item of feed.items) {
              const title = item.title?.split(' - ')[0] || item.title || '';
              const normalizedTitle = title.toLowerCase().trim();

              if (!titles.has(normalizedTitle)) {
                titles.add(normalizedTitle);
                allItems.push({
                  uuid: item.link || Math.random().toString(36).substring(7),
                  title: title,
                  link: item.link,
                  contentSnippet: item.contentSnippet || item.content || '',
                  publisher: item.title?.split(' - ').pop() || 'News',
                  providerPublishTime: item.pubDate ? new Date(item.pubDate) : new Date(),
                });
              }
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch RSS for query "${q}":`, e.message);
        }
      }

      // Sort by time
      const news = allItems.sort(
        (a: any, b: any) =>
          b.providerPublishTime.getTime() - a.providerPublishTime.getTime(),
      );

      // limit to 15 items
      const finalNews = news.slice(0, 15);

      if (finalNews.length > 0) {
        return finalNews;
      }

      // Fallback to Yahoo Finance Search
      console.log(`Fallback to Yahoo Search for ${symbol}...`);
      const yahooFinance = await this.getYahooClient();
      const result = await yahooFinance.search(companyName, { newsCount: 10 });
      return result.news || [];
    } catch (error) {
      console.error(`Failed to fetch news for ${symbol}:`, error);
      return [];
    }
  }

  async searchStocks(query: string) {
    if (!query) return [];

    try {
      // 1. Search Local DB (Prioritize "Starts With" then "Contains")
      // We fetch more to filter/sort manually if needed, but simple OR with startsWith is better
      const localResults = await this.prisma.stock.findMany({
        where: {
          OR: [
            { symbol: { startsWith: query, mode: 'insensitive' } },
            { companyName: { startsWith: query, mode: 'insensitive' } },
            { symbol: { contains: query, mode: 'insensitive' } },
            { companyName: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 10,
        orderBy: { marketCap: 'desc' }, // Prioritize bigger companies
      });

      // If we have enough local results, return them (especially for short queries)
      if (localResults.length >= 5) {
        return localResults;
      }

      // 2. Fallback/Augment with Yahoo Finance Search
      // Only if query length > 1 to avoid spamming "A", "B", "C"
      if (query.length >= 2) {
        const yahooFinance = await this.getYahooClient();
        console.log(`Searching Yahoo for: ${query}`);

        try {
          const remoteRes = await yahooFinance.search(query, {
            newsCount: 0,
            quotesCount: 10,
          });

          if (remoteRes.quotes && remoteRes.quotes.length > 0) {
            // Filter for Indian stocks ONLY (.NS or .BO)
            const indianStocks = remoteRes.quotes.filter(
              (q: any) =>
                (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')) &&
                q.isYahooFinance !== true, // Filter out non-tradable entities if needed
            );

            // Map to our format
            const remoteStocks = indianStocks.map((q: any) => ({
              symbol: q.symbol,
              companyName: q.shortname || q.longname || q.symbol,
              currentPrice: 0, // Placeholder
              exchange: q.exchange,
              lastUpdated: new Date(0), // Old date to force refresh if viewed
            }));

            // Merge: Local first, then Remote (excluding duplicates)
            const seen = new Set(localResults.map((s) => s.symbol));
            for (const rs of remoteStocks) {
              if (!seen.has(rs.symbol)) {
                localResults.push(rs);
                seen.add(rs.symbol);
              }
            }
          }
        } catch (yError) {
          console.error(`Yahoo search failed for ${query}`, yError);
        }
      }

      return localResults;
    } catch (error) {
      console.error(`Search failed for ${query}`, error);
      return [];
    }
  }

  async getTrending() {
    const symbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS'];
    try {
      const fyersSymbols = symbols.map(s => SymbolMapper.toFyers(s));
      const fyersQuotes = await this.fyersService.getQuotes(fyersSymbols);

      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const fyersSymbol = SymbolMapper.toFyers(symbol);
            const fyersQuote = fyersQuotes?.find((q: any) => q.n === fyersSymbol || q.s === fyersSymbol);

            // Check DB first for metadata preservation
            const dbStock = await this.prisma.stock.findUnique({
              where: { symbol },
            });

            if (fyersQuote) {
              const price = fyersQuote.lp || fyersQuote.v?.lp || 0;
              const changePercent = fyersQuote.chp || fyersQuote.v?.chp || 0;

              const dataToUpdate = {
                currentPrice: price,
                changePercent: changePercent,
                lastUpdated: new Date(),
              };

              return await this.prisma.stock.upsert({
                where: { symbol },
                update: dataToUpdate,
                create: {
                  symbol,
                  companyName: dbStock?.companyName || symbol,
                  exchange: 'NSE',
                  ...dataToUpdate,
                },
              });
            }

            // Fallback to Yahoo if Fyers quote is missing
            const yahooFinance = await this.getYahooClient();
            const data = await yahooFinance.quoteSummary(symbol, {
              modules: ['price', 'summaryDetail', 'defaultKeyStatistics'],
            });

            if (!data || !data.price) return dbStock || null;

            const price = data.price.regularMarketPrice;
            const changePercent = (data.price.regularMarketChangePercent || 0) * 100;

            const dataToUpdate = {
              currentPrice: price,
              changePercent: changePercent,
              marketCap: data.summaryDetail?.marketCap,
              peRatio: data.summaryDetail?.trailingPE,
              pbRatio: data.defaultKeyStatistics?.priceToBook,
              high52Week: data.summaryDetail?.fiftyTwoWeekHigh,
              low52Week: data.summaryDetail?.fiftyTwoWeekLow,
              lastUpdated: new Date(),
            };

            return await this.prisma.stock.upsert({
              where: { symbol },
              update: dataToUpdate,
              create: {
                symbol,
                companyName: data.price.shortName || symbol,
                exchange: data.price.exchangeName || 'NSE',
                ...dataToUpdate,
              },
            });
          } catch (e) {
            console.error(`Error fetching ${symbol}`, e);
            return null;
          }
        }),
      );

      return results.filter((r) => r !== null);
    } catch (error) {
      console.error('Failed to get trending stocks', error);
      return [];
    }
  }
  async getIndices() {
    try {
      // Use findOne to leverage DB caching + auto-update logic
      let nifty = await this.findOne('NIFTY 50');
      let sensex = await this.findOne('SENSEX');
      let banknifty = await this.findOne('NIFTY BANK');

      // CRITICAL FALLBACK: If DB is empty AND Yahoo fails, return static data
      if (!nifty) nifty = { symbol: 'NIFTY 50', currentPrice: 25700, changePercent: 0 } as any;
      if (!sensex) sensex = { symbol: 'SENSEX', currentPrice: 82800, changePercent: 0 } as any;
      if (!banknifty) banknifty = { symbol: 'NIFTY BANK', currentPrice: 53000, changePercent: 0 } as any;

      const results = [nifty, sensex, banknifty];

      // Transform to match frontend expectation
      return results.map((index: any) => {
        let symbol = index.symbol;
        if (symbol === '^NSEI' || symbol === 'NIFTY 50') symbol = 'NIFTY 50';
        if (symbol === '^BSESN' || symbol === 'SENSEX') symbol = 'SENSEX';
        if (symbol === '^NSEBANK' || symbol === 'NIFTY BANK' || symbol === 'NSEBANK') symbol = 'NIFTY BANK';

        return {
          symbol,
          price: index.currentPrice || 0,
          change: index.change || 0,
          changePercent: index.changePercent || 0,
        };
      });
    } catch (error) {
      console.error('Failed to get indices', error);
      return [];
    }
  }

  async getHistory(symbol: string, range: '1d' | '1w' | '1mo' | '3mo' | '1y' = '1mo') {
    try {
      const yahooFinance = await this.getYahooClient();

      let querySymbol = symbol;
      if (symbol === 'NIFTY 50') querySymbol = '^NSEI';
      if (symbol === 'SENSEX') querySymbol = '^BSESN';

      // Ensure .NS suffix for Indian stocks if not an index or already suffixed
      const lookupSymbol =
        querySymbol.endsWith('.NS') ||
          querySymbol.endsWith('.BO') ||
          querySymbol.startsWith('^')
          ? querySymbol
          : `${querySymbol.toUpperCase()}.NS`;

      const queryOptions: any = {};

      const now = new Date();
      const fromDate = new Date();

      switch (range) {
        case '1d':
          // Attempt Fyers for high-resolution intraday (1 min)
          const fyersSymbol1d = SymbolMapper.toFyers(symbol);
          const today1d = new Date().toISOString().split('T')[0];
          const yesterday1d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const fyersHistory1d = await this.fyersService.getHistory(fyersSymbol1d, '1', yesterday1d, today1d);

          if (fyersHistory1d && fyersHistory1d.length > 0) {
            console.log(`[History] Using Fyers (1m) for ${symbol} 1d view. Points: ${fyersHistory1d.length}`);
            // Fyers returns array: [timestamp, open, high, low, close, volume]
            return fyersHistory1d.map((c: any) => ({
              date: new Date(c[0] * 1000).toISOString(),
              price: c[4], // close
              open: c[1],
              high: c[2],
              low: c[3],
              volume: c[5]
            }));
          }

          // Fallback to Yahoo 15m (Standard)
          fromDate.setDate(now.getDate() - 7);
          queryOptions.interval = '15m';
          break;
        case '1w':
          // Fyers 5-min resolution for 1 week
          const fyersSymbol1w = SymbolMapper.toFyers(symbol);
          const today1w = new Date().toISOString().split('T')[0];
          const weekAgo1w = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const fyersHistory1w = await this.fyersService.getHistory(fyersSymbol1w, '5', weekAgo1w, today1w);

          if (fyersHistory1w && fyersHistory1w.length > 0) {
            console.log(`[History] Using Fyers (5m) for ${symbol} 1w view. Points: ${fyersHistory1w.length}`);
            // Fyers returns array: [timestamp, open, high, low, close, volume]
            return fyersHistory1w.map((c: any) => ({
              date: new Date(c[0] * 1000).toISOString(),
              price: c[4], // close
              open: c[1],
              high: c[2],
              low: c[3],
              volume: c[5]
            }));
          }

          // Fallback to Yahoo 1h
          fromDate.setDate(now.getDate() - 7);
          queryOptions.interval = '1h';
          break;
        case '1mo':
          fromDate.setMonth(now.getMonth() - 1);
          queryOptions.interval = '1d';
          break;
        case '3mo':
          fromDate.setMonth(now.getMonth() - 3);
          queryOptions.interval = '1d';
          break;
        case '1y':
          fromDate.setFullYear(now.getFullYear() - 1);
          queryOptions.interval = '1d';
          break;
      }

      // Use timestamps for robustness
      queryOptions.period1 = Math.floor(fromDate.getTime() / 1000);
      queryOptions.period2 = Math.floor(now.getTime() / 1000);

      console.log(`[History] Fetching ${lookupSymbol} ${range}`, queryOptions);

      // Add 10s timeout to prevent hanging
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 10000),
      );
      const fetchPromise = yahooFinance.chart(lookupSymbol, queryOptions);

      const result = await Promise.race([fetchPromise, timeout]);

      let finalResult = result.quotes || [];

      // Fail-safe: If 1d intraday returned nothing (common on weekends/holidays for free API), fetch daily
      if (range === '1d' && (!result || result.length === 0)) {
        console.log('Intraday empty, fetching daily fallback for 1d view');
        const fallbackOptions = {
          ...queryOptions,
          interval: '1d',
          period1: Math.floor(
            new Date().setDate(new Date().getDate() - 30) / 1000,
          ),
        };
        const fallbackResult = await yahooFinance.chart(
          lookupSymbol,
          fallbackOptions,
        );
        if (
          fallbackResult &&
          fallbackResult.quotes &&
          fallbackResult.quotes.length > 0
        ) {
          finalResult = fallbackResult.quotes.slice(-5); // Show last 5 daily candles
        }
      }

      // Filter for 1d: Keep only the LAST trading session's data
      if (range === '1d' && result && result.length > 0) {
        const lastDate = new Date(result[result.length - 1].date);
        const lastDateStr = lastDate.toDateString();
        finalResult = result.filter(
          (q: any) => new Date(q.date).toDateString() === lastDateStr,
        );

        if (finalResult.length === 0) {
          // Fallback to last ~25 points if date matching failed
          finalResult = result.slice(-25);
        }
      }

      // Format for frontend
      return finalResult.map((quote: any) => ({
        date: quote.date.toISOString(),
        price: quote.close,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
      }));
    } catch (error) {
      console.error(`Failed to fetch history for ${symbol}:`, error);
      return [];
    }
  }

  async toggleWatchlist(userId: string, symbol: string) {
    const existing = await this.prisma.watchlist.findUnique({
      where: {
        userId_stockSymbol: {
          userId,
          stockSymbol: symbol,
        },
      },
    });

    if (existing) {
      await this.prisma.watchlist.delete({
        where: {
          userId_stockSymbol: {
            userId,
            stockSymbol: symbol,
          },
        },
      });
      return { watching: false };
    } else {
      await this.prisma.watchlist.create({
        data: {
          userId,
          stockSymbol: symbol,
        },
      });
      return { watching: true };
    }
  }

  async getWatchlist(userId: string) {
    const watchlist = await this.prisma.watchlist.findMany({
      where: { userId },
      include: {
        stock: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Check freshness of watched stocks
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const staleStocks = watchlist.filter(
      (w) => w.stock.lastUpdated < fifteenMinutesAgo,
    );

    if (staleStocks.length > 0) {
      // Fire and forget refresh for better UX speed, or await if critical
      // We'll await for now to ensure user sees fresh data on dashboard load
      await Promise.all(staleStocks.map((w) => this.findOne(w.stockSymbol)));

      // Re-fetch to get updated values
      return this.prisma.watchlist.findMany({
        where: { userId },
        include: { stock: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return watchlist;
  }

  async getTechnicalAnalysis(symbol: string) {
    try {
      const yahooFinance = await this.getYahooClient();
      const lookupSymbol =
        symbol.includes('.') || symbol.startsWith('^')
          ? symbol
          : `${symbol}.NS`;

      const queryOptions = {
        period1: Math.floor((Date.now() - 35 * 24 * 60 * 60 * 1000) / 1000), // 35 days for RSI/SMA
        interval: '1d' as any,
      };

      const result = await yahooFinance.chart(lookupSymbol, queryOptions);
      const quotes = result.quotes || [];
      const closePrices = quotes
        .map((q: any) => q.close)
        .filter((p: any) => p != null);

      const signals = calculateTechnicalSignals(closePrices);
      return {
        ...signals,
        syntheticRationale: generateSyntheticRationale(signals, symbol),
      };
    } catch (e) {
      console.error(`Technical Analysis failed for ${symbol}`, e);
      return calculateTechnicalSignals([]);
    }
  }

  private async getYahooFundamentals(symbol: string) {
    const yf = await this.getYahooClient();
    let querySymbol = symbol;
    if (!symbol.includes('.') && !symbol.startsWith('^')) {
      querySymbol = `${symbol}.NS`;
    }

    try {
      // yahoo-finance2 v3 API: type is 'annual'|'quarterly'|'trailing', module is 'financials'|'balance-sheet'|'cash-flow'|'all'
      const res = await yf.fundamentalsTimeSeries(querySymbol, {
        period1: '2021-01-01',
        type: 'annual',
        module: 'all',
      });

      // V3 returns an array of objects, each representing a period with key-value pairs
      // e.g. { date: 1234567890, TYPE: 'FINANCIALS', periodType: '12M', totalRevenue: 123456, netIncome: 78900, ... }
      if (!Array.isArray(res) || res.length === 0) {
        console.log(`[TimeSeries] ${symbol}: No data returned`);
        return null;
      }

      // Sort by date descending (latest first)
      const sorted = [...res].sort((a: any, b: any) => {
        const dateA = a.date instanceof Date ? a.date.getTime() : (typeof a.date === 'number' ? a.date * 1000 : new Date(a.date).getTime());
        const dateB = b.date instanceof Date ? b.date.getTime() : (typeof b.date === 'number' ? b.date * 1000 : new Date(b.date).getTime());
        return dateB - dateA;
      });

      // Build multi-year data: { fieldName: [{ date, value }, ...] } and latest: { fieldName: { raw: value } }
      const multiYear: any = {};
      const latestData: any = {};

      // Get all unique field names (excluding metadata keys)
      const metaKeys = new Set(['date', 'TYPE', 'periodType']);
      const allFieldKeys = new Set<string>();
      sorted.forEach((period: any) => {
        Object.keys(period).forEach(k => {
          if (!metaKeys.has(k) && period[k] !== null && period[k] !== undefined) {
            allFieldKeys.add(k);
          }
        });
      });

      // For each field, build the time series
      for (const key of allFieldKeys) {
        const values: any[] = [];
        for (const period of sorted) {
          if (period[key] !== null && period[key] !== undefined) {
            const dateVal = period.date instanceof Date
              ? period.date.toISOString().split('T')[0]
              : (typeof period.date === 'number' ? new Date(period.date * 1000).toISOString().split('T')[0] : period.date);
            values.push({ date: dateVal, value: period[key] });
          }
        }
        if (values.length > 0) {
          multiYear[key] = values;
          latestData[key] = { raw: values[0].value };
        }
      }

      console.log(`[TimeSeries] ${symbol}: ${Object.keys(latestData).length} fields - ${Object.keys(latestData).slice(0, 8).join(', ')}...`);
      return { latest: latestData, multiYear };
    } catch (e) {
      console.warn(`[TimeSeries] ${symbol} failed: ${(e as any).message?.substring(0, 120)}`);
      // Graceful degradation — return null, the calculation engine will use financialData fallbacks
    }
    return null;
  }

  // Fundamental Calculation Engine — Institutional-Grade
  private calculateFundamentals(summary: any, symbol: string, timeSeriesResult?: any) {
    const quote = summary.price || {};
    const financialData = summary.financialData || {};
    const defaultStats = summary.defaultKeyStatistics || {};
    const summaryDetail = summary.summaryDetail || {};

    // --- Helper: extract numeric value from Yahoo's various formats ---
    const gv = (obj: any, keys: string | string[]): number | null => {
      if (!obj) return null;
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        const val = obj[key];
        if (val === null || val === undefined) continue;
        if (typeof val === 'number') return val;
        if (val.raw !== undefined && val.raw !== null) return val.raw;
      }
      return null;
    };
    // Non-zero variant: Yahoo returns 0 for "data not available" in Indian income statements
    // Fields like ebit, grossProfit, costOfRevenue should NEVER be 0 for a real company
    const gvNZ = (obj: any, keys: string | string[]): number | null => {
      const v = gv(obj, keys);
      return (v !== null && v !== 0) ? v : null;
    };

    // --- Helper: get value from multi-year timeseries ---
    const tsLatest = timeSeriesResult?.latest || {};
    const tsMulti = timeSeriesResult?.multiYear || {};

    const tsVal = (key: string, yearIndex = 0): number | null => {
      // From multi-year data
      const arr = tsMulti[key];
      if (arr && arr.length > yearIndex) {
        const v = arr[yearIndex]?.value;
        if (v !== null && v !== undefined) return v;
      }
      // Fallback to latest flat data
      if (yearIndex === 0) {
        const flat = tsLatest[key];
        if (flat?.raw !== undefined && flat.raw !== null) return flat.raw;
      }
      return null;
    };

    // 1. Fetch Latest Statements (Prefer TimeSeries > Annual > Quarterly)
    const incomeHistory = summary.incomeStatementHistory?.incomeStatementHistory
      || summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const latestIncome = incomeHistory[0] || {};
    const prevIncome = incomeHistory[1] || {};

    const balanceHistory = summary.balanceSheetHistory?.balanceSheetStatements
      || summary.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
    const latestBalance = balanceHistory[0] || {};
    const prevBalance = balanceHistory[1] || {};

    const cashflowHistory = summary.cashflowStatementHistory?.cashflowStatements
      || summary.cashflowStatementHistoryQuarterly?.cashflowStatements || [];
    const latestCashflow = cashflowHistory[0] || {};

    // ===================== 2. EXTRACT BASE METRICS =====================
    // Income Statement
    const netIncome = tsVal('netIncome') ?? gv(latestIncome, ['netIncome', 'netIncomeApplicableToCommonShares']);
    const prevNetIncome = tsVal('netIncome', 1) ?? gv(prevIncome, ['netIncome', 'netIncomeApplicableToCommonShares']);
    const revenue = tsVal('totalRevenue') ?? gv(latestIncome, ['totalRevenue', 'revenue']) ?? gv(financialData, 'totalRevenue');
    const prevRevenue = tsVal('totalRevenue', 1) ?? gv(prevIncome, ['totalRevenue', 'revenue']);
    const costOfRevenue = tsVal('costOfRevenue') ?? gvNZ(latestIncome, ['costOfRevenue']);
    const grossProfit = tsVal('grossProfit') ?? gvNZ(latestIncome, ['grossProfit']);
    const ebit = tsVal('ebit') ?? tsVal('operatingIncome') ?? gvNZ(latestIncome, ['ebit', 'operatingIncome']);
    const interestExpense = tsVal('interestExpense') ?? gv(latestIncome, ['interestExpense']);
    const depreciation = tsVal('depreciationAndAmortization') ?? gvNZ(latestIncome, ['depreciation']);
    const preferredDividends = 0; // Rarely available, default 0

    // EBITDA
    const yahooEbitda = gv(financialData, ['ebitda']);
    const calcEbitdaFromEbit = (ebit !== null && depreciation !== null) ? (ebit + depreciation) : null;
    const ebitda = yahooEbitda ?? calcEbitdaFromEbit ?? ebit;

    // Balance Sheet
    const shareholderEquity = tsVal('stockholdersEquity') ?? tsVal('totalEquityGrossMinorityInterest') ?? gv(latestBalance, ['totalStockholderEquity', 'totalStockholdersEquity', 'stockholdersEquity']);
    const prevEquity = tsVal('stockholdersEquity', 1) ?? tsVal('totalEquityGrossMinorityInterest', 1) ?? gv(prevBalance, ['totalStockholderEquity', 'totalStockholdersEquity', 'stockholdersEquity']);
    const totalAssets = tsVal('totalAssets') ?? gv(latestBalance, ['totalAssets']);
    const prevTotalAssets = tsVal('totalAssets', 1) ?? gv(prevBalance, ['totalAssets']);
    const currentLiabilities = tsVal('totalCurrentLiabilities') ?? gv(latestBalance, ['totalCurrentLiabilities']);
    const currentAssets = tsVal('totalCurrentAssets') ?? gv(latestBalance, ['totalCurrentAssets']);
    const inventory = tsVal('inventory') ?? gv(latestBalance, ['inventory']);
    const totalLiabilities = tsVal('totalLiabilitiesNetMinorityInterest') ?? gv(latestBalance, ['totalLiab', 'totalLiabilities']);
    const totalDebt = tsVal('totalDebt') ?? gv(financialData, ['totalDebt']);
    const totalCash = tsVal('cashAndCashEquivalents') ?? gv(financialData, ['totalCash']);

    // Shares
    const sharesOutstanding = tsVal('ordinarySharesNumber') ?? gv(defaultStats, ['sharesOutstanding']);

    // Cash Flow
    const operatingCashFlow = tsVal('operatingCashFlow') ?? gv(latestCashflow, ['totalCashFromOperatingActivities']) ?? gv(financialData, ['operatingCashflow']);
    const capitalExpenditure = (() => {
      const raw = tsVal('capitalExpenditure') ?? gv(latestCashflow, ['capitalExpenditures']);
      return raw !== null ? Math.abs(raw) : null;
    })();

    // Price / Market Data
    const marketCap = gv(summaryDetail, ['marketCap']) ?? gv(quote, ['marketCap']);
    const currentPrice = gv(quote, ['regularMarketPrice']);

    // Average Equity/Assets for institutional-grade ROE/ROA
    const avgEquity = (shareholderEquity !== null && prevEquity !== null) ? (shareholderEquity + prevEquity) / 2 : shareholderEquity;
    const avgAssets = (totalAssets !== null && prevTotalAssets !== null) ? (totalAssets + prevTotalAssets) / 2 : totalAssets;

    console.log(`${symbol} CALC - Revenue: ${revenue}, NetIncome: ${netIncome}, EBIT: ${ebit}, EBITDA: ${ebitda}`);
    console.log(`${symbol} CALC - Equity: ${shareholderEquity}, AvgEquity: ${avgEquity}, Assets: ${totalAssets}, Shares: ${sharesOutstanding}`);
    console.log(`${symbol} CALC - OCF: ${operatingCashFlow}, CapEx: ${capitalExpenditure}, TotalDebt: ${totalDebt}, Cash: ${totalCash}`);

    // ===================== 3. PROFITABILITY RATIOS =====================
    // ROE = Net Income / Average Equity × 100
    const calcRoe = (netIncome !== null && avgEquity !== null && avgEquity !== 0) ? (netIncome / avgEquity) : null;
    // Tier 2: Yahoo financialData
    // Tier 3: Compute from defaultKeyStatistics: netIncomeToCommon / (shares × bookValue)
    const nltc = gv(defaultStats, 'netIncomeToCommon');
    const bkVal = gv(defaultStats, 'bookValue');
    const calcRoeFromStats = (nltc !== null && sharesOutstanding !== null && bkVal !== null && sharesOutstanding > 0 && bkVal > 0)
      ? (nltc / (sharesOutstanding * bkVal)) : null;
    const finalRoe = calcRoe ?? gv(financialData, 'returnOnEquity') ?? calcRoeFromStats;

    // ROA = Net Income / Average Total Assets × 100
    const calcRoa = (netIncome !== null && avgAssets !== null && avgAssets !== 0) ? (netIncome / avgAssets) : null;
    const finalRoa = calcRoa ?? gv(financialData, 'returnOnAssets');

    // ROCE = EBIT / Capital Employed
    const capitalEmployed = (totalAssets !== null && currentLiabilities !== null) ? (totalAssets - currentLiabilities) : null;
    const calcRoce = (ebit !== null && capitalEmployed !== null && capitalEmployed > 0) ? (ebit / capitalEmployed) : null;
    // Tier 2: Approximate ROCE from operating margin × totalRev / approximate capital employed
    const yahooOpm = gv(financialData, 'operatingMargins');
    const yahooRev = gv(financialData, 'totalRevenue');
    const approxEbit = (yahooOpm !== null && yahooRev !== null) ? (yahooOpm * yahooRev) : null;
    const yahooEV = gv(defaultStats, 'enterpriseValue');
    // Capital employed ≈ Enterprise Value - Net Debt + Equity, approx as EV since data is limited
    const calcRoceFromFd = (approxEbit !== null && yahooEV !== null && yahooEV > 0) ? (approxEbit / yahooEV) : null;
    const finalRoce = calcRoce ?? calcRoceFromFd;

    // Net Profit Margin = Net Income / Revenue
    const calcProfitMargin = (netIncome !== null && revenue !== null && revenue !== 0) ? (netIncome / revenue) : null;
    const finalProfitMargin = calcProfitMargin ?? gv(financialData, 'profitMargins');

    // Operating Margin = EBIT / Revenue
    const calcOperatingMargin = (ebit !== null && revenue !== null && revenue !== 0) ? (ebit / revenue) : null;
    const finalOperatingMargin = calcOperatingMargin ?? gv(financialData, 'operatingMargins');

    // Gross Margin = (Revenue - COGS) / Revenue  OR  Gross Profit / Revenue
    const calcGrossMargin = (() => {
      if (grossProfit !== null && revenue !== null && revenue !== 0) return grossProfit / revenue;
      if (costOfRevenue !== null && revenue !== null && revenue !== 0) return (revenue - costOfRevenue) / revenue;
      return null;
    })();
    const finalGrossMargin = calcGrossMargin ?? gv(financialData, ['grossMargins']);

    // ===================== 4. VALUATION RATIOS =====================
    // EPS = (Net Income - Preferred Dividends) / Total Outstanding Shares
    const calcEps = (netIncome !== null && sharesOutstanding !== null && sharesOutstanding > 0)
      ? ((netIncome - preferredDividends) / sharesOutstanding) : null;
    // Yahoo has pre-computed EPS in defaultKeyStatistics
    const finalEps = calcEps ?? gv(defaultStats, 'trailingEps');

    const prevEps = (prevNetIncome !== null && sharesOutstanding !== null && sharesOutstanding > 0)
      ? ((prevNetIncome - preferredDividends) / sharesOutstanding) : null;

    // P/E = Current Share Price / EPS
    const calcPe = (currentPrice !== null && finalEps !== null && finalEps > 0) ? (currentPrice / finalEps) : (gv(summaryDetail, 'trailingPE'));

    // Book Value = Total Assets - Total Liabilities
    const bookValue = (totalAssets !== null && totalLiabilities !== null) ? (totalAssets - totalLiabilities) : null;

    // BVPS = Total Equity / Shares Outstanding (fallback to Yahoo's bookValue)
    const calcBvps = (shareholderEquity !== null && sharesOutstanding !== null && sharesOutstanding > 0) ? (shareholderEquity / sharesOutstanding) : null;
    const bvps = calcBvps ?? gv(defaultStats, 'bookValue');

    // P/B = Price / BVPS
    const calcPb = (currentPrice !== null && bvps !== null && bvps > 0) ? (currentPrice / bvps) : (gv(defaultStats, 'priceToBook'));

    // Enterprise Value = Market Cap + Total Debt - Cash (prefer Yahoo's pre-computed)
    const yahooEVFromStats = gv(defaultStats, 'enterpriseValue');
    const enterpriseValue = (marketCap !== null && totalDebt !== null && totalCash !== null)
      ? (marketCap + totalDebt - totalCash) : (yahooEVFromStats ?? null);

    // EV/EBITDA (also available as enterpriseToEbitda from Yahoo)
    const calcEvEbitda = (enterpriseValue !== null && ebitda !== null && ebitda !== 0) ? (enterpriseValue / ebitda) : null;
    const finalEvEbitda = calcEvEbitda ?? gv(defaultStats, 'enterpriseToEbitda');

    // ===================== 5. FINANCIAL STRENGTH =====================
    // D/E = Total Debt / Total Equity
    const calcDebtToEquity = (totalDebt !== null && shareholderEquity !== null && shareholderEquity !== 0)
      ? (totalDebt / shareholderEquity) : null;
    const finalDebtToEquity = calcDebtToEquity ?? gv(financialData, 'debtToEquity');

    // Current Ratio = Current Assets / Current Liabilities
    const calcCurrentRatio = (currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0)
      ? (currentAssets / currentLiabilities) : null;
    const finalCurrentRatio = calcCurrentRatio ?? gv(financialData, 'currentRatio');

    // Quick Ratio = (Current Assets - Inventory) / Current Liabilities
    const calcQuickRatio = (() => {
      if (currentAssets !== null && inventory !== null && currentLiabilities !== null && currentLiabilities !== 0) {
        return (currentAssets - inventory) / currentLiabilities;
      }
      return null;
    })();
    const finalQuickRatio = calcQuickRatio ?? gv(financialData, 'quickRatio');

    // Interest Coverage = EBIT / Interest Expense
    const calcIcr = (ebit !== null && interestExpense !== null && interestExpense !== 0) ? (ebit / Math.abs(interestExpense)) : null;

    // ===================== 6. GROWTH METRICS =====================
    const safeGrowth = (current: number | null, previous: number | null): number | null => {
      if (current === null || previous === null || previous === 0) return null;
      return (current - previous) / Math.abs(previous);
    };

    // Revenue Growth (YoY)
    const calcRevenueGrowth = safeGrowth(revenue, prevRevenue);
    const finalRevenueGrowth = calcRevenueGrowth ?? gv(financialData, 'revenueGrowth');

    // Earnings Growth (YoY)
    const calcEarningsGrowth = safeGrowth(netIncome, prevNetIncome);
    const finalEarningsGrowth = calcEarningsGrowth ?? gv(financialData, 'earningsGrowth');

    // EPS Growth
    const calcEpsGrowth = safeGrowth(calcEps, prevEps);

    // 3-Year Revenue CAGR
    const calcRevenueCagr = (() => {
      const revenueArr = tsMulti['totalRevenue'];
      if (revenueArr && revenueArr.length >= 3) {
        const latest = revenueArr[0]?.value;
        const oldest = revenueArr[revenueArr.length - 1]?.value;
        const n = revenueArr.length - 1;
        if (latest > 0 && oldest > 0 && n > 0) {
          return Math.pow(latest / oldest, 1 / n) - 1;
        }
      }
      return null;
    })();

    // ===================== 7. CASH FLOW METRICS =====================
    // FCF = Operating Cash Flow - CapEx
    const calcFcf = (operatingCashFlow !== null && capitalExpenditure !== null) ? (operatingCashFlow - capitalExpenditure) : null;
    const finalFcf = calcFcf ?? gv(financialData, 'freeCashflow');
    const finalOcf = operatingCashFlow ?? gv(financialData, 'operatingCashflow');

    // FCF Margin = FCF / Revenue
    const calcFcfMargin = (finalFcf !== null && revenue !== null && revenue !== 0) ? (finalFcf / revenue) : null;

    // Cash Flow to Debt = OCF / Total Debt
    const calcCashFlowToDebt = (finalOcf !== null && totalDebt !== null && totalDebt !== 0) ? (finalOcf / totalDebt) : null;

    // OCF Ratio = Operating Cash Flow / Current Liabilities
    const calcOcfRatio = (finalOcf !== null && currentLiabilities !== null && currentLiabilities !== 0) ? (finalOcf / currentLiabilities) : null;

    // ===================== 8. ADVANCED VALUATION =====================
    // PEG = PE / EPS Growth (use % form)
    const pe = calcPe;
    const epsGrowthPct = calcEpsGrowth !== null ? (calcEpsGrowth * 100) : null;
    const calcPeg = (pe !== null && epsGrowthPct !== null && epsGrowthPct > 0) ? (pe / epsGrowthPct) : null;

    // Graham Number = sqrt(22.5 × EPS × BVPS)
    const calcGraham = (finalEps !== null && bvps !== null && finalEps > 0 && bvps > 0) ? Math.sqrt(22.5 * finalEps * bvps) : null;

    // Intrinsic Value (Simple DCF) — 10-year projection with 10% discount rate
    const calcIntrinsicValue = (() => {
      const fcfForDcf = finalFcf;
      if (fcfForDcf === null || fcfForDcf <= 0 || sharesOutstanding === null || sharesOutstanding <= 0) return null;
      const growthRate = finalRevenueGrowth ?? 0.08; // Default 8% growth
      const discountRate = 0.10;
      let totalPV = 0;
      for (let year = 1; year <= 10; year++) {
        const futureCF = fcfForDcf * Math.pow(1 + growthRate, year);
        totalPV += futureCF / Math.pow(1 + discountRate, year);
      }
      // Terminal value (Gordon Growth, 3% terminal growth)
      const terminalCF = fcfForDcf * Math.pow(1 + growthRate, 10) * (1 + 0.03);
      const terminalValue = terminalCF / (discountRate - 0.03);
      const pvTerminal = terminalValue / Math.pow(1 + discountRate, 10);
      return (totalPV + pvTerminal) / sharesOutstanding;
    })();

    console.log(`${symbol} FINAL - ROE: ${finalRoe}, ROA: ${finalRoa}, ROCE: ${calcRoce}, GM: ${finalGrossMargin}`);
    console.log(`${symbol} FINAL - EPS: ${finalEps}, PE: ${calcPe}, PB: ${calcPb}, EV: ${enterpriseValue}`);
    console.log(`${symbol} FINAL - FCF: ${finalFcf}, OCF: ${finalOcf}, CashFlowToDebt: ${calcCashFlowToDebt}`);

    // ===================== RETURN ALL COMPUTED METRICS =====================
    return {
      // Profitability — use finalXxx which fallback to financialData when statements are empty
      returnOnEquity: finalRoe,
      returnOnAssets: finalRoa,
      returnOnCapitalEmployed: finalRoce,
      profitMargins: finalProfitMargin,
      operatingMargins: finalOperatingMargin,
      grossMargin: finalGrossMargin,

      // Valuation
      pe: calcPe,
      pb: calcPb,
      eps: finalEps,
      bookValuePerShare: bvps,
      evEbitda: finalEvEbitda,
      enterpriseValue: enterpriseValue,
      ebitda: ebitda,

      // Financial Strength
      totalDebt: totalDebt,
      currentRatio: finalCurrentRatio,
      quickRatio: finalQuickRatio,
      debtToEquity: finalDebtToEquity,
      interestCoverageRatio: calcIcr,

      // Growth
      revenueGrowth: finalRevenueGrowth,
      earningsGrowth: finalEarningsGrowth,
      epsGrowth: calcEpsGrowth,

      // Cash Flow
      operatingCashFlow: finalOcf,
      capitalExpenditure: capitalExpenditure,
      freeCashflow: finalFcf,
      fcfMargin: calcFcfMargin,
      cashFlowToDebt: calcCashFlowToDebt,
      ocfRatio: calcOcfRatio,

      // Advanced
      pegRatio: calcPeg,
      grahamNumber: calcGraham,
      intrinsicValue: calcIntrinsicValue,
    };
  }

  // Helper to safely get a numeric value, preferring first non-null
  private getValueSafe(...values: any[]): number | null {
    for (const v of values) {
      if (v !== null && v !== undefined && typeof v === 'number' && !isNaN(v)) return v;
    }
    return null;
  }
}
