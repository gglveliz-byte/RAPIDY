# Auditoría `/commerce/orders` — Negocio

**Fecha:** 2026-11-13  
**Ruta auditada:** `/commerce/orders` — Monitor de pedidos y cocina  
**Rol:** `merchant`  
**Tipo de revisión:** auditoría estática de código y contratos. No se modificó código, no se ejecutaron migraciones y no se reinició el servidor de desarrollo.

## 1. Alcance y archivos

Se revisaron, de punta a punta, la página, sus componentes, hooks, procedimientos tRPC, autorización, SSE, esquema y consumidores del mismo query:

| Capa | Archivos |
|---|---|
| Página y tarjeta | `src/pages/commerce/Orders.tsx`; `src/components/commerce/CommerceOrderCard.tsx` |
| Layout y consumidores | `src/components/CommerceLayout.tsx`; `src/pages/commerce/Dashboard.tsx` |
| Hooks | `src/hooks/useDeliveryData.ts` (`useMerchantCommerceId`, `useCommerceOrders`, `useUpdateOrderStatus`, `useMarkCommerceReady`); `src/hooks/useOrderEvents.ts` (`useCommerceEvents`) |
| Backend de pedidos | `server/order-router.ts` (`updateStatus`, `getCommerceOrders`, `markCommerceReady`) |
| Backend de comercio | `server/commerce-router.ts` (`markReady`, `getStats`) |
| Autorización | `server/lib/order-access.ts`; `server/middleware.ts` |
| SSE y arranque | `server/events.ts`; `server/boot.ts` |
| Esquema y contrato | `db/schema.ts`; `contracts/orderStatus.ts` |
| Integración cliente | `docs/customer/order.md`; `docs/customer/chat.md`; `src/pages/customer/OrderTracking.tsx`; `server/chat-router.ts` |
| Flujo administrativo/driver relacionado | `server/admin/orders-router.ts`; `server/driver-router.ts` |
| Contexto | `docs/commerce/ROUTES_MAP.md` |

**Fuera de alcance:** cambios de UI, migraciones, pruebas de carga reales, inspección de datos productivos y modificaciones al servidor en `localhost:3000`.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/SSE)

```text
/commerce/orders
  ├─ SessionGuard role="merchant"                  src/App.tsx:113
  ├─ useMerchantCommerceId()                       src/hooks/useDeliveryData.ts:121-170
  │    ├─ localStorage.merchant_user.commerceId
  │    ├─ commerce.me   (merchantQuery)
  │    └─ commerce.search (fallback por nombre)
  ├─ useCommerceOrders(commerceId)                 src/hooks/useDeliveryData.ts:305-313
  │    ├─ order.getCommerceOrders { commerceId }    server/order-router.ts:711-769
  │    ├─ polling 30 s
  │    └─ assertCommerceOwnership                   server/lib/order-access.ts:47-57
  ├─ useCommerceEvents(commerceId)                 src/hooks/useOrderEvents.ts:152-169
  │    └─ SSE /api/events/commerce/:commerceId      server/boot.ts:215-236
  ├─ useUpdateOrderStatus(commerceId)              src/hooks/useDeliveryData.ts:348-357
  │    └─ order.updateStatus                        server/order-router.ts:561-702
  └─ useMarkCommerceReady(commerceId)              src/hooks/useDeliveryData.ts:369-378
       └─ commerce.markReady                        server/commerce-router.ts:218-283
```

**Lectura del pedido (`getCommerceOrders`)**

1. Busca todos los `order_items` del comercio, sin fecha ni límite (`server/order-router.ts:717-721`).
2. Obtiene los `orders` correspondientes excluyendo únicamente `pending_payment` (`:731-735`).
3. Carga todos los estados por comercio (`:737-744`) y **toda la tabla `customers`** (`:745`).
4. Devuelve cada pedido con `items` propios del comercio, nombre/teléfono del cliente, `myCommerceStatus` y total del comercio (`:749-768`). El estado por comercio cae a `"preparing"` si no hay fila (`:764`).

**Acción “Aceptar y Preparar”**

```text
CommerceOrderCard (received)
  → onStatusUpdate(order.id, "preparing")
  → order.updateStatus
  → canTransition(received, preparing, merchant) = true
  → UPDATE orders.status = preparing
  → INSERT order_status_history
  → emit order:{id} status_update
```

**Acción “Listo para entregar al repartidor”**

```text
CommerceOrderCard (preparing)
  → commerce.markReady { orderId, commerceId }
  → assertCommerceOwnership
  → UPDATE order_commerce_status.status = ready_for_pickup
  → si todos los comercios están ready:
       UPDATE orders.status = ready_for_pickup
       INSERT order_status_history
       emit order:{id} status_update
       notifyReadyDrivers(orderId)
  → emit commerce:{commerceId} commerce_ready
  → emit order:{id} commerce_ready
```

**SSE y polling**

- El canal `commerce:{commerceId}` emite `new_order`, `commerce_ready`, `products_update` y `catalog_update` (`docs/commerce/ROUTES_MAP.md:296-301`).
- `useCommerceEvents` invalida `order.getCommerceOrders` y `product.getByCommerce` al recibir cualquier evento (`src/hooks/useOrderEvents.ts:157-164`).
- El polling de respaldo es de 30 s (`src/hooks/useDeliveryData.ts:305-313`), consistente con la regla del proyecto.
- El canal de pedido `order:{orderId}` es el que mantiene sincronizado al cliente (`docs/customer/order.md:57-60`).

## 3. Hallazgos

| ID | Severidad | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| ORD-01 | P0 | Integridad de estados / seguridad | `server/commerce-router.ts:245-260`; `server/order-router.ts:250-261` | `markReady` actualiza `order_commerce_status` y, si `allReady`, pone `orders.status = ready_for_pickup` sin validar el estado global del pedido. No hay transición desde el contrato ni bloqueo `FOR UPDATE`. También aplica a `payment_rejected`, `cancelled` y `delivered`, y puede competir con una cancelación concurrente. (F-01) | Un pedido cancelado, entregado o con pago rechazado puede “revivir” como listo, notificar a drivers y cliente, y ser despachado. Es un bypass de la máquina de estados y un riesgo financiero. | Extraer un único servicio `markCommerceReady`; bloquear la fila del pedido; permitir solo `received`/`accepted`/`preparing`; rechazar terminales y `payment_rejected`; hacer la operación idempotente sin emitir eventos si no cambió el estado; cubrir con tests de cancelación concurrente. |
| ORD-02 | P0 | Integridad de pago / UI | `server/order-router.ts:735`; `server/order-router.ts:764`; `src/pages/commerce/Orders.tsx:80`; `src/components/commerce/CommerceOrderCard.tsx:225-244` | `getCommerceOrders` excluye solo `pending_payment`, por lo que incluye `payment_rejected`. Como `myCommerceStatus` cae a `preparing` y la tarjeta muestra “Listo” para `preparing`, un pedido por transferencia rechazado aparece como pedido en preparación y permite marcarlo listo. | Se puede preparar y despachar un pedido cuyo pago fue rechazado; el comercio no ve el estado de pago ni una advertencia. Combinado con ORD-01, termina en `ready_for_pickup`. | Incluir el estado global y el estado de pago en la proyección; excluir o bloquear acciones para `pending_payment` y `payment_rejected`; mostrar badge “Pago rechazado” y no habilitar “Listo” hasta que el pedido esté aceptado y pagado/validado. |
| ORD-03 | P1 | Operación / transferencias | `server/order-router.ts:735`; `server/order-router.ts:382-386` | Los pedidos por transferencia nacen `pending_payment`, se excluyen de `getCommerceOrders` y no emiten `new_order` al canal del comercio. Recién se listan cuando un admin los mueve a `received` (o a `payment_rejected`, que es el caso de ORD-02). (F-12) | El comercio no ve la transferencia mientras espera validación; si el admin no la valida, el pedido queda invisible y se pierde operativamente. No hay indicador de “pago por validar”. | Decidir y documentar el comportamiento. Si el comercio debe verlas, incluirlas con estado “Pago pendiente”, sin exponer el comprobante si es PII administrativa, y emitir `new_order`/invalidación al crearlas. Si no debe verlas, mostrarlo explícitamente en la UI y en la documentación. |
| ORD-04 | P1 | Estados / flujo de aceptación | `server/order-router.ts:369-376`; `db/schema.ts:243-252`; `src/pages/commerce/Orders.tsx:80`; `src/pages/commerce/Orders.tsx:109-116` | Todo pedido nuevo inserta `order_commerce_status.status = "preparing"`, y el enum por comercio solo admite `preparing`, `ready_for_pickup` y `picked_up`. La UI prioriza `myCommerceStatus`, así que el pedido nace “En Preparación” y nunca muestra “Aceptar y Preparar” ni “Rechazar”. La pestaña “Recibidos” no puede contar ningún pedido no terminal. | El comercio no puede rechazar desde la UI un pedido nuevo; salta directamente a “Listo”. El cliente ve “Recibido” mientras el comercio ve “En Preparación”. El badge del layout y los tabs discrepan. (F-04) | Alinear el estado por comercio con el global: iniciar en `received` (agregando ese valor al enum/estado por comercio) o mantener el estado por comercio sin crear fila hasta la aceptación; mientras no haya aceptación explícita, la UI debe mostrar `received`. Actualizar tabs, card y layout con la misma fuente. |
| ORD-05 | P1 | Estados / contrato compartido | `src/pages/commerce/Orders.tsx:48-55`; `src/pages/commerce/Orders.tsx:80`; `server/order-router.ts:764`; `src/components/commerce/CommerceOrderCard.tsx:34-42`; `src/components/commerce/CommerceOrderCard.tsx:71-76` | `myCommerceStatus` tiene prioridad sobre `orders.status` para todo lo no terminal. Por eso `accepted`, `driver_assigned` y `on_the_way` se muestran como `preparing`/`ready_for_pickup`/`picked_up` del comercio. Los estados sin badge caen al texto crudo en inglés (`accepted`, `driver_assigned`) y no tienen bloque de acción. | El comercio no ve que el pedido fue aceptado o que ya tiene repartidor; puede ejecutar acciones sobre una lectura incompleta. Los tabs tampoco representan esos estados. Se rompe la regla de usar `contracts/orderStatus.ts` como única fuente. (F-05) | Definir una precedencia explícita y documentada: terminal global > `accepted`/`driver_assigned` global > estado por comercio. Renderizar siempre con `ORDER_STATUS_META` y agregar bloques de solo lectura para esos estados. |
| ORD-06 | P1 | Tiempo real / integración | `server/order-router.ts:681-699`; `server/admin/orders-router.ts:287-300`; `server/driver-router.ts:349-354`; `src/hooks/useOrderEvents.ts:152-168` | El backend emite al canal `commerce:{id}` solo al crear (`new_order`), al marcar listo (`commerce_ready`) y al pasar a `received` desde admin. No emite al comercio cuando el cliente cancela, cuando el admin cambia el estado, cuando el driver retira o cuando el pedido pasa a `on_the_way`/`delivered`. `useCommerceEvents` solo escucha el canal del comercio. | El monitor queda desactualizado hasta 30 s (polling). En una cocina, eso permite aceptar/marcar listo un pedido ya cancelado; es la condición que activa ORD-01. También impide ver el retiro por parte del driver en tiempo real. | Emitir un evento ligero (`order_status`/`orders_changed` con `orderId`) a cada `commerce:{id}` involucrado en cualquier transición global, incluidos cancelación, asignación, retiro y entrega. Invalidar la query del comercio al recibirlo y mantener el polling solo como respaldo. |
| ORD-07 | P1 | Multi-comercio / autorización | `server/lib/order-access.ts:76-93`; `contracts/orderStatus.ts:196-214`; `server/order-router.ts:656-675`; `server/order-router.ts:219-263` | Un merchant que posee **cualquier** comercio del pedido obtiene rol `merchant` y puede ejecutar `order.updateStatus` global. El contrato le permite `ready_for_pickup` y `cancelled`. `updateStatus` actualiza solo `orders.status`, no sincroniza `order_commerce_status`, y no exige que todos los comercios estén listos. Además, un comercio puede cancelar el pedido completo de otro. | En multi-comercio, un comercio puede declarar listo el pedido global antes de que los demás terminen; el driver lo ve disponible, lo acepta y luego no puede retirarlo porque el estado por comercio sigue `preparing`. También puede cancelar la venta de otro comercio sin coordinación. | Separar acciones por comercio de acciones globales. Para merchant, limitar `updateStatus` a `accepted`/`preparing`/`cancelled` de su propio comercio o exigir `allReady` antes de `ready_for_pickup`; sincronizar `order_commerce_status` y bloquear la fila; definir política de cancelación multi-comercio. |
| ORD-08 | P1 | Performance / orden | `server/order-router.ts:717-735`; `src/pages/commerce/Dashboard.tsx:100` | `getCommerceOrders` trae todos los `order_items` históricos del comercio y todos los pedidos asociados sin `orderBy`, sin `limit`, sin cursor y sin filtro de fecha. El `orders` query no ordena por `createdAt`. El dashboard toma `orders.slice(0, 4)` asumiendo que vienen los más recientes. | El payload y el costo crecen sin techo; el monitor muestra un orden no garantizado y “Pedidos Recientes” puede mostrar los más antiguos. El filtrado en memoria de items por pedido es O(pedidos × items). | Consultar pedidos con join a items del comercio, `ORDER BY orders.created_at DESC`, paginación/cursor y fecha máxima; proyectar solo columnas necesarias. Usar el mismo orden en Dashboard y en el monitor. |
| ORD-09 | P1 | Errores / UX | `src/hooks/useDeliveryData.ts:305-313`; `src/pages/commerce/Orders.tsx:60-74`; `src/pages/commerce/Orders.tsx:199-231`; `src/pages/commerce/Orders.tsx:43-46` | `useCommerceOrders` devuelve solo `data` y `loading`, sin `error`/`isError`. `Orders.tsx` no tiene rama de error y muestra el estado vacío “No hay pedidos en esta sección” ante 401, 403, 500 o fallo de red. Las mutaciones atrapan y solo hacen `console.error`. El `loading` de `useMerchantCommerceId` se ignora. | Un problema de sesión, permisos o servidor se percibe como “no hay pedidos”. El comercio puede dejar de operar sin saber que la carga falló; las acciones fallidas no dan feedback. | Exponer `error`, `isError` y `refetch` desde el hook; renderizar error con reintento; mostrar toast/inline en mutaciones; distinguir “cargando comercio”, “sin comercio asignado” y “sin pedidos”; eliminar el uso de `commerceId!`. |
| ORD-10 | P1 | UX / cancelaciones | `src/components/commerce/CommerceOrderCard.tsx:205-222`; `src/pages/commerce/Orders.tsx:68-73`; `src/pages/commerce/Orders.tsx:249`; `server/order-router.ts:661-664` | “Rechazar” cancela de inmediato, sin modal de confirmación ni motivo. No se pasa `cancellationReason`, por lo que el servidor guarda “Cancelado”. Los botones de `updateStatus` no se deshabilitan mientras la mutación está pendiente; solo `markReady` recibe `isPending`. | Un toque accidental cancela el pedido completo (y en multi-comercio afecta a todos). El cliente ve “Motivo: Cancelado” sin explicación. El doble click puede competir con otra acción. | Modal de confirmación con motivo opcional; enviar `cancellationReason`; deshabilitar por pedido usando las variables de la mutación; bloquear reenvíos y mostrar el resultado. |
| ORD-11 | P2 | Privacidad / performance | `server/order-router.ts:745` | `getCommerceOrders` ejecuta `db.select().from(customers)` sin filtro: carga toda la tabla de clientes en cada consulta del panel, aunque luego solo use los `customerId` de los pedidos devueltos. No hay proyección de columnas. | Costo innecesario por polling y exposición de PII en memoria del servidor (incluidos clientes sin relación con el comercio). Es el hallazgo F-06 del mapa. | Filtrar `customers.id` con `inArray` sobre los `customerId` de los pedidos y seleccionar solo `id`, `firstName`, `lastName`, `phone`; nunca traer la tabla completa. |
| ORD-12 | P2 | Privacidad / payload | `server/order-router.ts:200-206`; `server/order-router.ts:759-767` | `sanitizeOrder` solo elimina `paymentReceipt`; `getCommerceOrders` hace spread del pedido completo y agrega datos. El comercio recibe `deliveryAddress`, `customerId`, `idempotencyKey`, `paymentMethod`, `cancellationReason`, `cancelledBy`, etc. | Se expone más PII y metadata de la necesaria para cocina. La dirección completa y el `customerId` no tienen un uso claro en esta pantalla; el `idempotencyKey` tampoco. | Proyección explícita por caso de uso: id, estado, totales del comercio, items, nombre/teléfono, notas y estado de pago. Dirección solo si se justifica; nunca `paymentReceipt` ni identificadores internos innecesarios. |
| ORD-13 | P2 | Duplicación / contrato | `server/commerce-router.ts:218-283`; `server/order-router.ts:704-709` | Existen dos procedimientos para la misma operación: `commerce.markReady` y `order.markCommerceReady`. Tienen distinto manejo de errores (`commerce` lanza `Error` genérico en `:230-232`, `order` lanza `TRPCError`), distinto evento de admin (uno siempre, otro solo si `allReady`) y ambos carecen de validación de estado. Además, `updateStatus` no acepta `payment_rejected` en su enum (`order-router.ts:565-576`) aunque el contrato y el router admin sí. (F-19) | Doble superficie de ataque y deriva silenciosa: un endpoint puede quedar más débil o emitir eventos distintos. Un cliente puede usar el que no está endurecido. | Dejar un único servicio/procedimiento canónico y hacer que el otro delegue; compartir el enum de estados y la validación de transición; unificar errores y eventos; probar ambos caminos. |
| ORD-14 | P2 | Consistencia visual | `src/components/commerce/CommerceOrderCard.tsx:34-42`; `src/pages/commerce/Dashboard.tsx:45-52`; `contracts/orderStatus.ts:48-159` | Hay mapas de estado duplicados e incompletos. La tarjeta no cubre `accepted`, `driver_assigned`, `pending_payment` ni `payment_rejected`; el dashboard tampoco cubre `accepted`, `driver_assigned` ni `picked_up`. Los tonos no coinciden con el contrato: `received` ámbar vs. sky, `ready_for_pickup` púrpura vs. naranja, `delivered` zinc vs. brand. La etiqueta `received` es “Nuevo” en la tarjeta y “Recibido” en el contrato; `picked_up` es “En Reparto” vs. “Retirado”. | El negocio ve estados en inglés, badges de colores inconsistentes entre pantallas y tarjetas sin acción. Rompe la regla de un único contrato visual. | Importar `ORDER_STATUS_META` en tarjeta, dashboard y tabs; eliminar los mapas locales; agregar los estados faltantes; usar las etiquetas y tonos del contrato. |
| ORD-15 | P2 | Filtros / conteos | `src/pages/commerce/Orders.tsx:92-116`; `src/components/CommerceLayout.tsx:51-54`; `src/pages/commerce/Dashboard.tsx:99` | Los tabs solo cubren `all`, `received`, `preparing`, `ready_for_pickup`, `delivered` y `cancelled`; `accepted`, `driver_assigned` y `picked_up` no tienen tab. `counts.on_the_way` se calcula pero no se muestra. El layout y el dashboard cuentan `orders.status` global (`received`/`preparing`), mientras el monitor cuenta `myCommerceStatus`, así que los números no coinciden. | Pedidos en estados intermedios solo aparecen en “Todos” y “desaparecen” de los filtros. El badge del menú puede decir 3 pendientes mientras “Recibidos” marca 0. | Derivar tabs y conteos del mismo estado visible que usa la tarjeta; incluir todos los estados no terminales del contrato; reutilizar una función de conteo compartida en layout, dashboard y monitor. |
| ORD-16 | P2 | Búsqueda | `src/pages/commerce/Orders.tsx:82-87`; `server/lib/otp.ts:16-41` | La búsqueda compara `String(o.id).includes(q)` y `customerPhone.includes(q)` de forma literal. El placeholder promete “# de pedido”, pero escribir `#123` no coincide. Los teléfonos nuevos se guardan normalizados a dígitos con prefijo país (`593...`); buscar `099...` o un formato local no coincide. | Falsos negativos en la búsqueda; el operador cree que el pedido no existe. | Normalizar la consulta: quitar `#`, espacios y separadores; comparar el id numérico; normalizar teléfonos y permitir sufijo o últimos dígitos. Mostrar el criterio usado. |
| ORD-17 | P2 | Accesibilidad / targets | `src/pages/commerce/Orders.tsx:125-132`; `src/pages/commerce/Orders.tsx:160-167`; `src/pages/commerce/Orders.tsx:176-185`; `src/components/commerce/CommerceOrderCard.tsx:126-143`; `src/components/commerce/CommerceOrderCard.tsx:163-177`; `src/pages/commerce/Orders.tsx:138-141` | Varios targets quedan por debajo de 44 px: volver `w-9 h-9` (36 px), tabs `py-2` (~32 px), limpiar búsqueda, teléfono/WhatsApp `py-1.5`, acordeón `py-1.5`. Los tabs no exponen `aria-pressed`/`role="tablist"`; el acordeón no tiene `aria-expanded`; los enlaces icon-only dependen de `title`. El indicador “En Vivo” usa `animate-ping` sin `motion-reduce`. | Dificultad para operar en móvil/tablet en cocina y para lectores de pantalla; el estado del filtro no se anuncia. | Aumentar targets a ≥44 px; agregar `aria-label`, `aria-pressed`, `aria-expanded` y región `aria-live` para nuevos pedidos; usar `motion-reduce:animate-none`; mantener texto visible o `aria-label` en teléfono/WhatsApp. |
| ORD-18 | P2 | Tiempo real / confianza | `src/pages/commerce/Orders.tsx:138-141`; `src/hooks/useOrderEvents.ts:152-168` | `useCommerceEvents` no expone el estado de conexión y `Orders.tsx` muestra siempre el badge “En Vivo” con `animate-ping`, incluso si el SSE nunca conectó o agotó los 10 reintentos. | El comercio cree que está en vivo cuando en realidad depende del polling o está offline; puede actuar sobre datos de hasta 30 s o más. | Retornar `connected: "connecting" \| "connected" \| "offline"` desde el hook, renderizar “Reconectando/Offline”, ofrecer reintento y no animar cuando no hay conexión. |
| ORD-19 | P2 | Resolución de comercio / robustez | `src/hooks/useDeliveryData.ts:121-169`; `src/pages/commerce/Orders.tsx:43-46` | `useMerchantCommerceId` hace `JSON.parse` sin `try/catch` sobre `localStorage` (`:122-123`). Si `commerce.me` falla, busca por el nombre del usuario y escribe `results[0].id` como `commerceId` (`:155-163`), sin validar que sea su comercio. `Orders.tsx` ignora el `loading` del hook. | Un `localStorage` corrupto puede romper el render. Un fallback por nombre puede cachear un comercio ajeno y dejar la página en 403; sin comercio, el monitor se ve vacío en lugar de explicar el problema. | `try/catch` al parsear; validar el fallback contra `commerce.me` o eliminar el fallback por nombre; no persistir IDs no verificados; renderizar estados “cargando comercio” y “sin comercio asignado”. |
| ORD-20 | P2 | Abuso / notificaciones | `server/commerce-router.ts:218-283`; `server/order-router.ts:561-702`; `server/order-router.ts:208-217` | `updateStatus` y `markReady` no tienen rate limiting por merchant/pedido. `markReady` repetido vuelve a emitir `commerce_ready` y, si `allReady`, vuelve a notificar a todos los drivers online. Aunque `shouldPush` deduplica pushes, no limita las peticiones ni los eventos SSE. | Un merchant autenticado puede generar spam de eventos/notificaciones y carga; también puede amplificar una acción accidental. | Añadir throttle por merchant/pedido y hacer las mutaciones idempotentes; emitir solo cuando hay un cambio real; mantener la deduplicación de push como segunda capa. |
| ORD-21 | P2 | Integración cliente / multi-comercio | `server/commerce-router.ts:267-269`; `server/events.ts:116-123` | En un pedido multi-comercio, cada `markReady` emite `commerce_ready` al canal del pedido; `events.ts` envía al cliente el push “El comercio terminó de preparar tu pedido” incluso si otros comercios siguen en `preparing` y el estado global no es `ready_for_pickup`. | El cliente recibe “Pedido listo” antes de que el pedido completo esté listo; el timeline sigue mostrando “En preparación”. Genera confusión y reclamos. | Emitir el push al cliente solo cuando `allReady` sea verdadero, o cambiar el texto para indicar “Un comercio terminó su parte”; mantener el evento interno por comercio sin push al cliente. |
| ORD-22 | P2 | Cancelaciones / historial | `server/order-router.ts:661-664`; `src/components/commerce/CommerceOrderCard.tsx:267-272` | La cancelación desde el comercio no captura motivo y la tarjeta no muestra `cancellationReason` ni `cancelledBy` aunque el pedido los incluye. `getCommerceOrders` tampoco devuelve `order_status_history`. | El comercio no puede explicar al cliente por qué se canceló ni auditar quién canceló; el cliente ve “Motivo: Cancelado”. En disputas no hay contexto visible. | Enviar y mostrar motivo/actor en la tarjeta; si se necesita historial, incluirlo en la proyección de forma limitada. No hace falta un endpoint nuevo: los campos ya existen en `orders`. |
| ORD-23 | P2 | Contrato / backend | `server/order-router.ts:565-576`; `server/admin/orders-router.ts:200-212`; `contracts/orderStatus.ts:7-19` | El enum de `order.updateStatus` omite `payment_rejected`, mientras el router admin lo acepta y el contrato lo define. Además, `admin.updateOrderStatus` no usa `canTransition`. | Deriva del contrato: no todos los procedimientos pueden producir los 11 estados; las reglas de transición no son únicas y el estado que ve el comercio puede cambiar por una vía sin validación. | Reutilizar `ORDER_STATUSES`/`canTransition` en ambos routers; agregar `payment_rejected` al input de `order.updateStatus`; documentar las excepciones de admin si son intencionales. |

## 4. Integración con el flujo Cliente

### 4.1 Comparación de estados

El cliente usa **`orders.status` global** (`src/pages/customer/OrderTracking.tsx:160-166`), mientras el monitor del comercio usa **`myCommerceStatus` por comercio** y además lo sobreescribe solo para terminales (`src/pages/commerce/Orders.tsx:48-55`). Resultado actual:

| Estado global (cliente) | Lo que ve el comercio | ¿Coincide? |
|---|---|---|
| `pending_payment` | No aparece (filtrado) | No; el comercio no ve la transferencia pendiente |
| `payment_rejected` | “En Preparación” + botón “Listo” | **No**; además es accionable |
| `received` | “En Preparación” + botón “Listo” | **No**; el cliente ve “Recibido” |
| `accepted` | “En Preparación” o badge crudo | No |
| `preparing` | “En Preparación” | Sí |
| `ready_for_pickup` | “Listo para Retiro” (si su fila está ready) | Sí para ese comercio; en multi-comercio el global puede seguir `preparing` |
| `driver_assigned` | “En Preparación”/“Listo” | No |
| `picked_up` | “En Reparto” | Sí en semántica; etiqueta distinta |
| `on_the_way` | “En Reparto · Pedido en tránsito” | Parcial; no hay tab propio |
| `delivered` | “Entregado” (override) | Sí |
| `cancelled` | “Cancelado” (override) | Sí |

**Consecuencia:** el cliente puede ver “Recibido” o “Aceptado” mientras la cocina ve “En Preparación”, y el comercio no ve `driver_assigned`. La integración no comparte una única representación; cada capa aplica precedencias distintas.

### 4.2 SSE y push

- El cliente escucha `/api/events/orders/:id` y el hook invalida `order.getById` y `chat.getByOrder` (`src/hooks/useOrderEvents.ts:129-150`). Los eventos usan el nombre `update`, correcto.
- `order.updateStatus` emite `order:{id}` `status_update` (`server/order-router.ts:681-685`) y `events.ts` genera push con `getOrderStatusMeta` (`server/events.ts:92-101`). Una cancelación desde el comercio **sí** actualiza el timeline del cliente y el historial (`order_status_history`), aunque con motivo genérico por ORD-10/ORD-22.
- `commerce.markReady` emite `order:{id}` `commerce_ready` y, si `allReady`, `status_update` (`server/commerce-router.ts:267-280`). El cliente recibe push “Pedido listo” en cada comercio listo, no solo cuando el pedido completo está listo: ORD-21.
- Los cambios externos (cancelación del cliente, admin, retiro del driver) **no** llegan al canal del comercio: ORD-06. El monitor depende del polling de 30 s y puede actuar sobre un estado viejo.
- El SSE del comercio está autenticado por cookie y valida propiedad en `canAccessCommerce` (`server/boot.ts:168-189`, `:215-236`); no se encontró un bypass de autenticación SSE.

### 4.3 Cancelación desde el comercio

- El botón “Rechazar” llama `order.updateStatus` con `cancelled` (`CommerceOrderCard.tsx:215-221`), lo que inserta historial y emite SSE al cliente.
- No se envía motivo (`Orders.tsx:70`), el servidor guarda `"Cancelado"` (`order-router.ts:662`) y el timeline del cliente muestra `Motivo: Cancelado` (`OrderTrackingTimeline.tsx:178-179`).
- En multi-comercio, la cancelación es global: afecta a todos los comercios e items (ORD-07).
- No se actualizan los `order_commerce_status` al cancelar; la UI lo enmascara con el override terminal, pero la fila queda `preparing`/`ready_for_pickup`. Si luego se revive por ORD-01, el estado por comercio es incoherente.

### 4.4 Chat

- El chat del cliente sigue funcionando: `chat.send/getByOrder/markAsRead` usan `participantQuery` + `assertOrderAccess` (`server/chat-router.ts:21-133`) y comparten el canal `order:{id}`.
- El merchant puede enviar como `commerce` por API (`docs/commerce/ROUTES_MAP.md:280-282`), pero `/commerce/orders` **no tiene punto de entrada de chat**. No se detectó una regresión causada por los cambios de estado; sí una limitación de integración: el comercio no ve ni responde mensajes desde esta ruta.
- Los estados terminales no bloquean el chat; `assertOrderAccess` sigue autorizando al cliente dueño, driver asignado y comercio participante.

## 5. Lo que funciona y no se debe romper

1. **Autorización por comercio:** `getCommerceOrders` y ambos `markReady` llaman `assertCommerceOwnership`; no se encontró IDOR directo sobre `commerceId` (`server/order-router.ts:714`, `server/commerce-router.ts:221`, `server/lib/order-access.ts:47-57`).
2. **Autorización por pedido:** `updateStatus`, `getById` y chat usan `participantQuery` + `assertOrderAccess`; el rol se deriva de `ctx` y no de un campo enviado por el cliente (`server/lib/order-access.ts:63-129`, `server/middleware.ts:75-79`).
3. **Comprobante fuera de la respuesta:** `sanitizeOrder` elimina `paymentReceipt` (`server/order-router.ts:200-206`); el comercio no debería recibir comprobantes. Mantener esa eliminación (aunque la proyección del resto del pedido debe reducirse, ORD-12).
4. **Aislamiento de items multi-comercio:** `getCommerceOrders` filtra `order_items` por `commerceId`, por lo que un comercio no ve los productos de otro; el total de la tarjeta es el subtotal de su propio comercio (`server/order-router.ts:717-721`, `:750-755`). No romper ese filtro.
5. **SSE autenticado:** `canAccessCommerce` exige admin o merchant dueño; el evento se escribe con nombre `update` (`server/boot.ts:168-189`, `:221-235`). Mantener cookies y `addEventListener("update")`.
6. **Polling de respaldo correcto:** 30 s, no 4–5 s (`src/hooks/useDeliveryData.ts:305-313`). Es una red de seguridad válida mientras se corrige el SSE.
7. **Override terminal:** el monitor fuerza `delivered`/`cancelled` para que una fila por comercio obsoleta no oculte el estado final (`src/pages/commerce/Orders.tsx:48-55`). Es un parche útil, pero debe complementarse con la corrección de estados.
8. **Contrato de transiciones:** `contracts/orderStatus.ts` ya define los 11 estados, transiciones y roles; la corrección debe usarlo, no crear otro mapa (`contracts/orderStatus.ts:196-225`).
9. **Acciones actuales del cliente:** cancelar/re-subir comprobante siguen funcionando con SSE/push y validaciones de estado (`docs/customer/order.md:51-60`). No cambiar el contrato de `order.updateStatus` sin revisar ese flujo.
10. **Diseño base:** la página tiene loading inicial, estado vacío y tarjetas responsive; los problemas detectados son de completitud de estados, error y accesibilidad, no una reescritura visual completa.

## 6. Evidencia y verificación

### 6.1 Evidencia estática recogida

- Lectura completa de los archivos listados en la sección 1, con líneas citadas en cada hallazgo.
- Búsqueda de emisiones SSE: solo `server/commerce-router.ts:267`, `server/order-router.ts:268`, `:384`, `:694`, `server/admin/orders-router.ts:292`, `server/product-router.ts:178-254` y `server/admin/products-router.ts:120-135` emiten al canal `commerce:`. Ninguna de las transiciones externas de estado (cancelación de cliente/admin, retiro o entrega del driver) emite a ese canal.
- Búsqueda de `orderCommerceStatus`: el enum solo contiene `preparing`, `ready_for_pickup`, `picked_up` (`db/schema.ts:34-38`), lo que confirma que `received` no puede venir de esa tabla.
- Verificación de la respuesta de `getCommerceOrders`: el filtro es únicamente `<> 'pending_payment'` (`server/order-router.ts:735`) y el fallback es `"preparing"` (`:764`).
- Verificación de que el cliente usa el estado global: `src/pages/customer/OrderTracking.tsx:160-166` usa `getOrderStatusMeta(order?.status)`.
- `git status --short` mostró únicamente cambios previos ajenos a esta auditoría en `src/components/ThemeToggle.tsx` y `src/hooks/useTheme.ts`; no se modificó ningún archivo de código.

### 6.2 Verificación runtime no ejecutada

No se ejecutaron tests, builds, migraciones, llamadas autenticadas ni reinicios del servidor. Por tanto:

- **No verificado en runtime:** que el servidor actual en `localhost:3000` tenga exactamente este árbol de código; la auditoría se basa en el working tree leído.
- **No verificado en navegador:** comportamiento real de SSE bajo proxy, push FCM, responsive en dispositivos concretos y entrega de notificaciones.
- **No verificado con datos reales:** proporción de pedidos multi-comercio, antigüedad del histórico, teléfonos legacy sin normalizar y pedidos con `order_commerce_status` faltante.
- **No verificado:** que existan pedidos `payment_rejected` en producción; el camino está garantizado por el código, pero no se consultó la base.

### 6.3 Pasos manuales sugeridos para confirmar (sin ejecutarlos en esta auditoría)

1. Crear un pedido cash como cliente y abrir `/commerce/orders`: confirmar que aparece como “En Preparación” y que no hay “Aceptar/Rechazar” (ORD-04).
2. Crear un pedido transfer: confirmar que no aparece hasta que admin lo pase a `received` (ORD-03).
3. Con un pedido transfer, pasarlo a `payment_rejected` desde admin y abrir el monitor: confirmar que aparece como preparación y permite “Listo” (ORD-02).
4. Cancelar un pedido como cliente mientras el monitor está abierto y pulsar “Listo” antes del polling: confirmar que revive a `ready_for_pickup` (ORD-01 + ORD-06).
5. Crear un pedido con dos comercios, marcar listo uno y comprobar el estado global, la disponibilidad para driver y el push al cliente (ORD-07 + ORD-21).
6. Simular 401/500 en `order.getCommerceOrders` y confirmar que la UI muestra vacío en vez de error (ORD-09).
7. Reducir el viewport a 320–360 px y recorrer tabs, teléfono, WhatsApp y acordeón con teclado/lector (ORD-17).

## 7. Resumen para consolidado (top 5)

1. **ORD-01 — P0 — `server/commerce-router.ts:245-260` y `server/order-router.ts:250-261`:** `markReady` no valida el estado global y puede revivir pedidos `cancelled`, `delivered` o `payment_rejected`, notificando a drivers y cliente.
2. **ORD-02 — P0 — `server/order-router.ts:735` y `:764`:** los pedidos con pago rechazado se listan como “En Preparación” y permiten marcarse listos, habilitando el despacho de un pedido impago.
3. **ORD-04 — P1 — `server/order-router.ts:369-376`:** todo pedido nace en `preparing` por comercio; la pestaña “Recibidos” nunca cuenta y el comercio no puede aceptar/rechazar desde la UI (F-04).
4. **ORD-06 — P1 — `server/order-router.ts:681-699`, `server/admin/orders-router.ts:287-300` y `server/driver-router.ts:349-354`:** las transiciones externas no se emiten al canal `commerce:`; el monitor queda stale hasta el polling de 30 s y puede actuar sobre un pedido cancelado.
5. **ORD-07 — P1 — `server/lib/order-access.ts:76-93` y `server/order-router.ts:656-675`:** en multi-comercio, cualquier comercio participante puede cambiar el estado global o cancelar todo el pedido; `updateStatus` permite `ready_for_pickup` sin sincronizar los estados por comercio y puede dejar el pedido bloqueado para el driver.

**Riesgos de integración con cliente:** el cliente ve `received`/`accepted`/`driver_assigned` desde `orders.status`, mientras el comercio ve otro estado derivado de `order_commerce_status`; además, el push “Pedido listo” se envía por cada comercio y no solo cuando el pedido completo está listo. La cancelación del comercio sí llega al timeline del cliente, pero sin motivo útil; el chat sigue autorizado por participación, aunque el panel no ofrece entrada al mismo.