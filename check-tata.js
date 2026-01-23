const axios = require('axios');

async function checkPrice() {
    try {
        console.log("Checking TATAMOTORS.NS price...");
        const res = await axios.post('http://localhost:3333/stocks/batch', {
            symbols: ['TATAMOTORS.NS', 'ITC.NS']
        });
        console.log("Response:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) console.error("Data:", e.response.data);
    }
}

checkPrice();
