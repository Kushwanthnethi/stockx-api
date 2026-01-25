import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin SDK
// This ensures we only initialize once
if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        storageBucket: 'stockx-42ea2.firebasestorage.app' // Derived from project_id + standard suffix
    });
}

const bucket = admin.storage().bucket();

export { admin, bucket };
