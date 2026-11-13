# Auditoría `/driver/earnings` — Repartidor

**Fecha:** 2026-11-13  
**Tipo:** auditoría de solo lectura + documentación. No se modificó código, no se ejecutaron migraciones y no se reinició el servidor de `localhost:3000`.  
**Resultado:** 0 P0, 4 P1, 12 P2. La autorización del endpoint es correcta; los riesgos principales están en fechas, transparencia del monto, reversión de entregas y liquidación del admin.

## 1. Alcance y archivos

Se auditó la ruta `/driver/earnings` de extremo a extremo, incluyendo la pantalla, la sesión del repartidor, el procedimiento tRPC, la tabla `driver_earnings`, la creación de ganancias al entregar y la lectura que hace el admin.

| Capa | Archivo | Uso |
|---|---|---|
| Página | `src/pages/driver/DriverEarnings.tsx` | Resumen, tabs de período, estadísticas e historial |
| Contexto driver | `src/pages/driver/DriverHome.tsx`, `DriverOrder.tsx`, `DriverHistory.tsx` | Promesa de ganancia, entrega e historial del repartidor |
| Sesión | `src/components/SessionGuard.tsx`, `src/hooks/useSessionSync.ts` | Rehidratación de `driver_user` desde cookie |
| Hooks | `src/hooks/useDeliveryData.ts`, `src/hooks/useOrderEvents.ts` | `useDriverEarnings` (no usado por la página), SSE del driver |
| tRPC | `server/driver-router.ts` | `getEarnings`, `getProfile`, `getOrderHistory` |
| Entrega | `server/order-router.ts` | `order.updateStatus` con rol driver |
| Admin | `server/admin/orders-router.ts`, `server/admin/drivers-router.ts`, `server/admin/dashboard-router.ts`, `server/admin/settings-router.ts` | Entrega forzada, reasignación, liquidación y reportes |
| DB | `db/schema.ts`, `db/migrations/0007_dashing_mesmero.sql` | `driver_earnings`, `orders.deliveredAt`, `orders.driverSettled`, unique index |
| Contrato | `contracts/orderStatus.ts` | Transiciones permitidas para `driver` |
| Docs leídos | `docs/commerce/README.md`, `docs/commerce/VERIFICATION.md`, `docs/commerce/audit/MASTER_TRIAGE.md`, `docs/customer/order.md` | Contexto obligatorio y reglas del proyecto |

Fuera de alcance: proponer funcionalidades nuevas, cambiar el modelo de datos o tocar el flujo de negocio. Las correcciones propuestas se limitan a hacer consistente lo que ya existe.

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/driver/earnings
  └─ SessionGuard role="driver"
       └─ login.checkAuth contra cookie HttpOnly
       └─ setRoleUser("driver", user) → localStorage.driver_user
  └─ DriverEarnings
       └─ useEffect lee localStorage.driver_user.id
       └─ trpc.driver.getEarnings({ id: driver_user.id })
            └─ driverQuery (cookie) + ctx.driver.id === input.id
            └─ SELECT * FROM driver_earnings WHERE driver_id = ?
                 (sin ORDER BY, sin LIMIT, sin join a orders)
       └─ React Query
            └─ dailyHistory: agrupa por e.date
            └─ getPeriodEarnings / periodDeliveries: filtran en cliente
            └─ render: total del período, 3 stats e historial
```

Puntos observados:

- La página usa `trpc.driver.getEarnings.useQuery` directamente (`DriverEarnings.tsx:23-26`), no el hook `useDriverEarnings` (`useDeliveryData.ts:658-665`). Hay dos claves de caché para el mismo dato.
- El `driverId` sale de `localStorage.driver_user` (`DriverEarnings.tsx:11-21`). `SessionGuard` rehidrata esa clave antes de renderizar (`SessionGuard.tsx:100-114`), pero el endpoint vuelve a verificar contra la cookie (`driver-router.ts:138-140`), por lo que no hay IDOR.
- El servidor devuelve todas las filas de ganancias del driver, sin paginar ni ordenar (`driver-router.ts:142`). Toda la agregación ocurre en el navegador.

### Escritura de la ganancia al entregar

```text
DriverOrder "Completar entrega"
  └─ order.updateStatus({ status: "delivered" })       [rol driver]
       └─ assertOrderAccess: el pedido debe estar asignado al driver
       └─ canTransition: picked_up|on_the_way → delivered
       └─ transacción:
            └─ ¿existe delivery_fee para este pedido?
            └─ amount = order.deliveryFee × driver.commissionRate / 100
            └─ date = new Date().toISOString().split("T")[0]   ← UTC
            └─ INSERT ... ON CONFLICT DO NOTHING
            └─ orders.status = "delivered", delivered_at = now()
            └─ order_status_history + driver.status = online

Admin "updateOrderStatus" con status delivered
  └─ bloquea la fila del pedido (FOR UPDATE)
  └─ orders.status = delivered, delivered_at = now()
  └─ busca CUALQUIER earning del pedido (sin filtrar type)
  └─ si no hay, INSERT (sin ON CONFLICT DO NOTHING)
```

La creación de la ganancia está correctamente condicionada a `delivered` y a que exista un driver asignado (`order-router.ts:777-808`, `admin/orders-router.ts:256-280`). El unique `(order_id, type)` existe (`db/schema.ts:290`; migración `0007_dashing_mesmero.sql:46-47`).

## 3. Hallazgos

| ID | Severidad | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| DRV-EARN-01 | P1 | Fechas / timezone | `src/pages/driver/DriverEarnings.tsx:47`, `:49`, `:52-54`, `:57`, `:162`; `server/order-router.ts:797`; `server/admin/orders-router.ts:277` | `driver_earnings.date` se escribe como fecha UTC (`toISOString().split("T")[0]`), pero la UI la parsea con `new Date("YYYY-MM-DD")`, que JS interpreta como medianoche UTC. En `America/Guayaquil` (UTC-5) cae el día anterior a las 19:00. Por eso el historial muestra un día menos y los filtros Hoy/Semana/Mes se corren. La semana además empieza en domingo (`getDay()`) y conserva la hora actual (`setDate`), no las 00:00. | El total “Hoy” queda en $0 durante el día (solo suma entregas después de las 19:00); el historial muestra la fecha anterior; los totales semanales/mensuales fallan en los bordes; el promedio y el conteo del período también. `DriverHome` compara el string UTC (`DriverHome.tsx:109-114`) y discrepa de esta página. | Parsear la fecha como calendario local (`date + "T00:00:00"`), normalizar los límites con `setHours(0,0,0,0)` y decidir el inicio de semana. Al escribir, usar `Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" })` como ya hace `commerce-router.ts:31-38`. A medio plazo, derivar el período de `orders.deliveredAt` (timestamptz). Añadir tests con 10:00 y 20:00 locales. |
| DRV-EARN-02 | P1 | Dinero / UX | `src/pages/driver/DriverHome.tsx:200`, `:218-219`; `src/pages/driver/DriverOrder.tsx:479`; `src/pages/driver/DriverHistory.tsx:70`; `server/order-router.ts:795-796` | Las pantallas del repartidor muestran el `deliveryFee` completo como “ganancia”, pero el backend acredita `deliveryFee × commissionRate / 100` (75 % por defecto). `/driver/earnings` muestra el neto sin explicar la comisión. | El driver ve $2.50 en la oferta, la entrega y el historial, pero $1.88 en ganancias. Parece un cobro incompleto; genera desconfianza y reclamos. | Centralizar un helper `driverEarningAmount(fee, rate)` y usarlo en todas las pantallas. Devolver en la orden el monto del driver y/o mostrar el desglose fee, comisión y neto. No rotular el fee completo como ganancia. |
| DRV-EARN-03 | P2 | Errores / UX | `src/pages/driver/DriverEarnings.tsx:23-26`, `:83-89`, `:104-108`, `:173-177`; `src/providers/trpc.tsx:48-54`; `server/driver-router.ts:138-140` | Solo se consumen `data` e `isLoading`; no hay `isError`, `error` ni `refetch`. El `retry` global devuelve `false` para todos los errores. Un 403, 500 o fallo de red deja `earnings` en `undefined` e `isLoading` en `false`, y la pantalla renderiza `$0.00` + “Sin historial”. El endpoint lanza `Error` genérico (500) en vez de `TRPCError FORBIDDEN`; el primer render con `driverId=null` también muestra ceros. | El repartidor cree que perdió sus ganancias; no hay reintento ni mensaje; soporte recibe casos evitables. | Distinguir `isPending`, `isError` y éxito; mostrar una tarjeta de error con “Reintentar” y no pintar montos hasta tener éxito; usar `TRPCError` con `FORBIDDEN`; esperar a que `driverId` exista antes de renderizar el resumen. |
| DRV-EARN-04 | P1 | Integridad / liquidación | `server/admin/orders-router.ts:218-232`, `:256-285`; `server/admin/dashboard-router.ts:298-313`; `server/admin/drivers-router.ts:203-210`, `:242-245` | `admin.updateOrderStatus` no usa `canTransition`; permite marcar `delivered` desde `cancelled` o cancelar un pedido ya entregado. Al cancelar solo libera al driver: no borra ni revierte `driver_earnings` y no limpia `deliveredAt`. Los reportes admin suman `orders.deliveryFee` solo de `delivered`, pero suman todos los earnings; `driverEarningsBreakdown` calcula `adminCommission = totalFee - driverFee`. | Tras `delivered → cancelled`, el driver conserva la ganancia pero el fee desaparece de los totales del admin: la “comisión del admin” puede quedar negativa y la liquidación no cuadra. Stats del comercio excluye el pedido por status, pero earnings no. | Definir una política explícita: revertir el earning o marcarlo como reversado/ajustado en la misma transacción; excluir reversados de los totales; validar transiciones o exigir un `force` explícito; probar `delivered → cancelled → delivered`. |
| DRV-EARN-05 | P1 | Liquidación / admin | `server/admin/orders-router.ts:54-58`, `:90-94`, `:113-124`; `server/order-router.ts:795-796`; `server/driver-router.ts:142` | El importe de liquidación por pedido del admin se recalcula con la tasa **actual** del driver (`drivers.commissionRate`), no con la tasa usada al entregar. El monto histórico real es `driver_earnings.amount`. | Si al driver se le cambia la tasa después de una entrega, el admin ve “Pagar/Cobrar” un importe distinto del que muestra `/driver/earnings`; se paga o cobra mal y se pierde la trazabilidad. | Usar `SUM(driver_earnings.amount)` por pedido/driver como fuente de liquidación, o guardar un snapshot de la tasa en el pedido/earning. No recalcular el histórico con la tasa actual. |
| DRV-EARN-06 | P2 | Validación de dinero | `server/admin/drivers-router.ts:33`, `:54`, `:79`, `:84`; `src/pages/admin/Drivers.tsx:57`, `:335-336`; `server/order-router.ts:795-796` | `commissionRate` es un string libre en `createDriver`/`updateDriver`; el servidor no valida rango ni decimal. La UI declara `min=0 max=100`, pero el payload puede enviar negativos, valores >100 o texto; además el fallback de la UI es 80 y el schema/servidor usan 75. El valor se usa directo para calcular earnings. | Ganancias negativas o superiores al fee, persistidas en el histórico; nómina y reportes contaminados. Requiere rol admin, pero no hay defensa server-side. | Zod decimal 0–100 (o la política que se defina), default único 75, validación/check en DB y alineación de la UI. Añadir tests de valores límite. |
| DRV-EARN-07 | P2 | Idempotencia | `server/admin/orders-router.ts:262-278`; `db/schema.ts:290`; `server/order-router.ts:778-807` | El path admin busca earnings por `orderId` **sin filtrar `type`** y, si no hay, inserta sin `.onConflictDoNothing()`. El path driver busca por `orderId` + `type="delivery_fee"` y sí usa `.onConflictDoNothing()`. El unique `(order_id, type)` evita el doble pago, pero una fila `tip`/`bonus` preexistente haría que se omita el fee; re-marcar `delivered` reescribe `deliveredAt` y duplica historial. El lock `FOR UPDATE` del admin serializa dos admin concurrentes, pero el path no es idempotente a nivel de constraint. | Fee faltante si se añaden propinas/bonos; `deliveredAt` se mueve y afecta la ventana de Stats; un fallo de earnings revierte la entrega completa del admin. | Extraer un único helper de acreditación: filtrar `type`, `.onConflictDoNothing()`, escribir `deliveredAt` solo en la primera entrega y evitar historial duplicado. Probar doble clic y dos writers. |
| DRV-EARN-08 | P2 | Reasignación / doble entrega | `server/admin/orders-router.ts:344-351`; `db/schema.ts:290`; `server/order-router.ts:778-787` | `assignDriver` no valida que el pedido sea terminal: puede reasignar un pedido ya `delivered` y lo pasa a `driver_assigned`. El earning existente queda con el driver anterior; el nuevo no puede crear otro por el unique `(order_id, type)`. | Si el nuevo driver vuelve a entregar, no cobra; el anterior conserva el pago. Historial y liquidación confusos. | Bloquear la reasignación de pedidos `delivered`/`cancelled`, o revertir/transferir el earning atómicamente con auditoría. Validar el estado antes de actualizar. |
| DRV-EARN-09 | P2 | Performance | `server/driver-router.ts:142`; `src/pages/driver/DriverEarnings.tsx:28-41`, `:158` | `getEarnings` hace `SELECT *` sin `ORDER BY` ni `LIMIT`. La UI agrupa con `acc.find` (O(n²)) y muestra el historial en el orden que devuelva la DB. Solo existe índice por `driver_id`, no `(driver_id, date)`. | Orden impredecible; el historial puede salir del más antiguo al más nuevo; payload y tiempo de render crecen sin techo para drivers con años de historial. | `ORDER BY date DESC, created_at DESC`, paginación o límite, agregación diaria en servidor e índice `(driver_id, date)`. El historial debe ser newest-first. |
| DRV-EARN-10 | P2 | Datos / tipos | `src/pages/driver/DriverEarnings.tsx:33-37`, `:68-78`, `:80`; `db/schema.ts:49`; `server/order-router.ts:799`; `server/admin/orders-router.ts:273` | Cada fila de `driver_earnings` incrementa “entregas”, sin filtrar `type`. El enum admite `tip` y `bonus`, y el reporte admin los etiqueta, pero no existe ningún flujo que los cree. Si se inserta un bono o propina, el conteo de entregas y el promedio se inflan; la UI los suma al total sin desglose. | Métricas de entregas y promedio incorrectas en cuanto existan tip/bonus; el driver no puede distinguir propina/bono de flete. Es un riesgo latente: hoy solo se insertan `delivery_fee`. | Contar solo `type === "delivery_fee"`; sumar `tip`/`bonus` aparte y mostrarlos si se implementan. Confirmar el alcance de propinas/bonos antes de prometerlos en la UI. |
| DRV-EARN-11 | P2 | Liquidaciones | `server/driver-router.ts:142`; `db/schema.ts:195`; `server/admin/orders-router.ts:147-159`; `src/pages/driver/DriverEarnings.tsx:154-179` | `getEarnings` devuelve solo `driver_earnings`; no une `orders.driverSettled`. El admin marca “Saldado/Pendiente” por pedido, pero el driver no ve ese estado ni un total pendiente/liquidado. No hay `settledAt` ni lote; el toggle es un booleano sin historial. | El driver no puede conciliar qué le pagaron; el “total” mezcla liquidado y pendiente; reclamos y diferencias con el admin. | Unir `orders` y devolver `driverSettled` (y fecha/lote si existe); mostrar pendiente vs liquidado y el detalle por pedido usando el `orderId` que ya se devuelve. |
| DRV-EARN-12 | P2 | Total histórico | `src/pages/driver/DriverEarnings.tsx:80`, `:104-108`; `src/pages/driver/DriverProfile.tsx:45`, `:148`; `server/driver-router.ts:29-39`, `:52-61`; `db/schema.ts:102`; `server/admin/settings-router.ts:223`, `:236` | La página no muestra un total histórico de dinero; “Ganancias acumuladas” etiqueta el total del período y “Entregas” usa `earnings.length` (histórico). El perfil muestra `drivers.total_earnings`, columna que no se actualiza en el código (default 0.00), aunque `getProfile` calcula el total real y no se usa. El export admin “drivers” también usa la columna stale. No se verificaron triggers externos: no hay escrituras en el repo. | Total histórico ausente o $0.00; el admin y el driver no ven lo mismo; el CSV de repartidores informa ganancias en cero. | Calcular el total con `SUM(driver_earnings.amount)` en una sola fuente y usarlo en earnings, perfil y export; eliminar la columna o mantenerla con trigger/actualización atómica; etiquetar período vs histórico. |
| DRV-EARN-13 | P2 | Copy / formato | `src/pages/driver/DriverEarnings.tsx:104-108`, `:120-127`, `:137-148`, `:154-170` | “Ganancias acumuladas” está bajo el total del período; “Entregas” es histórico y “Entregas (período)” es del período; “Promedio” no dice por entrega; el historial no respeta el tab seleccionado; el dinero usa `$` + `toFixed` sin separador de miles; la fecha usa `es-ES` y no muestra año en un historial que puede ser multianual. | El usuario interpreta mal qué cifra es período y cuál es total; montos largos difíciles de leer; fechas antiguas ambiguas. | Copy explícito (“Total del período”, “Total histórico”, “Promedio por entrega”); `Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })`; `es-EC`; año en historial o filtro por período. |
| DRV-EARN-14 | P2 | Visual / a11y | `src/pages/driver/DriverEarnings.tsx:95`, `:116-128`, `:134-150`, `:92`, `:103`, `:156`; `tailwind.config.js:3`; `src/index.css:57` | Los tabs usan `py-2` (~36 px) y no tienen `aria-pressed`/`role=tab`; el botón atrás es solo icono sin `aria-label`; el grid fijo de 3 columnas en 320 px tiene labels largos; no hay clases `dark:` aunque el tema global puede persistir en dark; no hay toggle de tema en el flujo driver. | Targets menores a 44 px, lector de pantalla sin contexto, posible wrap/corte en móviles pequeños, página clara sobre shell oscuro. | `min-h-[44px]` y ARIA en tabs/back; grid responsive (1/2/3 columnas); tokens `dark:` o forzar modo claro documentado; revisar 320 px. |
| DRV-EARN-15 | P2 | Caché / SSE | `src/pages/driver/DriverOrder.tsx:66-68`; `src/hooks/useOrderEvents.ts:186-194`; `src/providers/trpc.tsx:44`; `src/pages/driver/DriverEarnings.tsx:23`; `src/hooks/useDeliveryData.ts:658-665` | Al entregar solo se invalida `order.getById`; `useDriverEvents` invalida disponibles e historial, no earnings. `staleTime` es 30 s y `refetchOnWindowFocus` es `false`. La página usa la query tRPC directa, mientras `useDriverEarnings` usa otra clave (`["driver.getEarnings", id]`), así que invalidar la hook no refresca la página. | La nueva ganancia no aparece de inmediato; dos cachés para el mismo dato; una pestaña abierta puede quedar desactualizada. | Invalidar `driver.getEarnings` al pasar a `delivered` y en el SSE del driver; unificar en un solo hook/clave; invalidar también `getProfile`/historial. |
| DRV-EARN-16 | P2 | Retención de datos | `db/schema.ts:283`; `server/admin/drivers-router.ts:147-151` | El FK de `driver_earnings.driver_id` es `ON DELETE CASCADE`; al borrar un driver se elimina todo su historial de ganancias. El comentario del router dice que “sus ganancias históricas se conservan”, pero el schema lo contradice. Además se pone `orders.driver_id = null` en **todos** los pedidos del driver (`drivers-router.ts:148`), no solo en completados/cancelados; el guard de pedidos activos solo cubre `driver_assigned`, `picked_up` y `on_the_way`. | Pérdida de evidencia y de totales históricos; los reportes del admin cambian; no se puede auditar una liquidación pasada; un pedido en `ready_for_pickup` asignado puede quedar sin driver. | Soft-delete del driver o `ON DELETE RESTRICT`/tabla de archivo; no borrar earnings; alinear comentario y pruebas de retención. |

### Nota sobre `onConflictDoNothing()`

El path del driver sí es idempotente en dinero: verifica `orderId + type="delivery_fee"` y usa `.onConflictDoNothing()` (`order-router.ts:778-807`). El path admin no lo usa (`admin/orders-router.ts:262-278`) y su verificación no filtra `type`. El índice único `(order_id, type)` (`db/schema.ts:290`) impide el doble pago, pero no impide los otros efectos: fee omitido si existe un tip/bonus, `deliveredAt` reescrito y una eventual violación de constraint que revierte la entrega completa del admin.

## 4. Integración con Cliente y Negocio

| Superficie | Verificación | Resultado |
|---|---|---|
| Cliente | `order.updateStatus` con `delivered` actualiza `orders.status`, `delivered_at` y `order_status_history`; el cliente recibe `status_update` por SSE (`order-router.ts:823-850`). | Correcto. La ganancia se inserta en la misma transacción, pero no altera el total ni los ítems del pedido. El cliente ve “Entregado”. |
| Negocio | `syncAllCommerceStatuses` ignora los estados de reparto (`order-status-sync.ts:9-17`); `order_commerce_status` conserva `picked_up`/`ready_for_pickup`. `commerce.getStats` filtra `orders.status = "delivered"` y usa `deliveredAt` (`commerce-router.ts:287-292`, `:350-365`). | Correcto: la entrega no cambia las ventas ni la comisión del comercio. `deliveredAt` se escribe en ambos paths (`order-router.ts:823`, `admin/orders-router.ts:229`). |
| Admin — resumen | `driverPerformance` suma `driver_earnings` (`drivers-router.ts:174-188`); el Dashboard muestra `driverEarningsBreakdown` con el total de earnings (`Dashboard.tsx:424-470`). | El total agregado coincide con `/driver/earnings` en el caso normal. |
| Admin — liquidación por pedido | `admin.orders` recalcula `driverCut` con la tasa actual (`orders-router.ts:54-58`, `:90-94`). | **No coincide** si la tasa cambió después de entregar (DRV-EARN-05). El admin debe usar el monto del earning, no la tasa actual. |
| Admin — cancelación/reversión | `admin.updateOrderStatus` permite cancelar un `delivered` sin revertir el earning (`orders-router.ts:225-285`). | **Riesgo P1:** el driver conserva la ganancia; el fee desaparece de los totales de pedidos entregados; `adminDeliveryEarnings` y `driverEarningsBreakdown` descuadran (DRV-EARN-04). |
| Admin — export | El reporte “drivers” usa `drivers.total_earnings` (`settings-router.ts:223`, `:236`), columna sin escrituras en el repo. | **No coincide:** el CSV puede mostrar 0.00 aunque el driver tenga ganancias (DRV-EARN-12). |
| Multi-comercio | Un pedido genera un único earning `(order_id, delivery_fee)`; no hay una fila por comercio. | Correcto: el fee de entrega es único por pedido; el unique evita duplicados por reintento. |
| Cancelación normal | Cliente solo puede cancelar `pending_payment`/`received`/`accepted` (`contracts/orderStatus.ts:259-262`); comercio no puede cancelar `picked_up`/`on_the_way` (`order-router.ts:292-298`). | Correcto: esas cancelaciones no crean earnings. La única vía que puede cancelar un `delivered` es el admin (DRV-EARN-04). |
| Doble entrega | `order.updateStatus` retorna temprano si el estado ya es `delivered` (`order-router.ts:750-752`); el unique `(order_id, type)` y `.onConflictDoNothing()` impiden el doble pago en el path driver. | Correcto en dinero para el driver. El admin no es idempotente a nivel de constraint (DRV-EARN-07) y la reasignación post-entrega deja al nuevo driver sin pago (DRV-EARN-08). |
| Pedido sin driver | Si `assignedDriverId` es nulo, no se inserta earning (`order-router.ts:777-789`, `admin/orders-router.ts:257-267`). | Coherente: sin driver no hay a quién pagar. No hay backfill automático si el driver se asigna después de marcar `delivered`; el admin tendría que volver a marcar `delivered`. |
| PII / autorización | `driver.getEarnings` usa `driverQuery` y compara `ctx.driver.id` con el `id` recibido (`driver-router.ts:135-142`); el SSE del driver valida el id (`boot.ts:238-246`). | Correcto: no se encontró IDOR ni exposición de PII en esta ruta. El único defecto es que el rechazo se lanza como 500 en vez de 403. |
| Stats del comercio | `commerce.getStats` usa `order_items.total`, `orders.status = delivered` y `deliveredAt`; no toca `driver_earnings`. | Correcto: la creación de ganancias no rompe las Stats. La cancelación admin post-entrega sí excluye el pedido de Stats mientras el earning permanece (DRV-EARN-04). |

## 5. Lo que funciona y no se debe romper

- **Autorización real, no solo de UI:** `driver.getEarnings` exige `driverQuery` y compara `ctx.driver.id !== input.id` (`driver-router.ts:135-142`). No se puede leer otro driver cambiando `localStorage` o el payload; el servidor responde con error. No se encontró IDOR.
- **El `driverId` del cliente no manda:** `driver.acceptOrder` asigna `ctx.driver.id` e ignora el `driverId` opcional del input; `markCommercePickup` y `order.updateStatus` con rol driver usan `ctx.driver.id` y rechazan pedidos de otro driver (`driver-router.ts:219-223`, `:284-298`; `order-router.ts:769-773`).
- **La ganancia se crea solo al entregar:** ambos paths exigen `status === "delivered"` y un driver asignado (`order-router.ts:777-808`; `admin/orders-router.ts:256-280`). Las cancelaciones normales no insertan earnings.
- **Unique e idempotencia del path driver:** `driver_earnings_order_type_idx` sobre `(order_id, type)` (`db/schema.ts:290`; migración `0007_dashing_mesmero.sql:47`) y `.onConflictDoNothing()` (`order-router.ts:807`) impiden el doble pago por reintento.
- **Cálculo server-side:** el monto sale de `deliveryFee × commissionRate / 100` en el servidor; el cliente no puede enviar montos. El `deliveryFee` viene del quote del pedido, no de la UI del driver.
- **`delivered_at` y estados:** el driver escribe `deliveredAt` y el historial (`order-router.ts:819-840`); el admin también (`admin/orders-router.ts:225-249`). El cliente y el comercio reciben el evento SSE correspondiente.
- **Contrato de estados:** `canTransition` limita al driver a `picked_up`/`on_the_way` → `delivered` (`contracts/orderStatus.ts:228-247`). No se puede saltar desde `preparing` en el path normal.
- **Sin PII en earnings:** la respuesta de `getEarnings` contiene `driverId`, `orderId`, `amount`, `type`, `date` y `createdAt`; no incluye cliente, teléfono, dirección ni comprobante.
- **SSE autenticado:** el canal `driver:{id}` solo lo abre el driver dueño o un admin (`boot.ts:238-246`).
- **Migración de deduplicación:** la 0007 eliminó duplicados previos y creó el unique (`0007_dashing_mesmero.sql:46-47`); no hay que revertirla.

No se debe romper: la verificación `ctx.driver.id`, el unique `(order_id, type)`, el `.onConflictDoNothing()` del path driver, la creación condicionada a `delivered`, la escritura de `deliveredAt`, el contrato de transiciones y la separación entre `order_items` (ventas del comercio) y `driver_earnings` (pago del driver).

## 6. Evidencia y verificación

**Método:** revisión estática de código y documentación. No se ejecutó la aplicación, no se hicieron llamadas autenticadas, no se consultó la base de datos, no se ejecutaron migraciones ni tests, y no se reinició `localhost:3000`. El servidor del usuario quedó intacto.

Evidencia principal:

| Verificación | Evidencia |
|---|---|
| Unique de earnings | `db/schema.ts:290` y `db/migrations/0007_dashing_mesmero.sql:46-47` |
| Path driver usa `onConflictDoNothing` | `server/order-router.ts:778-807` |
| Path admin no usa `onConflictDoNothing` ni filtra `type` | `server/admin/orders-router.ts:262-278` |
| Fecha UTC al escribir | `server/order-router.ts:797`; `server/admin/orders-router.ts:277` |
| Fecha parseada como UTC en la UI | `src/pages/driver/DriverEarnings.tsx:47`, `:162` |
| Fórmula del monto | `server/order-router.ts:795-796`; `server/admin/orders-router.ts:269-271` |
| Nombre “Ganancia” con fee completo | `src/pages/driver/DriverHome.tsx:200`, `:218-219`; `DriverOrder.tsx:479`; `DriverHistory.tsx:70` |
| `getEarnings` sin orden/límite | `server/driver-router.ts:142` |
| Liquidación admin con tasa actual | `server/admin/orders-router.ts:54-58`, `:90-94` |
| Cancelación admin sin revertir earning | `server/admin/orders-router.ts:256-285` |
| Columna `total_earnings` sin escrituras | `db/schema.ts:102`; únicas lecturas en `driver-router.ts:29-39`, `settings-router.ts:223` |
| Cascade de earnings al borrar driver | `db/schema.ts:283`; `server/admin/drivers-router.ts:147-151` |
| SSE del driver autorizado | `server/boot.ts:238-246` |

**Prueba de la fecha (Node, misma zona UTC-5 que `America/Guayaquil`):**

```text
TZ= America/Bogota offset= 300
parse 2026-11-13 => Thu Nov 12 2026 19:00:00 GMT-0500
toDateString => Thu Nov 12 2026
```

Esto confirma que `new Date("2026-11-13")` no representa el 13 de noviembre local: cae el 12 a las 19:00. Es la causa directa de DRV-EARN-01.

**Búsquedas realizadas:**

- `driverEarnings`/`driver_earnings`: solo dos writers de inserción (`order-router.ts:799`, `admin/orders-router.ts:273`). No hay más caminos que creen ganancias.
- `type: "tip"`/`"bonus"`: solo aparecen en el enum (`schema.ts:49`) y en el reporte admin (`settings-router.ts:266`); no hay flujo que los cree.
- `driverSettled`: solo se togglea en admin (`admin/orders-router.ts:147-159`) y se muestra en `admin/Orders.tsx`; no se lee en `driver.getEarnings`.
- Tests: no hay archivos de test de earnings; solo existen `contracts/orderStatus.test.ts` y `server/lib/otp.test.ts`. No hay seed de `driver_earnings` (`db/seed.ts:54` solo limpia).
- No se verificaron triggers de base de datos ni datos reales de producción; si existe un trigger que actualice `drivers.total_earnings`, DRV-EARN-12 debe revalidarse. En el repositorio no hay ninguna escritura a esa columna.

**Limitaciones:** no se pudo verificar visualmente en navegador, ni el comportamiento exacto en 320 px, ni el tema oscuro, ni una entrega real con datos. Las conclusiones de UI son estáticas; las de dinero se basan en el código y en el contrato de la DB.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Archivo:línea | Riesgo para el consolidado |
|---|---|---|---|---|
| 1 | DRV-EARN-01 | P1 | `src/pages/driver/DriverEarnings.tsx:47`, `:162`; `server/order-router.ts:797` | Fechas UTC interpretadas como locales: historial un día antes y filtros Hoy/Semana/Mes incorrectos en Ecuador. Afecta todos los totales de la pantalla. |
| 2 | DRV-EARN-02 | P1 | `src/pages/driver/DriverOrder.tsx:479`; `src/pages/driver/DriverHome.tsx:218`; `server/order-router.ts:795-796` | El driver ve el `deliveryFee` completo como ganancia, pero se le acredita solo su porcentaje. Genera reclamos y desconfianza en `/driver/earnings`. |
| 3 | DRV-EARN-04 | P1 | `server/admin/orders-router.ts:256-285`; `server/admin/dashboard-router.ts:298-313` | Cancelar/reentregar desde admin deja earnings huérfanos y descuadra la comisión/liquidación del admin frente a Stats y al driver. |
| 4 | DRV-EARN-05 | P1 | `server/admin/orders-router.ts:54-58`, `:90-94` | La liquidación por pedido usa la tasa actual del driver, no el monto histórico acreditado. Pagos/cobros distintos a lo que ve el driver. |
| 5 | DRV-EARN-03 | P2 | `src/pages/driver/DriverEarnings.tsx:23-26`, `:173-177`; `src/providers/trpc.tsx:48-54` | Un error de red/403/500 se pinta como `$0.00` + “Sin historial”; no hay reintento ni diagnóstico. |

**Riesgos de integración para el consolidado:**

- Cliente: la entrega sigue funcionando y no cambia totales; el riesgo es que el admin cancele un `delivered` y el cliente vea “Cancelado” mientras el driver conserva el pago.
- Negocio: `deliveredAt` y `order_items` no se tocan; Stats no se rompe por la ganancia. La cancelación admin post-entrega sí saca el pedido de Stats sin revertir el earning.
- Admin: el resumen agregado coincide con el driver, pero la liquidación por pedido y el CSV de repartidores no; además `assignDriver` puede reasignar un pedido ya entregado.
- Datos: el unique `(order_id, type)` protege el doble pago; el path admin no usa `.onConflictDoNothing()` y el borrado de driver hace cascade de todo el historial.