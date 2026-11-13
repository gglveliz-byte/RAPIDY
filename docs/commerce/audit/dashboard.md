# Auditoría `/commerce` — Negocio

**Fecha:** 2026-11-13  
**Ruta auditada:** `/commerce` (Dashboard principal del negocio) y layout compartido `CommerceLayout`  
**Modo:** auditoría estática, solo lectura. No se modificó código, no se ejecutaron migraciones, no se reinició el servidor y no se tocó `localhost:3000`.  
**Base:** `master` en `bf81ab6`.

## 1. Alcance y archivos

Se auditó la pantalla `/commerce`, su layout y todos los contratos que consume, incluyendo los estados de carga, error, vacío, apertura/cierre del local, métricas, pedidos recientes, productos populares, badge de pedidos y navegación desktop/móvil.

| Archivo | Rol en la auditoría |
|---|---|
| `src/pages/commerce/Dashboard.tsx` | Pantalla principal del negocio |
| `src/components/CommerceLayout.tsx` | Sidebar, header móvil, bottom nav, badge y logout |
| `src/hooks/useDeliveryData.ts` | Hooks de comercio, productos, pedidos, métricas y toggle |
| `server/commerce-router.ts` | `commerce.me`, `getById`, `toggleStatus`, `getStats`, `markReady` |
| `server/order-router.ts` | `order.create`, `getCommerceOrders`, `updateStatus`, `quote` |
| `server/product-router.ts` | `product.getByCommerce`, catálogo público y ownership |
| `server/boot.ts` | Autenticación de canales SSE |
| `server/events.ts` | Emisión de eventos y push |
| `contracts/orderStatus.ts` | Contrato único de 11 estados |
| `db/schema.ts` | `commerces`, `orders`, `order_items`, `order_commerce_status`, `customers` |
| `src/pages/commerce/Orders.tsx` | Referencia de consumo de `myCommerceStatus` y SSE |
| `src/pages/commerce/Stats.tsx` | Referencia de consumo de `getStats` |
| `src/pages/commerce/Profile.tsx` | Renombre del comercio y logout |
| `src/components/SessionGuard.tsx` | Guard de rol merchant y recuperación de sesión |
| `src/App.tsx` | Orden de rutas `/commerce/:id` vs `/commerce/*` |
| `docs/commerce/ROUTES_MAP.md` | Mapa del negocio y hallazgos F-xx previos |

**Límites de esta auditoría:** se leyó el código y se contrastaron firmas, queries y eventos. No se consultó la base de datos real, no se abrió un navegador y no se ejecutaron flujos E2E. Por eso los hallazgos de volumen, duplicidad de nombres y comportamiento visual son estáticos; se indican como tales en la sección 6.

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/commerce
  └─ SessionGuard role="merchant"
       ├─ getSession() lee qs_session de localStorage (obligatorio para no-customer)
       ├─ login.checkAuth verifica cookie HttpOnly
       └─ <CommerceDashboard>
            ├─ useMerchantCommerceId()
            │    ├─ lee merchant_user.commerceId de localStorage (caché)
            │    ├─ commerce.me          → merchantQuery, busca por merchantUserId
            │    └─ commerce.search(name) → publicQuery, solo activos, fallback
            ├─ useCommerce(id)            → commerce.getById (público, incluye products)
            ├─ useProductsByCommerce(id)  → product.getByCommerce (público owner-aware)
            ├─ useCommerceStats(id)       → commerce.getStats (merchant, ownership)
            ├─ useCommerceOrders(id)      → order.getCommerceOrders (merchant, ownership)
            └─ useToggleCommerceStatus(id) → commerce.toggleStatus (merchant, ownership)

CommerceLayout
  ├─ useMerchantCommerceId() + useCommerceOrders()  (misma queryKey que Dashboard)
  ├─ badge = orders.filter(status received o preparing)
  └─ logout → login.logout → limpia localStorage → /login
```

### 2.1 Consultas, claves y refresco

| Dato | Hook | Procedimiento | Query key | Refresco |
|---|---|---|---|---|
| Comercio propio | `useMerchantCommerceId` | `commerce.me` | `["commerce.me"]` | Una vez, solo si falta `commerceId` local |
| Búsqueda fallback | `useMerchantCommerceId` | `commerce.search` | `["commerce.search", name]` | Una vez, en paralelo con `me` |
| Comercio visible | `useCommerce` | `commerce.getById` | `["commerce.getById", id]` | Al invalidar; incluye `products` |
| Productos | `useProductsByCommerce` | `product.getByCommerce` | `["product.getByCommerce", id]` | Al invalidar |
| Métricas | `useCommerceStats` | `commerce.getStats` | `["commerce.getStats", id]` | Sin intervalo; foco de ventana |
| Pedidos | `useCommerceOrders` | `order.getCommerceOrders` | `["order.getCommerceOrders", id]` | Polling 30 s |
| Abrir/cerrar | `useToggleCommerceStatus` | `commerce.toggleStatus` | mutación | Invalida `getById` y `getStats` |

Tablas tocadas: `users`, `commerces`, `products`, `orders`, `order_items`, `order_commerce_status`, `customers`.

### 2.2 Ruta de abrir/cerrar y efecto en el cliente

```text
Dashboard.handleToggleStore
  └─ commerce.toggleStatus({ id })
       ├─ verifica merchantUserId === ctx.merchant.id
       ├─ invierte commerces.isOpen (open ↔ closed)
       ├─ emite SOLO "admin:dashboard"
       └─ NO emite "commerces:global" ni "commerce:{id}"

Cliente
  ├─ product.list / getById filtran status="active" AND isOpen="open"
  ├─ order.quote rechaza status != "active" o isOpen != "open"
  └─ Cart bloquea ítems de comercios cerrados
```

No hay SSE en `/commerce` ni en el layout. `useCommerceEvents` solo se monta en `/commerce/orders` y en el detalle público del cliente. El Dashboard depende del polling de 30 s de `useCommerceOrders`; `getStats` no tiene polling.

## 3. Hallazgos

Severidad: **P0** = autorización o integridad crítica; **P1** = bug funcional o de datos con impacto operativo; **P2** = UX, consistencia, accesibilidad o rendimiento.  
Todos los hallazgos citan el árbol de trabajo actual (`bf81ab6`). No se corrigió ninguno.

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| DASH-01 | P1 | Identidad y marca | `src/pages/commerce/Dashboard.tsx:67,76-82`; `src/components/CommerceLayout.tsx:46,56-66`; `src/pages/commerce/Profile.tsx:151-165`; `server/login-router.ts:57`; `src/pages/Login.tsx:71-73` | El nombre visible del local se toma de `merchant_user.name` en localStorage, no de `commerces.name`. `login` devuelve `users.name` y el Perfil puede renombrar el comercio sin actualizar `merchant_user`. El banner y el sidebar quedan con el nombre viejo hasta volver a iniciar sesión. Además el fallback inicial es “Mi comercio” en Dashboard y “Mi Comercio” en Layout. | Identidad equivocada del negocio; capturas, soporte y operación confusos; el renombre del Perfil no se refleja en la pantalla principal. | Usar `commerce.name` de `useCommerce`/`commerce.me` como fuente de verdad; actualizar o eliminar `merchant_user.name`; unificar el copy de fallback. |
| DASH-02 | P1 | Comercio nulo o sin asignar | `src/pages/commerce/Dashboard.tsx:68-73,85,96,125-194`; `src/hooks/useDeliveryData.ts:121-169` | Si `commerceId` es `null` (merchant sin `merchantUserId`, comercio no creado, localStorage perdido o respuesta vacía de `commerce.me`), todas las queries quedan deshabilitadas. `commerce` es `null`, `isOpen` es `false` y se pinta “Local en Pausa • Fuera de Línea” con métricas en cero. `handleToggleStore` retorna en silencio si no hay `commerceId`. No existe estado “sin comercio asignado” ni se usa `loading`. | Un merchant nuevo o legacy ve un local cerrado que no existe, no recibe explicación y el botón “Abrir Local Ahora” no hace nada. | Consumir `loading` del hook; mostrar estado bloqueante “Comercio sin asignar, contacta a soporte”; deshabilitar acciones y no renderizar el banner de cerrado hasta tener datos. |
| DASH-03 | P1 | Resolución de comercio y sesión | `src/hooks/useDeliveryData.ts:121-164`; `server/commerce-router.ts:38-42,74-84`; `server/login-router.ts:60-64`; `src/components/SessionGuard.tsx:31-37,76-80`; `db/schema.ts:138` | La identidad del comercio depende de localStorage. `JSON.parse` no tiene `try/catch` (`:122-123`). El fallback por nombre se habilita mientras `commerce.me` aún carga (`:141`), así que puede resolver primero y escribir `results[0]` (`:155-162`). `commerce.search` no ordena resultados, solo devuelve activos y puede devolver varias coincidencias; el `id` equivocado se persiste y luego `commerce.me` ya no se consulta (`:145`). `commerce.me` y el login también toman `rows[0]` sin orden si un merchant tuviera más de un comercio. SessionGuard exige `qs_session` aunque la cookie sea válida. | La UI puede quedar ligada a un comercio ajeno con nombre parecido, a uno inactivo o a ninguno; `getStats`/`getCommerceOrders` responden 403 y la pantalla muestra vacíos; el error se persiste entre recargas. Si se borra localStorage con cookie válida, el merchant vuelve a `/login`. | Usar `commerce.me` como fuente única y eliminar el fallback por nombre; envolver el parseo en `try/catch`; revalidar el id cacheado contra el servidor; ordenar resultados y asumir explícitamente el caso multi-comercio; permitir que SessionGuard recupere la sesión merchant desde la cookie. |
| DASH-04 | P1 | Abrir/cerrar y estado real | `src/pages/commerce/Dashboard.tsx:96,130-147,166-178`; `db/schema.ts:132-133`; `server/order-router.ts:124-131`; `server/product-router.ts:36-41`; `server/commerce-router.ts:44-60` | El banner solo evalúa `commerce.isOpen`. No lee `commerce.status`. Un comercio `pending`, `inactive` o `suspended` con `isOpen='open'` (valor por defecto del esquema y caso de `createMerchant`) muestra “Local Abierto • Recibiendo Pedidos” y “Tu comercio está activo en Rapidy”, aunque `commerce.list`/`product.list` lo excluyan y `order.quote` rechace el checkout. | El negocio cree que está vendiendo y no recibe pedidos; contradice el catálogo y el checkout del cliente. Es el estado inicial típico de un comercio recién creado. | Derivar el banner de `status + isOpen`; mostrar “Pendiente de activación” o “Suspendido” y deshabilitar el toggle cuando no esté activo; no prometer recepción de pedidos. |
| DASH-05 | P1 | Métricas y copy | `src/pages/commerce/Dashboard.tsx:97,202,210-215,223,229-232,240,247-251,259-267`; `server/commerce-router.ts:167-189,202-204` | `getStats` solo agrega pedidos `delivered`. “Ventas Registradas”, “Pedidos Totales”, “Ticket prom” y “Comisión Aplicada” se leen como totales históricos. `totalOrders` es entregados, pero el fallback `orders.length` cuenta todos los no-`pending_payment`; durante carga o error el número salta. Una tienda con 0 entregados y 5 activos muestra “0 Pedidos Totales” y “5 en preparación”. `featuredCount` incluye productos pausados. | Decisiones de negocio y conversaciones de liquidación con cifras engañosas; contradicción interna entre “0 totales” y “5 en preparación”. | Renombrar a “Ventas entregadas”, “Pedidos entregados”, “Ticket entregado”; agregar contadores separados de activos y totales; no mezclar fallback con la métrica de entregados; contar destacados solo si están disponibles. |
| DASH-06 | P1 | Productos populares | `src/pages/commerce/Dashboard.tsx:103-123,419-453`; `server/commerce-router.ts:197-200` | `getStats.topProducts` devuelve `{ name, sales, revenue }`, sin `id`. El front espera `tp.id`, `tp.salesCount` y usa `tp.revenue` como `price`. `products.find(p => p.id === tp.id)` siempre es `undefined`; `key={prod.id}` queda `undefined`; la tarjeta muestra el revenue acumulado como precio unitario y nunca muestra “X vendidos”. Si stats falla o está vacío, muestra los primeros 4 productos del catálogo como “Más Populares”. | Precio falso (por ejemplo, un producto de $5 con $150 acumulados se muestra como $150.00), ranking sin identidad, keys duplicadas de React y decisiones de menú equivocadas. | Devolver `productId`, `sales`, `revenue`, `unitPrice`, `image` y `category`; mapear por `productId`; separar “precio” de “revenue”; si no hay datos de ventas, titular la sección “Catálogo” y no “Más Populares”. |
| DASH-07 | P1 | Pedidos recientes | `src/pages/commerce/Dashboard.tsx:100,310,333-365`; `server/order-router.ts:731-735` | `getCommerceOrders` no aplica `orderBy` a `orders`; solo ordena `order_items` por id. Devuelve todos los pedidos y `slice(0, 4)` toma el orden no determinista que entregue PostgreSQL; puede devolver los más antiguos. El título dice “Últimas órdenes registradas”. | El dashboard puede ocultar los pedidos nuevos justo cuando importan; el negocio reacciona tarde y no ve su cola real. | `orderBy(desc(orders.createdAt))` con límite, o una query específica `getRecentCommerceOrders(limit)`; mantener orden estable por id/fecha. |
| DASH-08 | P1 | Estados y conteos | `src/pages/commerce/Dashboard.tsx:45-56,99,344-345`; `src/components/CommerceLayout.tsx:51-54,140-146,238-240`; `contracts/orderStatus.ts:7-19`; `server/order-router.ts:756-764`; `db/schema.ts:34-38`; `src/pages/commerce/Orders.tsx:80,103`; `src/components/commerce/CommerceOrderCard.tsx:34-42` | Hay mapas de estado duplicados e incompletos. Dashboard cubre 6 estados y omite `accepted`, `pending_payment`, `payment_rejected`, `driver_assigned` y `picked_up`; la tarjeta de Orders añade `picked_up` pero omite otros. Dashboard y layout usan `order.status` global; Orders usa `myCommerceStatus`. Un pedido cash recién creado tiene global `received` y por comercio `preparing`: Dashboard/badge lo muestran “Recibido” y Orders “En Preparación”. Si el comercio marca listo, el global sigue `preparing` hasta que todos los comercios estén listos, así que el Dashboard lo sigue contando como pendiente. Los estados no mapeados se muestran en inglés. | Colas y badges contradictorios; el negocio no sabe qué preparar; “en preparación” se infla; la pestaña “Recibidos” de Orders es prácticamente inalcanzable porque el enum por comercio no tiene `received`. | Importar `getOrderStatusMeta` del contrato; usar `myCommerceStatus ?? status` para el negocio; unificar un selector compartido; cubrir los 11 estados y no duplicar colores. |
| DASH-09 | P1 | Pedidos por transferencia | `server/order-router.ts:324-325,369-386,735`; `src/pages/commerce/Dashboard.tsx:72,321-330` | Los pedidos con `paymentMethod='transfer'` nacen `pending_payment`. `getCommerceOrders` los excluye con `status <> 'pending_payment'` y `order.create` no emite `new_order` para transferencias. El comercio no los ve hasta que un admin los pasa a `received`. | Pedidos pagados por transferencia invisibles para el negocio; el cliente espera y el comercio no prepara; si el admin tarda, se pierde la venta. Si la exclusión es intencional, hoy no está documentada ni comunicada en la UI. | Incluirlos con badge “Pago pendiente” y sin acciones de preparación, o documentar y notificar explícitamente; emitir evento al comercio al crear la transferencia. |
| DASH-10 | P1 | Tiempo real y refresco | `src/pages/commerce/Dashboard.tsx:146,231,328`; `src/components/CommerceLayout.tsx:110-113`; `src/hooks/useDeliveryData.ts:305-313,520-527`; `src/pages/commerce/Orders.tsx:58`; `src/hooks/useOrderEvents.ts:152-169`; `src/pages/commerce/Stats.tsx:91-94` | Solo `/commerce/orders` usa `useCommerceEvents`; Dashboard y layout no. Los pedidos llegan por polling de 30 s y `getStats` no tiene intervalo ni SSE. Los textos “pedidos en vivo”, “métricas en tiempo real” y “aparecerá aquí al instante” no se cumplen. Stats muestra “En Vivo” sin SSE (referencia). | Hasta 30 s de retraso en pedidos nuevos, más si la pestaña estuvo en background; promesas falsas; picos de carga por polling. | Montar `useCommerceEvents` una vez en el layout o en Dashboard, invalidar pedidos, productos y stats; mantener 30 s como respaldo, no bajarlo; ajustar el copy a “actualización cada 30 s” si no se usa SSE. |
| DASH-11 | P1 | Performance y PII del layout | `src/components/CommerceLayout.tsx:49`; `src/pages/commerce/Dashboard.tsx:72`; `server/order-router.ts:711-746` | El layout monta `useCommerceOrders` en cada pantalla del negocio solo para calcular un badge. La query devuelve todos los pedidos históricos sin límite y todos los `order_items` del comercio. En el servidor, además, `db.select().from(customers)` trae la tabla completa de clientes sin filtro para mapear nombre y teléfono. Dashboard y layout comparten `queryKey`, así que React Query no duplica el request, pero el payload y el costo crecen sin techo y se repiten cada 30 s. | Latencia, memoria y egress crecientes; PII innecesaria; cada ruta del panel paga una consulta pesada solo para el badge. | Endpoint ligero de conteo (`countPendingOrders`) para el badge; paginar pedidos; filtrar `customers` por los `customerId` de la página; seleccionar solo columnas necesarias. |
| DASH-12 | P1 | Performance de métricas | `server/commerce-router.ts:154-189`; `src/pages/commerce/Dashboard.tsx:70`; `src/hooks/useDeliveryData.ts:520-527` | `getStats` hace una consulta a `orders` por cada `orderId` distinto (N+1), filtra ítems en JavaScript y recorre todo el historial del comercio. Dashboard lo llama al montar. | Tiempo de carga y costo de base de datos; riesgo de timeout con historial grande; el bloque de métricas puede tardar aunque el resto de queries ya estén listas. | Una sola consulta agregada con join `orders`/`order_items`, filtro `delivered`, agrupación por producto y por día; si se necesita ventana histórica, acotarla. |
| DASH-13 | P2 | Logout | `src/components/CommerceLayout.tsx:68-77`; `src/pages/commerce/Profile.tsx:209-214`; `src/hooks/useCart.tsx:147-150`; `src/hooks/useDeliveryData.ts:29`; `src/components/SessionGuard.tsx:35` | El logout del layout limpia solo `merchant_user` y `qs_session`. No hace `queryClient.clear()`, no emite `rapidy:logout`, no limpia `customer_session`, `driver_user` ni el carrito, e ignora el error de `login.logout` y navega igual. F-14 confirmado. | La caché de pedidos y PII puede quedar disponible tras “cerrar sesión”; carrito o sesión de cliente en un dispositivo compartido; si falla el logout, las cookies siguen válidas aunque la UI diga que salió. | Limpiar la caché de React Query, emitir `rapidy:logout`, borrar todas las claves locales del negocio y del cliente, y navegar solo si el logout confirmó. Añadir confirmación. |
| DASH-14 | P2 | Routing | `src/App.tsx:97,112-116`; `src/components/SessionGuard.tsx:31-37,76-80` | `/commerce/:id` (detalle cliente) está declarada antes que las rutas estáticas del negocio. `/commerce/foo` solo coincide con el dynamic y entra al guard customer. Para un merchant, el guard detecta rol distinto, ejecuta `redirectOut`, borra `merchant_user` y `qs_session`, y navega a `/customer-login`. F-13 confirmado, con el efecto extra de logout local. | Un typo en la URL expulsa al merchant y le borra la sesión de UI; parece un fallo de login. | Ruta catch-all `commerce/*` a NotFound o redirección antes del dynamic; restringir `:id` a numérico; o mover la vitrina cliente a `/store/:id`. |
| DASH-15 | P0 | Autorización y estado | `server/commerce-router.ts:86-126` (especialmente `:99,:116-122`); `server/commerce-router.ts:128-143` | `commerce.update` es `merchantQuery` y acepta `status`. Solo valida propiedad, no rol admin. Un merchant `suspended` o `inactive` puede llamar la API con `{ status: "active" }` y volver al catálogo público, que filtra por `status = "active"`. `toggleStatus` solo invierte `isOpen` y tampoco exige `status = "active"`. F-02 confirmado. No es explotable desde la UI del Dashboard, pero sí desde la API con la cookie merchant. | Bypass del control de admin; un comercio suspendido se reactiva y vuelve a recibir pedidos; el banner del Dashboard puede mostrar abierto. | Quitar `status` e `isOpen` de `commerce.update` para merchant; dejar el estado solo a admin; `toggleStatus` debe rechazar comercios no activos o limitarse a `isOpen`. |
| DASH-16 | P2 | Estados de error | `src/pages/commerce/Dashboard.tsx:69-73,84-94,321-330,400-415`; `src/hooks/useDeliveryData.ts:112-118,210-217,305-313,520-527` | Los hooks de comercio, productos, pedidos y stats no devuelven `error`/`isError`. Dashboard no usa `loading`. Ante 403, 500 o red caída muestra “No tienes pedidos recientes”, “No tienes productos” o $0.00, igual que un local nuevo. El toggle falla solo con `console.error`; no hay toast ni reintento. | Fallos de permisos o red se interpretan como negocio vacío; el merchant no sabe que debe reintentar o contactar soporte. | Exponer `error` y `refetch` en los hooks; mostrar estado de error diferenciado con reintento; toast inline en mutaciones; no usar el vacío como fallback de error. |
| DASH-17 | P2 | Carga inicial | `src/pages/commerce/Dashboard.tsx:71-73,96,130-194,200-273`; `src/hooks/useDeliveryData.ts:121-169` | Mientras `useCommerce` carga, `commerce` es `null`, `isOpen` es `false` y se pinta “Local en Pausa • Fuera de Línea”; las métricas muestran $0.00 y las listas vacías. Si el local está abierto, la UI cambia de estado al llegar la query. Lo mismo ocurre mientras se resuelve `commerceId`. | Flash de estado falso y apariencia de caída en el primer render; confusión en la primera impresión del panel. | Gate del banner y las métricas detrás de un skeleton; usar `loading` de `useCommerce` y `useMerchantCommerceId`; no renderizar “cerrado” hasta tener datos. |
| DASH-18 | P2 | Confirmación de acciones | `src/pages/commerce/Dashboard.tsx:151-161,182-190` | “Pausar / Cerrar” actúa de inmediato, sin confirmación ni aviso de pedidos activos. El botón no muestra el impacto: los clientes no podrán hacer quote/checkout. | Cierre accidental en hora pico; pedidos en curso y clientes bloqueados; el copy “Pausar / Cerrar” mezcla dos acciones distintas. | Diálogo de confirmación con conteo de pedidos activos; explicar que se dejará de recibir pedidos; success/error visible. |
| DASH-19 | P2 | Layout desktop | `src/components/CommerceLayout.tsx:203-207` | `main` combina `md:pt-0` con `style={{ paddingTop: "calc(max(48px, env(safe-area-inset-top, 48px)) + 56px)" }}`. El estilo inline gana en desktop, así que el contenido arranca aproximadamente 104 px abajo aunque no haya header fijo. | Espacio muerto y desalineación con el sidebar en desktop; sensación de layout roto. | Aplicar ese padding solo en móvil con una media query o una clase; en desktop mantener `pt-0`. |
| DASH-20 | P2 | Copy y estado del layout | `src/components/CommerceLayout.tsx:104-115,182-185` | La tarjeta del sidebar dice “Operando en Vivo” con ping y el header móvil “Panel de Negocio” con ping, siempre, sin consultar `commerce.isOpen` ni `commerce.status`. Contradice el banner “Local en Pausa” de la misma pantalla. | Información contradictoria; el merchant no sabe si está vendiendo o no. | Que el layout consuma el estado del comercio (o un contexto compartido) y renderice Abierto, Pausado o Suspendido. |
| DASH-21 | P2 | Payload de productos | `src/pages/commerce/Dashboard.tsx:69-71`; `server/commerce-router.ts:55-59,152`; `server/product-router.ts:64-75` | `commerce.getById` ya devuelve todos los productos del comercio, incluidas imágenes base64. El Dashboard además llama `product.getByCommerce` y `getStats` vuelve a cargar `products`. El Dashboard no usa `commerce.products`. | Tres lecturas del catálogo en el servidor y dos payloads al navegador; imágenes base64 duplicadas, latencia y memoria innecesarias. | Endpoint de resumen del comercio (nombre, estado, isOpen) sin productos, o reutilizar una sola query de productos; no incluir `products` en `getById` para el panel. |
| DASH-22 | P2 | Accesibilidad | `src/pages/commerce/Dashboard.tsx:336-340,420-424,202,250,310,326`; `src/components/CommerceLayout.tsx:190-199,224-245` | Las filas de pedido y producto son `<div onClick>` sin `role`, `tabIndex` ni manejo de teclado. Textos de 10-11 px en `text-zinc-400` sobre blanco no alcanzan contraste AA. El botón “Salir” móvil y los ítems del bottom nav quedan por debajo de 44 px de alto. | Un merchant con teclado o baja visión no puede navegar; targets difíciles en móvil. | Usar `<button>` o `<Link>`; `focus-visible`; subir contraste y tamaño; `min-h-11`/`min-w-11` en targets. |
| DASH-23 | P2 | Design system | `src/pages/commerce/Dashboard.tsx:131-133,137,144,186,200-273`; `tailwind.config.js:13-21`; `src/index.css:41-46` | Uso masivo de hex `#FF6A00`, `#0E0E12` y `#F7F7FA` en lugar de los tokens `brand`, `surface` e `ink`. El icono de comisión usa zinc mientras el resto usa brand; radios y sombras son ad-hoc. | Drift de marca y difícil theming; inconsistencias al cambiar tokens; el panel se desvía del resto de la app. | Migrar a tokens; centralizar estilos de tarjeta, badge y botón; revisar contraste con los tokens. |
| DASH-24 | P2 | PII y datos multi-comercio | `server/order-router.ts:200-206,745-767`; `db/schema.ts:176-193` | `getCommerceOrders` devuelve el `orders` completo: `deliveryAddress`, `customerId`, `customerPhone`, `notes`, `idempotencyKey`, flags de settlement y `cancelledBy`. En pedidos multi-comercio conserva `subtotal`, `deliveryFee` y `commission` globales; solo sobrescribe `total` con el subtotal del comercio. El Dashboard solo muestra nombre, cantidad de ítems y total. | El navegador del merchant recibe dirección y teléfono que la pantalla no necesita, además de montos y comisión globales de otros comercios del mismo pedido. Superficie innecesaria de PII. | Proyección explícita con solo los campos que usa la UI; totales por comercio; omitir `idempotencyKey`, settlement, `customerId` y comisión global si no se muestran. |
| DASH-25 | P2 | Total mostrado | `server/order-router.ts:749-766`; `src/pages/commerce/Dashboard.tsx:355-358`; `server/order-router.ts:186,337` | La tarjeta “Pedido #” muestra `order.total`, pero `getCommerceOrders` reemplaza ese campo por la suma de ítems del comercio, sin delivery fee ni comisión. El cliente ve otro total en `/order/:id`, que usa el total global del pedido. | Discrepancias al conciliar y cobrar; el merchant cree que el pedido vale menos que lo que paga el cliente. | Devolver `commerceSubtotal` y `orderTotal` por separado; etiquetar “Subtotal del local” o mostrar ambos. |
| DASH-26 | P2 | SSE de comercio y suspensión | `server/commerce-router.ts:124,142`; `server/admin/commerces-router.ts:118-119`; `server/boot.ts:286-305`; `src/pages/customer/CommerceDetail.tsx:201-207`; `server/commerce-router.ts:44-60` | `commerce.toggleStatus` y `commerce.update` emiten solo `admin:dashboard`; no emiten `commerces:global` ni `commerce:{id}`. Las pestañas cliente abiertas no actualizan el catálogo al abrir/cerrar. Además `commerce.getById` no filtra `status` y el detalle cliente solo mira `isOpen`, así que un comercio suspendido por URL directa se ve “Abierto” con productos disponibles. F-15 confirmado. | Cliente con catálogo obsoleto; comercio suspendido visible por enlace directo; tras cerrar, una pestaña sin refetch sigue mostrando el estado abierto y el catálogo sigue listado hasta que el cliente recargue. | Emitir `commerces:global` y `commerce:{id}` en toggle y update; filtrar `status = "active"` en `getById` público; que el detalle cliente valide `status`; el quote sigue siendo la última barrera. |
| DASH-27 | P2 | Comisión histórica | `server/commerce-router.ts:202-204,206-215`; `server/order-router.ts:336,729,766` | `totalCommission` se recalcula con `commerces.commissionRate` actual sobre todo el histórico. `orders.commission` y `commerceCommission` guardan la tasa aplicada al crear el pedido. Si un admin cambia la tasa, el Dashboard reescribe la comisión pasada. | Liquidaciones y reportes no cuadran con lo cobrado; auditoría financiera difícil. | Agregar la comisión guardada por pedido o hacer snapshot de la tasa; separar “comisión histórica” de “comisión estimada a tasa actual”. |

## 4. Integración con el flujo Cliente

### 4.1 Pedido en efectivo (camino feliz)

1. El cliente crea el pedido con `order.create`; nace `received` (`server/order-router.ts:324-325`), se insertan los ítems y un `order_commerce_status` con `preparing` por comercio (`:369-376`).
2. Se emite `new_order` al canal `commerce:{id}` (`:381-386`).
3. `/commerce/orders` lo recibe por SSE (`src/pages/commerce/Orders.tsx:58`) y lo muestra de inmediato.
4. `/commerce` no escucha SSE: lo ve en el siguiente polling de 30 s (`src/hooks/useDeliveryData.ts:305-313`). El texto “aparecerá aquí al instante” (`Dashboard.tsx:328`) no se cumple.

**Riesgo de integración:** el mismo pedido se muestra como “Recibido” en Dashboard (estado global `received`) y como “En Preparación” en Orders (estado por comercio `preparing`). El badge del layout también cuenta `received`/`preparing` globales, así que puede discrepar de las pestañas de Orders. Ver DASH-08.

### 4.2 Pedido por transferencia

- El cliente lo crea como `pending_payment` (`server/order-router.ts:324-325`).
- `getCommerceOrders` lo excluye (`:735`) y no se emite `new_order` para transferencias (`:381-386`).
- El comercio no lo ve hasta que un admin lo pasa a `received`.

**Riesgo:** el cliente ve “Pago pendiente” en `/order/:id`, pero el negocio no ve nada. Si el admin demora, el pedido queda invisible y el comercio no puede prepararlo. Es el F-12 del mapa y sigue vigente. Si el comportamiento es intencional, debe documentarse y avisarse en la UI del negocio.

### 4.3 Abrir/cerrar local

- `commerce.toggleStatus` invierte `isOpen` y verifica ownership (`server/commerce-router.ts:128-143`).
- `order.quote` rechaza comercios no activos o cerrados (`server/order-router.ts:124-131`); `product.list`/`getById` filtran `status="active"` e `isOpen="open"` (`server/product-router.ts:36-41,53-59`); Cart bloquea ítems de comercios cerrados (`src/pages/customer/Cart.tsx:87`).
- Por tanto, **cerrar sí bloquea catálogo, quote y checkout** en la siguiente consulta.
- Pero el toggle no emite `commerces:global` ni `commerce:{id}` (`commerce-router.ts:142`), así que una pestaña cliente ya abierta no se entera hasta que refetchea. Ver DASH-26.
- El banner del Dashboard no distingue `status` de `isOpen`; un comercio `pending`/`suspended` con `isOpen="open"` se ve abierto. Ver DASH-04.

### 4.4 Comercio suspendido y visibilidad pública

- `commerce.list` filtra `status="active"` (`server/commerce-router.ts:29-34`), pero `commerce.getById` no filtra estado (`:44-60`).
- El detalle cliente solo evalúa `commerce.isOpen` (`src/pages/customer/CommerceDetail.tsx:201-207`), no `status`.
- Resultado: un comercio suspendido puede seguir abriéndose por URL directa y mostrarse “Abierto” con productos disponibles, aunque no aparezca en Home ni en Search. F-15 confirmado.
- El Dashboard no muestra el estado administrativo, así que el negocio tampoco sabe que está suspendido.

### 4.5 Estados del contrato

`contracts/orderStatus.ts` define 11 estados (`:7-19`). El panel del negocio no usa ese contrato en Dashboard ni en el layout. La tabla por comercio de la base solo admite `preparing`, `ready_for_pickup` y `picked_up` (`db/schema.ts:34-38`), por lo que `received` y `accepted` no existen como estado por comercio. Consecuencias:

- La pestaña “Recibidos” de `/commerce/orders` no puede llenarse con el modelo actual; F-04 sigue vigente.
- `accepted`, `driver_assigned`, `payment_rejected` y `picked_up` se muestran en inglés o con fallback en Dashboard.
- El cliente y el negocio ven timelines distintos para el mismo pedido.

### 4.6 Pedidos multi-comercio

- `getCommerceOrders` filtra ítems por comercio, pero devuelve el pedido global completo (`server/order-router.ts:749-767`).
- `total` se sobrescribe con el subtotal del comercio, pero `subtotal`, `deliveryFee` y `commission` siguen siendo globales. El merchant puede ver montos de otros comercios del mismo pedido en el payload.
- `markReady` solo pasa el pedido global a `ready_for_pickup` cuando todos los comercios están listos (`server/commerce-router.ts:240-260`). Dashboard usa el estado global, así que un comercio que ya terminó sigue viendo “En preparación” hasta que los demás terminen. Ver DASH-08 y DASH-24.

### 4.7 PII y exposición

- El comercio necesita teléfono del cliente para contactarlo, pero `getCommerceOrders` también entrega dirección completa, `customerId`, `notes`, `idempotencyKey` y flags internos. El Dashboard no los muestra. Ver DASH-24.
- No se detectó exposición del email de otros comercios: `publicCommerceColumns` lo excluye (`server/commerce-router.ts:9-26`) y `commerce.me` es owner-only (`:38-42`).
- La comisión que muestra el Dashboard es la del propio comercio, no la de terceros; aun así, el payload multi-comercio incluye la comisión global. Revisar si es política mostrarla.

## 5. Lo que funciona y no se debe romper

- **Ownership real en endpoints sensibles.** `commerce.getStats`, `commerce.toggleStatus`, `commerce.markReady` y `order.getCommerceOrders` usan `merchantQuery` y `assertCommerceOwnership` (`server/commerce-router.ts:149,221`; `server/order-router.ts:714`). Manipular `commerceId` en localStorage no permite escribir ni leer pedidos de otro comercio: los endpoints protegidos responden 403.
- **`getCommerceOrders` está acotado a los ítems del comercio.** Construye `orderIds` desde `order_items.commerceId` y solo devuelve pedidos con esos ítems (`server/order-router.ts:717-735`). No es una fuga de pedidos ajenos.
- **`paymentReceipt` no se devuelve al negocio.** `sanitizeOrder` lo elimina (`server/order-router.ts:200-206`). Mantener esa limpieza.
- **`product.getByCommerce` es owner-aware.** El dueño ve productos pausados; el público solo disponibles (`server/product-router.ts:64-75`). No convertir este endpoint en público sin el filtro.
- **Cerrar el local sí bloquea el checkout.** `buildQuote` valida `status="active"`, `isOpen="open"`, disponibilidad, mínimo por comercio y mínimo global (`server/order-router.ts:117-176`). Es la última barrera correcta y no debe relajarse.
- **SSE del comercio está autenticado.** `/api/events/commerce/:commerceId` valida que el merchant sea dueño (`server/boot.ts:168-189,215-236`). El canal existe y se usa en Orders; no hay que inventar otro.
- **Polling de 30 s es el respaldo correcto.** `useCommerceOrders` usa 30 s (`useDeliveryData.ts:305-313`) y `useOrder` pausa en estados terminales. No bajar a 4-5 s.
- **El login deriva el rol desde `users.role` y firma cookies HttpOnly** (`server/login-router.ts:42-66`). No volver a roles desde localStorage.
- **La comisión del comercio no es editable por el merchant.** `commerce.update` no acepta `commissionRate` (`server/commerce-router.ts:88-104`); solo admin la cambia. Mantener esa separación.
- **El vacío y los skeletons de otras pantallas no deben romperse.** Dashboard ya tiene buenos empty states visuales (`Dashboard.tsx:321-330,400-416`); el problema es que también se muestran ante error o carga.
- **React Query deduplica layout y página.** Ambos usan la misma `queryKey` de pedidos (`CommerceLayout.tsx:49`, `Dashboard.tsx:72`), así que no hay doble request de pedidos entre layout y Dashboard. El doble fetch real es de productos (`commerce.getById` + `product.getByCommerce`).
- **El toggle invalida `getById` y `getStats`** (`useDeliveryData.ts:540-549`), por lo que el banner se actualiza tras una mutación exitosa. Mantener la invalidación, aunque conviene añadir eventos SSE.

## 6. Evidencia y verificación

### 6.1 Método y comandos

- Lectura estática de los archivos listados en la sección 1.
- `git rev-parse --short HEAD` → `bf81ab6`; rama `master`.
- `git status --short` antes de este documento → árbol limpio salvo el directorio `docs/commerce/audit/` creado por otro trabajo de auditoría.
- `Select-String` para localizar mapas de estado, `myCommerceStatus`, `rapidy:logout`, `useCommerceEvents` y tokens de diseño.
- No se ejecutó `npm run dev`, no se reinició el servidor, no se hizo `db:push` ni consultas SQL. `localhost:3000` quedó intacto.

### 6.2 Hallazgos conocidos: verificación

| Hallazgo previo | Estado | Evidencia y observación |
|---|---|---|
| F-02: comercio puede reactivarse solo | **Confirmado P0** | `commerce.update` acepta `status` y solo valida ownership (`server/commerce-router.ts:99,112-122`). Ver DASH-15. |
| F-04: pedidos nacen “preparing”, no “received” | **Confirmado** | `order.create` inserta `order_commerce_status.status = "preparing"` (`server/order-router.ts:369-376`); el enum por comercio no tiene `received` (`db/schema.ts:34-38`). Efecto visible en DASH-08. |
| F-05: mapas de estado incompletos y duplicados | **Confirmado y ampliado** | Dashboard 6 estados, tarjeta 7, contrato 11 (`Dashboard.tsx:45-56`; `CommerceOrderCard.tsx:34-42`; `contracts/orderStatus.ts:7-19`). Ver DASH-08. |
| F-06: `getCommerceOrders` carga todos los clientes y no pagina | **Confirmado** | `db.select().from(customers)` sin filtro (`server/order-router.ts:745`); pedidos sin `orderBy` ni límite (`:731-735`). Ver DASH-11 y DASH-24. |
| F-11: stats con N+1 y datos engañosos | **Confirmado** | Consulta a `orders` por cada `orderId` (`server/commerce-router.ts:167-189`); `topProducts` sin `id` (`:197-200`); `dailySales` agrupa todo el histórico por día de semana (`:171,191-195`). Ver DASH-06 y DASH-12. |
| F-12: transferencias invisibles | **Confirmado** | Filtro `<> 'pending_payment'` (`server/order-router.ts:735`) y ausencia de `new_order` para transfer (`:381-386`). Ver DASH-09. |
| F-13: `/commerce/foo` cae en cliente | **Confirmado, con efecto extra** | `App.tsx:97` vs `:112-116`; el guard customer borra `merchant_user` y `qs_session` (`SessionGuard.tsx:31-37,76-80`). Ver DASH-14. |
| F-14: logout incompleto | **Confirmado** | `CommerceLayout.tsx:68-77` no limpia query cache, carrito ni emite `rapidy:logout`. Ver DASH-13. |
| F-15: vitrina pública no filtra estado | **Confirmado** | `commerce.getById` no filtra `status` (`server/commerce-router.ts:44-60`); el detalle cliente solo mira `isOpen` (`CommerceDetail.tsx:201-207`). Ver DASH-26. |
| F-17: Dashboard dice “En Vivo” sin SSE | **Confirmado** | Solo Orders monta `useCommerceEvents` (`Orders.tsx:58`); Dashboard depende de polling (`useDeliveryData.ts:305-313`). Ver DASH-10. |
| F-18: etiquetas de métricas no coinciden | **Parcialmente corregido en Dashboard** | El tile “Catálogo Activo” ya usa `availableCount` y no `prods.length` (`Dashboard.tsx:247-248`), así que esa parte de F-18 no aplica a `/commerce`. Siguen mal “Pedidos Totales” (solo entregados) y el fallback (`:229`); `/commerce/stats` todavía usa `stats.totalProducts` para “Catálogo Activo” (`Stats.tsx:168`). Ver DASH-05. |
| F-08: sesión dependiente de localStorage | **Confirmado** | `SessionGuard` exige `qs_session` (`SessionGuard.tsx:76-80`); el hook hace `JSON.parse` sin protección y fallback por nombre (`useDeliveryData.ts:122-163`). Ver DASH-03. |

### 6.3 Lo que no se pudo verificar

- No se consultó la base de datos: no se sabe cuántos comercios tienen nombre duplicado, cuántos están `pending` con `isOpen="open"` ni cuántos pedidos hay por comercio.
- No se midió el payload real ni el tiempo de `getCommerceStats` con datos de producción; el N+1 es evidente por código, pero el impacto en milisegundos depende del volumen.
- No se ejecutó el flujo en navegador: no se observó el flash de “Local en Pausa”, el comportamiento del bottom nav en dispositivos con notch ni el contraste real renderizado.
- No se probó SSE en vivo ni la reconexión; se verificó por código y por la configuración del servidor.
- No se determinó si la exclusión de `pending_payment` y la visualización de comisión son decisiones de producto intencionales. Si lo son, deben documentarse; si no, son bugs.
- No se auditó a fondo `/commerce/orders` ni `/commerce/products`; los hallazgos F-01, F-03, F-07 y F-10 pertenecen a esas rutas y solo se mencionan cuando afectan al Dashboard.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Archivo:línea | Por qué está en el top |
|---|---|---|---|---|
| 1 | DASH-15 | **P0** | `server/commerce-router.ts:99,116-122` | Un merchant suspendido puede reactivarse solo con `commerce.update({ status: "active" })`; es un bypass de autorización que impacta directamente el catálogo y el checkout. |
| 2 | DASH-04 | **P1** | `src/pages/commerce/Dashboard.tsx:96,130-147`; `db/schema.ts:132-133` | El Dashboard muestra “Local Abierto • Recibiendo Pedidos” para comercios `pending`/`suspended` con `isOpen="open"`; el cliente no puede pedir y el negocio no lo sabe. |
| 3 | DASH-06 | **P1** | `src/pages/commerce/Dashboard.tsx:103-123`; `server/commerce-router.ts:197-200` | “Más Populares” está roto: `revenue` se muestra como precio unitario, no hay `id`/`salesCount`, las keys son `undefined` y el ranking no está vinculado al producto. |
| 4 | DASH-08 | **P1** | `src/pages/commerce/Dashboard.tsx:45-56,99`; `src/components/CommerceLayout.tsx:51-54`; `server/order-router.ts:756-764` | Dashboard y Orders muestran estados distintos para el mismo pedido; los conteos de pendientes usan el estado global y no `myCommerceStatus`, y faltan 5 estados del contrato. |
| 5 | DASH-09 | **P1** | `server/order-router.ts:735,381-386` | Las transferencias `pending_payment` no aparecen en el panel ni emiten aviso; el comercio no las ve hasta que un admin las aprueba. |

**Siguiente prioridad después del top 5:** DASH-07 (pedidos recientes sin orden), DASH-10 (sin SSE en Dashboard) y DASH-11 (consulta completa de pedidos en el layout). Los tres afectan la operación diaria y se pueden corregir sin cambiar el modelo de datos.