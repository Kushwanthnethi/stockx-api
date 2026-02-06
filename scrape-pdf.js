const puppeteer = require('puppeteer');

async function scrapeBSE(scripCode) {
    console.log(`Starting Scraper for Scrip Code: ${scripCode}...`);
    const browser = await puppeteer.launch({
        headless: true, // Set to false to see the browser UI for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        // Navigate to BSE Corporate Results (or a direct search URL if possible)
        // Direct approach: Go to the "Financial Results" page for the specific company
        // For Reliance (500325), we can try constructing a specific URL or searching.
        // Let's try the generic Results page which is often easier to scape:
        const url = `https://www.bseindia.com/corporates/results.aspx?Code=${scripCode}&Company=${scripCode}&qtr=202403&RType=D`;

        console.log(`Navigating to: ${url}`);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2' });

        // Wait for the table to load (BSE uses #ContentPlaceHolder1_tblResult)
        await page.waitForSelector('#ContentPlaceHolder1_tblResult', { timeout: 10000 });

        // Extract the PDF link
        // It's usually in a table cell, looking for an anchor tag with a specific class or text
        const pdfLink = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_tblResult tr'));
            // Skip header, check first data row
            for (const row of rows) {
                const anchors = Array.from(row.querySelectorAll('a'));
                for (const anchor of anchors) {
                    if (anchor.href && anchor.href.includes('.pdf')) {
                        return anchor.href;
                    }
                }
            }
            return null;
        });

        if (pdfLink) {
            console.log(`\n[SUCCESS] Found PDF Link: ${pdfLink}`);
        } else {
            console.log('\n[FAIL] No PDF link found on the results page.');
            // Dump page content for debugging if needed
            // const content = await page.content();
            // console.log(content.substring(0, 500)); 
        }

    } catch (e) {
        console.error('Scraping failed:', e.message);
    } finally {
        await browser.close();
    }
}

// Scrip Code for Reliance is 500325
scrapeBSE('500325');
