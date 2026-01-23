import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StocksService {
  private yahooFinance: any = null;

  constructor(private prisma: PrismaService) { }

  private async getYahooClient() {
    if (this.yahooFinance) return this.yahooFinance;

    try {
      const pkg = await import('yahoo-finance2');
      const YahooFinanceClass = pkg.default as any;

      this.yahooFinance = new YahooFinanceClass({
        validation: { logErrors: false },
        // Try to suppress notices if supported
      });
    } catch (e) {
      console.error('Failed to initialize YahooFinance client', e);
      // Fallback or retry?
      throw e;
    }
    return this.yahooFinance;
  }


  async findOne(symbol: string) {
    // Alias for branded name "Eternal" -> "ZOMATO.NS"
    if (symbol === 'ETERNAL') symbol = 'ZOMATO.NS';

    let stock = await this.prisma.stock.findUnique({
      where: { symbol },
      include: { investorStocks: { include: { investor: true } } }
    });

    // If not found and no suffix, try appending .NS (common for Indian stocks)
    if (!stock && !symbol.includes('.') && !symbol.startsWith('^')) {
      const stockNS = await this.prisma.stock.findUnique({
        where: { symbol: `${symbol}.NS` },
        include: { investorStocks: { include: { investor: true } } }
      });
      if (stockNS) {
        stock = stockNS;
        // Optionally update the original symbol to match found stock? 
        // For now, just return the data. The frontend works with what's returned.
        symbol = stock.symbol;
      }
    }

    // Check if data is stale (older than 15 mins)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000); // Fixed to 15 mins

    if (!stock || stock.lastUpdated < fifteenMinutesAgo || stock.currentPrice === 0) {
      try {
        console.log(`Fetching live data for ${symbol}...`);

        console.log(`Fetching live data for ${symbol}...`);

        const yahooFinance = await this.getYahooClient();

        // Map safe-display names to Yahoo symbols if needed
        let querySymbol = symbol;
        if (symbol === 'NIFTY 50') querySymbol = '^NSEI';
        if (symbol === 'SENSEX') querySymbol = '^BSESN';

        let result;

        // Logic to handle suffixes or default to NSE, then BSE
        const hasSuffix = querySymbol.includes('.') || querySymbol.startsWith('^');

        // Indices (starting with ^) often lack financial data/stats, so we request fewer modules
        const isIndex = querySymbol.startsWith('^');
        const modules = isIndex
          ? ['price', 'summaryDetail']
          : ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'summaryProfile'];

        if (hasSuffix) {
          result = await yahooFinance.quoteSummary(querySymbol, { modules }) as any;
        } else {
          // Try NSE first
          try {
            result = await yahooFinance.quoteSummary(`${querySymbol}.NS`, { modules }) as any;
          } catch (e) {
            console.log(`NSE fetch failed for ${querySymbol}, trying BSE...`);
            // Try BSE
            // Try BSE
            result = await yahooFinance.quoteSummary(`${querySymbol}.BO`, { modules }) as any;
          }
        }

        const price = result.price?.regularMarketPrice;
        const previousClose = result.price?.regularMarketPreviousClose;
        const effectivePrice = price || previousClose;

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

        const dataToUpdate = {
          currentPrice: effectivePrice,
          changePercent: changes !== undefined ? changes * 100 : 0,
          marketCap: marketCap,
          peRatio: pe,
          pbRatio: pb,
          high52Week: high52,
          low52Week: low52,
          // New Fields
          bookValue: bookValue || 0,
          dividendYield: divYield || 0,
          returnOnEquity: roe || 0,
          returnOnAssets: roa || 0,
          totalDebt: totalDebt || 0,
          totalRevenue: totalRevenue || 0,
          profitMargins: profitMargins || 0,
          operatingMargins: operatingMargins || 0,
          // Advanced
          description: description || null,
          sector: result.summaryProfile?.sector || null,
          currentRatio: currentRatio || 0,
          debtToEquity: debtToEquity || 0,
          freeCashflow: freeCashflow || 0,
          earningsGrowth: earningsGrowth || 0,
          revenueGrowth: revenueGrowth || 0,
          ebitda: ebitda || 0,
          quickRatio: quickRatio || 0,

          lastUpdated: new Date()
        };

        const updatedStock = await this.prisma.stock.upsert({
          where: { symbol },
          update: dataToUpdate,
          create: {
            symbol: symbol,
            companyName: result.price?.shortName || symbol,
            exchange: result.price?.exchangeName || (symbol.includes('.BO') ? 'BSE' : 'NSE'),
            ...dataToUpdate
          },
          include: { investorStocks: { include: { investor: true } } }
        });
        return updatedStock;

      } catch (error) {
        console.error(`Failed to fetch data for ${symbol}:`, error);
        if (stock) return stock; // Return stale data if fetch fails
        // If we have no data and fetch failed, throw not found
        // throw new NotFoundException(`Stock ${symbol} not found`);
      }
    }

    return stock;
  }

  async getBatch(symbols: string[]) {
    if (!symbols || symbols.length === 0) return [];

    // Concurrently fetch/update each symbol using the existing robust findOne logic
    const promises = symbols.map(symbol => this.findOne(symbol));
    const results = await Promise.all(promises);

    // Filter out nulls/undefined if any
    return results.filter(s => s !== null && s !== undefined);
  }

  async getPeers(symbol: string) {
    const formattedSymbol = symbol.toUpperCase();
    const stock = await this.prisma.stock.findUnique({
      where: { symbol: formattedSymbol },
      select: { sector: true }
    });

    if (!stock || !stock.sector) {
      return [];
    }

    return this.prisma.stock.findMany({
      where: {
        sector: stock.sector,
        symbol: { not: formattedSymbol }
      },
      take: 4,
      orderBy: { marketCap: 'desc' }
    });
  }

  // Cache simple in-memory for demo (use Redis in prod)
  private earningsCache: any = null;
  private lastEarningsFetch: number = 0;

  async getEarningsCalendar() {
    // Return cached if fresh (< 6 hours)
    const now = Date.now();
    if (this.earningsCache && (now - this.lastEarningsFetch < 6 * 60 * 60 * 1000)) {
      return this.earningsCache;
    }

    const popularTickers = [
      // NIFTY 50
      'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS', 'BHARTIARTL.NS',
      'ITC.NS', 'SBIN.NS', 'LICI.NS', 'HINDUNILVR.NS', 'LT.NS', 'BAJFINANCE.NS',
      'HCLTECH.NS', 'MARUTI.NS', 'SUNPHARMA.NS', 'ADANIENT.NS', 'TITAN.NS', 'TATAMOTORS.NS',
      'ONGC.NS', 'AXISBANK.NS', 'NTPC.NS', 'ULTRACEMCO.NS', 'POWERGRID.NS', 'KOTAKBANK.NS',
      'M&M.NS', 'WIPRO.NS', 'COALINDIA.NS', 'BAJAJ-AUTO.NS', 'ADANIPORTS.NS', 'ASIANPAINT.NS',
      'NESTLEIND.NS', 'JSWSTEEL.NS', 'GRASIM.NS', 'TATASTEEL.NS', 'TECHM.NS', 'SBILIFE.NS',
      'HDFCLIFE.NS', 'BRITANNIA.NS', 'INDUSINDBK.NS', 'CIPLA.NS', 'TATAWCF.NS', 'DIVISLAB.NS',
      'EICHERMOT.NS', 'BAJAJFINSV.NS', 'BPCL.NS', 'TATACONSUM.NS', 'DRREDDY.NS', 'HEROMOTOCO.NS',
      'HINDALCO.NS', 'APOLLOHOSP.NS',

      // key NEXT 50 / MIDCAPS relevant for retail
      'ZOMATO.NS', 'DLF.NS', 'HAL.NS', 'JIOFIN.NS', 'TRENT.NS', 'VBL.NS', 'SIEMENS.NS',
      'BEL.NS', 'IOC.NS', 'PFC.NS', 'REC.NS', 'GAIL.NS', 'CHOLAFIN.NS', 'BANKBARODA.NS',
      'INDIGO.NS', 'TVSMOTOR.NS', 'HAVELLS.NS', 'ABB.NS', 'GODREJCP.NS', 'AMBUJACEM.NS'
    ];

    try {
      console.log('Fetching earnings calendar for broader market...');
      console.log('Fetching earnings calendar for broader market...');
      const yahooFinance = await this.getYahooClient();

      // Process in chunks to avoid rate limits or timeouts
      const chunkSize = 10;
      let allResults = [];

      for (let i = 0; i < popularTickers.length; i += chunkSize) {
        const chunk = popularTickers.slice(i, i + chunkSize);
        const chunkPromises = chunk.map(async (symbol) => {
          try {
            const res = await yahooFinance.quoteSummary(symbol, {
              modules: ['calendarEvents', 'price', 'financialData', 'defaultKeyStatistics']
            });
            const events = res.calendarEvents?.earnings;
            // Relaxed check: if no specific earnings date, maybe allow if we have past data? 
            // For now, strict on earningsDate presence for "Calendar" purpose.
            if (!events || !events.earningsDate || events.earningsDate.length === 0) return null;

            // Get nearest date
            const date = new Date(events.earningsDate[0]);

            // Get Key Financials (for context display)
            const revenue = res.financialData?.totalRevenue;
            const profit = res.financialData?.ebitda;
            const eps = res.defaultKeyStatistics?.trailingEps;
            const revenueGrowth = res.financialData?.revenueGrowth;

            return {
              symbol,
              companyName: res.price?.shortName || symbol,
              date: date,
              formattedDate: date.toDateString(),
              revenue: revenue || 0,
              profit: profit || 0,
              eps: eps || 0,
              revenueGrowth: revenueGrowth || 0,
              // Link to BSE Corporate Filings (Reliable source for original PDFs)
              pdfUrl: `https://www.bseindia.com/corporates/ann.html?scrip=${symbol.replace('.NS', '').replace('.BO', '')}&duration=Today`
            };
          } catch (e) {
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        allResults.push(...chunkResults.filter(r => r !== null));
      }

      // Sort: Most recent/upcoming first
      // Logic: Show dates closest to TODAY first (whether slightly past or future)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allResults.sort((a: any, b: any) => {
        return Math.abs(a.date.getTime() - today.getTime()) - Math.abs(b.date.getTime() - today.getTime());
      });

      // Return substantial list (e.g., top 50 relevant by date), or all if needed
      // User said "every stock... displayed in that page". So let's return all found.
      this.earningsCache = allResults;
      this.lastEarningsFetch = now;
      return this.earningsCache;

    } catch (e) {
      console.error("Failed to fetch earnings calendar", e);
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
        modules: ['earnings', 'financialData', 'defaultKeyStatistics', 'price', 'summaryDetail', 'summaryProfile']
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
            publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
          }));
        }
      } catch (newsError) {
        console.error("Failed to fetch news for earnings analysis", newsError);
      }

      const history = res.earnings?.earningsChart?.quarterly || [];
      const financials = res.financialData;

      // Analyze latest available quarter
      const latestQtr = history.length > 0 ? history[history.length - 1] : null;
      let verdict = 'NEUTRAL';
      let surprise = 0;

      if (latestQtr && latestQtr.actual && latestQtr.estimate) {
        surprise = ((latestQtr.actual - latestQtr.estimate) / latestQtr.estimate) * 100;
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

        latestQuarter: latestQtr ? {
          period: latestQtr.date,
          estimate: latestQtr.estimate,
          actual: latestQtr.actual
        } : null,

        history: history.map((h: any) => ({
          period: h.date,
          estimate: h.estimate,
          actual: h.actual
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

        // MERGED: Quarterly Analysis (QoQ, YoY)
        quarterly: await this.getQuarterlyResults(symbol).catch(e => null)
      };

    } catch (e) {
      console.error(`Failed to fetch earnings details for ${symbol}`, e);
      throw new NotFoundException(`Earnings data for ${symbol} not found`);
    }
  }

  async getQuarterlyResults(symbol: string) {
    try {
      const yahooFinance = await this.getYahooClient();

      // Fix: If symbol has no suffix (e.g. "DRREDDY"), assume NSE (.NS)
      let querySymbol = symbol;
      if (!symbol.includes('.') && !symbol.startsWith('^')) {
        querySymbol = `${symbol}.NS`;
      }

      const res = await yahooFinance.quoteSummary(querySymbol, {
        modules: ['earnings', 'incomeStatementHistoryQuarterly', 'financialData', 'price']
      });

      const earningsFn = res.earnings?.financialsChart?.quarterly || [];
      const earningsEps = res.earnings?.earningsChart?.quarterly || [];
      const incomeStatement = res.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];

      // Sort Earnings Oldest to Newest (standard), verify and reverse for processing
      const sortedEarningsFn = [...earningsFn];

      const normalizedQuarterly = [];
      const count = sortedEarningsFn.length;
      if (count === 0) return { quarterly: [], comparisons: null };

      // Iterate backwards (Newest first)
      for (let i = count - 1; i >= 0; i--) {
        const qFn = sortedEarningsFn[i];
        const qEps = earningsEps.find((e: any) => e.date === qFn.date);

        let revenue = qFn.revenue;
        let netIncome = qFn.earnings;
        let ebitda = null;
        let operatingIncome = null;
        let eps = qEps?.actual;

        // Try to match with IncomeStatement (Newest First)
        // earningsFn[count-1] (Latest) -> incomeStatement[0]
        const incomeIdx = (count - 1) - i;
        if (incomeStatement[incomeIdx]) {
          const inc = incomeStatement[incomeIdx];
          if (inc.totalRevenue) revenue = inc.totalRevenue;
          if (inc.netIncome) netIncome = inc.netIncome;
          if (inc.ebitda) ebitda = inc.ebitda;
          if (inc.operatingIncome) operatingIncome = inc.operatingIncome;
        }

        normalizedQuarterly.push({
          period: qFn.date,
          revenue,
          netIncome,
          ebitda,
          operatingIncome,
          eps
        });
      }

      const current = normalizedQuarterly[0];
      const prev = normalizedQuarterly[1];
      // Yahoo usually gives only 4 quarters. So result is usually [Q4, Q3, Q2, Q1]. 
      // Q1 year ago is missing (would be index 4).
      // So comparisons.yearAgo often will be null.
      const yearAgoQtr = normalizedQuarterly.length >= 5 ? normalizedQuarterly[4] : null;

      const calculateMargins = (q: any) => {
        if (!q) return null;
        return {
          ...q,
          ebitdaMargin: (q.ebitda && q.revenue) ? (q.ebitda / q.revenue) : null,
          netProfitMargin: (q.netIncome && q.revenue) ? (q.netIncome / q.revenue) : null,
          operatingMargin: (q.operatingIncome && q.revenue) ? (q.operatingIncome / q.revenue) : null,
        };
      };

      const growth = (curr: number, base: number) => {
        if (curr === undefined || base === undefined || base === 0 || curr === null || base === null) return null;
        return (curr - base) / Math.abs(base);
      };

      const finalCurrent = calculateMargins(current);
      const finalPrev = calculateMargins(prev);
      const finalYearAgo = calculateMargins(yearAgoQtr);

      return {
        symbol: symbol.toUpperCase(),
        currency: res.price?.currency,
        quarters: normalizedQuarterly.map(calculateMargins),
        comparisons: {
          current: finalCurrent,
          prev: finalPrev,
          yearAgo: finalYearAgo,
          growth: {
            qoq: {
              revenue: growth(current?.revenue, prev?.revenue),
              netIncome: growth(current?.netIncome, prev?.netIncome),
              ebitda: growth(current?.ebitda, prev?.ebitda),
              operatingIncome: growth(current?.operatingIncome, prev?.operatingIncome),
              eps: growth(current?.eps, prev?.eps)
            },
            yoy: {
              revenue: growth(current?.revenue, yearAgoQtr?.revenue),
              netIncome: growth(current?.netIncome, yearAgoQtr?.netIncome),
              ebitda: growth(current?.ebitda, yearAgoQtr?.ebitda),
              operatingIncome: growth(current?.operatingIncome, yearAgoQtr?.operatingIncome),
              eps: growth(current?.eps, yearAgoQtr?.eps)
            }
          }
        }
      };

    } catch (e) {
      console.error(`Failed to fetch quarterly results for ${symbol}`, e);
      throw new NotFoundException(`Quarterly results for ${symbol} not found`);
    }
  }

  async findAll() {
    // Return all stocks in DB
    return this.prisma.stock.findMany({
      orderBy: { lastUpdated: 'desc' }
    });
  }

  async getMarketSummary(page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      // 1. Fetch page of stocks from DB
      const dbStocks = await this.prisma.stock.findMany({
        take: limit,
        skip: offset,
        orderBy: { symbol: 'asc' } // Or marketCap if available, but symbol is stable
      });

      if (dbStocks.length === 0) return [];

      const fifteenMinutesAgo = new Date(Date.now() - 1 * 60 * 1000);
      const symbolsToFetch: string[] = [];

      // 2. Identify stale stocks
      for (const stock of dbStocks) {
        // If price is 0, or missing fundamentals (Market Cap/PE), or old -> fetch it
        if (!stock.currentPrice || !stock.marketCap || !stock.peRatio || stock.lastUpdated < fifteenMinutesAgo) {
          symbolsToFetch.push(stock.symbol);
        }
      }

      if (symbolsToFetch.length > 0) {
        const yahooFinance = await this.getYahooClient();

        console.log(`Refreshing ${symbolsToFetch.length} stocks...`);

        // 3. Fetch live data for stale stocks
        const promises = symbolsToFetch.map(symbol => {
          let querySymbol = symbol;
          if (symbol === 'NIFTY 50') querySymbol = '^NSEI';
          if (symbol === 'SENSEX') querySymbol = '^BSESN';

          return yahooFinance.quoteSummary(querySymbol.includes('.') || querySymbol.startsWith('^') ? querySymbol : `${querySymbol}.NS`, {
            modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
          }).then((res: any) => ({ ...res, originalSymbol: symbol })).catch((e: any) => {
            console.error(`Failed to refresh ${symbol}`, e.message);
            return null;
          });
        });

        const results = (await Promise.all(promises)).filter(r => r !== null);

        // 4. Update DB for these results
        for (const data of results) {
          const symbol = data.originalSymbol; // Use the preserved original symbol
          if (!symbol) continue;

          const price = data.price?.regularMarketPrice;
          const dataToUpdate = {
            currentPrice: price,
            changePercent: (data.price?.regularMarketChangePercent || 0) * 100,
            marketCap: data.summaryDetail?.marketCap,
            peRatio: data.summaryDetail?.trailingPE,
            pbRatio: data.defaultKeyStatistics?.priceToBook,
            high52Week: data.summaryDetail?.fiftyTwoWeekHigh,
            low52Week: data.summaryDetail?.fiftyTwoWeekLow,
            bookValue: data.defaultKeyStatistics?.bookValue,
            dividendYield: data.summaryDetail?.dividendYield,
            returnOnEquity: data.financialData?.returnOnEquity,
            returnOnAssets: data.financialData?.returnOnAssets,
            totalDebt: data.financialData?.totalDebt,
            totalRevenue: data.financialData?.totalRevenue,
            profitMargins: data.financialData?.profitMargins,
            operatingMargins: data.financialData?.operatingMargins,
            lastUpdated: new Date()
          };

          await this.prisma.stock.update({
            where: { symbol: symbol },
            data: dataToUpdate
          });
        }
      }

      // 5. Re-fetch from DB to get fresh data (simplest way to ensure consistency)
      const freshStocks = await this.prisma.stock.findMany({
        take: limit,
        skip: offset,
        orderBy: { symbol: 'asc' }
      });

      return freshStocks;

    } catch (error) {
      console.error('Market summary fetch failed:', error);
      return [];
    }
  }
  async getMarketNews() {
    try {
      const pkg = await import('yahoo-finance2');
      const YahooFinance = pkg.default as any;
      const yahooFinance = new YahooFinance();

      const queries = ['India Stock Market', 'Nifty 50', 'Sensex', 'Indian Economy'];
      const requests = queries.map(q => yahooFinance.search(q, { newsCount: 10 }));

      const results = await Promise.all(requests);

      // Combine and deduplicate
      const allNews = results.flatMap(r => r.news || []);
      const uniqueNews = Array.from(new Map(allNews.map((item: any) => [item.uuid, item])).values());

      // Sort by time (newest first)
      uniqueNews.sort((a: any, b: any) => new Date(b.providerPublishTime).getTime() - new Date(a.providerPublishTime).getTime());

      return uniqueNews.slice(0, 20);
    } catch (error) {
      console.error('Failed to fetch news:', error);
      return [];
    }
  }

  async getStockNews(symbol: string) {
    try {
      const pkg = await import('yahoo-finance2');
      const YahooFinance = pkg.default as any;
      const yahooFinance = new YahooFinance();

      let query = symbol;
      // Improve search relevance for Indian stocks
      if (symbol.endsWith('.NS')) {
        query = symbol.replace('.NS', '');
      }

      console.log(`Fetching specific news for ${query} (${symbol})...`);
      const result = await yahooFinance.search(query, { newsCount: 10 });

      if (!result.news || result.news.length === 0) {
        // Fallback: Try searching with "Stock" appended or full company name if available (would need lookup)
        // For now, let's return []
        return [];
      }

      // Sort by time
      const news = result.news.sort((a: any, b: any) =>
        new Date(b.providerPublishTime).getTime() - new Date(a.providerPublishTime).getTime()
      );

      return news;

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
            { companyName: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: 20 // Increase limit to avoid "Industries" noise hiding real matches
      });

      // Sort: Exact/Starts-with first
      localResults.sort((a, b) => {
        const aStarts = a.companyName.toLowerCase().startsWith(query.toLowerCase()) || a.symbol.toLowerCase().startsWith(query.toLowerCase());
        const bStarts = b.companyName.toLowerCase().startsWith(query.toLowerCase()) || b.symbol.toLowerCase().startsWith(query.toLowerCase());
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });

      const formattedLocal = localResults.map(stock => ({
        symbol: stock.symbol,
        shortname: stock.companyName, // Map to Yahoo format
        exchange: stock.exchange,
        quoteType: 'EQUITY',
        isYahooFinance: true // Flag to keep it
      }));


      // 2. Search External API (Yahoo Finance) for broader coverage
      let externalResults: any[] = [];
      try {
        const yahooFinance = await this.getYahooClient();
        const result = await yahooFinance.search(query, { quotesCount: 20, newsCount: 0 });

        externalResults = result.quotes.filter((q: any) =>
          (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'INDEX') &&
          (
            ['NSI', 'NSE', 'BSE', 'BOM'].includes(q.exchange) ||
            (q.symbol && (q.symbol.endsWith('.NS') || q.symbol.endsWith('.BO')))
          )
        );
      } catch (extError) {
        console.error('External search failed, proceeding with local results:', extError);
        // Continue with empty externalResults
      }

      // 3. Merge & Deduplicate (Prioritize Local)
      const seen = new Set(formattedLocal.map(s => s.symbol));
      const merged = [...formattedLocal];

      for (const ext of externalResults) {
        if (!seen.has(ext.symbol)) {
          merged.push(ext);
          seen.add(ext.symbol);
        }
      }

      return merged.slice(0, 10);

    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }
  async getTrending() {
    const symbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'TATAMOTORS.NS'];
    try {
      const yahooFinance = await this.getYahooClient();

      const results = await Promise.all(symbols.map(async (symbol) => {
        try {
          // Check DB first for fresh data to save API calls
          const dbStock = await this.prisma.stock.findUnique({ where: { symbol } });
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

          if (dbStock && dbStock.lastUpdated > fiveMinutesAgo) {
            return dbStock;
          }

          // Fetch live
          const data = await yahooFinance.quoteSummary(symbol, {
            modules: ['price', 'summaryDetail', 'defaultKeyStatistics']
          }) as any;

          if (!data || !data.price) return null;

          const price = data.price.regularMarketPrice;
          const changePercent = (data.price.regularMarketChangePercent || 0) * 100;

          // Update DB
          const dataToUpdate = {
            currentPrice: price,
            changePercent: changePercent,
            marketCap: data.summaryDetail?.marketCap,
            peRatio: data.summaryDetail?.trailingPE,
            pbRatio: data.defaultKeyStatistics?.priceToBook,
            high52Week: data.summaryDetail?.fiftyTwoWeekHigh,
            low52Week: data.summaryDetail?.fiftyTwoWeekLow,
            lastUpdated: new Date()
          };

          return await this.prisma.stock.upsert({
            where: { symbol },
            update: dataToUpdate,
            create: {
              symbol,
              companyName: data.price.shortName || symbol,
              exchange: data.price.exchangeName || 'NSE',
              ...dataToUpdate
            }
          });

        } catch (e) {
          if (e instanceof Error && e.message.includes('Quote not found')) {
            // Suppress annoying log
            // console.warn(`Quote not found for ${symbol}, skipping.`);
          } else {
            console.error(`Error fetching ${symbol}`, e);
          }
          return null;
        }
      }));

      return results.filter(r => r !== null);
    } catch (error) {
      console.error("Failed to get trending stocks", error);
      return [];
    }
  }
  async getIndices() {
    const symbols = ['^NSEI', '^BSESN'];
    try {
      const yahooFinance = await this.getYahooClient();

      const results = await Promise.all(symbols.map(async (symbol) => {
        try {
          const data = await yahooFinance.quoteSummary(symbol, {
            modules: ['price']
          }) as any;

          if (!data || !data.price) return null;

          return {
            symbol: symbol === '^NSEI' ? 'NIFTY 50' : 'SENSEX',
            price: data.price.regularMarketPrice,
            change: data.price.regularMarketChange,
            changePercent: (data.price.regularMarketChangePercent || 0) * 100
          };

        } catch (e) {
          console.error(`Error fetching index ${symbol}`, e);
          return null;
        }
      }));

      return results.filter(r => r !== null);
    } catch (error) {
      console.error("Failed to get indices", error);
      return [];
    }
  }

  async getHistory(symbol: string, range: '1d' | '1mo' | '3mo' | '1y' = '1mo') {
    try {
      const yahooFinance = await this.getYahooClient();

      let querySymbol = symbol;
      if (symbol === 'NIFTY 50') querySymbol = '^NSEI';
      if (symbol === 'SENSEX') querySymbol = '^BSESN';

      // Ensure .NS suffix for Indian stocks if not an index or already suffixed
      const lookupSymbol = (querySymbol.endsWith('.NS') || querySymbol.endsWith('.BO') || querySymbol.startsWith('^'))
        ? querySymbol
        : `${querySymbol.toUpperCase()}.NS`;

      const queryOptions: any = {};

      const now = new Date();
      let fromDate = new Date();

      switch (range) {
        case '1d':
          // Widen the net to catch weekends/holidays. We filter later.
          fromDate.setDate(now.getDate() - 7);
          queryOptions.interval = '15m'; // Intraday
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
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
      const fetchPromise = yahooFinance.chart(lookupSymbol, queryOptions);

      const result = await Promise.race([fetchPromise, timeout]) as any;

      let finalResult = result.quotes || [];

      // Fail-safe: If 1d intraday returned nothing (common on weekends/holidays for free API), fetch daily
      if (range === '1d' && (!result || result.length === 0)) {
        console.log("Intraday empty, fetching daily fallback for 1d view");
        const fallbackOptions = { ...queryOptions, interval: '1d', period1: Math.floor((new Date().setDate(new Date().getDate() - 30)) / 1000) };
        const fallbackResult = await yahooFinance.chart(lookupSymbol, fallbackOptions);
        if (fallbackResult && fallbackResult.quotes && fallbackResult.quotes.length > 0) {
          finalResult = fallbackResult.quotes.slice(-5); // Show last 5 daily candles
        }
      }

      // Filter for 1d: Keep only the LAST trading session's data
      if (range === '1d' && result && result.length > 0) {
        const lastDate = new Date(result[result.length - 1].date);
        const lastDateStr = lastDate.toDateString();
        finalResult = result.filter((q: any) => new Date(q.date).toDateString() === lastDateStr);

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
        volume: quote.volume
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
    const staleStocks = watchlist.filter(w => w.stock.lastUpdated < fifteenMinutesAgo);

    if (staleStocks.length > 0) {
      // Fire and forget refresh for better UX speed, or await if critical
      // We'll await for now to ensure user sees fresh data on dashboard load
      await Promise.all(staleStocks.map(w => this.findOne(w.stockSymbol)));

      // Re-fetch to get updated values
      return this.prisma.watchlist.findMany({
        where: { userId },
        include: { stock: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return watchlist;
  }
}
