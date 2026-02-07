
import axios from 'axios';
import * as qs from 'qs';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer, { ConsoleMessage, Protocol } from 'puppeteer';

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
            // THE AXIOS BYPASS: Stop using Browser Download Manager
            // ---------------------------------------------------------

            // 1. Get the cookies from the page (session persistence)
            const cookies = await page.cookies();
            const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

            // 2. Extract the hidden ASP.NET form fields (ViewState, etc.)
            const formData = await page.evaluate(() => {
                const getInput = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
                return {
                    '__VIEWSTATE': getInput('__VIEWSTATE'),
                    '__VIEWSTATEGENERATOR': getInput('__VIEWSTATEGENERATOR'),
                    '__EVENTVALIDATION': getInput('__EVENTVALIDATION'),
                    // Add other potential hidden fields if needed
                };
            });

            console.log('Extracted ASP.NET tokens.');

            // 3. Extract the __doPostBack arguments from the link
            // Link: javascript:__doPostBack('ctl00$ContentPlaceHolder1$lnkDownload','')
            let target = '';
            let argument = '';
            if (pdfLink.includes('javascript:')) {
                const match = /__doPostBack\('([^']*)','([^']*)'\)/.exec(pdfLink);
                if (match) {
                    target = match[1];
                    argument = match[2];
                }
            } else {
                // If it's a direct link, just download it directly (rare)
                console.log('Direct link found, downloading without POST...');
                // ... direct download logic if needed, but assuming PostBack for now
            }

            console.log(`Preparing Axios POST: Target=${target}`);

            // 4. Construct the full payload
            const payload = {
                ...formData,
                '__EVENTTARGET': target,
                '__EVENTARGUMENT': argument,
                // Add any other inputs that might be on the form? Usually just these are enough.
            };

            // 5. Send POST request directly
            // Use /tmp for Render compatibility
            const downloadDir = path.join('/tmp', 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true });
            }
            const fileName = `${scripCode}_${Date.now()}.pdf`;
            const filePath = path.join(downloadDir, fileName);

            console.log('Sending direct HTTP POST request...');
            const response = await axios({
                method: 'post',
                url: page.url(), // Use current page URL (results.aspx?...)
                data: qs.stringify(payload),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookieString,
                    'User-Agent': await page.browser().userAgent(),
                    'Referer': page.url()
                },
                responseType: 'stream'
            });

            // 6. Pipe to file
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            await new Promise<void>((resolve, reject) => {
                writer.on('finish', () => resolve());
                writer.on('error', reject);
            });

            console.log(`Direct Download Successful: ${filePath}`);
            return filePath;

        } catch (error) {
            console.error('Scraping failed:', error);
            throw error;
        } finally {
            await browser.close();
        }
    }
}
