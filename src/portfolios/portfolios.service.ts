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

        const holdings = await this.prisma.userPortfolioStock.findMany({
            where: { portfolioId: portfolio.id },
            include: {
                stock: {
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
                },
            },
            orderBy: { addedAt: 'desc' },
        });

        // Compute enriched fields
        let totalCurrentValue = 0;
        const enriched = holdings.map((h) => {
            const cmp = h.stock.currentPrice || h.averageBuyPrice;
            const investedValue = h.quantity * h.averageBuyPrice;
            const currentValue = h.quantity * cmp;
            totalCurrentValue += currentValue;
            return { ...h, investedValue, currentValue };
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

        // Verify stock exists
        const stock = await this.prisma.stock.findUnique({
            where: { symbol: dto.symbol },
        });
        if (!stock) {
            throw new NotFoundException(`Stock ${dto.symbol} not found in database`);
        }

        // Check if already held
        const existing = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: dto.symbol },
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
                stockSymbol: dto.symbol,
                quantity: dto.quantity,
                averageBuyPrice: dto.averageBuyPrice,
            },
        });
    }

    async updateHolding(userId: string, symbol: string, dto: UpdateHoldingDto) {
        const portfolio = await this.getOrCreatePortfolio(userId);

        const holding = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: symbol },
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

        const holding = await this.prisma.userPortfolioStock.findFirst({
            where: { portfolioId: portfolio.id, stockSymbol: symbol },
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

        const prompt = `
You are an expert Chief Investment Officer (CIO) analyzing an Indian Stock Market portfolio.
Given the following portfolio composition:

Total Invested: ₹${portfolioData.summary.totalInvested.toFixed(2)}
Total Current Value: ₹${portfolioData.summary.totalCurrentValue.toFixed(2)}
Total P&L: ₹${portfolioData.summary.totalPnl.toFixed(2)} (${portfolioData.summary.totalPnlPercent.toFixed(2)}%)

Holdings:
${JSON.stringify(holdingsObj, null, 2)}

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

            // Save to DB
            return this.prisma.userPortfolioAnalysis.create({
                data: {
                    portfolioId: portfolioData.portfolioId,
                    healthScore: analysisJson.healthScore,
                    riskLevel: analysisJson.riskLevel,
                    insights: analysisJson.insights,
                }
            });
        } catch (error) {
            this.logger.error("Failed to analyze portfolio", error);
            throw new BadRequestException("AI Analysis failed. Please try again later.");
        }
    }
}
