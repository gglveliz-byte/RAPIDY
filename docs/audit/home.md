> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de la ruta `/home` — Rapidy (DeliveryCity)

**Fecha:** 2026-11-13  
**Commit auditado:** `fd11626` (`feat: rediseno oficial Rapidy de OrderTracking, Chat, optimizacion 0ms de carga y fix de checkout modal`)  
**Alcance:** ruta `/home` de cliente, su guard de sesión, componentes, hooks, contratos tRPC, consultas DB y assets asociados.  
**Método:** lectura estática completa de los archivos nucleares y de todo lo que referencian. No se ejecutó navegador ni se modificó código fuente. Los pocos puntos que requieren runtime están marcados como **hipótesis** y con el paso de verificación correspondiente.  
**Único archivo escrito:** `docs/audit/home.md`. El working tree ya tenía cambios previos del usuario en `OrderTrackingDetails.tsx`, `OrderTrackingMap.tsx` y `OrderTrackingTimeline.tsx`; no fueron tocados.

---

## 1. Resumen ejecutivo

- **P0 — Fuga masiva de PII:** `customer.list` y `customer.getById` son `publicQuery` y devuelven la fila completa de `customers` (nombre, teléfono, dirección y `fcmToken`). `customer.checkAuth` también devuelve la fila completa y el frontend la persiste en `localStorage`. Cualquier visitante anónimo puede enumerar la base de clientes.
- **P0 — Account takeover por teléfono:** `customer.login` solo pide el teléfono; `customer.register` con un teléfono ya existente devuelve y autentica la cuenta existente. No hay OTP, password ni verificación de posesión del número. Es la puerta de entrada real a `/home`.
- **P0 — IDOR de catálogo:** cualquier merchant autenticado puede crear productos en el comercio de otro (`product.create`) y editar/borrar productos ajenos (`product.update`, `product.delete`), sin verificar `merchantUserId`. El catálogo que muestra `/home` es manipulable por terceros.
- **P1 — La ruta “protegida” no verifica sesión real:** `SessionGuard` para `customer` solo comprueba `localStorage` (`qs_session` + `customer_session`), nunca llama a `customer.checkAuth`, y tras 600 ms renderiza `/home` como “Invitado” si falta la sesión de cliente. Después de logout, `qs_session` no se borra y `/home` sigue accesible.
- **P1 — Búsqueda de productos rota:** `Home` calcula `filteredProducts`, pero la sección que los pinta está oculta cuando `searchQuery` tiene texto (`!searchQuery`). Solo se filtran nombres de comercios. Buscar “Milanesa” produce “No encontramos resultados”, aunque exista el producto.
- **P1 — N+1 y escalado lineal:** cada `CommerceCard` monta `useProductsByCommerce`, por lo que `/home` dispara 1 query de comercios + N queries de productos, además de la consulta de cliente que hace `createContext` en cada request. Sin paginación ni índices, el coste crece con el catálogo.
- **P1 — Sin estados de error ni offline:** los hooks descartan `error` y devuelven `[]`; un fallo de API se renderiza como “No encontramos resultados”, sin retry ni banner de conexión. El banner promocional, además, muestra productos fake de respaldo mientras carga o si falla.
- **P1 — Rendimiento y accesibilidad visual:** `/image.png` pesa **1.831 KB (1600×1600)** y se pinta a 32×32 px; los contrastes de marca fallan AA (blanco sobre `#FFA000` = 2.04:1; blanco sobre `#FF6A00` = 2.87:1; `#FF6A00` sobre blanco = 2.87:1); hay controles de 16–28 px y tarjetas clickeables no accesibles por teclado; el viewport bloquea el zoom.

---

## 2. Mapa end-to-end

### 2.1 Secuencia de entrada y render

1. El navegador carga `index.html`, registra `/sw.js` y monta `main.tsx`.
2. `main.tsx` anida `TRPCProvider` → `CartProvider` → `CustomerSessionProvider` → `App` (`src/main.tsx:13-21`).
3. `App` vuelve a anidar un **segundo** `QueryProvider` (`src/App.tsx:145-153`). Las páginas cliente usan este segundo cache; las páginas que usan hooks `trpc.*` usan el cache del `TRPCProvider` exterior.
4. `AnimatedRoutes` resuelve `/home` y lo envuelve en `SessionGuard role="customer"` y `PageTransition` (`src/App.tsx:95`).
5. `SessionGuard` hidrata `checking` desde `localStorage`:
   - Si existen `qs_session` con `role: customer` y `customer_session`, renderiza inmediatamente.
   - Si no, hace `getSession()`; si no hay sesión, redirige a `/customer-login`.
   - Si hay `qs_session` pero no `customer_session`, arranca un timer de 600 ms y luego renderiza igualmente `/home` (`src/components/SessionGuard.tsx:14-21,45-61,83-85`).
   - Para `customer` **no** llama a `customer.checkAuth` ni a `login.checkAuth`.
6. `CustomerHome` se monta. `useCustomerSession` lee `customer_session` de `localStorage` y, en paralelo, lanza un `customer.checkAuth` en segundo plano que solo actualiza el cliente si devuelve un cliente; si devuelve `null` no limpia nada (`src/hooks/useCustomerSession.tsx:49-74`).
7. Se disparan en paralelo:
   - `category.list`
   - `commerce.list`
   - `product.getFeatured`
   - `product.getTopOrdered` (banner, cuando se renderiza)
   - `customer.checkAuth` (provider)
   - `EventSource /api/events/products`
   - `EventSource /api/events/commerces`
8. Cuando llega `commerce.list`, se renderiza una `CommerceCard` por comercio. **Cada una** monta `useProductsByCommerce(commerce.id)`, generando N requests adicionales en segunda ola.
9. `useProductEvents` y `useCommercesEvents` invalidan queries globales ante cualquier evento SSE.
10. El HTML/CSS/JS y las imágenes remotas compiten con el logo de cabecera de 1.8 MB.

### 2.2 Diagrama ASCII — frontend

```text
/home
  │
  ├─ App.tsx  (Route /home, SessionGuard role="customer", PageTransition)
  │    │
  │    ├─ SessionGuard
  │    │    ├─ getSession()            → localStorage "qs_session"
  │    │    ├─ useCustomerSession()    → localStorage "customer_session"
  │    │    ├─ [customer] NO checkAuth; timer 600ms si falta customer_session
  │    │    └─ redirectOut()           → /customer-login (solo si falta qs_session)
  │    │
  │    └─ CustomerHome (Home.tsx)
  │         ├─ HomeHeader              ← customer?.firstName/address; /image.png (1.8 MB)
  │         ├─ useCategories()          → GET /api/trpc/category.list
  │         ├─ useCommerces()           → GET /api/trpc/commerce.list
  │         ├─ useFeaturedProducts()    → GET /api/trpc/product.getFeatured
  │         ├─ HomePromoBanner
  │         │    └─ useTopOrderedProducts() → GET /api/trpc/product.getTopOrdered
  │         ├─ HomeFeaturedCommerces     ← commerces.slice(0,5)
  │         ├─ ProductCard ×≤8           ← filteredProducts (solo sin searchQuery)
  │         ├─ CommerceCard ×N
  │         │    └─ useProductsByCommerce(id) → GET /api/trpc/product.getByCommerce
  │         ├─ useProductEvents()        → EventSource /api/events/products
  │         ├─ useCommercesEvents()      → EventSource /api/events/commerces
  │         └─ CustomerBottomNav         ← useCart() (localStorage "cart")
```

### 2.3 Diagrama ASCII — backend y DB

```text
GET /api/trpc/<router>.<proc>?input=<superjson>
  │
  ├─ Hono app.all("/api/trpc/*")                         server/boot.ts:199-212
  │    └─ createContext()                                server/context.ts:145-155
  │         ├─ cookie quickgo_token → verifyAccessToken
  │         ├─ cookie refresh_token → verifyRefreshToken
  │         └─ SELECT * FROM customers WHERE id=$1      (por CADA request tRPC)
  │
  └─ appRouter                                            server/router.ts:13-25
       ├─ category.list        → SELECT * FROM categories ORDER BY sort_order
       ├─ commerce.list        → SELECT * FROM commerces WHERE status='active'
       ├─ product.getFeatured  → SELECT p.*, c.name FROM products p
       │                          LEFT JOIN commerces c ON c.id=p.commerce_id
       │                          WHERE p.is_featured='yes' AND p.is_available='yes'
       ├─ product.getTopOrdered→ SELECT product_id,count,sum(quantity) FROM order_items
       │                          GROUP BY product_id ORDER BY sum(quantity) DESC LIMIT 8
       │                        → SELECT p.*, c.name FROM products p LEFT JOIN commerces c
       │                          WHERE p.is_available='yes'
       │                        → sort() en memoria sobre TODOS los productos → slice(0,6)
       └─ product.getByCommerce→ SELECT * FROM products WHERE commerce_id=$1
```

### 2.4 Flujo de contratos resumido

| Etapa | Componente / hook | Llamada | Cache key | Render |
|---|---|---|---|---|
| Sesión | `SessionGuard` + `useCustomerSession` | `customer.checkAuth` (solo provider) | — | `HomeHeader` nombre/dirección |
| Categorías | `useCategories` | `category.list` | `["category.list"]` | `HomeCategories` (pills) |
| Comercios | `useCommerces` | `commerce.list` | `["commerce.list"]` | destacados, listado, cards |
| Productos destacados | `useFeaturedProducts` | `product.getFeatured` | `["product.getFeatured"]` | “Platillos populares” |
| Top pedidos | `useTopOrderedProducts` | `product.getTopOrdered` | `["product.getTopOrdered"]` | `HomePromoBanner` |
| Productos por comercio | `useProductsByCommerce` | `product.getByCommerce` | `["product.getByCommerce", id]` | mini-cards en cada `CommerceCard` |
| Tiempo real | `useProductEvents` / `useCommercesEvents` | SSE públicos | — | invalidaciones de cache |
| Carrito local | `useCart` | `localStorage` | — | badge + `addItem` |

La tabla completa de contratos está en el **Anexo A** y las consultas DB en el **Anexo B**.

---

## 3. Inventario de archivos y responsabilidades

| Archivo | Responsabilidad en `/home` | Observaciones |
|---|---|---|
| `src/pages/customer/Home.tsx` | Orquesta header, categorías, banner, destacados, productos y listado; define `ProductCard` y `CommerceCard`. | Filtro local; `filteredProducts` no se pinta en modo búsqueda; N+1 por `CommerceCard`; muchos hardcodes. |
| `src/pages/customer/components/HomeHeader.tsx` | Header fijo de dos filas: cliente/dirección, marca y buscador. | Logo `/image.png` de 1.8 MB; scroll listener; marca navega a `/`; controles pequeños. |
| `src/pages/customer/components/HomeCategories.tsx` | Pills de categorías dinámicas desde `category.list`. | Retorna `null` sin skeleton; `cat.color` no se usa; iconos por registry. |
| `src/pages/customer/components/HomeFeaturedCommerces.tsx` | Carrusel horizontal de “Restaurantes destacados”. | Recibe `commerces.slice(0,5)`; no muestra estado cerrado; fabrica rating/tiempo si faltan. |
| `src/pages/customer/components/HomePromoBanner.tsx` | Banner rotativo de top pedidos con framer-motion. | Fallback fake hardcodeado; `loading` sin usar; índice puede quedar fuera de rango; auto-rotación sin pausa. |
| `src/components/CustomerBottomNav.tsx` | Navegación inferior flotante de 4 tabs + badge del carrito. | Marca 29 usos de `#FF6A00`; badge puede mostrar fracciones de kg; sin `aria-current`. |
| `src/components/CommerceCartBar.tsx` | Barra de checkout del comercio (no se monta en `/home`). | Se usa desde `CommerceDetail`; lógica de conteo distinta a `useCart.totalItems`. |
| `src/components/PWAInstallBanner.tsx` | Banner de instalación PWA. | **No se importa en ningún lado**; código muerto; si se montara, `bottom-20` chocaría con la nav. |
| `src/components/PageTransition.tsx` | Animación de entrada/salida de 120 ms por ruta. | `min-h-screen`; `transform` mientras anima puede afectar a hijos `fixed` (**hipótesis**). |
| `src/components/SessionGuard.tsx` | Guard de rol. | Para customer confía en localStorage; no verifica backend; timer de 600 ms. |
| `src/hooks/useDeliveryData.ts` | Capa de queries/mutations con `fetch` + superjson. | No expone `error`; `useCommerces`/`useCategories` etc. devuelven `[]`; `trpcCall` GET. |
| `src/hooks/useCart.tsx` | Contexto de carrito persistido en localStorage. | `JSON.parse` sin try/catch; valor del contexto no memoizado; conteo de kg ambiguo. |
| `src/hooks/useSessionSync.ts` | Sincroniza `qs_session` entre pestañas. | No dispara en la misma pestaña; `JSON.parse` sin try/catch. |
| `src/hooks/useCustomerSession.tsx` | Contexto de cliente y refresh cada 10 min. | `checkAuth` de fondo no limpia sesión inválida; logout no borra `qs_session`. |
| `src/hooks/usePWAInstall.ts` | Stub de compatibilidad. | No-op; no se usa. |
| `src/hooks/useOrderEvents.ts` | SSE reconnection + invalidaciones. | Invalida todo `product.getByCommerce`; endpoints públicos; listeners de visibilidad con fuga menor. |
| `src/providers/trpc.tsx` | Cliente tRPC + su propio `QueryClient`. | Segundo cache; `handleAuthError` redirige a `/login` (backoffice); configuración distinta a `QueryProvider`. |
| `src/providers/QueryProvider.tsx` | `QueryClient` real de las páginas cliente. | `staleTime` 5 min; `refetchOnReconnect:"always"`; devtools importadas siempre. |
| `src/App.tsx` | Rutas, lazy loading, `AnimatePresence`, refresh global. | 4 páginas cliente eager; `Suspense` global reemplaza toda la UI; `login.refresh` cada 9 min. |
| `server/customer-router.ts` | Auth/registro/perfil de clientes. | `list`, `getById`, `checkAuth` públicos y con fila completa; login por teléfono. |
| `server/commerce-router.ts` | Listado, detalle, actualización y stats de comercios. | `list` devuelve todas las columnas; sin `orderBy`; no filtra `isOpen`. |
| `server/product-router.ts` | Productos, destacados, top pedidos, búsqueda y CRUD merchant. | N+1 potencial; sin filtros de comercio; IDOR en create/update/delete. |
| `server/category-router.ts` | Categorías. | Simple, correcto; sin límite. |
| `server/settings-router.ts` | Settings públicas. | `commission_rate` no está en la allowlist, pero `Cart` lo lee. |
| `db/schema.ts` | Tablas `customers`, `commerces`, `products`, `categories`, `orders`, `order_items`... | Sin índices secundarios; `fcmToken` en `customers`; `numeric` como string. |
| `src/index.css` | Tokens, safe areas, utilidades globales. | Tokens primarios verdes (`122 39% 33%`), no la marca naranja; `user-select:none`; inputs 16px `!important`. |
| `tailwind.config.js` | Design system. | Escala de radios invertida (`sm=16`, `md=18`, `lg=20`, `xl=24`); sin colores de marca. |
| `index.html` | Shell, viewport, fuentes, SW. | `user-scalable=no`; Google Fonts; manifest; SW sin offline de navegación. |
| `server/boot.ts` | Hono, CSP, SSE, tRPC handler. | CSP sin `fonts.googleapis.com`; SSE global sin auth; log por request. |
| `public/sw.js` | Service worker. | Ignora navegación/HTML: PWA sin shell offline. |
| `public/image.png` | Logo del header. | 1600×1600, 1.831 KB, mostrado a 32×32. |

---

## 4. Hallazgos priorizados

> Severidad: **P0** bloqueante de release; **P1** alto; **P2** medio; **P3** bajo.  
> Todos los hallazgos tienen evidencia `archivo:línea`; los marcados **hipótesis** requieren la verificación runtime del §11.

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| H-01 | **P0** | Seguridad / PII | `server/customer-router.ts:58-61,85-90,111-114`; `db/schema.ts:66-74` | `customer.list`, `customer.getById` y `customer.checkAuth` son públicos y devuelven la fila completa de `customers`, incluido `fcmToken` y dirección. `checkAuth` además hidrata `localStorage`. | Enumeración y exfiltración de toda la base de clientes; tokens FCM expuestos; violación de privacidad. | Eliminar `customer.list`; `getById` solo `customerQuery` y dueño; devolver DTO mínimo (id, firstName, lastName) desde `checkAuth`; nunca serializar `fcmToken`. |
| H-02 | **P0** | Autenticación | `server/customer-router.ts:9-31,33-56`; `src/pages/customer/CustomerLogin.tsx:52-56` | Login solo por teléfono; register con teléfono existente devuelve la cuenta existente y setea cookies. No hay OTP ni password. | Account takeover con solo conocer el número; acceso a domicilio e historial de pedidos. Es la entrada real a `/home`. | Implementar OTP SMS verificado o password; rate limiting; no autenticar un registro contra una cuenta existente sin verificación; tests de abuso. |
| H-03 | **P0** | Autorización / IDOR | `server/product-router.ts:122-145,161-183,195-209` | `product.create` solo verifica que el comercio exista; `product.update` y `product.delete` no comprueban que el comercio pertenezca a `ctx.merchant`. | Cualquier merchant puede modificar precios, fotos, disponibilidad o borrar productos ajenos; el catálogo de `/home` queda comprometido. | Join `products → commerces` y comparar `merchantUserId === ctx.merchant.id`; validar en create/update/delete; auditoría. |
| H-04 | **P1** | Auth / UX | `src/components/SessionGuard.tsx:14-21,45-61,83-85`; `src/hooks/useCustomerSession.tsx:59-74,83-93` | El guard de customer confía en localStorage y nunca llama a `checkAuth`; si existe `qs_session` pero falta `customer_session`, tras 600 ms renderiza `/home` como invitado. Logout no borra `qs_session`. | Acceso a `/home` después de logout o con token expirado; identidad/PII stale; la ruta “protegida” es cosmética. | Verificar `customer.checkAuth` al montar y al recuperar foco; limpiar `qs_session` y `customer_session` juntos; estado de auth único; redirigir ante `null`. |
| H-05 | **P1** | Funcional | `src/pages/customer/Home.tsx:88-95,141-170,190-195` | `filteredProducts` se calcula, pero la sección “Platillos populares” solo se renderiza si `!searchQuery`; el modo búsqueda filtra únicamente nombres de comercios. | Buscar “Milanesa” o “Helado” muestra “No encontramos resultados” aunque el producto exista. La búsqueda de producto es inservible. | Renderizar resultados de producto en modo búsqueda o navegar a `/search`; usar `product.search`/endpoint de búsqueda; tests con productos del seed. |
| H-06 | **P1** | Performance / DB | `src/pages/customer/Home.tsx:198-199,252-256,306-343`; `src/hooks/useDeliveryData.ts:169-176`; `server/product-router.ts:23-28` | Cada `CommerceCard` monta `useProductsByCommerce`, incluso fuera del viewport. Con N comercios: 1 query de lista + N de productos; cada request tRPC paga además un `SELECT customers` en `createContext`. | TTI y carga DB crecen linealmente; 5 comercios = ~10 requests tRPC; 50 = ~55. Riesgo de saturación y coste. | Incluir hasta 3 productos destacados en `commerce.list` (lateral/array_agg) o cargar por `IntersectionObserver`; limitar y paginar. |
| H-07 | **P1** | UX / Resiliencia | `src/hooks/useDeliveryData.ts:75-90,153-176`; `src/pages/customer/Home.tsx:184-195`; `src/pages/customer/components/HomePromoBanner.tsx:73-76` | Los hooks solo devuelven `data`/`loading`; descartan `error`. Un fallo de red/API se ve como lista vacía. El banner usa fallback fake mientras carga o si falla. | El usuario cree que no hay comercios; no hay retry ni diagnóstico; datos falsos en producción. | Exponer `isError`/`error`/`refetch`; componente `ErrorState` con retry; banner skeleton sin fake fallback; banner offline global. |
| H-08 | **P1** | Privacidad / Contrato | `server/commerce-router.ts:9-12`; `db/schema.ts:113-134`; `src/pages/customer/Home.tsx:60` | `commerce.list` devuelve todas las columnas: `commissionRate`, `merchantUserId`, `email`, `phone`, `address`, lat/lng, etc., a cualquier anónimo. | Exposición de comisión negociada e identificadores internos; scraping de contactos. | Proyección DTO pública (id, name, description, logo, cover, categoryId, minOrder, deliveryTime, rating, isOpen); datos privados solo en endpoints merchant/admin. |
| H-09 | **P1** | Performance | `src/pages/customer/components/HomeHeader.tsx:110-114`; `public/image.png` | Logo de **1.831 KB y 1600×1600** renderizado a 32×32 px, sin `width`/`height` ni `srcset`. | LCP y consumo de datos desproporcionados en móvil; especialmente malo en 3G. | Generar 64×64/96×96 WebP/AVIF (<10 KB), `width=32 height=32`, `fetchpriority="high"`, `decoding="async"`. |
| H-10 | **P1** | Contrato / Financiero | `server/order-router.ts:25-27,64-73`; `src/pages/customer/Cart.tsx:70-73,146-148`; `server/settings-router.ts:5-12` | `deliveryFee` y `commission` los envía el cliente. `Cart` lee `settings.commission_rate`, que no está en `PUBLIC_SETTINGS_KEYS`, así que siempre cae en 8%. El servidor no recalcula ninguno. | El cliente puede fijar envío 0 o comisión 0; merchants con 12–15% cobran mal; pedido por debajo del precio. | Calcular `deliveryFee` y `commission` en el servidor desde settings/commerce; quitar esos campos del input; validar total. |
| H-11 | **P1** | Contrato / Integridad | `server/order-router.ts:46-62,83-92,102-108` | `order.create` acepta `commerceId` del cliente y lo usa para `order_items`/`order_commerce_status`, sin comprobar que coincida con `product.commerceId`. | Atribución errónea de ventas, notificaciones al comercio equivocado, conciliación y comisión incorrectas. | Derivar `commerceId` del producto en el servidor; ignorar el del cliente; rechazar mismatch con `BAD_REQUEST`. |
| H-12 | **P1** | Robustez | `src/hooks/useCart.tsx:28-31`; `src/main.tsx:14-19` | `JSON.parse(localStorage.getItem("cart"))` sin try/catch ni validación de forma. No hay `ErrorBoundary` en `src` (búsqueda global sin coincidencias). | Un `cart` corrupto o de una versión anterior deja pantalla blanca al entrar a `/home`; el usuario no puede recuperarse. | Parse seguro + schema Zod + versión de storage; `ErrorBoundary` con reset; fallback a carrito vacío. |
| H-13 | **P2** | Datos / Merchandising | `src/pages/customer/Home.tsx:133-137`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:54-64`; `server/commerce-router.ts:9-12` | “Restaurantes destacados” es `commerces.slice(0,5)` sin `orderBy` en servidor. No hay criterio de destacado ni rating/orden; incluye panaderías, farmacias y supermercados. | El bloque cambia de contenido entre consultas y la etiqueta “restaurantes” es incorrecta; merchandising no controlable. | Añadir `isFeatured`/`sortOrder` a `commerces` o endpoint `home.featured` ordenado; renombrar a “Comercios destacados”. |
| H-14 | **P2** | Corrección de datos | `src/pages/customer/components/HomeFeaturedCommerces.tsx:82-117`; `src/pages/customer/Home.tsx:255-256`; `server/product-router.ts:23-28,30-51` | Destacados no muestra badge “Cerrado”; `getFeatured`/`getByCommerce` no filtran por `isOpen` ni `status` del comercio; `getByCommerce` tampoco filtra `isAvailable`. | Se promocionan comercios cerrados/suspendidos y productos no disponibles; el usuario puede agregarlos y descubre el problema en el checkout. | Filtrar por comercio `active` y `isOpen='open'` (o marcar claramente); filtrar `is_available='yes'`; deshabilitar add en cerrados. |
| H-15 | **P2** | UX / Datos fake | `src/pages/customer/components/HomePromoBanner.tsx:36-69,73-76` | `loading` se desestructura y no se usa; mientras carga (o si falla) `topList` es `fallbackProducts` hardcodeado con IDs 1/2/7/5. | Flash de productos falsos; clics a comercios inexistentes en una DB vacía; ranking “TOP” engañoso. | Skeleton de banner; quitar fallback de producción o usar datos marcados como demo; manejar `error`. |
| H-16 | **P2** | Race / Estado | `src/pages/customer/components/HomePromoBanner.tsx:74,79-88,120-184` | `currentIndex` no se resetea cuando cambia el largo de `topList`; si la lista pasa de 4 (fallback) a 3 (API), `topList[currentIndex]` es `undefined` y se usa `topList[0]`, pero `rankNumber = currentIndex+1` sigue mostrando “TOP 4” para el producto 1. | Badge de ranking incorrecto y transición asociada a producto equivocado. | Resetear `setCurrentIndex(0)` al cambiar la identidad de la lista; derivar rank del producto/dato, no del índice. |
| H-17 | **P2** | CLS / Percepción | `src/pages/customer/components/HomeCategories.tsx:66-85`; `src/pages/customer/Home.tsx:156-168,184-200,255-256,306-343` | No hay skeleton para categorías ni para la tira de productos de cada comercio. Las categorías aparecen tras el fetch (~56 px) y las mini-cards de producto aparecen después de cada card (~150 px), empujando el contenido. | Layout shift y saltos al cargar; la lista de comercios “salta” varias pantallas. | Skeletons con altura reservada para categorías y mini-cards; `aspect-ratio`/min-height; cargar previews junto al comercio. |
| H-18 | **P2** | UX / Navegación | `src/pages/customer/Home.tsx:62-63,97-106,130-141`; `src/pages/customer/Search.tsx:49-60` | `searchQuery`/`selectedCategory` viven solo en estado local. Al escribir se ocultan promo, destacados y populares de golpe; al navegar y volver se pierde el filtro. El submit a `/search?q=` no conserva categoría. | Saltos bruscos al tipear; estado perdido en back/forward; URLs no compartibles. | Sincronizar filtros con `useSearchParams`; no ocultar secciones enteras al tipear; navegar a `/search` con debounce o al submit. |
| H-19 | **P2** | Accesibilidad visual | `src/pages/customer/Home.tsx:229,267-272,321`; `src/pages/customer/components/HomePromoBanner.tsx:116,138-142`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:97-99` | Contrastes medidos: blanco/#FFA000 **2.04:1**, blanco/#FF8500 **2.44:1**, blanco/#FF6A00 **2.87:1**, #FF6A00/blanco **2.87:1**, zinc-400/#F7F7FA **2.40:1**, blanco/emerald-500 **2.54:1**. | Texto de precios, CTAs, badges y banner no legible para baja visión; incumple WCAG AA. | Tokens de marca accesibles (`#C2410C` o similar para texto; texto negro sobre naranja); revisar todos los pares; no usar zinc-400 para texto informativo. |
| H-20 | **P2** | Accesibilidad táctil | `src/pages/customer/Home.tsx:241,334`; `src/pages/customer/components/HomeHeader.tsx:132-137`; `src/pages/customer/components/HomeCategories.tsx:93`; `src/pages/customer/components/HomePromoBanner.tsx:191-204` | Add de producto 28×28; add de mini-card 24×24; botón limpiar búsqueda 16×16; pills ~32 px de alto; dots 6×6/24×6. | Difícil de tocar en 320–430 px; errores de tap y frustración. | Área táctil mínima 44×44 (aunque el icono sea pequeño); separación ≥8 px; dots con hitbox 44×44. |
| H-21 | **P2** | Accesibilidad / Teclado | `src/pages/customer/Home.tsx:218-222,260-264,277`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:84-87`; `src/pages/customer/components/HomeHeader.tsx:96-99` | Tarjetas y banner son `div` con `onClick`, sin `role`, `tabIndex`, `onKeyDown` ni foco visible. La marca del header también es un `div` clickeable. | Usuarios de teclado/switch no pueden abrir comercios ni el banner; incumple WCAG 2.1.1. | Usar `<button>`/`<Link>` o agregar `role="button" tabIndex=0` + Enter/Espacio + `focus-visible`; convertir la marca en `Link` a `/home`. |
| H-22 | **P2** | Movimiento / A11y | `src/pages/customer/components/HomePromoBanner.tsx:79-85,120-136,188-205`; `src/components/PageTransition.tsx:19-52`; `src/index.css` (sin `prefers-reduced-motion`) | El banner auto-avanza cada 3.8 s sin pausa; PageTransition anima todas las rutas; no hay `MotionConfig reducedMotion="user"` ni media query. | Incumple WCAG 2.2.2 (pausar/detener) y molesta a usuarios con sensibilidad al movimiento. | Pausa on hover/focus y botón visible; `MotionConfig reducedMotion="user"`; `@media (prefers-reduced-motion: reduce)` para animaciones CSS. |
| H-23 | **P2** | Imágenes / Robustez | `src/pages/customer/Home.tsx:220,262,316`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:90-95`; `src/pages/customer/components/HomePromoBanner.tsx:160-164`; `src/lib/imageUtils.ts:7-10` | Covers/productos son `background-image` (sin `alt`, `loading`, `width/height`); no hay `onError`; `safeImage` solo sustituye `picsum.photos`; el `<img>` del banner no tiene fallback. | Imágenes rotas quedan como rectángulos vacíos; todas las imágenes remotas (incluidas las de fuera del viewport) se descargan al montar. | Usar `<img>` con `loading="lazy"`, `decoding="async"`, dimensiones y `onError`; o `IntersectionObserver` + `srcset`; validar URLs. |
| H-24 | **P2** | Arquitectura / Cache | `src/main.tsx:13-21`; `src/App.tsx:147`; `src/providers/QueryProvider.tsx:5-27`; `src/providers/trpc.tsx:24-71`; `src/pages/customer/Home.tsx:66-68`; `src/hooks/useOrderEvents.ts:182-186` | Hay **dos `QueryClient`**: el de `TRPCProvider` (externo) y el de `QueryProvider` (interno). `Home` obtiene `trpc.useUtils()`, que apunta al cache externo, mientras los datos viven en el interno con claves planas (`["product.getFeatured"]`). | Invalidaciones `utils.*` son no-ops; configuración de cache distinta según página; deuda y bugs difíciles de rastrear. | Un solo `QueryClient`; eliminar `TRPCProvider` si no se usan hooks tRPC, o migrar todo a tRPC; una sola convención de query keys. |
| H-25 | **P2** | Bundle / Carga | `src/App.tsx:10-13,59-65,148-151`; `src/components/SessionGuard.tsx:6` | `Home`, `Search`, `Cart` y `Profile` se importan eager; el `Suspense` está por encima de todas las rutas, así que al abrir un chunk lazy se reemplaza toda la app por un spinner full-screen. `SessionGuard` importa Capacitor Push en el bundle web. | Primer load más pesado y navegación a `/commerce/:id` con pantalla completa negra en vez de conservar header/nav. | Mantener `Home` eager; lazy `Search`, `Cart`, `Profile`; `Suspense` por ruta conservando shell; cargar Capacitor push solo en nativo (`dynamic import`). |
| H-26 | **P2** | Layout / Safe area | `src/pages/customer/Home.tsx:120`; `src/pages/customer/components/HomeHeader.tsx:61-65,121`; `src/index.css:127-145` | El contenido usa `pt-[calc(env(safe-area-inset-top)+132px)]`, pero el header real mide ~112 px (sin notch) o ~143 px (notch 47 px) y `pt-safe` ya incluye el inset. | Quedan 20–36 px de espacio muerto variable; cualquier cambio de altura del header produce solapamiento. En 320 px el CTA del banner podría recortarse (**hipótesis** por aritmética de anchos). | Medir el header con `ResizeObserver` y publicar `--home-header-h`; usar `sticky` en lugar de offset mágico; probar 320/375/390/430 + notch. |
| H-27 | **P2** | Carrito / Unidades | `src/hooks/useCart.tsx:86-87`; `src/components/CustomerBottomNav.tsx:81-88`; `src/pages/customer/Home.tsx:231-239`; `src/pages/customer/CommerceDetail.tsx:97-116,124-134`; `src/pages/customer/Search.tsx:240-247` | `Home` y `Search` agregan sin `unitType`; `totalItems` suma cantidades de kg; el badge puede mostrar “0.4”. `CommerceCartBar` cuenta los kg como 1, con lógica distinta. | Precio/unidad inconsistentes para productos por peso; badge y conteos confusos. | Pasar `unitType` siempre; calcular unidades y peso por separado; badge “3” + “0.4 kg” o formatear; compartir selector de conteo. |
| H-28 | **P2** | PWA / Offline | `src/components/PWAInstallBanner.tsx:5-97`; `src/hooks/usePWAInstall.ts:1-5`; `public/sw.js:16-40` | El banner de instalación no se monta en ninguna ruta; el hook es un stub no-op. El SW ignora navegación/HTML, por lo que la PWA instalada no tiene shell offline. | Nunca se ofrece instalar; sin conexión, `/home` no carga aunque esté instalada. | Montar `PWAInstallBanner` en un layout global (no en backoffice) y corregir `bottom-20`; cachear shell `/home`/`index.html` con estrategia network-first + fallback. |
| H-29 | **P2** | Tipografía / CSP | `index.html:15-17`; `server/boot.ts:25-31`; `src/index.css:88`; `vercel.json:4-12` | `index.html` carga Outfit desde `fonts.googleapis.com`, pero el CSP de Hono permite `style-src 'self' 'unsafe-inline'` y `font-src 'self' data:`; el stylesheet/fuentes externas quedan bloqueados. En Vercel el HTML estático no pasa por ese middleware, así que el CSP no se aplica al documento. | En self-host/Node se pierde Outfit y se usa fallback; en Vercel hay inconsistencia de cabeceras. El `font-black` (900) tampoco está en los pesos pedidos (300–700). | Self-hostear Outfit woff2 (o permitir `fonts.googleapis.com`/`fonts.gstatic.com` en CSP) y aplicar el CSP también al HTML servido por Vercel; pedir el peso 900. |
| H-30 | **P2** | Privacidad / Sesión | `src/hooks/useCustomerSession.tsx:49-56,83-93,113-120`; `src/components/SessionGuard.tsx:27-33`; `server/customer-auth.ts:9-10,79-85`; `src/App.tsx:67-79` | PII completa en `localStorage` (`customer_session`), logout no borra `qs_session`, refresh token de **10 años** sin rotación/revocación, y tres mecanismos de refresh (`customer.refresh` 10 min, `login.refresh` 9 min, refresh implícito en contexto). | PII en dispositivo compartido; token de larga vida; requests duplicados y carreras (un `checkAuth` en vuelo puede re-settear al cliente tras logout). | Persistir solo id/nombre; limpiar ambos keys en logout; refresh único con rotación y revocación; abortar checkAuth al desmontar/logout. |
| H-31 | **P2** | DB / Performance | `db/schema.ts:113-153,184-194`; `db/migrations/*.sql` (sin `CREATE INDEX`); `server/product-router.ts:53-97` | No hay índices secundarios para `commerces.status`, `products.commerce_id`, `is_featured`/`is_available` ni `order_items.product_id`. `getTopOrdered` agrega toda la tabla y luego carga **todos** los productos disponibles para ordenar en JS. | Full scans por request; el banner es costoso y público; el coste crece con órdenes/productos. | Índices parciales/compuestos y `ORDER BY`/`LIMIT` en SQL; cachear top con TTL; `EXPLAIN ANALYZE` en staging. |
| H-32 | **P2** | SSE / Privacidad | `src/hooks/useOrderEvents.ts:176-207`; `server/boot.ts:163-197` | `/api/events/products` y `/api/events/commerces` son públicos, sin auth ni rate limit. Cada evento de cualquier producto invalida **todas** las queries `product.getByCommerce` sin debounce ni filtro por comercio. | Fuga de timing/actividad y tormentas de refetch si un merchant edita en lote; coste de red/DB. | Autenticar/canalizar por usuario o comercio; payload con `commerceId`; debounce/coalescing; invalidación selectiva. |
| H-33 | **P2** | Validación servidor | `server/order-router.ts:46-92`; `src/pages/customer/Cart.tsx:77-80` | La validación de comercio cerrado/inactivo y de producto disponible es solo cliente (`Cart`); el servidor acepta el pedido igual. | Un cliente modificado puede pedir a comercios cerrados/suspendidos o productos no disponibles. | Revalidar en `order.create`: comercio `active` y `isOpen='open'`, producto `is_available='yes'`, stock/precio. |
| H-34 | **P2** | Accesibilidad / Zoom | `index.html:5`; `src/index.css:6-12,120-125` | `user-scalable=no, maximum-scale=1.0` bloquea pinch-zoom; `user-select:none` global; inputs forzados a 16px `!important` aunque el diseño use 12–14px. | WCAG 1.4.4 incumplido; usuarios con baja visión no pueden ampliar; tipografía inconsistente. | Quitar `user-scalable=no`/`maximum-scale`; permitir selección de texto informativo; resolver el zoom de iOS con `font-size` real, no `!important`. |
| H-35 | **P3** | Tooling | `src/providers/QueryProvider.tsx:3,24`; `src/index.css:274-280` | `ReactQueryDevtools` se importa siempre; el CSS las oculta solo en ≤768 px. **Hipótesis:** en el build de producción puede quedar visible en desktop (verificar artefacto). | Peso extra y posible botón de devtools en producción. | `import.meta.env.DEV &&` + `lazy`; eliminar el hack CSS. |
| H-36 | **P3** | Navegación | `src/pages/customer/components/HomeHeader.tsx:88-91,96-99` | La dirección no es interactiva (solo el bloque completo va a `/profile`); el logo de marca navega a `/` (Welcome), no a `/home`. | Toque en la marca saca al usuario del home; no hay acceso directo a cambiar dirección. | Marca → `/home`; dirección → selector de dirección o `/profile?edit=address`; botones separados con labels. |
| H-37 | **P3** | A11y / Semántica | `src/pages/customer/components/HomeHeader.tsx:123-138`; `src/components/CustomerBottomNav.tsx:40-105`; `src/pages/customer/Home.tsx:108-204` | Input sin `<label>`/`aria-label`; botón “×” sin label; nav sin `aria-label`; tabs sin `aria-current`; página sin `<main>` ni `h1`. | Lectores de pantalla pierden contexto y estado; navegación por landmarks inexistente. | Labels/aria, `aria-current="page"`, `<nav aria-label="Principal">`, `<main>` y `h1` (visualmente oculto si hace falta). |
| H-38 | **P3** | Duplicación | `src/pages/customer/Profile.tsx:55-63`; `src/pages/customer/components/ProfileOrdersModal.tsx:64-100`; `src/pages/customer/Cart.tsx:359-367`; `src/pages/customer/components/OrderTrackingDetails.tsx:65-88` | Formateo de moneda repetido (`$${...}`/`toFixed`) y mapas de estado duplicados con coberturas distintas (`accepted`, `driver_assigned`, `on_the_way` no tienen label en algunos mapas). | Totales/estados inconsistentes entre pantallas; bugs al agregar un estado nuevo. | `formatMoney`, `formatOrderStatus`, `ORDER_STATUS_META` compartidos; tests de todos los estados del enum. |
| H-39 | **P3** | Duplicación / Búsqueda | `src/pages/customer/Home.tsx:212-346`; `src/pages/customer/Search.tsx:45-74,212-300` | `ProductCard`/`CommerceCard` y filtros están duplicados entre Home y Search; Search solo busca en `featuredProducts`, no en todos los productos. | Dos comportamientos distintos del mismo catálogo; búsqueda incompleta y divergencia visual. | Extraer `ProductCard`, `CommerceCard`, `useCatalogSearch`; endpoint de búsqueda server-side paginado. |
| H-40 | **P3** | Navegación / Scroll | `src/App.tsx:85-95`; `src/components/PageTransition.tsx:44-56` | No hay `ScrollRestoration`; al cambiar de ruta se conserva el scroll anterior. El `min-h-screen` de PageTransition puede producir doble altura de scroll. | Al abrir Perfil/Carrito se puede aterrizar a mitad de página; sensación de desorientación. | `<ScrollRestoration />` o scroll-to-top en `useEffect` por pathname; revisar `min-h-screen`. |
| H-41 | **P3** | UI / Datos | `src/pages/customer/components/HomeCategories.tsx:35-58,100`; `src/pages/customer/Home.tsx:143-146,176-180`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:55-64` | `Category.color` no se usa; iconos desconocidos caen a `MoreHorizontal`; “Platillos populares” usa `getFeatured`, no los más pedidos; “Restaurantes” incluye cualquier categoría. | Copy/iconografía engañosa y contenido no alineado con la etiqueta. | Usar `color`/icon set completo; renombrar “Destacados de la semana” o usar top pedidos; filtrar por categoría gastronómica si se mantiene “Restaurantes”. |
| H-42 | **P3** | Búsqueda | `src/pages/customer/Home.tsx:77-95`; `src/pages/customer/Search.tsx:62-74` | `.toLowerCase()` no normaliza acentos (“panaderia” no encuentra “Panadería”); filtro sin debounce ni `useDeferredValue`; se evalúa en cada tecla. | Búsqueda imprecisa y jank en catálogos grandes. | Normalizar con `normalize("NFD").replace(/\p{Diacritic}/gu,"")`; `useDeferredValue`/debounce; server search. |
| H-43 | **P3** | Tipos / Contrato | `src/pages/customer/Home.tsx:212,252`; `src/pages/customer/components/HomeFeaturedCommerces.tsx:28-38`; `src/hooks/useDeliveryData.ts:87,156,172` | `any[]`/`any` en productos, comercios y respuestas; interfaces FE locales que no derivan del `AppRouter`/schema. | Cambios de contrato pasan desapercibidos; `undefined` en runtime. | Tipos inferidos de tRPC (`inferRouterOutputs`) o Zod DTOs compartidos; eliminar `any`. |
| H-44 | **P3** | Assets / Fallback | `src/lib/imageUtils.ts:1-10`; `src/pages/customer/Home.tsx:220,262,316` | Los data URI de fallback contienen espacios sin comillas (`viewBox="0 0 48 48"`) y se inyectan en `url(...)`; en navegadores estrictos el `background-image` puede ser inválido. **Hipótesis** a verificar en iOS/Safari. | Covers/productos sin imagen podrían quedar en blanco aunque exista el fallback. | Usar URL-encoding completo (`%20`) o comillas en `url("...")`, o pintar `<img>` con `src` data URI. |
| H-45 | **P3** | Observabilidad | `server/boot.ts:199-212` | Cada request tRPC hace `console.log("[tRPC] matched:", ...)`, incluyendo path; no hay logs estructurados ni métricas. | Ruido/coste en producción; difícil medir latencia/errores por procedimiento. | Logger estructurado con nivel, duración, status y `requestId`; no loguear en cada request en prod. |
| H-46 | **P3** | Duplicación / Auth | `src/App.tsx:67-79`; `src/hooks/useCustomerSession.tsx:113-120` | Dos intervalos de refresh (`login.refresh` 9 min y `customer.refresh` 10 min) más el refresh implícito de `createContext`; `login.refresh` ignora el resultado. | Requests y rotaciones de cookie innecesarias; carreras y difícil diagnóstico. | Un solo refresh coordinado; usar el 401/expiración para refrescar; telemetría de fallos. |
| H-47 | **P3** | PWA / Layout | `src/components/PWAInstallBanner.tsx:58-60` | Si se montara tal cual, `fixed bottom-20` (80 px) quedaría debajo/encima de la nav flotante (`bottom-safe-nav`, ~58 px + inset) y usaría estilo blanco ajeno al tema. | Solapamiento y contraste incoherente. | Integrar en el layout con offset sobre la nav y tokens de marca; o eliminar el componente muerto. |
| H-48 | **P3** | Documentación | `src/pages/customer/Home.tsx:7-9,13-14` | El docblock dice 4 categorías fijas y “productos en tiempo real”; la pantalla usa categorías dinámicas y los eventos solo invalidan cache. | Comentarios obsoletos que inducen a errores de mantenimiento. | Actualizar docblocks o eliminarlos; documentar el contrato real en `docs/`. |

### 4.1 Detalle de los P0

#### H-01 — `customer.list` / `getById` / `checkAuth` exponen PII

`customer.list` es `publicQuery` y ejecuta `db.select().from(customers)` sin proyección (`server/customer-router.ts:111-114`). La tabla incluye `firstName`, `lastName`, `phone`, `address`, `fcmToken` (`db/schema.ts:66-74`). `getById` hace lo mismo por ID (`server/customer-router.ts:85-90`). `checkAuth` devuelve `ctx.customer` completo (`58-61`), y `useCustomerSession` lo guarda tal cual en `localStorage` (`src/hooks/useCustomerSession.tsx:66-71`).

Un `GET /api/trpc/customer.list` sin cookies devuelve la base completa. No hace falta un ID: `list` no recibe input. Es un P0 de privacidad y cumplimiento, independientemente de que `/home` no lo consuma directamente: comparte el router que autentica la entrada a la ruta y el `checkAuth` que hidrata su header.

**Fix:** borrar `list`; `getById` debe ser `customerQuery` y limitarse al propio `ctx.customer.id`; `checkAuth` debe devolver `{ id, firstName, lastName }` y nada más; `fcmToken` nunca debe salir al cliente.

#### H-02 — Login por teléfono sin verificación

`customer.login` recibe `{ phone }` y, si encuentra una fila, setea cookies de acceso (`server/customer-router.ts:33-56`). `CustomerLogin` solo pide el teléfono (`src/pages/customer/CustomerLogin.tsx:52-56`). `register` con un teléfono existente devuelve esa misma cuenta y autentica (`server/customer-router.ts:20-29`).

Cualquiera que conozca el teléfono de un cliente entra a su cuenta, ve su dirección e historial y puede crear pedidos. El registro agrava el problema porque no distingue “teléfono ya registrado” de “cuenta verificada”.

**Fix:** OTP SMS con código de un solo uso y expiración, o password; rate limit por IP/teléfono; no autenticar en `register` si el teléfono ya existe sin verificación; alertas de nuevo dispositivo.

#### H-03 — IDOR en mutaciones de producto

`product.create` verifica que `commerceId` exista, no que pertenezca al merchant (`server/product-router.ts:122-145`). `product.update` obtiene el producto pero no consulta el comercio ni `merchantUserId` (`161-183`). `product.delete` hace lo mismo (`195-209`).

Un merchant autenticado puede cambiar el precio/foto/disponibilidad de cualquier producto y verlo reflejado en `/home`; también puede borrarlo. Es un P0 de integridad de catálogo y de negocio.

**Fix:** en las tres mutaciones, hacer join `products.commerceId → commerces.merchantUserId` y comparar con `ctx.merchant.id`; si no coincide, `FORBIDDEN`. Añadir test de IDOR con dos merchants.

---

## 5. Estados de UI

| Estado | Comportamiento actual | Evidencia | ¿Skeleton? | Problema |
|---|---|---|---|---|
| Carga inicial | Header inmediato; categorías aparecen después; lista de comercios y productos destacados con `animate-pulse`; banner con productos fake. | `Home.tsx:109-204`; `HomeCategories.tsx:66`; `Home.tsx:156-168,184-200`; `HomePromoBanner.tsx:36-76` | Parcial (comercios/destacados/productos); no categorías ni banner real | CLS por categorías, mini-cards y banner; datos fake. |
| Catálogo vacío | “No encontramos resultados” solo en el bloque de comercios; productos populares queda vacío si no hay featured; banner muestra fallback. | `Home.tsx:156-168,190-195`; `HomePromoBanner.tsx:76` | No | Copy de “búsqueda” para un catálogo vacío; falsos productos. |
| Error de API | `useQuery` falla tras 1 retry; los hooks devuelven `[]`; se pinta el mismo estado vacío. Sin retry manual ni mensaje. | `useDeliveryData.ts:75-90,153-176`; `Home.tsx:190-195` | No | El usuario no distingue “sin datos” de “servidor caído”; no puede reintentar. |
| Sin conexión | No hay banner `offline`; las queries fallan y muestran vacío; SSE reintenta con backoff. El SW ignora navegación, así que un reload offline falla. | `useOrderEvents.ts:24-95`; `public/sw.js:16-40`; `index.html:41-45` | No | PWA sin shell offline; no hay feedback de reconexión. |
| Sesión expirada | `/home` sigue renderizando porque sus queries son públicas; el guard no verifica backend; el nombre/dirección salen de localStorage. | `SessionGuard.tsx:45-61`; `useCustomerSession.tsx:59-74`; `Home.tsx:58-61` | No aplica | No redirige; identidad stale; el usuario descubre el problema al pagar. |
| Datos parciales | Si falla categorías, no hay pills; si falla featured, la sección queda vacía; si falla un `getByCommerce`, esa card no tiene mini-cards. | `HomeCategories.tsx:66`; `Home.tsx:156-168,255-256,306-343` | No | Silencioso; no hay reintento por sección. |
| Imagen rota | Logo de comercio usa `onError`; covers/productos/banner no. `safeImage` solo trata null y picsum. | `Home.tsx:279-285`; `Home.tsx:220,262,316`; `HomeFeaturedCommerces.tsx:90-95`; `HomePromoBanner.tsx:160-164`; `imageUtils.ts:7-10` | No | Rectángulos vacíos; fallback CSS posiblemente inválido (H-44, hipótesis). |
| Navegación de vuelta | `searchQuery`/`selectedCategory` no están en URL; al volver se pierde el filtro; el scroll no se restaura al tope. | `Home.tsx:62-63,97-106`; `App.tsx:85-95` | No | Estado perdido y aterrizaje a mitad de página. |
| 320–430 px | Header de 112–143 px; contenido con offset fijo de 132 px; banner con columnas fijas; nav de 296 px en 320. | `HomeHeader.tsx:61-65,121`; `Home.tsx:120`; `HomePromoBanner.tsx:108-146`; `CustomerBottomNav.tsx:41-42` | Parcial | 20–36 px de hueco; posible clipping del CTA del banner a 320 (**hipótesis**); targets pequeños. |
| Seguridad de área | El header usa `pt-safe`; el contenido suma `env(safe-area-inset-top)` otra vez. La nav usa `bottom-safe-nav` y el home tiene `pb-32`. | `index.css:127-145`; `Home.tsx:109,120`; `CustomerBottomNav.tsx:41` | No | Doble conteo del inset superior; holgura inferior suficiente en Home. |

### 5.1 Skeletons y layout shift

- **Sí hay skeleton** para la lista de comercios (`Home.tsx:184-189`, 3 bloques de 128 px) y para productos populares (`156-161`, 3 bloques de 160×192).
- **También** para destacados (`HomeFeaturedCommerces.tsx:68-76`, 3 bloques de 200×176).
- **No hay skeleton** para categorías (`HomeCategories.tsx:66` retorna `null`) ni para el banner (`HomePromoBanner.tsx:73-76` usa fake data).
- **No hay skeleton** para las mini-cards de producto de cada `CommerceCard` (`Home.tsx:255-256,306-343`): aparecen después de la carga de cada query, empujando todo el listado.
- El skeleton de comercio mide 128 px; una card real con 3 mini-cards puede superar los 350 px. La diferencia acumulada de 3 cards es de cientos de píxeles → CLS alto.

### 5.2 Safe area y 320–430 px

La constante `132px` de `Home.tsx:120` no coincide con la altura real del header:

- Sin notch: `pt-safe` 16 + `pt-1` 4 + avatar 32 + `mb-2` 8 + buscador 40 + `pb-3` 12 ≈ **112 px**.
- Con `env(safe-area-inset-top)=47`: **143 px**.
- El contenido arranca en `132 + inset`: **132 px** sin notch y **179 px** con notch.
- Resultado: **20 px** de hueco sin notch y **36 px** con notch. No hay solapamiento, pero sí espacio muerto variable y acoplamiento frágil.

La nav inferior: `bottom-safe-nav` = `max(12px, inset)`; altura ~58 px; Home `pb-32` = 128 px, suficiente. En iPhone con inset 34, la nav queda 34 px sobre el borde y el contenido tiene 36 px extra de holgura. En `Cart`, en cambio, el botón fijo usa `bottom-[74px]` y puede solaparse con la nav (fuera del alcance de `/home`, pero es deuda del mismo patrón).

---

## 6. Inconsistencias visuales

### 6.1 Tokens vs hardcodes

- La marca naranja no existe como token: `index.css` define `--primary: 122 39% 33%` (verde, línea 27) y `--ring` verde (39), mientras `/home` usa **29 referencias a `#FF6A00`** repartidas en `Home.tsx` (6), `HomeHeader.tsx` (7), `HomeCategories.tsx` (4), `HomeFeaturedCommerces.tsx` (2), `HomePromoBanner.tsx` (1) y `CustomerBottomNav.tsx` (9). También hay `#0E0E12`, `#141419`, `#F7F7FA`, `#FFA000`, `#FF8500`, `#FF5E00`, `#FF2D55` hardcodeados.
- `tailwind.config.js` no declara `brand`, `surface`, `ink` ni colores semánticos. Los únicos colores tokenizados son los shadcn (`primary`, `secondary`, etc.) y no se usan en `/home`.
- Resultado: cambiar la marca exige tocar ~29 sitios; el modo `dark` de `index.css` no se aplica en customer (no hay clase `dark`), y las páginas legales usan el verde viejo `#2E7D32` (p. ej. `src/pages/legal/TermsAndConditions.tsx:17`).
- **Fix:** definir `--brand`, `--brand-strong`, `--brand-ink`, `--surface`, `--surface-dark`, `--success`, `--danger`; mapearlos en Tailwind; prohibir hex en JSX.

### 6.2 Contraste (WCAG)

| Combinación | Ratio | Uso en `/home` | Resultado |
|---|---:|---|---|
| `#FFFFFF` sobre `#FFA000` | **2.04:1** | título del banner promocional | Falla AA/AAA |
| `#FFFFFF` sobre `#FF8500` | **2.44:1** | degradado del banner | Falla |
| `#FFFFFF` sobre `#FF6A00` | **2.87:1** | CTAs, badges, botones + | Falla AA y el mínimo de 3:1 para texto grande |
| `#FF6A00` sobre `#FFFFFF` | **2.87:1** | precios y “Ver todo” | Falla AA |
| `#FF6A00` sobre `#F7F7FA` | **2.69:1** | precios/links sobre fondo de página | Falla |
| `#A1A1AA` (zinc-400) sobre `#F7F7FA` | **2.40:1** | “Categorías”, subtextos, estado vacío | Falla |
| `#FFFFFF` sobre `#10B981` (emerald-500) | **2.54:1** | badge “Abierto” | Falla |
| `#FFFFFF` sobre `#EF4444` (red-500) | **3.76:1** | badge “Cerrado” | Falla AA |
| `#A1A1AA` sobre `#0E0E12` | 7.52:1 | header/nav inactivos | Pasa |

**Fix:** para texto sobre naranja usar negro (`#000` sobre `#FF6A00` = 7.31:1) o un naranja oscuro; para texto naranja sobre blanco usar `#C2410C` (5.18:1) / `#9A3412` (7.31:1); subir zinc-400 a zinc-600 en fondos claros; badges con texto oscuro o fondo más oscuro.

### 6.3 Radios, spacing y sombras

- `tailwind.config.js:52-58` redefine la escala: `sm=16px`, `md=18px`, `lg=20px`, `xl=24px`; los defaults de Tailwind dejan `2xl=16px`, `3xl=24px`. Por tanto `rounded-xl` y `rounded-3xl` miden lo mismo (24 px), y `rounded-sm` mide 16 px.
- En `/home` conviven `rounded-3xl` (cards), `rounded-2xl` (productos/pills), `rounded-xl` (botones +, que en la práctica son 24 px), `rounded-lg` (mini +, 20 px), `rounded-full` (badges). El botón de 28×28 con `rounded-xl` queda casi circular.
- Sombras: `shadow-[0_4px_16px_rgba(0,0,0,0.05)]`, `0 6px 20px 0.06`, `0 12px 36px 0.35`, `0 12px 30px 0.65`, `shadow-xs`... no hay escala. **Fix:** tokens de elevación (1–4).
- Spacing: `space-y-5`, `px-4`, `mb-3` consistente; el offset de header es el punto frágil (H-26).

### 6.4 Tipografía

- `body` usa Outfit (`index.css:88`) pero el CSP bloquea Google Fonts en la ruta Hono (H-29). `font-black` (900) se usa en toda la jerarquía, pero solo se solicitan pesos 300–700: el navegador sintetiza el 900.
- Textos de 7.5 px (“DELIVERY & MÁS”), 9 px (badges/carrito), 10–11 px (categorías, metadatos) son demasiado pequeños para móvil y agravan el contraste.
- `index.css:120-125` fuerza `font-size:16px !important` en inputs móviles, así que el buscador declarado `text-xs`/`text-sm` se renderiza a 16 px; visualmente queda más grande que el resto del header.

### 6.5 Jerarquía y contenido

- No hay `<h1>` ni `<main>`; los títulos de sección son `<h2>` de 16–18 px, todos con el mismo peso, así que la jerarquía depende del orden visual.
- “Restaurantes destacados” incluye panaderías, supermercados y farmacias (seed), y no muestra “Cerrado”.
- “Platillos populares” usa `product.getFeatured`, no `getTopOrdered`; el nombre sugiere popularidad por ventas.
- Hay cuatro bloques antes de “Todos los Comercios”; en 320×568 el catálogo principal queda muy abajo.
- “Ver todo” (populares) y “Ver más” (destacados) llevan al mismo `/search`, sin categoría ni query.

### 6.6 Iconografía, estados y scroll horizontal

- Star: `text-amber-400 fill-amber-400` en Home (`Home.tsx:295`) vs `#FFC107` en Search (`Search.tsx:284`). Mismo concepto, dos amarillos.
- `HomeCategories` ignora `cat.color`; los iconos desconocidos caen a `MoreHorizontal`, incluida la categoría “Otros” que el seed define como `MoreHorizontal` (no está en el registry → mismo fallback).
- Carruseles con `no-scrollbar` y sin `scroll-snap` ni indicador de “hay más”; en 320 px se corta la última pill/card sin gradiente de afordancia.
- z-index: header 40, nav 50, contenido normal; no hay conflicto en `/home`. El banner PWA muerto (`z-50 bottom-20`) sí chocaría si se montara.

---

## 7. Fluidez y performance

### 7.1 Presupuesto de requests en el primer load

Con N comercios (seed: 5), al abrir `/home`:

| Fase | Requests | Observación |
|---|---|---:|
| Bootstrap app | 1 `customer.checkAuth` | Directo en `useCustomerSession` (no cacheado por React Query) |
| Catálogo | `category.list`, `commerce.list`, `product.getFeatured`, `product.getTopOrdered` | 4 en paralelo |
| Segunda ola | `product.getByCommerce` × N | N por `CommerceCard`; 5 en seed |
| Tiempo real | 2 `EventSource` | `/api/events/products`, `/api/events/commerces` |
| Assets | HTML, CSS, JS, `/image.png` (1.83 MB), fuentes, imágenes remotas | Las covers/productos remotos se cargan aunque estén fuera del viewport |
| **Total tRPC** | **5 + N** (seed: 10) | 1 checkAuth + 4 de catálogo + N de productos; cada request tRPC ejecuta además `SELECT customers` en `createContext` |
| **Total red API/SSE** | **7 + N** + assets | Seed: 12 API/SSE + HTML/CSS/JS/imágenes |

Con 50 comercios: 55 tRPC + 2 SSE; con 200: 205 tRPC. No hay paginación ni límite.

### 7.2 Waterfalls y duplicación

- `commerce.list` → recién allí empiezan los N `product.getByCommerce` (segunda ola inevitable con el diseño actual).
- El `checkAuth` del provider no bloquea el render, pero cada request tRPC vuelve a resolver la cookie y a hacer `SELECT * FROM customers` (`server/context.ts:33-57,145-155`). Es un peaje por request que se multiplica por el N+1.
- Al tocar un comercio se carga el chunk lazy de `CommerceDetail` y se hacen **dos** consultas de productos: `useCommerce` ya devuelve `commerce + products` (`server/commerce-router.ts:21-29`) y `useProductsByCommerce` vuelve a pedirlos (`src/pages/customer/CommerceDetail.tsx:64-65`). Además, el `Suspense` global reemplaza toda la UI (`App.tsx:148-151`).
- `useProductEvents` invalida `["product.getByCommerce"]` para todos los comercios ante cualquier evento; con 50 cards, un solo cambio de producto dispara 50 refetches (`useOrderEvents.ts:182-186`). No hay debounce.
- `refetchOnReconnect: "always"` (`QueryProvider.tsx:14`) revalida todas las queries activas al recuperar red; en `/home` eso incluye todas las de productos.

### 7.3 Caché y staleTime

- `QueryProvider` usa `staleTime: 5 min`, `gcTime: 30 min`, `refetchOnWindowFocus: false`, `retry: 1` (`src/providers/QueryProvider.tsx:10-17`). Es una base razonable.
- El `TRPCProvider` exterior usa `staleTime: 30 s`, `retry` que solo maneja `UNAUTHORIZED` y `handleAuthError` hacia `/login` (`src/providers/trpc.tsx:24-47`). Como las páginas customer no usan hooks tRPC, esta configuración no aplica a `/home`, pero sí a otras pantallas: dos políticas de cache.
- No hay prefetch al tocar/tener intención de abrir un comercio. `onPointerDown` podría precargar `commerce.getById` y evitar el spinner full-screen.
- La invalidación global de productos es más agresiva que el `staleTime`: cualquier evento anula la ventaja de cachear 5 min.

### 7.4 Bundle, code-splitting y TTI

- `App.tsx:10-13` importa eager `Home`, `Search`, `Cart` y `Profile`. Solo la primera es necesaria para `/home`; las otras tres suman al entry chunk.
- `SessionGuard` importa estáticamente `@capacitor/push-notifications` (`src/components/SessionGuard.tsx:6`), aunque en web no se use; debería ser `import()` dentro de `Capacitor.isNativePlatform()`.
- `ReactQueryDevtools` se importa siempre (`QueryProvider.tsx:3,24`) y el CSS lo oculta solo en móvil (`index.css:274-280`).
- Artefacto local `dist/public/assets/index-Bs4fcFBf.js`: **542.590 bytes** sin comprimir; `index-S6C-rc42.css`: **164.112 bytes**. Es un artefacto de build que puede no corresponder al commit actual; re-medir después de un build limpio.
- El `Suspense` global muestra `LoadingFallback` a pantalla completa (fondo `#0A0A0D`, spinner naranja) al cargar un chunk lazy (`App.tsx:59-65,148-151`): navegar de `/home` a un comercio hace desaparecer header y nav.
- Animaciones: `backdrop-blur-2xl` en header y nav fijos, dos círculos `blur-2xl` en el banner, `animate-pulse`, `whileTap`, `PageTransition`. En Android de gama baja, el blur de dos capas fijas durante el scroll es el principal sospechoso de jank (**hipótesis**; medir con DevTools Performance en un dispositivo real).

### 7.5 Quick wins (≤1 día cada uno)

1. **Arreglar búsqueda**: renderizar `filteredProducts` o navegar a `/search`; validar con “Milanesa”, “Helado”, “Panadería”.
2. **Estados de error/retry**: devolver `isError`/`error`/`refetch` desde los hooks; componente de error; banner offline.
3. **Eliminar N+1**: incluir `featuredPreview` (máx. 3) en `commerce.list` con lateral join, o `IntersectionObserver` con `enabled` por card.
4. **Imagen del header**: 64/96 px WebP/AVIF, `width`/`height`, `fetchpriority="high"`.
5. **Índices DB**: `commerces(status)`, `products(commerce_id)`, parcial `products(is_featured,is_available)`, `order_items(product_id)`.
6. **Skeletons**: categorías y mini-cards; alturas reservadas para evitar CLS.
7. **Contraste y targets**: tokens accesibles y hitbox 44×44.
8. **Un solo QueryClient**: eliminar `TRPCProvider` o migrar todo; quitar invalidaciones muertas.
9. **Lazy routes**: `Search`, `Cart`, `Profile`; `Suspense` por ruta conservando shell.
10. **Prefetch**: `queryClient.prefetchQuery(["commerce.getById", id])` en `onPointerDown`/`onTouchStart`.
11. **Promo**: sin fallback fake, clamp de índice, pausa on hover/focus, `prefers-reduced-motion`.
12. **Cart context**: separar acciones (`addItem`) de estado (`items`) o memoizar el value para no re-renderizar todas las cards.
13. **Split de `SessionGuard`**: no cargar push en web.

### 7.6 Plan profundo (1–3 sprints)

- **Endpoint agregado `home.getFeed`**: una sola query que devuelva categorías, 5 comercios destacados con 3 productos y 6 top products, con proyección DTO y cache HTTP (`s-maxage=60, stale-while-revalidate=300`). Objetivo: de 5+N tRPC a 1–2.
- **Paginación/cursor** en `commerce.list` y virtualización con `@tanstack/react-virtual`; no renderizar 200 cards.
- **Búsqueda server-side** con `product.search`/`commerce.search`, paginación y normalización de acentos; dejar de filtrar en cliente sobre `featuredProducts`.
- **Pipeline de imágenes**: CDN/resize (Unsplash params o proxy), `srcset`, AVIF/WebP, `loading=lazy` bajo el fold; preload del LCP.
- **SSE autenticado y por alcance**: canal por usuario/comercio, payload con `commerceId`/`productId`, debounce de invalidaciones; o reemplazar por polling selectivo.
- **Design system real**: tokens de marca, radios, sombras, tipografía y estados; eliminar hex en JSX.
- **Observabilidad**: RUM (LCP/CLS/INP), logs estructurados, error boundary, alertas de 5xx/latencia.
- **Auth**: OTP, sesión verificada server-side, refresh rotation/revocation, DTOs.

### 7.7 Objetivos medibles propuestos

| Métrica | Baseline esperado (medir) | Objetivo |
|---|---|---|
| Requests tRPC iniciales | 5 + N (seed 10) | ≤ 3 con feed agregado |
| Peso `/image.png` | 1.831 KB | ≤ 10 KB (64–96 px WebP/AVIF) |
| LCP móvil 4G | Medir | ≤ 2.5 s |
| CLS | Medir | ≤ 0.1 |
| INP al agregar al carrito | Medir | ≤ 200 ms |
| JS inicial de `/home` | 542 KB raw (artefacto local) | ≤ 180 KB gzip |
| Imágenes fuera del viewport | Todas se descargan | 0 hasta scroll |
| Contraste texto | 2.04–2.87:1 en marca | ≥ 4.5:1 (≥ 3:1 texto grande) |
| Targets táctiles | 16–28 px | ≥ 44×44 px |
| Sesión inválida | `/home` visible | Redirect a login < 1 s |

---

## 8. Duplicados y deuda técnica

| Duplicado / deuda | Ubicaciones | Riesgo | Consolidación |
|---|---|---|---|
| Card de producto y comercio | `Home.tsx:212-346`; `Search.tsx:212-300` | Dos estilos y comportamientos; bugs se arreglan en uno solo | `ProductCard`/`CommerceCard` compartidos + `useCatalogFilters` |
| Filtro de catálogo | `Home.tsx:75-95`; `Search.tsx:62-74` | Home solo nombre de comercio; Search solo featured | Hook único + endpoint server-side |
| Formato de moneda | `Home.tsx:229,321`; `Cart.tsx:280,359-367`; `Profile.tsx:299`; `ProfileOrdersModal.tsx:294,307`; `OrderTrackingDetails.tsx:54-88` | `$${string}`, `toFixed`, “USD” inconsistente | `formatMoney(value, currency)` |
| Mapa de estados de pedido | `Profile.tsx:55-63`; `ProfileOrdersModal.tsx:64-100`; tracking | Faltan `accepted`, `driver_assigned`, `on_the_way`; labels distintos | `ORDER_STATUS_META` único derivado del enum |
| Bottom nav | `CustomerBottomNav.tsx:44-105` | 4 bloques copiados; `active` string libre; `CommerceDetail` usa `active=""` | Config array `TABS` + map; `aria-current` |
| Doble QueryClient | `main.tsx:13-21`; `App.tsx:147`; `providers/trpc.tsx:24-71`; `providers/QueryProvider.tsx:5-27` | Cache partido; invalidaciones muertas | Un solo provider |
| Invalidación SSE | `useOrderEvents.ts:182-186` (+ `utils` muerto) | Refetch global y duplicado | Invalidación por clave/ID y debounce |
| Refresh de sesión | `App.tsx:67-79`; `useCustomerSession.tsx:113-120`; `server/context.ts:44-50` | 2 intervalos + refresh implícito; carreras | Un refresh coordinado |
| `getById` con productos | `server/commerce-router.ts:21-29`; `useProductsByCommerce` en `CommerceDetail.tsx:64-65` | Productos descargados dos veces | Un endpoint/selector |
| Lógica de conteo kg | `useCart.tsx:86-87`; `CommerceCartBar.tsx:37-42`; `CustomerBottomNav.tsx:81-88` | Badge fraccionario vs barra que cuenta 1 | Selector único `selectCartCounts` |
| `PWAInstallBanner` + `usePWAInstall` | `src/components/PWAInstallBanner.tsx`; `src/hooks/usePWAInstall.ts` | Código muerto; nunca se ofrece instalar | Montar o eliminar |
| `loading` sin usar | `HomePromoBanner.tsx:73` | No hay skeleton ni distinción de error | Usar `isLoading`/`isError` |
| `filteredProducts` sin render | `Home.tsx:88-95,141-170` | Cálculo muerto en modo búsqueda | Renderizar o eliminar |
| `Category.color` | `HomeCategories.tsx:35-40`; `db/schema.ts:101-108` | Dato ignorado | Usar color o quitar del contrato |
| Tipos `any` | `Home.tsx:212,252`; `useDeliveryData.ts:87,156,172` | Deriva de contrato | `inferRouterOutputs`/DTOs |
| Comentarios obsoletos | `Home.tsx:7-9,13-14` | Documentación falsa | Actualizar docblocks |
| `trpc` solo para `useUtils` | `Home.tsx:48,66-68` | Dependencia y cache extra | Usar `useQueryClient` o unificar en tRPC |
| `login.refresh` | `App.tsx:67-79` | Doble refresh, resultado ignorado | Eliminar y confiar en `createContext`/401 |

---

## 9. Accesibilidad (resumen)

| Elemento | Problema | WCAG | Fix |
|---|---|---|---|
| Viewport | `user-scalable=no, maximum-scale=1.0` (`index.html:5`) | 1.4.4 | Permitir zoom |
| Contraste | Blanco/naranja 2.04–2.87:1; zinc-400 2.40:1 | 1.4.3 | Tokens accesibles (H-19) |
| Tarjetas/banner | `div onClick` sin rol, foco ni teclado (`Home.tsx:218-222,260-264,277`; `HomeFeaturedCommerces.tsx:84-87`) | 2.1.1, 2.4.7 | `<button>`/`<Link>` + `focus-visible` |
| Buscador | Sin label/`aria-label`; “×” sin nombre (`HomeHeader.tsx:123-138`) | 1.3.1, 3.3.2, 4.1.2 | `<label class="sr-only">`, `aria-label` |
| Nav inferior | Sin `aria-label`/`aria-current` (`CustomerBottomNav.tsx:40-105`) | 1.3.1, 2.4.8 | `aria-current="page"` |
| Carousel | Auto-avance sin pausa; dots 6 px (`HomePromoBanner.tsx:79-85,191-204`) | 2.2.2, 2.5.8 | Pausa + hitbox 44 px |
| Movimiento | Sin `prefers-reduced-motion` (`PageTransition.tsx:19-52`; `index.css`) | 2.3.3 | `MotionConfig`/media query |
| Jerarquía | Sin `<h1>`/`<main>` (`Home.tsx:108-204`) | 1.3.1, 2.4.1 | Landmarks y h1 |
| Imágenes | Covers como background sin alt; logos con alt | 1.1.1 | `<img>` con alt o `role="presentation"` si decorativas |
| Targets | 16–32 px (H-20) | 2.5.8 | ≥ 44×44 |
| Resultados | Sin `aria-live` al filtrar (`Home.tsx:190-195`) | 4.1.3 | `aria-live="polite"` con conteo |
| Teclado | Sin foco visible en cards; botones nativos conservan outline | 2.4.7 | `ring-2 ring-[#FF6A00] focus-visible` |

---

## 10. Seguridad y privacidad relevante a `/home`

1. **Entrada y sesión**
   - `customer.login` por teléfono y `register` que autentica cuentas existentes: P0 H-02.
   - `SessionGuard` solo cliente y `useCustomerSession` que no invalida: P1 H-04.
   - `customer_session` guarda nombre, teléfono y dirección en `localStorage`; `checkAuth` agrega `fcmToken` (H-01/H-30).
   - Refresh token de 10 años sin revocación (`server/customer-auth.ts:9-10,79-85`).
2. **Datos del catálogo**
   - `commerce.list` expone comisión, `merchantUserId`, email, teléfono y lat/lng (H-08).
   - `customer.list`/`getById` exponen toda la base (H-01).
3. **Integridad del catálogo**
   - IDOR de productos (H-03).
   - Productos de comercios cerrados/suspendidos promocionados (H-14).
4. **Pedidos**
   - Fees/comisión controlados por el cliente (H-10).
   - `commerceId` no derivado del producto (H-11).
   - Validación de comercio abierto solo en cliente (H-33).
5. **SSE**
   - `/api/events/products` y `/api/events/commerces` públicos, sin auth; `/home` abre ambos (H-32). Hoy solo exponen tipos de evento, pero confirman actividad y habilitan enumeración/DoS.
6. **CSP y tokens**
   - `script-src 'unsafe-inline'`, `img-src https:` y `connect-src` amplio (`server/boot.ts:28`).
   - `handleAuthError` en `useDeliveryData` borra `qs_session`/merchant/driver pero **no** `customer_session` (`src/hooks/useDeliveryData.ts:13-31`), dejando PII.
   - `customer.checkAuth` devuelve `fcmToken` al navegador.
7. **Rate limiting**
   - No se observa rate limiting en `server/boot.ts` para `customer.list`, `customer.login`, `product.getTopOrdered` ni SSE. Endpoints públicos costosos y enumerables.

**Prioridad de remediación:** H-01 → H-02 → H-03 → H-04 → H-08 → H-10/H-11/H-33.

---

## 11. Plan de verificación

> Ejecutar en local/staging; no hacer pruebas destructivas en producción. Registrar baseline antes de corregir.

### 11.1 Preparación

1. `git rev-parse HEAD` y confirmar commit.
2. `npm run check` y `npm run lint` para verificar que el baseline compila.
3. Chrome DevTools → dispositivo 390×844, red **Slow 4G**, CPU 4×; deshabilitar cache; limpiar `localStorage`/cookies entre escenarios.
4. Lighthouse mobile (`/home`) y guardar JSON; medir LCP, CLS, INP, peso JS/CSS, requests.

### 11.2 Casos funcionales

1. **Búsqueda de producto**: escribir “Milanesa” y “Helado” en `/home`. Resultado actual esperado: “No encontramos resultados” si no coincide el nombre del comercio. Resultado correcto: producto(s) o navegación a `/search`.
2. **Búsqueda de comercio**: “Panadería” debe encontrar “Panadería El Horno”. Probar “panaderia” (sin tilde) para documentar H-42.
3. **Categoría**: seleccionar/deseleccionar; verificar que “Ver todas” limpia; escribir en el buscador con categoría activa; verificar título y parámetros de `/search`.
4. **Volver**: filtrar, entrar a un comercio, volver; verificar que el filtro se perdió (H-18) y la posición de scroll (H-40).
5. **Agregar al carrito**: producto normal y producto `unitType="kg"`; verificar badge (entero vs decimal), precio y `unitType` en `/cart`.

### 11.3 Sesión y autorización

1. Login válido; recargar `/home`; verificar que `customer.checkAuth` se llama y que la identidad coincide con la DB.
2. **Logout**: Profile → Cerrar sesión → volver con Back a `/home`. Resultado actual esperado: home como “Invitado” (bug). Debe redirigir a `/customer-login`.
3. **Sesión huérfana**: en DevTools borrar `customer_session`, mantener `qs_session`, recargar `/home`. Debe mostrar spinner 600 ms y luego home invitado (bug).
4. **Cookie expirada**: borrar `quickgo_token` y `refresh_token` (o esperar expiración), recargar `/home`. Debe redirigir; actualmente no.
5. **IDs**: con sesión de merchant A, intentar `product.update` sobre un producto del merchant B (staging). Debe devolver `FORBIDDEN`; actualmente probablemente 200.
6. **PII**: `GET /api/trpc/customer.list` sin cookies; verificar respuesta. No ejecutar contra producción.

### 11.4 Errores, offline y datos parciales

1. DevTools → Network → block request URL `*commerce.list*`; recargar `/home`. Verificar si aparece estado vacío o error; debe haber retry.
2. Bloquear `*product.getByCommerce*`; verificar que las cards quedan sin mini-cards y no hay mensaje.
3. Offline: DevTools offline + reload de la PWA instalada. Verificar error de navegación (SW ignora HTML).
4. Crear en staging un comercio `status='active'`, `isOpen='closed'`; verificar que aparece en destacados sin badge y que se puede agregar (H-14).
5. Crear un producto `isAvailable='no'`, `isFeatured='yes'`; verificar que aparece en populares/mini-cards y que se puede agregar.
6. Vaciar DB de comercios (staging) o interceptar respuesta `[]`; verificar el copy “No encontramos resultados” y el banner fake.

### 11.5 Accesibilidad

1. Axe DevTools: registrar violaciones; objetivos: 0 críticas, contraste y nombres accesibles.
2. Navegar `/home` solo con Tab/Enter/Espacio: verificar que las cards y el banner no se pueden abrir (H-21); después del fix, que sí.
3. Zoom 200% en desktop y pinch en móvil: verificar que el viewport bloquea el pinch (H-34).
4. Emular `prefers-reduced-motion: reduce`: el banner no debe rotar y las transiciones deben reducirse.
5. Medir targets con DevTools “Show rulers”/CSS: add 28/24 px, clear 16 px, dots 6 px.

### 11.6 Responsive y safe area

1. Capturas en 320×568, 375×667, 390×844, 430×932; sin scroll horizontal; header/contenido sin solape.
2. Emular iPhone 14/15 (notch) y Android con status bar; medir distancia entre el borde inferior del header y el inicio de “Categorías”; comparar con los 20/36 px calculados.
3. Verificar el CTA del banner a 320 px: ¿se recorta “Pedir ahora”/precio? (**hipótesis** H-26).
4. Verificar que la nav no tapa la última card al llegar al final (`pb-32`).

### 11.7 Performance

1. Network: contar requests tRPC; con 5 comercios debe haber 10 tRPC (1 checkAuth + 4 de catálogo + 5 de productos) + 2 SSE; documentar y comparar tras el feed agregado.
2. React Profiler: grabar un keystroke en el buscador y un `addItem`; contar renders de `CommerceCard`/`ProductCard` (H-24/H-27 y context no memoizado).
3. Editar un producto en staging y medir cuántos `product.getByCommerce` se refetchean (H-32).
4. `EXPLAIN ANALYZE` de `commerce.list`, `product.getFeatured`, `product.getTopOrdered`, `product.getByCommerce` antes/después de índices.
5. Medir el peso real de `/image.png` y de las covers; simular 3G y observar LCP.

### 11.8 Criterios de aceptación de la remediación

- `/home` no muestra datos de una sesión inválida; logout y expiración redirigen.
- Buscar un producto existente devuelve el producto o navega a una búsqueda que lo encuentra.
- Fallo de API muestra error + retry; offline muestra banner; no se muestran datos fake.
- Requests tRPC iniciales ≤ 3 (feed agregado + sesión); N+1 eliminado.
- LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms en móvil 4G.
- 0 violaciones críticas de axe; targets ≥ 44 px; zoom permitido; teclado operativo.
- `customer.list` eliminado; `getById`/`checkAuth` con DTO; mutaciones de producto con ownership; login con OTP/password.

---

## Anexo A — Contratos API consumidos por `/home`

| Procedimiento | Tipo | Input | Output esperado | Consumo FE | Problemas |
|---|---|---|---|---|---|
| `customer.checkAuth` | query pública | `{}` (superjson) | `{ customer: Customer \| null }`; hoy fila completa | `useCustomerSession.tsx:59-74` (fetch directo), hidrata header | Devuelve `fcmToken`/PII; no limpia sesión si `null`; no está en React Query; carrera con logout |
| `customer.login` | mutation pública | `{ phone: string }` | `{ success, customer }` | `CustomerLogin.tsx:52-56` | Sin OTP/password; account takeover (H-02) |
| `customer.register` | mutation pública | `{ firstName, lastName, phone, address }` | `{ success, customer }` | `Register.tsx:78-82` | Si el teléfono existe, autentica esa cuenta (H-02) |
| `category.list` | query pública | ninguno | `[{ id, name, icon, color, sortOrder, createdAt }]` | `useCategories` → `HomeCategories` | Sin límite; `color` no se usa; error no expuesto |
| `commerce.list` | query pública | ninguno | Filas completas de `commerces` | `useCommerces` → `Home`, `CommerceCard` | Sin `orderBy`/`limit`; expone `commissionRate`, `merchantUserId`, email/teléfono; incluye cerrados |
| `product.getFeatured` | query pública | ninguno | `[{ id, commerceId, name, description, price, image, category, isFeatured, isAvailable, preparationTime, unitType, commerceName }]` | `useFeaturedProducts` → “Platillos populares” | Sin filtro de comercio activo/abierto; sin orden/límite; no es “popular” |
| `product.getTopOrdered` | query pública | ninguno | Hasta 6 productos, mismos campos + `commerceName` | `useTopOrderedProducts` → banner | Agrega toda `order_items` (incluye cancelados/pendientes); carga todos los productos; sin cache HTTP/servidor; fallback fake |
| `product.getByCommerce` | query pública | `{ commerceId: number }` | Filas completas de `products` | `useProductsByCommerce` por card | N+1; no filtra `isAvailable`; no valida comercio activo/abierto; orden arbitrario |
| `GET /api/events/products` | SSE | — | `{ type: "products_update", action, productId? }` | `useProductEvents` invalida `featured` y todos los `getByCommerce` (raw); `list` vía utils muerto | Público; invalida todos los comercios; sin debounce |
| `GET /api/events/commerces` | SSE | — | `{ type: ... }` | `useCommercesEvents` invalida `commerce.list` | Público; sin auth/rate limit |
| `order.create` (indirecto) | mutation `customerQuery` | `{ customerId, items:[{productId, commerceId, quantity}], deliveryAddress, customerPhone, paymentMethod, paymentReceipt?, notes?, deliveryFee, commission }` | `{ success, order }` | `Cart.tsx:135-148` desde el flujo add-to-cart | Fees/comisión del cliente; `commerceId` no derivado del producto; no valida comercio abierto (H-10/H-11/H-33) |
| `login.refresh` | mutation pública | `{}` | `{ success, role }` | `App.tsx:67-79` cada 9 min | Duplicado con `customer.refresh`; resultado ignorado |
| `customer.refresh` | mutation pública | `{}` | `{ success, customer }` | `useCustomerSession.tsx:95-111` cada 10 min | Sin revocación; tres mecanismos de refresh |

### A.1 Formato de superjson

`useDeliveryData` serializa **todo** con superjson y usa GET con `?input=<json>`:

```ts
// src/hooks/useDeliveryData.ts:33-39
const serialized = input ? superjson.serialize(input) : superjson.serialize({});
const url = `${API_URL}/${path}?input=${encodeURIComponent(JSON.stringify(serialized))}`;
```

Esto es correcto para `httpLink` con transformer, pero implica URLs largas y que el input quede en logs de acceso. No es un problema para IDs públicos; sí para futuros filtros con datos personales.

---

## Anexo B — Consultas DB y datos

### B.1 Consultas exactas

| Procedimiento | SQL efectivo (Drizzle) | Filtros / orden / límite | Tablas |
|---|---|---|---|
| `category.list` | `SELECT * FROM categories ORDER BY sort_order ASC` | solo orden | `categories` |
| `commerce.list` | `SELECT * FROM commerces WHERE status = 'active'` | sin orden ni límite | `commerces` |
| `product.getFeatured` | `SELECT p.id, p.commerce_id, p.name, p.description, p.price, p.image, p.category, p.is_featured, p.is_available, p.preparation_time, p.unit_type, c.name AS commerce_name FROM products p LEFT JOIN commerces c ON c.id = p.commerce_id WHERE p.is_featured = 'yes' AND p.is_available = 'yes'` | sin orden/límite | `products`, `commerces` |
| `product.getTopOrdered` | `SELECT product_id, count(id)::int AS order_count, sum(quantity)::float AS total_qty FROM order_items GROUP BY product_id ORDER BY sum(quantity) DESC LIMIT 8` y luego `SELECT ... FROM products p LEFT JOIN commerces c ... WHERE p.is_available = 'yes'`; sort en JS y `slice(0,6)` | agregado global; sin join a `orders`; sin estado | `order_items`, `products`, `commerces` |
| `product.getByCommerce` | `SELECT * FROM products WHERE commerce_id = $1` | sin `is_available`, sin orden/límite | `products` |
| `customer.checkAuth` | `SELECT * FROM customers WHERE id = $1` (vía `createContext`) | por `id` de cookie | `customers` |
| `order.create` (indirecto) | `SELECT * FROM products WHERE id = $1` por ítem; `INSERT orders`; `INSERT order_items` × N; `INSERT order_status_history`; `INSERT order_commerce_status` × comercios | transacción; `commerceId` del cliente | `orders`, `order_items`, `order_status_history`, `order_commerce_status`, `products` |
| SSE | No DB; `subscribe(channel)` en memoria | ping cada 15 s | — |

### B.2 Índices ausentes (verificado: no hay `CREATE INDEX` en `db/migrations/*.sql`)

Recomendados:

```sql
-- catálogo
CREATE INDEX IF NOT EXISTS idx_commerces_status
  ON commerces (status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_commerce
  ON products (commerce_id, is_available, is_featured);

CREATE INDEX IF NOT EXISTS idx_products_featured
  ON products (is_featured) WHERE is_featured = 'yes' AND is_available = 'yes';

-- ranking
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON order_items (product_id);

-- opcional para perfil/checkout
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON orders (customer_id, created_at DESC);
```

Antes/después, ejecutar en staging:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM commerces WHERE status = 'active';

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM products WHERE commerce_id = 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT product_id, sum(quantity)::float
FROM order_items
GROUP BY product_id
ORDER BY sum(quantity) DESC
LIMIT 8;
```

### B.3 Observaciones de modelo

- `products` no tiene `sortOrder`; el orden de las mini-cards es el que devuelva Postgres. Si se muestran “las 3 destacadas”, el orden es arbitrario.
- `order_items.quantity` es `numeric` y se envía como string (`db/schema.ts:190`); el FE suma con `parseFloat` en varios sitios. Los kg usan cantidades fraccionarias; el carrito no distingue unidad en el badge.
- `commerces.rating`/`minOrder` son `numeric` strings; `HomeFeaturedCommerces` los declara `string` pero `Home` usa `any`.
- `customers.fcmToken` no tiene `select:false` ni endpoint separado; las consultas `select()` lo incluyen siempre.
- `order_items` no guarda `unitType`; si un producto cambia de unidad, el histórico queda ambiguo.

---

## Anexo C — Evidencia de assets y métricas

- `public/image.png`: **1600×1600 px, 1.831 KB** (medido con `System.Drawing`). Render: `w-8 h-8` (32×32 CSS) en `HomeHeader.tsx:110-114`.
- `public/icon-512.png`: 512×512, 265 KB (no se usa en `/home`; manifiesto PWA).
- `public/welcome-hero.jpg`: 571×510, 40 KB.
- Colores de marca: **29 usos de `#FF6A00`** en los 6 archivos de `/home`; no existe token de marca en `tailwind.config.js`; `index.css:27` define `--primary` verde.
- Contraste calculado con la fórmula WCAG 2.x (sRGB): blanco/#FFA000 2.04:1; blanco/#FF8500 2.44:1; blanco/#FF6A00 2.87:1; #FF6A00/#FFFFFF 2.87:1; #FF6A00/#F7F7FA 2.69:1; zinc-400/#F7F7FA 2.40:1; blanco/emerald-500 2.54:1; blanco/red-500 3.76:1.
- Artefacto local de build (puede estar desactualizado): `dist/public/assets/index-Bs4fcFBf.js` 542.590 B; `index-S6C-rc42.css` 164.112 B. Re-medir con build limpio.
- No hay `CREATE INDEX` en las migraciones (`db/migrations/0000..0006`).
- No hay `ErrorBoundary`/`componentDidCatch` en `src` (búsqueda global sin coincidencias).
- `public/sw.js`: no intercepta `mode === "navigate"` ni HTML (`sw.js:16-40`); la PWA no tiene shell offline.

---

## Anexo D — Tabla de reproducción rápida de los bugs principales

| Bug | Reproducción | Resultado actual | Resultado esperado |
|---|---|---|---|
| Búsqueda de producto | `/home` → escribir “Milanesa” | “No encontramos resultados” (si no coincide el comercio) | Producto visible o `/search` con resultados |
| Sesión tras logout | Login → Profile → Logout → Back a `/home` | Home como “Invitado” | Redirect a `/customer-login` |
| Sesión huérfana | Borrar `customer_session`, mantener `qs_session`, reload `/home` | Spinner 600 ms → Home invitado | Redirect |
| PII anónima | `GET /api/trpc/customer.list` sin cookies | Lista de clientes | 401/404 o eliminado |
| IDOR producto | Merchant A actualiza producto de B | Cambio aplicado | 403 |
| N+1 | Abrir `/home` con 5 comercios y mirar Network | 10 tRPC + 2 SSE | 1–3 tRPC con feed |
| Banner fake | Throttle a Slow 3G y abrir `/home` | Productos hardcodeados primero | Skeleton |
| CLS | Abrir `/home` y observar categorías/mini-cards | Saltos de layout | Alturas reservadas |
| Contraste | Inspeccionar precio `#FF6A00` sobre blanco | 2.87:1 | ≥ 4.5:1 |
| Zoom | Pinch en móvil | Bloqueado | Permitido |
| Offline PWA | Instalar, offline, reload `/home` | Error de navegación | Shell cacheado |

---

**Fin del reporte.**