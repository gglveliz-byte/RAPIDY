import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { trpc } from '@/utils/trpc';
import toast from 'react-hot-toast';

export function usePushNotifications(role: 'customer' | 'driver' | 'merchant') {
  const registerCustomerToken = trpc.customer.registerDeviceToken.useMutation();
  const registerDriverToken = trpc.driver.registerDeviceToken.useMutation();
  const registerMerchantToken = trpc.commerce.registerDeviceToken.useMutation();

  useEffect(() => {
    // Solo registrar en dispositivos nativos (Android/iOS)
    if (!Capacitor.isNativePlatform()) return;

    const registerPush = async () => {
      try {
        // Pedir permisos al usuario
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
          console.log('[Push] Permiso denegado por el usuario');
          return;
        }

        // Registrar con Apple / Google para recibir el token
        await PushNotifications.register();

        // Escuchar el token generado
        PushNotifications.addListener('registration', (token) => {
          console.log('[Push] Push registration success, token: ' + token.value);
          
          // Enviar el token al backend dependiendo del rol
          if (role === 'customer') {
            registerCustomerToken.mutate({ token: token.value });
          } else if (role === 'driver') {
            registerDriverToken.mutate({ token: token.value });
          } else if (role === 'merchant') {
            registerMerchantToken.mutate({ token: token.value });
          }
        });

        PushNotifications.addListener('registrationError', (error: any) => {
          console.error('[Push] Error on registration: ' + JSON.stringify(error));
        });

        PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            console.log('[Push] Push received: ', notification);
            // Mostrar un toast interno si la app está en primer plano
            toast.success(`${notification.title}\n${notification.body}`, {
              duration: 5000,
              icon: '🔔'
            });
          },
        );

        PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (notification) => {
            console.log('[Push] Push action performed: ', notification);
            // Aquí se podría redirigir a una pantalla específica según los datos (data) de la notificación
          },
        );
      } catch (error) {
        console.error('[Push] Hubo un error inicializando push: ', error);
      }
    };

    registerPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [role]);
}
