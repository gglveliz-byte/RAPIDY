# Mapa archivo por archivo — Flujo Repartidor

**Estado:** corregido y verificado al 2026-11-13.

## Páginas

| Archivo | Responsabilidad | Contratos clave | Estado |
|---|---|---|---|
| `src/pages/driver/DriverHome.tsx` | Pedidos disponibles, estado, pedido activo, ubicación | `order.getAvailableForDriver`, `driver.getActiveOrders`, `driver.acceptOrder`, `driver.updateStatus`, `driver.updateLocation` | Corregido; sin PII, sin online forzado, con pedido activo |
| `src/pages/driver/DriverOrder.tsx` | Retiro, en camino, entrega, mapa | `order.getById`, `driver.markCommercePickup`, `order.updateStatus`, `driver.updateLocation` | Corregido; sin bypass de retiro, XSS escapado, sin auto-redirect |
| `src/pages/driver/DriverEarnings.tsx` | Ganancias y filtros | `driver.getEarnings` | Corregido; fechas Guayaquil, error/retry |
| `src/pages/driver/DriverProfile.tsx` | Perfil, estado y logout | `driver.getProfile`, `driver.updateProfile`, `driver.updateStatus`, `driver.logoutSession` | Corregido; total real, validación, logout seguro |
| `src/pages/driver/DriverChat.tsx` | Chat del pedido | `chat.getByOrder`, `chat.send`, `chat.markAsRead` | Corregido; lectura por rol, sin doble envío, error/retry |
| `src/pages/driver/DriverHistory.tsx` | Historial | `driver.getOrderHistory` | Corregido; `earningAmount`, `deliveredAt`, límite, error |
| `src/pages/customer/OrderTracking.tsx` | Tracking cliente | `order.getById`, SSE `order:{id}` | Corregido; ubicación por canal del pedido, sin 401 driver |

## Componentes

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/components/SessionGuard.tsx` | Guard cookie-first | Rehidrata driver, limpia QueryClient al redirigir |
| `src/components/ChatBubble.tsx` | Acceso al chat | Sin cambios de contrato |
| `src/index.css` | Safe-area, touch targets y tema | `pt-safe`, `pb-safe-nav`, touch-target, tiles Leaflet dark |
| `src/hooks/useTheme.ts` | Store global de tema | Sincroniza toggles en claro/oscuro |
| `src/components/ThemeToggle.tsx` | Toggle de tema | Presente en las 6 rutas Driver |
| `src/pages/Login.tsx` | Login profesional | Limpia rol anterior y caché al cambiar de panel |

## Hooks

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/hooks/useDeliveryData.ts` | `useDriverSession`, queries/mutaciones | Hidratación síncrona, errores/refresh |
| `src/hooks/useOrderEvents.ts` | SSE driver/orden | Ignora `location_update`, invalida pedidos/earnings/perfil |
| `src/hooks/useDriverNotification.ts` | Notificación local de pedido | Sin cambios |
| `src/hooks/usePushNotifications.ts` | Registro FCM | `driver.registerDeviceToken` |

## Backend

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `server/driver-router.ts` | Perfil, estado, ubicación, ganancias, disponibles, aceptar, retirar, historial, logout | Corregido; locks, validaciones, PII mínima, sessionVersion |
| `server/driver-auth.ts` | JWT/cookies driver | `sessionVersion`, refresh 30 d, cookies HttpOnly |
| `server/context.ts` | Resolución de sesión | Valida versión de driver; refresh sin `SameSite=None` forzado |
| `server/login-router.ts` | Login por teléfono | Limpia admin/merchant, normaliza últimos 9 dígitos, rate limit |
| `server/order-router.ts` | Disponibles, estados, earnings | Sin PII pre-aceptación, transiciones y locks, `delivered_at` |
| `server/chat-router.ts` | Chat | Lectura por rol, identidad derivada, `chat_read` |
| `server/admin/orders-router.ts` | Admin pedidos | Terminal bloqueado, liquidación con earning real, asignación segura |
| `server/admin/drivers-router.ts` | Admin drivers | No borra con historial; incrementa versión al cambiar contraseña |
| `server/lib/dates.ts` | Fecha Guayaquil | Fuente única para earnings/reportes |
| `server/boot.ts` | SSE | Canales autenticados |
| `server/events.ts` | Push/SSE | Push driver en `new_available`/`order_assigned` |

## Base de datos

| Tabla | Cambio / uso |
|---|---|
| `drivers` | `session_version`, `phone` unique |
| `users` | `email` unique |
| `orders` | índice `(driver_id, status, delivered_at)`; `delivered_at`; `driver_commission_rate` |
| `driver_earnings` | unique `(order_id, type)`; monto histórico |
| `chat_messages` | `read_by_customer`, `read_by_driver`, `read_by_commerce` |

Migración driver: `db/migrations/0009_furry_nemesis.sql`.

## Pruebas

| Archivo | Uso |
|---|---|
| `scripts/driver-api-smoke.mjs` | 16 casos API: login, PII, accept, pickup, entrega, earnings, chat, sesión |
| `scripts/e2e-driver-smoke.mjs` | 8 casos navegador: login, reload, 5 rutas, 0 errores |
| `scripts/e2e-commerce-smoke.mjs` | Regresión negocio |
| `scripts/e2e-smoke.mjs` | Regresión cliente (OTP real) |
| `scripts/admin-smoke.mjs` | Admin |
| `scripts/redirect-smoke.ts` | Sesión/logo/landing |

## Reglas de archivos

- No volver a leer `input.driverId` para autorizar; usar `ctx.driver.id`.
- No devolver `customerPhone`/`notes`/`deliveryAddress` en disponibles.
- No aceptar `preparing`; solo `ready_for_pickup` con todos los comercios listos.
- No permitir `picked_up`/`delivered` por `order.updateStatus` sin checklist.
- No calcular ganancias con la tasa actual para históricos.
- No usar `updatedAt` para la fecha de entrega.
- No borrar drivers con historial.
- No volver a `qs_session` como fuente de verdad.
- No abrir el canal `driver:{id}` desde el cliente; usar `order:{id}`.
- No habilitar queries de merchant fuera de `/commerce`; generan 401 cruzados.
- No volver a CARTO para tiles; usa OpenStreetMap.
- No reintroducir `is_read` global para chat.