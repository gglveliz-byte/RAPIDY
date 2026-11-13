# Auditoría consolidada del Repartidor — Rapidy

**Fecha:** 2026-11-13  
**Alcance:** `/driver`, `/driver/order/:id`, `/driver/earnings`,
`/driver/profile`, `/driver/chat/:orderId`, `/driver/history`, login por
teléfono, cookies, SSE, ganancias e integración con Cliente y Negocio.

> **Este documento no es un backlog.** Registra la auditoría, las correcciones
> aplicadas y la evidencia. El estado vigente está en
> [`../README.md`](../README.md), [`../FILE_MAP.md`](../FILE_MAP.md) y
> [`../VERIFICATION.md`](../VERIFICATION.md).

## 1. Fuentes

| Ruta | Reporte | Hallazgos |
|---|---|---|
| `/driver` | [`home.md`](./home.md) | 24 (1 P0, 11 P1, 12 P2) |
| `/driver/order/:id` | [`order.md`](./order.md) | 25 (1 P0, 9 P1, 15 P2) |
| `/driver/earnings` | [`earnings.md`](./earnings.md) | 16 (0 P0, 4 P1, 12 P2) |
| `/driver/profile` | [`profile.md`](./profile.md) | 19 (0 P0, 6 P1, 13 P2) |
| `/driver/chat/:orderId` | [`chat.md`](./chat.md) | 12 (0 P0, 6 P1, 6 P2) |
| `/driver/history` | [`history.md`](./history.md) | 11 (0 P0, 4 P1, 7 P2) |
| **Total bruto** | | **107 (2 P0, 40 P1, 65 P2)** |

## 2. P0 corregidos

| ID | Problema | Fuentes | Corrección aplicada |
|---|---|---|---|
| **DRV-P0-01** | PII pre-aceptación: cualquier driver autenticado recibía dirección, teléfono y notas de todos los pedidos `ready_for_pickup`. | DRV-HOME-01 | `order.getAvailableForDriver` devuelve solo comercio, dirección del local, total, pago, conteos y ganancia estimada. La PII del cliente se entrega únicamente en `order.getById` después de aceptar. |
| **DRV-P0-02** | El driver podía marcar `picked_up`/`delivered` por API sin retirar ni completar el checklist por comercio, cobrando la ganancia. | DRV-HOME-10, DRV-ORD-01 | `order.updateStatus` bloquea `picked_up` para driver; `delivered` exige `on_the_way` y que `pickedUpCommerceIds` cubra todos los comercios. `markCommercePickup` rechaza pedidos terminales. |

## 3. P1 corregidos

| ID | Problema | Fuentes | Corrección aplicada |
|---|---|---|---|
| **DRV-P1-01** | Aceptar dejaba `ready_for_pickup`, no `driver_assigned`, y no avisaba al comercio. | HOME-02, ORD-02 | `acceptOrder` valida todos los comercios listos, pasa a `driver_assigned`, inserta historial y emite a `order:` y `commerce:`. |
| **DRV-P1-02** | `acceptOrder` aceptaba `preparing` y rompía `markReady`. | HOME-03 | Solo acepta `ready_for_pickup` y verifica las filas `order_commerce_status`. |
| **DRV-P1-03** | Pedido activo invisible tras recarga; `getActiveOrders` omitía `driver_assigned`. | HOME-04, PROF-01 | Home consulta `getActiveOrders`, incluye `driver_assigned`, muestra banner “Continuar pedido” y bloquea aceptar otro. |
| **DRV-P1-04** | El home forzaba `online` cada 30 s y pisaba `offline`/`busy`. | HOME-05, PROF-03 | Estado derivado del backend; solo cambia por acción explícita. Backend rechaza online/offline con pedido activo. |
| **DRV-P1-05** | Ubicación congelada tras aceptar y cliente sin SSE driver. | HOME-06, ORD-05 | Watch en Home y en Order mientras hay pedido; `updateLocation` emite `driver_location` al canal `order:{id}`, que el cliente sí autentica. |
| **DRV-P1-06** | UI mostraba `deliveryFee` bruto como ganancia. | HOME-07, EARN-02, HIST-01 | Home usa `estimatedEarning`; detalle calcula con `commissionRate`; historial usa `driver_earnings.amount`; cancelados muestran 0. |
| **DRV-P1-07** | Login driver no limpiaba cookies merchant/admin y quedaba bloqueado. | HOME-08, PROF-04, CHAT-06 | Login por teléfono limpia admin/merchant antes de setear driver. E2E verifica `checkAuth` rol driver. |
| **DRV-P1-08** | Logout no marcaba offline, no limpiaba FCM y no revocaba tokens. | HOME-09, PROF-06 | `driver.logoutSession` marca offline, limpia FCM, incrementa `sessionVersion` y borra cookies. Contexto y refresh validan versión. |
| **DRV-P1-09** | Carrera de aceptación: dos pestañas podían aceptar dos pedidos. | HOME-11 | `acceptOrder` bloquea primero la fila del driver con `FOR UPDATE`. |
| **DRV-P1-10** | Carrera entrega/cancelación y transición sobre lectura vieja. | HOME-12 | `order.updateStatus` bloquea la fila y revalida estado dentro de la transacción. |
| **DRV-P1-11** | `acceptOrder`/`markCommercePickup` devolvían `paymentReceipt`. | ORD-03 | Ambas respuestas eliminan `paymentReceipt`. |
| **DRV-P1-12** | XSS almacenado con el nombre del comercio en `divIcon` de Leaflet. | ORD-04 | `escapeHtml` antes de inyectar el nombre en el HTML del marcador. |
| **DRV-P1-13** | Fechas de earnings en UTC; filtros Hoy/Semana/Mes errados. | EARN-01, HOME-19 | Nuevas earnings usan `guayaquilDateKey`; frontend agrupa/filtra por `createdAt` en `America/Guayaquil`. |
| **DRV-P1-14** | Cancelar/reentregar desde admin dejaba earnings huérfanos. | EARN-04 | Admin no puede cambiar pedidos `delivered`/`cancelled`; no se puede reasignar un pedido retirado/terminal. |
| **DRV-P1-15** | Liquidación por pedido usaba la tasa actual, no el monto acreditado. | EARN-05 | El listado admin usa `driver_earnings.amount` cuando existe. |
| **DRV-P1-16** | `updateProfile` sin validación; podía borrar nombre/vehículo/placa. | PROF-05 | Zod exige nombre/vehículo/placa no vacíos; frontend valida y muestra error. |
| **DRV-P1-17** | Toggle de perfil no invalidaba caché. | PROF-01 | Invalida `getProfile` y `getById` al cambiar estado. |
| **DRV-P1-18** | Ganancias del perfil siempre `0.00`. | PROF-02 | Perfil usa `driver.getProfile`, que suma `driver_earnings`. |
| **DRV-P1-19** | `is_read` global: un rol marcaba leído para todos. | CHAT-01 | `chat_messages` tiene `read_by_customer/driver/commerce`; `markAsRead` actualiza solo el rol lector y `getByOrder` calcula el estado por viewer. |
| **DRV-P1-20** | `markAsRead` no se disparaba con el tope de 50 mensajes. | CHAT-02 | Depende del último `message.id`, no de `messages.length`. |
| **DRV-P1-21** | Enter/mensajes rápidos ignoraban `isPending` y duplicaban. | CHAT-03 | Guard de reentrada en `handleSend` y botones deshabilitados. |
| **DRV-P1-22** | Caché de un driver anterior podía quedar tras redirect. | CHAT-04 | `SessionGuard.redirectOut` limpia `QueryClient`. |
| **DRV-P1-23** | Historial usaba `updatedAt` mutable y fee bruto. | HIST-01, HIST-02 | Usa `deliveredAt` (fallback `updatedAt`), `earningAmount` y motivo de cancelación. |
| **DRV-P1-24** | Historial sin límite ni índice. | HIST-03 | `limit` 50, proyección sin teléfono e índice `orders(driver_id,status,delivered_at)`. |
| **DRV-P1-25** | Reasignar/borrar driver rompía historial. | HIST-04 | No se reasigna un pedido retirado/terminal; no se borra un driver con historial. |
| **DRV-P1-26** | Teléfonos de driver sin unicidad ni normalización robusta. | HOME-24 | `drivers.phone` unique; login compara últimos 9 dígitos. |
| **DRV-P1-27** | Rotación de refresh en localhost con `SameSite=None` sin `Secure`. | HOME-23 | Contexto usa solo `getSessionCookieOptions`; no sobrescribe `sameSite`. |

## 4. P2 de acabado

Se corrigieron los P2 de mayor impacto:

- historial con error/reintento, estado compartido y sin flash de vacío;
- earnings con error/reintento y fechas locales;
- perfil con error/reintento, estado real y validación;
- home con error/reintento, sin distancias/rating inventados y sin “1 items”;
- detalle sin auto-redirect, sin teléfono/chat en terminales, mapa centrado en el pedido y con atribución;
- chat con banner de error y botones pendientes;
- targets/safe-area en home y navegación;
- `orders.updatedAt` ya no se reescribe al liquidar.

El acabado visual completo (dark mode en todas las pantallas driver, rediseño
de mapas y accesibilidad fina) queda documentado como estado actual, no como
una lista de tareas.

## 5. Integración Cliente ↔ Negocio ↔ Repartidor

| Tramo | Estado |
|---|---|
| Cliente crea pedido | Correcto |
| Negocio acepta/prepara/marca listo | Correcto |
| Driver ve pedido sin PII | Correcto |
| Driver acepta → `driver_assigned` | Correcto; cliente y negocio lo ven |
| Driver retira por comercio → `picked_up` | Correcto; negocio recibe SSE |
| Driver va en camino → `on_the_way` | Correcto |
| Driver entrega → `delivered`, `delivered_at`, earning | Correcto |
| Cliente ve ubicación en vivo | Correcto vía `order:{id}` (`driver_location`) |
| Negocio ve asignación/retiro | Correcto vía `commerce:{id}` |
| Historial y earnings del driver | Coinciden con `driver_earnings` |
| Chat | Lectura por rol; identidad derivada del backend |

## 6. Evidencia

```bash
npx tsc -b --force                 # 0 errores
node scripts/driver-api-smoke.mjs  # 16/16 PASS
node scripts/e2e-driver-smoke.mjs  # 8/8 PASS
npm run db:generate                # No schema changes
npm run db:migrate                 # 0009 aplicada
```

El smoke API valida: login, disponibles sin PII, ganancia estimada, aceptar →
`driver_assigned`, bloqueo de entrega sin retiro, retiro por comercio,
`on_the_way`, `delivered_at`, earning, historial con `earningAmount`, lectura
de chat por rol, login sobre cookies merchant y revocación de tokens al logout.

El E2E de navegador valida: login, reload, `/driver`, `/driver/earnings`,
`/driver/profile`, `/driver/history`, `/driver/chat/:id` y 0 errores de página.

## 7. Lo que no se debe romper

- Identidad del driver desde `ctx.driver.id`, nunca desde `input.driverId`.
- PII del cliente solo después de aceptar.
- `driver_assigned` al aceptar; `ready_for_pickup` es del comercio.
- Un pedido activo por driver; locks de driver y pedido.
- `markCommercePickup` por comercio antes de `picked_up`.
- `delivered` solo desde `on_the_way` y con todos los comercios retirados.
- `driver_earnings` con unique `(order_id,type)` y `onConflictDoNothing`.
- `delivered_at` como fecha de entrega; no usar `updatedAt` para historial.
- `driver_earnings.amount` como fuente de ganancia histórica.
- `sessionVersion` en tokens y logout para revocar refresh.
- `read_by_*` por rol; `is_read` global ya no decide la lectura.
- SSE `order:` para el cliente; `driver:` solo admin/driver.
- `QueryClient` único y limpieza en logout/redirect.
- Migraciones aditivas y revisadas; no borrar historial de pedidos/drivers.