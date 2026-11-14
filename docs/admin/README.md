# Flujo Administración (Admin) — Rapidy

**Última actualización:** 2026-11-13  
**Rol:** `admin` (administración de plataforma)  
**Alcance:** `/admin`, `/admin/commerces`, `/admin/drivers`,
`/admin/orders`, `/admin/products`, `/admin/settings`, sesión admin, SSE,
comisiones, liquidaciones y reportes.

> Esta es la documentación vigente del flujo corregido. No es un backlog.
> Los reportes de [`audit/`](./audit/) son históricos.

## Rutas

| Ruta | Pantalla | Archivo |
|---|---|---|
| `/admin` | Dashboard, KPIs, series y rankings | `src/pages/admin/Dashboard.tsx` |
| `/admin/commerces` | Comercios y merchants | `src/pages/admin/Commerces.tsx` |
| `/admin/drivers` | Repartidores y comisiones | `src/pages/admin/Drivers.tsx` |
| `/admin/orders` | Pedidos, pagos, asignación y liquidación | `src/pages/admin/Orders.tsx` |
| `/admin/products` | Moderación global de productos | `src/pages/admin/Products.tsx` |
| `/admin/settings` | Configuración y reportes | `src/pages/admin/Settings.tsx` |

El login admin se hace en `/login` con la pestaña **Email (Admin / Comercio)**.

## Arquitectura

```text
React 19 + Vite
  └─ SessionGuard role="admin"
      ├─ login.checkAuth contra cookie HttpOnly
      ├─ rehidrata admin_user + qs_session
      └─ redirige a /login si la cookie no reconoce al admin

Panel admin
  └─ hooks + tRPC /api/trpc
      └─ Hono + Drizzle + PostgreSQL

SSE:
  /api/events/admin-dashboard → solo admin validado contra DB
```

## Sesión

- **Access token:** 15 min, cookie `quickgo_admin_token` HttpOnly.
- **Refresh token:** 7 días, cookie `quickgo_admin_refresh` HttpOnly.
- **sessionVersion:** incluida en access/refresh y validada contra
  `users.session_version`.
- **Logout:** `login.logout { scope: "admin" }` incrementa `sessionVersion` y
  borra cookies. Revoca todas las sesiones del admin, no solo la pestaña actual.
- **SSE:** valida firma, rol y versión contra la base; un token revocado no
  puede abrir el canal.
- **Aislamiento:** login admin limpia cookies driver/merchant; no toca la
  sesión customer.

## Dinero y comisiones

### Comisión del comercio

- Se congela al crear el pedido en
  `order_commerce_status.commission_amount`.
- Admin, Negocio, dashboard, settlement y reportes usan ese snapshot.
- La tasa actual de `commerces.commission_rate` solo aplica a pedidos nuevos o
  como fallback de pedidos legacy sin snapshot.
- Cambiar la tasa **no** reescribe pedidos entregados.

### Comisión del driver

- Se congela al asignar el pedido en `orders.driver_commission_rate`.
- La ganancia se calcula al entregar con ese valor, no con la tasa vigente del
  driver.
- `driver_earnings` es única por `(order_id, type)` y usa `onConflictDoNothing`.

### Settlement

- `order_commerce_status.settled_at` liquida **por comercio**.
- `orders.commerce_settled` es un agregado: verdadero solo si todos los
  comercios del pedido están saldados.
- `orders.driver_settled` liquida al repartidor.
- Liquidar no reescribe `orders.updated_at`.

## Pedidos

- La lista está paginada (`limit` 100, `offset`) y no devuelve
  `paymentReceipt`.
- El detalle sí muestra el comprobante porque es necesario para validar
  transferencias.
- Transiciones:
  - `picked_up` exige todos los comercios listos y un driver asignado.
  - `on_the_way` exige `picked_up`.
  - `delivered` exige `on_the_way` + checklist completo de retiro.
  - `delivered`/`cancelled` son terminales.
  - Repetir el mismo estado es un no-op idempotente.
- Asignar o reasignar exige driver `online`, sin otro pedido activo y pedido
  `ready_for_pickup`/`driver_assigned`.
- Al entregar se libera al driver solo si no tiene otro pedido activo.

## Comercios

- Alta de merchant normaliza email y exige contraseña de 8+ caracteres.
- Activar un comercio exige dirección real, teléfono válido, coordenadas y
  merchant asignado.
- Desactivar es un borrado lógico: conserva pedidos, productos e historial,
  pausa productos, cierra el local y revoca la sesión del merchant.
- El login merchant se bloquea si todos sus comercios están `inactive`.
- Imágenes de logo/portada se comprimen en cliente y tienen límite en servidor.

## Productos

- Admin puede pausar/reactivar, destacar y eliminar.
- `products.admin_paused` impide que el merchant reactive un producto pausado
  por administración.
- Eliminar solo se permite si el producto nunca participó en un pedido; si
  tiene ventas, se debe pausar.
- Toda moderación emite `products:global` y `commerce:{id}`.

## Settings y reportes

- Solo se editan 5 claves: `app_name`, `support_phone`, `delivery_fee`,
  `min_order_amount`, `bank_transfer_info`.
- `delivery_fee` y `min_order_amount` se validan como decimales positivos con
  hasta 2 decimales.
- Guardado atómico con `admin.updateSettingsBulk`; se registra `updated_by`.
- `readPricing` falla cerrado si la configuración es inválida.
- Reportes:
  - fechas de calendario `America/Guayaquil`;
  - entregas/comisiones por `delivered_at`;
  - comisión por comercio desde snapshot;
  - solo pedidos `delivered` para ventas/comisiones;
  - ganancias filtradas por `driver_earnings.date`;
  - sin comprobantes en la exportación;
  - límites de filas y rango máximo de 2 años.

## Integración con Cliente, Negocio y Driver

| Evento admin | Cliente | Negocio | Driver |
|---|---|---|---|
| Aprueba pago | ve `received` | recibe `new_order` | — |
| Asigna driver | ve `driver_assigned` | recibe `order_status` | recibe `order_assigned` |
| Cambia estado | `order:{id}` | `commerce:{id}` | `driver:{id}` |
| Suspende comercio | catálogo se invalida | sesión revocada | no aplica |
| Modera producto | `products:global` | `commerce:{id}` | catálogo |
| Cambia settings | quote se recalcula | precios globales | ganancia nueva |

## Base de datos

| Tabla | Uso |
|---|---|
| `users` | admin/merchant, `session_version` |
| `commerces` | estado, comisión actual, merchant |
| `orders` | estado, driver, `driver_commission_rate`, settlement agregado |
| `order_commerce_status` | comisión snapshot y `settled_at` por comercio |
| `products` | `admin_paused`, disponibilidad, destacado |
| `app_settings` | configuración global y `updated_by` |
| `driver_earnings` | ganancia histórica del driver |

Migraciones Admin: `0010_skinny_rage.sql` y `0011_icy_satana.sql`.

## Documentación relacionada

- [`FILE_MAP.md`](./FILE_MAP.md): archivo por archivo.
- [`VERIFICATION.md`](./VERIFICATION.md): comandos y evidencia.
- [`audit/MASTER_TRIAGE.md`](./audit/MASTER_TRIAGE.md): consolidado.
- [`../customer/README.md`](../customer/README.md): flujo Cliente.
- [`../commerce/README.md`](../commerce/README.md): flujo Negocio.
- [`../driver/README.md`](../driver/README.md): flujo Repartidor.

## Alcance cerrado

El flujo actual está corregido y verificado. No agregues funcionalidades nuevas,
cambios de modelo de datos ni refactors grandes sin pedido explícito. Quedan
fuera de alcance el reset de contraseña de merchant desde Admin, el formulario
completo de edición de producto en Admin y el historial before/after de
settings. Si algo no está descrito aquí, pregunta antes de asumirlo.