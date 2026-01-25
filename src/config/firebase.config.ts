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
        const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
        credential = admin.credential.cert(serviceAccountPath);
    }

    admin.initializeApp({
        credential,
        storageBucket: 'stockx-42ea2.firebasestorage.app' // Derived from project_id + standard suffix
    });
}

const bucket = admin.storage().bucket();

export { admin, bucket };
