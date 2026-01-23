
async function testEndpoint() {
    try {
        const res = await fetch('http://localhost:3333/stocks/RELIANCE.NS/quarterly');
        if (!res.ok) {
            console.log("Status:", res.status);
            console.log("Text:", await res.text());
        } else {
            const json = await res.json();
            console.log("Data:", JSON.stringify(json, null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}
testEndpoint();
