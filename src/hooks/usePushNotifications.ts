import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { trpcMutate } from '@/hooks/useDeliveryData';
import { toast } from 'sonner';

export function usePushNotifications(
  role?: 'customer' | 'driver' | 'merchant' | 'admin',
  enabled: boolean = true
) {
  useEffect(() => {
    // Solo registrar en dispositivos nativos (Android/iOS) y cuando la sesión esté validada
    if (!enabled) return;
    if (!Capacitor.isNativePlatform()) return;
    if (!role || role === 'admin') return;

    let isMounted = true;

    const initPush = async () => {
      try {
        // En Android, crear el canal de notificación para asegurar sonido y visualización
        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'default_channel',
            name: 'Notificaciones de Pedidos',
            description: 'Canal principal para alertas de pedidos y chat',
            importance: 5,
            visibility: 1,
            sound: 'default',
            vibration: true,
          }).catch(err => console.warn('[Push] Error creando canal:', err));
        }

        // Pedir permisos al usuario
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('[Push] Permiso de notificaciones denegado');
          return;
        }

        // Registrar con FCM / APNS para recibir el token
        await PushNotifications.register();

        // Escuchar el token generado
        await PushNotifications.addListener('registration', async (token) => {
          if (!isMounted) return;
          console.log('[Push] Push registration success, token:', token.value);

          try {
            if (role === 'customer') {
              await trpcMutate('customer.registerDeviceToken', { token: token.value });
            } else if (role === 'driver') {
              await trpcMutate('driver.registerDeviceToken', { token: token.value });
            } else if (role === 'merchant') {
              await trpcMutate('commerce.registerDeviceToken', { token: token.value });
            }
            console.log(`[Push] Token registrado exitosamente para rol: ${role}`);
          } catch (tokenErr) {
            console.error('[Push] Error guardando token en backend:', tokenErr);
          }
        });

        await PushNotifications.addListener('registrationError', (error: any) => {
          console.error('[Push] Error en registro FCM:', JSON.stringify(error));
        });

        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Push] Push recibido en primer plano:', notification);
          toast(notification.title || 'Nueva notificación', {
            description: notification.body,
            icon: '🔔',
            duration: 5000,
          });
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Push] Notificación tocada:', action);
        });
      } catch (error) {
        console.error('[Push] Hubo un error inicializando push:', error);
      }
    };

    initPush();

    return () => {
      isMounted = false;
      PushNotifications.removeAllListeners().catch(() => {});
    };
  }, [role, enabled]);
}
