try {
    console.log('Requiring puppeteer...');
    const puppeteer = require('puppeteer');
    console.log('Puppeteer version:', require('puppeteer/package.json').version);
    console.log('Success!');
} catch (e) {
    console.error('Failed:', e);
}
