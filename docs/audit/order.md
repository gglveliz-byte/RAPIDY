> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de la ruta `/order/:id` — Rapidy (DeliveryCity)

> Alcance: seguimiento de pedido del cliente, desde `/cart` hasta `/order/:id`, mapa, timeline, SSE/polling, acciones y enlaces a `/chat/:orderId`.
> Fecha: 2026-11-13. No se modificó código fuente; este documento es el único artefacto creado.
> Evidencia: rutas `archivo:línea`. Las afirmaciones no verificadas en ejecución se marcan como **hipótesis**.

---

## 1. Resumen ejecutivo

- **La pantalla funciona visualmente, pero su contrato de datos no es confiable.** `order.getById`, `order.updateStatus` y los canales SSE de pedido/repartidor son públicos: cualquier persona puede leer, cancelar o marcar como entregado cualquier pedido con solo conocer/enumerar su ID (`server/order-router.ts:125-174`, `:240-330`; `server/boot.ts:72-127`).
- **P0 de privacidad:** la respuesta de `order.getById` incluye la fila completa de `orders` (comprobante de pago en base64, teléfono, dirección), además de teléfono y GPS del repartidor; `order.list`, `customer.list` y `driver.list` también son públicos (`server/order-router.ts:480-483`, `server/customer-router.ts:111-114`, `server/driver-router.ts:10-26`).
- **P0 de integridad:** `order.updateStatus` no exige autenticación, no valida transiciones ni idempotencia. Un POST anónimo puede pasar un pedido a `delivered`, `cancelled` o reasignar `driverId`, generando además ganancias del repartidor (`server/order-router.ts:263-305`).
- **P1 funcional:** la suscripción SSE de posición del repartidor está muerta. El servidor emite eventos con nombre `update` (`server/boot.ts:82`) y el cliente solo escucha `onmessage` (`src/pages/customer/OrderTracking.tsx:104`), por lo que `driverPos` nunca se actualiza: no hay ETA ni botón “seguir repartidor” (`:163-175`, `:261`). El mapa solo avanza por el polling de 4 s.
- **P1 de sesión:** el guard de cliente confía en `localStorage` y el logout no limpia `qs_session`; tras cerrar sesión, volver a `/order/:id` sigue renderizando la pantalla (`src/hooks/useCustomerSession.tsx:83-93`, `src/components/SessionGuard.tsx:14-21,45-60`).
- **P1 financiero/operativo/seguridad:** el comprobante rechazado puede reabrir un pedido ya `delivered`/`cancelled` (`server/order-router.ts:447-474`); el botón “Completar entrega” no se deshabilita y el backend inserta ganancias en cada llamada `delivered` (`src/pages/driver/DriverOrder.tsx:451-458`, `server/order-router.ts:267-288`); el mapa interpola HTML controlado por merchant/cliente y permite XSS almacenado (`OrderTrackingMap.tsx:56-58`, `:199-214`).
- **P2 de consistencia:** el enum de estados tiene 11 valores, la API principal acepta 10 (sin `payment_rejected`) y la timeline solo conoce 6. `accepted` y `driver_assigned` se muestran como “Procesando pedido — Paso 1 de 6”; en `delivered` el badge puede decir “N/N recogidos” en vez de “Entregado” (`src/pages/customer/OrderTracking.tsx:40-47`; `src/pages/customer/components/OrderTrackingTimeline.tsx:87-97`).
- **P2 de UX/performance:** no hay estado de error/offline real, el texto “En vivo” es permanente aunque SSE esté caído, no hay skeletons, se consulta el pedido completo cada 4 s (incluido el base64 del comprobante) y no existen índices para `order_items.order_id`, `order_status_history.order_id`, `orders.customer_id`, etc.
- **Acciones ausentes:** el cliente no puede cancelar, reagendar, calificar ni reordenar desde `/order/:id`; solo puede abrir el chat. No hay endpoint de cancelación de cliente ni estado de reembolso.

---

## 2. Flujo end-to-end

### 2.1 Entrada desde `/cart`

1. `Cart.tsx` calcula `deliveryFee` y `commission` en el cliente (`src/pages/customer/Cart.tsx:70-73`) y llama `order.create` con esos valores (`:135-148`).
2. El backend crea la orden con estado `pending_payment` si es transferencia o `received` si es efectivo (`server/order-router.ts:67-79`), inserta ítems, historial y estados por comercio (`:83-108`). En transferencia no emite `new_order` a comercios hasta que el pago se valide (`:113-118`).
3. La pantalla de éxito muestra “Seguir pedido” y navega a `/order/${orderId}` (`src/pages/customer/Cart.tsx:161-187`, `:173`).
4. Si `order.create` falla, el `catch` solo hace `console.error` (`Cart.tsx:154-156`): el modal ya se cerró y el usuario no recibe feedback.

### 2.2 Render de `/order/:id`

1. `App.tsx` monta la ruta lazy bajo `SessionGuard role="customer"` (`src/App.tsx:20`, `:99`).
2. `SessionGuard` decide con `localStorage` (`qs_session` + `customer_session`), sin validar la cookie contra el servidor (`src/components/SessionGuard.tsx:14-21`).
3. `OrderTracking` toma `:id`, ejecuta `useOrder(Number(id))` y `useOrderEvents(Number(id), utils)` (`src/pages/customer/OrderTracking.tsx:50-54`).
4. `useOrder` hace GET a `/api/trpc/order.getById` con `{ id }`, `credentials: "include"`, y polling cada 4 s mientras el estado no sea terminal (`src/hooks/useDeliveryData.ts:224-239`).
5. `order.getById` es `publicQuery`, no recibe contexto ni compara dueño; devuelve la orden completa + ítems + historial + repartidor + comercios + estados por comercio (`server/order-router.ts:125-174`).
6. `useOrderEvents` abre `EventSource('/api/events/orders/:id')`, escucha el evento nombrado `update` e invalida las queries de pedido y chat (`src/hooks/useOrderEvents.ts:47-59`, `:117-124`).
7. En paralelo, un segundo `EventSource` se abre contra `/api/events/driver/:driverId` (`OrderTracking.tsx:100-120`); por el bug de evento nombrado, no actualiza nada.
8. Se geocodifica `order.deliveryAddress` contra Nominatim desde el navegador (`OrderTracking.tsx:82-97`).
9. Se renderizan `OrderTrackingMap`, `OrderTrackingTimeline` y `OrderTrackingDetails`; el chat se abre con `ChatBubble` (`OrderTracking.tsx:214-250`).
10. Si `order.status === "delivered"`, un temporizador redirige a `/home` a los 6 s (`OrderTracking.tsx:127-132`).

### 2.3 Actualizaciones desde el repartidor

- `DriverHome` envía la ubicación cada 15 s con `driver.updateLocation` (`src/pages/driver/DriverHome.tsx:87-107`), que emite `driver:{id}` con `location_update` (`server/driver-router.ts:86-92`).
- `DriverOrder` cambia estados llamando a `order.updateStatus` **público** (`src/pages/driver/DriverOrder.tsx:66-68`, `:132-149`), que emite `order:{id}` con `status_update` (`server/order-router.ts:316-319`).
- El comercio marca “Listo” con `commerce.markReady`; cuando todos están listos se actualiza la orden y se emite `status_update` + `commerce_ready` (`server/commerce-router.ts:195-235`).
- El cliente recibe el evento, invalida `order.getById` y TanStack Query vuelve a pedir el pedido completo. El polling de 4 s actúa como fallback.

### 2.4 Diagrama ASCII

```
[/cart]
  │ confirmOrder(): order.create {customerId, items, deliveryFee, commission, receipt}
  ▼
[POST /api/trpc/order.create]  (customerQuery)
  │ cash → received | transfer → pending_payment
  └─ éxito → pantalla "Pedido confirmado" → navigate(`/order/${id}`)
                              │
                              ▼
                    [/order/:id]  (lazy + SessionGuard customer)
                              │
       ┌──────────────────────┼───────────────────────────┐
       │                      │                           │
       ▼                      ▼                           ▼
 useOrder(getById)      useOrderEvents               EventSource driver
 polling 4 s            /api/events/orders/:id       /api/events/driver/:id
 (custom hook)          (evento "update")            (NO auth; onmessage roto)
       │                      │                           │
       ▼                      ▼                           ▼
 tRPC publicQuery ──────► invalida query            setDriverPos (nunca)
       │                      │                           │
       ▼                      ▼                           ▼
 PostgreSQL            refetch getById            ETA / follow (nunca)
       │
       ├─ OrderTrackingMap (Leaflet + CartoDB + Nominatim)
       ├─ OrderTrackingTimeline (statusSteps sintéticos, sin history)
       └─ OrderTrackingDetails (ítems/totales/dirección)
                              │
                              └─ ChatBubble → /chat/:orderId
                                                └─ chat.getByOrder (público, polling 5 s)
```

```
Driver app                          Server                              Customer /order
──────────                          ──────                              ───────────────
geolocation watch 15 s
  └─ driver.updateLocation ───────► emit driver:{id} location_update ──► EventSource driver (roto)
DriverOrder "Completar entrega"
  └─ order.updateStatus (público) ─► orders.status=delivered
                                     ├─ insert driver_earnings (sin idempotencia)
                                     ├─ emit order:{id} status_update ──► invalidate + refetch
                                     └─ handlePushNotification ─────────► push al cliente
Comercio "Marcar listo"
  └─ commerce.markReady ───────────► si todos listos: status=ready_for_pickup
                                     ├─ emit order:{id} status_update
                                     ├─ emit order:{id} commerce_ready
                                     ├─ emit driver:{id} new_available
                                     └─ push (2 notificaciones)
```

### 2.5 Diagrama de estados

```
                       (transfer)                         (admin valida)
  order.create ───────────────► pending_payment ──────────────────────► received
       │                              │                                   │
       │ (cash)                       │ (admin rechaza)                   │ (comercio acepta)
       └──────────────────────────────┼──────────────► payment_rejected   ▼
                                      │                     │          preparing
                                      │ (cliente re-sube)   │              │
                                      └─────────────────────┘              │ (todos los comercios listos)
                                                                           ▼
                                                                   ready_for_pickup
                                                                           │
                                              (driver.acceptOrder) ────────┤
                                                                           │ (todos los comercios recogidos)
                                                                           ▼
                                                                       picked_up
                                                                           │ (driver)
                                                                           ▼
                                                                       on_the_way
                                                                           │ (driver)
                                                                           ▼
                                                                       delivered (terminal)
```

Estados “laterales” que el flujo normal no produce:

```
received ──(admin)──► accepted                    (enum sin uso real)
cualquiera ──(admin assignDriver)──► driver_assigned
cualquiera ──(admin updateOrderStatus)──► cancelled | delivered | payment_rejected | cualquier estado
```

Reglas reales observadas:

- `payment_rejected` **solo** lo puede escribir `admin.updateOrderStatus` (`server/admin/orders-router.ts:196-212`); el enum de `order.updateStatus` no lo incluye (`server/order-router.ts:244-255`).
- El cliente no tiene procedimiento de cancelación; el comercio sí puede “Rechazar” con `order.updateStatus` desde su UI (`src/pages/commerce/Orders.tsx:326-332`), que es público.
- `driver.acceptOrder` también acepta órdenes en `preparing` y las fuerza a `ready_for_pickup` (`server/driver-router.ts:223-250`), aunque la UI solo ofrece aceptar cuando ya están listas.
- No hay validación de transición, idempotencia ni “solo el driver asignado puede entregar”.

---

## 3. Inventario de archivos

| Archivo | Rol en la ruta |
|---|---|
| `src/pages/customer/OrderTracking.tsx` | Orquestador: fetch, SSE driver, geocode, ETA, auto-redirect, composición |
| `src/pages/customer/components/OrderTrackingMap.tsx` | Leaflet, marcadores, polilínea, follow driver, barra del repartidor |
| `src/pages/customer/components/OrderTrackingTimeline.tsx` | Badge de estado, progreso, banner payment_rejected, lista de comercios |
| `src/pages/customer/components/OrderTrackingDetails.tsx` | Ítems, subtotal/envío/comisión/total, dirección, celebración delivered |
| `src/hooks/useDeliveryData.ts` | `useOrder` (polling 4 s), `useUpdatePaymentReceipt`, `trpcCall`/auth handling |
| `src/hooks/useOrderEvents.ts` | SSE con reconexión para pedidos/comercio/driver |
| `src/hooks/useCustomerSession.tsx` | Sesión de cliente en localStorage, checkAuth, logout, refresh |
| `src/hooks/useSessionSync.ts` | Sincronización de `qs_session` entre pestañas |
| `src/hooks/usePushNotifications.ts` | Registro FCM y toast en primer plano |
| `src/hooks/useDriverNotification.ts` | Toast/sonido/vibración de nuevo pedido (driver) |
| `src/components/SessionGuard.tsx` | Guard de rol customer/admin/merchant/driver |
| `src/components/CustomerBottomNav.tsx` | Navegación inferior (no se usa en `/order`) |
| `src/components/PageTransition.tsx` | Transición de 120 ms alrededor de la ruta |
| `src/components/ChatBubble.tsx` | FAB que enlaza a `/chat/:orderId` |
| `src/lib/leaflet-fix.ts` | Icono por defecto de Leaflet (importado globalmente) |
| `src/lib/locationUtils.ts` | Geocodificación inversa Nominatim |
| `server/order-router.ts` | `getById`, `updateStatus`, `updatePaymentReceipt`, `create`, `markCommerceReady` |
| `server/driver-router.ts` | `updateLocation`, `acceptOrder`, `markCommercePickup`, historial |
| `server/chat-router.ts` | `send`, `getByOrder`, `markAsRead` |
| `server/customer-router.ts` | Auth de cliente, `getById`, `list`, device token |
| `server/events.ts` | Bus SSE en memoria + push FCM por cada evento |
| `server/boot.ts` | Rutas SSE crudas, CSP, montaje de tRPC |
| `server/middleware.ts` | `publicQuery`, `customerQuery`, `driverQuery`, `merchantQuery`, `adminQuery` |
| `server/context.ts` | Resolución de cookies customer/admin/driver/merchant |
| `db/schema.ts` | `orders`, `order_items`, `order_status_history`, `order_commerce_status`, `drivers`, `customers`, `chat_messages`, `driver_earnings` |
| `src/pages/customer/Cart.tsx` | Entrada a `/order/:id`; cálculo cliente de fees/comisión |
| `src/pages/customer/Profile.tsx` | Historial y enlaces a `/order/:id` |
| `src/pages/customer/components/ProfileOrdersModal.tsx` | Historial completo y enlaces a `/order/:id` |
| `src/pages/customer/Chat.tsx` | Chat del pedido (polling 5 s, sin auth de orden) |
| `src/App.tsx` | Ruta `/order/:id`, lazy load, SessionGuard |
| `src/index.css`, `tailwind.config.js`, `index.html` | Tokens, safe-area, tipografía, viewport, CSP |

No existe tabla `addresses`: la dirección vive como texto libre en `customers.address` (`db/schema.ts:71`) y `orders.deliveryAddress` (`db/schema.ts:171`), sin latitud/longitud de destino. Eso obliga a geocodificar en cada visita.

---

## 4. Tabla de hallazgos

Severidades: **P0** bloqueante/seguridad crítica; **P1** alta; **P2** media; **P3** baja/deuda.

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| P0-01 | P0 | Seguridad / IDOR | `server/order-router.ts:125-174`, `:176-185`, `:480-483` | `getById`, `getByCustomer` y `list` son `publicQuery`; no comparan `ctx.customer`/dueño. `getById` devuelve la fila completa de `orders` (incluido `paymentReceipt` base64), ítems, historial, teléfono/GPS del driver y dirección. | Cualquiera enumera IDs y lee todos los pedidos, comprobantes y PII. La pantalla nunca muestra “otro usuario” porque no hay control. | `customerQuery` + verificación `order.customerId === ctx.customer.id`; procedures separados para driver/comercio/admin; proyección mínima; receipts en endpoint autorizado. |
| P0-02 | P0 | Seguridad / integridad | `server/order-router.ts:240-330` | `updateStatus` es `publicQuery`, acepta `driverId` opcional y cualquier estado del enum de 10 valores, sin autenticación, dueño ni matriz de transición. | Un POST anónimo puede cancelar, entregar, reasignar o reabrir cualquier pedido; inserta ganancias y marca drivers `busy`. | Separar `customer/driver/merchant/admin`; auth + ownership; matriz de transiciones; bloqueo `FOR UPDATE`; idempotencia. |
| P0-03 | P0 | Seguridad / privacidad | `server/boot.ts:72-89`, `:91-108`, `:110-127`; `server/events.ts:9` | Los SSE `/api/events/orders/:orderId`, `/commerce/:id` y `/driver/:driverId` no validan cookie ni autorizan el canal; solo admin tiene chequeo (`boot.ts:130-147`). | Cualquiera puede suscribirse a la vida de cualquier pedido y a la ubicación GPS de cualquier driver; canal en memoria enumerable por ID. | Resolver sesión en la ruta SSE y autorizar canal; tokens firmados de corta vida; rate limit; canales privados por usuario. |
| P0-04 | P0 | Seguridad / suplantación | `server/chat-router.ts:9-35`, `:37-51` | `chat.send`, `chat.getByOrder` y `markAsRead` son públicos; `senderType`, `senderId` y `senderName` vienen del cliente. | Cualquiera lee el chat de cualquier pedido, envía mensajes como “customer”, “driver” o “commerce” y marca leídos. | `customerQuery`/`driverQuery`/`merchantQuery` + verificar participación en la orden; derivar `senderId`/`senderName` del contexto. |
| P0-05 | P0 | Privacidad / datos | `server/customer-router.ts:85-91`, `:111-114`; `server/driver-router.ts:10-26`; `server/order-router.ts:198-238` | `customer.getById/list` devuelven la fila completa, incluido `fcmToken`; `driver.list` expone teléfono, GPS y comisión; `getAvailableForDriver` expone teléfono/dirección de pedidos listos sin auth. | Fuga masiva de PII y tokens de notificación; los drivers y clientes son enumerables. | `adminQuery` para listados; proyección explícita; excluir `fcmToken`, `passwordHash`, GPS y comisión del catálogo público. |
| P1-01 | P1 | Bug SSE | `src/pages/customer/OrderTracking.tsx:100-120`; `server/boot.ts:82`; comparar `src/hooks/useOrderEvents.ts:47-59` | El cliente escucha `eventSource.onmessage`, pero el servidor emite `event: "update"`. Los eventos nombrados no llegan a `onmessage`. | `driverPos` queda `null`: **ETA nunca se muestra** (`:163-175`) y el botón de seguir repartidor nunca aparece (`:261`). El mapa solo se mueve por polling de 4 s. | Usar `addEventListener("update", …)`, mantener estado `connected`, reconectar con backoff y cerrar en estado terminal. |
| P1-02 | P1 | Auth / sesión | `src/hooks/useCustomerSession.tsx:58-74`, `:83-93`; `src/components/SessionGuard.tsx:14-21`, `:45-60` | El logout borra `customer_session` pero no `qs_session`; el guard de cliente confía en localStorage y, si `isAuthenticated` es falso pero `qs_session` existe, tras 600 ms renderiza igual. `checkAuth` nulo no limpia nada. | Tras cerrar sesión o expirar la cookie, navegar de nuevo a `/order/:id` sigue mostrando el pedido (además el endpoint es público). | Limpiar `qs_session` en logout/401; validar sesión contra servidor en el guard; no renderizar contenido si `!customer`; usar un solo estado de sesión. |
| P1-03 | P1 | Lógica de negocio | `server/order-router.ts:447-474` | `updatePaymentReceipt` verifica dueño, pero no el estado actual: siempre setea `status="pending_payment"` (`:456-460`). | Un pedido `delivered` o `cancelled` puede reabrirse subiendo un comprobante; se corrompe historial y contabilidad. | Permitir solo `pending_payment`/`payment_rejected`; validar archivo y tamaño; auditar el cambio; notificar a admin. |
| P1-04 | P1 | Finanzas / idempotencia | `server/order-router.ts:263-305`; `src/pages/driver/DriverOrder.tsx:451-458` | `delivered` inserta `driver_earnings` en cada llamada, sin comprobar estado previo ni existencia de ganancia. El botón “Completar entrega” no se deshabilita durante la mutación. | Doble clic o reintento duplica ganancias, historial y push; el repartidor cobra dos veces. | `UPDATE ... WHERE status <> 'delivered'` + `UNIQUE(order_id)` en earnings; botón `disabled={isPending}`; idempotency key. |
| P1-05 | P1 | Auth / driver | `server/driver-router.ts:209-271`, `:273-349`, `:163-186` | `acceptOrder` no compara `ctx.driver.id` con `input.driverId`; `markCommercePickup` valida `order.driverId === input.driverId` pero no el contexto; `getOrderHistory` no valida dueño. | Un driver autenticado puede aceptar/operar pedidos a nombre de otro y ver su historial con teléfono/dirección del cliente. | Comparar siempre `ctx.driver.id`; derivar `driverId` del contexto, no del input; autorizar historial. |
| P1-06 | P1 | Seguridad / XSS | `src/pages/customer/components/OrderTrackingMap.tsx:56`, `:58`, `:199`, `:214`; `server/commerce-router.ts:49-88`; `server/boot.ts:28` | HTML construido con template strings e interpolación directa: logo/nombre del comercio (controlados por merchant) y dirección/nombre del driver en popups. `safeImage` no escapa. CSP permite `unsafe-inline`. | XSS almacenado en la sesión del cliente al abrir el seguimiento; puede ejecutar acciones autenticadas y exfiltrar datos. | Crear nodos DOM y usar `textContent`; escapar HTML; validar URLs (https); sanitizar popups; endurecer CSP. |
| P1-07 | P1 | Privacidad / tracking | `server/order-router.ts:146-157`; `server/driver-router.ts:74-95`; `:198-238` | `getById` público devuelve `phone`, `currentLat` y `currentLng` del driver incluso en pedidos terminales; el canal driver es público; `getAvailableForDriver` público expone dirección/teléfono. | Stalking de repartidores y clientes; un atacante puede seguir el GPS en tiempo real y cosechar PII. | Exponer solo nombre y teléfono enmascarado durante pedido activo; ocultar coordenadas tras `delivered`/`cancelled`; autenticar canal y auditar accesos. |
| P1-08 | P1 | Negocio / contrato | `server/order-router.ts:10-27`, `:44-64`, `:83-92`; `src/pages/customer/Cart.tsx:70-73`, `:146-147`; `OrderTrackingDetails.tsx:76-90` | El cliente envía `deliveryFee`, `commission` y `commerceId` por ítem; el servidor usa esos valores para `total` y para atribución, sin recalcular desde settings/producto. Además `total = subtotal + deliveryFee` no incluye la comisión que la UI muestra como “Tarifa de servicio”. | Se pueden poner fees/comisión en 0 o atribuir ítems a otro comercio; descuadre de liquidaciones y total que no cuadra visualmente. | Calcular fees/comisión server-side; validar `product.commerceId`; ignorar montos del cliente; aclarar si la comisión la paga el comercio o el cliente. |
| P1-09 | P1 | Auth / multi-tenant | `server/commerce-router.ts:180-241`; duplicado en `server/order-router.ts:332-394` | `markReady` es `merchantQuery`, pero no usa `ctx.merchant` para verificar que el comercio le pertenece; cualquier merchant puede marcar listo el pedido de otro. | Salto de estado a `ready_for_pickup`, drivers notificados antes de tiempo, manipulación entre comercios. | Verificar `commerces.merchantUserId === ctx.merchant.id`; eliminar el endpoint duplicado. |
| P1-10 | P1 | UX / errores | `src/hooks/useDeliveryData.ts:224-239`; `src/pages/customer/OrderTracking.tsx:135-157` | `useOrder` solo expone `data/loading`; no hay `isError` ni retry. Un 500, un fallo de red o un 404 se renderizan igual como “Pedido no encontrado”. | El usuario cree que su pedido desapareció; no puede reintentar; se oculta un outage. | Devolver `error`, `isError`, `refetch`; distinguir 404/401/red; pantalla de error con “Reintentar” y estado offline. |
| P2-01 | P2 | Contrato / estados | `db/schema.ts:18-30`; `server/order-router.ts:244-255`; `server/admin/orders-router.ts:196-212`; `src/pages/customer/OrderTracking.tsx:40-47` | DB tiene 11 estados; `updateStatus` acepta 10 (sin `payment_rejected`); admin acepta 11; la timeline conoce 6 (sin `pending_payment`, `payment_rejected`, `accepted`, `driver_assigned`). | `accepted`/`driver_assigned`/`pending_payment` caen en `currentStepIndex=-1`: 0 % de progreso, “Procesando pedido…”, “Paso 1 de 6”. | Fuente única de estados + labels + iconos + colores; mapa explícito para cada valor; tests de contrato. |
| P2-02 | P2 | UI / badge | `src/pages/customer/components/OrderTrackingTimeline.tsx:87-97` | La condición `hasDriver && commerces.some(status !== "preparing")` tiene prioridad sobre el paso actual. En `delivered` con todos recogidos muestra “N/N recogidos” en vez de “Entregado”; al aceptar el driver muestra “0/N recogidos” en vez de “Listo”. | Estado terminal mal comunicado; confusión en el momento de la entrega. | Evaluar primero `cancelled`/`delivered`/`payment_rejected`; usar `pickedUpCommerceIds` y el paso actual para el resto. |
| P2-03 | P2 | UX / navegación | `src/pages/customer/OrderTracking.tsx:127-132`; `src/pages/customer/Profile.tsx:276`; `src/pages/customer/components/ProfileOrdersModal.tsx:275` | Cualquier pedido `delivered` redirige a `/home` a los 6 s, incluso si el usuario entró desde el historial para revisar ítems. | El historial es ilegible: la página se cierra sola; no se puede revisar un pedido entregado. | Redirigir solo justo después del checkout (flag de navegación) o eliminar el timer; ofrecer CTA manual. |
| P2-04 | P2 | UX / cancelación | `src/pages/customer/components/OrderTrackingTimeline.tsx:99-104`; `OrderTrackingDetails.tsx:95`, `:124` | En `cancelled` se oculta la timeline y el destino; solo queda el badge “Cancelado”. No se muestra motivo, hora, reembolso ni historial. `history` viene del backend pero nunca se renderiza. | El cliente no sabe por qué se canceló ni qué pasa con su dinero; aumenta soporte y reclamos. | Mostrar `order.history` con notas/fechas, estado de reembolso y CTA de contacto/reordenar. |
| P2-05 | P2 | UX / offline | `src/pages/customer/OrderTracking.tsx:206-210`; `src/hooks/useOrderEvents.ts:26-29`, `:83-95`; `src/hooks/useAdminSSE.ts:8`, `:22-28` | “En vivo” con `animate-ping` se muestra siempre, aunque SSE haya muerto o el dispositivo esté offline. La reconexión se rinde a los 10 intentos y solo escribe en consola; no hay estado `connected`. | Falsa sensación de tiempo real; el usuario no sabe que ve datos congelados. | Exponer `connected/connecting/offline`; cambiar el badge; banner “sin conexión, mostrando últimos datos”; reintentar al volver online. |
| P2-06 | P2 | UI / carga | `src/pages/customer/OrderTracking.tsx:135-157`; `src/components/SessionGuard.tsx:87-93`; `src/App.tsx:59-65` | Hay tres pantallas de carga distintas (fallback `#0A0A0D`, guard `#F7F7FA`, spinner dentro de la página) y no hay skeleton con el layout final. | Layout shift y flash de color; percepción de lentitud; el header/mapa aparecen de golpe. | Skeleton con header/mapa/cards; unificar color de carga; reservar alturas. |
| P2-07 | P2 | UI / mapa | `src/pages/customer/OrderTracking.tsx:82-97`; `OrderTrackingMap.tsx:193-202` | Si Nominatim falla o no encuentra la dirección, `catch` vacío y no se pinta marcador de destino; no hay mensaje ni reintento. El mapa queda centrado en Quito por defecto (`:113`). | El usuario no ve su destino y no entiende por qué; en otra ciudad el mapa queda en una ubicación incorrecta. | Estado de error del geocode, reintento, fallback a coordenadas del comercio y mensaje textual. |
| P2-08 | P2 | Privacidad / red | `src/pages/customer/OrderTracking.tsx:82-97`; `src/lib/locationUtils.ts:1-13` | Se envía la dirección completa a Nominatim en cada visita, sin caché, debounce, `AbortController` ni consentimiento. `User-Agent` es cabecera prohibida en navegador y no se aplica. | PII a un tercero, rate limit de Nominatim, peticiones duplicadas y `setState` tras desmontar. | Geocodificar al crear el pedido y guardar lat/lng; o proxy server-side con caché; abortar al desmontar; aviso de privacidad. |
| P2-09 | P2 | Performance / mapa | `src/pages/customer/components/OrderTrackingMap.tsx:165-240` | En cada cambio de `order`/`driverPos`/`deliveryCoords` se eliminan todos los marcadores de comercio y se recrean (`:169-190`), y se ejecuta `fitBounds` (`:237-239`). | Parpadeo de pines y reseteo del zoom/pan del usuario en cada actualización; con SSE arreglado sería cada 15 s. | Diff de marcadores por ID; `fitBounds` solo la primera vez o al pulsar “centrar”; memoizar iconos. |
| P2-10 | P2 | Performance / bundle | `src/main.tsx:5`; `src/lib/leaflet-fix.ts:1-12`; `vite.config.ts:27-36` | `leaflet-fix` se importa globalmente en `main.tsx`, arrastrando Leaflet (~150 KB) a la carga inicial de todas las rutas, aunque el mapa está en un chunk lazy. | Peor TTI en Welcome/Home; el chunk `maps` se descarga antes de necesitarlo. | Importar el fix solo en páginas con mapas o eliminarlo (los mapas usan `divIcon`); cargar Leaflet dinámicamente. |
| P2-11 | P2 | Performance / red | `src/hooks/useDeliveryData.ts:229-236`; `src/hooks/useOrderEvents.ts:117-124`; `server/order-router.ts:173` | Polling fijo de 4 s **y** SSE invalidando la misma query. Cada respuesta trae orden completa + ítems + historial + comercios + `paymentReceipt` base64. | ~900 requests/hora por espectador, payload potencialmente de MB, batería/datos y carga DB; eventos duplican refetch. | SSE como primario; polling de 30-60 s solo si SSE cae; endpoint de estado ligero; no devolver receipt/history en el poll. |
| P2-12 | P2 | DB / performance | `db/schema.ts` (sin `index()`); `server/order-router.ts:129-171` | No hay índices explícitos para `order_items.order_id`, `order_status_history.order_id`, `order_commerce_status.order_id`, `orders.customer_id`, `orders.driver_id`, `chat_messages.order_id`. `getById` hace 4-6 queries secuenciales por poll. | Seq scans y latencia creciente; N+1 por cada visitante cada 4 s. | Índices compuestos/parciales; joins o `json_agg`; cache corto de la orden. |
| P2-13 | P2 | Validación / archivos | `src/pages/customer/OrderTracking.tsx:64-79`; `server/order-router.ts:447-449` | No se valida tipo/tamaño del comprobante; se convierte a base64 y se envía como string. `bodyLimit` es 50 MB (`server/boot.ts:34`), base64 crece ~33 %. Errores con `alert()` nativo. | Fotos grandes fallan con error genérico; memoria/DB inflada; UX bloqueante. | Validar MIME y tamaño (p. ej. 5 MB), comprimir, subir a storage y guardar URL; feedback inline. |
| P2-14 | P2 | Accesibilidad | `src/pages/customer/components/OrderTrackingTimeline.tsx:119-124`, `:109-115` | La barra de progreso es un `div` sin `role="progressbar"`, sin `aria-valuenow`; no hay región `aria-live` para anunciar cambios de estado. | Lectores de pantalla no anuncian “En camino”/“Entregado”; el usuario ciego no percibe el cambio. | `role="status"`/`aria-live="polite"` en el estado; `role="progressbar"`; anunciar también el paso. |
| P2-15 | P2 | Accesibilidad / visual | `src/pages/customer/OrderTracking.tsx:207`, `:194-200`; `OrderTrackingTimeline.tsx:83-95`, `:144`; `OrderTrackingDetails.tsx:87-89` | `#FF6A00` sobre blanco ronda 2.9:1; `text-zinc-400` a 9-11 px ronda 2.5:1; el texto blanco sobre botones naranjas también queda bajo AA. Etiquetas de pasos a 9 px y ocultas en móvil. | Baja legibilidad y fallo WCAG AA; especialmente sol/visión reducida. | Oscurecer naranja para texto o usar fondo oscuro; mínimo 12 px; `zinc-500/600`; verificar contraste con axe. |
| P2-16 | P2 | UI / safe-area | `src/pages/customer/OrderTracking.tsx:180`; `src/components/ChatBubble.tsx:33`; `src/index.css:127-142` | El header `sticky top-0` no usa `pt-safe`; el FAB usa `bottom-6` sin `env(safe-area-inset-bottom)`. `viewport-fit=cover` + `black-translucent` (`index.html:5-7`). | En iPhone con notch/home indicator el header queda bajo la barra de estado y el FAB invade el gesto inferior. | `pt-safe` en header; `bottom: calc(1.5rem + env(safe-area-inset-bottom))`; probar en standalone PWA. |
| P2-17 | P2 | Accesibilidad / táctil | `src/pages/customer/OrderTracking.tsx:184`; `OrderTrackingMap.tsx:264` | Botón volver 36×36 px y “centrar en repartidor” 40×40 px, por debajo de la guía iOS de 44×44. | Toques fallidos, especialmente con una mano. | `min-w-11 min-h-11` o `.touch-target`; mantener icono visual. |
| P2-18 | P2 | Visual / tipografía | `index.html:15-17`; `server/boot.ts:28`; `src/index.css:88` | La fuente Outfit se carga desde Google Fonts, pero el CSP configurado en el servidor Node solo permite `style-src 'self' 'unsafe-inline'` y `font-src 'self' data:`. En self-host/producción Node el navegador bloquea la hoja y los archivos; se usa el fallback del sistema. En Vercel el HTML estático podría no recibir ese header (**hipótesis**). | La tipografía de toda la app (incluida `/order`) no es la diseñada; FOUT/fallback inconsistente. | Self-host de Outfit o permitir `fonts.googleapis.com`/`fonts.gstatic.com` en CSP (y verificar headers en Vercel). |
| P2-19 | P2 | Duplicación / copy | `src/pages/customer/Profile.tsx:55-63`; `ProfileOrdersModal.tsx:64-113`; `src/pages/commerce/Orders.tsx:89-105`; `src/pages/admin/Orders.tsx:16-43`; `OrderTracking.tsx:40-47` | Cinco mapas de estado distintos. El preview de Profile muestra `received`, `on_the_way`, `ready_for_pickup` en bruto; el modal los traduce distinto; commerce/admin tienen otros labels/colores. | El mismo pedido se ve con distinto nombre/color según la pantalla; faltan estados. | Módulo compartido `orderStatus.ts` con label, shortLabel, color, icon, step, terminal y allowedTransitions. |
| P2-20 | P2 | Push / backend | `server/events.ts:11-26`, `:52-66`, `:69-89`; `server/driver-router.ts:92`; `server/chat-router.ts:22` | `emit` dispara push para **cualquier** evento. `location_update` cada 15 s genera push al driver; `chat_message` genera push al cliente, incluso si el mensaje lo envió él mismo; `ready_for_pickup` emite `status_update` + `commerce_ready` y produce dos push. | Spam de notificaciones, costo FCM, batería y duplicados; el usuario puede desactivar notificaciones. | Filtrar tipos relevantes; excluir `location_update` y mensajes propios; deduplicar por `orderId+status`; cola/outbox. |
| P2-21 | P2 | UI / layout | `src/components/ChatBubble.tsx:33`; `src/index.css:109-118`; `CustomerBottomNav.tsx:41-42` | El FAB es `fixed right-4` sin `max-width` ni alineación al contenedor móvil. En desktop/tablet aparece en el borde de la ventana, lejos de la columna de 480 px. | Aspecto roto en pantallas grandes; el botón queda fuera del “teléfono”. | Envolver en un contenedor `fixed inset-x-0 bottom-0 max-w-[480px] mx-auto` o usar `position: sticky` dentro de `.mobile-container`. |
| P2-22 | P2 | UX / checkout | `src/pages/customer/Cart.tsx:132-158` | `confirmOrder` cierra el modal y setea `loading`, pero el `catch` solo hace `console.error`; no hay toast ni mensaje inline. | Si falla la creación (red, validación, stock), el usuario vuelve al carrito sin saber qué pasó. | Mostrar error en el modal, mantenerlo abierto y permitir reintentar. |
| P2-23 | P2 | Producto / acciones | `src/pages/customer/OrderTracking.tsx:249-250` | La página solo ofrece chat. No hay cancelar, reagendar, calificar ni reordenar. No existe endpoint de cancelación de cliente ni tabla de ratings de pedido/reembolsos. | El cliente debe contactar soporte para lo básico; no hay recuperación post-entrega. | Definir acciones por estado; endpoints autorizados; UI con confirmación y motivos; reembolso y rating. |
| P2-24 | P2 | Accesibilidad | `index.html:5` | `maximum-scale=1.0, user-scalable=no` impide zoom. | WCAG 1.4.4; usuarios con baja visión no pueden ampliar el texto del pedido. | Quitar `maximum-scale`/`user-scalable`; usar `viewport-fit=cover` sin bloquear zoom. |
| P2-25 | P2 | Backend / eventos | `server/commerce-router.ts:226-235`; comparar `server/order-router.ts:379-391` | `commerce.markReady` emite `new_available`, `status_update` y `commerce_ready` **dentro** de la transacción; si la transacción revierte, los clientes reciben un evento fantasma y refrescan un estado que no existe. La implementación duplicada sí emite después del commit. | Notificaciones/estado inconsistentes y refetch inútil; drivers reciben pedidos que no están listos. | Emitir después del commit (outbox/after-commit); unificar la implementación. |
| P3-01 | P3 | ETA | `src/pages/customer/OrderTracking.tsx:163-175`; `OrderTrackingMap.tsx:285-289` | ETA = distancia haversine × 3 min, sin ruta, tráfico, paradas ni pickup; se etiqueta como minutos exactos. | ETA engañosa; puede no mostrarse nunca por P1-01. | Usar routing real (OSRM/Google), velocidad histórica y paradas; mostrar “aprox.” con rango. |
| P3-02 | P3 | Fechas / TZ | `db/schema.ts:176-177`; `OrderTracking.tsx:195-200` | `timestamp` sin zona horaria; el cliente convierte con `toLocaleDateString` local. Si el TZ del servidor/DB difiere, la hora mostrada se desplaza. **Hipótesis** no verificada en despliegue. | Hora de creación incorrecta en algunos entornos. | `timestamp with time zone`, serializar ISO UTC y formatear con `timeZone` explícita. |
| P3-03 | P3 | Payload muerto | `server/order-router.ts:132-142`, `:173` | `history` y `commerceStatuses` se devuelven en cada `getById` pero la UI no los usa. | Payload extra en cada poll de 4 s. | Incluir solo si se renderiza historial; si no, eliminarlos. |
| P3-04 | P3 | Deuda / duplicados | `server/order-router.ts:187-196`, `:332-394`, `:480-483`; `src/hooks/useAdminSSE.ts:7-89` vs `useOrderEvents.ts:9-110` | `getByDriver`, `list` y `markCommerceReady` no tienen uso cliente; `markReady` está duplicado; hay dos implementaciones de reconexión SSE. | Superficie de ataque y mantenimiento duplicado. | Eliminar endpoints muertos; unificar reconexión en un hook genérico. |
| P3-05 | P3 | Fuga / Leaflet | `src/pages/customer/components/OrderTrackingMap.tsx:26-33`, `:106`, `:128-162` | Se inyecta un `<style>` global por import y no se elimina; la animación `requestAnimationFrame` no se cancela al desmontar. | Nodos/estilos residuales en HMR/navegación; trabajo tras unmount. | Cleanup de `style` y `cancelAnimationFrame` en `useEffect`. |
| P3-06 | P3 | Leaflet / refs | `OrderTrackingMap.tsx:108-125`, `:190-234` | Al removerse el mapa se limpia `mapRef` pero no `driverMarkerRef`, `deliveryMarkerRef` ni `polylineRef`. En un remount del mismo componente (StrictMode dev) se animan/actualizan capas detached y no se re-agregan. **Hipótesis** verificable con doble mount. | En desarrollo/HMR pueden faltar marcadores tras remount. | Resetear refs en el cleanup del ref callback y recrear capas si `mapRef` cambió. |
| P3-07 | P3 | Legal / mapa | `OrderTrackingMap.tsx:112-117` | `attributionControl:false` y no se muestra atribución de OpenStreetMap/CartoDB. | Incumple términos de uso de tiles. | Mostrar atribución (`attributionControl` o texto). |
| P3-08 | P3 | Navegación | `src/pages/customer/OrderTracking.tsx:183-188` | El botón volver siempre va a `/home`, no a `navigate(-1)` ni al historial. | Si se entró desde Profile/Chat, se pierde el contexto. | Usar historial con fallback a `/home`, o `location.state.from`. |
| P3-09 | P3 | UI / truncado | `OrderTrackingDetails.tsx:48-50` | Badge de cantidad `w-6` (24 px) para textos como “0.50x”/“1.5x”; puede desbordar o recortarse. | Pequeño defecto visual en pedidos por peso. | `min-w-6 w-auto px-1.5` y `text-[10px]` si hace falta. |
| P3-10 | P3 | UX / alertas | `OrderTracking.tsx:72-74`; `src/hooks/useDeliveryData.ts:11-30` | Se usa `alert()` nativo para éxito/error; si la sesión expira, el catch muestra error y además `handleAuthError` redirige. | Doble feedback y bloqueo; no accesible/estilizado. | Toast/inline con estados; manejar 401 antes del alert. |
| P3-11 | P3 | Accesibilidad / motion | `OrderTracking.tsx:192`; `OrderTrackingDetails.tsx:126`; `ChatBubble.tsx:37` | `animate-ping`, `animate-bounce` y `animate-pulse` sin `motion-reduce`. | Molesto para usuarios con sensibilidad al movimiento. | `motion-reduce:animate-none`; respetar `prefers-reduced-motion`. |
| P3-12 | P3 | Accesibilidad / teclado | `OrderTrackingMap.tsx:262-270` | El botón follow no expone `aria-pressed`; el mapa no tiene alternativa textual ni navegación por teclado a marcadores. | Estado no anunciado y mapa inaccesible por teclado. | `aria-pressed={followDriver}`; `aria-label` en el contenedor; lista textual de comercio/destino. |
| P3-13 | P3 | Arquitectura / tipos | `src/providers/trpc.tsx:5`, `:24-47`; `src/providers/QueryProvider.tsx:6-19`; `package.json:8`, `:12` | Se importa `AppRouter` desde `../../api/router`, archivo inexistente; hay dos `QueryClient` anidados; `build` no ejecuta `tsc` (solo `vite build`). | Tipado tRPC potencialmente `any`; cachés divididas; errores de tipos no bloquean build. | Reexportar `AppRouter` desde `server/router`; un solo QueryClient; `build` con `tsc -b`. |
| P3-14 | P3 | Visual / tokens | `tailwind.config.js:52-58`; `src/index.css:40`; `OrderTracking.tsx:37`, `:96`; `OrderTrackingDetails.tsx:37` | `--radius: 1.25rem` y override de `rounded-xl` (24 px) mayor que `rounded-2xl` (16 px). La ruta mezcla `rounded-3xl`, `rounded-2xl`, `rounded-xl` y `rounded-full`; no hay token de color de marca. | Escala visual incoherente y difícil de mantener. | Definir tokens `--brand`, `--surface`, `--radius-card`, `--radius-control`; no usar hex sueltos. |
| P3-15 | P3 | i18n / push | `server/events.ts:78-84` | El push usa el enum crudo en inglés: “El estado de tu pedido ha cambiado a: on_the_way”. | Notificación poco profesional/inconsistente con la UI en español. | Mapa de labels compartido en servidor. |
| P3-16 | P3 | Validación de input | `server/order-router.ts:125-127`; `src/pages/customer/OrderTracking.tsx:52` | `z.number()` acepta decimales/negativos; `Number(id)` puede ser `NaN` y deshabilitar la query silenciosamente. No hay `.int().positive()`. | `/order/abc` o `/order/0` cae en “Pedido no encontrado” sin explicar el ID inválido. | `z.number().int().positive()`; validar en el cliente y mostrar 404 específico. |

---

## 5. Inconsistencias visuales

### 5.1 Tokens vs hardcodes

| Elemento | Valor usado en `/order` | Token/otro valor en el sistema | Problema |
|---|---|---|---|
| Naranja de marca | `#FF6A00`, `#FF5E00`, `#FF7700`, `#FFA040`, `#FF8533` | `--primary: 122 39% 33%` (verde) en `src/index.css:27` | El design system shadcn es verde; la marca es naranja. Cualquier componente Radix/shadcn sale verde. |
| Fondo de página | `#F7F7FA` | `--background: 0 0% 100%` | Hex repetido en toda la ruta; no hay token. |
| Header dark | `#0E0E12` | `#0A0A0D` en `App.tsx:61`; `#121212` en `index.html:2,13` y `index.css:7` | Tres negros distintos para la misma jerarquía. |
| Texto | `zinc-900/700/500/400` | `--foreground: 0 0% 13%` | Mezcla de escalas; los grises claros fallan contraste. |
| Radios | `rounded-3xl` (24), `rounded-2xl` (16), `rounded-xl` (24 por override) | `--radius: 1.25rem` | `xl` > `2xl`; no hay escala coherente. |
| Tipografía | `font-black` en casi todo; 9/10/11/12 px | Outfit (bloqueada por CSP) | Jerarquía plana y fuente incorrecta. |
| Sombras | `shadow-[0_4px_20px_rgba(0,0,0,0.03)]` repetido | `shadow-xs`/`card-shadow` | Valores ad hoc. |

### 5.2 Timeline y badges

- La timeline es un stepper de 6 nodos, no una línea de tiempo: no muestra horas ni `history` (`OrderTrackingTimeline.tsx:127-149`).
- Los labels de los pasos están ocultos en móvil (`hidden sm:block`, `:144`) y a 9 px: en el dispositivo principal solo se ven números.
- El badge “N/N recogidos” compite con el badge de estado; en `delivered` gana el conteo (P2-02).
- `payment_rejected` reemplaza toda la tarjeta de progreso por el banner; no hay transición visual entre ambos estados.
- `cancelled` no tiene icono ni motivo; solo color rosa.
- El botón de follow y el badge “En vivo” son estados permanentes, no reflejan conexión.

### 5.3 Cards y layout

- Header sticky de 60 px, mapa de 240/288 px, cards `p-5` con `rounded-3xl`; el contenido empieza sin compensación de safe-area.
- El FAB de chat no comparte el ancho máximo de `.mobile-container` (P2-21).
- En 320 px el header y la barra del driver aguantan, pero el badge de cantidad y los textos de 9 px son frágiles.
- No hay scroll horizontal; `mobile-container` lo bloquea (`index.css:109-118`).
- El mapa no tapa el header por el stacking context `z-0` del contenedor, pero el header no tiene fondo con blur como otras pantallas (es sólido).

### 5.4 Iconografía

- Repartidor: camión SVG custom; destino: pin oscuro; comercio: logo con etiqueta. Buena intención, pero los tres tienen animaciones distintas (`rapDriverPulse`, `rapMarkerBounce`) y no respetan reduced-motion.
- Estados: solo texto/color, sin iconos, a diferencia de Profile/Admin/Commerce que sí usan iconos.
- `ChatBubble` muestra un punto verde “online” permanente aunque no haya repartidor o chat disponible (`ChatBubble.tsx:37`).

### 5.5 Matriz de estados UI

| Estado | Evidencia | Comportamiento actual | Problema |
|---|---|---|---|
| Loading inicial | `OrderTracking.tsx:135-142`; `SessionGuard.tsx:87-93`; `App.tsx:59-65` | Spinner centrado a pantalla completa; tres variantes de color/fondo | Sin skeleton, layout shift y flash |
| Error de red/500 | `useDeliveryData.ts:224-239`; `OrderTracking.tsx:143-155` | Se muestra “Pedido no encontrado” | No distingue error de 404; sin retry |
| Pedido inexistente | `order.getById` devuelve `null` (`order-router.ts:130`); `OrderTracking.tsx:143-155` | “Pedido no encontrado” + volver al inicio | Correcto, pero comparte copy con errores |
| Pedido de otro usuario | No hay control de dueño (`order-router.ts:125-174`) | Se renderiza igual que el propio | IDOR P0-01 |
| Vacío de ítems | `OrderTrackingDetails.tsx:45-57` | No hay estado vacío; solo totales | Pedido inconsistente sin explicación |
| Offline | `OrderTracking.tsx:206-210`; `useOrderEvents.ts:83-95` | Sigue mostrando “En vivo” y últimos datos | Falsa liveness; sin banner offline |
| SSE caído | `useOrderEvents.ts:26-29`; `OrderTracking.tsx:113-115` | Reintentos silenciosos; tras 10 se rinde | Sin indicador ni fallback explícito |
| Mapa no carga | `OrderTrackingMap.tsx:250-258` | Contenedor gris; sin mensaje | No hay estado de error de tiles |
| Destino sin geocodificar | `OrderTracking.tsx:90-96`; `OrderTrackingMap.tsx:193-202` | No hay pin de destino ni aviso | Usuario no sabe si falta el dato o falló |
| Driver sin coordenadas | `OrderTrackingMap.tsx:205-235` | No hay marcador de driver; la barra sí muestra nombre/teléfono | No se explica la ausencia |
| Safe-area | `OrderTracking.tsx:180`; `ChatBubble.tsx:33` | Header sin `pt-safe`; FAB sin `env(safe-area-inset-bottom)` | Notch/home indicator |
| 320–430 px | `index.css:109-118`; timeline `:144` |Sin scroll horizontal; labels de pasos ocultos bajo `sm` | Legibilidad y áreas táctiles frágiles |
| CTA fijo vs bottom nav | `OrderTracking.tsx:249-250`; `ChatBubble.tsx:33` | No hay bottom nav en `/order`; solo FAB | FAB puede tapar contenido y no respeta el ancho de 480 px |
| Scroll | `index.css:6-12`; `OrderTracking.tsx:178` | `overscroll-behavior-y:none`; `pb-24` | Sin pull-to-refresh; el FAB no reserva safe-area |

---

## 6. Fluidez y performance

### 6.1 Quick wins (bajo riesgo)

1. **Arreglar el listener SSE** (`addEventListener("update")`) y desactivar el polling de 4 s mientras SSE esté conectado; dejar 30-60 s de fallback. Elimina ~50-80 % de requests de la ruta.
2. **Proyección mínima** en `getById`: no enviar `paymentReceipt` ni `history` en el poll; crear `getTrackingState` con estado, `updatedAt`, driver público y comercios.
3. **No re-renderizar todo** por `driverPos`: memoizar `OrderTrackingDetails` y `OrderTrackingTimeline`; aislar el mapa en su propio componente/estado.
4. **Quitar `leaflet-fix` global** de `main.tsx`; importar Leaflet solo en la ruta del mapa.
5. **Skeleton con layout final** para evitar CLS y el flash de tres pantallas de carga.
6. **Persistir coordenadas del destino** al crear el pedido; eliminar la llamada a Nominatim en cada visita.
7. **Cachear/deduplicar** la geocodificación y abortar en unmount.
8. **Deshabilitar** “Completar entrega” mientras la mutación está pendiente; idempotencia backend.
9. **No re-fitBounds** en cada update; solo en el primer render o acción explícita.
10. **Preconnect** a `basemaps.cartocdn.com` y `nominatim` (o proxy propio).

### 6.2 Profundo

- **Read model/event stream**: persistir eventos en `order_events` y exponer un stream con `Last-Event-ID`; el cliente aplica deltas sin pedir la orden completa.
- **SSE gateway autenticado**: validar cookie/token por canal, suscripción por pedido/driver y backpressure; reemplazar el bus en memoria (no funciona entre instancias/serverless; **hipótesis** para Vercel).
- **DB**: índices en FKs y `status`; `EXPLAIN ANALYZE` de `getById`; joins/`json_agg` en una sola query.
- **Push outbox**: desacoplar `emit` de FCM, filtrar tipos y deduplicar; reintentos con backoff.
- **Mapa**: capa de marcadores con diff por ID, `L.Marker.setLatLng` para drivers, `fitBounds` solo inicial, tiles con caché y atribución.
- **Observabilidad**: métricas de latencia de `getById`, tasa de reconexión SSE, eventos por pedido, errores 5xx, TTFB del chunk de mapa.
- **Acciones post-entrega**: rating/reorder como flujos transaccionales, no como parches de UI.

### 6.3 Waterfall actual (orden de carga)

```
HTML/CSS/JS main (incluye Leaflet por leaflet-fix)
  → lazy chunk OrderTracking + Leaflet CSS/JS
  → SessionGuard spinner
  → GET order.getById (1)
  → pintar header/mapa vacío
  → tiles CartoDB (muchas imágenes)
  → GET Nominatim (después del pedido)
  → GET order.getById (cada 4 s)
  → EventSource order + EventSource driver
  → chat.getByOrder (si se abre chat, cada 5 s)
```

### 6.4 Ciclo de vida, closures y keys

- **No se detectó un stale closure en el camino principal.** `useOrderEvents` captura `orderId` en la dependencia del efecto (`useOrderEvents.ts:112-128`) y `handleReuploadReceipt` usa el `id` vigente de la ruta (`OrderTracking.tsx:64-79`). Si `trpc.useUtils()` no fuera referencialmente estable, el efecto se re-suscribiría en cada render (**hipótesis** a verificar con React DevTools/Network).
- **Cleanup correcto de los dos EventSource** (`useOrderEvents.ts:127`; `OrderTracking.tsx:117-119`), aunque el del driver no reconecta y el del pedido se rinde sin avisar.
- **`setState` tras unmount** en el geocode (`OrderTracking.tsx:86-96`) y en la animación de Leaflet (`OrderTrackingMap.tsx:128-162`).
- **Keys correctas** en ítems (`item.id`), comercios (`c.id`) y pasos (`step.key`); no se detectaron índices inestables en `/order`.
- **Dependencias de efecto**: `OrderTrackingMap` depende de `order` (objeto) y `driverPos`, lo que reconstruye capas y `fitBounds` en cada actualización (P2-09).

---

## 7. Duplicados y deuda técnica

| Duplicado | Ubicaciones | Comentario |
|---|---|---|
| Mapas de estado/label/color | `OrderTracking.tsx:40-47`; `Profile.tsx:55-63`; `ProfileOrdersModal.tsx:64-113`; `commerce/Orders.tsx:89-105`; `admin/Orders.tsx:16-43`; `DriverOrder.tsx:33-37` | Cinco fuentes de verdad; labels y cobertura divergen. |
| Formato de moneda | `OrderTrackingDetails.tsx:54,65,72,80,88`; `Profile.tsx:299`; `ProfileOrdersModal.tsx:294,307`; `Cart.tsx:359-367` | `parseFloat(...).toFixed(2)` repetido; no hay `formatCurrency`. |
| Formato de fecha | `OrderTracking.tsx:195-200`; `Profile.tsx:291-294`; `ProfileOrdersModal.tsx:324-330`; `Chat.tsx:42-46,171-174` | `toLocaleDateString("es-ES")` repetido con opciones distintas; riesgo de TZ. |
| Lógica de cancelación | `admin/orders-router.ts:277-280`; `commerce/Orders.tsx:326-332`; `order-router.ts:240-330` | Solo admin/comercio; no hay flujo de cliente ni reembolso. |
| SSE reconexión | `useOrderEvents.ts:9-110`; `useAdminSSE.ts:7-89`; `OrderTracking.tsx:100-120` | Tres implementaciones; solo una escucha bien el evento nombrado. |
| `markReady` | `server/commerce-router.ts:180-241`; `server/order-router.ts:332-394` | Duplicado con emisión dentro/fuera de transacción. |
| `leaflet-fix` / iconos | `src/main.tsx:5`; `src/lib/leaflet-fix.ts`; `DriverOrder.tsx:20-25`; `OrderTrackingMap.tsx:36-76` | Iconos por defecto y divIcons custom; el fix global no aporta. |
| QueryClient | `src/providers/trpc.tsx:24-47`; `src/providers/QueryProvider.tsx:6-19` | Dos clientes anidados; `staleTime` distinto (30 s vs 5 min). |
| Endpoints muertos | `order.getByDriver`, `order.list`, `order.markCommerceReady` | Sin uso cliente; superficie extra. |
| Payload muerto | `history`, `commerceStatuses` | Se consultan y serializan, no se renderizan. |

---

## 8. Plan de verificación reproducible

### 8.1 Preparación

```bash
npm install
# Configurar .env con DATABASE_URL y secretos de auth
npm run db:migrate
npm run db:seed        # o crear datos con db/create-test-users.ts
npm run dev            # http://localhost:3000
```

Crear al menos:

- Cliente A y Cliente B (teléfonos distintos).
- Comercio C1 con 2 productos y coordenadas.
- Driver D1 online.
- Pedido P1 de A en efectivo; P2 de A por transferencia; P3 de B.

### 8.2 Happy path (UI)

1. Login Cliente A → agregar producto → `/cart` → “Continuar con la entrega” → confirmar efectivo.
2. En la pantalla de éxito pulsar “Seguir pedido”: verificar URL `/order/P1`, header, mapa, timeline “Recibido”.
3. Comercio C1: “Aceptar y Preparar” → verificar en tracking `preparing` y descripción “El comercio prepara tu pedido”.
4. C1: “Marcar como Listo para Retiro” → `ready_for_pickup`; el pedido aparece al driver.
5. Driver D1: aceptar → verificar badge (debe decir “Listo” o “En camino”, no “0/N recogidos”).
6. Driver: marcar cada comercio recogido → `picked_up`.
7. Driver: “Camino al cliente” → `on_the_way`.
8. Driver: “Completar entrega” → `delivered`; verificar celebración y redirección 6 s.
9. Abrir el mismo pedido desde `/profile` → confirmar que a los 6 s expulsa a `/home` (bug P2-03).

### 8.3 Simulación de estados (incluye los que la UI no produce)

Con el pedido de prueba y sesión admin:

```js
// En consola del navegador (mismo origen), usando superjson
const call = (path, input) => fetch(`/api/trpc/${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ json: input }),
}).then(r => r.json());

await call("admin.updateOrderStatus", { id: P1, status: "accepted" });
await call("admin.assignDriver", { orderId: P1, driverId: D1 });
await call("admin.updateOrderStatus", { id: P1, status: "payment_rejected", notes: "Prueba" });
```

Verificar en `/order/P1`:

- `accepted` → “Procesando pedido…”, “Paso 1 de 6”, barra 0 % (bug P2-01).
- `driver_assigned` → mismo síntoma; si hay comercios listos, badge “0/N recogidos”.
- `payment_rejected` → banner rojo; reenviar comprobante → vuelve a `pending_payment`.
- `delivered` con driver → badge “N/N recogidos” en lugar de “Entregado” (bug P2-02).
- `cancelled` → solo badge; no hay motivo ni reembolso.

### 8.4 Seguridad (sin cookies / incógnito)

```js
// 1) IDOR de lectura: ejecutar sin sesión
fetch("/api/trpc/order.getById?input=" + encodeURIComponent(JSON.stringify({ json: { id: P1 } })))
  .then(r => r.json()).then(console.log);

// 2) listado masivo
fetch("/api/trpc/order.list?input=" + encodeURIComponent(JSON.stringify({ json: {} })))
  .then(r => r.json()).then(console.log);

// 3) mutación anónima (usar un pedido de prueba, nunca producción)
fetch("/api/trpc/order.updateStatus", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { id: P1, status: "cancelled" } }),
}).then(r => r.json()).then(console.log);

// 4) chat ajeno
fetch("/api/trpc/chat.getByOrder?input=" + encodeURIComponent(JSON.stringify({ json: { orderId: P1 } })))
  .then(r => r.json()).then(console.log);

// 5) SSE ajeno
const es = new EventSource("/api/events/orders/" + P1);
es.addEventListener("update", e => console.log("order event", e.data));
```

Resultado esperado actual: todas las llamadas devuelven datos/éxito sin autenticación. Documentar como P0.

### 8.5 SSE: evento nombrado y reconexión

1. Abrir `/order/P1` con driver asignado.
2. En consola:

```js
const es = new EventSource("/api/events/driver/" + D1);
es.addEventListener("update", e => console.log("addEventListener update", e.data));
es.onmessage = e => console.log("onmessage", e.data);
```

3. Mover el driver (o llamar `driver.updateLocation` cada 15 s). Verificar que **solo** `addEventListener` recibe `location_update`; `onmessage` no recibe nada. Eso reproduce P1-01.
4. Confirmar en la UI que `estimatedMinutes` nunca aparece y que el botón de crosshair no existe.
5. Simular caída: DevTools → Network → Offline 30 s. Verificar logs `[SSE] Reconnecting...` del hook de pedido y que el polling de 4 s sigue; el EventSource del driver no reconecta.
6. Restaurar red; verificar que la orden se recupera por polling y que el badge “En vivo” nunca cambió.
7. Cambiar rápido de estado dos veces y observar en Network cuántos `getById` se disparan por evento + intervalo (duplicación P2-11).

### 8.6 Comprobante y estados terminales

1. Con P1 en `delivered`, autenticado como su dueño, enviar un comprobante pequeño:

```js
await fetch("/api/trpc/order.updatePaymentReceipt", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ json: { orderId: P1, receipt: "data:image/png;base64,iVBORw0KGgo=" } }),
});
```

2. Recargar `/order/P1`: debe haber vuelto a `pending_payment` (bug P1-03). Verificar historial con dos estados.
3. Repetir “Completar entrega” dos veces rápido en DriverOrder; consultar `driver.getEarnings` y `driver_earnings` para confirmar filas duplicadas (bug P1-04).

### 8.7 Sesión

1. Login Cliente A, abrir `/order/P1`.
2. Ir a `/profile` → “Salir” → volver con el botón atrás o pegar `/order/P1`.
3. Verificar que la página sigue renderizando (bug P1-02).
4. Borrar cookies desde DevTools (sin limpiar localStorage) y recargar `/order/P1`: sigue renderizando por endpoint público. Borrar `customer_session` y `qs_session` y repetir: el guard debería redirigir, pero con la lógica actual tarda 600 ms y puede renderizar.

### 8.8 Mapa y Leaflet

1. Bloquear `nominatim.openstreetmap.org` en DevTools → recargar: no hay pin de destino ni mensaje; el mapa queda en Quito (P2-07).
2. Bloquear `basemaps.cartocdn.com`: el mapa queda gris, sin error visible.
3. Arrastrar/zoom manual y provocar un cambio de estado: verificar que `fitBounds` resetea la vista (P2-09).
4. Navegar `/order/P1` → `/chat/P1` → atrás 5 veces; contar `.leaflet-marker-icon` y revisar consola. En dev/StrictMode comprobar si faltan driver/destino (P3-06).
5. Medir heap/detached nodes antes y después de 10 ciclos (P3-05).

### 8.9 Responsive y accesibilidad

1. Ancho 320, 375, 390, 430 px; verificar header, badge, timeline, dirección y FAB.
2. Emular iPhone con notch en PWA standalone: comprobar header bajo la status bar y FAB sobre el home indicator.
3. Activar zoom (pinch) en móvil: está bloqueado por `user-scalable=no`.
4. Ejecutar axe/Lighthouse; revisar contraste de `#FF6A00` y `zinc-400`.
5. VoiceOver/TalkBack: cambiar estado y comprobar que no hay anuncio (`aria-live` ausente); recorrer timeline (solo números en móvil).
6. `prefers-reduced-motion: reduce`: verificar que ping/bounce/pulse siguen animando.
7. Tab/teclado: foco en botón volver, follow y FAB; comprobar `aria-pressed` ausente.

### 8.10 Performance

1. Network: contar `order.getById` en 60 s (esperado ~15 con polling; más si hay eventos).
2. Medir tamaño de la respuesta con comprobante cargado (el base64 puede dominar).
3. React Profiler: provocar 5 eventos de estado y contar renders de `OrderTrackingDetails`/Timeline.
4. Performance panel: TTI de `/order/:id` con red 3G simulada; comparar con y sin `leaflet-fix` global.
5. DB: `EXPLAIN (ANALYZE, BUFFERS)` de las queries de `getById`; verificar seq scans por falta de índices.

### 8.11 Tests recomendados (para el equipo)

- Matriz de autorización: anónimo / cliente dueño / cliente ajeno / driver asignado / driver ajeno / merchant dueño / merchant ajeno / admin, para `getById`, `updateStatus`, `updatePaymentReceipt`, `chat.*`, SSE.
- Matriz de transiciones: todos los pares `from → to`, incluyendo terminales e idempotencia.
- Test de contrato de estados: cada valor del enum DB debe tener label y step en el frontend (falla el build/test si falta).
- Test SSE: el servidor emite `event: update`; el cliente debe registrar `addEventListener("update")`.
- Test de formatters: moneda, fechas y timezone.
- Test de mapa: cleanup de mapa/markers/rAF en unmount.

---

## 9. Anexo: contratos API/SSE y tablas

### 9.1 Procedimientos tRPC usados por la ruta

| Procedimiento | Método | Auth actual | Input | Output | Uso en `/order` |
|---|---|---|---|---|---|
| `order.getById` | GET | **público** | `{ id: number }` | `orders` completo + `items[]` + `history[]` + `driver` + `commerces[]` + `commerceStatuses[]`; `null` si no existe | Query principal + polling 4 s |
| `order.updateStatus` | POST | **público** | `{ id, status: enum(10), driverId?, notes? }` | `orders` actualizado | Driver/comercio; no se usa en la UI del cliente |
| `order.updatePaymentReceipt` | POST | `customerQuery` + owner | `{ orderId, receipt: string(base64) }` | `orders` actualizado | Reenvío de comprobante |
| `order.create` | POST | `customerQuery` | `{ customerId, items[{productId,commerceId,quantity}], deliveryAddress, customerPhone, paymentMethod, paymentReceipt?, notes?, deliveryFee, commission }` | `{ success, order }` | Entrada desde `/cart` |
| `chat.getByOrder` | GET | **público** | `{ orderId }` | `chat_messages[]` | Chat enlazado |
| `chat.send` | POST | **público** | `{ orderId, senderType, senderId, senderName, message }` | `chat_messages` | Chat enlazado |
| `chat.markAsRead` | POST | **público** | `{ orderId, readerType }` | `{ success }` | Chat enlazado |
| `driver.updateLocation` | POST | `driverQuery` + `ctx.driver.id === input.id` | `{ id, lat, lng }` | `{ success }` | Fuente del GPS |
| `driver.acceptOrder` | POST | `driverQuery` (sin comparar `input.driverId`) | `{ driverId, orderId }` | `orders` | Asignación |
| `driver.markCommercePickup` | POST | `driverQuery` (sin comparar `ctx.driver.id`) | `{ driverId, orderId, commerceId }` | `orders` | Recogida |
| `driver.getOrderHistory` | GET | `driverQuery` (sin owner) | `{ id }` | `orders[]` con teléfono/dirección | Historial driver |
| `commerce.markReady` | POST | `merchantQuery` (sin owner del comercio) | `{ orderId, commerceId }` | `{ allReady }` | Estado listo |
| `admin.updateOrderStatus` | POST | `adminQuery` | `{ id, status: enum(11), driverId?, notes? }` | `orders` | Admin |
| `admin.assignDriver` | POST | `adminQuery` | `{ orderId, driverId, forceReassign? }` | `orders` | Admin |

### 9.2 Eventos SSE

Todos los eventos de pedido/driver se envían con `event: update` (`server/boot.ts:45`, `:82`, `:120`). El `data` es JSON.

| Canal | Endpoint | Auth | Tipos de `data` | Emisor | Consumidor |
|---|---|---|---|---|---|
| `order:{id}` | `/api/events/orders/:orderId` | **ninguna** | `status_update{status,driverId?}`, `commerce_ready{commerceId}`, `chat_message{orderId}`, `ping` | `order-router`, `chat-router`, `commerce-router` | `/order`, `DriverOrder`, chat |
| `driver:{id}` | `/api/events/driver/:driverId` | **ninguna** | `location_update{lat,lng,ts}`, `order_assigned{orderId}`, `new_available{orderId}`, `order_unassigned{orderId}`, `commerce_pickup{...}`, `ping` | `driver-router`, `order-router`, `admin` | `OrderTracking` (roto), `DriverHome`, `DriverOrder` |
| `commerce:{id}` | `/api/events/commerce/:commerceId` | **ninguna** | `new_order{orderId}`, `commerce_ready{orderId}`, `ping` | `order-router`, `commerce-router` | `CommerceOrders` |
| `commerces:global` | `/api/events/commerces` | **ninguna** | `ping` | — | Home/Search |
| `products:global` | `/api/events/products` | **ninguna** | `ping` | — | Catálogo |
| `admin:dashboard` | `/api/events/admin-dashboard` | cookie admin/refresh verificada | `dashboard_update`, `ping` | `order-router`, `commerce-router`, etc. | Admin |

Heartbeat: 15 s en pedidos/driver/comercio, 30 s en admin. No hay `Last-Event-ID` ni replay. El bus es `Map<string, Set<Listener>>` en memoria (`server/events.ts:9`).

Consecuencia de `emit`: cada evento llama `handlePushNotification` (`server/events.ts:24-25`), que envía FCM aunque el tipo no sea relevante. Un `location_update` cada 15 s genera push al driver; un `chat_message` genera push al cliente, incluido su propio mensaje.

### 9.3 Enum de estados: DB vs API vs UI

| Estado | DB (`db/schema.ts:18-30`) | `order.updateStatus` (`order-router.ts:244-255`) | Admin (`admin/orders-router.ts:200-212`) | Timeline `/order` (`OrderTracking.tsx:40-47`) | Profile preview (`Profile.tsx:55-63`) | Profile modal (`ProfileOrdersModal.tsx:64-113`) | Commerce (`commerce/Orders.tsx:89-105`) |
|---|---|---|---|---|---|---|---|
| `pending_payment` | ✅ | ✅ | ✅ | ❌ (0 %, “Procesando”) | “Revisando pago” | “Revisando pago” | ❌ (no se lista) |
| `payment_rejected` | ✅ | ❌ | ✅ | banner especial | default → “payment rejected” | default → “payment rejected” | ❌ |
| `received` | ✅ | ✅ | ✅ | ✅ paso 1 | default → “received” | “Confirmado” | “Nuevo” |
| `accepted` | ✅ | ✅ | ✅ | ❌ (0 %, “Procesando”) | default → “accepted” | default → “accepted” | ❌ |
| `preparing` | ✅ | ✅ | ✅ | ✅ paso 2 | “En preparación” | “En preparación” | “Preparando” |
| `ready_for_pickup` | ✅ | ✅ | ✅ | ✅ paso 3 | default → “ready for pickup” | default → “ready for pickup” | “Listo para retirar” |
| `driver_assigned` | ✅ | ✅ | ✅ | ❌ (0 %, “Procesando”) | default → “driver assigned” | default → “driver assigned” | ❌ |
| `picked_up` | ✅ | ✅ | ✅ | ✅ paso 4 | “En camino” | “En camino” | “En reparto” |
| `on_the_way` | ✅ | ✅ | ✅ | ✅ paso 5 | default → “on the way” | default → “on the way” | “En camino” |
| `delivered` | ✅ | ✅ | ✅ | ✅ paso 6 (100 %) | “Entregado” | “Entregado” | “Entregado” |
| `cancelled` | ✅ | ✅ | ✅ | badge “Cancelado” (sin timeline) | “Cancelado” | “Cancelado” | “Cancelado” |

### 9.4 Tablas DB relevantes

| Tabla | Campos clave | Observaciones |
|---|---|---|
| `orders` | `id`, `customerId`, `driverId`, `status`, `subtotal`, `deliveryFee`, `commission`, `total`, `paymentMethod`, `paymentReceipt`, `deliveryAddress`, `customerPhone`, `pickedUpCommerceIds`, `createdAt`, `updatedAt` | `paymentReceipt` es `text` base64; no hay lat/lng de destino; `updatedAt` sin trigger (se setea manualmente). |
| `order_items` | `orderId`, `productId`, `commerceId`, `productName`, `quantity`, `unitPrice`, `total` | Sin índice en `order_id`; `quantity` es `numeric(10,3)` y se serializa string. |
| `order_status_history` | `orderId`, `status` (varchar), `notes`, `createdAt` | `status` no es enum; puede divergir. Sin índice. |
| `order_commerce_status` | `orderId`, `commerceId`, `status`, `updatedAt` | Enum propio (`preparing`, `ready_for_pickup`, `picked_up`). Sin índice. |
| `drivers` | `id`, `name`, `phone`, `currentLat`, `currentLng`, `status`, `commissionRate`, `fcmToken` | GPS y teléfono se exponen en `getById` público. |
| `customers` | `id`, `firstName`, `lastName`, `phone`, `address`, `fcmToken` | Sin tabla de direcciones normalizada. |
| `chat_messages` | `orderId`, `senderType`, `senderId`, `senderName`, `message`, `isRead`, `createdAt` | Sin constraint de participación; sender viene del cliente. |
| `driver_earnings` | `driverId`, `orderId`, `amount`, `type`, `date` | Sin `UNIQUE(order_id)`; permite duplicados por `delivered` repetido. |

### 9.5 Evidencia de fugas de recursos

- **EventSource del pedido:** cleanup correcto en `useOrderEvents.ts:127` (`connection.close()`), pero se rinde tras 10 fallos (`:26-29`) y no expone estado.
- **EventSource del driver:** cleanup correcto en `OrderTracking.tsx:117-119`; en error cierra sin reconectar (`:113-115`).
- **Leaflet:** `map.remove()` en el ref callback (`OrderTrackingMap.tsx:121-124`) libera el mapa, pero no resetea refs de markers/polyline (`:102-104`) ni cancela `requestAnimationFrame` (`:144-161`); el `<style>` global (`:26-33`) nunca se elimina.
- **Geocode:** fetch sin `AbortController` (`OrderTracking.tsx:86-96`) puede hacer `setState` después de desmontar.

---

## 10. Conclusión

La ruta `/order/:id` tiene una buena base visual y una composición modular clara, pero **no puede considerarse segura ni consistente** en su estado actual. Los tres ejes que deben resolverse antes de cualquier pulido son:

1. **Cerrar la superficie pública**: `order.getById`, `order.updateStatus`, SSE y chat deben exigir autenticación y autorización por recurso.
2. **Unificar el contrato de estados**: una sola fuente para DB/API/UI, con transiciones válidas, idempotencia y labels.
3. **Arreglar el tiempo real y la resiliencia**: listener SSE correcto, estado de conexión, fallback de polling controlado, errores/offline visibles y limpieza de Leaflet.

El resto (cancelación/reagenda/rating/reorder, skeletons, contraste, safe-area, tokens) es importante para la calidad percibida, pero queda supeditado a los P0/P1 anteriores.