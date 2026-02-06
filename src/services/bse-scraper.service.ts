
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
            page.on('console', async msg => {
                const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
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

            // Download the file
            // Use /tmp for Render compatibility (guaranteed writable)
            const downloadDir = path.join('/tmp', 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }

            // Setup CDP immediately for reliability
            try {
                const client = await page.createCDPSession();
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: downloadDir,
                });
                console.log('CDP Download Behavior set to:', downloadDir);
            } catch (cdpError) {
                console.error('Failed to set CDP download behavior:', cdpError);
            }

            // Also try to set it on the browser context level if possible (extra safety)
            try {
                // @ts-ignore
                if (browser.defaultBrowserContext().overridePermissions) {
                    // @ts-ignore
                    await browser.defaultBrowserContext().overridePermissions(this.BSE_URL, ['read-clipboard', 'clipboard-read', 'clipboard-write']);
                }
            } catch (e) { }

            // Monitor new targets (popups)
            browser.on('targetcreated', async (target) => {
                console.log('New browser target created:', target.type(), target.url());
            });

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

                // Re-enforce download behavior (just in case)
                const client = await page.createCDPSession();
                await client.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: downloadDir,
                });

                // 2. Click the link
                console.log('Waiting for download button to be ready...');
                try {
                    await page.waitForSelector('#ContentPlaceHolder1_lnkDownload', { timeout: 15000 });
                } catch (e) {
                    console.warn('Selector wait timed out, attempting click anyway...');
                }

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
