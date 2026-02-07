
import axios from 'axios';
import * as qs from 'qs';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { ConsoleMessage, Protocol } from 'puppeteer';
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
        // "Hail Mary" Launch Config: Force a writable profile path
        const userDataDir = path.join('/tmp', `puppeteer_user_data_${Date.now()}`);
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        const browser = await puppeteer.launch({
            headless: true, // Use new Headless mode (default in newer versions)
            userDataDir: userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Critical for Docker/Render environments
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                // Chrome 117+ new headless download fix: ensure no bubbling alert blocks downloads
                '--disable-features=DownloadBubble,DownloadBubbleV2'
            ],
            // If we are on Render, we might need to specify executablePath if the buildpack puts it elsewhere.
            // Usually, the buildpack sets PUPPETEER_EXECUTABLE_PATH env var, which puppeteer respects automatically.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        });

        try {

            const page = await browser.newPage();

            // Optimization: Block images/fonts/css to speed up load
            // Optimization: Request interception removed to reduce potential breakage
            // await page.setRequestInterception(true);

            // Capture browser console logs with full details
            page.on('console', async (msg: ConsoleMessage) => {
                const args = await Promise.all(msg.args().map((arg: any) => arg.jsonValue()));
                console.log('PAGE LOG:', msg.text(), args);
            });

            // Anti-detection: Mask WebDriver property
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            // Set a real User-Agent to avoid immediate 403s
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Construct URL (approximate, usually we search first but direct link works often)
            const targetUrl = `${this.BSE_URL}?Code=${scripCode}&Company=${encodeURIComponent(companyName)}&qtr=&RType=D`; // RType=D for Detailed
            console.log(`Navigating to: ${targetUrl}`);

            // Changed to 'domcontentloaded' for speed (we don't need full network idle)
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });

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

            // ---------------------------------------------------------
            // THE LINK HUNTER: Find the direct PDF link
            // ---------------------------------------------------------

            // 1. Get all links
            const allLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => ({
                        text: a.innerText.trim(),
                        href: a.href
                    }))
                    .filter(a => a.href && a.href.length > 0);
            });

            // 2. Check for "AttachLive" or ".pdf" which are direct links
            const directPdfLink = allLinks.find(a =>
                (a.href.toLowerCase().includes('attachlive') || a.href.toLowerCase().endsWith('.pdf')) &&
                !a.href.includes('javascript:')
            );

            if (directPdfLink) {
                // Download directly using axios
                const downloadDir = path.join('/tmp', 'downloads');
                if (!fs.existsSync(downloadDir)) {
                    fs.mkdirSync(downloadDir, { recursive: true });
                }
                const fileName = `${scripCode}_${Date.now()}.pdf`;
                const filePath = path.join(downloadDir, fileName);

                await FileDownloader.downloadFile(directPdfLink.href, filePath);
                return filePath;
            }

            // If we reach here, we didn't find a direct link (and bypass is disabled)
            console.warn('Could not find direct PDF link. Scraper may need update.');
            return null;

        } catch (error) {
            console.error('Scraping failed:', error);
            try {
                // If it was a browser error, we can try to close it
                // but pages are closed in finally block.
                // Log page content for debugging if available
                // @ts-ignore
                // if (page) console.log('Page Content on Error:', await page.content());
            } catch (e) { }
            return null;
        } finally {
            try {
                if (browser) await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e);
            }
        }
    }
}
