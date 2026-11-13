# Auditoría `/driver/history` — Repartidor

**Fecha:** 2026-11-13 · **Ruta:** `/driver/history` · **Modo:** auditoría de solo lectura. No se modificó código, no se ejecutaron migraciones ni se reinició el servidor de `localhost:3000`.

## 1. Alcance y archivos

Se auditó la lista de pedidos terminales del repartidor: carga, fechas, estados, montos, ganancias, filtros, paginación, estados vacíos/error, autorización y su relación con Cliente y Negocio.

| Archivo | Uso en la ruta |
|---|---|
| `src/pages/driver/DriverHistory.tsx` | Página completa: header, lista, tarjetas, estado vacío y bottom nav |
| `src/App.tsx:122` | Ruta lazy bajo `SessionGuard role="driver"` |
| `src/components/SessionGuard.tsx:100-113` | Verificación de cookie y rehidratación de `driver_user` |
| `src/hooks/useDeliveryData.ts:612-621` | `useDriverSession`: lectura de `driver_user` desde `localStorage` |
| `src/hooks/useDeliveryData.ts:642-650` | `useDriverUpdateStatus`: invalidación tras cambiar estado |
| `src/hooks/useOrderEvents.ts:175-198` | `useDriverEvents`: invalidación del historial vía SSE del driver |
| `src/pages/driver/DriverHome.tsx:28` | Único punto que monta `useDriverEvents` |
| `src/providers/trpc.tsx:44-46` | `staleTime` de 30 s y `refetchOnWindowFocus: false` |
| `server/driver-router.ts:173-196` | `driver.getOrderHistory` |
| `server/middleware.ts:38-49` | `driverQuery`: exige `ctx.driver` |
| `server/driver-router.ts:145-171` | `driver.getActiveOrders`, endpoint hermano sin paginación |
| `server/order-router.ts:558-614` | `order.getById`, usado al abrir una tarjeta |
| `server/lib/order-access.ts:63-129` | Resolución de participante y autorización del pedido |
| `server/order-router.ts:776-844` | Transición a `delivered`, `deliveredAt` y creación de `driver_earnings` |
| `server/admin/orders-router.ts:132-159,221-289,313-374` | Liquidación, entrega administrativa y reasignación de driver |
| `server/admin/drivers-router.ts:122-156` | Borrado de driver y anulación de `orders.driver_id` |
| `db/schema.ts:179-210,281-292` | `orders` y `driver_earnings` |
| `contracts/orderStatus.ts:139-158,170-184,199-214` | Contrato único de estados y etiquetas |
| `src/pages/driver/DriverOrder.tsx:151-157,295,329-335,462-472` | Detalle operativo al que navegan las tarjetas |
| `src/pages/driver/DriverEarnings.tsx:28-41,162-170` | Formato y agrupación de ganancias |
| `src/index.css:149-154,214-224` | Utilidades de safe-area, bottom nav y touch target |

Documentos obligatorios revisados: `docs/commerce/README.md`, `docs/commerce/VERIFICATION.md`, `docs/commerce/audit/MASTER_TRIAGE.md`, `docs/customer/order.md`. También se contrastó el reporte histórico `docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md:179`, que menciona un IDOR en `getOrderHistory`; el código actual ya no lo reproduce (ver sección 5).

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/driver/history
  └─ SessionGuard role="driver" (src/App.tsx:122)
      └─ DriverHistory
          ├─ useDriverSession() → localStorage "driver_user" (useDeliveryData.ts:612-621)
          ├─ trpc.driver.getOrderHistory({ id }) (DriverHistory.tsx:12-15)
          │    └─ GET /api/trpc/driver.getOrderHistory
          │         └─ driverQuery (middleware.ts:38-49)
          │              └─ ctx.driver.id (driver-router.ts:191)
          │                   └─ orders WHERE driver_id = ctx.driver.id
          │                        AND status IN ('delivered', 'cancelled')
          │                        ORDER BY updated_at DESC (sin LIMIT)
          └─ tarjetas → /driver/order/:id
```

1. La ruta se registra bajo `SessionGuard role="driver"` (`src/App.tsx:122`). El guard valida la cookie HttpOnly con `login.checkAuth` y rehidrata `driver_user` (`SessionGuard.tsx:100-113`); la identidad real la resuelve el backend, no el `localStorage`.
2. `DriverHistory` obtiene `driverId` de `useDriverSession` (`DriverHistory.tsx:9-10`). Ese hook inicializa `null` y recién en un `useEffect` lee `driver_user` o `qs_driver_user` (`useDeliveryData.ts:612-621`).
3. La query se ejecuta con `{ id: driverId! }` y `enabled: !!driverId` (`DriverHistory.tsx:12-15`). El input se envía, pero el servidor lo ignora: el handler declara `async ({ ctx })` y filtra por `ctx.driver!.id` (`server/driver-router.ts:173-176,191`).
4. `driverQuery` exige que el contexto tenga un driver autenticado (`middleware.ts:38-49`). No hay forma de que un cliente, merchant o admin use este endpoint como driver.
5. La consulta devuelve solo `delivered` y `cancelled` (`server/driver-router.ts:192`), ordenados por `updatedAt` descendente (`:195`), sin `LIMIT`, cursor ni filtros (`:173-196`).
6. La UI muestra spinner si `isLoading` (`DriverHistory.tsx:41-44`), tarjetas si hay datos (`:45-73`) y un estado vacío en cualquier otro caso (`:74-78`). No existe rama de error.
7. Cada tarjeta navega a `/driver/order/:id` (`DriverHistory.tsx:49`). Ese detalle usa `order.getById`, que autoriza al driver solo si `order.driverId === ctx.driver.id` (`server/lib/order-access.ts:72-74`).
8. La página no monta SSE. El único consumidor de `useDriverEvents` es `DriverHome` (`DriverHome.tsx:28`); la invalidación de `driver.getOrderHistory` existe en `useOrderEvents.ts:191-193`, pero no se ejecuta mientras el historial está abierto.

## 3. Hallazgos

No se identificó un **P0** explotable en esta ruta: la autorización actual es correcta. Los P1 son de integridad de dinero, fechas y volumen de datos; los P2 son de UX, accesibilidad y endurecimiento.

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| **DRV-HIST-01** | **P1** | Dinero / ganancias | `src/pages/driver/DriverHistory.tsx:70`; `server/driver-router.ts:182,192`; `server/order-router.ts:795-803`; `db/schema.ts:103` | La tarjeta muestra `orders.deliveryFee` bruto como único importe, incluso para pedidos cancelados. La ganancia real es `deliveryFee * commissionRate / 100` y solo se inserta en `driver_earnings` al pasar a `delivered`. | Un envío de $2.50 con comisión 75 % se muestra como $2.50 en el historial, pero como $1.88 en `/driver/earnings`. Un cancelado normal muestra $2.50 en verde aunque el driver ganó $0. Rompe la conciliación y la confianza en el historial. | Devolver `earningAmount` desde `driver_earnings` (join por `orderId` y `driverId`, tipo `delivery_fee`) y mostrarlo etiquetado como ganancia. Para `cancelled`, mostrar $0.00 o “sin ganancia”. No calcular el neto en el cliente a partir del fee bruto. |
| **DRV-HIST-02** | **P1** | Fechas / orden | `src/pages/driver/DriverHistory.tsx:68`; `server/driver-router.ts:186,195`; `server/admin/orders-router.ts:140,155,229`; `db/schema.ts:199-201` | La fecha visible y el orden usan `orders.updatedAt`, un campo mutable. `toggleCommerceSettled` y `toggleDriverSettled` reescriben `updatedAt` en pedidos ya entregados. Existe `deliveredAt`, pero no se selecciona ni se usa. | Una entrega antigua salta al tope del historial cuando el admin la marca como liquidada y muestra la fecha de liquidación, no la de entrega. El historial no coincide con `deliveredAt` ni con la fecha real de la entrega. | Seleccionar `deliveredAt` y usarlo para mostrar y ordenar los `delivered`. Para `cancelled`, usar el timestamp de cancelación de `order_status_history`. Formatear explícitamente en `America/Guayaquil`. |
| **DRV-HIST-03** | **P1** | Performance / payload | `server/driver-router.ts:173-196`; `src/pages/driver/DriverHistory.tsx:45`; `db/schema.ts:203-208` | La consulta no tiene `LIMIT`, cursor, paginación ni filtros por fecha/estado. Devuelve todo el historial con `total`, `deliveryFee`, `deliveryAddress`, `customerPhone`, `createdAt` y `updatedAt`. No hay índice compuesto para `(driver_id, status, updated_at)`. | El tiempo de respuesta, la memoria del navegador y el payload crecen sin límite con la antigüedad del driver. En un móvil con años de entregas puede tardar o agotar memoria, y expone PII histórica que la lista no necesita. | Agregar cursor o `limit` de 20–50, filtro por fecha y estado, y proyección mínima. Crear índice `(driver_id, status, updated_at)` o `(driver_id, delivered_at)`. Reutilizar el patrón con `limit` que ya existe en `order.getByDriver` (`server/order-router.ts:656-667`). |
| **DRV-HIST-04** | **P1** | Integridad histórica / `driverId` | `server/driver-router.ts:190-193`; `db/schema.ts:182,283`; `server/admin/drivers-router.ts:148`; `server/admin/orders-router.ts:335-351,257-278` | El historial se deriva de `orders.driver_id` y del estado global, ambos mutables. `admin.assignDriver` no bloquea pedidos terminales: reasigna y fuerza `driver_assigned`; `deleteDriver` anula `driver_id` y la cascada de `driver_earnings` borra las ganancias. | Un pedido ya entregado puede desaparecer del historial del driver que lo hizo o aparecer para otro, mientras la ganancia queda en `driver_earnings` del driver anterior. Pedidos con `driver_id` nulo no tienen ningún fallback y quedan invisibles. | Prohibir reasignación o cambio de estado de pedidos terminales. No mutar `orders.driver_id` después de `delivered`. Usar `driver_earnings` y el historial de asignaciones como respaldo para reconstruir el historial. Auditar el borrado de drivers. |
| **DRV-HIST-05** | **P2** | Estados UI / sesión | `src/pages/driver/DriverHistory.tsx:9-15,41-45,74-78`; `src/hooks/useDeliveryData.ts:612-621`; `src/providers/trpc.tsx:44-46` | `driverId` se lee en un efecto, por lo que el primer render tiene `null`; la query queda deshabilitada y, en TanStack Query v5, `isLoading` es `false` para una query deshabilitada. No se destructura `isError` ni `refetch`. | Hay un flash de “No hay entregas anteriores” en cada montaje. Si `driver_user` no está disponible (por ejemplo, `localStorage` bloqueado) o falla la red/403, el historial real se muestra como vacío y el usuario no tiene botón de reintento. | Hidratar la sesión de forma síncrona o esperar a `checkAuth`; exponer `isError`, `error` y `refetch`; separar loading, sin sesión, error y vacío. |
| **DRV-HIST-06** | **P2** | Frescura / SSE | `src/pages/driver/DriverHistory.tsx:12-15`; `src/pages/driver/DriverHome.tsx:28`; `src/hooks/useOrderEvents.ts:175-198`; `src/hooks/useDeliveryData.ts:642-650`; `src/providers/trpc.tsx:44-46` | La página no monta `useDriverEvents`; solo `DriverHome` lo hace. `useDriverUpdateStatus` invalida solo `order.getById`, no `driver.getOrderHistory`. No hay polling ni refetch al recuperar foco. | Si el historial está abierto, una entrega o cancelación nueva no aparece. Al volver a la pantalla se puede reutilizar caché de hasta 30 s. El cliente y el negocio pueden ver el estado nuevo antes que el driver. | Montar `useDriverEvents(driverId, utils)` en el historial o invalidar `driver.getOrderHistory` explícitamente al pasar a `delivered`/`cancelled`. Mantener un intervalo lento o refetch al foco como respaldo. |
| **DRV-HIST-07** | **P2** | Navegación / detalle histórico | `src/pages/driver/DriverHistory.tsx:49`; `src/pages/driver/DriverOrder.tsx:151-157,295,329-335,462-472` | La tarjeta abre el detalle operativo, no una vista histórica. Un pedido `delivered` redirige automáticamente a `/driver` a los 3 s. Un `cancelled` muestra el estado crudo en inglés (`order.status.replace(...)`), sin motivo, y conserva teléfono, llamada, mapa y chat. | No se puede revisar un pedido histórico: el detalle se cierra solo o muestra datos de contacto después de la entrega. El conductor pierde el contexto y puede llamar a un cliente de un pedido ya cerrado. | Vista de detalle read-only para historial, o un flag `from=history`: suprimir el auto-redirect, usar `getOrderStatusMeta`, mostrar `cancellationReason` y `cancelledBy`, y ocultar chat/llamada en estados terminales. |
| **DRV-HIST-08** | **P2** | Contrato / copy | `src/pages/driver/DriverHistory.tsx:17-25,59-61,77`; `contracts/orderStatus.ts:139-158,170-184`; `server/driver-router.ts:178-187` | Las etiquetas y colores están hardcodeados (`delivered` verde, `cancelled` rojo) y no usan `ORDER_STATUS_META`. El estado vacío dice “No hay entregas anteriores” aunque la lista también incluye cancelados. No se devuelve `cancellationReason` ni `cancelledBy`. | Si el contrato compartido cambia, esta pantalla queda desalineada con Cliente y Negocio. Las cancelaciones no explican quién ni por qué, y el copy del vacío no representa el contenido real de la lista. | Usar `getOrderStatusMeta` o las etiquetas compartidas. Agregar motivo y autor de cancelación a la proyección. Cambiar el copy a “No hay pedidos en el historial” y etiquetar el importe. |
| **DRV-HIST-09** | **P2** | Visual / accesibilidad / dark mode | `src/pages/driver/DriverHistory.tsx:30-37,83-100`; `src/index.css:149-154,214-224`; `src/pages/driver/DriverHistory.tsx:32`; `src/pages/driver/DriverHome.tsx:271` | Header y nav no usan safe-area (`pt-4`/`pb-4`, nav `py-2`), la nav no usa `touch-target` y el texto inactivo es `gray-400`. El botón atrás usa `navigate(-1)`. El icono de Historial es `Clock` aquí y `Package` en `DriverHome`. No hay clases `dark:` en las pantallas de driver. | En dispositivos con home indicator la nav puede quedar ajustada; los targets no garantizan 44 px y el texto pequeño gris no alcanza contraste AA. Un deep link puede salir de la app al pulsar atrás. El tab cambia de icono y la pantalla queda clara si se activa `.dark`. | Usar `pt-safe`/`pb-safe-nav`, `min-h-[44px]`, contraste AA, back con fallback a `/driver`, un solo icono para Historial y variantes dark o documentar que dark no está soportado. |
| **DRV-HIST-10** | **P2** | Privacidad / PII | `server/driver-router.ts:184`; `src/pages/driver/DriverHistory.tsx:64`; `server/order-router.ts:217-223`; `src/pages/driver/DriverOrder.tsx:329-335` | `getOrderHistory` devuelve `customerPhone` aunque la lista no lo renderiza. El detalle sí lo muestra y permite llamar incluso en pedidos terminales. `sanitizeOrder` solo elimina `paymentReceipt`. | Los teléfonos de todos los clientes atendidos quedan disponibles indefinidamente en el payload del historial. Si se compromete el dispositivo o la sesión, la exposición de PII es mayor que la necesaria. | Quitar `customerPhone` de la proyección del historial. En el detalle, ocultar teléfono y llamada para `delivered`/`cancelled`, o limitarlos a pedidos activos. Mantener solo los datos necesarios. |
| **DRV-HIST-11** | **P2** | Contrato API / defensa en profundidad | `server/driver-router.ts:173-176`; `src/pages/driver/DriverHistory.tsx:12-14` | El input acepta `id` opcional, pero el handler no lo usa: filtra siempre por `ctx.driver.id`. No hay IDOR actual, pero el contrato sugiere que el cliente elige el driver. | Un refactor futuro que use `input.id` abriría un IDOR. El `id` de `localStorage` solo habilita la query; no autoriza. | Eliminar `id` del input o validar `input.id === ctx.driver.id`. Documentar que la identidad sale de la cookie y cubrirlo con un test de regresión. |

## 4. Integración con Cliente y Negocio

| Aspecto | Estado actual | Evidencia | Riesgo |
|---|---|---|---|
| Estado global | Correcto para terminales. El historial filtra `delivered`/`cancelled` del mismo `orders.status` que ve el cliente en `order.getById` y el negocio vía `getCommerceOrderStatus`. | `server/driver-router.ts:192`; `server/order-router.ts:558-614`; `contracts/orderStatus.ts:199-214` | Un cancelado nunca aparece como entregado en el badge, pero el monto verde puede hacerlo parecer pagado. |
| `delivered_at` | El backend lo escribe al entregar, tanto por driver como por admin. El historial no lo devuelve ni lo usa. | `server/order-router.ts:823`; `server/admin/orders-router.ts:229`; `server/driver-router.ts:186` | La fecha mostrada es `updatedAt`, no la entrega real. La liquidación administrativa la altera. |
| Ganancias | El historial muestra el fee bruto; `/driver/earnings` muestra el neto de `driver_earnings`. Los cancelados no generan earning. | `DriverHistory.tsx:70`; `server/order-router.ts:795-803`; `db/schema.ts:285-290`; `DriverEarnings.tsx:34-37` | El driver ve dos importes distintos para la misma entrega y un importe para un cancelado que no cobró. |
| Cancelaciones | El estado global se sincroniza y el cliente/negocio lo ven como `cancelled`. El historial lo lista, pero sin motivo, sin `cancelledBy` y con el fee bruto en verde. | `server/order-router.ts:825-828`; `server/driver-router.ts:178-187`; `DriverHistory.tsx:59-61` | El driver no puede distinguir una cancelación propia, del cliente, del comercio o del admin. |
| Reasignación / borrado | `orders.driver_id` es la única fuente del historial. `assignDriver` puede reasignar pedidos terminales y `deleteDriver` anula el vínculo y borra earnings por cascada. | `server/admin/orders-router.ts:335-351`; `server/admin/drivers-router.ts:148`; `db/schema.ts:182,283` | Historial y ganancias pueden quedar en drivers distintos o desaparecer. |
| SSE | El canal `driver:{id}` está autenticado y valida que el id coincida con la cookie. El historial no se suscribe a él. | `server/boot.ts:238-249`; `useOrderEvents.ts:175-198`; `DriverHome.tsx:28` | Cliente y negocio reciben el cambio; el historial abierto no. |
| Fechas / timezone | `updatedAt` es `timestamp` sin zona; la UI usa la zona del dispositivo y locale `es-ES`. `driver_earnings.date` se guarda con `toISOString()` (UTC). | `db/schema.ts:199-201`; `DriverHistory.tsx:68`; `server/order-router.ts:797` | Entregas nocturnas en Guayaquil pueden agruparse en días distintos entre pantallas/reportes. |
| Multi-comercio | El historial usa el estado global, correcto para terminales. `order_commerce_status` puede conservar `picked_up`/`ready_for_pickup`, pero el negocio lo overridea con el estado global. | `server/lib/order-status-sync.ts:9-30`; `contracts/orderStatus.ts:199-214` | No hay divergencia de estado terminal; sí puede haberla en el detalle de cada comercio si se consulta la tabla cruda. |

Conclusión de integración: **el estado terminal coincide** entre las tres superficies, pero **el dinero, la fecha y el detalle del historial no**. El cliente y el negocio ven `delivered`/`cancelled` correctamente; el driver ve el estado correcto con un importe y una fecha que no son los de su ganancia/entrega.

## 5. Lo que funciona y no se debe romper

- **Autorización correcta:** `driver.getOrderHistory` es `driverQuery` y filtra por `ctx.driver!.id` (`server/driver-router.ts:173-196`; `server/middleware.ts:38-49`). El `id` del cliente se ignora; no se reproduce el IDOR que menciona el reporte histórico `docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md:179`. No cambiar la identidad a `input.id`.
- **Rol y sesión:** la ruta está bajo `SessionGuard role="driver"` (`src/App.tsx:122`) y el guard usa la cookie HttpOnly como fuente de verdad (`SessionGuard.tsx:100-113`). No volver a autorizar con `localStorage`.
- **Filtro terminal:** solo `delivered` y `cancelled` (`server/driver-router.ts:192`). No incluir estados activos ni `payment_rejected` en el historial.
- **Sin duplicados ni N+1:** la consulta es una sola tabla, sin joins, y cada fila es un pedido único. No agregar joins que dupliquen filas sin `DISTINCT`/agrupación.
- **`paymentReceipt` fuera de la respuesta:** el historial no selecciona el comprobante. Mantener esa exclusión.
- **Ganancias idempotentes:** `driver_earnings` tiene índice único `(order_id, type)` y el path del driver usa `onConflictDoNothing` (`db/schema.ts:290`; `server/order-router.ts:799-807`). No introducir inserciones duplicadas al corregir el monto.
- **`delivered_at`:** ya se escribe en ambos paths (`server/order-router.ts:823`; `server/admin/orders-router.ts:229`). Es la fuente correcta para la fecha; no crear otra columna.
- **Acceso al detalle:** `order.getById` ya valida que el driver sea el asignado (`server/lib/order-access.ts:72-74`). Al crear la vista histórica, reutilizar esa autorización.
- **SSE autenticado:** `/api/events/driver/:driverId` exige que el id coincida con la cookie (`server/boot.ts:238-249`). Mantener esa validación al montar el canal en el historial.
- **Contenedor móvil:** `mobile-container` limita a 480 px y las tarjetas usan `key={order.id}`; no romper el layout ni la truncación de dirección (`DriverHistory.tsx:28,64,83`).
- **Un solo `QueryClient`:** la invalidación debe hacerse sobre el cliente existente (`src/providers/trpc.tsx:41-65`); no crear otro.

## 6. Evidencia y verificación

**Método:** inspección estática del repositorio en el commit `27d231e` (`fix(customer): evitar crash en /store/:id y quitar toggle duplicado del perfil`). `git status --short` no mostró cambios locales.

**No verificado en ejecución:** no se abrió el navegador, no se autenticó un driver, no se consultó la base de datos y no se alteró el servidor de `localhost:3000`. Por eso, las afirmaciones sobre contraste, safe-area, dark mode y responsive son inspección de código, no una prueba visual. El comportamiento de datos (fechas, earnings, reasignación) tampoco se reprodujo contra una base real.

**Evidencia estática principal:**

- El monto de la tarjeta es `order.deliveryFee` sin etiqueta (`DriverHistory.tsx:70`). El backend devuelve `deliveryFee` (`server/driver-router.ts:182`) y el cálculo de earning usa `commissionRate` (`server/order-router.ts:795-803`; `db/schema.ts:103`).
- La fecha y el orden usan `updatedAt` (`DriverHistory.tsx:68`; `server/driver-router.ts:186,195`). Las mutaciones de liquidación reescriben `updatedAt` (`server/admin/orders-router.ts:140,155`).
- La consulta no tiene `LIMIT` (`server/driver-router.ts:173-196`) y la UI no tiene paginación (`DriverHistory.tsx:45`).
- La página solo destructura `data` e `isLoading`, no `isError` ni `refetch` (`DriverHistory.tsx:12-15`), y el estado vacío es el fallback (`:74-78`).
- `useDriverSession` hidrata en un efecto (`useDeliveryData.ts:612-621`); el valor inicial es `null` (`:613`).
- `DriverHome` es el único que llama `useDriverEvents` (`DriverHome.tsx:28`); la invalidación de historial existe pero no se monta en la página (`useOrderEvents.ts:191-193`).
- El detalle operativo redirige a `/driver` a los 3 s si el pedido está entregado (`DriverOrder.tsx:151-157`) y muestra el estado crudo (`:295`).

**Pruebas existentes:** `contracts/orderStatus.test.ts` y `server/lib/otp.test.ts` son los únicos tests del repo; no hay test unitario ni E2E de `/driver/history`. `scripts/admin-smoke.mjs:30-36` solo prueba `driver.list` como admin/anónimo, no el historial.

**Verificación manual recomendada después de corregir (sin ejecutarla en esta auditoría):**

1. Entregar un pedido con fee $2.50 y comisión 75 %; comparar la tarjeta del historial con `/driver/earnings` y con `driver_earnings.amount`.
2. Cancelar un pedido asignado antes y después del retiro; comprobar que el historial no muestre una ganancia inexistente y que muestre el motivo.
3. Marcar una entrega antigua como liquidada desde admin y verificar que no salta al tope ni cambia la fecha de entrega.
4. Abrir un pedido entregado desde el historial y confirmar que no redirige a `/driver` antes de poder revisarlo.
5. Simular red caída y 403; confirmar que la pantalla muestra error y reintento, no “No hay entregas anteriores”.
6. Consultar `driver.getOrderHistory` con el id de otro driver y con id inválido; confirmar que solo devuelve el historial de la cookie.
7. Crear >100 pedidos terminales y medir payload/tiempo; confirmar que la paginación no rompe el orden cronológico.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Archivo:línea | Problema |
|---|---|---|---|---|
| 1 | **DRV-HIST-01** | **P1** | `src/pages/driver/DriverHistory.tsx:70`; `server/order-router.ts:795-803` | El historial muestra el fee bruto como ganancia, también en cancelados; no coincide con `driver_earnings`. |
| 2 | **DRV-HIST-02** | **P1** | `server/driver-router.ts:186,195`; `server/admin/orders-router.ts:140,155` | Fecha y orden usan `updatedAt` mutable, no `deliveredAt`; la liquidación reordena y cambia la fecha. |
| 3 | **DRV-HIST-03** | **P1** | `server/driver-router.ts:173-196` | Historial sin `LIMIT`, cursor, filtros ni índice compuesto; payload y PII crecen sin control. |
| 4 | **DRV-HIST-04** | **P1** | `server/admin/orders-router.ts:335-351`; `db/schema.ts:182,283` | El historial depende de `orders.driver_id` mutable; reasignar o borrar un driver puede ocultar/mover entregas y separar historial de earnings. |
| 5 | **DRV-HIST-05** | **P2** | `src/pages/driver/DriverHistory.tsx:9-15,74-78`; `src/hooks/useDeliveryData.ts:612-621` | El estado vacío se confunde con error/sesión ausente y aparece un flash falso en cada montaje. |