# Mapa completo del flujo Negocio (Commerce) — Rapidy

**Fecha:** 2026-11-13  
**Rol:** `merchant` (comercio / negocio)  
**Alcance:** todas las rutas y contratos que usa el panel del negocio, más los
procedimientos que el rol `merchant` puede invocar aunque la UI todavía no los use.

> **Este documento es un mapa, no una corrección.**  
> No se modificó código de negocio. Los hallazgos de la sección final están
> separados del mapa para decidir qué corregir y en qué orden.

## 1. Resumen

| Elemento | Cantidad |
|---|---|
| Rutas UI privadas del negocio | 5 |
| Ruta de acceso (compartida con admin/driver) | 1 (`/login`) |
| Procedimientos tRPC relacionados | 34 |
| Procedimientos usados directamente por la UI del negocio | 18 |
| Canales SSE existentes | 6 |
| Canales SSE propios del negocio | 1 (`/api/events/commerce/:commerceId`) |
| Tablas de base de datos tocadas | 11 |

**Respuesta corta:** sí, el negocio tiene errores propios. No son los mismos del
cliente, pero hay hallazgos P0 de integridad de estados y de autorización, y
varios P1 de operación, sesión, datos y rendimiento. Están listados en la
sección 9 con `archivo:línea`.

## 2. Rutas UI del negocio

| Ruta | Archivo | Guard | Pantalla | Propósito |
|---|---|---|---|---|
| `/login` | `src/pages/Login.tsx` | Pública | Acceso profesional | Login por email/contraseña para admin y comercio; por teléfono para driver |
| `/commerce` | `src/pages/commerce/Dashboard.tsx` | `SessionGuard role="merchant"` | Dashboard | Estado del local, métricas, accesos rápidos, pedidos recientes, productos populares |
| `/commerce/orders` | `src/pages/commerce/Orders.tsx` | `SessionGuard role="merchant"` | Monitor de pedidos | Aceptar, preparar, marcar listo, rechazar y seguir pedidos |
| `/commerce/products` | `src/pages/commerce/Products.tsx` | `SessionGuard role="merchant"` | Catálogo | Crear, editar, eliminar, buscar y pausar productos |
| `/commerce/stats` | `src/pages/commerce/Stats.tsx` | `SessionGuard role="merchant"` | Métricas | Ventas, pedidos, ticket promedio, comisión, ranking y ventas por día |
| `/commerce/profile` | `src/pages/commerce/Profile.tsx` | `SessionGuard role="merchant"` | Perfil del negocio | Datos, logo, portada, horarios, mínimo, ubicación, abrir/cerrar y logout |

### Navegación

`src/components/CommerceLayout.tsx` define los 5 destinos del panel:

```text
/commerce            → Inicio
/commerce/orders     → Pedidos
/commerce/products   → Productos
/commerce/stats      → Estadísticas
/commerce/profile    → Perfil
```

En desktop usa sidebar fija; en móvil usa header superior y bottom nav. El badge
de pedidos se calcula con `order.getCommerceOrders`.

### Colisión de rutas

`src/App.tsx:98` define `/commerce/:id` para el cliente (detalle del comercio).
`src/App.tsx:113-117` define las rutas estáticas del negocio. React Router
resuelve primero las estáticas, pero una URL desconocida como `/commerce/foo`
cae en `/commerce/:id` y termina bajo `SessionGuard role="customer"`, no en el
panel del negocio ni en `NotFound`.

## 3. Flujo por ruta

### 3.1 `/login` — acceso del negocio

```text
Login.tsx
  └─ trpcMutate("login.login", { email, password })
      └─ server/login-router.ts
          ├─ bcrypt.compare(password, users.passwordHash)
          ├─ setMerchantCookie()
          │   ├─ quickgo_merchant_token   (24 h)
          │   └─ quickgo_merchant_refresh (7 días)
          └─ busca commerce por merchantUserId
              └─ devuelve commerceId

Login.tsx
  ├─ localStorage.merchant_user = { id, name, email, role, commerceId }
  ├─ localStorage.qs_session   = { role: "merchant", ts }
  └─ navigate("/commerce")
```

- El rol se deriva del usuario en base de datos, no de un campo del frontend.
- Si el comercio no tiene `merchantUserId`, el login devuelve éxito pero sin
  `commerceId`.
- `SessionRefresh` en `src/App.tsx:66-79` llama `login.refresh` cada 9 minutos
  para admin, merchant y driver.
- `SessionGuard` verifica `login.checkAuth` antes de renderizar el panel.
- El logout del panel llama `login.logout`, que limpia cookies de admin, driver,
  merchant y customer.

### 3.2 `/commerce` — Dashboard

**Archivo:** `src/pages/commerce/Dashboard.tsx`  
**Layout:** `src/components/CommerceLayout.tsx`

| Dato | Hook | Procedimiento | Tabla |
|---|---|---|---|
| ID del comercio | `useMerchantCommerceId` | `commerce.me` / `commerce.search` (fallback) | `commerces`, `users` |
| Comercio | `useCommerce` | `commerce.getById` | `commerces`, `products` |
| Productos | `useProductsByCommerce` | `product.getByCommerce` | `products` |
| Métricas | `useCommerceStats` | `commerce.getStats` | `order_items`, `orders`, `products`, `commerces` |
| Pedidos | `useCommerceOrders` | `order.getCommerceOrders` | `orders`, `order_items`, `order_commerce_status`, `customers` |
| Abrir/cerrar | `useToggleCommerceStatus` | `commerce.toggleStatus` | `commerces` |

**UI:**

- Banner de local abierto/cerrado con botón “Pausar / Cerrar” o “Abrir Local Ahora”.
- 4 métricas: ventas, pedidos totales, catálogo activo y comisión.
- 4 accesos rápidos.
- Pedidos recientes (4).
- Productos más populares (4).
- No usa SSE directamente: `useCommerceOrders` refresca cada 30 s.

### 3.3 `/commerce/orders` — Monitor de pedidos

**Archivos:**

- `src/pages/commerce/Orders.tsx`
- `src/components/commerce/CommerceOrderCard.tsx`

```text
Orders.tsx
  ├─ useMerchantCommerceId()             → commerce.me / commerce.search
  ├─ useCommerceOrders(commerceId)       → order.getCommerceOrders
  │     └─ refresco cada 30 s
  ├─ useCommerceEvents(commerceId)       → SSE /api/events/commerce/:commerceId
  ├─ useUpdateOrderStatus(commerceId)    → order.updateStatus
  └─ useMarkCommerceReady(commerceId)    → commerce.markReady
```

**Acciones de la tarjeta:**

| Estado actual | Acción | Procedimiento |
|---|---|---|
| `received` | “Aceptar y Preparar” | `order.updateStatus` → `preparing` |
| `received` | “Rechazar” | `order.updateStatus` → `cancelled` |
| `preparing` | “Listo para entregar al repartidor” | `commerce.markReady` |
| `ready_for_pickup` | Solo espera al repartidor | — |
| `picked_up` / `on_the_way` | Solo informa tránsito | — |
| `delivered` | Solo informa entregado | — |
| `cancelled` | Solo informa cancelado | — |

**Filtros:** Todos, Recibidos, En Preparación, Listos para Retiro, Entregados,
Cancelados. **Búsqueda:** número de pedido, nombre o teléfono del cliente.

**SSE:** el canal `commerce:{commerceId}` emite `new_order`, `commerce_ready`,
`products_update` y `catalog_update`. `useCommerceEvents` invalida
`order.getCommerceOrders` y `product.getByCommerce`.

### 3.4 `/commerce/products` — Catálogo

**Archivos:**

- `src/pages/commerce/Products.tsx`
- `src/components/commerce/ProductModal.tsx`
- `src/components/commerce/DeleteConfirmModal.tsx`

| Acción | Hook | Procedimiento | Tabla |
|---|---|---|---|
| Listar | `useProductsByCommerce` | `product.getByCommerce` | `products` |
| Crear | `useCreateProduct` | `product.create` | `products` |
| Editar | `useUpdateProduct` | `product.update` | `products` |
| Eliminar | `useDeleteProduct` | `product.delete` | `products` |
| Pausar/activar | `useUpdateProduct` | `product.update` | `products` |

**Campos del producto:** nombre, descripción, precio, categoría, imagen (archivo
o URL), unidad (`unit`/`kg`), disponible (`yes`/`no`), destacado (`yes`/`no`).

**Comportamiento:**

- Búsqueda local por nombre/descripción.
- Chips de categoría derivados del catálogo.
- Tarjeta con imagen, precio, badge de destacado y switch de disponibilidad.
- `ProductModal` convierte la imagen a base64 con `FileReader`.
- `DeleteConfirmModal` muestra error inline si la FK impide borrar.
- El backend traduce la FK de historial de pedidos a un mensaje para usar
  “inactivo” en lugar de eliminar.

### 3.5 `/commerce/stats` — Métricas

**Archivo:** `src/pages/commerce/Stats.tsx`

| Dato | Hook | Procedimiento |
|---|---|---|
| Todo el bloque | `useCommerceStats` | `commerce.getStats` |

**KPIs:** ventas totales, pedidos despachados, ticket promedio, catálogo activo.  
**Gráfico:** ventas por día (lun-dom).  
**Ranking:** top 10 productos por unidades vendidas y revenue.

El backend agrega `order_items` del comercio, filtra pedidos `delivered` y
calcula comisión con `commerces.commissionRate`.

### 3.6 `/commerce/profile` — Perfil del negocio

**Archivo:** `src/pages/commerce/Profile.tsx`

| Acción | Hook | Procedimiento | Tabla |
|---|---|---|---|
| Cargar | `useCommerce` | `commerce.getById` | `commerces`, `products` |
| Guardar | `useUpdateCommerceProfile` | `commerce.update` | `commerces` |
| Abrir/cerrar | `useToggleCommerceStatus` | `commerce.toggleStatus` | `commerces` |
| Logout | `trpcMutate` | `login.logout` | cookies |

**Campos editables:** nombre, descripción, dirección, teléfono, horarios, mínimo,
tiempo de entrega, logo, portada, latitud y longitud.

**Mapa:** Leaflet + OpenStreetMap, pin arrastrable, geocodificación inversa con
Nominatim and `navigator.geolocation`.

**No editable:** email de registro (se muestra read-only), estado
(`active/inactive/suspended/pending`) y `commissionRate`.

## 4. Backend tRPC — todos los procedimientos relacionados

Las rutas HTTP reales son `GET/POST /api/trpc/<procedimiento>`.
`query` usa GET; `mutation` usa POST.

### 4.1 Autenticación y sesión

| Procedimiento | Tipo | Auth | Entrada | Salida | Tablas |
|---|---|---|---|---|---|
| `login.login` | mutation | pública | `{ email?, phone?, password }` | `{ success, role, user, commerceId? }` | `users`, `commerces`, `drivers` |
| `login.refresh` | mutation | pública (cookie refresh) | — | `{ success, role }` | `users`, `drivers`, `customers` |
| `login.logout` | mutation | pública | — | `{ success: true }` | — |
| `login.checkAuth` | query | pública (cookies) | — | `{ authenticated, role, user }` | `users`, `drivers`, `customers` |
| `login.seedAdmin` | mutation | pública | — | `{ success: true }` | `users` |

### 4.2 Comercio

| Procedimiento | Tipo | Auth | Entrada | Salida | Tablas |
|---|---|---|---|---|---|
| `commerce.list` | query | pública | — | comercios activos (proyección pública) | `commerces` |
| `commerce.me` | query | `merchantQuery` | — | comercio completo del merchant | `commerces` |
| `commerce.getById` | query | pública | `{ id }` | comercio + productos | `commerces`, `products` |
| `commerce.getByCategory` | query | pública | `{ categoryId }` | comercios activos de la categoría | `commerces` |
| `commerce.search` | query | pública | `{ query }` | comercios activos por nombre | `commerces` |
| `commerce.update` | mutation | `merchantQuery` | datos del comercio + `status` | comercio actualizado | `commerces` |
| `commerce.toggleStatus` | mutation | `merchantQuery` | `{ id }` | comercio con `isOpen` invertido | `commerces` |
| `commerce.getStats` | query | `merchantQuery` | `{ id }` | KPIs, top productos, ventas por día | `order_items`, `orders`, `products`, `commerces` |
| `commerce.markReady` | mutation | `merchantQuery` | `{ orderId, commerceId }` | `{ allReady }` | `order_commerce_status`, `orders`, `order_status_history` |
| `commerce.registerDeviceToken` | mutation | `merchantQuery` | `{ token }` | `{ success }` | `users` |

### 4.3 Productos

| Procedimiento | Tipo | Auth | Entrada | Salida | Tablas |
|---|---|---|---|---|---|
| `product.list` | query | pública | — | catálogo disponible de comercios activos/abiertos | `products`, `commerces` |
| `product.getById` | query | pública | `{ id }` | producto disponible | `products`, `commerces` |
| `product.getByCommerce` | query | pública, owner-aware | `{ commerceId }` | todos si es dueño; solo disponibles si no | `products`, `commerces` |
| `product.getFeatured` | query | pública | — | destacados disponibles | `products`, `commerces` |
| `product.getTopOrdered` | query | pública | — | top por cantidad pedida | `order_items`, `products`, `commerces` |
| `product.search` | query | pública | `{ query }` | productos por nombre/comercio | `products`, `commerces` |
| `product.create` | mutation | `merchantQuery` | producto + `commerceId` | producto creado | `products`, `commerces` |
| `product.update` | mutation | `merchantQuery` | `id` + campos | producto actualizado | `products` |
| `product.delete` | mutation | `merchantQuery` | `{ id }` | `{ success }` | `products` |

### 4.4 Pedidos

| Procedimiento | Tipo | Auth | Entrada | Salida | Tablas |
|---|---|---|---|---|---|
| `order.getCommerceOrders` | query | `merchantQuery` | `{ commerceId }` | pedidos del comercio + items + cliente + estado por comercio | `orders`, `order_items`, `order_commerce_status`, `customers`, `commerces` |
| `order.updateStatus` | mutation | `participantQuery` | `{ id, status, notes?, cancellationReason? }` | pedido saneado | `orders`, `order_status_history`, `drivers`, `driver_earnings` |
| `order.markCommerceReady` | mutation | `merchantQuery` | `{ orderId, commerceId }` | `{ allReady }` | `order_commerce_status`, `orders`, `order_status_history` |
| `order.getById` | query | `participantQuery` | `{ id }` | pedido + items + historial + driver + comercios | `orders`, `order_items`, `order_status_history`, `order_commerce_status`, `drivers`, `commerces` |

> `order.markCommerceReady` es un duplicado funcional de `commerce.markReady`.
> La UI usa `commerce.markReady`; `order.markCommerceReady` no tiene pantalla.

### 4.5 Chat

| Procedimiento | Tipo | Auth | Entrada | Salida | Tablas |
|---|---|---|---|---|---|
| `chat.getByOrder` | query | `participantQuery` | `{ orderId, limit?, before? }` | últimos mensajes | `chat_messages`, `orders`, `order_items` |
| `chat.send` | mutation | `participantQuery` | `{ orderId, message, as? }` | mensaje insertado | `chat_messages`, `orders`, `order_items` |
| `chat.markAsRead` | mutation | `participantQuery` | `{ orderId }` | `{ success }` | `chat_messages` |

El backend permite al merchant enviar como `commerce`, pero **no existe ruta ni
pantalla de chat en el panel del negocio**. El merchant puede usar la API si
conoce el `orderId`; la UI no lo expone.

### 4.6 Catálogo auxiliar y settings

| Procedimiento | Tipo | Auth | Uso en negocio |
|---|---|---|---|
| `category.list` | query | pública | No usado por la UI del negocio |
| `category.getById` | query | pública | No usado por la UI del negocio |
| `settings.getPublic` | query | pública | No usado por la UI del negocio |

## 5. SSE — canales y permisos

| Canal | Endpoint | Quién puede escuchar | Eventos | Uso |
|---|---|---|---|---|
| Pedido | `/api/events/orders/:orderId` | admin, cliente dueño, driver asignado, merchant con items | `status_update`, `chat_message`, `commerce_ready`, `commerce_pickup`, `ping` | Cliente, driver, admin; el negocio puede pero no lo usa |
| Comercio | `/api/events/commerce/:commerceId` | admin o merchant dueño | `new_order`, `commerce_ready`, `products_update`, `catalog_update`, `ping` | `/commerce/orders` y detalle público del cliente |
| Driver | `/api/events/driver/:driverId` | admin o driver dueño | `new_available`, `order_assigned`, `commerce_pickup`, `ping` | Driver |
| Admin | `/api/events/admin-dashboard` | admin | `dashboard_update`, `ping` | Admin |
| Comercios global | `/api/events/commerces` | cualquier sesión | `commerce_update`, `ping` | Catálogo cliente |
| Productos global | `/api/events/products` | cualquier sesión | `products_update`, `ping` | Catálogo cliente |

**Autenticación SSE:** se resuelve desde cookies (`quickgo_merchant_token`,
`quickgo_merchant_refresh`, etc.) en `server/boot.ts:95-120`. Sin identidad:
401. El canal de comercio valida `commerces.merchantUserId`.

## 6. Sesión del negocio

```text
POST login.login
  ├─ quickgo_merchant_token    HttpOnly, 24 h
  └─ quickgo_merchant_refresh  HttpOnly, 7 días

Cada request
  └─ server/context.ts
      ├─ verifica access token
      ├─ si expiró, usa refresh y vuelve a emitir cookies
      └─ exige users.role = "merchant"

Frontend
  ├─ qs_session = { role: "merchant", ts }
  ├─ merchant_user = { id, name, email, commerceId? }
  ├─ SessionGuard consulta login.checkAuth
  ├─ App refresca login.refresh cada 9 min
  └─ logout llama login.logout y limpia localStorage
```

**Diferencia con cliente:** el cliente tiene refresh de 365 días deslizantes y
access de 15 min; el comercio tiene refresh de 7 días y access de 24 h. No es
necesariamente un bug, pero es una política distinta que hay que decidir.

## 7. Base de datos

| Tabla | Uso en el flujo negocio |
|---|---|
| `users` | Cuenta del merchant, `passwordHash`, `fcmToken`, `role` |
| `commerces` | Datos del local, `status`, `isOpen`, `commissionRate`, `merchantUserId` |
| `products` | Catálogo, precio, imagen, disponibilidad, destacado |
| `orders` | Pedido global, totales, pago, dirección, estado, cancelación |
| `order_items` | Líneas del pedido, comercio, producto, cantidad, precio |
| `order_commerce_status` | Estado de preparación por comercio (`preparing`, `ready_for_pickup`, `picked_up`) |
| `order_status_history` | Historial global de estados |
| `customers` | Nombre y teléfono que ve el comercio en el pedido |
| `drivers` | Repartidor asignado y estado |
| `driver_earnings` | Ganancia del driver al entregar |
| `chat_messages` | Mensajes del pedido (API disponible, UI de negocio inexistente) |

## 8. Inventario de archivos

### Páginas

- `src/pages/Login.tsx`
- `src/pages/commerce/Dashboard.tsx`
- `src/pages/commerce/Orders.tsx`
- `src/pages/commerce/Products.tsx`
- `src/pages/commerce/Stats.tsx`
- `src/pages/commerce/Profile.tsx`

### Componentes

- `src/components/CommerceLayout.tsx`
- `src/components/commerce/CommerceOrderCard.tsx`
- `src/components/commerce/ProductModal.tsx`
- `src/components/commerce/DeleteConfirmModal.tsx`
- `src/components/SessionGuard.tsx`

### Hooks

- `src/hooks/useDeliveryData.ts` — `useMerchantCommerceId`, `useProductsByCommerce`,
  `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, `useCommerceOrders`,
  `useUpdateOrderStatus`, `useMarkCommerceReady`, `useCommerceStats`,
  `useUpdateCommerceProfile`, `useToggleCommerceStatus`
- `src/hooks/useOrderEvents.ts` — `useCommerceEvents`
- `src/hooks/usePushNotifications.ts` — `commerce.registerDeviceToken`
- `src/hooks/useSessionSync.ts` — `qs_session`

### Backend

- `server/login-router.ts`
- `server/merchant-auth.ts`
- `server/commerce-router.ts`
- `server/product-router.ts`
- `server/order-router.ts`
- `server/chat-router.ts`
- `server/category-router.ts`
- `server/settings-router.ts`
- `server/context.ts`
- `server/middleware.ts`
- `server/lib/order-access.ts`
- `server/boot.ts`
- `server/events.ts`

### Contratos y esquema

- `contracts/orderStatus.ts`
- `db/schema.ts`

### Rutas externas que afectan al negocio

| Ruta | Rol | Efecto sobre el negocio |
|---|---|---|
| `/admin/commerces` | admin | Crea merchant/comercio, cambia `status`, `commissionRate`, elimina |
| `/admin/orders` | admin | Pasa `pending_payment` a `received`, asigna driver, cancela, valida pagos |
| `/admin/products` | admin | Modera disponibilidad, destacado y catálogo |
| `/commerce/:id` | cliente | Vitrina pública que lee `commerce.getById` + `product.getByCommerce` |
| `/order/:id` | cliente | Seguimiento que refleja los estados que escribe el negocio |
| `/driver/order/:id` | driver | Retira pedidos y actualiza `order_commerce_status` a `picked_up` |
| `/chat/:orderId` | cliente | Chat del pedido; el negocio tiene API pero no pantalla |

## 9. Hallazgos detectados durante el mapeo (sin corregir)

> No es una lista de tareas ni un backlog. Es evidencia para decidir el orden de
> corrección. No se tocó código de negocio en este paso.

### P0 — integridad y autorización

**F-01. `markReady` puede revivir pedidos cancelados o entregados.**  
`commerce.markReady` (`server/commerce-router.ts:218-283`) y
`order.markCommerceReady` (`server/order-router.ts:704-709`) solo verifican que
el comercio tenga items. No validan el estado actual del pedido. Si `allReady`
es verdadero, actualizan `orders.status` a `ready_for_pickup` incluso si el
pedido estaba `cancelled` o `delivered` (`commerce-router.ts:247-260`;
`order-router.ts:250-261`). Es un bypass de la máquina de estados.

**F-02. El comercio puede reactivarse solo.**  
`commerce.update` acepta `status` (`server/commerce-router.ts:99`) y lo escribe
sin distinguir si el llamante es admin (`:116-122`). Un comercio `suspended` o
`inactive` puede llamar la API con `{ status: "active" }` y volver al catálogo
público, que filtra por `status = "active"` (`commerce-router.ts:29-34`,
`product-router.ts:30-43`).

**F-03. Precios de producto sin validación de servidor.**  
`product.create` y `product.update` aceptan `price: z.string()` sin validar
positivo, finito, máximo ni decimales (`server/product-router.ts:153-191`,
`:193-240`). El quote solo hace `Number(product.price)` y multiplica
(`server/order-router.ts:145-146`). Un precio negativo o no numérico puede
romper totales, comisión y pedidos. El input HTML `min="0"`
(`ProductModal.tsx:157-165`) no protege la API.

### P1 — operación y datos

**F-04. Los pedidos nuevos nacen como “preparing”, no como “received”.**  
Al crear el pedido se inserta `order_commerce_status.status = "preparing"`
(`server/order-router.ts:369-376`), y el esquema tiene default `preparing`
(`db/schema.ts:247`). La UI usa `myCommerceStatus` (`Orders.tsx:80`), así que el
comercio nunca ve “Recibidos” ni el botón “Aceptar y Preparar”; salta directo a
“Listo”. La pestaña “Recibidos” queda prácticamente vacía.

**F-05. Mapas de estado incompletos y duplicados.**  
`Dashboard.tsx:45-52` y `CommerceOrderCard.tsx:34-42` mantienen mapas propios.
No cubren `accepted`, `pending_payment`, `payment_rejected`, `driver_assigned`
ni `picked_up` (este último sí en la tarjeta). Contradice el contrato único
`contracts/orderStatus.ts`. Además, `myCommerceStatus` tiene prioridad sobre el
estado global, así que el negocio no ve `accepted` ni `driver_assigned`.

**F-06. `getCommerceOrders` carga todos los clientes y no pagina.**  
`server/order-router.ts:745` hace `db.select().from(customers)` sin filtro: trae
la tabla completa de clientes en cada consulta del panel. Luego arma un `Map`
(`:747`). También trae todos los `order_items` del comercio y todos los pedidos
sin `orderBy` ni límite (`:717-735`). Con volumen, es costo y exposición
innecesaria de PII.

**F-07. `ProductModal` conserva datos del producto anterior.**  
El estado se inicializa una sola vez con `useState(initialData...)`
(`ProductModal.tsx:74-83`) y el componente no se desmonta al cerrar (retorna
`null`, pero sigue montado). Al editar otro producto, el formulario puede mostrar
los datos del anterior. No hay `key` ni `useEffect` que sincronice
`initialData`.

**F-08. La sesión del negocio depende de `localStorage` y puede asignar el comercio equivocado.**  
`SessionGuard` exige `qs_session` para roles no-customer
(`SessionGuard.tsx:76-80`); si la cookie es válida pero el localStorage se
limpió, el merchant va a `/login`. Además, `useMerchantCommerceId` hace
`JSON.parse` sin `try/catch` (`useDeliveryData.ts:122-123`) y, si no hay
`commerceId`, busca por nombre y toma `results[0].id` (`:137-163`). Ese fallback
puede vincular la UI a un comercio ajeno con nombre parecido.

**F-09. Login sin rate limit ni bloqueo.**  
`login.login` permite intentos ilimitados de contraseña
(`server/login-router.ts:29-102`). No hay contador por email/IP, backoff ni
bloqueo temporal. Aplica a admin y merchant.

**F-10. Imágenes sin límite real.**  
Logo, portada y foto de producto se convierten a base64 sin validar tamaño ni
tipo (`Profile.tsx:176-190`, `ProductModal.tsx:94-104`). El backend acepta
strings sin límite (`product.create/update`, `commerce.update`) y el body limit
global es 50 MB (`server/boot.ts:41`). Todo termina en columnas `text`
(`db/schema.ts:123-124`, `:156`).

**F-11. Estadísticas con N+1 y datos engañosos.**  
`commerce.getStats` recorre cada `orderId` y hace una consulta individual a
`orders` (`commerce-router.ts:167-189`). El gráfico dice “Últimos 7 días”
(`Stats.tsx:190-193`) pero agrupa todos los pedidos históricos por día de la
semana (`commerce-router.ts:171`, `:191-195`). `topProducts` no devuelve `id`
(`:197-200`), pero `Dashboard.tsx:103-115` espera `tp.id`, `tp.salesCount` y
`tp.revenue`; el ranking del dashboard queda mal vinculado.

**F-12. Pedidos por transferencia invisibles para el comercio.**  
`getCommerceOrders` excluye `pending_payment` (`order-router.ts:735`) y no se
emite `new_order` al crear una transferencia (`:381-386`). El comercio no ve el
pedido hasta que un admin lo pasa a `received`. Si es intencional, debe quedar
documentado; si no, el comercio pierde pedidos.

### P2 — UX, consistencia y rendimiento

**F-13. Ruta desconocida del panel cae en el flujo cliente.**  
`/commerce/foo` coincide con `/commerce/:id` (`App.tsx:98`) antes que con
`NotFound`, y queda bajo guard de cliente.

**F-14. Logout incompleto en el panel.**  
`CommerceLayout.tsx:68-77` y `Profile.tsx:209-214` limpian `merchant_user` y
`qs_session`, pero no limpian la caché de React Query ni emiten
`rapidy:logout`. Los datos del comercio pueden quedar en memoria hasta recargar.

**F-15. La vitrina pública no filtra estado del comercio.**  
`commerce.getById` devuelve el comercio y sus productos sin filtrar
`status`/`isOpen` (`commerce-router.ts:44-60`). El catálogo sí filtra, pero un
cliente con la URL directa puede abrir un comercio suspendido/inactivo.

**F-16. El pedido que recibe el comercio trae más PII de la necesaria.**  
`sanitizeOrder` solo elimina `paymentReceipt` (`order-router.ts:200-206`);
`getCommerceOrders` agrega `deliveryAddress`, `customerPhone`, `customerId` y
todo el pedido (`:749-767`). El comercio necesita teléfono para contactar, pero
no necesariamente la dirección completa ni el historial global.

**F-17. El Dashboard dice “En Vivo” pero no usa SSE.**  
Solo `Orders.tsx` llama `useCommerceEvents`. El Dashboard y `Stats.tsx` dependen
de polling de 30 s (`useDeliveryData.ts:305-313`) o de una carga única. Los
badges “En Vivo” de `Stats.tsx:91-94` no corresponden.

**F-18. Etiquetas de métricas no coinciden con el cálculo.**  
“Pedidos Totales” en Dashboard usa `stats.totalOrders`
(`Dashboard.tsx:229`), pero el backend solo cuenta pedidos `delivered`
(`commerce-router.ts:173-188`). “Catálogo Activo” usa `prods.length`, que incluye
productos pausados (`:207-208`).

**F-19. Hay dos endpoints para lo mismo.**  
`commerce.markReady` y `order.markCommerceReady` implementan la misma operación
con distinto cuerpo. La UI usa el primero; el segundo queda como superficie
duplicada que también hay que endurecer.

**F-20. No hay pruebas E2E del negocio.**  
`scripts/e2e-smoke.mjs` cubre cliente. No hay smoke de login merchant, pedidos,
productos, estadísticas ni perfil. Los cambios del panel no tienen la misma red
de seguridad que el flujo cliente.

## 10. Lo que ya está bien y no hay que romper

- `commerce.update`, `commerce.toggleStatus`, `commerce.getStats`,
  `commerce.markReady`, `order.getCommerceOrders` y el CRUD de productos usan
  `merchantQuery` y verifican propiedad con `assertCommerceOwnership` /
  `merchantOwnsCommerce`.
- El canal SSE `commerce:{commerceId}` valida que el merchant sea dueño.
- `getCommerceOrders` no devuelve `paymentReceipt` (lo elimina `sanitizeOrder`).
- `product.getByCommerce` solo devuelve productos no disponibles al dueño; al
  público le muestra únicamente disponibles.
- `order.updateStatus` valida transiciones con `contracts/orderStatus.ts` y
  deriva el rol desde `ctx`, no desde el cliente.
- El login deriva el rol desde `users.role` y firma cookies HttpOnly.
- `commerce.registerDeviceToken` usa el `merchant.id` del contexto, no un ID
  enviado por el cliente.