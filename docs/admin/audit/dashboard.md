# Auditoría `/admin` — Administración

**Fecha:** 2026-11-13  
**Rol auditado:** `admin`  
**Ruta:** `/admin` (Dashboard administrativo) y procedimientos admin que alimentan sus KPIs, comisiones y liquidaciones.  
**Modalidad:** auditoría de solo lectura. No se modificó código, no se ejecutaron migraciones, no se reinició el servidor y no se hizo reset/revert.

## 1. Alcance y archivos

### 1.1 Superficie auditada

| Capa | Archivos |
|---|---|
| Ruta / guard | `src/App.tsx`, `src/components/SessionGuard.tsx` |
| Layout / navegación | `src/components/AdminLayout.tsx` |
| Pantalla | `src/pages/admin/Dashboard.tsx` |
| Datos / SSE | `src/hooks/useDeliveryData.ts`, `src/hooks/useAdminSSE.ts`, `src/hooks/useSessionSync.ts` |
| Routers admin | `server/admin-router.ts`, `server/admin/dashboard-router.ts`, `server/admin/orders-router.ts`, `server/admin/commerces-router.ts`, `server/admin/drivers-router.ts` |
| Auth / contexto | `server/admin-auth.ts`, `server/login-router.ts`, `server/context.ts`, `server/middleware.ts`, `server/boot.ts` (SSE) |
| Integración | `server/order-router.ts`, `server/commerce-router.ts`, `server/events.ts`, `contracts/orderStatus.ts`, `db/schema.ts` |
| Documentación | `docs/customer/README.md`, `docs/commerce/README.md`, `docs/driver/README.md`, `docs/commerce/VERIFICATION.md`, `docs/driver/VERIFICATION.md`, `docs/commerce/audit/MASTER_TRIAGE.md`, `docs/driver/audit/MASTER_TRIAGE.md` |
| Evidencia existente | `scripts/admin-smoke.mjs`, `scripts/e2e-commerce-smoke.mjs`, `scripts/driver-api-smoke.mjs` |

### 1.2 Límites del alcance

- Se auditaron a fondo `/admin`, sus procedimientos de dashboard y los procedimientos admin que afectan dinero, pedidos y liquidaciones.
- No se auditó en profundidad la UI de `/admin/commerces`, `/admin/drivers`, `/admin/products` ni `/admin/settings`; solo se revisó lo que impacta KPIs, settlement o seguridad del dashboard.
- La pantalla `/admin` **no** muestra una tabla de pedidos recientes ni un ranking de productos. El acceso rápido navega a `/admin/orders` y `/admin/products` (`src/pages/admin/Dashboard.tsx:334-355`). No se propone agregarlos; se deja constancia porque el alcance solicitado los menciona.
- No existía `docs/admin/` antes de este informe.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/SSE)

```text
/admin
  └─ SessionGuard role="admin"                     src/App.tsx:132
      ├─ login.checkAuth contra cookie HttpOnly     src/components/SessionGuard.tsx:102-133
      └─ redirect /login solo si el backend no reconoce al admin

AdminDashboard                                      src/pages/admin/Dashboard.tsx:20-102
  ├─ loadAll()                                      8 llamadas GET directas
  │   ├─ admin.dashboard                            KPIs globales
  │   ├─ admin.categoryRanking                      ventas por categoría
  │   ├─ admin.topCommerces { limit: 5 }            ranking de comercios
  │   ├─ admin.commerceCommissions                  comisión por comercio
  │   ├─ admin.driverEarningsBreakdown              ganancia/comisión por driver
  │   ├─ admin.adminDeliveryEarnings                fees cobrados vs pagados
  │   ├─ admin.salesByPeriod { period }             serie de ventas
  │   └─ admin.earningsByPeriod { period }          comisión + neto de envíos
  │
  ├─ useAdminSSE(loadAll)                            /api/events/admin-dashboard
  │   └─ evento "update" no-ping → loadAll()
  │       fallback: polling cada 30 s si SSE falla
  │
  └─ logout: login.logout { scope: "admin" }        limpia solo admin

server/admin-router.ts
  └─ adminQuery (cookie admin + rol admin)          server/middleware.ts:25-36
      └─ PostgreSQL (Drizzle)
```

### 2.1 Hallazgos de flujo relevantes

1. El Dashboard **no usa React Query** para sus datos: usa `trpcCall` directo y estado local (`Dashboard.tsx:37-78`). Por eso no hay caché, deduplicación ni cancelación de requests.
2. `loadAll` se dispara por tres vías: montaje (`:82`), cambio de `period` (`:64-78`) y SSE (`:80`). Al cambiar período también corre el efecto separado de `loadCharts` (`:91-93`), generando llamadas duplicadas.
3. El SSE admin entrega eventos ligeros (`{ type: "dashboard_update" }`) y el frontend recarga **todo** el dashboard ante cualquier evento distinto de ping (`useAdminSSE.ts:34-42`).
4. `admin.dashboard` y los rankings no consumen `admin.orders`; la lista pesada de pedidos se usa en `/admin/orders`. Aun así, `server/admin/orders-router.ts` se auditó porque contiene el settlement y los cambios recientes de `toggleSettled`.
5. `admin.topProducts` existe en `server/admin/products-router.ts:47-98` y se usa en `/admin/products`, no en `/admin`.

## 3. Hallazgos

> **No se identificaron P0 nuevos.** Los P1 son errores de dinero, fechas, rendimiento o sesión que deben corregirse antes de considerar confiable el panel.

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| **ADM-DASH-01** | P1 | Dinero / comisiones | `server/admin/dashboard-router.ts:49-55`, `:172-178`, `:284-294` | `dashboard`, `earningsByPeriod` y `commerceCommissions` calculan la comisión multiplicando `order_items.total` por `commerces.commission_rate` **actual**. Ignoran `order_commerce_status.commission_amount` (snapshot al crear el pedido) y `orders.commission`. | La comisión histórica cambia si el admin edita la tasa. El dashboard no cuadra con `commerce.getStats` (que sí usa el snapshot, `server/commerce-router.ts:343-350`) ni con el reporte de comisiones (que usa `orders.commission`, `server/admin/settings-router.ts:273-283,304`). La liquidación por comercio puede cobrarse mal. | Agregar `order_commerce_status.commission_amount` por comercio; usar fallback documentado solo para pedidos legacy; sumar en SQL y reutilizar la misma fuente en dashboard, rankings, settlement y exportaciones. |
| **ADM-DASH-02** | P1 | Fechas / series | `server/admin/dashboard-router.ts:91-96`, `:99-113`, `:134-143`, `:154-163` | Las series agrupan por `orders.created_at`, no por `delivered_at`. Día/semana usan `toISOString()` (UTC) y mes usa `getFullYear()/getMonth()` (zona del servidor). `earningsByPeriod` filtra pedidos por `created_at` pero earnings por `driver_earnings.created_at`. | Pedidos cerca de medianoche caen en el día/mes equivocado; entregas tardías no aparecen en el período real; `deliveryNet` puede quedar negativo o sin tarifa cuando la ventana de la orden y la del earning no coinciden. Contradice la regla de `delivered_at` + `America/Guayaquil` de Negocio. | Agrupar por `delivered_at` (fallback `created_at` solo legacy) con `date_trunc` en `America/Guayaquil`; usar la misma ventana para fees y earnings; probar 23:30 y 00:30. |
| **ADM-DASH-03** | P1 | Growth / KPI | `src/pages/admin/Dashboard.tsx:46-56`, `:91-93`, `:160-167` | `prevPeriodRef` guarda el período que el usuario seleccionó antes, no el período anterior equivalente. Pasar de “Mes” a “Día” compara 30 días contra 24 meses. El growth inicial es `null` y el porcentaje se muestra sobre “Facturación total” (histórica), no sobre la ventana del gráfico. | Tendencia falsa (“+/-X% vs periodo anterior”) que puede orientar decisiones de precios, campañas o inventario. | Calcular en servidor la ventana anterior de igual longitud y devolverla junto con la actual; mostrar el growth únicamente junto al KPI de esa ventana. |
| **ADM-DASH-04** | P1 | Performance / N+1 | `server/admin/orders-router.ts:36-54`, `:56-74`, `:79-84` | `admin.orders` hace `select *` de **todas** las órdenes sin límite ni paginación y, por cada orden, ejecuta consultas separadas de items, customer, driver y commerces. | 4N+1 consultas y payload que crece con todo el histórico. `/admin/orders` y cualquier consumidor del endpoint se degradan linealmente; con miles de pedidos puede agotar memoria o tiempo de respuesta. | Una consulta con joins y agregados, proyección explícita y paginación por cursor; endpoint de conteo separado para badges. |
| **ADM-DASH-05** | P1 | Settlement / multi-comercio | `server/admin/orders-router.ts:76-129`, `:131-143`, `:150-161`; `db/schema.ts:195-196` | `orders.commerceSettled` es un booleano **por pedido**, pero un pedido puede tener ítems de varios comercios. `commerceOwed = subtotal - totalCommerceCommission` usa el subtotal completo y `primaryCommerceName = coms[0].name`. | Liquidar un comercio marca como saldado todo el pedido; el monto mostrado no corresponde a ningún comercio en pedidos multi-comercio; el nombre visible puede ser el de un comercio que no es el principal. | Settlement por `(order_id, commerce_id)` sobre `order_commerce_status`, con `commission_amount` histórico; devolver desglose y monto por comercio. |
| **ADM-DASH-06** | P2 | Settlement / estado | `server/admin/orders-router.ts:150-177`; `server/admin/dashboard-router.ts:263-296` | `toggleCommerceSettled` y `toggleDriverSettled` no validan estado ni bloquean la fila: leen el flag y escriben `!flag`. La UI solo los muestra en `delivered` (`src/pages/admin/Orders.tsx:209-247`), pero la API acepta cualquier pedido. El dashboard muestra `commissionEarned` como “Total a cobrar” sin restar `commerceSettled`. | Vía API se puede marcar liquidado un pedido pendiente o cancelado; doble clic concurrente pierde el toggle; el “Total a cobrar” del dashboard nunca baja después de liquidar. | Exigir `delivered`; `UPDATE ... SET flag = NOT flag` atómico con lock; exponer liquidado vs pendiente y descontarlo en el dashboard. |
| **ADM-DASH-07** | P1 | Integración Driver | `server/admin/orders-router.ts:279-286`, `:310-312`, `:341-400` | `assignDriver` no consulta `drivers.status` ni pedidos activos del driver. `updateOrderStatus` marca `busy` al asignar y `online` al entregar/cancelar sin comprobar si el driver tiene otro pedido activo. | El admin puede asignar un driver `offline`, `busy` o con otro pedido; al liberar uno queda `online` con pedido activo. Rompe la regla de un pedido activo por driver del flujo Repartidor. | Bloquear la fila del driver, exigir `online` y sin pedido activo; liberar solo si no quedan pedidos activos; reutilizar el servicio de aceptación del driver. |
| **ADM-DASH-08** | P1 | Seguridad / sesión admin | `server/admin-auth.ts:9-10`, `:22-29`, `:42-51`, `:86-89`; `db/schema.ts:52-67`; `server/boot.ts:95-100` | El token admin no tiene `sessionVersion` ni denylist de `jti`. El refresh de 7 días se valida solo por firma y claim `role=admin`. Logout borra cookies pero no revoca. El SSE admin valida el JWT sin consultar `users.role` en DB. | Un refresh robado sigue siendo válido tras logout; un admin degradado o eliminado conserva el SSE; no hay revocación server-side. A diferencia de customer y driver, admin no tiene `sessionVersion`; su refresh de 7 días conserva el mayor privilegio. | Añadir `session_version` o store de `jti` para admin, incrementar en logout/cambio de rol, validar usuario y rol en el SSE y rotar refresh. |
| **ADM-DASH-09** | P2 | Estados de carga/error | `src/pages/admin/Dashboard.tsx:33-34`, `:64-78`, `:84-89`, `:118`, `:142-143` | Cada llamada de `loadAll` termina en `.catch(console.error)`; no hay estado de error. Si `admin.dashboard` falla, `kpi` queda `null` y la pantalla muestra “Cargando...” indefinidamente. `loadAll` setea `lastUpdate` y `secondsAgo=0` aunque fallen llamadas. `lastUpdate` inicia en 0, así que al primer tick del timer el header muestra un `Actualizado hace <epoch>s`. | Fallo de red/500 indistinguible de carga; datos viejos con timestamp fresco; el operador no sabe si el panel está roto. | Estado `error` + reintento visible; setear `lastUpdate` solo con éxito; inicializar `secondsAgo` en `null` y mostrar “—”. |
| **ADM-DASH-10** | P2 | Performance / race | `src/pages/admin/Dashboard.tsx:64-78`, `:82`, `:91-93` | `loadAll` depende de `period` y un segundo `useEffect` llama `loadCharts(period)`. Al cambiar período se duplican las llamadas a `salesByPeriod` y `earningsByPeriod`. No hay `AbortController` ni secuencia. | Doble carga; con clics rápidos, una respuesta vieja puede sobrescribir la nueva y mostrar un período bajo el botón de otro. | Un solo efecto para series, cancelación/versionado de requests y separar la carga de KPIs de la de gráficos. |
| **ADM-DASH-11** | P2 | Consistencia de KPIs | `server/admin/dashboard-router.ts:44-55`, `:91-96`, `:116`, `:222`; `src/pages/admin/Dashboard.tsx:160-175` | `totalRevenue` suma `orders.total` de todos los estados no cancelados/no rechazados/no pending (incluye `received`...`on_the_way` y el delivery fee). `totalCommission` solo suma `delivered`. El gráfico “Ventas Totales de Comercios (Bruto)” usa `order.total`, mientras `topCommerces` usa `order_items.total`. | KPIs no comparables; gráfico y ranking dan cifras distintas; “facturación” incluye pedidos que todavía pueden cancelarse. | Definir una sola base (GMV, ventas entregadas o subtotal de ítems), documentarla y aplicarla a KPI, serie y ranking. |
| **ADM-DASH-12** | P2 | Seguridad / PII | `server/admin/orders-router.ts:131-135`, `:188-191`; `db/schema.ts:80`, `:191` | `admin.orders` hace spread de `...order`, por lo que incluye `paymentReceipt` (base64) en el listado. `admin.orderDetail` devuelve `customers.*` completo, incluido `fcm_token`; el driver sí se sanea, el customer no. | Payload innecesariamente grande y PII/token push en el panel; mayor superficie si la respuesta se cachea o se exporta. | Proyección explícita: receipt solo en detalle; customer sin `fcmToken` ni campos internos; listado sin columnas pesadas. |
| **ADM-DASH-13** | P2 | SSE / Negocio | `server/admin/orders-router.ts:406-411` | `assignDriver` emite a `driver:*`, `order:*` y `admin:dashboard`, pero **no** a `commerce:{id}`. | El negocio no ve la asignación/reasignación por SSE y depende del polling de 30 s. | Emitir `order_status` a cada `commerce:{id}` del pedido después de asignar/reasignar. |
| **ADM-DASH-14** | P1 | Pedidos terminales / settlement | `server/admin/orders-router.ts:242-257`, `:283-307`; `server/admin/drivers-router.ts:217-224`, `:256-260` | `updateOrderStatus` permite `status === "delivered"` sobre un pedido ya `delivered`. En ese caso reescribe `deliveredAt = new Date()`, inserta otro historial y, si viene `driverId`, cambia el driver. Como el earning ya existe, no crea uno nuevo: el fee queda atribuido al driver nuevo y el earning al anterior. | `delivered_at` se mueve y las series cambian; el settlement por driver queda descuadrado o negativo; se puede “reasignar” un pedido entregado sin auditoría. | No-op idempotente si el estado no cambia; prohibir cambiar `driverId` en terminales; no tocar `deliveredAt` en una repetición. |
| **ADM-DASH-15** | P2 | KPI / Driver | `src/pages/admin/Dashboard.tsx:152`; `server/admin/dashboard-router.ts:60-70` | “Repartidores (Activos)” usa solo `onlineDrivers`. El backend también devuelve `busyDrivers` y `totalDrivers`, que no se muestran. | Subestima a los repartidores trabajando (`busy`) y el KPI no significa “activos”. | Mostrar `online + busy` o renombrar “Disponibles” y exponer el desglose. |
| **ADM-DASH-16** | P2 | Visual / copy / dark mode | `src/components/AdminLayout.tsx:33-38`, `:56`; `src/pages/admin/Dashboard.tsx:106`, `:123`, `:137`, `:171`, `:273`, `:295`, `:313`, `:337` | El admin conserva el verde `#2E7D32` y estilos legacy, mientras la marca Rapidy es `#FF6A00`. No hay clases `dark:` en `src/pages/admin` ni en `AdminLayout.tsx`. Faltan tildes en “Categorias mas vendidas”, “Comercios mas vendidos”, “Acceso rapido”, “costos de envio”. El avatar es “A” hardcodeado. | Inconsistencia con cliente/negocio; el admin no soporta el tema oscuro que sí existe en otras rutas; copy descuidado. | Usar tokens de marca, variantes `dark`, copy con tildes e identidad real del admin. |
| **ADM-DASH-17** | P2 | Accesibilidad | `src/pages/admin/Dashboard.tsx:114-118`, `:120-136`, `:181`, `:213`, `:245`, `:405`, `:459`; `src/components/AdminLayout.tsx:87-99` | Targets de 26–36 px en selector de período, recarga y logout; textos de 9–10 px `text-gray-400` sobre blanco; botones icon-only sin `aria-label`; gráficos sin alternativa textual. | No cumple uso táctil mínimo ni contraste AA en varios textos; lector de pantalla no entiende acciones ni gráficos. | Mínimo 44 px, contraste AA, `aria-label`, resumen/tabla accesible de los gráficos. |
| **ADM-DASH-18** | P2 | UX de gráficos | `src/pages/admin/Dashboard.tsx:177-185`, `:209-217`, `:241-249`, `:192-194`, `:224-226`, `:256-258`, `:295`, `:313`, `:405` | Tres grupos de botones Día/Semana/Mes/Año comparten el mismo `period` y cambian los tres gráficos. Los botones significan granularidad, no ventana: “Día” carga 30 días y renderiza 12 buckets por `slice(-12)`. El eje Y redondea montos bajos a `$0k` o `$1k`. En mes, `slice(-5)` muestra “26-11” en lugar de “nov 2026”. Rankings y “Total a cobrar” son históricos sin etiqueta de alcance. | El usuario cree que cada gráfico tiene su propio filtro; ejes y etiquetas confunden; no se distingue ventana vs histórico. | Un solo control con etiqueta de alcance, eje adaptativo y labels “últimos 12”; aclarar cuándo un bloque es histórico. |
| **ADM-DASH-19** | P2 | Performance / memoria | `server/admin/dashboard-router.ts:91`, `:139-140`, `:191-233`, `:236-261` | `salesByPeriod` y `earningsByPeriod` hacen `select().from(orders)` (todas las columnas, incluido `paymentReceipt`) y cargan todos los items en memoria. `topCommerces` y `categoryRanking` agregan todos los ítems entregados en JS sin fecha ni `LIMIT` SQL. | Memoria y latencia crecientes con el histórico; PII en memoria del servidor sin necesidad. | Proyección mínima, agregación SQL, índices y límites; no traer receipts para calcular series. |
| **ADM-DASH-20** | P2 | Tests / regresión | `scripts/admin-smoke.mjs:8-36`; `docs/commerce/VERIFICATION.md:16` | El smoke admin solo prueba login y `driver.list` admin/anon. No llama `admin.dashboard`, `salesByPeriod`, `earningsByPeriod`, `commerceCommissions` ni los toggles de settlement. | Los errores financieros, de fechas y de settlement no tienen regresión automatizada. | Smoke con dataset conocido: 2 comercios, pedido multi-comercio, cancelado, transfer, `delivered_at` y comisión histórica. |

### 3.1 Nota sobre severidades

- **P1:** error que puede producir dinero incorrecto, reportes engañosos, degradación operativa o pérdida de control de sesión.
- **P2:** UX, accesibilidad, performance no bloqueante, consistencia visual o cobertura.
- No se encontró un P0 nuevo en `/admin`; los P0 históricos de Negocio/Driver ya están corregidos según `MASTER_TRIAGE`.

## 4. Integración con Cliente, Negocio y Driver

| Tramo | Comportamiento actual | Evidencia | Riesgo |
|---|---|---|---|
| **Cliente crea pedido** | El pedido nace `pending_payment` (transfer) o `received` (cash). Se guarda `orders.commission` y `order_commerce_status.commission_amount` por comercio. | `server/order-router.ts:456-469`, `:513-523`; `db/schema.ts:258` | Correcto como snapshot. El dashboard lo ignora y recalcula con la tasa actual (ADM-DASH-01). |
| **Negocio ve sus métricas** | `commerce.getStats` usa `order_commerce_status.commission_amount` y agrupa por `delivered_at` en Guayaquil. | `server/commerce-router.ts:265-350` | Admin y Negocio pueden mostrar comisiones distintas para el mismo pedido. |
| **Cliente cancela / admin cancela** | Revenue, rankings y comisiones excluyen `cancelled` y `payment_rejected`. El admin que cancela vía `admin.updateOrderStatus` **no** escribe `cancellationReason` ni `cancelledBy`. | `server/admin/dashboard-router.ts:44-47`, `:94`, `:207`, `:248`, `:273`; `server/admin/orders-router.ts:252-257`; `server/order-router.ts:929-932` | El cliente/negocio no ve motivo ni actor de la cancelación hecha por admin. |
| **Entrega** | `delivered_at` se escribe al pasar a `delivered` tanto en el flujo driver como en el admin. | `server/order-router.ts:927`; `server/admin/orders-router.ts:256`; `db/schema.ts:202` | Correcto en escritura, pero el dashboard no lo consume (ADM-DASH-02). |
| **Ganancias del driver** | `driver_earnings` es idempotente por `(order_id, type)`; el settlement admin usa el earning guardado si existe. | `db/schema.ts:295`; `server/admin/orders-router.ts:107-112`; `server/order-router.ts:903-911` | Correcto para el monto histórico. La reasignación post-entrega puede descuadrar el fee (ADM-DASH-14). |
| **SSE al Negocio** | Cambios de estado del admin emiten a `commerce:{id}`. `assignDriver` no emite a comercio. | `server/admin/orders-router.ts:318-330`, `:406-411` | El negocio no ve la asignación de driver en vivo; polling de 30 s como respaldo. |
| **Sesión multi-rol** | Login admin limpia cookies driver/merchant; el logout admin es role-scoped y no toca customer ni merchant. | `server/login-router.ts:130-142`, `:249-257`; `src/hooks/useDeliveryData.ts:21-45` | Correcto: no hay logout cruzado. Falta revocación server-side del refresh admin (ADM-DASH-08). |
| **Estados compartidos** | `contracts/orderStatus.ts` define 11 estados y transiciones. El admin puede forzar cualquier estado; el guard terminal solo bloquea cambios a otro estado. | `contracts/orderStatus.ts:228-257`; `server/admin/orders-router.ts:242-250` | Un `delivered` repetido no es no-op y permite cambiar `driverId` (ADM-DASH-14). |

## 5. Lo que funciona y no se debe romper

- **`adminQuery` exige cookie admin y rol `admin` en cada procedimiento** (`server/middleware.ts:25-36`). No reemplazarlo por `publicQuery`.
- **`SessionGuard` es cookie-first para admin**: no exige `qs_session` ni confía en localStorage; rehidrata desde `login.checkAuth` (`src/components/SessionGuard.tsx:102-133`).
- **401/logout role-scoped**: `handleAuthError` resuelve `roleForPath("/admin")` y limpia solo admin (`src/hooks/useDeliveryData.ts:21-45`; `src/hooks/useSessionSync.ts:94-109`).
- **Logout admin no cierra customer/merchant/driver** (`server/login-router.ts:249-257`). Mantener `scope`.
- **Cookies admin HttpOnly con `SameSite=Lax` en localhost y `Secure` fuera** (`server/lib/cookies.ts:8-16`; `server/admin-auth.ts:64-83`).
- **Rate limit de login compartido para admin** (8 fallos/10 min, bloqueo 15 min, hash dummy) (`server/login-router.ts:18-31`, `:43-82`, `:112-121`).
- **SSE admin autenticado y con ping de 30 s**; el frontend ignora `type: "ping"` y usa fallback de 30 s, no polling agresivo (`server/boot.ts:266-284`; `src/hooks/useAdminSSE.ts:34-72`).
- **Exclusión de cancelados/rechazados** en revenue, rankings y comisiones (`server/admin/dashboard-router.ts:44-47`, `:94`, `:207`, `:248`, `:273`).
- **Settlement usa el earning real cuando existe** y no la tasa actual (`server/admin/orders-router.ts:107-112`). Mantener ese fallback solo para pedidos legacy sin earning.
- **`orders.delivered_at` se escribe en ambos caminos de entrega** (`server/order-router.ts:927`; `server/admin/orders-router.ts:256`). No volver a usar `updated_at` para reportes.
- **`order_commerce_status.commission_amount` existe y es el snapshot correcto** (`db/schema.ts:258`). El admin debe consumirlo; no eliminarlo.
- **Terminales protegidos parcialmente**: no se puede pasar `delivered`/`cancelled` a otro estado (`server/admin/orders-router.ts:242-250`). La corrección de idempotencia no debe abrir esa puerta.
- **`driver_earnings` unique `(order_id, type)` + `onConflictDoNothing`** (`db/schema.ts:295`; `server/order-router.ts:903-911`). No duplicar earnings.
- **Un solo `QueryClient`**; el dashboard usa fetch directo y limpia caché en logout (`src/pages/admin/Dashboard.tsx:100`). No crear un segundo provider.
- **No cambiar nombres de cookies, canal SSE (`admin:dashboard`) ni evento `update`** sin actualizar frontend y smoke.

## 6. Evidencia y verificación

### 6.1 Método

Auditoría estática de código con lectura de archivos y búsquedas dirigidas (`grep` sobre `server/admin`, `src/pages/admin`, `db/schema.ts`). No se ejecutaron migraciones, tests de navegador, ni se reinició el servidor de desarrollo en `localhost:3000`.

### 6.2 Trazabilidad de los hallazgos principales

| Verificación | Evidencia revisada | Resultado |
|---|---|---|
| Autorización admin | `server/middleware.ts:25-36`; `server/context.ts:72-94` | `adminQuery` valida `ctx.admin.role === "admin"`; el contexto relee el usuario de DB. Correcto. |
| Guard de ruta | `src/App.tsx:132`; `src/components/SessionGuard.tsx:102-133` | `/admin` está envuelto en `SessionGuard role="admin"`; cookie-first. Correcto. |
| 401 role-scoped | `src/hooks/useDeliveryData.ts:21-45`; `src/hooks/useSessionSync.ts:94-109` | Un 401 en `/admin` limpia solo admin y navega a `/login`. Correcto. |
| Logout admin | `server/login-router.ts:249-257`; `server/admin-auth.ts:86-89` | Borra `quickgo_admin_token` y `quickgo_admin_refresh`; no toca customer. Correcto, sin revocación server-side. |
| SSE admin | `server/boot.ts:266-284`; `src/hooks/useAdminSSE.ts:34-72` | Endpoint exige identidad admin; eventos `update`; ping ignorado; fallback 30 s. Correcto. |
| Comisión histórica | `server/order-router.ts:513-523`; `db/schema.ts:258`; `server/admin/dashboard-router.ts:49-55,172-178,284-294` | El snapshot se escribe, pero el dashboard no lo lee. Hallazgo ADM-DASH-01 confirmado por código. |
| Fechas | `server/admin/dashboard-router.ts:91-113,134-163`; `server/lib/dates.ts:1-14` | El admin no usa `guayaquilDateKey` ni `delivered_at`; mezcla UTC y TZ local. Hallazgo ADM-DASH-02 confirmado. |
| Terminales | `server/admin/orders-router.ts:242-250,256` | Bloquea cambio a otro estado, pero permite repetir `delivered` y reescribe `deliveredAt`. Hallazgo ADM-DASH-14 confirmado. |
| Settlement real | `server/admin/orders-router.ts:107-112`; `db/schema.ts:295` | Usa `driver_earnings` guardado cuando existe. Correcto para el monto histórico. |
| N+1 | `server/admin/orders-router.ts:36-54,56-74,79-84` | 4 consultas por pedido + `select *` sin límite. Hallazgo ADM-DASH-04 confirmado. |
| Smoke existente | `scripts/admin-smoke.mjs:8-36` | Solo login y `driver.list`; no cubre dashboard. `docs/commerce/VERIFICATION.md:16` reporta admin 200 / anon 401. |

### 6.3 Evidencia runtime existente (no re-ejecutada)

- `docs/commerce/VERIFICATION.md:16` reporta `node scripts/admin-smoke.mjs` → **admin 200 / anon 401**.
- `docs/driver/VERIFICATION.md:19` reporta el mismo smoke como regresión.
- `docs/commerce/VERIFICATION.md:10-18` reporta `tsc`, tests, lint, build y E2E de negocio en verde. Esa evidencia **no** cubre los cálculos del dashboard admin.

### 6.4 No verificado

- No se verificaron totales reales contra la base de datos del usuario.
- No se probó un pedido multi-comercio real ni el settlement de dos comercios.
- No se midió latencia con volúmenes altos; el N+1 se determinó por código.
- No se probó el comportamiento visual en navegador, dark mode ni lectores de pantalla.
- No se probó la revocación de un refresh admin robado; se determinó por ausencia de `sessionVersion`/denylist.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Archivo:línea | Riesgo |
|---|---|---|---|---|
| 1 | **ADM-DASH-01** | P1 | `server/admin/dashboard-router.ts:49-55` | Comisión histórica recalculada con la tasa actual: dashboard, chart y liquidación no cuadran con Negocio ni con el export. |
| 2 | **ADM-DASH-02** | P1 | `server/admin/dashboard-router.ts:91-113`, `:134-163` | Series por `created_at` con mezcla UTC/local e ignorando `delivered_at`: días, meses y neto de envíos incorrectos. |
| 3 | **ADM-DASH-04** | P1 | `server/admin/orders-router.ts:36-84` | `admin.orders` sin paginación y 4N+1 consultas: la operación admin se degrada con el histórico. |
| 4 | **ADM-DASH-05** | P1 | `server/admin/orders-router.ts:76-161` | Settlement por pedido y no por comercio: multi-comercio liquida de más o al comercio equivocado. |
| 5 | **ADM-DASH-08** | P1 | `server/admin-auth.ts:9-51`, `:86-89` | Refresh admin de 7 días sin revocación ni `sessionVersion`; logout no invalida tokens robados. |

**P1 adicionales para el consolidado:** `ADM-DASH-03` (growth falso), `ADM-DASH-07` (driver offline/busy asignable) y `ADM-DASH-14` (segunda entrega reescribe `delivered_at` y descuadra earnings).  
**Riesgo de integración principal:** el admin y el negocio calculan comisiones con fuentes distintas; cualquier conciliación entre `/admin`, `/commerce/stats` y la exportación de comisiones puede fallar aunque los pedidos sean correctos.