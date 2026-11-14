# Push / FCM — Frente 7 (producción)

**Archivos de este frente:** `server/lib/firebase.ts`, `server/events.ts`,
`src/hooks/usePushNotifications.ts`, este documento.
**Alcance:** push nativo Android/iOS vía Capacitor + Firebase Admin. El push web
(PWA) **no está implementado** (ver §8).

---

## 1. Auditoría inicial y cambios aplicados

| Punto | Hallazgo | Acción |
|---|---|---|
| Inicialización | `initialized` solo se marcaba en éxito; un fallo se reintentaba (y logueaba) en cada evento. | Estado único `pending/ready/disabled`; se intenta una vez por proceso. |
| Sin credenciales | `applicationDefault()` se intentaba siempre, incluso en Render sin ADC (metadata lookup). | Sin `FIREBASE_SERVICE_ACCOUNT_JSON` ni fuente ADC explícita, se desactiva de inmediato con log seguro. |
| Payload `data` | `events.ts` enviaba números (`orderId`); FCM exige strings y el envío fallaba en silencio. | Serialización a string, descarte de `null/undefined` y claves reservadas, tope de 1024 chars por valor. |
| Errores | Se logueaba el objeto de error completo (riesgo de parámetros/token). | Solo se loguea el `code` de FCM. Nunca el token ni la credencial. |
| Token inválido | No se limpiaba `fcm_token`; el envío fallaba para siempre. | Resultado tipado `invalid-token` y limpieza en `events.ts` solo para códigos definitivos. |
| SSE | El push se dispara después de SSE con `.catch()`. | Se mantiene; los fallos de push/DB nunca afectan al `emit` ni al stream. |
| Hook nativo | `register()` se llamaba antes de adjuntar `registration` (race: se podía perder el token). | Listeners primero, `register()` al final. |
| Hook nativo | `removeAllListeners()` podía borrar listeners de otros consumidores. | Se guardan y eliminan solo los handles propios, con guarda de cancelación. |
| Logs cliente | Se imprimía `token.value` completo. | Ya no se imprime el token. |

---

## 2. Flujo

```
emit(channel, data)
  ├─ SSE a listeners conectados (siempre, primero)
  └─ handlePushNotification() fire-and-forget
       ├─ commerce:<id>  new_order        → users.fcm_token (merchantUserId)
       ├─ driver:<id>    new_available | order_assigned → drivers.fcm_token
       └─ order:<id>     status_update | chat_message | commerce_ready
                                          → customers.fcm_token
```

Deduplicación en memoria: 15 s por evento (5 s en chat). Límite de 5.000 claves
con poda automática. Es por proceso: con varias instancias pueden salir pushes
duplicados; es aceptable porque el cliente también recibe SSE.

`sendPushNotification()` devuelve:

- `{ status: "sent", messageId }`
- `{ status: "skipped", reason: "no-token" | "not-configured" }`
- `{ status: "invalid-token", code }`
- `{ status: "error", code }`

---

## 3. Credenciales necesarias

### Servidor (Render/Vercel/Docker)

- **Recomendada:** `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON completo del
  service account en **una sola línea**. Debe contener `project_id`,
  `client_email` y `private_key`. Es un secreto: nunca se commitea.
- **Alternativa ADC:** `GOOGLE_APPLICATION_CREDENTIALS=/ruta/fuera-del-repo/sa.json`
  (o `GCLOUD_PROJECT`/`GOOGLE_CLOUD_PROJECT` en un entorno GCP real).
- Si no hay ninguna fuente, el push queda deshabilitado (no-op). No se inventan
  credenciales; `.env.example` ya trae los placeholders.

Rotación: crear nueva clave en Firebase Console → actualizar la variable →
reiniciar el proceso (la inicialización es perezosa y única). No requiere
migraciones ni cambios de BD.

### Android

- `android/app/google-services.json` debe existir y pertenecer **al mismo
  proyecto** que el service account del servidor (ya existe en el repo; no
  commitear credenciales nuevas sin revisar `.gitignore`).
- El plugin `com.google.gms.google-services` debe estar aplicado en Gradle y el
  `applicationId` debe coincidir con el registrado en Firebase.
- Android 13+: permiso runtime `POST_NOTIFICATIONS` (lo pide el plugin).

### iOS

- `GoogleService-Info.plist` agregado al target en Xcode.
- Capability **Push Notifications** + **Background Modes → Remote notifications**.
- Clave APNs `.p8` (Key ID + Team ID) subida en Firebase Console.
- Perfil de aprovisionamiento con el entitlement `aps-environment`.

---

## 4. Sin configuración: comportamiento seguro

- Primer envío → `initFirebase()` detecta ausencia/JSON inválido/credencial
  incompleta → `[Push] Deshabilitado: <motivo>. La app continúa sin
  notificaciones.`
- Todos los envíos posteriores devuelven `skipped` sin reintentar ni ensuciar
  logs. El servidor, el SSE, los pedidos y el chat siguen funcionando.
- Para reactivar: cargar la variable y reiniciar el proceso.
- Si Firebase está configurado pero FCM falla (red, cuota, credencial revocada),
  se registra solo `[Push] Error de envío (<code>)` y el flujo de negocio
  continúa. No se borra el token salvo que el código sea definitivo.

---

## 5. Tokens inválidos y logout

Códigos que limpian `fcm_token`:

- `messaging/registration-token-not-registered`
- `messaging/invalid-registration-token`

La limpieza es **race-safe**: `UPDATE ... WHERE id = ? AND fcm_token = ?`. Si el
usuario registró un token nuevo mientras el envío estaba en vuelo, no se pisa.
Un error genérico (credencial, red, payload) **no** borra el token. La limpieza
corre dentro de `clearInvalidToken()` con `try/catch`; un fallo de BD solo deja
un log y jamás rompe el SSE.

| Rol | Logout | ¿Limpia token? |
|---|---|---|
| Cliente | `customer.logout` (y `deleteAccount`) | Sí, en servidor. |
| Repartidor | `driver.logoutSession` y `login.logout scope=driver` | Sí, en servidor. |
| Comercio | `commerce.unregisterDeviceToken` en `CommerceLayout`/`Profile`, luego `login.logout` | Sí, pero depende del cliente. |
| Admin | No usa push nativo | N/A. |

**Deuda detectada (archivo no asignado, no editado):**
`server/login-router.ts` no pone `fcmToken: null` al cerrar sesión de merchant.
Si el logout se hace por otra vía (expiración, otra pestaña, llamada directa a
`login.logout scope=merchant`), el token queda huérfano hasta el siguiente
registro. Recomendación: agregar `fcmToken: null` allí.

**Limitación:** hay un solo `fcm_token` por cuenta. El último dispositivo que
inicia sesión gana; no hay soporte multi-dispositivo. Además, al registrarse un
token no se borra de otras cuentas del mismo dispositivo (otro usuario podría
recibir un push ajeno hasta que cierre sesión). Requiere cambios en
`customer-router.ts`, `driver-router.ts` y `commerce-router.ts` (no asignados).

---

## 6. Permiso y registro en el cliente

`usePushNotifications(role, enabled)`:

- Solo actúa si `enabled` (sesión validada), `Capacitor.isNativePlatform()` y el
  rol es `customer`, `driver` o `merchant`. `admin` queda excluido.
- Android: crea el canal `default_channel` (sonido, vibración, importancia 5).
- Permiso: `checkPermissions()`; si es `prompt`, `requestPermissions()`. Si se
  deniega, no registra y no rompe la app. En web/PWA no se pide permiso porque
  no hay handler de push web.
- Adjunta `registration`, `registrationError`, `pushNotificationReceived` y
  `pushNotificationActionPerformed` **antes** de `register()`.
- El token se envía a `customer.registerDeviceToken`,
  `driver.registerDeviceToken` o `commerce.registerDeviceToken` según el rol.
- Al desmontar se eliminan solo los listeners propios.
- En primer plano muestra un toast; el tap aún no navega al pedido (pendiente).

---

## 7. Service worker

- `public/sw.js` es **solo caché PWA** de assets estáticos. No intercepta
  `/api/`, `/events/` ni navegaciones HTML, por lo que **no afecta al SSE**.
- El push nativo de Capacitor **no usa** `public/sw.js`: Android usa el servicio
  de FCM y iOS APNs.
- No existe `firebase-messaging-sw.js`; no se debe registrar uno vacío porque
  rompería el push web futuro.

---

## 8. Push web (PWA) — no implementado

Para soportarlo harían falta archivos/dependencias fuera de este frente:

1. `firebase` (SDK JS) en `package.json`.
2. `src/lib/firebase-client.ts` con `initializeApp` + `getToken({ vapidKey })`.
3. `public/firebase-messaging-sw.js` con `onBackgroundMessage`.
4. `VITE_FIREBASE_*` y `VITE_FIREBASE_VAPID_KEY` (pública) en `.env`.
5. Pedir `Notification.requestPermission()` solo tras un gesto del usuario.
6. Gestionar tokens por navegador y su desregistro.

Hasta entonces, el hook es un no-op en web: la app funciona igual y no se pide
permiso innecesariamente.

---

## 9. Pruebas en dispositivo

Precondiciones: build nativo con `google-services.json`/`GoogleService-Info.plist`,
servidor con `FIREBASE_SERVICE_ACCOUNT_JSON`, usuario de prueba por rol.

1. **Android 13+**: instalar, iniciar sesión como cliente → aceptar permiso →
   confirmar fila con `fcm_token` no nulo (sin imprimirlo en logs).
2. **Background**: minimizar la app; crear pedido/chat desde otro rol → llega la
   notificación con sonido del canal.
3. **App cerrada**: forzar stop; repetir → llega igual (FCM, no SSE).
4. **Primer plano**: evento con app abierta → toast, sin duplicar.
5. **Repartidor**: `new_available` y `order_assigned`; **Comercio**: `new_order`.
6. **Logout**: cliente/repartidor → `fcm_token` queda `NULL`; comercio → idem vía
   `unregisterDeviceToken`.
7. **Token inválido**: sembrar un token basura en la cuenta, disparar evento →
   log `[Push] Token inválido (messaging/registration-token-not-registered)` y
   `fcm_token` vuelve a `NULL`; el SSE del pedido sigue llegando.
8. **Sin credenciales**: arrancar sin `FIREBASE_SERVICE_ACCOUNT_JSON` → un solo
   log `[Push] Deshabilitado...`; login, pedidos y SSE funcionan.
9. **iOS**: misma matriz + APNs; verificar permiso y token en primer plano,
   background y frío.
10. **Regresión web**: no aparece prompt de notificaciones; SSE y caché siguen
    funcionando.

Verificación estática de este frente: `npx tsc -b` sin errores y
`npx eslint server/lib/firebase.ts server/events.ts
src/hooks/usePushNotifications.ts` sin errores (quedan 3 warnings históricos de
`any` en `events.ts`).

---

## 10. Plan de caída / rollback

- **Sin credenciales o credencial inválida:** push no-op automático; no hay
  caída de la app. Único log de aviso al primer envío.
- **FCM caído o cuota excedida:** los envíos fallan con `[Push] Error de envío
  (<code>)`; SSE sigue siendo el canal primario dentro de la app. No hay
  reintentos ni cola (decisión consciente para no bloquear pedidos).
- **Token masivamente inválido:** se limpian solo los códigos definitivos; si se
  detecta una tasa anómala, revisar primero que el service account sea del mismo
  proyecto que `google-services.json` antes de tocar datos.
- **Rollback de código:** revertir `server/lib/firebase.ts` y `server/events.ts`
  no requiere migraciones. Para desactivar push sin rollback: quitar
  `FIREBASE_SERVICE_ACCOUNT_JSON` y reiniciar.
- **Monitoreo sugerido:** alerta si `[Push] Error de envío` supera un umbral o si
  `[Push] Deshabilitado` aparece en producción; nunca incluir tokens en logs.

---

## 11. Pendientes en archivos compartidos (documentados, no editados)

1. `server/login-router.ts`: `fcmToken: null` en logout de merchant.
2. `server/{customer,driver,commerce}-router.ts`: al registrar un token, borrarlo
   de otras cuentas del mismo dispositivo (requiere tabla de dispositivos o
   `UPDATE ... WHERE fcm_token = ?`).
3. Soporte multi-dispositivo (tabla `device_tokens` con `user_id`, `role`,
   `token`, `platform`, `updated_at`).
4. Push web (ver §8).
5. Deep link al tocar la notificación (`pushNotificationActionPerformed`).
6. Observabilidad centralizada para tasas de entrega/fallo.