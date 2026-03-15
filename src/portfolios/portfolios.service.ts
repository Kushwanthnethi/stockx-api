import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPortfolioDto, AddHoldingDto, UpdateHoldingDto } from './dto';
const pdf = require('pdf-parse');
import * as XLSX from 'xlsx';
import { GroqService } from '../services/groq.service';

@Injectable()
export class PortfoliosService {
    private readonly logger = new Logger(PortfoliosService.name);

    constructor(
        private prisma: PrismaService,
        private groqService: GroqService
    ) { }

    // ─── Portfolio CRUD ─────────────────────────────────────────────

    async getOrCreatePortfolio(userId: string) {
        let portfolio = await this.prisma.userPortfolio.findFirst({
            where: { userId },
        });
        if (!portfolio) {
            portfolio = await this.prisma.userPortfolio.create({
                data: { userId, name: 'My Portfolio' },
            });
        }
        return portfolio;
    }

    async getUserPortfolio(userId: string) {
        return this.prisma.userPortfolio.findFirst({
            where: { userId },
            include: {
                analyses: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });
    }

    // ─── Holdings CRUD ──────────────────────────────────────────────

    async getHoldings(userId: string) {
        const portfolio = await this.getOrCreatePortfolio(userId);

        // Auto-recover legacy synced holdings if this user has no row-based holdings yet.
        await this.recoverLegacyHoldings(portfolio.id, portfolio.encryptedData || undefined);

        const holdings = await this.prisma.userPortfolioStock.findMany({
            where: { portfolioId: portfolio.id },
            orderBy: { addedAt: 'desc' },
        });

        const symbols = holdings.map(h => h.stockSymbol);
        const stockRows = symbols.length > 0
            ? await this.prisma.stock.findMany({
                where: { symbol: { in: symbols } },
                select: {
                    symbol: true,
                    companyName: true,
                    currentPrice: true,
                    changePercent: true,
                    sector: true,
                    exchange: true,
                    high52Week: true,
                    low52Week: true,
                },
            })
            : [];
        const stockBySymbol = new Map(stockRows.map(s => [s.symbol, s]));

        // Compute enriched fields
        let totalCurrentValue = 0;
        const enriched = holdings.map((h) => {
            const stock = stockBySymbol.get(h.stockSymbol) || {
                symbol: h.stockSymbol,
                companyName: h.stockSymbol,
                currentPrice: null,
                changePercent: 0,
                sector: 'Unknown',
                exchange: h.stockSymbol.endsWith('.BO') ? 'BSE' : 'NSE',
                high52Week: null,
                low52Week: null,
            };
            const cmp = stock.currentPrice || h.averageBuyPrice;
            const investedValue = h.quantity * h.averageBuyPrice;
            const currentValue = h.quantity * cmp;
            totalCurrentValue += currentValue;
            return { ...h, stock, investedValue, currentValue };
        });

        // Second pass for weightage
        const result = enriched.map((h) => {
            const pnl = h.currentValue - h.investedValue;
            const pnlPercent = h.investedValue > 0 ? (pnl / h.investedValue) * 100 : 0;
            const weightage = totalCurrentValue > 0 ? (h.currentValue / totalCurrentValue) * 100 : 0;
            return { ...h, pnl, pnlPercent, weightage };
        });

        const totalInvested = result.reduce((s, h) => s + h.investedValue, 0);
        const totalPnl = totalCurrentValue - totalInvested;
        const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

        // Sector breakdown
        const sectorMap: Record<string, number> = {};
        for (const h of result) {
            const sector = h.stock.sector || 'Unknown';
            sectorMap[sector] = (sectorMap[sector] || 0) + h.currentValue;
        }
        const sectors = Object.entries(sectorMap).map(([name, value]) => ({
            name,
            value,
            percentage: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
        })).sort((a, b) => b.value - a.value);

        // Latest analysis
        const analysis = await this.prisma.userPortfolioAnalysis.findFirst({
            where: { portfolioId: portfolio.id },
            orderBy: { createdAt: 'desc' },
        });

        return {
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            summary: {
                totalInvested,
                totalCurrentValue,
                totalPnl,
                totalPnlPercent,
                holdingsCount: result.length,
                dayChange: portfolio.dayChange || 0,
            },
            holdings: result,
            sectors,
            analysis,
        };
    }

    async addHolding(userId: string, dto: AddHoldingDto) {
        const portfolio = await this.getOrCreatePortfolio(userId);

        const resolvedSymbol = await this.resolveExistingStockSymbol(dto.symbol);
        if (!resolvedSymbol) {
            throw new NotFoundException(`Stock ${dto.symbol} not found in database`);
        }

        // Verify stock exists
        const stock = await this.prisma.stock.findUnique({
            where: { symbol: resolvedSymbol },
        });
        if (!stock) {
            throw new NotFoundException(`Stock ${dto.symbol} not found in database`);
        }

        // Check if already held
        const existing = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: resolvedSymbol },
        });

        if (existing) {
            // Average up/down
            const totalQty = existing.quantity + dto.quantity;
            const totalCost = existing.quantity * existing.averageBuyPrice + dto.quantity * dto.averageBuyPrice;
            const newAvg = totalCost / totalQty;

            return this.prisma.userPortfolioStock.update({
                where: { id: existing.id },
                data: { quantity: totalQty, averageBuyPrice: newAvg },
            });
        }

        return this.prisma.userPortfolioStock.create({
            data: {
                portfolioId: portfolio.id,
                stockSymbol: resolvedSymbol,
                quantity: dto.quantity,
                averageBuyPrice: dto.averageBuyPrice,
            },
        });
    }

    async updateHolding(userId: string, symbol: string, dto: UpdateHoldingDto) {
        const portfolio = await this.getOrCreatePortfolio(userId);
        const symbolCandidates = this.getSymbolLookupCandidates(symbol);

        const holding = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: { in: symbolCandidates } },
        });
        if (!holding) throw new NotFoundException(`Holding ${symbol} not found`);

        return this.prisma.userPortfolioStock.update({
            where: { id: holding.id },
            data: {
                ...(dto.quantity !== undefined && { quantity: dto.quantity }),
                ...(dto.averageBuyPrice !== undefined && { averageBuyPrice: dto.averageBuyPrice }),
            },
        });
    }

    async removeHolding(userId: string, symbol: string) {
        const portfolio = await this.getOrCreatePortfolio(userId);
        const symbolCandidates = this.getSymbolLookupCandidates(symbol);

        const holding = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: { in: symbolCandidates } },
        });
        if (!holding) throw new NotFoundException(`Holding ${symbol} not found`);

        return this.prisma.userPortfolioStock.delete({ where: { id: holding.id } });
    }

    // ─── Legacy Sync & File Parsing ─────────────────────────────────

    async syncPortfolio(userId: string, dto: SyncPortfolioDto) {
        const existing = await this.prisma.userPortfolio.findFirst({
            where: { userId }
        });

        let portfolio;

        if (existing) {
            portfolio = await this.prisma.userPortfolio.update({
                where: { id: existing.id },
                data: {
                    encryptedData: dto.encryptedData,
                    totalValue: dto.totalValue,
                    dayChange: dto.dayChange,
                }
            });
        } else {
            portfolio = await this.prisma.userPortfolio.create({
                data: {
                    userId,
                    name: dto.name || 'My Portfolio',
                    encryptedData: dto.encryptedData,
                    totalValue: dto.totalValue,
                    dayChange: dto.dayChange,
                }
            });
        }

        if (dto.analysis) {
            await this.prisma.userPortfolioAnalysis.create({
                data: {
                    portfolioId: portfolio.id,
                    healthScore: dto.analysis.healthScore,
                    riskLevel: dto.analysis.riskLevel,
                    insights: dto.analysis.insights as any
                }
            });
        }

        return portfolio;
    }

    async parsePortfolioFile(userId: string, buffer: Buffer, mimeType?: string) {
        const isPdf = buffer.toString('utf8', 0, 4).startsWith('%PDF') || mimeType === 'application/pdf';

        if (isPdf) {
            return this.parsePortfolioPdf(userId, buffer);
        } else {
            return this.parsePortfolioExcel(userId, buffer);
        }
    }

    async parsePortfolioExcel(userId: string, buffer: Buffer) {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            console.log("Excel Sheet Name:", sheetName);
            const data: any[] = XLSX.utils.sheet_to_json(sheet);

            if (data.length > 0) {
                console.log("Excel Headers detected:", Object.keys(data[0]));
                console.log("First Row Sample:", JSON.stringify(data[0], null, 2));
            } else {
                console.log("Excel sheet appears empty or parsed as empty.");
            }

            const holdings = [];

            for (const row of data) {
                const getVal = (keyPart: string) => {
                    const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
                    return key ? row[key] : null;
                };

                const name = getVal('Stock Name') || getVal('Symbol') || getVal('Scrip') || getVal('Company');
                const isin = getVal('ISIN');
                const qty = getVal('Quantity') || getVal('Qty') || getVal('Holdings');
                const avgPrice = getVal('Average buy price') || getVal('Avg') || getVal('Buy Price');
                const cmp = getVal('Closing price') || getVal('CMP') || getVal('LTP') || getVal('Current');

                if (holdings.length < 3) {
                    console.log(`Row analysis - Name: ${name}, ISIN: ${isin}, Qty: ${qty}`);
                }

                if (name && (qty || isin)) {
                    let symbol = String(name).trim();

                    if (symbol.includes('BSE LIMITED')) symbol = 'BSE.NS';
                    else if (symbol.includes('KFIN TECHNOLOGIES')) symbol = 'KFINTECH.NS';
                    else if (symbol.includes('LIFE INSURA')) symbol = 'LICI.NS';
                    else if (symbol.includes('NRB BEARING')) symbol = 'NRBBEARING.NS';
                    else {
                        symbol = symbol.split(' ')[0] + '.NS';
                    }

                    holdings.push({
                        symbol: symbol,
                        quantity: Number(qty) || 0,
                        avgPrice: Number(avgPrice) || 0,
                        currentPrice: Number(cmp) || Number(avgPrice) || 0,
                        sector: 'Diversified'
                    });
                }
            }

            console.log(`Parsed ${holdings.length} holdings from Excel`);

            return {
                source: 'Excel_Backend_Parser',
                count: holdings.length,
                holdings
            };

        } catch (error) {
            console.error("Excel Parse Error:", error);
            throw new BadRequestException("Failed to parse Excel: " + error.message);
        }
    }

    async parsePortfolioPdf(userId: string, buffer: Buffer) {
        try {
            const data = await pdf(buffer);
            const text = data.text;
            console.log("PDF Text Prefix:", text.substring(0, 200));

            const lines = text.split('\n');
            const holdings = [];

            for (const line of lines) {
                const match = line.trim().match(/^(.+?)\s+(INE[A-Z0-9]{9})\s+(\d+)\s+([\d\.,]+)\s+[\d\.,]+\s+([\d\.,]+)/i);

                if (match) {
                    const name = match[1].trim();
                    const isin = match[2];
                    const qty = parseInt(match[3].replace(/,/g, ''));
                    const avgPrice = parseFloat(match[4].replace(/,/g, ''));
                    const cmp = parseFloat(match[5].replace(/,/g, ''));

                    let symbol = name;

                    if (name.includes('BSE LIMITED')) symbol = 'BSE.NS';
                    else if (name.includes('KFIN TECHNOLOGIES')) symbol = 'KFINTECH.NS';
                    else if (name.includes('LIFE INSURA')) symbol = 'LICI.NS';
                    else if (name.includes('NRB BEARING')) symbol = 'NRBBEARING.NS';
                    else {
                        symbol = name.split(' ')[0] + '.NS';
                    }

                    holdings.push({
                        symbol: symbol,
                        quantity: qty,
                        avgPrice: avgPrice,
                        currentPrice: cmp || avgPrice,
                        sector: 'Diversified'
                    });
                }
            }

            console.log(`Parsed ${holdings.length} holdings from PDF`);

            return {
                source: 'PDF_Backend_Parser',
                count: holdings.length,
                holdings
            };

        } catch (error) {
            console.error("PDF Parse Error:", error);
            throw new BadRequestException("Failed to parse PDF: " + error.message);
        }
    }

    // ─── AI Health Score ────────────────────────────────────────────

    async analyzePortfolio(userId: string) {
        const portfolioData = await this.getHoldings(userId);

        if (portfolioData.holdings.length === 0) {
            throw new BadRequestException("Portfolio is empty. Add stocks before analyzing.");
        }

        const holdingsObj = portfolioData.holdings.map(h => ({
            symbol: h.stockSymbol,
            name: h.stock.companyName,
            sector: h.stock.sector || 'Unknown',
            weightage: `${h.weightage.toFixed(2)}%`,
            pnlPercent: `${h.pnlPercent.toFixed(2)}%`,
        }));

        const quantitative = this.calculateQuantitativeHealthScore(portfolioData);

        const prompt = `
You are an expert Chief Investment Officer (CIO) analyzing an Indian Stock Market portfolio.
Given the following portfolio composition:

Total Invested: ₹${portfolioData.summary.totalInvested.toFixed(2)}
Total Current Value: ₹${portfolioData.summary.totalCurrentValue.toFixed(2)}
Total P&L: ₹${portfolioData.summary.totalPnl.toFixed(2)} (${portfolioData.summary.totalPnlPercent.toFixed(2)}%)

Pre-computed quantitative baseline:
- Baseline Health Score: ${quantitative.score}
- Holdings Count: ${quantitative.meta.holdingsCount}
- Sector Diversity Count: ${quantitative.meta.sectorCount}
- Largest Position Weight: ${quantitative.meta.maxWeightage.toFixed(2)}%
- Top 3 Concentration: ${quantitative.meta.top3Weightage.toFixed(2)}%

Holdings:
${JSON.stringify(holdingsObj, null, 2)}

Scoring guidance:
- Use the baseline score as anchor and adjust only if qualitative factors justify it.
- Keep final healthScore within baseline +/- 15 points.
- Better diversification and lower concentration should increase score.
- High concentration, weak sector spread, and sustained negative performance should reduce score.

Provide a strict JSON response analyzing this portfolio.
The JSON must have the following structure exactly:
{
  "healthScore": number, // 0 to 100
  "riskLevel": string, // "LOW", "MEDIUM", or "CRITICAL"
  "insights": {
    "summary": string, // 1-2 sentence overall verdict
    "strengths": string[], // 2-3 points
    "weaknesses": string[], // 2-3 points
    "recommendation": string // actionable advice
  }
}
Do not output any markdown formatting, only pure JSON.
`;

        try {
            const resultText = await this.groqService.generateCompletion(prompt);
            const cleanedText = resultText.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
            const analysisJson = JSON.parse(cleanedText);

            const aiHealthScore = this.normalizeScore(analysisJson?.healthScore, quantitative.score);
            const blendedHealthScore = Math.round((quantitative.score * 0.65) + (aiHealthScore * 0.35));
            const normalizedRiskLevel = this.normalizeRiskLevel(analysisJson?.riskLevel, blendedHealthScore);
            const scoringBreakdown = {
                baselineScore: quantitative.score,
                aiScore: aiHealthScore,
                finalScore: blendedHealthScore,
                weights: {
                    quantitative: 0.65,
                    ai: 0.35,
                },
                factors: {
                    holdingsCount: quantitative.meta.holdingsCount,
                    sectorCount: quantitative.meta.sectorCount,
                    maxWeightage: Number(quantitative.meta.maxWeightage.toFixed(2)),
                    top3Weightage: Number(quantitative.meta.top3Weightage.toFixed(2)),
                    totalPnlPercent: Number(quantitative.meta.totalPnlPercent.toFixed(2)),
                },
            };

            const aiInsights = (analysisJson?.insights && typeof analysisJson.insights === 'object')
                ? analysisJson.insights
                : {
                    summary: 'Portfolio analyzed using quantitative and AI blended scoring.',
                    strengths: [],
                    weaknesses: [],
                    recommendation: 'Improve diversification and reduce concentration risk to increase score.',
                };

            // Save to DB
            return this.prisma.userPortfolioAnalysis.create({
                data: {
                    portfolioId: portfolioData.portfolioId,
                    healthScore: blendedHealthScore,
                    riskLevel: normalizedRiskLevel,
                    insights: {
                        ...aiInsights,
                        scoringBreakdown,
                    },
                }
            });
        } catch (error) {
            this.logger.error("Failed to analyze portfolio", error);
            throw new BadRequestException("AI Analysis failed. Please try again later.");
        }
    }

    private calculateQuantitativeHealthScore(portfolioData: { holdings: Array<{ weightage: number; stock: { sector: string | null } }>; summary: { totalPnlPercent: number } }) {
        const holdingsCount = portfolioData.holdings.length;
        const sortedWeights = portfolioData.holdings
            .map(h => Number(h.weightage) || 0)
            .sort((a, b) => b - a);
        const maxWeightage = sortedWeights[0] || 0;
        const top3Weightage = sortedWeights.slice(0, 3).reduce((sum, w) => sum + w, 0);
        const sectorCount = new Set(portfolioData.holdings.map(h => (h.stock.sector || 'Unknown').toUpperCase())).size;
        const totalPnlPercent = Number(portfolioData.summary.totalPnlPercent) || 0;

        let score = 45;

        // Breadth and diversification
        score += Math.min(holdingsCount, 12) * 1.5; // up to +18
        score += Math.min(sectorCount, 8) * 2; // up to +16

        // Concentration penalties / rewards
        if (maxWeightage <= 25) score += 8;
        else score -= Math.min((maxWeightage - 25) * 0.8, 20);

        if (top3Weightage <= 60) score += 6;
        else score -= Math.min((top3Weightage - 60) * 0.6, 15);

        // Performance tilt (moderate impact)
        score += Math.max(-12, Math.min(12, totalPnlPercent / 2));

        return {
            score: this.clampScore(score),
            meta: {
                holdingsCount,
                sectorCount,
                maxWeightage,
                top3Weightage,
                totalPnlPercent,
            }
        };
    }

    private clampScore(value: number): number {
        return Math.max(0, Math.min(100, Math.round(value)));
    }

    private normalizeScore(value: any, fallback: number): number {
        const num = Number(value);
        if (!Number.isFinite(num)) return this.clampScore(fallback);
        return this.clampScore(num);
    }

    private normalizeRiskLevel(value: any, score: number): string {
        const normalized = String(value || '').toUpperCase().trim();
        if (normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'CRITICAL') {
            return normalized;
        }
        if (score >= 75) return 'LOW';
        if (score >= 50) return 'MEDIUM';
        return 'CRITICAL';
    }

    private getSymbolLookupCandidates(rawSymbol: string): string[] {
        const raw = (rawSymbol || '').toUpperCase().trim();
        if (!raw) return [];

        const prefixed = raw.replace(/^NSE:/, '').replace(/^BSE:/, '');
        const noEq = prefixed.replace(/-EQ$/, '');
        const base = noEq.replace(/\.(NS|BO)$/, '');
        const candidates = new Set<string>([
            raw,
            prefixed,
            noEq,
            base,
            `${base}.NS`,
            `${base}.BO`,
        ]);

        if (/^\d{6}$/.test(base)) {
            candidates.add(`${base}.BO`);
        }

        return Array.from(candidates).filter(Boolean);
    }

    private async resolveExistingStockSymbol(rawSymbol: string): Promise<string | null> {
        const candidates = this.getSymbolLookupCandidates(rawSymbol);
        if (candidates.length === 0) return null;

        const found = await this.prisma.stock.findFirst({
            where: { symbol: { in: candidates } },
            select: { symbol: true },
        });

        if (found?.symbol) return found.symbol;

        // Prefer NSE suffix when client sends bare symbols and DB is NSE-first.
        const base = (rawSymbol || '').toUpperCase().trim().replace(/^NSE:/, '').replace(/^BSE:/, '').replace(/-EQ$/, '').replace(/\.(NS|BO)$/, '');
        const nseSymbol = `${base}.NS`;
        const nse = await this.prisma.stock.findUnique({ where: { symbol: nseSymbol }, select: { symbol: true } });
        if (nse?.symbol) return nse.symbol;

        const bseSymbol = `${base}.BO`;
        const bse = await this.prisma.stock.findUnique({ where: { symbol: bseSymbol }, select: { symbol: true } });
        return bse?.symbol || null;
    }

    private parseLegacyHoldings(encryptedData?: string): Array<{ symbol: string; quantity: number; averageBuyPrice: number }> {
        if (!encryptedData) return [];

        try {
            const parsed = JSON.parse(encryptedData);
            const list = Array.isArray(parsed)
                ? parsed
                : parsed?.holdings || parsed?.positions || parsed?.data || parsed?.portfolio || [];

            if (!Array.isArray(list)) return [];

            const rows: Array<{ symbol: string; quantity: number; averageBuyPrice: number }> = [];
            for (const item of list) {
                const symbol = String(
                    item?.symbol || item?.stockSymbol || item?.tradingsymbol || item?.tradingSymbol || item?.scrip || ''
                ).trim();
                const quantity = Number(item?.quantity ?? item?.qty ?? item?.totalQty ?? 0);
                const averageBuyPrice = Number(item?.averageBuyPrice ?? item?.avgPrice ?? item?.buyPrice ?? item?.costPrice ?? 0);

                if (!symbol || quantity <= 0 || averageBuyPrice <= 0) continue;
                rows.push({ symbol, quantity, averageBuyPrice });
            }

            return rows;
        } catch {
            // Legacy encrypted payload may be non-JSON; skip silently.
            return [];
        }
    }

    private async recoverLegacyHoldings(portfolioId: string, encryptedData?: string): Promise<void> {
        const existingCount = await this.prisma.userPortfolioStock.count({ where: { portfolioId } });
        if (existingCount > 0) return;

        const legacyRows = this.parseLegacyHoldings(encryptedData);
        if (legacyRows.length === 0) return;

        const mergedBySymbol = new Map<string, { quantity: number; totalCost: number }>();

        for (const row of legacyRows) {
            const resolved = await this.resolveExistingStockSymbol(row.symbol);
            if (!resolved) continue;

            const prev = mergedBySymbol.get(resolved);
            if (!prev) {
                mergedBySymbol.set(resolved, {
                    quantity: row.quantity,
                    totalCost: row.quantity * row.averageBuyPrice,
                });
                continue;
            }

            prev.quantity += row.quantity;
            prev.totalCost += row.quantity * row.averageBuyPrice;
            mergedBySymbol.set(resolved, prev);
        }

        if (mergedBySymbol.size === 0) return;

        for (const [symbol, aggregate] of mergedBySymbol.entries()) {
            await this.prisma.userPortfolioStock.create({
                data: {
                    portfolioId,
                    stockSymbol: symbol,
                    quantity: aggregate.quantity,
                    averageBuyPrice: aggregate.totalCost / aggregate.quantity,
                },
            });
        }

        this.logger.log(`Recovered ${mergedBySymbol.size} legacy portfolio holdings for portfolio ${portfolioId}`);
    }
}
