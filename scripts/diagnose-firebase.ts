import * as admin from 'firebase-admin';
import * as path from 'path';

async function diagnose() {
    console.log('Diagnosing Firebase Storage...');

    // Resolve Key (Assumption: run from project root)
    const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
    console.log('Using Key:', serviceAccountPath);

    if (!require('fs').existsSync(serviceAccountPath)) {
        console.error('ERROR: key not found locally!');
        return;
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });

        console.log('Authenticated. Listing buckets...');
        const [buckets] = await admin.storage().getBuckets();

        if (buckets.length === 0) {
            console.error('NO BUCKETS FOUND! Storage might not be enabled in console.');
        } else {
            console.log('Available Configured Buckets:');
            buckets.forEach(b => console.log(`- ${b.name}`));
        }

    } catch (error) {
        console.error('Diagnosis Failed:', error);
    }
}

diagnose();
