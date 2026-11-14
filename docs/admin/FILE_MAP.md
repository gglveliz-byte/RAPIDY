# Mapa archivo por archivo — Flujo Administración

**Estado:** corregido y verificado al 2026-11-13.

## Páginas

| Archivo | Responsabilidad | Contratos clave | Estado |
|---|---|---|---|
| `src/pages/admin/Dashboard.tsx` | KPIs, ventas, comisiones, growth, rankings y SSE | `admin.dashboard`, `admin.salesByPeriod`, `admin.salesGrowth`, `admin.earningsByPeriod`, `admin.topCommerces`, `admin.categoryRanking`, `admin.commerceCommissions`, `admin.driverEarningsBreakdown` | Corregido; growth por ventana equivalente y comisión snapshot |
| `src/pages/admin/Commerces.tsx` | Comercios, merchants, estado, comisión e imágenes | `admin.listCommerces`, `admin.createMerchant`, `admin.updateCommerce`, `admin.deleteCommerce` | Corregido; error/retry, confirmación, límites de imagen y lat/lng |
| `src/pages/admin/Drivers.tsx` | Repartidores, comisión y credenciales | `driver.list`, `admin.createDriver`, `admin.updateDriver`, `admin.deleteDriver` | Corregido; comisión validada y contraseña mínimo 8 |
| `src/pages/admin/Orders.tsx` | Pedidos, pagos, asignación y settlement | `admin.orders`, `admin.orderDetail`, `admin.updateOrderStatus`, `admin.assignDriver`, `admin.toggleCommerceSettled`, `admin.toggleDriverSettled` | Corregido; paginación, settlement por comercio y modal |
| `src/pages/admin/Products.tsx` | Moderación global | `admin.topProducts`, `admin.listProducts`, `admin.toggleProductAvailability`, `admin.toggleProductFeatured`, `admin.deleteProduct` | Corregido; acciones conectadas |
| `src/pages/admin/Settings.tsx` | Configuración y reportes | `admin.settings`, `admin.updateSettingsBulk`, `admin.getReports` | Corregido; guardado atómico, validación, errores y exportación |
| `src/components/AdminLayout.tsx` | Layout y logout | `login.logout` scope admin | Sin cambios de contrato |

## Backend

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `server/admin/dashboard-router.ts` | KPIs, series, rankings, comisiones | Comisión snapshot, fechas Guayaquil, `salesGrowth` |
| `server/admin/orders-router.ts` | Pedidos, detalle, transiciones, asignación y settlement | Paginado, sin N+1, settlement por comercio, locks y transiciones seguras |
| `server/admin/commerces-router.ts` | Comercios, merchants, estado e imágenes | Email normalizado, activación validada, revocación y emisión SSE |
| `server/admin/drivers-router.ts` | Repartidores, comisión y borrado | Validación estricta y `sessionVersion` al cambiar contraseña |
| `server/admin/products-router.ts` | Moderación de catálogo | `adminPaused`, `products:global`, SQL agregado y borrado seguro |
| `server/admin/settings-router.ts` | Settings y reportes | Allowlist, validación, bulk transaccional y reportes conciliables |
| `server/admin-auth.ts` | JWT/cookies admin | `sessionVersion` en access/refresh |
| `server/merchant-auth.ts` | JWT/cookies merchant | `sessionVersion` para revocación por desactivación |
| `server/context.ts` | Resolución de sesión | Valida versión de admin, merchant y driver |
| `server/login-router.ts` | Login/logout/refresh | Normalización, bloqueo de comercio inactivo y revocación |
| `server/boot.ts` | SSE | Identidades validadas contra DB y `sessionVersion` |
| `server/order-router.ts` | Pedidos y comisión histórica | Snapshot en pedidos del negocio, precio fail-closed y comisión driver congelada |
| `server/product-router.ts` | Catálogo público/merchant | Excluye `admin_paused` y bloquea reactivación |
| `server/driver-router.ts` | Aceptación driver | Congela `driver_commission_rate` al asignar |
| `server/lib/dates.ts` | Fecha Guayaquil | Fuente única para series y reportes |

## Base de datos

| Tabla / cambio | Uso |
|---|---|
| `users.session_version` | Revocación de admin y merchant |
| `order_commerce_status.settled_at` | Settlement por comercio |
| `orders.driver_commission_rate` | Comisión del driver congelada al asignar |
| `products.admin_paused` | Pausa administrativa irreversible por merchant |
| `app_settings.updated_by` | Actor del último cambio de configuración |
| `orders.delivered_at` | Fecha contable de entrega |
| `order_commerce_status.commission_amount` | Comisión histórica por comercio |

Migraciones: `db/migrations/0010_skinny_rage.sql` y
`db/migrations/0011_icy_satana.sql`.

## Pruebas

| Archivo | Uso |
|---|---|
| `scripts/admin-api-smoke.mjs` | 29 casos API: sesión, settings, comisión, settlement, entrega, driver, productos y reportes |
| `scripts/e2e-admin-smoke.mjs` | 12 casos navegador: login, reload, 5 rutas, acciones, settings y 0 errores |
| `scripts/driver-api-smoke.mjs` | 16 casos API driver (driver dedicado) |
| `scripts/e2e-driver-smoke.mjs` | 8 casos navegador driver |
| `scripts/e2e-commerce-smoke.mjs` | 20 casos navegador negocio |
| `scripts/admin-smoke.mjs` | Login admin y autorización básica |
| `scripts/redirect-smoke.ts` | Sesión/landing/login |

## Reglas de archivos

- La comisión histórica sale de `order_commerce_status.commission_amount`.
- La comisión del driver sale de `orders.driver_commission_rate` al entregar.
- El settlement se guarda por comercio en `order_commerce_status.settled_at`.
- `admin.orders` no devuelve `paymentReceipt`; el detalle sí.
- Repetir un estado es no-op; `delivered_at` no se reescribe.
- No asignar drivers offline, busy o con otro pedido activo.
- No permitir que el merchant reactive `products.admin_paused`.
- No volver a calcular reportes con la tasa actual.
- No usar `created_at` para ventas entregadas.
- No aceptar claves de settings fuera de la allowlist.
- No abrir SSE admin sin validar rol y `session_version` en DB.
- No borrar físicamente comercios, drivers con historial ni productos con ventas.