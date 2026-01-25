import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin SDK
// This ensures we only initialize once
if (!admin.apps.length) {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Production: Use environment variable
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            credential = admin.credential.cert(serviceAccount);
        } catch (error) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable');
            throw error;
        }
    } else {
        // Development: Local file fallback
        // Resolving relative to process.cwd() (project root) is safer than __dirname in compiled code
        const serviceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');

        console.log('Firebase Config: Resolving key at:', serviceAccountPath);
        // Check if file exists to prevent hard crash 500
        if (!require('fs').existsSync(serviceAccountPath)) {
            console.error('CRITICAL: serviceAccountKey.json not found at:', serviceAccountPath);
            // Don't throw here to avoid crashing entire app startup, let it fail on init if must
        }
        credential = admin.credential.cert(serviceAccountPath);
    }

    admin.initializeApp({
        credential,
        storageBucket: 'stockx-42ea2.appspot.com' // Default bucket is usually project-id.appspot.com
    });
}

const bucket = admin.storage().bucket();

export { admin, bucket };
