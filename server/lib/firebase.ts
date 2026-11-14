import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * Push (FCM) del lado servidor.
 *
 * Reglas de este módulo:
 * - Si Firebase no está configurado, la app sigue funcionando: cada envío es
 *   un no-op y solo se deja un log seguro (sin credenciales ni tokens).
 * - Nunca se registra el token FCM ni el contenido de la credencial.
 * - Se devuelve un resultado tipado para que `events.ts` pueda borrar tokens
 *   definitivamente inválidos sin afectar el flujo SSE.
 */

type InitState = "pending" | "ready" | "disabled";

let initState: InitState = "pending";

/** Códigos de FCM que indican que el token ya no sirve y debe eliminarse. */
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/** Claves reservadas por FCM; no pueden viajar dentro de `data`. */
const RESERVED_DATA_KEYS = new Set([
  "from",
  "message_type",
  "notification",
  "collapse_key",
]);

export type PushDeliveryResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: "no-token" | "not-configured" }
  | { status: "invalid-token"; code: string }
  | { status: "error"; code: string };

function readErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "unknown";
}

function disable(reason: string) {
  initState = "disabled";
  console.warn(`[Push] Deshabilitado: ${reason}. La app continúa sin notificaciones.`);
}

/**
 * Inicializa firebase-admin una sola vez. Devuelve true si quedó operativo.
 * Un fallo se recuerda para no reintentar en cada evento (evita ruido de logs).
 */
function initFirebase(): boolean {
  if (initState === "ready") return true;
  if (initState === "disabled") return false;

  try {
    if (getApps().length > 0) {
      initState = "ready";
      return true;
    }

    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (rawServiceAccount) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawServiceAccount) as Record<string, unknown>;
      } catch {
        disable("FIREBASE_SERVICE_ACCOUNT_JSON no es JSON válido");
        return false;
      }

      const projectId =
        typeof parsed.project_id === "string" ? parsed.project_id.trim() : "";
      const clientEmail =
        typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
      const privateKey =
        typeof parsed.private_key === "string"
          ? parsed.private_key.replace(/\\n/g, "\n").trim()
          : "";

      if (!projectId || !clientEmail || !privateKey) {
        disable("credenciales incompletas (project_id/client_email/private_key)");
        return false;
      }

      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      initState = "ready";
      console.log("[Push] Firebase Admin inicializado");
      return true;
    }

    // Application Default Credentials solo cuando hay una fuente explícita.
    // Sin ninguna variable, no se intenta metadata lookup (Render no la provee).
    const hasAdcSource = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT,
    );
    if (!hasAdcSource) {
      disable("sin credenciales FCM (FIREBASE_SERVICE_ACCOUNT_JSON/ADC)");
      return false;
    }

    initializeApp({ credential: applicationDefault() });
    initState = "ready";
    console.log("[Push] Firebase Admin inicializado con ADC");
    return true;
  } catch (error) {
    // Solo el código del error: nunca la credencial ni el token.
    disable(`no se pudo inicializar (${readErrorCode(error)})`);
    return false;
  }
}

/** FCM exige que todos los valores de `data` sean strings. */
function toDataPayload(data?: Record<string, unknown>): Record<string, string> {
  const payload: Record<string, string> = {};
  if (!data) return payload;

  for (const [key, value] of Object.entries(data)) {
    if (!key || RESERVED_DATA_KEYS.has(key)) continue;
    if (value === undefined || value === null) continue;

    let text: string;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" || typeof value === "boolean") text = String(value);
    else {
      try {
        text = JSON.stringify(value);
      } catch {
        continue;
      }
    }

    // Límite defensivo por valor; los payloads actuales son pequeños.
    payload[key] = text.length > 1024 ? text.slice(0, 1024) : text;
  }

  return payload;
}

export async function sendPushNotification(
  token: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<PushDeliveryResult> {
  if (!token || token.trim().length === 0) {
    return { status: "skipped", reason: "no-token" };
  }

  if (!initFirebase()) {
    return { status: "skipped", reason: "not-configured" };
  }

  try {
    const messageId = await getMessaging().send({
      notification: { title, body },
      data: toDataPayload(data),
      token,
      android: {
        priority: "high",
        ttl: 60 * 60 * 1000,
        notification: {
          sound: "default",
          channelId: "default_channel",
        },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    });

    return { status: "sent", messageId };
  } catch (error) {
    const code = readErrorCode(error);

    if (INVALID_TOKEN_CODES.has(code)) {
      // No se registra el token: solo el código.
      console.warn(`[Push] Token inválido (${code}); se eliminará del usuario.`);
      return { status: "invalid-token", code };
    }

    console.warn(`[Push] Error de envío (${code})`);
    return { status: "error", code };
  }
}