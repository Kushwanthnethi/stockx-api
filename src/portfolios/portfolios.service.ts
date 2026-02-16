import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncPortfolioDto } from './dto';
const pdf = require('pdf-parse');
import * as XLSX from 'xlsx';

@Injectable()
export class PortfoliosService {
    constructor(private prisma: PrismaService) { }

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

    async syncPortfolio(userId: string, dto: SyncPortfolioDto) {
        // Since userId is not unique in schema (one-to-many potentially allowed or just missing constraint),
        // we use findFirst to get the user's main portfolio.
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

        // Add analysis track record if provided
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
        // Simple magic number check or mime type check
        // PDF starts with %PDF (0x25 0x50 0x44 0x46)
        // Excel (xlsx) starts with PK (0x50 0x4B)

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
            const sheetName = workbook.SheetNames[0]; // Assume first sheet
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

            // Map columns based on user's screenshot headers:
            // "Stock Name", "ISIN", "Quantity", "Average buy price", "Closing price"

            for (const row of data) {
                // Flexible key matching incase of case sensitivity or slight variations
                const getVal = (keyPart: string) => {
                    const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
                    return key ? row[key] : null;
                };

                const name = getVal('Stock Name') || getVal('Symbol') || getVal('Scrip') || getVal('Company');
                const isin = getVal('ISIN');
                const qty = getVal('Quantity') || getVal('Qty') || getVal('Holdings');
                const avgPrice = getVal('Average buy price') || getVal('Avg') || getVal('Buy Price');
                const cmp = getVal('Closing price') || getVal('CMP') || getVal('LTP') || getVal('Current');

                // Debug log for first few rows
                if (holdings.length < 3) {
                    console.log(`Row analysis - Name: ${name}, ISIN: ${isin}, Qty: ${qty}`);
                }

                if (name && (qty || isin)) { // Minimal valid row check
                    // Basic Symbol Mapping - Logic Shared with PDF parser
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

            // Debug log to see what we got (optional, remove in prod)
            console.log("PDF Text Prefix:", text.substring(0, 200));

            // Regex to find: Stock Name (ISIN) Qty AvgPrice
            // Format from user: "Stock Name ISIN Quantity Average buy price Buy value Closing price Closing value Unrealised P&L"
            // Example: "BSE LIMITED INE118H01025 13 3025 39325 3025.3 39328.9 3.9"

            const lines = text.split('\n');
            const holdings = [];

            for (const line of lines) {
                // Regex Breakdown:
                // ^(.+?)           -> Group 1: Stock Name (lazy match)
                // \s+              -> Separator
                // (INE[A-Z0-9]{9}) -> Group 2: ISIN (Standard 12 chars, usually starts with INE)
                // \s+              -> Separator
                // (\d+)            -> Group 3: Quantity (Integer)
                // \s+              -> Separator
                // ([\d\.,]+)       -> Group 4: Avg Buy Price (Float, might have commas)
                // \s+              -> Separator
                // [\d\.,]+         -> Buy Value (Ignored)
                // \s+              -> Separator
                // ([\d\.,]+)       -> Group 5: Closing Price / CMP (Float)

                const match = line.trim().match(/^(.+?)\s+(INE[A-Z0-9]{9})\s+(\d+)\s+([\d\.,]+)\s+[\d\.,]+\s+([\d\.,]+)/i);

                if (match) {
                    const name = match[1].trim();
                    const isin = match[2];
                    const qty = parseInt(match[3].replace(/,/g, ''));
                    const avgPrice = parseFloat(match[4].replace(/,/g, ''));
                    const cmp = parseFloat(match[5].replace(/,/g, ''));

                    // Basic Symbol Mapping - The user wants accurate mapping
                    // We can use the Name to guess the NSE symbol or just use the Name if specific logic fails
                    let symbol = name;

                    // Common overrides for this user's visible stocks
                    if (name.includes('BSE LIMITED')) symbol = 'BSE.NS';
                    else if (name.includes('KFIN TECHNOLOGIES')) symbol = 'KFINTECH.NS';
                    else if (name.includes('LIFE INSURA')) symbol = 'LICI.NS';
                    else if (name.includes('NRB BEARING')) symbol = 'NRBBEARING.NS';
                    else {
                        // Fallback: Try to make a symbol or use Name
                        // If we had a database of ISIN -> Symbol that would be ideal, but for now heuristic
                        symbol = name.split(' ')[0] + '.NS';
                    }

                    holdings.push({
                        symbol: symbol,
                        quantity: qty,
                        avgPrice: avgPrice,
                        currentPrice: cmp || avgPrice,
                        sector: 'Diversified' // Frontend will refine this
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
}
