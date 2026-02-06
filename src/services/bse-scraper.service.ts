
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

            // Optimization: Block images/fonts/css to speed up load
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
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
                console.log('Detected PostBack link, initiating click download...');

                // 1. Configure download behavior using CDP
                const client = await page.target().createCDPSession();
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: downloadDir,
                });

                // 2. Click the link
                // We use DOM click() via evaluate because puppeteer's page.click() checks for visibility/overlays
                // and often fails on these old ASP.NET sites if the element is slightly covered or off-screen.
                await page.evaluate(() => {
                    const el = document.querySelector('#ContentPlaceHolder1_lnkDownload') as HTMLElement;
                    if (el) {
                        el.click();
                    } else {
                        // Fallback: try to find any link with .pdf logic again if ID fails
                        const anchors = Array.from(document.querySelectorAll('a'));
                        const pdfAnchor = anchors.find(a => a.href && a.href.toLowerCase().includes('.pdf'));
                        if (pdfAnchor) pdfAnchor.click();
                    }
                });

                // 3. Wait for file to appear
                // We poll the directory for a new .pdf file
                console.log('Waiting for file to appear in:', downloadDir);

                let downloadedFile: string | null = null;
                const maxRetries = 300; // 300 seconds (5 minutes) - Increased for slow Render Node env

                for (let i = 0; i < maxRetries; i++) {
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s

                    const files = fs.readdirSync(downloadDir);
                    console.log(`[${i}/${maxRetries}] Files in ${downloadDir}:`, files);
                    // Find the most recently created PDF file that isn't a partial download (.crdownload)
                    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

                    if (pdfFiles.length > 0) {
                        // Get the latest one
                        const latestFile = pdfFiles.map(f => ({
                            name: f,
                            time: fs.statSync(path.join(downloadDir, f)).mtime.getTime()
                        })).sort((a, b) => b.time - a.time)[0];

                        // Ensure it's new (created in the last minute)
                        if (Date.now() - latestFile.time < 60000) {
                            downloadedFile = path.join(downloadDir, latestFile.name);
                            break;
                        }
                    }
                }

                if (!downloadedFile) {
                    const files = fs.readdirSync(downloadDir);
                    throw new Error(`Download timeout: File did not appear in directory within ${maxRetries}s. Files present: ${JSON.stringify(files)}`);
                }

                // 4. Rename to our meaningful filename
                const finalPath = path.join(downloadDir, `${scripCode}_${Date.now()}.pdf`);
                fs.renameSync(downloadedFile, finalPath);

                console.log(`Downloaded (via Click) to: ${finalPath}`);
                return finalPath;
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
