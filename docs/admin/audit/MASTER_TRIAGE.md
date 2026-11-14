# Auditoría consolidada de Administración — Rapidy

**Fecha:** 2026-11-13  
**Alcance:** `/admin`, `/admin/commerces`, `/admin/drivers`,
`/admin/orders`, `/admin/products`, `/admin/settings`, sesión admin, SSE,
comisiones históricas, liquidaciones y reportes.

> **Este documento no es un backlog.** Registra la auditoría, las correcciones
> aplicadas y lo que queda explícitamente fuera de alcance. El estado vigente
> está en [`../README.md`](../README.md), [`../FILE_MAP.md`](../FILE_MAP.md) y
> [`../VERIFICATION.md`](../VERIFICATION.md).

## 1. Fuentes

| Ruta | Reporte | Hallazgos |
|---|---|---|
| `/admin` | [`dashboard.md`](./dashboard.md) | 20 (0 P0, 9 P1, 11 P2) |
| `/admin/commerces` | [`commerces.md`](./commerces.md) | 25 (1 P0, 10 P1, 14 P2) |
| `/admin/drivers` | [`drivers.md`](./drivers.md) | 24 (0 P0, 5 P1, 19 P2) |
| `/admin/orders` | [`orders.md`](./orders.md) | 24 (0 P0, 9 P1, 15 P2) |
| `/admin/products` | [`products.md`](./products.md) | 22 (0 P0, 6 P1, 16 P2) |
| `/admin/settings` | [`settings.md`](./settings.md) | 23 (0 P0, 10 P1, 13 P2) |
| **Total** | | **138 (1 P0, 49 P1, 88 P2)** |

## 2. P0 corregido

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-COM-01** | Editar `commissionRate` reescribía retroactivamente la comisión de pedidos entregados en `/admin/orders`, dashboard, reportes y la tarjeta de pedidos del negocio, porque se recalculaba con la tasa actual. | La fuente histórica es `order_commerce_status.commission_amount` con fallback documentado solo para pedidos legacy. Se corrigió en `admin.orders`, `admin.dashboard`, `admin.commerceCommissions`, `admin.earningsByPeriod`, `admin.getReports` y `order.getCommerceOrders`. La tasa actual solo se usa al crear pedidos nuevos o cuando no existe snapshot. |

**Evidencia:** `scripts/admin-api-smoke.mjs` crea un pedido con snapshot de
$1.00, cambia la tasa del comercio y verifica que la comisión histórica no
cambia en admin ni en dashboard.

## 3. P1 corregidos

### Dashboard y pedidos

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-DASH-01** | Comisión histórica con tasa actual. | Snapshot por comercio en dashboard, series, ranking y comisiones. |
| **ADM-DASH-02** | Series por `created_at`, UTC/local mezclado. | Series por `delivered_at` (fallback `created_at`) agrupadas en `America/Guayaquil`. |
| **ADM-DASH-03** | Growth comparaba períodos distintos. | `admin.salesGrowth` calcula ventana actual y anterior de igual longitud; la UI muestra “vs N días anteriores”. |
| **ADM-DASH-04** | `admin.orders` sin límite y 4N+1 consultas. | Paginación `limit/offset`, consultas por lote, proyección explícita y sin `paymentReceipt` en la lista. |
| **ADM-DASH-05** | Settlement por pedido, no por comercio. | `order_commerce_status.settled_at`; la UI liquida cada comercio por separado y el pedido queda pendiente hasta saldar todos. |
| **ADM-DASH-07** | Asignación a driver offline/busy/con otro pedido. | `assignDriver` y `updateOrderStatus` bloquean driver, exigen `online`, validan capacidad y liberan solo si no quedan pedidos activos. |
| **ADM-DASH-08** | Sesión admin sin revocación; SSE admin solo validaba firma. | `users.session_version`, validación en contexto, login, refresh y SSE; logout incrementa la versión. |
| **ADM-DASH-14** | Repetir `delivered` reescribía `delivered_at`, driver y auditoría. | Repetir el mismo estado es no-op idempotente; no se toca `delivered_at`, no se duplica historial y no se cambia el driver. |
| **ADM-ORD-01** | Listado sin límite, N+1 y comprobantes base64. | Listado paginado, consultas por lote y proyección sin comprobante. |
| **ADM-ORD-03** | La lista usaba `["admin.orders"]` y SSE invalidaba otra clave. | La página usa la query tRPC `admin.orders`; SSE y mutaciones invalidan la misma clave. |
| **ADM-ORD-05** | Liquidación con tasa actual y multi-comercio agregado. | Comisión snapshot y settlement por comercio. |
| **ADM-ORD-07** | Saltos de estado y entrega sin checklist. | `picked_up` exige comercios listos; `on_the_way` exige retiro; `delivered` exige `on_the_way` y checklist completo; terminales bloqueados. |
| **ADM-ORD-08** | `assignDriver` sin validar driver/pedido activo. | Locks, estado online, capacidad, estados permitidos y emisión SSE al comercio. |

### Comercios

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-COM-02** | Email merchant sin normalizar. | Alta y búsqueda normalizan a minúsculas; duplicado se detecta con `lower(email)`. |
| **ADM-COM-03** | Alta con dirección/teléfono placeholder y activación sin logística. | Activar exige dirección real, teléfono válido, coordenadas y merchant asignado. |
| **ADM-COM-06** | Desactivar no revocaba acceso del merchant. | Se incrementa `users.session_version`; contexto y refresh lo validan; login se bloquea si todos sus comercios están inactivos. |
| **ADM-COM-07** | Imágenes base64 sin compresión ni límite. | Compresión/redimensión en cliente y límite de tamaño en servidor. |
| **ADM-COM-08** | Error de carga se mostraba como “sin comercios”. | Estado de error con reintento; `alert()` reemplazado por toasts; empty state distingue búsqueda. |
| **ADM-COM-09** | Toggle ambiguo y suspensión accidental. | Confirmación al suspender, iconos coherentes y estados explícitos (Activo/Abierto, Pendiente, Suspendido, Desactivado). |
| **ADM-COM-10** | Validación silenciosa y comisión vacía convertida a 0. | Zod estricto, errores visibles y campos vacíos ya no sobrescriben con cero. |
| **ADM-COM-11** | Refresh admin de 7 días sin revocación. | `sessionVersion` en access/refresh, contexto, login.refresh, SSE y logout. |

**Parcial:** **ADM-COM-04** ahora muestra el email de acceso del merchant, pero
no incluye reset de contraseña desde Admin; requiere un flujo nuevo y quedó
fuera de alcance. **ADM-COM-05** corrige el copy y el estado, pero reactivar un
comercio desactivado no restaura automáticamente todos sus productos; se evita
reabrir productos pausados por moderación.

### Repartidores

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-DRV-01** | Login por últimos 9 dígitos ambiguo. | El fallback rechaza si hay más de una coincidencia. |
| **ADM-DRV-02** | Reasignación sin capacidad ni retiro parcial. | No se reasigna un pedido retirado/terminal; el driver debe estar online y sin otro pedido; locks de driver y pedido. |
| **ADM-DRV-03** | Sesión admin sin revocación. | Misma corrección de `sessionVersion` y validación en SSE. |
| **ADM-DRV-04** | Contraseña corta ignorada, campos vacíos. | Contraseña mínimo 8, teléfono/nombre validados y errores explícitos. |
| **ADM-DRV-05** | Comisión inválida caía a 80%; tasa aplicada a pedidos en curso. | Comisión validada 0–100 y `orders.driver_commission_rate` se congela al asignar; la entrega usa ese snapshot. |

### Productos

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-PROD-01** | Pantalla solo lectura. | Se conectaron pausar/reactivar, destacar y eliminar. La edición completa sigue en el panel del merchant. |
| **ADM-PROD-02** | El merchant revertía la pausa admin. | `products.admin_paused`; `product.update` rechaza reactivar un producto pausado por admin. |
| **ADM-PROD-03** | Moderación sin `products:global`. | Se emite a `products:global` y `commerce:{id}`. |
| **ADM-PROD-04** | Listado ilimitado con base64/descripción. | Límite 200, paginación y proyección sin descripción. |
| **ADM-PROD-05** | `topProducts` escaneaba todo el historial en JS. | Agregación SQL sobre pedidos entregados. |
| **ADM-PROD-06** | Borrar con ventas devolvía 500 por FK. | Se detecta historial y se responde `PRECONDITION_FAILED` con acción sugerida (pausar). |

### Settings y reportes

| ID | Problema | Corrección aplicada |
|---|---|---|
| **ADM-SET-01** | Fee/mínimo sin validación. | Zod por clave, decimal positivo, máximo y 2 decimales; `readPricing` falla cerrado. |
| **ADM-SET-02** | Guardado no atómico en 5 mutaciones. | `updateSettingsBulk` transaccional y un solo evento; la UI usa el bulk. |
| **ADM-SET-03** | Defaults destructivos tras error. | Estado de error con reintento, Guardar deshabilitado sin datos y fallback alineado a `$5.00`. |
| **ADM-SET-04** | Cambios financieros sin actor. | `app_settings.updated_by` registra el admin que guardó. |
| **ADM-SET-05** | Reporte de pedidos materializaba comprobantes. | Proyección explícita, sin `paymentReceipt`/`idempotencyKey`, límite 5.000 filas. |
| **ADM-SET-06** | Reportes por `created_at`/UTC. | Fechas de calendario Guayaquil, rango `[inicio, día siguiente)` y `delivered_at` para entregas/comisiones. |
| **ADM-SET-07** | Comisión multi-comercio atribuida al primero. | Una fila por comercio desde `commission_amount` con fallback legacy. |
| **ADM-SET-08** | Ingresos/comisiones incluían `pending_payment`. | Reportes financieros usan solo `delivered`, igual que Stats. |
| **ADM-SET-09** | Reporte de ganancias ignoraba fechas. | Filtro por `driver_earnings.date` en el rango elegido. |
| **ADM-SET-10** | Reporte de drivers usaba `total_earnings` stale. | Suma real desde `driver_earnings`. |

## 4. P2 de acabado corregidos

- Lista de comercios con email del merchant y orden determinista.
- Badges de comercio distinguen `inactive` de `suspended` y muestran Abierto/Cerrado.
- Imágenes de comercio comprimidas antes de subir.
- Fechas y montos de reportes con formato consistente y números aptos para Excel.
- `Calif.` muestra “Sin calificar” en vez de `4.5` inventado.
- Settings con `inputMode` decimal, labels asociados visualmente, banner `role=status` y botones de exportación deshabilitados mientras generan.
- Copy de banco adaptado a Ecuador (cuenta, titular, RUC).
- `orders.updatedAt` ya no se reescribe al liquidar.
- `admin.orders` no devuelve `paymentReceipt` en la lista.
- SSE de admin, driver, merchant y customer valida rol y `sessionVersion` contra la base.

## 5. Integración Cliente ↔ Negocio ↔ Driver ↔ Admin

| Tramo | Estado |
|---|---|
| Comisión del pedido | Snapshot por comercio; Admin, Negocio y reportes usan la misma fuente. |
| Comisión del driver | Snapshot al asignar; cambios posteriores de tasa no alteran pedidos en curso. |
| Settlement | Por `(order_id, commerce_id)`; el pedido se considera saldado solo si todos sus comercios lo están. |
| Fechas contables | `delivered_at` en `America/Guayaquil` para Stats, dashboard y reportes. |
| Estados terminales | `delivered`/`cancelled` no se reabren; repetir `delivered` es idempotente. |
| Asignación | Solo drivers online, sin otro pedido activo; se emite a `order:`, `driver:` y `commerce:`. |
| Moderación de producto | Admin pausa; merchant no puede revertir; cliente recibe `products:global`. |
| Desactivación de comercio | Bloquea checkout, revoca sesión merchant y conserva historial. |
| Sesión admin | Logout revoca access/refresh vía `sessionVersion`; SSE revalida contra DB. |

## 6. Evidencia

```bash
npx tsc -b --force                  # 0 errores
npm test                            # 9/9
npm run lint                        # 0 errores, 374 warnings históricos
npm run build                       # OK
npm run db:generate                 # No schema changes
npm run db:migrate                  # 0010 y 0011 aplicadas
node scripts/admin-api-smoke.mjs    # 29/29 PASS
node scripts/e2e-admin-smoke.mjs    # 12/12 PASS
node scripts/driver-api-smoke.mjs   # 16/16 PASS
node scripts/e2e-driver-smoke.mjs   # 8/8 PASS
node scripts/e2e-commerce-smoke.mjs # 20/20 PASS
node scripts/admin-smoke.mjs        # admin 200 / anon 401
npx tsx scripts/redirect-smoke.ts   # SESSION SURVIVED: true, 0 errores
```

## 7. Lo que no se debe romper

- `order_commerce_status.commission_amount` es la comisión histórica.
- `orders.driver_commission_rate` es la comisión del driver congelada al asignar.
- `delivered_at` es la fecha contable; no usar `updatedAt`.
- `order_commerce_status.settled_at` es el settlement por comercio.
- Repetir un estado es no-op; los terminales no se reabren.
- `assignDriver` exige driver online, sin otro pedido y pedido listo.
- `products.admin_paused` no puede ser revertido por el merchant.
- `users.session_version` invalida access/refresh de admin y merchant.
- `settings` solo acepta las 5 claves editables y valores validados.
- Los reportes no incluyen comprobantes ni usan la tasa actual para históricos.
- Las migraciones son aditivas: `0010` y `0011`.

## 8. Fuera de alcance / parcial

- Reset de contraseña de merchant desde Admin.
- Formulario completo de edición de producto en Admin (se modera y elimina; editar sigue en Negocio).
- Historial de auditoría con before/after de cada cambio de settings o comercio; solo se registra `updated_by`.
- Reactivación automática de todos los productos al reactivar un comercio desactivado.
- Rediseño visual completo o dark mode del panel Admin.