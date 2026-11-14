import { useEffect } from 'react';
import type {
  ActionPerformed,
  PushNotificationSchema,
  RegistrationError,
  Token,
} from '@capacitor/push-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { trpcMutate } from '@/hooks/useDeliveryData';
import { toast } from 'sonner';

type PushRole = 'customer' | 'driver' | 'merchant' | 'admin';

/** Endpoint de registro por rol. Admin no usa push nativo. */
const REGISTER_ENDPOINT: Record<Exclude<PushRole, 'admin'>, string> = {
  customer: 'customer.registerDeviceToken',
  driver: 'driver.registerDeviceToken',
  merchant: 'commerce.registerDeviceToken',
};

type ListenerHandle = { remove: () => Promise<void> };

export function usePushNotifications(
  role?: PushRole,
  enabled: boolean = true
) {
  useEffect(() => {
    // Solo registrar en dispositivos nativos (Android/iOS) y cuando la sesión
    // esté validada. En web/PWA no se pide permiso: el push web no está
    // implementado (requiere SDK JS de Firebase, VAPID y service worker).
    if (!enabled) return;
    if (!Capacitor.isNativePlatform()) return;
    if (!role || role === 'admin') return;

    let cancelled = false;
    const handles: ListenerHandle[] = [];

    const initPush = async () => {
      try {
        // Los listeners se registran ANTES de register(): el token puede
        // llegar antes de que termine la llamada.
        const registrationHandle = await PushNotifications.addListener(
          'registration',
          async (token: Token) => {
            if (cancelled) return;
            // Nunca imprimir el token completo.
            console.log('[Push] Token FCM recibido; guardando en backend');
            try {
              await trpcMutate(REGISTER_ENDPOINT[role], { token: token.value });
              console.log(`[Push] Token registrado para rol: ${role}`);
            } catch {
              console.warn('[Push] No se pudo guardar el token en el backend');
            }
          },
        );
        if (cancelled) {
          await registrationHandle.remove().catch(() => {});
          return;
        }
        handles.push(registrationHandle);

        const errorHandle = await PushNotifications.addListener(
          'registrationError',
          (error: RegistrationError) => {
            // Solo el mensaje del plugin; no contiene el token.
            console.warn('[Push] Registro FCM falló:', error.error);
          },
        );
        if (cancelled) {
          await errorHandle.remove().catch(() => {});
          return;
        }
        handles.push(errorHandle);

        const receivedHandle = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification: PushNotificationSchema) => {
            toast(notification.title || 'Nueva notificación', {
              description: notification.body,
              icon: '🔔',
              duration: 5000,
            });
          },
        );
        if (cancelled) {
          await receivedHandle.remove().catch(() => {});
          return;
        }
        handles.push(receivedHandle);

        const actionHandle = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (_action: ActionPerformed) => {
            // La navegación por deep link queda pendiente; no loguear payload.
          },
        );
        if (cancelled) {
          await actionHandle.remove().catch(() => {});
          return;
        }
        handles.push(actionHandle);

        if (cancelled) return;

        // En Android, crear el canal antes de pedir permiso/registrar.
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'default_channel',
            name: 'Notificaciones de Pedidos',
            description: 'Canal principal para alertas de pedidos y chat',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
          }).catch(() => {
            console.warn('[Push] No se pudo crear el canal de Android');
          });
        }

        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === 'prompt') {
          permission = await PushNotifications.requestPermissions();
        }
        if (permission.receive !== 'granted') {
          console.log('[Push] Permiso de notificaciones denegado');
          return;
        }

        if (cancelled) return;
        await PushNotifications.register();
      } catch (error) {
        console.warn(
          '[Push] No se pudo inicializar:',
          error instanceof Error ? error.name : 'unknown',
        );
      }
    };

    void initPush();

    return () => {
      cancelled = true;
      for (const handle of handles) {
        handle.remove().catch(() => {});
      }
    };
  }, [role, enabled]);
}