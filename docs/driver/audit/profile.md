# Auditoría `/driver/profile` — Repartidor

**Fecha:** 2026-11-13  
**Commit auditado:** `27d231e`  
**Ruta:** `/driver/profile` — Perfil y sesión del repartidor  
**Rol:** `driver`  
**Método:** auditoría estática de página, guard, hooks, procedimientos tRPC, cookies, esquema e integración con Cliente y Negocio. No se modificó código, no se ejecutaron migraciones y no se reinició el servidor de desarrollo en `localhost:3000`.  
**Resultado:** 19 hallazgos — 0 P0, 6 P1 y 13 P2.

> Nota de nomenclatura: en este repositorio **no existen** `driver.me` ni `driver.update`. La ruta usa `driver.getById`, `driver.updateProfile` y `driver.updateStatus` (`server/driver-router.ts:29-133`). El hook `useDriverProfile` (`src/hooks/useDeliveryData.ts:667-674`) y el procedimiento `driver.getProfile` (`server/driver-router.ts:42-63`) existen, pero **no se usan** en esta pantalla.

## 1. Alcance y archivos

| Capa | Archivos |
|---|---|
| Página | `src/pages/driver/DriverProfile.tsx` |
| Ruta y guard | `src/App.tsx:120`; `src/components/SessionGuard.tsx` |
| Sesión compartida | `src/hooks/useSessionSync.ts`; `src/hooks/useCustomerSession.tsx`; `src/providers/trpc.tsx`; `src/hooks/useDeliveryData.ts` |
| Contexto de la app driver | `src/pages/driver/DriverHome.tsx`; `DriverEarnings.tsx`; `DriverOrder.tsx`; `DriverChat.tsx` |
| Backend driver | `server/driver-router.ts`; `server/driver-auth.ts` |
| Auth y contexto | `server/login-router.ts`; `server/context.ts`; `server/middleware.ts`; `server/lib/cookies.ts` |
| Integración con pedidos | `server/order-router.ts`; `server/lib/order-ready.ts`; `server/lib/order-access.ts`; `server/events.ts` |
| UI del cliente | `src/pages/customer/components/OrderTrackingMap.tsx`; `src/pages/customer/OrderTracking.tsx` |
| Push | `src/hooks/usePushNotifications.ts` |
| Esquema | `db/schema.ts:90-106` (`drivers`) |
| Documentación leída | `docs/customer/README.md`; `docs/customer/profile.md`; `docs/commerce/README.md`; `docs/commerce/VERIFICATION.md`; `docs/commerce/audit/MASTER_TRIAGE.md` |

**Fuera de alcance:** pruebas de carga, dispositivo físico, push nativo real, inspección de datos productivos, modificaciones de código, migraciones y reinicio del servidor. Los puntos marcados como no verificados en la sección 6 son inferencias de lectura de código.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/sesión)

```text
/driver/profile
  ├─ App.tsx:120  SessionGuard role="driver"
  │    ├─ usePushNotifications("driver")                 SessionGuard.tsx:42; usePushNotifications.ts:12-15
  │    ├─ login.checkAuth contra cookie HttpOnly          SessionGuard.tsx:100-131
  │    ├─ setRoleUser("driver", user) → driver_user       SessionGuard.tsx:108
  │    └─ setSession("driver") → qs_session               SessionGuard.tsx:109
  │
  ├─ DriverProfile.tsx:33-43
  │    └─ JSON.parse(localStorage.driver_user).id         ← el id sale del cliente, no del contexto
  │
  ├─ driver.getById({ id })                               DriverProfile.tsx:45-48
  │    ├─ driverQuery exige ctx.driver                    middleware.ts:38-49
  │    ├─ server valida id === ctx.driver.id              driver-router.ts:29-36
  │    ├─ SELECT * FROM drivers                           driver-router.ts:36
  │    └─ elimina passwordHash y fcmToken                 driver-router.ts:38
  │
  ├─ Editar y guardar
  │    └─ driver.updateProfile({ id, name, vehicle, licensePlate })
  │         ├─ valida id === ctx.driver.id                driver-router.ts:117-119
  │         ├─ whitelist name/vehicle/licensePlate        driver-router.ts:121-128
  │         ├─ UPDATE drivers + emit admin:dashboard      driver-router.ts:127-130
  │         └─ invalida driver.getById y cierra edición   DriverProfile.tsx:52-58
  │
  ├─ Toggle online/offline
  │    └─ driver.updateStatus({ id, status })             DriverProfile.tsx:82-86
  │         ├─ valida id === ctx.driver.id                driver-router.ts:73-75
  │         ├─ UPDATE drivers.status + emit admin         driver-router.ts:77-80
  │         └─ sin onSuccess ni invalidación en la UI     DriverProfile.tsx:50
  │
  └─ Logout
       ├─ login.logout { scope: "driver" }                DriverProfile.tsx:89; login-router.ts:229-246
       ├─ clearRoleUser("driver")                         DriverProfile.tsx:90
       ├─ clearSession("driver")                          DriverProfile.tsx:91
       ├─ dispatchLogout("driver")                        DriverProfile.tsx:92
       ├─ queryClient.clear()                             DriverProfile.tsx:93
       └─ navigate("/login")                              DriverProfile.tsx:94
```

**Sesión al recargar.** El guard del driver es cookie-first: no exige `qs_session` ni `driver_user` para verificar (`SessionGuard.tsx:100-131`). Tras `login.checkAuth`, reescribe `driver_user` y `qs_session` antes de renderizar la página (`SessionGuard.tsx:107-110`). Por eso una recarga normal **no pierde la sesión** si la cookie `quickgo_driver_token` o el refresh siguen válidos. El punto débil no es el guard, sino que `DriverProfile` vuelve a depender de `driver_user.id` en vez del `ctx.driver.id` que ya validó el backend.

**Identidad desde el cliente.** `driver.getById`, `driver.updateStatus` y `driver.updateProfile` reciben `id` desde el navegador. El backend siempre compara con `ctx.driver.id` y rechaza otro id (`driver-router.ts:32-34,73-75,117-119`), así que no hay IDOR en estas mutaciones. Aun así, `acceptOrder` y `markCommercePickup` ya ignoran el `driverId` opcional del input y usan `ctx.driver.id` (`driver-router.ts:219-223,284-288`): ese es el patrón correcto que debería seguir el perfil.

**Logout.** `login.logout { scope: "driver" }` limpia solo `quickgo_driver_token` y `quickgo_driver_refresh` (`login-router.ts:240`). `clearSession("driver")` solo borra `qs_session` si su rol actual es `driver` (`useSessionSync.ts:55-68`), y `dispatchLogout("driver")` solo lo escucha el rol driver (`useSessionSync.ts:129-136`). El flujo **no** cierra sesiones customer/merchant ni vacía el carrito. `queryClient.clear()` limpia caché de React Query, no cookies ni localStorage de otros roles.

## 3. Hallazgos

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| DRV-PROF-01 | P1 | Estado online / UX | `src/pages/driver/DriverProfile.tsx:50,82-86,159-176` | `updateStatusMutation` no tiene `onSuccess`, `onError` ni invalidación. El toggle y el copy leen `driver.status` de la query cacheada; el servidor sí actualiza, pero la UI sigue mostrando el valor anterior hasta un refetch (staleTime 30 s y `refetchOnWindowFocus:false`). | El repartidor cree que el toggle no funcionó. Puede pulsarlo otra vez y quedar online cuando quería estar offline, o viceversa. No hay toast ni error visible. | Actualizar la caché con `setQueryData` o invalidar `driver.getById` en `onSuccess`; optimistic update con rollback; deshabilitar y mostrar pending; toast de error. |
| DRV-PROF-02 | P1 | Dinero / datos | `src/pages/driver/DriverProfile.tsx:148`; `server/driver-router.ts:36-39,52-62`; `db/schema.ts:102`; `src/hooks/useDeliveryData.ts:667-674` | El header usa `driver.totalEarnings` de `getById`, que devuelve la columna cruda `drivers.total_earnings`. Esa columna no se actualiza en ningún procedimiento del repo; `getProfile` calcula la suma real desde `driver_earnings` pero el perfil no lo usa. | El perfil muestra siempre “0.00 ganancias” (salvo escritura manual/trigger externo), aunque el repartidor tenga entregas. El export admin también lee la columna (`server/admin/settings-router.ts:223,236`). | Usar `driver.getProfile` o agregar `SUM(driver_earnings.amount)` en `getById`; formatear con moneda; si se adopta `getProfile`, reemplazar el `reduce` en memoria por SQL. |
| DRV-PROF-03 | P1 | Disponibilidad / integración | `src/pages/driver/DriverHome.tsx:24,57-85`; `server/lib/order-ready.ts:162-170`; `server/order-router.ts:225-234` | `DriverHome` arranca con `isOnline=true` y, al montar y cada 30 s, ejecuta `driver.updateStatus({ status: "online" })`. Eso pisa el estado `offline` que el repartidor acaba de elegir en el perfil y también pisa `busy` mientras tiene un pedido activo. | El control offline no sobrevive a volver a `/driver`; un repartidor en entrega vuelve a `online` y recibe eventos/push de `new_available`. El dashboard admin y la disponibilidad quedan inflados. | Quitar el sync forzado a online. Leer el estado real del backend y cambiarlo solo por acción explícita. Si hay pedido activo, no permitir `online`; el servidor debe liberar a `online` al entregar/cancelar. |
| DRV-PROF-04 | P1 | Sesión / multi-rol | `server/login-router.ts:124-138,163-189,196-222` | La rama admin/merchant limpia las cookies del otro rol profesional y la del driver, pero la rama driver solo llama `setDriverCookies` y no limpia admin/merchant. `checkAuth` evalúa admin, luego merchant y recién después driver. | En un navegador compartido con sesión merchant o admin previa, el login del driver devuelve `success` y `role:"driver"`, pero `/driver` recibe `checkAuth` con rol merchant/admin y redirige a `/login`. El driver queda bloqueado hasta borrar cookies. | Antes de `setDriverCookies`, limpiar `clearAdminCookie` y `clearMerchantCookie` (mismo contrato de “un solo rol profesional”). Añadir prueba de matriz driver+merchant, driver+admin, reload y logout. |
| DRV-PROF-05 | P1 | Validación / integridad de datos | `server/driver-router.ts:107-133`; `db/schema.ts:93-97`; `src/pages/driver/DriverProfile.tsx:45-48,61-76` | `updateProfile` acepta `z.string().optional()` para `name`, `vehicle` y `licensePlate`, sin `trim`, mínimo ni máximo. El cliente envía siempre los tres campos y no muestra errores. Si `getById` falla, “Editar” hidrata los campos con `""` y “Guardar” envía vacío; el servidor lo acepta. | Un fallo de red transitorio puede borrar nombre, vehículo y placa. Un texto de más de 200/100/20 caracteres revienta en PostgreSQL con 500; el `mutateAsync` rechaza sin feedback y el usuario cree que guardó. | Zod con `trim().min(1).max(200/100/20)`; bloquear edición/guardado hasta tener `driver`; enviar solo campos dirty; errores inline y toast; `maxLength` en inputs. |
| DRV-PROF-06 | P1 | Seguridad / sesión | `server/driver-auth.ts:12-52`; `server/context.ts:104-121`; `server/admin/drivers-router.ts:98-100` | Los JWT del driver solo llevan `driverId` y `type`. `verifyDriverRefreshToken` valida firma y expiración, no una versión de sesión ni `passwordChangedAt`. Cambiar la contraseña desde admin no revoca los tokens existentes. | Un refresh token robado sigue emitiendo access tokens hasta 30 días después del cambio de contraseña. Un login nuevo tampoco invalida sesiones anteriores. | Añadir `sessionVersion` a `drivers`, incluirla en access/refresh, compararla contra la DB en `context.getDriverFromCookie` y en `driver.refreshToken`; incrementarla al cambiar contraseña o eliminar. |
| DRV-PROF-07 | P2 | Fuente de verdad / localStorage | `src/pages/driver/DriverProfile.tsx:25,33-48`; `server/driver-router.ts:29-36`; `src/components/SessionGuard.tsx:100-131` | La página toma `driverId` de `localStorage.driver_user` en vez de usar el id ya validado por `checkAuth`/`ctx`. Si la clave falta, la query queda deshabilitada; si tiene un id viejo, el servidor responde `FORBIDDEN`; si el JSON está corrupto, el `catch` lo ignora y no hay fallback. | Perfil vacío con botones muertos o error silencioso. Contradice la regla cookie-first y duplica la identidad en dos fuentes. El guard suele reparar `driver_user` al recargar, pero no si la escritura de localStorage falla. | Llamar `driver.getById` sin `id` (el backend ya usa `ctx.driver.id`) o `driver.getProfile`; usar localStorage solo como caché de UI. Validar forma y hacer fallback a `checkAuth`. |
| DRV-PROF-08 | P2 | Estados de carga / error | `src/pages/driver/DriverProfile.tsx:45-48,97-103` | Solo se consume `isLoading`. No hay `isError`, `error`, `refetch` ni estado “no encontrado”. Si la query falla, `driver` queda `undefined` y la página renderiza “Conductor”, rating 4.8, guiones y el botón de edición habilitado. | El usuario no distingue error de red de perfil vacío; no puede reintentar. La edición sobre datos vacíos habilita el borrado descrito en DRV-PROF-05. | Exponer `isError/error/refetch`; separar red, 403 y no encontrado; botón Reintentar; deshabilitar edición/guardado hasta tener datos; skeleton con `role="status"`. |
| DRV-PROF-09 | P2 | Datos / copy | `src/pages/driver/DriverProfile.tsx:146`; `db/schema.ts:101`; `src/pages/driver/DriverHome.tsx:181` | El fallback del rating es `"4.8"`, mientras el esquema define `default("4.5")`. Si `rating` es `null`, la UI inventa 4.8. | Rating falso e inconsistente entre perfil, home y base de datos. | Mostrar `driver.rating` o “Sin calificaciones”; no hardcodear un valor. Unificar el fallback con el contrato/DB. |
| DRV-PROF-10 | P2 | Estado busy | `src/pages/driver/DriverProfile.tsx:82-86,164`; `server/driver-router.ts:65-82` | El toggle calcula `driver.status === "online" ? "offline" : "online"`. Si el estado es `busy`, el siguiente clic envía `online`. El servidor acepta `online/busy/offline` sin validar transición ni pedido activo. | Un repartidor con pedido activo se marca online, recibe ofertas nuevas y aparece disponible. `acceptOrder` bloquea un segundo pedido por la regla de pedido activo (`driver-router.ts:238-252`), pero el estado y las notificaciones quedan mal. | Si `busy`, deshabilitar el toggle o mostrar “En entrega”; separar disponibilidad de ocupación; que el servidor rechace `online` mientras haya pedido activo. |
| DRV-PROF-11 | P2 | Disponibilidad / autorización de negocio | `server/order-router.ts:669-706`; `server/driver-router.ts:219-252` | `getAvailableForDriver` no filtra por `drivers.status`, y `acceptOrder` no exige `online`. Solo existe el guard de “ya tienes un pedido activo”. | Un driver `offline` puede listar y aceptar pedidos llamando a la API, aunque la UI normal lo fuerza online. El estado online/offline es solo informativo, no una regla de negocio. | Exigir `ctx.driver.status === "online"` para listar/aceptar (o definir explícitamente que `busy` también puede aceptar). Centralizar la comprobación y probar 403/412. |
| DRV-PROF-12 | P2 | Propagación de perfil / cliente | `server/driver-router.ts:130`; `src/pages/driver/DriverProfile.tsx:52-58`; `src/components/SessionGuard.tsx:107-110`; `src/pages/customer/components/OrderTrackingMap.tsx:338-347`; `server/lib/order-access.ts:151-170` | `updateProfile` solo emite `admin:dashboard` e invalida `driver.getById`; no actualiza `driver_user` ni emite evento al pedido/driver. El cliente muestra nombre y teléfono del repartidor, pero **no** ve vehículo ni placa, aunque `safeDriver` los devuelve. | El cliente con un pedido abierto sigue viendo el nombre anterior hasta el próximo refetch/polling; el avatar del chat usa `driver_user.name` viejo (`DriverChat.tsx:87`). Editar vehículo/placa no tiene efecto visible en el pedido. | Actualizar el nombre en `driver_user` al guardar; emitir un evento o invalidar las queries del pedido activo; decidir y documentar si vehículo/placa deben mostrarse al cliente. |
| DRV-PROF-13 | P2 | Logout / push | `src/pages/driver/DriverProfile.tsx:88-95`; `server/driver-router.ts:214-217,368-375`; `server/commerce-router.ts:417`; `server/events.ts:67-80` | El logout limpia cookies y caché local, pero no marca al driver `offline` ni borra `drivers.fcm_token`. No existe `driver.unregisterDeviceToken` (sí existe el equivalente de merchant). Además, el logout espera la red antes de limpiar el estado local. | Tras cerrar sesión, el admin lo sigue contando como online y el dispositivo puede seguir recibiendo pushes de `new_available`/`order_assigned` en un equipo compartido. Sin red, el usuario queda esperando antes de volver a `/login`. | Limpiar local primero; en el servidor, `status = offline` y `fcm_token = null` al hacer logout scope driver; añadir `driver.unregisterDeviceToken` y llamarlo desde la UI. |
| DRV-PROF-14 | P2 | Integridad / teléfono | `db/schema.ts:94`; `server/admin/drivers-router.ts:39-45,86-96`; `server/login-router.ts:165,168-177` | `drivers.phone` no tiene índice único. La unicidad solo se comprueba en la aplicación al crear/editar desde admin; dos altas concurrentes o datos legacy pueden duplicar el número. El login busca por teléfono y usa `driverResult[0]`. | Un duplicado puede hacer que el login valide la contraseña contra la fila equivocada (fallo de acceso) o que dos cuentas compartan identificador. El perfil no edita teléfono, así que no introduce duplicados por esta vía, pero tampoco puede corregirlos. | Índice único sobre el teléfono normalizado (migración revisada), manejo de `23505` y limpieza de duplicados existentes. Mantener la comprobación amigable en admin. |
| DRV-PROF-15 | P2 | Cookies / sesión | `server/context.ts:110-113`; `server/lib/cookies.ts:8-16`; `server/driver-auth.ts:71-82` | Al renovar el access desde el contexto, el refresh nuevo se escribe con `sameSite: "None"` después de esparcir `cookieOpts`. En localhost `cookieOpts.secure` es `false`, así que se emite `SameSite=None` sin `Secure`. | Los navegadores modernos rechazan esa cookie. En localhost la rotación del refresh falla tras expirar el access (consola con error); la sesión sigue funcionando con el refresh viejo y el refresh de 9 min la repara, pero no es el contrato esperado. | No sobrescribir `sameSite`; reutilizar `cookieOpts` de `getSessionCookieOptions` igual que `setDriverCookies`. Añadir prueba de atributos de cookie en localhost. |
| DRV-PROF-16 | P2 | Accesibilidad | `src/pages/driver/DriverProfile.tsx:110-124,136-142,171-177,199-222,148,251`; `src/index.css:222-224` | Botones solo-icono sin `aria-label` (volver, editar, cancelar, guardar); toggle sin `role="switch"` ni `aria-checked`; inputs sin `<label htmlFor>`/`id`; spinner sin `role="status"`; inputs de vehículo/placa de ~30 px; contraste aproximado 3.4:1 para `text-white/70` sobre `#2E7D32` y ~3.8:1 para `text-red-500` sobre blanco; sin `focus-visible` ni `motion-reduce`. | Uso difícil con teclado, lector de pantalla y toque; textos pequeños por debajo de AA; animaciones que ignoran `prefers-reduced-motion`. | Añadir labels/ids y `aria-label`; `role="switch"`/`aria-checked`; `role="status"`; targets ≥44 px; contraste ≥4.5; `focus-visible` y `motion-reduce`. |
| DRV-PROF-17 | P2 | Visual / responsive / dark mode | `src/pages/driver/DriverProfile.tsx:106-108,140,156,164-167,184-188,249-254`; `src/index.css:121-157` | El header usa `pt-4` y no `pt-safe`; la página no tiene variantes `dark:` aunque el tema global se aplica a `<html>` (`useTheme.ts:30-40`); repite verdes/grises hardcodeados en vez de tokens; copy sin tildes (“En linea”, “No recibiras”, “Telefono”, “Vehiculo”). | En PWA/Capacitor el header puede quedar bajo el notch/status bar; con tema oscuro el perfil sigue claro; inconsistencia de marca y de copy. | Usar `pt-safe`, tokens `brand/surface/ink`, variantes `dark:` y corregir tildes. Verificar 320/360/390 px. |
| DRV-PROF-18 | P2 | Privacidad / PII | `server/order-router.ts:565-573`; `server/lib/order-access.ts:151-170`; `src/pages/customer/components/OrderTrackingMap.tsx:338-347` | En estados terminales `order.getById` anula `phone`, `currentLat` y `currentLng` del driver, pero deja `vehicle` y `licensePlate` en `safeDriver`. El cliente conserva el pedido en su historial y puede leer la respuesta de red. | La placa y el vehículo del repartidor quedan expuestos indefinidamente después de entregado/cancelado, aunque la UI no los muestre. | Anular también `vehicle`/`licensePlate` en estados terminales o quitarlos de la proyección pública; mantenerlos solo para driver/admin. |
| DRV-PROF-19 | P2 | Contrato de errores | `server/driver-router.ts:73-75,117-119` | Las comprobaciones de “otro repartidor” en `updateStatus` y `updateProfile` lanzan `new Error(...)`, no `TRPCError({ code: "FORBIDDEN" })`. | tRPC devuelve `INTERNAL_SERVER_ERROR` (500) en vez de 403. El cliente no puede distinguir un intento de IDOR de una caída; se ensucia el monitoreo y se rompe la consistencia con `getById`, que sí usa `FORBIDDEN`. | Usar `TRPCError` con `FORBIDDEN` en ambas mutaciones y añadir prueba con el id de otro driver. |

## 4. Integración con Cliente y Negocio

| Superficie | Mecanismo real | Comportamiento / riesgo |
|---|---|---|
| Tracking del cliente `/order/:id` | `order.getById` devuelve `safeDriver` (`server/order-router.ts:565-573`); `OrderTrackingMap` muestra nombre y teléfono (`OrderTrackingMap.tsx:338-347`). | El nombre/teléfono del repartidor sí se reflejan en el pedido activo. En estado terminal se ocultan teléfono y GPS, pero no vehículo/placa (DRV-PROF-18). `updateProfile` no emite evento al pedido, así que un cambio de nombre no se ve hasta el siguiente refetch/polling (DRV-PROF-12). |
| Vehículo y placa | `safeDriver` incluye `vehicle` y `licensePlate` (`order-access.ts:151-170`), pero ninguna vista del cliente los renderiza. | El dato se guarda y se devuelve, pero el cliente no lo ve. Si el producto espera que el cliente identifique el vehículo, falta la superficie; si no, conviene no exponerlo. |
| Disponibilidad y oferta de pedidos | `notifyReadyDrivers` y `markCommerceReadyForOrder` emiten `new_available` solo a `drivers.status = "online"` (`order-router.ts:225-234`; `order-ready.ts:162-170`). `acceptOrder` marca `busy` (`driver-router.ts:269`). | `DriverHome` fuerza `online` cada 30 s y `getAvailableForDriver`/`acceptOrder` no exigen `online` (DRV-PROF-03/11). En la práctica el estado online/offline no es confiable: un driver offline puede seguir viendo/aceptando, y uno busy vuelve a online. |
| Push | `usePushNotifications` registra el token solo en nativo (`usePushNotifications.ts:12-15,50-61`); `driver.registerDeviceToken` guarda en `drivers.fcm_token` (`driver-router.ts:368-375`); `events.ts:67-80` envía push si hay token. | El registro funciona en Android/iOS. Al hacer logout no se borra el token ni se marca offline (DRV-PROF-13): el dispositivo puede seguir recibiendo avisos del driver anterior. No hay push web/PWA. |
| Sesión del cliente | El login del driver no limpia cookies de customer; `checkAuth` prioriza driver sobre customer (`login-router.ts:196-222`). El logout driver usa scope driver (`login-router.ts:240`; `DriverProfile.tsx:89-92`). | Customer y driver pueden coexistir; el logout/401 del driver **no** cierra la sesión del cliente ni vacía el carrito. `clearSession("driver")` solo toca `qs_session` si el rol actual es driver (`useSessionSync.ts:55-68`). Correcto. |
| Sesión del negocio | Admin/merchant login limpian driver (`login-router.ts:126-138`); driver login **no** limpia admin/merchant. El logout driver tampoco los toca. | El logout del driver no cierra al merchant (correcto), pero el login del driver sobre un navegador con merchant/admin deja ambas cookies y el guard del driver ve merchant/admin primero (DRV-PROF-04). Es el riesgo de integración más concreto. |
| 401 del driver | `roleForPath("/driver/...")` devuelve `driver` (`useSessionSync.ts:107`); `handleAuthError` hace `login.logout { scope: role }`, limpia solo driver y redirige a `/login` (`trpc.tsx:18-39`; `useDeliveryData.ts:21-45`). | Un 401 del driver no toca `customer_session`, `cart`, `merchant_user` ni `admin_user`. Correcto. Un `FORBIDDEN` por id stale no dispara logout global; la página queda vacía (DRV-PROF-07/08). |
| Datos que el negocio ve del driver | `driver.list` es admin-only (`driver-router.ts:11-27`); el negocio no consume el perfil del driver en su panel. | El negocio no recibe teléfono/vehículo/placa desde `/driver/profile`; solo el nombre en las vistas de pedido si aplica. No se encontró fuga de PII del driver hacia el merchant por esta ruta. |

**Resumen de integración:** el aislamiento de logout/401 entre roles está bien resuelto y el perfil no cierra sesiones ajenas. Los riesgos reales son (a) el login del driver sobre cookies merchant/admin, (b) el estado online/busy que `DriverHome` pisa y que el backend no exige, y (c) el push/estado que queda vivo tras el logout. En el pedido del cliente, nombre y teléfono se reflejan; vehículo y placa no se muestran y la placa sigue expuesta en estados terminales.

## 5. Lo que funciona y no se debe romper

- **Autorización por contexto en todas las procedures del driver.** `getById`, `getProfile`, `updateStatus`, `updateProfile`, `getEarnings` y `getActiveOrders` comparan `input.id` con `ctx.driver.id` (`driver-router.ts:29-40,42-63,65-82,107-133,135-171`). No se encontró IDOR en estas rutas.
- **`driverQuery` en el middleware.** Todas las procedures del perfil exigen `ctx.driver` (`middleware.ts:38-49,77`). Un anónimo recibe 401; un customer/merchant no pasa.
- **Sanitización de secretos.** `getById`, `getProfile`, `updateStatus` y `updateProfile` eliminan `passwordHash` y `fcmToken` antes de responder (`driver-router.ts:38,58,80,131`). Mantener esa proyección.
- **Whitelist de campos editables.** `updateProfile` solo acepta `name`, `vehicle` y `licensePlate` (`driver-router.ts:107-128`). No permite cambiar `phone`, `status`, `passwordHash`, `commissionRate`, `totalEarnings` ni `fcmToken`. Mantener esa lista al añadir validación.
- **`driverId` derivado del contexto en operaciones de pedido.** `acceptOrder` y `markCommercePickup` ignoran el `driverId` opcional del input y usan `ctx.driver.id` (`driver-router.ts:219-223,284-288`). No volver a aceptar el id del cliente para asignar.
- **Guard de pedido activo.** `acceptOrder` bloquea un segundo pedido activo (`driver-router.ts:238-252`) y usa `FOR UPDATE` para evitar carreras (`:225-230`). Es la red de seguridad que evita que un driver `online` con pedido acepte otro.
- **Rate limit del login.** `login.login` limita a 8 fallos/10 min por IP+identificador, bloquea 15 min y compara contra un hash dummy para no filtrar timing (`login-router.ts:14-17,39-78,108-117,163-193`). Mantenerlo.
- **Logout role-scoped.** `DriverProfile` usa `login.logout { scope: "driver" }` (`DriverProfile.tsx:89`); el servidor solo limpia cookies driver (`login-router.ts:229-246`); `clearSession("driver")` y `dispatchLogout("driver")` solo afectan al driver (`useSessionSync.ts:55-68,90-92,129-136`). No volver a un logout global.
- **401 role-scoped.** `handleAuthError` usa `roleForPath` y `scope: role`; solo el customer limpia `cart` (`trpc.tsx:18-39`; `useDeliveryData.ts:21-45`). Un 401 del driver no cierra customer/merchant.
- **Guard cookie-first para driver.** `SessionGuard` no exige `qs_session`; verifica `login.checkAuth` contra la cookie y rehidrata `driver_user` (`SessionGuard.tsx:100-131`). Un fallo de red no borra la sesión: muestra “No pudimos verificar tu sesión” y permite reintentar (`SessionGuard.tsx:137-161`).
- **Refresh de sesión.** Access de 24 h y refresh de 30 días; el contexto renueva el access desde `quickgo_driver_refresh` (`driver-auth.ts:9-10,65-89`; `context.ts:93-121`). La recarga normal sobrevive.
- **Cookies HttpOnly.** `setDriverCookies` usa `getSessionCookieOptions`: `HttpOnly`, `SameSite=Lax` en localhost y `None+Secure` fuera (`cookies.ts:8-16`; `driver-auth.ts:65-82`). Corregir solo el override de `context.ts:112`, no el helper.
- **Registro push nativo.** `usePushNotifications` solo registra en Capacitor nativo y usa `driver.registerDeviceToken` con `ctx.driver.id` (`usePushNotifications.ts:12-15,50-61`; `driver-router.ts:368-375`). El flujo básico existe.
- **PII del cliente en el pedido activo.** `safeDriver` oculta teléfono y GPS al pasar a estado terminal (`order-router.ts:565-573`). Mantener esa máscara; ampliarla a vehículo/placa es DRV-PROF-18.
- **Sin imágenes/avatar en esta ruta.** `DriverProfile` no sube ni muestra imágenes; no hay base64, payload pesado ni N+1. El perfil hace una sola query (`driver.getById`) y una mutación por acción.
- **Un solo `QueryClient`.** `DriverProfile` importa el `queryClient` del provider (`providers/trpc.tsx:41-65`) y usa `queryClient.clear()` en logout. No crear una segunda instancia.

## 6. Evidencia y verificación

### 6.1 Comprobaciones realizadas

- Lectura estática completa de todos los archivos de la sección 1, incluidos los documentos obligatorios del contexto.
- `git rev-parse --short HEAD` → `27d231e`. No se modificó código; el único archivo creado por esta auditoría es `docs/driver/audit/profile.md`.
- Verificación de que `DriverProfile` usa `login.logout { scope: "driver" }` (`DriverProfile.tsx:89`) y de que `clearSession("driver")` solo borra `qs_session` si el rol actual es driver (`useSessionSync.ts:55-68`).
- Verificación de que el 401 del driver es role-scoped en ambos manejadores (`providers/trpc.tsx:18-39`; `useDeliveryData.ts:21-45`) y que solo el customer limpia `cart`.
- Búsqueda de `unregisterDeviceToken`: existe para `customer` (`customer-router.ts:404`) y `commerce` (`commerce-router.ts:417`), **no** para `driver`. `driver.registerDeviceToken` solo escribe (`driver-router.ts:368-375`).
- Búsqueda de escrituras a `drivers.total_earnings`: no hay ningún `UPDATE` en `server/`; solo el `default` del esquema (`schema.ts:102`) y lecturas (`driver-router.ts:36-39`; `admin/settings-router.ts:223,236`). `getProfile` calcula la suma real (`driver-router.ts:52-62`), pero el hook que lo consume (`useDriverProfile`) no se usa desde ninguna página.
- Búsqueda de unicidad de `drivers.phone`: el esquema no declara `.unique()` (`schema.ts:94`) y las migraciones no crean índice único. En cambio, `users.phone` (`schema.ts:77`) y `customers.phone` (`db/migrations/0000_dear_shooting_star.sql:69`) sí son únicos.
- Verificación del override de cookie: `context.ts:112` fija `sameSite: "None"` después de `...cookieOpts`, mientras `cookies.ts:14-15` usa `Lax` y `secure:false` en localhost.
- Verificación de que `DriverHome` fuerza online: `useState(true)` (`DriverHome.tsx:24`) y `updateStatus({ status: "online" })` al montar y cada 30 s (`:57-85`).
- Verificación de que `getAvailableForDriver` no filtra por estado (`order-router.ts:669-706`) y de que `acceptOrder` no exige online (`driver-router.ts:219-252`).
- Verificación de que el update de perfil solo emite `admin:dashboard` (`driver-router.ts:130`) y de que el cliente solo muestra nombre/teléfono (`OrderTrackingMap.tsx:338-347`).
- Búsqueda de tests específicos de `/driver/profile` en `scripts/`: no hay E2E ni smoke que mencione `DriverProfile`, `driver.getById` ni `driver.updateProfile`. Solo `admin-smoke.mjs` cubre `driver.list` como admin/anon.

### 6.2 No verificado en runtime

- Comportamiento real del navegador ante `SameSite=None` sin `Secure` en `localhost:3000`; se infiere de la implementación y del rechazo estándar de los navegadores.
- Push nativo en Android/iOS, recepción tras logout y comportamiento del token FCM en un dispositivo compartido.
- Layout real en 320/360/390/768 px, notch/safe-area y modo oscuro; no se abrió el navegador.
- Existencia real de teléfonos duplicados en la base de datos; solo se verificó que no hay restricción única.
- Matriz de sesión driver+customer, driver+merchant y driver+admin en un navegador real; se infiere de `login-router.ts` y `SessionGuard.tsx`.
- No se ejecutaron `npm test`, `npm run build`, `npm run lint`, migraciones ni peticiones HTTP contra el servidor del usuario. La auditoría es estática y no tocó `localhost:3000`.

## 7. Resumen para consolidado (top 5)

| Prioridad | ID | Severidad | Hallazgo | Archivo:línea | Por qué primero |
|---|---|---|---|---|---|
| 1 | **DRV-PROF-04** | P1 | El login del driver no limpia cookies admin/merchant; `checkAuth` prioriza esos roles y el driver queda fuera de `/driver`. | `server/login-router.ts:124-138,163-189,196-222` | Bloquea el acceso al panel en un navegador compartido, aunque las credenciales del driver sean correctas. |
| 2 | **DRV-PROF-05** | P1 | `updateProfile` no valida nombre/vehículo/placa y la UI puede enviar vacío tras un fallo de query; el error no se muestra. | `server/driver-router.ts:107-133`; `src/pages/driver/DriverProfile.tsx:45-48,61-76` | Puede borrar datos del perfil o fallar con 500 silencioso; integridad y confianza. |
| 3 | **DRV-PROF-03** | P1 | `DriverHome` fuerza `online` al montar y cada 30 s, pisando `offline` y `busy`. | `src/pages/driver/DriverHome.tsx:24,57-85` | El control de disponibilidad no funciona; afecta notificaciones, admin y operación. |
| 4 | **DRV-PROF-01** | P1 | El toggle de `/driver/profile` no invalida ni actualiza la caché; la UI queda con el estado anterior. | `src/pages/driver/DriverProfile.tsx:50,82-86,159-176` | El repartidor no sabe si quedó online/offline y puede revertir el cambio sin querer. |
| 5 | **DRV-PROF-06** | P1 | Los tokens del driver no tienen versión de sesión; cambiar la contraseña no revoca access/refresh existentes. | `server/driver-auth.ts:12-52`; `server/context.ts:104-121`; `server/admin/drivers-router.ts:98-100` | Seguridad: un refresh robado sigue vigente hasta 30 días después del cambio de contraseña. |

**P1 adicional para el mismo pase:** **DRV-PROF-02** — el header de ganancias siempre muestra `0.00` porque usa la columna `drivers.total_earnings` (sin escrituras) en vez de la suma de `driver_earnings` (`DriverProfile.tsx:148`; `driver-router.ts:36-39,52-62`; `schema.ts:102`). Corregir junto con DRV-PROF-01/03, que son el mismo bloque de estado del perfil.