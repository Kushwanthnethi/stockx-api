
import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { FileDownloader } from '../utils/file-downloader';

export class BseScraperService {
    private static readonly BSE_URL = 'https://www.bseindia.com/corporates/results.aspx';

    /**
     * Scrapes the BSE website for the latest financial result PDF for a given scrip code.
     * @param scripCode The 6-digit BSE scrip code (e.g., 500325)
     * @param companyName The company name (optional, used for URL params)
     */
    static async getLatestFinancialPdf(scripCode: string, companyName: string = ''): Promise<string | null> {
        console.log(`Starting scrape for ${scripCode}...`);

        // Launch logic tailored for Render/Cloud environments
        const browser = await puppeteer.launch({
            headless: true, // Use new Headless mode
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Critical for Docker/Render environments to avoid shared memory crashes
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu'
            ],
            // If we are on Render, we might need to specify executablePath if the buildpack puts it elsewhere.
            // Usually, the buildpack sets PUPPETEER_EXECUTABLE_PATH env var, which puppeteer respects automatically.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        try {
            const page = await browser.newPage();

            // Set a real User-Agent to avoid immediate 403s
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Construct URL (approximate, usually we search first but direct link works often)
            const targetUrl = `${this.BSE_URL}?Code=${scripCode}&Company=${encodeURIComponent(companyName)}&qtr=&RType=D`; // RType=D for Detailed
            console.log(`Navigating to: ${targetUrl}`);

            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Logic to find the PDF link
            // We look for the "Download" icon or link. BSE structure varies, but usually it's an anchor with .pdf or onclick
            // This selector targets the specific download link ID pattern on BSE results page
            const pdfLink = await page.evaluate(() => {
                // Attempt 1: The standard download icon/link
                const downloadBtn = document.querySelector('#ContentPlaceHolder1_lnkDownload') as HTMLAnchorElement;
                if (downloadBtn && downloadBtn.href) return downloadBtn.href;

                // Attempt 2: Search all links for .pdf
                const anchors = Array.from(document.querySelectorAll('a'));
                const pdfAnchor = anchors.find(a => a.href && a.href.toLowerCase().includes('.pdf'));
                return pdfAnchor ? pdfAnchor.href : null;
            });

            if (!pdfLink) {
                console.warn('No PDF link found on the page.');
                return null;
            }

            console.log(`Found PDF Link: ${pdfLink}`);

            // Download the file
            const downloadDir = path.join(process.cwd(), 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            const fileName = `${scripCode}_${Date.now()}.pdf`;
            const filePath = path.join(downloadDir, fileName);

            // Use our utility to download
            // Note: BSE links are often 'javascript:__doPostBack', which is tricky. 
            // If the link is a direct http link (common in 'AttachLive' pattern), this works.
            // If it's a postback, we'd need to intercept the response, which is more advanced.
            // For this implementation, we assume it extracts the 'AttachLive' pattern or we click it.

            // If it's a javascript: link, we need to click it and intercept the download event
            if (pdfLink.includes('javascript:')) {
                // Advanced: Click and wait for download
                // For now, let's assume valid direct links or simplified logic for this stage.
                // In reality, BSE often uses direct links in the 'XBRL/PDF' columns for recent results.
                // Let's assume we grabbed a direct link for POC.

                // Fallback: If we can't get a direct link, we might return null for now.
                console.warn('Only found javascript postback link. Advanced click handling required.');
                return null;
            }

            await FileDownloader.downloadFile(pdfLink, filePath);
            console.log(`Downloaded to: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error('Scraping failed:', error);
            throw error;
        } finally {
            await browser.close();
        }
    }
}
