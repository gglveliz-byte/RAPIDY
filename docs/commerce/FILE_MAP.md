# Mapa archivo por archivo — Flujo Negocio

**Estado:** corregido y verificado al 2026-11-13.  
“Estado” indica si el archivo quedó corregido, verificado o si su
comportamiento actual es intencional.

## Páginas

| Archivo | Responsabilidad | Contratos clave | Estado |
|---|---|---|---|
| `src/pages/Login.tsx` | Login admin/merchant/driver | `login.login`, `login.checkAuth` | Corregido; rate limit, roles validados, sesión por rol |
| `src/pages/commerce/Dashboard.tsx` | Estado, métricas, pedidos recientes, populares | `commerce.me`, `getById`, `getStats`, `toggleStatus`, `order.getCommerceOrders` | Corregido; estados reales, sin precios falsos, loading/error |
| `src/pages/commerce/Orders.tsx` | Monitor de cocina, filtros, acciones | `order.getCommerceOrders`, `order.updateStatus`, `commerce.markReady` | Corregido; estados por comercio, pago pendiente, rechazo con motivo |
| `src/pages/commerce/Products.tsx` | CRUD de catálogo | `product.getByCommerce`, `create`, `update`, `delete` | Corregido; errores, reset de modal, imágenes |
| `src/pages/commerce/Stats.tsx` | KPIs, gráfico, ranking, comisión | `commerce.getStats` | Corregido; 7 días reales, comisión histórica, `topProducts` |
| `src/pages/commerce/Profile.tsx` | Datos, mapa, imágenes, logout | `commerce.getById`, `update`, `toggleStatus`, `login.logout` | Corregido; email no se envía, coordenadas opcionales, toggle atómico |
| `src/pages/customer/CommerceDetail.tsx` | Vitrina `/store/:id` | `commerce.getById`, `product.getByCommerce`, `products:global` | Corregido; sin comercios inactivos, sin SSE merchant, agrega deshabilitado si cerrado |
| `src/pages/customer/Cart.tsx` | Carrito y checkout | `order.quote`, `order.create` | Corregido; precio/unidad desde quote, aviso de cambio |
| `src/pages/customer/Search.tsx` | Búsqueda cliente | `product.search`, `product.list`, `commerce.list` | Corregido; SSE de productos |
| `src/pages/customer/Home.tsx` | Catálogo cliente | `product.list`, `getFeatured`, `commerce.list` | Corregido; enlaces a `/store/:id` |
| `src/pages/customer/components/OrderTrackingTimeline.tsx` | Timeline cliente | `contracts/orderStatus` | Corregido; estados por comercio nuevos |
| `src/App.tsx` | Rutas y refresh | `SessionGuard`, `login.refresh` | Corregido; `/store/:id`, redirect legacy, refresh por rol |

## Componentes

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/components/CommerceLayout.tsx` | Sidebar, header, bottom nav, badge, logout, SSE | SSE del panel, nombre real del comercio, estado abierto/pausado, logout role-scoped |
| `src/components/SessionGuard.tsx` | Guard de roles | Cookie-first para merchant/admin/driver, rehidrata usuario, error con reintento |
| `src/components/commerce/CommerceOrderCard.tsx` | Tarjeta de pedido | `ORDER_STATUS_META`, pago pendiente/rechazado, acciones por estado |
| `src/components/commerce/ProductModal.tsx` | Alta/edición de producto | Reset por apertura, compresión de imagen, errores inline |
| `src/components/commerce/DeleteConfirmModal.tsx` | Confirmación de borrado | Error inline, dark mode, targets |
| `src/components/CustomerBottomNav.tsx` | Nav cliente | Sin cambios de contrato |
| `src/components/ChatBubble.tsx` | Acceso al chat | Sin cambios |

## Hooks

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/hooks/useDeliveryData.ts` | Wrappers tRPC y queries | `useMerchantCommerceId` usa solo `commerce.me`; errores/refresh; 401 role-scoped |
| `src/hooks/useSessionSync.ts` | Sesión local por rol | Claves separadas, parseo seguro, evento con `detail.role` |
| `src/hooks/useCustomerSession.tsx` | Sesión cliente | No toca la sesión profesional; logout con `detail.role=customer` |
| `src/hooks/useOrderEvents.ts` | SSE | `useCommerceEvents` invalida pedidos/productos/stats/comercio; `useProductEvents` invalida catálogo/search |
| `src/hooks/useCart.tsx` | Carrito local | Solo se vacía con logout de cliente |
| `src/hooks/useSessionSync.ts` | Multi-pestaña | No reacciona a cambios de otros roles |

## Backend

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `server/login-router.ts` | Login, refresh, logout, checkAuth | Rate limit, hash dummy, roles, logout scope, sin `seedAdmin` público |
| `server/merchant-auth.ts` | JWT/cookies merchant | Access 24 h, refresh 7 d, HttpOnly |
| `server/customer-auth.ts` | JWT/cookies cliente | Sin cambios de contrato |
| `server/context.ts` | Resolución de cookies | Access + refresh, revalidación de rol |
| `server/middleware.ts` | Autorización base | `merchantQuery`, `participantQuery` |
| `server/commerce-router.ts` | Comercio, stats, toggle, markReady, push | Ownership, status no editable, stats agregadas, comisión snapshot |
| `server/product-router.ts` | Catálogo | Zod de precio/imagen, ownership, filtros públicos |
| `server/order-router.ts` | Quote, create, estados, comercio | Totales server-side, merchant path, proyección, `delivered_at` |
| `server/chat-router.ts` | Chat del pedido | Identidad derivada, rate limit |
| `server/lib/order-ready.ts` | Servicio único `markReady` | Transacción + `FOR UPDATE` + transición válida |
| `server/lib/order-status-sync.ts` | Sincronía de estados por comercio | Evita divergencia global/por comercio |
| `server/lib/order-access.ts` | Ownership de pedidos | Sin cambios de contrato |
| `server/admin/orders-router.ts` | Cambios admin | Sincroniza estados por comercio y emite SSE |
| `server/driver-router.ts` | Retiro del driver | Emite `picked_up` al comercio |
| `server/boot.ts` | SSE y tRPC | Canales autenticados |
| `server/events.ts` | Bus SSE/push | Push de comercio solo en `new_order` |
| `server/lib/env.ts` | Variables de entorno | Rechaza secretos débiles en producción |
| `server/lib/cookies.ts` | Opciones de cookie | Lax localhost / None+Secure fuera |

## Contratos y base de datos

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `contracts/orderStatus.ts` | 11 estados, labels, transiciones | Fuente única; `getCommerceOrderStatus` |
| `db/schema.ts` | Tablas e índices | `delivered_at`, `commission_amount`, enum por comercio |
| `db/migrations/0008_simple_vance_astro.sql` | Migración aplicada | Enum, columnas e índices |
| `src/lib/imageUpload.ts` | Compresión de imágenes | 8 MB entrada / ~1.8 MB data URL |
| `src/lib/customerAuthCache.ts` | Caché auth cliente | No convierte error de red en logout |

## Pruebas y evidencia

| Archivo | Uso |
|---|---|
| `scripts/e2e-commerce-smoke.mjs` | E2E negocio: sesión, rutas, precios, markReady, logout scope |
| `scripts/e2e-smoke.mjs` | E2E cliente (requiere OTP real o fallback) |
| `scripts/admin-smoke.mjs` | Admin login y `driver.list` |
| `scripts/redirect-smoke.ts` | Logo/landing/login con sesión |
| `contracts/orderStatus.test.ts` | 5 tests del contrato |
| `server/lib/otp.test.ts` | 4 tests de normalización OTP |
| `docs/customer/VERIFICATION.md` | Evidencia del flujo cliente |
| `docs/commerce/VERIFICATION.md` | Evidencia del flujo negocio |

## Archivos que no se deben volver a introducir

- Mapas locales de estados en Dashboard/Orders/Card.
- `status` en el input de `commerce.update`.
- Fallback de comercio por nombre en `useMerchantCommerceId`.
- `qs_session` como requisito de autenticación.
- Logout global para un solo rol.
- `product.getByCommerce` público para comercios inactivos.
- Segunda fuente de comisión calculada con tasa actual para pedidos nuevos.
- `CommerceTopProductsCard`/`CommerceLocationPicker` experimentales: no están
  en el árbol actual; el dashboard usa su tarjeta inline y el perfil su mapa
  propio. No agregues imports a archivos inexistentes.