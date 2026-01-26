
const https = require('https');

function testUrl(url) {
    return new Promise((resolve, reject) => {
        console.log(`Testing ${url}...`);
        const req = https.get(url, (res) => {
            console.log(`${url} => Status: ${res.statusCode}`);
            res.resume(); // consume response
            resolve();
        }).on('error', (e) => {
            console.log(`${url} => ERROR: ${e.message}`);
            resolve(); // Verify next
        });
    });
}

async function run() {
    await testUrl('https://www.google.com');
    await testUrl('https://generativelanguage.googleapis.com');
}

run();
