---
name: Rapidy Driver Flow Guardian
description: Úsala antes de tocar /driver, /driver/order/:id, /driver/earnings, /driver/profile, /driver/chat/:orderId, /driver/history, login por teléfono, sesión driver, aceptación/retiro/entrega, ganancias, SSE o chat del repartidor. Contiene qué documentación leer y qué reglas no se deben romper.
---

# Rapidy Driver Flow Guardian

Esta skill protege el flujo Repartidor ya auditado, corregido y verificado.
Su objetivo es que cualquier agente entre en contexto rápido y no reintroduzca
bugs de PII, estados, dinero, sesión o tracking.

**Todas las rutas son desde la raíz del repositorio.**

## Cuándo usar esta skill

- Rutas `/driver`, `/driver/order/:id`, `/driver/earnings`,
  `/driver/profile`, `/driver/chat/:orderId`, `/driver/history`.
- Login por teléfono, cookies `quickgo_driver_*`, `SessionGuard`.
- Aceptación de pedidos, retiro por comercio, `on_the_way`, `delivered`.
- Ganancias, `driver_earnings`, liquidaciones, fechas.
- Ubicación en vivo, SSE driver/order, push.
- Chat del pedido y lectura por rol.
- Migraciones de `drivers`, `orders`, `driver_earnings`, `chat_messages`.

## Lectura obligatoria antes de cambiar código

1. `docs/driver/README.md`.
2. `docs/driver/FILE_MAP.md`.
3. `docs/driver/VERIFICATION.md`.
4. `docs/driver/audit/MASTER_TRIAGE.md`.
5. `docs/commerce/README.md` y `docs/customer/README.md`.
6. `contracts/orderStatus.ts`.
7. Si toca sesión: `server/driver-auth.ts`, `server/login-router.ts`,
   `server/context.ts`, `src/components/SessionGuard.tsx`,
   `src/hooks/useDeliveryData.ts`.
8. Si toca pedidos: `server/driver-router.ts`, `server/order-router.ts`,
   `server/lib/order-access.ts`, `server/lib/order-ready.ts`.
9. Si toca dinero: `server/order-router.ts`, `server/admin/orders-router.ts`,
   `db/schema.ts`, `DriverEarnings.tsx`.
10. Si toca chat: `server/chat-router.ts`, `DriverChat.tsx`.

## Mapa de documentación

| Documento | Qué es | ¿Fuente de verdad? |
|---|---|---|
| `docs/driver/README.md` | Arquitectura y reglas actuales | Sí |
| `docs/driver/FILE_MAP.md` | Inventario archivo por archivo | Sí |
| `docs/driver/VERIFICATION.md` | Comandos y evidencia | Sí |
| `docs/driver/audit/MASTER_TRIAGE.md` | Consolidado y correcciones | Contexto |
| `docs/driver/audit/<ruta>.md` | Reporte histórico | Contexto; no backlog |
| `docs/commerce/*` | Flujo Negocio | Sí para ese flujo |
| `docs/customer/*` | Flujo Cliente | Sí para ese flujo |

## Reglas que NO se deben romper

### Identidad y sesión

- La identidad del driver sale de `ctx.driver.id`. Nunca de `input.driverId`.
- La cookie HttpOnly es la fuente de verdad; no exigir `qs_session`.
- `driver_user` es solo caché de UI; hidratarlo de forma síncrona/segura.
- `sessionVersion` debe estar en access/refresh y validarse contra
  `drivers.session_version`.
- `driver.logoutSession` marca offline, limpia FCM, incrementa versión y borra
  cookies. No permitir logout con pedido activo.
- Login por teléfono debe limpiar cookies admin/merchant.
- Logout/401 driver no puede cerrar sesiones customer/merchant ni vaciar carrito.
- No volver a forzar `online` al montar el home.

### Pedidos

- `getAvailableForDriver` no puede devolver `customerPhone`, `notes` ni
  `deliveryAddress` antes de aceptar. Solo comercio, local, totales y estimado.
- Aceptar exige `ready_for_pickup` y todos los comercios con
  `order_commerce_status = ready_for_pickup`.
- Aceptar pasa a `driver_assigned`, no a `ready_for_pickup`.
- Aceptar bloquea driver y pedido; un driver no puede tener dos activos.
- `getActiveOrders` debe incluir `driver_assigned` y mostrarse en el home.
- `picked_up` solo se produce con `markCommercePickup` por comercio.
- `delivered` solo desde `on_the_way` y con todos los comercios retirados.
- `markCommercePickup` debe rechazar `delivered`, `cancelled` y `on_the_way`.
- No devolver `paymentReceipt` en accept/pickup/getById.
- No reintroducir auto-redirect al entregar.

### Dinero

- La ganancia es `deliveryFee × commissionRate / 100`, no el delivery fee bruto.
- `driver_earnings.amount` es la fuente histórica; no recalcular con la tasa
  actual.
- `driver_earnings` unique `(order_id,type)` y `onConflictDoNothing`.
- `delivered_at` es la fecha de entrega; no usar `updatedAt`.
- Fechas de earnings en `America/Guayaquil`.
- Admin no puede cambiar pedidos terminales ni reasignar pedidos retirados.
- No borrar un driver con historial.

### Tema y mapas

- Las 6 rutas usan `brand`/`brand-strong`/`brand-soft`, no verde de marca.
- Toda superficie debe tener variante `dark:`; `ThemeToggle` va en el header de
  cada pantalla.
- `useTheme` es un store global; no crear estados de tema locales.
- El mapa usa OpenStreetMap, no CARTO. Preservar
  `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` y
  `.dark .leaflet-tile` de `index.css`.
- `DriverOrder` debe llamar `invalidateSize()` al montar.
- No habilitar `commerce.me` ni `order.getCommerceOrders` en Driver; generan
  401 cruzados. Esas queries solo viven en `/commerce`.

### Chat y SSE

- El backend deriva `senderType`, `senderId`, `senderName`.
- Lectura por rol con `read_by_customer/driver/commerce`; no volver a `is_read`
  global.
- `markAsRead` actualiza solo el rol lector y emite `chat_read`.
- No duplicar envíos: guard de `isPending`.
- El cliente escucha `order:{id}`, no `driver:{id}`.
- `driver.updateLocation` emite `driver_location` al pedido; el cliente
  invalida `order.getById`.
- `useDriverEvents` ignora `location_update` para no invalidar todo.
- SSE `driver:{id}` solo admin o el mismo driver.

### Rendimiento y datos

- `getOrderHistory` límite 50, sin teléfono, orden por `deliveredAt`.
- Índice `orders(driver_id,status,delivered_at)`.
- `getAvailableForDriver` y `getActiveOrders` con límites.
- No N+1 en ganancias/historial.
- No crear otro `QueryClient`.
- Limpiar `QueryClient` en logout/redirect.

## Verificación obligatoria

```bash
npx tsc -b --force
npm test
npm run lint
npm run build
npm run db:generate
node scripts/driver-api-smoke.mjs
node scripts/e2e-driver-smoke.mjs
node scripts/e2e-theme-smoke.mjs
node scripts/e2e-commerce-smoke.mjs
node scripts/admin-smoke.mjs
npx tsx scripts/redirect-smoke.ts
```

- Driver API debe seguir 16/16.
- Driver navegador debe seguir 8/8.
- Theme smoke debe seguir 50/50, sin 401 cruzados y con mapa visible.
- Negocio debe seguir 20/20.
- `db:generate` debe responder “No schema changes” después de migrar.

## Qué hacer si encuentras una discrepancia

1. Lee el doc y el código actual; no “arregles” de memoria.
2. Si doc y código difieren, gana el código solo después de verificar con tests;
   actualiza el doc en el mismo cambio.
3. Si el hallazgo está en `docs/driver/audit/`, no asumas que es una tarea.
   Revisa `MASTER_TRIAGE.md` y pregunta antes de reabrirlo.
4. Si el cambio afecta una regla de esta skill, actualiza la skill y explica por
   qué en el commit.

## Alcance cerrado

No hay una lista de tareas abiertas en esta skill. El flujo actual está cerrado
y verificado. No implementes funcionalidades nuevas, refactors grandes ni
cambios de modelo de datos sin un pedido explícito del usuario.

Si algo no está descrito en `docs/driver/`, pregunta antes de asumirlo.