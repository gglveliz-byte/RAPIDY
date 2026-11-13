# Flujo Negocio (Commerce) — Rapidy

**Última actualización:** 2026-11-13  
**Rol:** `merchant` (comercio / negocio)  
**Alcance:** `/login`, `/commerce`, `/commerce/orders`, `/commerce/products`,
`/commerce/stats`, `/commerce/profile` y su integración con el flujo Cliente.

> Esta es la documentación vigente del flujo corregido. No es un backlog.
> Los reportes de [`audit/`](./audit/) son históricos: registran hallazgos y
> evidencia, no tareas por hacer.

## Rutas del negocio

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/login` | Acceso profesional (admin/merchant/driver) | `src/pages/Login.tsx` |
| `/commerce` | Dashboard del negocio | `src/pages/commerce/Dashboard.tsx` |
| `/commerce/orders` | Monitor de pedidos y cocina | `src/pages/commerce/Orders.tsx` |
| `/commerce/products` | Catálogo | `src/pages/commerce/Products.tsx` |
| `/commerce/stats` | Métricas y comisiones | `src/pages/commerce/Stats.tsx` |
| `/commerce/profile` | Perfil, ubicación y sesión | `src/pages/commerce/Profile.tsx` |

La vitrina pública del cliente vive en **`/store/:id`**. `/commerce/:id` solo
redirige URLs numéricas antiguas; una ruta inválida como `/commerce/foo` ya no
entra al guard de cliente ni expulsa al merchant.

## Arquitectura

```text
React 19 + Vite
  └─ SessionGuard (role="merchant")
      ├─ verifica login.checkAuth contra la cookie HttpOnly
      ├─ rehidrata merchant_user + qs_session desde el backend
      └─ redirige a /login solo si la cookie no reconoce al merchant

Panel
  └─ hooks (useMerchantCommerceId, useCommerceOrders, useCommerceStats...)
      └─ tRPC /api/trpc
          └─ Hono + Drizzle
              └─ PostgreSQL

Tiempo real: SSE /api/events/commerce/:commerceId
Auth: email + contraseña → cookies HttpOnly
```

## Sesión del negocio

- **Access token:** 24 h, cookie `quickgo_merchant_token` HttpOnly.
- **Refresh token:** 7 días, cookie `quickgo_merchant_refresh` HttpOnly.
- **Renovación:** cada 9 minutos mientras haya una sesión profesional activa.
- **Fuente de verdad:** la cookie HttpOnly. `localStorage` es solo caché de UI.
- **Recarga / pestaña nueva:** `SessionGuard` llama `login.checkAuth`, restaura
  `merchant_user` y `qs_session`, y recién después renderiza el panel.
- **Logout:** `login.logout { scope: "merchant" }` limpia solo cookies merchant,
  React Query y `merchant_user`; **no cierra la sesión del cliente** ni vacía su
  carrito.
- **401:** el manejador es role-scoped según la ruta. Un 401 del negocio no
  toca `customer_session` ni `cart`.
- **Push:** al cerrar sesión se ejecuta `commerce.unregisterDeviceToken`.

## Resolución del comercio

`useMerchantCommerceId` consulta siempre `commerce.me` (merchantQuery). No
infiere el comercio por nombre ni confía en un `commerceId` cacheado sin
revalidar. Si el merchant no tiene comercio vinculado, el panel muestra
“Comercio sin asignar” y deshabilita las acciones.

## Estados

`contracts/orderStatus.ts` es la fuente única para cliente y negocio:

```text
pending_payment → payment_rejected
pending_payment → received → accepted → preparing → ready_for_pickup
ready_for_pickup → driver_assigned → picked_up → on_the_way → delivered
cualquier estado activo → cancelled
```

- El cliente usa `orders.status`.
- El negocio usa `getCommerceOrderStatus(global, myCommerceStatus)`.
- `order_commerce_status` guarda el estado de cocina por comercio:
  `pending_payment`, `payment_rejected`, `received`, `accepted`, `preparing`,
  `ready_for_pickup`, `picked_up`, `cancelled`.
- `markReady` es transaccional, bloquea la fila del pedido y solo acepta
  `received`/`accepted`/`preparing`. Nunca revive `cancelled`, `delivered` o
  `payment_rejected`.
- El paso global a `ready_for_pickup` solo ocurre cuando **todos** los comercios
  con items están listos.
- Un pedido multi-comercio no puede ser cancelado completo por un comercio que
  no participa en todos sus items.

## Dinero y comisión

- `order.quote` y `order.create` calculan precios, envío, comisión y total en
  servidor.
- `product.create/update` validan precio decimal positivo, máximo y formato.
- `order_commerce_status.commission_amount` guarda la comisión histórica por
  comercio al crear el pedido.
- `commerce.getStats` suma esa comisión; para pedidos legacy sin snapshot usa la
  tasa actual como fallback.
- “Ventas entregadas” suma `order_items.total` del comercio (sin envío).
- `delivered_at` se escribe al pasar a `delivered`; el gráfico usa una ventana
  real de 7 días en zona `America/Guayaquil`.

## Catálogo e imágenes

- El dueño ve todos sus productos; el público solo disponibles de comercios
  `active`.
- `commerce.getById` devuelve `null` a no-owner si el comercio no está activo.
- La vitrina deshabilita “Agregar” si el comercio está cerrado.
- Logo, portada y foto de producto se comprimen en el navegador antes de
  enviarse; el servidor valida MIME/tamaño y limita a ~1.8 MB de data URL.
- `ProductModal` se resetea al abrir/editar; no reutiliza el producto anterior.

## Tiempo real

- `CommerceLayout` monta `useCommerceEvents` para todo el panel.
- El canal `commerce:{id}` emite `new_order`, `order_status`, `commerce_ready`,
  `products_update` y `commerce_update`.
- El cliente no escucha el canal merchant: usa `products:global` en Home,
  Search y `/store/:id`.
- Polling de 30 s solo como respaldo.

## Autorización

| Superficie | Regla |
|---|---|
| `merchantQuery` | exige cookie merchant válida y rol `merchant` |
| `assertCommerceOwnership` | el comercio debe pertenecer al merchant |
| `order.getCommerceOrders` | solo pedidos con items del comercio |
| `commerce.markReady` | solo su comercio y transición válida |
| `order.updateStatus` merchant | solo `accepted`, `preparing`, `cancelled` |
| `commerce.update` | no acepta `status`, `commissionRate` ni `merchantUserId` |
| SSE commerce | admin o merchant dueño |

## Base de datos

| Tabla | Uso |
|---|---|
| `users` | cuenta merchant, password, rol, FCM |
| `commerces` | local, estado, `isOpen`, comisión, dueño |
| `products` | catálogo, precio, imagen, disponibilidad |
| `orders` | pedido global, totales, pago, entrega |
| `order_items` | snapshot de productos y comercio |
| `order_commerce_status` | estado de cocina y comisión por comercio |
| `order_status_history` | historial global |
| `customers` | nombre/teléfono para contacto |
| `drivers` | repartidor asignado |
| `driver_earnings` | ganancia del driver |
| `chat_messages` | chat del pedido (API; el panel no lo expone) |

Migración vigente: `db/migrations/0008_simple_vance_astro.sql`.

## Documentación relacionada

- [`ROUTES_MAP.md`](./ROUTES_MAP.md): mapa completo de rutas y procedimientos.
- [`FILE_MAP.md`](./FILE_MAP.md): inventario archivo por archivo.
- [`VERIFICATION.md`](./VERIFICATION.md): comandos, E2E y evidencia.
- [`audit/MASTER_TRIAGE.md`](./audit/MASTER_TRIAGE.md): consolidado de la
  auditoría y estado de corrección.
- [`audit/`](./audit/): reportes históricos por ruta.
- [`../customer/README.md`](../customer/README.md): flujo Cliente.

## Alcance cerrado

El flujo actual está corregido y verificado. No agregues funcionalidades nuevas,
cambios de modelo de datos ni refactors grandes sin un pedido explícito. Si algo
no está descrito aquí, pregunta antes de asumir que hay que implementarlo.