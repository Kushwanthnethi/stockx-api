
require('dotenv').config();

async function testKey() {
    const key = process.env.GEMINI_API_KEY;
    console.log(`Testing Key: '${key}' (Length: ${key.length})`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error("API Error Status:", response.status);
            console.error("API Error Body:", JSON.stringify(data, null, 2));
        } else {
            console.log("Success! Models found:");
            if (data.models) {
                console.log("Available Models:");
                data.models.forEach(m => console.log("- " + m.name.replace("models/", "")));
            } else {
                console.log("No models returned (unexpected but successful auth)");
            }
        }
    } catch (error) {
        console.error("Network/Script Error:", error);
    }
}

testKey();
