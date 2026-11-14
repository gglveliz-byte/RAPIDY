# Auditoría `/admin/orders` — Administración

**Fecha:** 2026-11-13  
**Ruta auditada:** `/admin/orders` — gestión administrativa de pedidos  
**Rol:** `admin`  
**Tipo de revisión:** auditoría estática de código, contratos, consultas y documentación. No se modificó código, no se ejecutaron migraciones, no se reinició el servidor de desarrollo y no se ejecutaron mutaciones contra `localhost:3000`.

## 1. Alcance y archivos

Se revisó la ruta de punta a punta: listado, detalle, filtros, búsqueda, validación de transferencias, cambio de estado, asignación/reasignación de driver, cancelación, liquidación comercio/driver y comprobantes. También se revisó su integración con Cliente, Negocio y Driver.

| Capa | Archivos |
|---|---|
| Ruta, guard y layout | `src/App.tsx`; `src/components/SessionGuard.tsx`; `src/components/AdminLayout.tsx` |
| Página y detalle | `src/pages/admin/Orders.tsx` |
| Hooks del panel | `src/hooks/useDeliveryData.ts` (`useAdminOrders`, `useAdminOrderDetail`, `useAdminUpdateOrderStatus`, `useAdminAssignDriver`); `src/hooks/useAdminSSE.ts` |
| Hooks de integración | `src/hooks/useOrderEvents.ts` (canales `order:`, `commerce:`, `driver:`) |
| Backend admin | `server/admin-router.ts`; `server/admin/orders-router.ts`; `server/admin/dashboard-router.ts` |
| Backend de pedidos | `server/order-router.ts`; `server/lib/order-access.ts`; `server/lib/order-ready.ts`; `server/lib/order-status-sync.ts` |
| Integración driver | `server/driver-router.ts` (`acceptOrder`, `markCommercePickup`); `server/events.ts` |
| Autorización y sesión | `server/admin-auth.ts`; `server/login-router.ts`; `server/context.ts`; `server/middleware.ts`; `server/lib/cookies.ts` |
| SSE y arranque | `server/boot.ts`; `server/events.ts` |
| Contrato y datos | `contracts/orderStatus.ts`; `db/schema.ts` |
| Documentación de contexto | `docs/customer/README.md`; `docs/commerce/README.md`; `docs/driver/README.md`; `docs/commerce/VERIFICATION.md`; `docs/driver/VERIFICATION.md`; `docs/commerce/audit/MASTER_TRIAGE.md`; `docs/driver/audit/MASTER_TRIAGE.md`; `docs/commerce/ROUTES_MAP.md` |
| Contexto histórico | `docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md` (no es fuente de verdad vigente) |

**Fuera de alcance:** pruebas de carga reales, inspección de datos productivos, ejecución de E2E, cambios de UI, migraciones y modificaciones al servidor. No existe una superficie de exportación en esta ruta; no se puede auditar exportaciones de pedidos porque no las hay.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/SSE)

```text
/admin/orders
  ├─ SessionGuard role="admin"                        src/App.tsx:135
  ├─ AdminLayout                                       src/components/AdminLayout.tsx:19-106
  │    └─ logout: login.logout { scope:"admin" }       AdminLayout.tsx:23-30
  ├─ useAdminOrders()                                  src/hooks/useDeliveryData.ts:574-580
  │    └─ GET admin.orders (adminQuery)                server/admin/orders-router.ts:36-147
  │         ├─ SELECT todas las orders + todos los driver_earnings
  │         └─ por pedido: items, cliente, driver, comercios (N+1)
  ├─ useAdminSSE(callback)                             src/hooks/useAdminSSE.ts:7-91
  │    └─ SSE /api/events/admin-dashboard              server/boot.ts:266-284
  │         └─ callback: utils.admin.orders.invalidate()  src/pages/admin/Orders.tsx:61-66
  ├─ trpc.admin.orderDetail.useQuery({ id })           src/pages/admin/Orders.tsx:54-57
  │    └─ admin.orderDetail (adminQuery)               server/admin/orders-router.ts:180-212
  │         └─ order + items + customer + driver + commerces
  ├─ Aprobar pago                                      src/pages/admin/Orders.tsx:95-100
  │    └─ admin.updateOrderStatus { status:"received" } server/admin/orders-router.ts:215-338
  │         ├─ SELECT ... FOR UPDATE                   :240
  │         ├─ guard terminal (solo si cambia estado)  :242-250
  │         ├─ UPDATE orders + syncAllCommerceStatuses :252-269
  │         ├─ INSERT order_status_history             :271-276
  │         ├─ driver busy / delivered / cancelled     :278-312
  │         └─ SSE commerce:{id}, order:{id}, driver   :318-336
  └─ Rechazar pago                                     src/pages/admin/Orders.tsx:102-108
       └─ admin.updateOrderStatus { status:"payment_rejected", notes }
```

```text
Liquidación (solo visible para o.delivered)
  ├─ toggleCommerceSettled / toggleDriverSettled       src/pages/admin/Orders.tsx:79-93
  ├─ admin.toggleCommerceSettled                       server/admin/orders-router.ts:150-162
  ├─ admin.toggleDriverSettled                         server/admin/orders-router.ts:165-177
  └─ UPDATE orders.commerce_settled / driver_settled   db/schema.ts:195-196
```

**Asignación/reasignación/cancelación:** el backend tiene `admin.assignDriver` (`server/admin/orders-router.ts:341-413`) y `admin.updateOrderStatus` acepta todos los estados (`:219-231`), pero la página no expone esas acciones. Solo se usan para aprobar/rechazar pago y para los toggles de liquidación.

**Autorización:** todas las procedures del listado, detalle, mutaciones y liquidación usan `adminQuery` (`server/middleware.ts:25-36`). El SSE `admin-dashboard` exige una identidad admin resuelta desde cookies (`server/boot.ts:266-270`). Las cookies admin son HttpOnly, `SameSite=Lax` en localhost y `Secure` fuera (`server/lib/cookies.ts:8-17`; `server/admin-auth.ts:64-83`).

**Tablas:** `orders`, `order_items`, `order_commerce_status`, `order_status_history`, `customers`, `drivers`, `driver_earnings`, `commerces`.

## 3. Hallazgos

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| ADM-ORD-01 | P1 | Performance / payload | `server/admin/orders-router.ts:36-54, 80-102, 131-143` | `admin.orders` hace `SELECT *` de todas las órdenes y, por cada una, consulta items, cliente, driver y comercios (N+1). También carga todos los `driver_earnings` sin filtro. No hay `limit`, cursor, filtro de fecha ni proyección explícita. | Con 500 pedidos son >2.000 consultas secuenciales; el payload incluye todos los items y el `paymentReceipt` base64 de cada pedido. Riesgo de timeout, memoria y respuesta inmanejable. | Paginación server-side, joins/agregados en una o pocas consultas, proyección explícita sin `paymentReceipt` ni items, índice por `created_at` y límite duro. Medir con carga antes de cerrar. |
| ADM-ORD-02 | P1 | Privacidad / minimización | `server/admin/orders-router.ts:38, 131-133, 188-191, 202-211`; `db/schema.ts:80` | El listado hace spread de `orders` e incluye `paymentReceipt` (data URL de hasta 7,5M caracteres) e `idempotencyKey`. `orderDetail` devuelve el cliente completo (incluido `customers.fcmToken` y `sessionVersion`) y `commerces` completos (logo/coverImage, email, `merchantUserId`) que la UI no usa. | Comprobantes y token push expuestos más allá de la necesidad; payload enorme; mayor superficie si el navegador del admin se compromete o se comparte. | Proyección explícita por caso de uso; comprobante solo en detalle y bajo demanda; excluir `fcmToken`, `sessionVersion` e `idempotencyKey`; comercios con id/nombre/estado/comisión. |
| ADM-ORD-03 | P1 | Frontend / caché / SSE | `src/pages/admin/Orders.tsx:53, 61-75`; `src/hooks/useDeliveryData.ts:574-580` | La lista usa `useAdminOrders` con queryKey `["admin.orders"]`; `useAdminSSE` y `updateStatus.onSuccess` solo llaman `utils.admin.orders.invalidate()` (clave tRPC `[["admin","orders"], …]`). Solo las mutaciones de liquidación invalidan además `["admin.orders"]` (`Orders.tsx:79-93`). | Nuevos pedidos y cambios de estado no aparecen; tras aprobar/rechazar, el listado sigue mostrando `pending_payment`; el admin puede volver a operar sobre datos viejos. | Invalidar ambas claves o migrar la lista a `trpc.admin.orders.useQuery`; añadir debounce y prueba explícita aprobar→lista actualizada. |
| ADM-ORD-04 | P1 | Funcional / alcance de la ruta | `src/pages/admin/Orders.tsx:95-108, 453-470`; `server/admin/orders-router.ts:341-413`; `docs/commerce/ROUTES_MAP.md:402` | La UI solo expone aprobar/rechazar pago y toggles de liquidación. No hay selector de driver, reasignación, cancelación, cambio de estado, historial ni desglose por comercio, aunque `admin.assignDriver` y `admin.updateOrderStatus` existen. La doc afirma que la ruta asigna driver y cancela. | No se puede despachar ni corregir un pedido desde `/admin/orders`; el alcance documentado no se cumple. | Exponer las acciones existentes en el detalle con los guards del backend; no crear endpoints nuevos. |
| ADM-ORD-05 | P1 | Dinero / liquidación | `server/admin/orders-router.ts:86-101, 107-129, 137-142`; `db/schema.ts:195-196, 258` | La comisión del comercio se recalcula con `commerces.commissionRate` actual, no con `order_commerce_status.commission_amount` (snapshot histórico). En multi-comercio se suma todo en un único `commerceOwed` y un único `commerceSettled`, y `commerceName` solo es `coms[0]`. `Math.max(0, …)` oculta saldos negativos; sin driver, el fallback del 75% inventa un `driverOwed`. | Liquidaciones históricas cambian si se modifica la tasa; un comercio puede quedar oculto o pagado de más/menos; no cuadra con `commerce.getStats`, que sí usa el snapshot. | Usar `commission_amount` por comercio; desglose y flag por comercio; no inventar driver; mostrar saldos negativos; conciliar contra Stats. |
| ADM-ORD-06 | P1 | Comprobantes / validación | `server/order-router.ts:73`; `src/pages/admin/Orders.tsx:440-447` | El backend acepta comprobantes `application/pdf`, pero el detalle solo los renderiza con `<img src={paymentReceipt}>`. Un PDF aparece como imagen rota, sin visor ni enlace de descarga. | El admin no puede validar transferencias con comprobante PDF y puede aprobar/rechazar a ciegas. | Detectar `application/pdf` y mostrar `<object>`/enlace de descarga, o restringir el MIME a imágenes; añadir fallback `onError`. |
| ADM-ORD-07 | P1 | Máquina de estados / integridad | `server/admin/orders-router.ts:240-259, 283-307`; `contracts/orderStatus.ts:228-257` | `updateOrderStatus` no usa `canTransition` ni una allowlist admin: permite `pending_payment`/`payment_rejected`/`received` → `delivered` y saltos arbitrarios. El guard terminal solo compara `status !== input.status`: reenviar `delivered` sobre un pedido ya entregado vuelve a escribir `deliveredAt`, inserta historial y, con `driverId`, cambia el driver; el earning del driver anterior queda intacto. | Pedidos impagos o sin reparto cuentan como venta; `delivered_at` se mueve y afecta Stats; historial/earning pueden quedar atribuidos a otro driver; métricas contaminadas. | Validar con el contrato o una allowlist explícita; early return si el estado es el mismo; no permitir cambiar `driverId` ni `deliveredAt` en terminal; probar todos los saltos. |
| ADM-ORD-08 | P1 | Asignación / concurrencia | `server/admin/orders-router.ts:353-400`; `server/driver-router.ts:336-358` | `assignDriver` bloquea solo la orden, no el driver. No valida que el driver exista, esté online, no esté busy ni que no tenga otro pedido activo; tampoco exige que todas las filas `order_commerce_status` estén `ready_for_pickup`. Actualiza `drivers.status='busy'` después de bloquear la orden, mientras `acceptOrder` bloquea driver→orden: orden de locks invertido. | Dos pedidos activos para un driver; asignación a driver offline/busy; deadlock/500 en concurrencia accept vs assign; pedido asignado sin cocina lista. | Bloquear driver primero, validar existencia/estado/pedido activo, verificar `allReady` y usar la misma secuencia de locks que `acceptOrder`. |
| ADM-ORD-09 | P1 | Cancelación / reembolso | `server/admin/orders-router.ts:252-259, 309-312`; `db/schema.ts:180-212` | Al cancelar, el path admin no escribe `cancellationReason` ni `cancelledBy`; solo deja un `notes` en historial. No existe campo/estado de reembolso: una transferencia ya aprobada se cancela sin registrar si el dinero se devolvió. | Cliente/comercio/driver no ven motivo ni actor; no se puede conciliar el reembolso; disputas sin trazabilidad. | Exigir motivo y escribir campos; registrar reembolso/política o bloquear la cancelación de una transferencia aprobada sin evidencia de devolución. |
| ADM-ORD-10 | P1 | Checklist driver / estados | `server/admin/orders-router.ts:261-269`; `server/order-router.ts:797-805` | El admin que fuerza `picked_up` actualiza todas las filas de comercio pero no `orders.pickedUpCommerceIds`. El driver valida `delivered` contra ese array. | El driver no puede completar la entrega; el pedido dice retirado sin checklist; estados contradictorios entre admin y driver. | Actualizar el array por comercio de forma coherente o prohibir `picked_up` desde admin; usar el checklist de `markCommercePickup`. |
| ADM-ORD-11 | P1 | Reasignación / driver | `server/admin/orders-router.ts:252-257, 277-281, 332-335` | `updateOrderStatus` acepta `driverId` en cualquier estado: asigna el nuevo driver, lo marca busy y emite a ese driver; no libera ni notifica al driver anterior. También permite asignar driver a `received`/`pending_payment` sin pasar por `ready_for_pickup`. | Driver anterior queda `busy` y con el pedido en su lista; dos pedidos activos; pedido no despachable; evento al driver equivocado. | Un único servicio de asignación con guards; liberar/notificar al anterior; exigir `ready_for_pickup` y `allReady`. |
| ADM-ORD-12 | P2 | Liquidación / operación | `server/admin/orders-router.ts:150-177`; `src/pages/admin/Orders.tsx:218-246, 313-340` | Los toggles leen y escriben sin `FOR UPDATE` ni guard de estado terminal; la API puede marcar liquidado un pedido activo/cancelado. La UI solo los muestra en `delivered`, pero un doble clic o dos admins pueden invertir el flag; no hay confirmación, undo ni auditoría. | Conciliación falsa; se pierde quién/cuándo liquidó; carrera entre admins. | Exigir `delivered`, lock, set/unset explícito con actor/fecha, confirmación y estado pendiente por acción. |
| ADM-ORD-13 | P1 | Errores / tiempo real | `src/hooks/useDeliveryData.ts:574-580`; `src/pages/admin/Orders.tsx:95-108, 179-190, 385-388`; `src/hooks/useAdminSSE.ts:55-72` | `useAdminOrders` no expone `error/isError/refetch`; un 401/403/500 se muestra como “No hay pedidos”. `handleApprovePayment`/`handleRejectPayment` hacen `await mutateAsync` sin try/catch ni toast; el detalle muestra error genérico sin reintento. `useAdminSSE` no expone conexión ni maneja 401 y reintenta cada 3 s. | Un fallo de red/sesión se confunde con vacío; una acción de pago fallida queda sin feedback; el admin cree que está en vivo cuando no lo está. | Exponer error/refetch, distinguir vacío de error, toast/inline, reintento y estado SSE; cortar en 401. |
| ADM-ORD-14 | P1 | Seguridad / sesión admin | `server/admin-auth.ts:9-11, 22-29, 42-51`; `server/context.ts:72-95`; `db/schema.ts:52-67` | Los tokens admin no incluyen `sessionVersion` y `users` no tiene esa columna. El refresh de 7 días sigue válido tras logout o cambio de contraseña; solo se borran cookies. | Una sesión admin robada no se puede revocar; el rol tiene acceso a todos los pedidos, comprobantes y liquidaciones. | Añadir `users.session_version`, incluirla en access/refresh, validarla en contexto y refresh, y rotarla en logout/cambio de contraseña. |
| ADM-ORD-15 | P1 | Carrera pago/rechazo | `server/order-router.ts:1112-1142` | `updatePaymentReceipt` valida `pending_payment`/`payment_rejected` fuera de la transacción y luego actualiza `status='pending_payment'` por id sin `FOR UPDATE` ni condición de estado. Si el admin aprueba entre la lectura y el update, el cliente puede revertir un pedido ya aprobado a pending. | Un pago aprobado vuelve a “pendiente”; el comercio no debe preparar; historial contradictorio. | Bloquear la fila, revalidar dentro de la transacción, update condicional y emitir solo si cambió. |
| ADM-ORD-16 | P2 | Contrato visual / copy | `src/pages/admin/Orders.tsx:16-43, 203-205, 278-280`; `contracts/orderStatus.ts:48-159` | Mapa local `statusColors` y `status.replace(/_/g, " ")`: badges en inglés (`payment rejected`, `driver assigned`) y colores distintos del contrato (pending rojo/pulse vs ámbar; delivered verde vs brand). No usa `ORDER_STATUS_META`. | Cliente, negocio, driver y admin ven etiquetas/tonos distintos; el operador lee estados en inglés. | Importar `ORDER_STATUS_META`; eliminar el mapa local; usar `motion-reduce` para el pulse. |
| ADM-ORD-17 | P2 | Accesibilidad / dark mode | `src/pages/admin/Orders.tsx:135-141, 145-158, 248-250, 253, 343-353, 364-378, 455-467`; `src/components/AdminLayout.tsx:33-103` | Targets <44 px: búsqueda 36, filtros 36, ojo 36/40, X 32. El modal no tiene `role="dialog"`, `aria-modal`, focus trap, Escape ni scroll lock. Filtros sin `aria-pressed`; labels de 7,5–9 px y `text-gray-400`; no hay variantes `dark:` en admin. `active:scale-98` y `backdrop-blur-xs` no existen en Tailwind 3.4. | Dificultad táctil/lector; dark mode inconsistente; clases muertas. | Targets ≥44 px, diálogo accesible, `aria-*`, tokens dark y utilidades válidas. |
| ADM-ORD-18 | P2 | Búsqueda / filtros | `src/pages/admin/Orders.tsx:110-117, 135-141, 145-158` | Búsqueda local sobre todo el array; `id.includes` y teléfono literal; no quita `#`, espacios ni guiones, ni normaliza el prefijo `593`. Sin conteos por filtro; “No hay pedidos” no distingue filtro/búsqueda de lista vacía. | Falsos negativos y jank cuando el listado crezca; el operador cree que el pedido no existe. | Normalizar la consulta, mover la búsqueda al servidor cuando haya paginación, conteos por filtro y empty contextual. |
| ADM-ORD-19 | P2 | Detalle incompleto | `src/pages/admin/Orders.tsx:390-488`; `server/admin/orders-router.ts:180-212`; `db/schema.ts:194, 198-202, 218-233` | El detalle no muestra `driver`, `commerces` ni `history` (el backend devuelve driver/commerces, no history). `item.notes` no existe en `order_items`, así que la línea 428 nunca renderiza. No muestra `orders.notes`, `cancellationReason`, `deliveredAt`, método de pago cash ni motivo de rechazo; tras `payment_rejected` no hay botón para re-revisar. | Admin sin contexto para soporte/disputas; notas del cliente/ítem invisibles; rechazo opaco. | Renderizar los campos existentes, añadir history a la proyección, quitar `item.notes`, mostrar motivo y permitir re-revisión. |
| ADM-ORD-20 | P2 | SSE / push / integración | `server/admin/orders-router.ts:332-336, 406-411`; `server/events.ts:67-81, 92-101`; `server/order-router.ts:1144-1145` | `assignDriver` no emite a `commerce:{id}`; el evento al pedido es `type:"driver_assigned"`, no `status_update`, así que `events.ts` no envía push al cliente. `updateOrderStatus` emite `driver:{id}` `order_assigned` también al cancelar/entregar, y el driver recibe push “Pedido asignado” de un pedido cancelado/entregado. `updatePaymentReceipt` no emite a comercio. | El negocio no ve la asignación en vivo; el cliente no recibe push; el driver recibe una notificación falsa; el comercio no ve el reenvío del comprobante. | Emitir `order_status` a cada comercio, usar `status_update` para el cliente y eventos semánticos (`cancelled`, `delivered`, `unassigned`); emitir el reenvío a comercio. |
| ADM-ORD-21 | P2 | Formato / fechas / moneda | `src/pages/admin/Orders.tsx:201, 207, 275-276, 430, 478-486` | `$` + `toFixed(2)` sin `Intl`/USD; escritorio usa `toLocaleString` y móvil `toLocaleDateString`; no se fuerza `America/Guayaquil` ni se usa `deliveredAt`. El listado ordena por `createdAt` y muestra esa fecha incluso en entregados. | Fechas/horas distintas entre vistas y con métricas; montos sin separadores; el operador no ve la fecha real de entrega. | Formato compartido UTC→Guayaquil, USD y `deliveredAt` para entregados. |
| ADM-ORD-22 | P2 | Cantidades | `src/pages/admin/Orders.tsx:425`; `db/schema.ts:224` | `order_items.quantity` es `numeric(10,3)` y Drizzle lo entrega como string; `{item.quantity}x` muestra `1.000x`/`0.500x` en vez de `1x`/`0.5 kg`. | Cantidades confusas; no se distingue unidad de peso. | Parsear y formatear la cantidad; mostrar unidad si se persiste el snapshot, al menos quitar ceros. |
| ADM-ORD-23 | P2 | Auditoría | `db/schema.ts:241-250`; `server/admin/orders-router.ts:271-276, 392-398` | `order_status_history` solo guarda status/notes/createdAt; no actor id/role ni from/to. El admin se registra como “por el administrador” sin id; `assignDriver` solo escribe ids en texto. | No se puede auditar quién cambió qué; disputas y seguridad sin evidencia estructurada. | Añadir actor y estado anterior/nuevo, o un audit log; no depender de `notes`. |
| ADM-ORD-24 | P2 | Cobertura / pruebas | `scripts/admin-smoke.mjs:8-36`; `package.json:14` | El smoke admin solo hace login y `driver.list`; no abre `/admin/orders` ni prueba approve/reject/assign/cancel/settle. `npm test` solo tiene `contracts/orderStatus.test.ts` y `server/lib/otp.test.ts`. | Regresiones como la invalidación stale o el PDF no se detectan. | Extender el smoke admin con una matriz de pedidos y estados; probar query keys y comprobantes PDF. |

## 4. Integración con Cliente, Negocio y Driver

| Tramo | Comportamiento actual | Evidencia | Estado |
|---|---|---|---|
| Admin aprueba transferencia | `pending_payment → received`; sincroniza todas las filas de comercio; emite `new_order` al comercio y `status_update` al pedido; el cliente ve “Recibido” | `server/admin/orders-router.ts:252-269, 318-336` | Correcto en backend; el listado admin queda stale por ADM-ORD-03. |
| Admin rechaza transferencia | `payment_rejected`; sincroniza filas; emite `order_status` al comercio y `status_update` al pedido; el cliente ve “Pago rechazado” | `server/admin/orders-router.ts:252-259, 318-336` | Correcto; el motivo solo queda en historial y la UI no lo muestra (ADM-ORD-19). |
| Admin cancela | Cambia `orders.status`; sincroniza filas a `cancelled`; emite a comercio y pedido; libera driver | `server/admin/orders-router.ts:309-312, 318-336` | Parcial: sin `cancellationReason/cancelledBy` (ADM-ORD-09); el driver recibe `order_assigned` y push falso (ADM-ORD-20). |
| Admin asigna driver | Actualiza `orders.driverId`, pasa a `driver_assigned`, marca busy, emite a driver y pedido | `server/admin/orders-router.ts:383-411` | Parcial: sin SSE al comercio y sin push al cliente (ADM-ORD-20); guards incompletos (ADM-ORD-08). |
| Admin reasigna por `updateOrderStatus` | Cambia `driverId`, marca busy al nuevo, emite solo al nuevo | `server/admin/orders-router.ts:252-257, 277-281, 332-335` | Incorrecto: el anterior queda busy y sin evento (ADM-ORD-11). |
| Admin fuerza `picked_up` | Actualiza filas a `picked_up`, pero no `pickedUpCommerceIds` | `server/admin/orders-router.ts:261-269`; `server/order-router.ts:797-805` | Incorrecto: el driver no puede completar (ADM-ORD-10). |
| Admin fuerza `delivered` | Escribe `deliveredAt`, libera driver y crea earning si no existe | `server/admin/orders-router.ts:283-307` | Parcial: permite saltos desde estados impagos/sin driver (ADM-ORD-07) y puede pagar sin earning real (ADM-ORD-05). |
| Negocio marca listo | `markCommerceReadyForOrder` valida `received/accepted/preparing`, bloquea la orden y solo pasa a `ready_for_pickup` si todos los comercios están listos | `server/lib/order-ready.ts:14, 52-90, 130-151` | Correcto; no se debe romper. |
| Driver acepta | Bloquea driver→orden, exige `ready_for_pickup`, no driver previo, todos los comercios listos y un solo pedido activo; pasa a `driver_assigned` y emite a `commerce:` | `server/driver-router.ts:329-453` | Correcto; admin `assignDriver` no replica todos esos guards (ADM-ORD-08). |
| Driver retira por comercio | Exige fila `ready_for_pickup`, acumula `pickedUpCommerceIds`, pasa a `picked_up` solo si todos; emite a `order:`, `driver:` y `commerce:` | `server/driver-router.ts:459-567` | Correcto; el admin puede dejarlo inconsistente si fuerza `picked_up` (ADM-ORD-10). |
| Driver entrega | Solo desde `on_the_way`, exige todos los comercios retirados, escribe `deliveredAt` y crea earning idempotente | `server/order-router.ts:790-812, 881-916` | Correcto; no se debe romper. |
| Terminales | `updateOrderStatus` bloquea cambios desde `delivered`/`cancelled` a otro estado; `assignDriver` bloquea terminal/retirado; `markReady` y `markCommercePickup` rechazan terminales | `server/admin/orders-router.ts:242-250, 361-372`; `server/order-ready.ts:85-90`; `server/driver-router.ts:478-483` | Correcto para estados distintos; el mismo estado `delivered` sigue mutando `deliveredAt`/driver (ADM-ORD-07). |
| Stats y earnings | `deliveredAt` se escribe al entregar; Stats de comercio usa esa fecha; `driver_earnings.amount` es la fuente de la ganancia | `server/order-router.ts:927`; `server/admin/orders-router.ts:256`; `server/commerce-router.ts:266-293` | Correcto en la entrega normal; la liquidación admin no usa el snapshot de comisión (ADM-ORD-05). |
| Multi-comercio | El admin sincroniza todas las filas por comercio; el negocio ve su estado con `getCommerceOrderStatus`; la liquidación es una sola por pedido | `server/admin/orders-router.ts:261-269`; `contracts/orderStatus.ts:199-215` | Parcial: no hay liquidación por comercio ni desglose visible (ADM-ORD-05). |
| Transferencia recién creada | Nace `pending_payment`; no se emite `new_order` al comercio para transferencias; el admin recibe evento de dashboard pero su lista no se invalida | `server/order-router.ts:456-458, 529-535`; `server/admin/orders-router.ts:318-336` | Parcial: el comercio la ve por polling y el admin puede no verla hasta recargar (ADM-ORD-03). |

**Riesgo de integración principal:** el admin puede cambiar el estado global sin respetar la máquina de estados y sin actualizar todos los datos derivados (`pickedUpCommerceIds`, motivo de cancelación, earning). El cliente y el negocio reciben el estado por SSE, pero el driver puede quedar bloqueado o recibir una notificación semánticamente incorrecta.

## 5. Lo que funciona y no se debe romper

- **Autenticación y rol:** `/admin/orders` está bajo `SessionGuard role="admin"` (`src/App.tsx:135`) y todas las procedures usan `adminQuery` (`server/middleware.ts:25-36`). El SSE admin exige identidad admin (`server/boot.ts:266-270`).
- **Cookies:** `quickgo_admin_token` (15 min) y `quickgo_admin_refresh` (7 días) son HttpOnly, `SameSite=Lax` en localhost y `Secure` fuera (`server/admin-auth.ts:9-11, 64-83`; `server/lib/cookies.ts:8-17`). No se deben mover a `localStorage`.
- **Logout role-scoped:** `login.logout { scope:"admin" }` no cierra sesiones customer/merchant/driver (`server/login-router.ts:241-258`). `AdminLayout` limpia `QueryClient` al salir (`AdminLayout.tsx:23-30`).
- **Guard terminal real:** para estados distintos, `updateOrderStatus` rechaza cambiar un `delivered`/`cancelled` (`server/admin/orders-router.ts:242-250`). `assignDriver` rechaza `delivered`, `cancelled`, `picked_up` y `on_the_way` (`:361-372`). `markReady` solo acepta `received/accepted/preparing` (`server/lib/order-ready.ts:85-90`). `markCommercePickup` rechaza `delivered`, `cancelled` y `on_the_way` (`server/driver-router.ts:478-483`).
- **`markReady` transaccional:** bloquea la orden, es idempotente y solo pone `ready_for_pickup` global si todos los comercios con items están listos (`server/lib/order-ready.ts:52-90, 130-151`). No volver a un `markReady` que reviva terminales.
- **Checklist por comercio:** `markCommercePickup` exige fila `ready_for_pickup`, acumula `pickedUpCommerceIds` y solo pasa a `picked_up` si todos (`server/driver-router.ts:459-559`). Es la fuente correcta; el admin no debe saltarlo.
- **`delivered_at` y earnings:** la entrega normal escribe `deliveredAt` y crea `driver_earnings` con unique `(order_id,type)` y `onConflictDoNothing` (`server/order-router.ts:881-916`). La liquidación admin usa el earning almacenado cuando existe (`server/admin/orders-router.ts:107-112`). No recalcular el histórico con la tasa actual del driver.
- **Comprobantes fuera de Cliente/Negocio/Driver:** `sanitizeOrder` elimina `paymentReceipt` (`server/order-router.ts:218-224`); `getCommerceOrders` usa proyección explícita sin comprobante (`:1076-1101`); `getAvailableForDriver` no lo devuelve (`:670-761`); `acceptOrder` y `markCommercePickup` lo eliminan (`server/driver-router.ts:455, 566`). El admin sí debe verlo en el detalle, no en el listado.
- **Mass assignment:** todos los inputs están acotados con Zod (`server/admin/orders-router.ts:215-235, 341-348`); no se aceptan `total`, `commission`, `status` de comercio ni campos arbitrarios. Mantenerlo.
- **Proyección del negocio:** `getCommerceOrders` filtra clientes con `inArray`, ordena por `created_at DESC` y limita (`server/order-router.ts:983-1103`). No volver a cargar toda la tabla.
- **SSE de negocio en cambios externos:** `admin.updateOrderStatus` emite a cada `commerce:{id}` (`server/admin/orders-router.ts:318-330`); `markReady` y `markCommercePickup` también emiten. Mantener esos eventos al tocar estados.
- **UI responsive:** tabla desktop + cards mobile, scroll horizontal de filtros, safe-area y `touch-target` del botón volver. No romper el layout al agregar acciones.
- **Un solo `QueryClient`:** la página y los hooks comparten `src/providers/trpc.tsx`; no crear otra caché.
- **Sin exportaciones:** no hay endpoint de exportación en `/admin/orders`; si se agrega, debe ser admin-only y con proyección/auditoría.

## 6. Evidencia y verificación

**Tipo de evidencia:** lectura estática de los archivos citados. No se ejecutaron pruebas de runtime, no se abrió el navegador, no se consultó la base de datos y no se modificó el servidor de `localhost:3000`.

### Verificado por lectura

| Invariante | Evidencia | Resultado |
|---|---|---|
| Ruta protegida por admin | `src/App.tsx:135`; `server/middleware.ts:25-36` | PASS |
| SSE admin autenticado | `server/boot.ts:266-270` | PASS |
| Cookies admin HttpOnly/SameSite | `server/lib/cookies.ts:8-17`; `server/admin-auth.ts:64-83` | PASS |
| `paymentReceipt` fuera de cliente/negocio/driver | `server/order-router.ts:218-224, 1076-1101`; `server/driver-router.ts:455, 566` | PASS |
| Guard terminal contra cambio de estado | `server/admin/orders-router.ts:242-250, 361-372` | PASS para estados distintos; FAIL para mismo `delivered` (ADM-ORD-07) |
| `markReady` solo desde received/accepted/preparing | `server/lib/order-ready.ts:14, 85-90` | PASS |
| `delivered_at` al entregar | `server/order-router.ts:927`; `server/admin/orders-router.ts:256` | PASS, con riesgo de reescritura (ADM-ORD-07) |
| Earning real usado en liquidación | `server/admin/orders-router.ts:107-112` | PASS para driver; FAIL para comisión de comercio (ADM-ORD-05) |
| Invalidate del listado admin | `src/pages/admin/Orders.tsx:61-75`; `src/hooks/useDeliveryData.ts:574-580` | FAIL (ADM-ORD-03) |
| Comprobante PDF visible | `server/order-router.ts:73`; `src/pages/admin/Orders.tsx:440-447` | FAIL (ADM-ORD-06) |

### No verificado

- No se midió latencia ni memoria real del N+1; el conteo es por lectura del código (`ADM-ORD-01`).
- No se probó el comportamiento de un PDF en un navegador real; se deduce del uso de `<img>` (`ADM-ORD-06`).
- No se probaron carreras con dos administradores o admin vs driver (`ADM-ORD-08`, `ADM-ORD-12`, `ADM-ORD-15`).
- No se inspeccionaron datos productivos ni se confirmó que existan pedidos multi-comercio, PDFs o pedidos entregados sin driver.
- No se ejecutó el E2E completo del cliente porque requiere OTP real (`docs/customer/README.md`; `docs/commerce/VERIFICATION.md:73-79`).

### Pruebas que deben ejecutarse después de corregir

```bash
npx tsc -b --force
npm test
npm run lint
npm run build
node scripts/admin-smoke.mjs
node scripts/e2e-commerce-smoke.mjs
node scripts/driver-api-smoke.mjs
node scripts/e2e-driver-smoke.mjs
npx tsx scripts/redirect-smoke.ts
```

**Matriz manual mínima:**

1. Admin aprueba una transferencia y el listado pasa de `pending_payment` a `received` sin recargar.
2. Admin rechaza, el cliente ve el motivo, reenvía comprobante y el admin lo ve en vivo.
3. Admin asigna driver: negocio y cliente ven `driver_assigned`; el driver no tiene otro pedido activo.
4. Admin reasigna: el driver anterior queda libre y notificado; el nuevo no queda con dos activos.
5. Admin fuerza `picked_up`: el driver puede completar, o la acción se rechaza.
6. Admin cancela: motivo/actor visibles; no hay push falso al driver; reembolso trazado.
7. Admin intenta `delivered` desde `pending_payment`, `payment_rejected` y `received`: debe rechazarse.
8. Admin reenvía `delivered` sobre un pedido entregado: no debe mover `deliveredAt` ni cambiar driver/earning.
9. Pedido multi-comercio: el desglose y la liquidación muestran cada comercio.
10. Comprobante JPG y PDF: ambos visibles/descargables.
11. SSE caído/401: el panel muestra error, no “No hay pedidos”.

**Cobertura actual insuficiente:** `scripts/admin-smoke.mjs:8-36` solo valida login admin y `driver.list`; no cubre `/admin/orders`, pagos, asignación, cancelación ni liquidación. `npm test` solo incluye `contracts/orderStatus.test.ts` y `server/lib/otp.test.ts`.

## 7. Resumen para consolidado (top 5)

No se identificó un P0 explotable sin una sesión admin válida. Los P1 siguientes son los bloqueantes de esta ruta:

| # | ID | Severidad | Archivo:línea | Por qué está en el top |
|---|---|---|---|---|
| 1 | ADM-ORD-07 | P1 | `server/admin/orders-router.ts:240-259, 283-307` | Salta la máquina de estados, permite `pending_payment/payment_rejected → delivered`, y el mismo `delivered` reescribe `deliveredAt`, historial, driver y atribución del earning. |
| 2 | ADM-ORD-05 | P1 | `server/admin/orders-router.ts:86-129` | La liquidación usa la tasa actual en vez del snapshot por comercio y agrega multi-comercio en un solo saldo/flag; pagos históricos dejan de cuadrar con Stats. |
| 3 | ADM-ORD-08 | P1 | `server/admin/orders-router.ts:353-400` | `assignDriver` no bloquea/valida al driver ni su pedido activo, no exige `allReady` y invierte el orden de locks frente a `acceptOrder`; permite dos pedidos activos y deadlocks. |
| 4 | ADM-ORD-01 | P1 | `server/admin/orders-router.ts:36-54, 131-143` | Listado sin límite + N+1 + `paymentReceipt` base64 por pedido; el panel se vuelve inoperable con volumen real. |
| 5 | ADM-ORD-03 | P1 | `src/pages/admin/Orders.tsx:61-75`; `src/hooks/useDeliveryData.ts:574-580` | La invalidación usa la clave tRPC, pero la lista usa `["admin.orders"]`; aprobar/rechazar y los eventos SSE no actualizan el listado. |

**P1 adicionales para el consolidado:** `ADM-ORD-02` (comprobantes/fcmToken en payload), `ADM-ORD-04` (faltan acciones de despacho/cancelación en la UI), `ADM-ORD-06` (PDF no visible), `ADM-ORD-09` (cancelación sin motivo/actor ni reembolso), `ADM-ORD-10` (`picked_up` sin `pickedUpCommerceIds`), `ADM-ORD-11` (driver anterior queda busy), `ADM-ORD-13` (errores silenciosos), `ADM-ORD-14` (sesión admin sin revocación) y `ADM-ORD-15` (carrera al reenviar comprobante).

**Riesgo de integración:** los cambios de estado del admin llegan al cliente y al negocio por SSE, pero no siempre al driver de forma correcta; el caso más grave es un `picked_up` forzado que deja al driver sin poder entregar y un `delivered` forzado que cuenta venta/earning sin checklist ni driver.