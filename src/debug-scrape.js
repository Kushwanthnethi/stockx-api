const axios = require('axios');

async function debugScrape() {
    try {
        const url = 'http://localhost:3333/api/scrape/LICI.NS';
        console.log(`Calling ${url}...`);
        const response = await axios.get(url);
        console.log('Success:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('--- API ERROR RESPONSE ---');
            console.log('Status:', error.response.status);
            console.log('Message:', error.response.data.message);
            console.log('Full Data:', JSON.stringify(error.response.data, null, 2));
            console.log('--------------------------');
        } else {
            console.error('Error Message:', error.message);
        }
    }
}

debugScrape();
