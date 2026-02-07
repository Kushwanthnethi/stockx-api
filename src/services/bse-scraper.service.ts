import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import puppeteer, { ConsoleMessage } from 'puppeteer';
import { FileDownloader } from '../utils/file-downloader';
import { PdfParserService } from './pdf-parser.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BseScraperService {
    private readonly logger = new Logger(BseScraperService.name);
    private static readonly BSE_URL = 'https://www.bseindia.com/corporates/results.aspx';

    // Temporary mapping for POC
    private readonly SCRIP_MAP: Record<string, string> = {
        'RELIANCE.NS': '500325',
        'TCS.NS': '532540',
        'INFY.NS': '500209',
        // Fallback or Bi-directional
        '500325': 'RELIANCE.NS',
        '532540': 'TCS.NS',
        '500209': 'INFY.NS'
    };

    constructor(
        private prisma: PrismaService,
        private pdfParser: PdfParserService
    ) { }

    /**
     * Scrapes, Parses, and Saves financial results.
     */
    async scrapeAndSave(symbolOrCode: string) {
        this.logger.log(`Starting scrape workflow for: ${symbolOrCode}`);

        // 1. RESOLVE SYMBOL/CODE
        let scripCode = symbolOrCode;
        let stockSymbol = symbolOrCode;

        if (this.SCRIP_MAP[symbolOrCode]) {
            if (isNaN(Number(symbolOrCode))) {
                // Input is Symbol (RELIANCE.NS), get Code
                scripCode = this.SCRIP_MAP[symbolOrCode];
                stockSymbol = symbolOrCode;
            } else {
                // Input is Code, get Symbol
                stockSymbol = this.SCRIP_MAP[symbolOrCode];
                scripCode = symbolOrCode;
            }
        } else {
            // Default assumption if not in map
            if (!isNaN(Number(symbolOrCode))) {
                // It's a code, but we don't know the symbol. 
                // We can't save to DB easily if foreign key fails.
                // For POC, let's try to save with the code as symbol if it exists?
                // Or warn.
                this.logger.warn(`Unknown mapping for ${symbolOrCode}. Proceeding with assumption.`);
            }
        }

        // 2. SCRAPE PDF
        const pdfPath = await this.downloadPdf(scripCode, stockSymbol);

        if (!pdfPath) {
            return { status: 'error', message: 'PDF not found' };
        }

        // 3. PARSE PDF
        this.logger.log(`Parsing PDF: ${pdfPath}`);
        const parsedData = await this.pdfParser.parsePdf(pdfPath);

        // 4. SAVE TO DB
        const resultType = 'QUARTERLY'; // Detected from PDF? Future work.
        const period = parsedData.period || `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;
        // Unique key is [stockSymbol, period, resultType].
        // To avoid unique constraint errors during dev, we might append timestamp to period or use upsert.
        // Let's use upsert.

        this.logger.log(`Saving to DB for ${stockSymbol} - Period: ${period}`);

        try {
            const result = await this.prisma.financialResult.upsert({
                where: {
                    stockSymbol_period_resultType: {
                        stockSymbol,
                        period,
                        resultType
                    }
                },
                update: {
                    revenue: parsedData.revenue,
                    netProfit: parsedData.netProfit,
                    eps: parsedData.eps,
                    reserves: parsedData.reserves,
                    totalAssets: parsedData.assets,
                    pdfUrl: pdfPath, // TODO: Upload to cloud storage
                    rawData: parsedData as any,
                    date: new Date()
                },
                create: {
                    stockSymbol,
                    period,
                    resultType,
                    revenue: parsedData.revenue,
                    netProfit: parsedData.netProfit,
                    eps: parsedData.eps,
                    reserves: parsedData.reserves,
                    totalAssets: parsedData.assets,
                    pdfUrl: pdfPath,
                    rawData: parsedData as any,
                    date: new Date()
                }
            });

            return { status: 'success', data: result };

        } catch (error) {
            this.logger.error('DB Save Failed:', error);
            // If foreign key fails (stock not found), return error
            return { status: 'error', message: 'Database save failed (Check if Stock exists)', error: error };
        }
    }

    private async downloadPdf(scripCode: string, companyName: string): Promise<string | null> {
        // ... (PUPPETEER LOGIC) ...
        // Re-implementing logic from previous step efficiently

        const userDataDir = path.join('/tmp', `puppeteer_user_data_${Date.now()}`);
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        const browser = await puppeteer.launch({
            headless: true,
            userDataDir: userDataDir,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-features=DownloadBubble,DownloadBubbleV2'],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        try {
            const page = await browser.newPage();
            // Anti-detection
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            const targetUrl = `${BseScraperService.BSE_URL}?Code=${scripCode}&Company=${encodeURIComponent(companyName)}&qtr=&RType=D`;
            this.logger.log(`Navigating: ${targetUrl}`);
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // LINK HUNTER LOGIC
            const allLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => ({ text: a.innerText.trim(), href: a.href }))
                    .filter(a => a.href && a.href.length > 0);
            });

            const directPdfLink = allLinks.find(a =>
                (a.href.toLowerCase().includes('attachlive') || a.href.toLowerCase().endsWith('.pdf')) &&
                !a.href.includes('javascript:')
            );

            if (directPdfLink) {
                const downloadDir = path.join('/tmp', 'downloads');
                if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
                const fileName = `${scripCode}_${Date.now()}.pdf`;
                const filePath = path.join(downloadDir, fileName);

                await FileDownloader.downloadFile(directPdfLink.href, filePath);
                return filePath;
            } else {
                this.logger.warn('Link Hunter failed. No direct PDF link found.');
                return null;
            }

        } catch (error) {
            this.logger.error('Puppeteer Error:', error);
            return null;
        } finally {
            if (browser) await browser.close();
        }
    }
}
