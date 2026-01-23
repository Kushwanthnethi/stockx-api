
async function test() {
    try {
        const imported = await import('yahoo-finance2');
        console.log('Keys:', Object.keys(imported));
        console.log('Default type:', typeof imported.default);
        console.log('Default is constructor?', imported.default.prototype && imported.default.prototype.constructor === imported.default);
        console.log('Default keys:', Object.keys(imported.default));

        // Try to identify if it has quoteSummary
        if (imported.default.quoteSummary) {
            console.log('Default has quoteSummary method.');
        } else {
            console.log('Default DOES NOT have quoteSummary method.');
        }

    } catch (e) {
        console.error(e);
    }
}

test();
