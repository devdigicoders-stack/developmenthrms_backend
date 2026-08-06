import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the service account key
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

let firebaseInitialized = false;

try {
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        initializeApp({
            credential: cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log("Firebase Admin initialized successfully.");
    } else {
        console.warn("Firebase service account JSON not found. Push notifications will be disabled.");
    }
} catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
}

export const sendPushNotification = async (fcmToken, title, body, data = {}) => {
    if (!firebaseInitialized) {
        console.log("Firebase is not initialized. Skipping push notification:", title);
        return false;
    }
    
    if (!fcmToken) return false;

    const message = {
        notification: {
            title,
            body
        },
        webpush: {
            notification: {
                icon: '/logo1.png'
            }
        },
        data: {
            ...data,
        },
        token: fcmToken
    };

    try {
        const response = await getMessaging().send(message);
        console.log('Successfully sent message:', response);
        return true;
    } catch (error) {
        console.error('Error sending message:', error);
        return false;
    }
};
