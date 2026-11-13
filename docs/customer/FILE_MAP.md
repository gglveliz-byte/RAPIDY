# Mapa archivo por archivo — flujo Cliente

Estado actual verificado al 2026-11-13.  
“Estado” indica si el archivo quedó corregido/verificado o si tiene una limitación conocida.

## Páginas del cliente

| Archivo | Responsabilidad | Contratos clave | Estado |
|---|---|---|---|
| `src/pages/customer/Home.tsx` | Catálogo, búsqueda, categorías, banner, comercios | `category.list`, `commerce.list`, `product.getFeatured`, `product.list`, `product.search`, `product.getTopOrdered` | Corregido; N+1 eliminado; búsqueda de productos visible |
| `src/pages/customer/Search.tsx` | Búsqueda server-side y filtros | `product.search`, `product.list`, `commerce.list`, `category.list` | Corregido; URL sincronizada; cerrados no agregables |
| `src/pages/customer/Cart.tsx` | Carrito, quote, modal y checkout | `order.quote`, `order.create`, `settings.getPublic`, `commerce.list` | Corregido; totales server-side; idempotencia; errores inline |
| `src/pages/customer/OrderTracking.tsx` | Seguimiento, SSE, mapa, acciones | `order.getById`, `order.updateStatus`, `order.updatePaymentReceipt` | Corregido; SSE driver; sin auto-redirect; cancelación |
| `src/pages/customer/Chat.tsx` | Chat del pedido | `chat.getByOrder`, `chat.send`, `chat.markAsRead` | Corregido; SSE; optimista; rate limit |
| `src/pages/customer/Profile.tsx` | Perfil, dirección, historial, sesión | `customer.update`, `customer.logout`, `order.getByCustomer` | Corregido; labels compartidos; logout completo |
| `src/pages/customer/CustomerLogin.tsx` | Login OTP | `customer.requestOtp`, `customer.verifyOtp` | Corregido; redirige a `/home` si ya hay sesión |
| `src/pages/customer/Register.tsx` | Registro con verificación de teléfono | `customer.requestOtp`, `customer.verifyOtp`, `customer.register` | Corregido; exige registrationToken; 1 OTP |
| `src/pages/customer/Welcome.tsx` | Landing pública | Ninguno | Corregido; redirige a `/home` si hay sesión |
| `src/pages/customer/CommerceDetail.tsx` | Vitrina `/store/:id`, menú y agregar al carrito | `commerce.getById`, `product.getByCommerce` | Corregido; usa `useProductsByCommerce` y `products:global`; no abre SSE merchant; deshabilita agregar si está cerrado |
| `src/pages/customer/DownloadApp.tsx` | Descarga PWA/APK | Ninguno | Fuera del alcance de corrección |

## Componentes del cliente

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/pages/customer/components/HomeHeader.tsx` | Header fijo, cliente, dirección y buscador | Logo navega a `/home` |
| `HomeCategories.tsx` | Carrusel de categorías | Filtra por categoría activa |
| `HomeFeaturedCommerces.tsx` | Carrusel de destacados | Sin queries propias |
| `HomePromoBanner.tsx` | Banner top pedidos | Usa `product.getTopOrdered` |
| `CartAddressModal.tsx` | Modal de checkout | `role=dialog`, Escape, scroll lock, error inline, sin banco hardcodeado |
| `OrderTrackingMap.tsx` | Mapa OSM, marcadores, ETA, follow | Escape HTML, atribución, diff de marcadores, cleanup |
| `OrderTrackingTimeline.tsx` | Stepper y estados | Contrato compartido; botón re-subir comprobante |
| `OrderTrackingDetails.tsx` | Ítems, totales, dirección, cancelar | Cantidades normalizadas; cancelación cliente |
| `ProfileOrdersModal.tsx` | Historial completo | Búsqueda, filtros, modal accesible, labels compartidos |
| `src/components/CustomerBottomNav.tsx` | Navegación inferior | Tokens de marca; targets ≥44 px |
| `src/components/ChatBubble.tsx` | FAB de chat | Alineado al ancho 480 px; safe-area |
| `src/components/SessionGuard.tsx` | Guard de rutas | Cookie como fuente de verdad; restaura localStorage |
| `src/components/PageTransition.tsx` | Transición entre rutas | 120 ms; tipos corregidos |

## Hooks del cliente

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/hooks/useCart.tsx` | Estado/persistencia del carrito | TTL 7d, try/catch, storage sync, limpieza en logout |
| `src/hooks/useCustomerSession.tsx` | Sesión de cliente | Refresh 10 min; restaura `qs_session`; limpia todo al logout |
| `src/hooks/useDeliveryData.ts` | Wrappers tRPC y queries/mutations | `trpcCall`/`trpcMutate`; polling reducido; errores legibles |
| `src/hooks/useOrderEvents.ts` | SSE de pedido/comercio/driver | `addEventListener("update")`, backoff, estado `connected` |
| `src/hooks/useSessionSync.ts` | Sincronización entre pestañas | `qs_session` / evento storage |
| `src/hooks/useGeocode.ts` | Geocodificación con caché | TanStack Query, sessionStorage, AbortSignal |
| `src/hooks/useDebouncedValue.ts` | Debounce genérico | 300 ms en búsqueda |
| `src/hooks/usePushNotifications.ts` | Registro FCM | `customer.registerDeviceToken` |
| `src/hooks/usePWAInstall.ts` | Instalación PWA | Fuera del alcance de esta corrección |

## Librerías y contratos

| Archivo | Responsabilidad | Notas |
|---|---|---|
| `src/lib/customerAuthCache.ts` | Caché/dedupe de `customer.checkAuth` | TTL 30 s; invalidación en login/logout/401 |
| `src/lib/imageUtils.ts` | Fallback de imágenes | Evita imágenes rotas |
| `src/lib/locationUtils.ts` | Geocodificación inversa | Nominatim |
| `contracts/orderStatus.ts` | Fuente única de estados | 11 estados, labels, colores, transiciones |
| `src/providers/trpc.tsx` | Cliente tRPC + QueryClient | Un solo QueryClient; auth error handling |
| `src/providers/QueryProvider.tsx` | Compatibilidad de provider | Reutiliza el mismo QueryClient |

## Backend del flujo cliente

| Archivo | Responsabilidad | Estado |
|---|---|---|
| `server/customer-router.ts` | OTP, registro, sesión, perfil, baja | OTP real, rate limit, proyecciones seguras |
| `server/order-router.ts` | Quote, create, getById, updateStatus, receipt | Ownership, totales server-side, idempotencia |
| `server/chat-router.ts` | Mensajes del pedido | Participación, remitente derivado, rate limit |
| `server/product-router.ts` | Catálogo, búsqueda, CRUD | Filtros de disponibilidad y ownership |
| `server/commerce-router.ts` | Comercios, stats, markReady | Proyección pública y ownership |
| `server/driver-router.ts` | Driver, ubicación, aceptar/recoger | `driverId` desde contexto |
| `server/settings-router.ts` | Settings públicas | `delivery_fee`, `min_order_amount`, banco |
| `server/boot.ts` | SSE, CSP, tRPC | SSE autenticado; Google Fonts permitido |
| `server/events.ts` | Bus SSE + push | Filtro de eventos y deduplicación |
| `server/lib/order-access.ts` | Resolución de viewer y ownership | Fuente de autorización de pedidos |
| `server/lib/otp.ts` | Cliente NeuroChat + normalización | Provider + fallback dev + errores |
| `server/customer-auth.ts` | JWT/cookies/refresh | Access 15 min; refresh 365 días; sessionVersion |
| `server/context.ts` | Resolución de cookies | Verifica sesión y versión |
| `server/middleware.ts` | public/customer/driver/merchant/admin/participant | Autorización base |
| `db/schema.ts` | Tablas e índices | OTP, deletion requests, idempotencia, earnings únicos |
| `db/migrations/0007_dashing_mesmero.sql` | Migración del cambio | Aplicada; historial baselineado |

## Pruebas y evidencia

| Archivo | Uso |
|---|---|
| `contracts/orderStatus.test.ts` | 5 tests del contrato de estados |
| `server/lib/otp.test.ts` | 4 tests de normalización telefónica |
| `scripts/e2e-smoke.mjs` | E2E de las 6 rutas; 10/10 PASS |
| `scripts/admin-smoke.mjs` | Admin login y `driver.list` |
| `scripts/redirect-smoke.ts` | Regresión: logo/landing/login con sesión |
| `test-flow-screenshots/rapidy-audit/` | Capturas de las rutas |
| `docs/audit/MASTER_TRIAGE.md` | Consolidado de hallazgos y correcciones |
