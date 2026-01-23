
async function verify() {
    try {
        const res = await fetch('http://localhost:3333/stocks/news');
        console.log('Status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('News items:', data.length);
            console.log('Sample:', data[0]);
        } else {
            console.log('Error:', await res.text());
        }
    } catch (e) {
        console.error(e);
    }
}
verify();
