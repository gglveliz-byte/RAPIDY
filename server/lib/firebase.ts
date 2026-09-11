import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// Initialize Firebase Admin lazily to avoid crashing if credentials aren't set yet.
let initialized = false;

function initFirebase() {
  if (initialized) return;
  try {
    // If GOOGLE_APPLICATION_CREDENTIALS is set in .env, firebase-admin automatically uses it.
    // If not, and we are in dev, it might fail, so we wrap in try-catch.
    if (!getApps().length) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // En producción (Render), leer el JSON directamente desde una variable de entorno
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        // En local, usa el archivo que pusimos en .env (GOOGLE_APPLICATION_CREDENTIALS)
        initializeApp({
          credential: applicationDefault(),
        });
      }
    }
    initialized = true;
    console.log('[Firebase] Initialized successfully');
  } catch (error) {
    console.warn('[Firebase] Warning: Failed to initialize. Push notifications will not work until credentials are provided.');
  }
}

export async function sendPushNotification(token: string | null | undefined, title: string, body: string, data?: Record<string, string>) {
  if (!token) return;
  
  if (!initialized) {
    initFirebase();
  }

  // If still not initialized (e.g. no credentials), silently fail so we don't break the app flow
  if (!initialized) return;

  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      token,
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          channelId: 'default_channel',
        }
      }
    };

    const response = await getMessaging().send(message);
    console.log('[Firebase] Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('[Firebase] Error sending message:', error);
  }
}
