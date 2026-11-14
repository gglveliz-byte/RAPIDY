# Flujo Repartidor (Driver) — Rapidy

**Última actualización:** 2026-11-13  
**Rol:** `driver` (repartidor)  
**Alcance:** `/driver`, `/driver/order/:id`, `/driver/earnings`,
`/driver/profile`, `/driver/chat/:orderId`, `/driver/history`, login por
teléfono, cookies, SSE, ganancias e integración con Cliente y Negocio.

> Esta es la documentación vigente del flujo corregido. No es un backlog.
> Los reportes de [`audit/`](./audit/) son históricos.

## Rutas

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/driver` | Pedidos disponibles y estado | `src/pages/driver/DriverHome.tsx` |
| `/driver/order/:id` | Ejecución del pedido | `src/pages/driver/DriverOrder.tsx` |
| `/driver/earnings` | Ganancias | `src/pages/driver/DriverEarnings.tsx` |
| `/driver/profile` | Perfil y sesión | `src/pages/driver/DriverProfile.tsx` |
| `/driver/chat/:orderId` | Chat del pedido | `src/pages/driver/DriverChat.tsx` |
| `/driver/history` | Historial | `src/pages/driver/DriverHistory.tsx` |

El login del driver se hace en `/login` con la pestaña **Celular (Repartidor)**.

## Arquitectura

```text
React 19 + Vite
  └─ SessionGuard role="driver"
      ├─ login.checkAuth contra cookie HttpOnly
      ├─ rehidrata driver_user + qs_session
      └─ redirige a /login solo si la cookie no reconoce al driver

Panel driver
  └─ hooks + tRPC /api/trpc
      └─ Hono + Drizzle
          └─ PostgreSQL

Tiempo real:
  /api/events/driver/:driverId  → driver/admin
  /api/events/orders/:orderId   → cliente, driver, negocio, admin
```

## Sesión

- **Access token:** 24 h, cookie `quickgo_driver_token` HttpOnly.
- **Refresh token:** 30 días, cookie `quickgo_driver_refresh` HttpOnly.
- **Fuente de verdad:** cookie HttpOnly. `driver_user` es caché de UI.
- **sessionVersion:** incluida en access/refresh; se valida contra
  `drivers.session_version`. Cambiar contraseña o hacer logout la incrementa.
- **Login:** limpia cookies admin/merchant antes de emitir la cookie driver.
- **Logout:** `driver.logoutSession` marca `offline`, limpia FCM, incrementa
  `sessionVersion` y borra cookies. Se bloquea si hay un pedido activo.
- **401/logout:** role-scoped. No cierra sesiones customer/merchant ni vacía el
  carrito.

## Disponibilidad

Estados: `online`, `busy`, `offline`.

- El driver solo pasa a `online` por acción explícita.
- Al aceptar un pedido pasa a `busy`.
- Con pedido activo no puede pasar a `online`/`offline`; debe terminarlo.
- El backend rechaza aceptar pedidos si está `offline`.

## Pedidos

### Disponibles

`order.getAvailableForDriver` devuelve solo pedidos `ready_for_pickup` sin
driver. Antes de aceptar **no** entrega dirección, teléfono ni notas del cliente:
solo comercio, dirección del local, total, método de pago, conteos y ganancia
estimada.

### Aceptar

`driver.acceptOrder`:

- bloquea la fila del driver y luego la del pedido;
- exige `ready_for_pickup` y todos los comercios con `order_commerce_status =
  ready_for_pickup`;
- rechaza si el driver está offline o ya tiene un pedido activo;
- asigna `driverId`, pasa a `driver_assigned`, inserta historial y emite a
  `order:{id}` y a cada `commerce:{id}`.

### Retirar

`driver.markCommercePickup`:

- exige que el comercio esté `ready_for_pickup`;
- acumula `pickedUpCommerceIds`;
- solo pasa el pedido global a `picked_up` cuando todos los comercios están
  retirados;
- rechaza pedidos `delivered`, `cancelled` u `on_the_way`.

### Entregar

`order.updateStatus` para driver:

- `picked_up` está prohibido por esta vía; se usa el checklist;
- `on_the_way` solo desde `picked_up`;
- `delivered` solo desde `on_the_way` y con todos los comercios retirados;
- escribe `delivered_at` y crea `driver_earnings` con
  `deliveryFee × commissionRate / 100`, idempotente por
  `(order_id, type)`.

## Ganancias

- `driver_earnings` es la fuente de verdad del monto histórico.
- La tasa del driver se congela al asignar el pedido en
  `orders.driver_commission_rate`; cambiarla después no altera pedidos en curso.
- `driver.getEarnings` devuelve hasta 500 filas ordenadas por creación.
- `/driver/earnings` agrupa y filtra por `createdAt` en
  `America/Guayaquil`.
- Home y detalle muestran la ganancia **neta estimada**, no el delivery fee
  bruto.
- Historial muestra `earningAmount`; cancelados muestran `$0.00`.
- Admin liquida usando el monto acreditado, no la tasa actual.

## Historial

`driver.getOrderHistory`:

- solo `delivered`/`cancelled` del driver autenticado;
- `limit` 50, ordenado por `deliveredAt` (fallback `updatedAt`);
- devuelve `deliveredAt`, `earningAmount`, `cancellationReason` y `cancelledBy`;
- no devuelve `customerPhone`;
- usa el índice `orders(driver_id, status, delivered_at)`.

## Chat

- `chat.getByOrder`, `chat.send` y `chat.markAsRead` usan `participantQuery` y
  `assertOrderAccess`.
- El backend deriva `senderType`, `senderId` y `senderName`.
- Lectura por rol: `read_by_customer`, `read_by_driver`, `read_by_commerce`.
- `markAsRead` solo actualiza el rol lector y emite `chat_read` al pedido.
- Rate limit: 20 mensajes/minuto por remitente.
- El frontend deshabilita envío mientras hay una mutación pendiente.

## SSE y ubicación

- `DriverHome` y `DriverOrder` envían ubicación mientras el driver está online o
  busy, con throttle de 15 s.
- `driver.updateLocation` valida lat/lng y emite:
  - `driver:{id}` `location_update` para el driver/admin;
  - `order:{id}` `driver_location` para el cliente.
- El cliente ya no abre el canal privado del driver; escucha el canal del
  pedido.
- `useDriverEvents` ignora `location_update` para no invalidar catálogo/pedidos
  en cada ping.

## Tema y mapas

- Las 6 rutas usan el tema claro/oscuro global con `ThemeToggle` en el header.
- Marca naranja (`brand`, `brand-strong`, `brand-soft`) en header, botones
  primarios, progreso y bottom nav. Verde queda para éxito/online.
- El mapa usa tiles de OpenStreetMap porque CARTO empezó a exigir API key.
  En tema oscuro los tiles se invierten con `.dark .leaflet-tile`.
- `DriverOrder` llama `invalidateSize()` al montar para evitar mapas en blanco
  cuando el contenedor cambia de tamaño.
- `/driver/order` (sin id) redirige a `/driver`.
- Las queries de merchant (`commerce.me`, `order.getCommerceOrders`) están
  deshabilitadas fuera de `/commerce`; abrir Driver ya no genera 401 cruzados.

## Integración con Cliente y Negocio

| Evento | Cliente | Negocio |
|---|---|---|
| Driver acepta | ve `driver_assigned` | ve `driver_assigned` por SSE |
| Driver retira un comercio | ve `commerce_pickup` | ve `picked_up` de su comercio |
| Driver va en camino | ve `on_the_way` | ve `on_the_way` |
| Driver entrega | ve `delivered`, mapa y estado final | ve `delivered` |
| Ubicación | `driver_location` por `order:{id}` | no aplica |

## Base de datos

| Tabla | Uso |
|---|---|
| `drivers` | cuenta, estado, ubicación, comisión, `sessionVersion`, FCM |
| `orders` | pedido, `driverId`, `driverCommissionRate`, `pickedUpCommerceIds`, `deliveredAt` |
| `order_items` | snapshot y comercio |
| `order_commerce_status` | retiro por comercio |
| `order_status_history` | historial |
| `driver_earnings` | ganancias idempotentes |
| `chat_messages` | mensajes y lectura por rol |

Migraciones: `0008` (negocio), `0009` (driver/chat/sesión), `0010` (admin) y
`0011` (comisión congelada del driver).

## Documentación relacionada

- [`FILE_MAP.md`](./FILE_MAP.md): archivo por archivo.
- [`VERIFICATION.md`](./VERIFICATION.md): comandos y evidencia.
- [`audit/MASTER_TRIAGE.md`](./audit/MASTER_TRIAGE.md): consolidado.
- [`audit/`](./audit/): reportes históricos.
- [`../commerce/README.md`](../commerce/README.md): flujo Negocio.
- [`../customer/README.md`](../customer/README.md): flujo Cliente.

## Alcance cerrado

El flujo actual está corregido y verificado. No agregues funcionalidades nuevas,
cambios de modelo de datos ni refactors grandes sin pedido explícito. Si algo no
está descrito aquí, pregunta antes de asumirlo.