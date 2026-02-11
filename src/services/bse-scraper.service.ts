import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as https from 'https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

@Injectable()
export class BseScraperService {
    private readonly logger = new Logger(BseScraperService.name);
    private genAI: GoogleGenerativeAI;
    private fileManager: GoogleAIFileManager;

    // Mapping for stock symbols to BSE Scrip Codes
    private readonly SCRIP_MAP: Record<string, string> = {
        'RELIANCE.NS': '500325',
        'TCS.NS': '532540',
        'INFY.NS': '500209',
        'LICI.NS': '543526',
        // Fallback or Bi-directional
        '500325': 'RELIANCE.NS',
        '532540': 'TCS.NS',
        '500209': 'INFY.NS',
        '543526': 'LICI.NS'
    };

    constructor(private prisma: PrismaService) {
        // Initialize Gemini
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY is not set');
        } else {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.fileManager = new GoogleAIFileManager(apiKey);
        }
    }

    async findOne(symbol: string) {
        console.log(`[DEBUG] Starting AI-based scrape for: ${symbol}`);

        // 1. Resolve Scrip Code
        let scripCode = symbol;
        let stockSymbol = symbol;

        if (this.SCRIP_MAP[symbol]) {
            scripCode = this.SCRIP_MAP[symbol];
        } else if (Object.values(this.SCRIP_MAP).includes(symbol)) {
            // It's already a code, find the symbol
            stockSymbol = Object.keys(this.SCRIP_MAP).find(key => this.SCRIP_MAP[key] === symbol) || symbol;
        }

        if (!/^\d{6}$/.test(scripCode)) {
            // Try to find if it's a known symbol
            const mapped = this.SCRIP_MAP[symbol];
            if (mapped) scripCode = mapped;
            else return { status: 'error', message: `Could not resolve BSE Scrip Code for ${symbol}` };
        }

        try {
            // 2. Fetch PDF URL using external script
            const pdfUrl = await this.fetchPdfUrl(scripCode);
            if (!pdfUrl) {
                return { status: 'error', message: 'No financial results PDF found.' };
            }

            // 3. Download PDF
            const pdfPath = await this.downloadPdf(pdfUrl, scripCode);
            if (!pdfPath) {
                throw new Error('Failed to download PDF.');
            }

            // 4. Extract Data using Gemini
            const extractedData = await this.extractDataWithGemini(pdfPath);

            if (!extractedData) {
                throw new Error('AI failed to extract data.');
            }

            // 5. Save to Database
            await this.saveData(stockSymbol, extractedData);

            // Cleanup
            if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

            return { status: 'success', data: extractedData };

        } catch (error) {
            console.error(`[DEBUG] Scrape failed: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }

    private async fetchPdfUrl(scripCode: string): Promise<string> {
        // Use external script to bypass NestJS/Axios environment issues
        const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'fetch-bse-url.js');
        const command = `node --insecure-http-parser "${scriptPath}" ${scripCode}`;

        console.log(`[DEBUG] Executing: ${command}`);

        try {
            const { stdout, stderr } = await execPromise(command);

            if (stderr) {
                console.warn(`[DEBUG] Script Stderr: ${stderr}`);
            }

            try {
                const result = JSON.parse(stdout.trim());
                if (result.url) {
                    return result.url;
                } else {
                    throw new Error(result.error || 'Unknown error from script');
                }
            } catch (e) {
                throw new Error(`Failed to parse script output: ${stdout}`);
            }

        } catch (error) {
            throw new Error(`Script Execution Failed: ${error.message}`);
        }
    }

    private async downloadPdf(url: string, scripCode: string): Promise<string | null> {
        try {
            const downloadDir = path.join(process.cwd(), 'downloads');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

            const fileName = `${scripCode}_${Date.now()}.pdf`;
            const filePath = path.join(downloadDir, fileName);

            console.log(`[DEBUG] Downloading PDF to: ${filePath}`);

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });

        } catch (error) {
            throw new Error(`Download Failed: ${error.message}`);
        }
    }

    private async extractDataWithGemini(pdfPath: string): Promise<any> {
        console.log('[DEBUG] Uploading to Gemini...');
        try {
            const uploadResponse = await this.fileManager.uploadFile(pdfPath, {
                mimeType: "application/pdf",
                displayName: "Financial Result",
            });

            console.log(`[DEBUG] File uploaded: ${uploadResponse.file.uri}`);

            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
            Extract the following financial data from this document. 
            Return ONLY a valid JSON object. No markdown formatting.
            
            Fields to extract:
            - Period (e.g., "Q3 FY24", "Quarter Ended Dec 2023")
            - ResultType (Standalone or Consolidated - prefer Consolidated)
            - TotalIncome (Revenue/Total Income from Operations)
            - NetProfit (Profit After Tax)
            - EPS (Earnings Per Share - Basic)

            Format:
            {
                "period": "string",
                "resultType": "string",
                "income": "number or string",
                "netProfit": "number or string",
                "eps": "number or string"
            }
            `;

            const result = await model.generateContent([
                {
                    fileData: {
                        mimeType: uploadResponse.file.mimeType,
                        fileUri: uploadResponse.file.uri
                    }
                },
                { text: prompt }
            ]);

            const text = result.response.text();
            console.log(`[DEBUG] Gemini Response: ${text}`);

            // Clean markdown code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr);

        } catch (error) {
            throw new Error(`Gemini Extraction Error: ${error.message}`);
        }
    }

    private async saveData(stockSymbol: string, data: any) {
        // Normalize
        const period = data.period || 'Unknown';
        const resultType = data.resultType || 'Consolidated';

        const parseValue = (val: string | number) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
                return parseFloat(val.replace(/,/g, ''));
            }
            return 0;
        };

        const revenue = parseValue(data.income);
        const netProfit = parseValue(data.netProfit);
        const eps = parseValue(data.eps);

        // Helper to parse period to date (approximate)
        const parseDate = (p: string): Date => {
            const now = new Date();
            if (p.includes('Q1')) return new Date(now.getFullYear(), 5, 30); // Jun
            if (p.includes('Q2')) return new Date(now.getFullYear(), 8, 30); // Sep
            if (p.includes('Q3')) return new Date(now.getFullYear(), 11, 31); // Dec
            if (p.includes('Q4')) return new Date(now.getFullYear() + 1, 2, 31); // Mar
            if (p.includes('Mar')) return new Date(now.getFullYear(), 2, 31);
            if (p.includes('Jun')) return new Date(now.getFullYear(), 5, 30);
            if (p.includes('Sep')) return new Date(now.getFullYear(), 8, 30);
            if (p.includes('Dec')) return new Date(now.getFullYear(), 11, 31);
            return new Date();
        };

        const resultDate = parseDate(period);

        console.log(`[DEBUG] Saving Data: ${stockSymbol} | Rev: ${revenue} | Profit: ${netProfit}`);

        return this.prisma.financialResult.upsert({
            where: {
                stockSymbol_period_resultType: {
                    stockSymbol,
                    period,
                    resultType
                }
            },
            update: {
                revenue,
                netProfit,
                eps,
            },
            create: {
                stockSymbol,
                period,
                resultType,
                revenue,
                netProfit,
                eps,
                date: resultDate
            }
        });
    }
}
