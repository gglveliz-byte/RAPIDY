---
name: Rapidy Admin Flow Guardian
description: Úsala antes de tocar /admin, /admin/commerces, /admin/drivers, /admin/orders, /admin/products, /admin/settings, sesión admin, SSE admin, comisiones, settlement, reportes o moderación. Contiene qué documentación leer y qué reglas no se deben romper.
---

# Rapidy Admin Flow Guardian

Esta skill protege el flujo Administración ya auditado, corregido y verificado.
Su objetivo es que cualquier agente entre en contexto rápido y no reintroduzca
bugs financieros, de sesión, settlement, moderación o reportes.

**Todas las rutas son desde la raíz del repositorio.**

## Cuándo usar esta skill

- Rutas `/admin`, `/admin/commerces`, `/admin/drivers`, `/admin/orders`,
  `/admin/products`, `/admin/settings`.
- Login admin, cookies `quickgo_admin_*`, `users.session_version`, SSE admin.
- Comisiones de comercio o driver, settlement, reportes y exportaciones.
- Asignación/reasignación de repartidores.
- Estados de pedido y validación de transferencias.
- Moderación de comercios y productos.
- Migraciones de `users`, `orders`, `order_commerce_status`, `products`,
  `app_settings`.

## Lectura obligatoria antes de cambiar código

1. `docs/admin/README.md`.
2. `docs/admin/FILE_MAP.md`.
3. `docs/admin/VERIFICATION.md`.
4. `docs/admin/audit/MASTER_TRIAGE.md`.
5. `docs/customer/README.md`, `docs/commerce/README.md`,
   `docs/driver/README.md`.
6. `contracts/orderStatus.ts`.
7. Si toca pedidos: `server/admin/orders-router.ts`,
   `server/order-router.ts`, `server/driver-router.ts`,
   `server/lib/order-access.ts`, `server/lib/order-status-sync.ts`.
8. Si toca dinero: `server/admin/dashboard-router.ts`,
   `server/admin/settings-router.ts`, `db/schema.ts`.
9. Si toca sesión: `server/admin-auth.ts`, `server/merchant-auth.ts`,
   `server/login-router.ts`, `server/context.ts`, `server/boot.ts`,
   `src/components/SessionGuard.tsx`.
10. Si toca UI: `src/pages/admin/`.

## Mapa de documentación

| Documento | Qué es | ¿Fuente de verdad? |
|---|---|---|
| `docs/admin/README.md` | Arquitectura y reglas actuales | Sí |
| `docs/admin/FILE_MAP.md` | Inventario archivo por archivo | Sí |
| `docs/admin/VERIFICATION.md` | Comandos y evidencia | Sí |
| `docs/admin/audit/MASTER_TRIAGE.md` | Consolidado y correcciones | Contexto |
| `docs/admin/audit/<ruta>.md` | Reporte histórico | Contexto; no backlog |
| `docs/customer/*` | Flujo Cliente | Sí para ese flujo |
| `docs/commerce/*` | Flujo Negocio | Sí para ese flujo |
| `docs/driver/*` | Flujo Repartidor | Sí para ese flujo |

## Reglas que NO se deben romper

### Dinero

- La comisión histórica del comercio sale de
  `order_commerce_status.commission_amount`.
- La tasa actual de `commerces.commission_rate` solo aplica a pedidos nuevos o
  como fallback de pedidos legacy sin snapshot.
- La comisión del driver se congela al asignar en
  `orders.driver_commission_rate`; la entrega usa ese valor.
- `driver_earnings` es única por `(order_id, type)` y usa
  `onConflictDoNothing`.
- `delivered_at` es la fecha contable. No usar `created_at` para ventas
  entregadas ni `updated_at` para entregas.
- Las fechas de reportes y series son de calendario `America/Guayaquil`.
- Solo se liquidan pedidos `delivered`.

### Settlement

- `order_commerce_status.settled_at` es el settlement por comercio.
- `orders.commerce_settled` es un agregado: solo verdadero si todos los
  comercios están saldados.
- Liquidar no debe reescribir `orders.updated_at`.

### Pedidos y estados

- Repetir el mismo estado es un no-op idempotente: no reescribir
  `delivered_at`, no duplicar historial, no mover dinero.
- `delivered` y `cancelled` son terminales.
- `picked_up` exige todos los comercios listos y driver asignado.
- `on_the_way` exige `picked_up`.
- `delivered` exige `on_the_way` y checklist completo de retiro.
- No cambiar el driver de un pedido entregado.
- Asignar/reasignar exige driver `online`, sin otro pedido activo y pedido
  `ready_for_pickup`/`driver_assigned`.
- Liberar un driver solo si no tiene otro pedido activo.
- La lista `admin.orders` no devuelve `paymentReceipt`; el detalle sí.

### Sesión

- `users.session_version` debe estar en access/refresh y validarse en contexto,
  login.refresh y SSE.
- Logout admin incrementa la versión y revoca todas sus sesiones.
- SSE admin, driver, merchant y customer valida rol y versión contra DB.
- Login admin limpia cookies driver/merchant; no toca customer.
- Desactivar un comercio revoca la sesión del merchant.
- Login merchant se bloquea si todos sus comercios están `inactive`.
- No volver a validar SSE solo por firma JWT.

### Comercios

- Normalizar email a minúsculas en alta y búsqueda.
- Activar exige dirección real, teléfono válido, coordenadas y merchant.
- Desactivar es lógico: conserva pedidos, productos e historial; pausa
  productos, cierra local y revoca sesión.
- No borrar físicamente comercios.
- Imágenes comprimidas en cliente y límite en servidor.

### Productos

- `products.admin_paused` es la pausa administrativa.
- `product.update` del merchant no puede reactivar un producto pausado por
  admin.
- Eliminar solo si el producto nunca participó en un pedido; si tiene ventas,
  pausar.
- Moderar emite `products:global` y `commerce:{id}`.

### Settings y reportes

- Solo se editan `app_name`, `support_phone`, `delivery_fee`,
  `min_order_amount`, `bank_transfer_info`.
- Fee y mínimo son decimales positivos con hasta 2 decimales.
- Guardar con `admin.updateSettingsBulk` transaccional.
- Registrar `updated_by`.
- `readPricing` debe fallar cerrado ante configuración inválida.
- Reportes sin `paymentReceipt`, con límites y rango máximo de 2 años.
- Comisiones y ventas solo de pedidos `delivered`.
- Una fila de comisión por comercio.
- No usar `drivers.total_earnings`; sumar `driver_earnings`.

### Performance

- `admin.orders` paginado y sin N+1.
- `admin.listProducts` con límite y sin descripción.
- `topProducts` agregado en SQL.
- No materializar comprobantes base64 en listados ni reportes.
- No crear otro `QueryClient`.

## Verificación obligatoria

```bash
npx tsc -b --force
npm test
npm run lint
npm run build
npm run db:generate
node scripts/admin-api-smoke.mjs
node scripts/e2e-admin-smoke.mjs
node scripts/driver-api-smoke.mjs
node scripts/e2e-driver-smoke.mjs
node scripts/e2e-commerce-smoke.mjs
node scripts/admin-smoke.mjs
npx tsx scripts/redirect-smoke.ts
```

- Admin API debe seguir 29/29.
- Admin navegador debe seguir 12/12.
- Driver API 16/16 y navegador 8/8.
- Negocio navegador 20/20.
- `db:generate` debe responder “No schema changes” después de migrar.

## Qué hacer si encuentras una discrepancia

1. Lee el doc y el código actual; no “arregles” de memoria.
2. Si doc y código difieren, gana el código solo después de verificar con tests;
   actualiza el doc en el mismo cambio.
3. Si el hallazgo está en `docs/admin/audit/`, no asumas que es una tarea.
   Revisa `MASTER_TRIAGE.md` y pregunta antes de reabrirlo.
4. Si el cambio afecta una regla de esta skill, actualiza la skill y explica por
   qué en el commit.

## Alcance cerrado

No hay una lista de tareas abiertas en esta skill. El flujo actual está cerrado
y verificado. No implementes funcionalidades nuevas, refactors grandes ni
cambios de modelo de datos sin un pedido explícito del usuario.

Quedan fuera de alcance el reset de contraseña de merchant desde Admin, el
formulario completo de edición de producto en Admin y el historial before/after
de settings.

Si algo no está descrito en `docs/admin/`, pregunta antes de asumirlo.