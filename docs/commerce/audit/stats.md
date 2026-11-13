# Auditoría `/commerce/stats` — Negocio

**Fecha:** 2026-11-13  
**Ruta:** `/commerce/stats` — “Rendimiento & Métricas”  
**Rol:** `merchant`  
**Modo:** auditoría de solo lectura. No se modificó código, no se ejecutaron migraciones, no se reinició el servidor y no se tocó `localhost:3000`.

## 1. Alcance y archivos

Se auditó la ruta completa, desde la pantalla hasta la consulta SQL, incluyendo los datos que comparte con el Dashboard y la integración con el checkout del cliente.

| Capa | Archivo | Uso |
|---|---|---|
| Ruta / guard | `src/App.tsx:115` | `/commerce/stats` bajo `SessionGuard role="merchant"` |
| Página | `src/pages/commerce/Stats.tsx` | KPIs, gráfico, ranking, estados de carga/vacío |
| Hook de datos | `src/hooks/useDeliveryData.ts:520-527` | `useCommerceStats` → `commerce.getStats` |
| Resolución de comercio | `src/hooks/useDeliveryData.ts:121-170` | `useMerchantCommerceId` (`commerce.me` + fallback por nombre) |
| Backend | `server/commerce-router.ts:146-216` | `getStats` |
| Pedidos / comisión | `server/order-router.ts:100-198, 324-379, 561-709` | quote, create, updateStatus, markReady |
| Contrato de estados | `contracts/orderStatus.ts:196-230` | transiciones y roles |
| Esquema | `db/schema.ts:174-252` | `orders`, `order_items`, `order_commerce_status` |
| Dashboard relacionado | `src/pages/commerce/Dashboard.tsx:65-123, 196-273, 400-453` | consume el mismo `getStats` |
| SSE | `src/hooks/useOrderEvents.ts:152-169` | `useCommerceEvents` |
| Referencia contable | `server/admin/dashboard-router.ts:44-55`; `server/admin/settings-router.ts:104-127, 272-304` | comisión y reportes |
| Referencia de moneda | `src/pages/legal/termsData.ts:98, 103` | USD es la moneda del proyecto |

No se consultó la base de datos real ni se ejecutó el flujo E2E. Las conclusiones son estáticas, a partir del código y de una comprobación de zona horaria/locale con Node. Lo que no pudo verificarse se indica en la sección 6.

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/commerce/stats                         App.tsx:115 (SessionGuard role="merchant")
  └─ CommerceStats                      Stats.tsx:33
      ├─ useMerchantCommerceId()         useDeliveryData.ts:121-170
      │   ├─ localStorage.merchant_user.commerceId
      │   ├─ commerce.me                 commerce-router.ts:38-42
      │   └─ fallback commerce.search    commerce-router.ts:74-84
      └─ useCommerceStats(commerceId)    useDeliveryData.ts:520-527
          └─ GET /api/trpc/commerce.getStats?input=...
              └─ commerceRouter.getStats  commerce-router.ts:146-216
                  ├─ assertCommerceOwnership          order-access.ts:47-57
                  ├─ SELECT commerces                 commerce-router.ts:151
                  ├─ SELECT products (todas las columnas)  commerce-router.ts:152
                  ├─ SELECT order_items por comercio  commerce-router.ts:154-157
                  ├─ por cada orderId: SELECT orders  commerce-router.ts:167-169  ← N+1
                  ├─ filtro status === "delivered"    commerce-router.ts:173
                  ├─ agregados de ventas/productos    commerce-router.ts:174-188
                  ├─ agrupación por weekday           commerce-router.ts:171, 191-195
                  ├─ topProducts                      commerce-router.ts:197-200
                  └─ comisión = totalSales × tasa actual  commerce-router.ts:203-204
```

**Respuesta que consume la UI:** `totalProducts`, `featuredProducts`, `totalSales`, `totalOrders`, `avgTicket`, `totalCommission`, `topProducts[]`, `dailySales[]` (`commerce-router.ts:206-215`).

**Consumidores:**
- `Stats.tsx:36` usa `useCommerceStats(commerceId || 0)`.
- `Stats.tsx:65-69` calcula `maxSales` y `totalTopRevenue`.
- `Stats.tsx:116-171` pinta 4 KPIs; `Stats.tsx:196-236` el gráfico; `Stats.tsx:275-321` el ranking.
- `Dashboard.tsx:70` usa el mismo hook y la misma clave de caché; `Dashboard.tsx:103-123` transforma `topProducts` para “Más Populares”; `Dashboard.tsx:209-271` pinta ventas, pedidos, catálogo y comisión.

**Caché / tiempo real:** la clave es `["commerce.getStats", commerceId]` (`useDeliveryData.ts:522`). No hay `refetchInterval`, no hay SSE en `Stats.tsx` y `useCommerceEvents` no invalida `commerce.getStats` (`useOrderEvents.ts:160-163`). Solo se refresca al montar o al recuperar foco, según el comportamiento por defecto de TanStack Query.

## 3. Hallazgos

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| STAT-01 | **P0** | Integridad de estados / métricas | `server/commerce-router.ts:247-260`; `server/order-router.ts:250-262` | `markReady` actualiza `order_commerce_status` y, si todos los comercios quedan `ready_for_pickup`, escribe `orders.status = ready_for_pickup` sin validar el estado actual. Un pedido `delivered` puede volver a `ready_for_pickup`; uno `cancelled` puede “revivir”. La UI oculta la acción para terminales (`src/pages/commerce/Orders.tsx:48-55`), pero el endpoint sigue expuesto al merchant. Es F-01. | `getStats` solo cuenta `delivered` (`commerce-router.ts:173`): un pedido entregado que se revierte desaparece de ventas, pedidos y comisión; un cancelado revivido y luego entregado suma una venta que nunca existió. Rompe la conciliación financiera. | Validar el estado actual antes de escribir: rechazar `delivered`/`cancelled` y exigir un estado activo anterior a la entrega (si se quiere ser estricto, `preparing`/`ready_for_pickup`); reutilizar `canTransition` de `contracts/orderStatus.ts:217-225` o una guarda equivalente; test para ambos casos en los dos endpoints (`commerce.markReady` y `order.markCommerceReady`). |
| STAT-02 | **P1** | Datos / gráfico | `server/commerce-router.ts:171, 186-195`; `src/pages/commerce/Stats.tsx:190-193` | El gráfico no es “Últimos 7 días”: `dailyMap[weekday] += total` acumula **todo el histórico** de pedidos `delivered` por día de la semana y devuelve siempre 7 barras lun-dom. No hay filtro `gte`/`lte` ni ventana móvil. Es F-11. | La barra del lunes puede ser la suma de todos los lunes desde que existe el comercio; el comercio interpreta una semana cuando ve meses o años. Los días futuros aparecen en 0. Datos engañosos para decisiones de compra, personal y promociones. | Calcular 7 días calendario consecutivos (hoy-6 a hoy) con `gte`/`lte`, agrupar por fecha real y devolver `{date, label, sales}`; renombrar el badge solo cuando la ventana sea real. |
| STAT-03 | **P1** | Datos / fechas / timezone | `server/commerce-router.ts:171`; `db/schema.ts:194-195`; `src/pages/commerce/Stats.tsx:185` | Agrupa por `order.createdAt`, no por el momento de entrega, y usa `toLocaleDateString("es-ES", { weekday: "short" })` con la zona del proceso Node. No existe `deliveredAt` en el esquema; el título dice “Ventas por Día (Entregados)”. | Una venta se atribuye al día en que se creó el pedido, no al día en que se entregó. Si el servidor corre en UTC y el negocio en Ecuador (UTC-5), un pedido de las 20:00 cae al día siguiente. Si el locale/ICU devuelve otra abreviatura, las claves no coinciden con `dayNames` y esas ventas se pierden del gráfico (puede quedar en cero). | Agrupar por `order_status_history.createdAt` con `status='delivered'` o agregar `deliveredAt`/`timestamptz`; hacer la agrupación en SQL con `AT TIME ZONE 'America/Guayaquil'`; devolver fecha ISO y formatear la etiqueta en el cliente. No depender de abreviaturas de locale. |
| STAT-04 | **P1** | Performance / N+1 | `server/commerce-router.ts:152-189`; `src/hooks/useDeliveryData.ts:520-527` | Carga todos los `order_items` del comercio, extrae `orderIds` y hace un `SELECT orders WHERE id = ?` secuencial por cada pedido (167-169), sin límite de fecha. Además hace `SELECT * FROM products` (152) solo para contar y trae todas las columnas, incluida `image` (que puede ser base64). Dashboard comparte la misma query (`Dashboard.tsx:70`). Es F-11. | Latencia O(N) y N round trips: con 10.000 pedidos son 10.000 consultas; la página y el Dashboard se degradan y pueden agotar el timeout. El payload de productos puede ser grande por las imágenes en `text`. | Una sola consulta agregada con `JOIN orders/order_items`, `WHERE orders.status='delivered' AND order_items.commerce_id = ?` y `GROUP BY`; contar productos con `COUNT`/`FILTER (WHERE is_available='yes')`; seleccionar solo columnas necesarias; evaluar índice compuesto `order_items(commerce_id, order_id)` y `orders(status, created_at)`; cachear con `staleTime` corto. |
| STAT-05 | **P1** | Integración Dashboard / contrato | `server/commerce-router.ts:197-200`; `src/pages/commerce/Dashboard.tsx:106-115`; `src/pages/commerce/Stats.tsx:282` | `topProducts` devuelve `{name, sales, revenue}` pero **no `id` ni `salesCount`**. Dashboard espera `tp.id` y `tp.salesCount` (`Dashboard.tsx:107-113`): `products.find(p => p.id === tp.id)` siempre falla, `price` cae a `tp.revenue` (revenue total, no precio unitario) y `key={prod.id}` queda `undefined` (`Dashboard.tsx:421`). Stats usa `key={product.name}` (`Stats.tsx:282`), que colisiona con nombres repetidos. Es F-11. | “Más Populares” del Dashboard muestra ingresos acumulados como si fueran precio; no muestra unidades vendidas; React puede reutilizar nodos incorrectamente. El ranking de Stats puede renderizar mal dos productos homónimos. | Devolver `productId` y `salesCount` (o alias `sales`), agregar `unitType` si se necesita; actualizar Dashboard y Stats para usar `productId` como key y `price` real del producto; crear un tipo compartido para la respuesta. |
| STAT-06 | **P1** | Datos / catálogo | `server/commerce-router.ts:207`; `src/pages/commerce/Stats.tsx:167-171`; `src/pages/commerce/Dashboard.tsx:247-248` | `totalProducts: prods.length` incluye productos con `isAvailable="no"`, pero el KPI se llama “Catálogo Activo”. Dashboard ya calcula `availableCount` con `p.isAvailable === "yes"`; Stats muestra el total. Es F-18, vigente en Stats (la parte del Dashboard ya está corregida). | Dos pantallas muestran números distintos para la misma etiqueta; el negocio cree que tiene más productos activos de los que puede vender. | Devolver `availableProducts` y `totalProducts` por separado; usar `availableProducts` en el KPI y mostrar “X de Y” si se desea; alinear Stats con Dashboard. |
| STAT-07 | **P1** | Contabilidad / comisión | `server/commerce-router.ts:203-204`; `server/order-router.ts:178-184, 336, 766`; `src/components/commerce/CommerceOrderCard.tsx:193-197`; `server/admin/settings-router.ts:111` | El checkout calcula la comisión y la persiste en `orders.commission` (`order-router.ts:336`). Stats la **recalcula** con la tasa actual del comercio (`totalSales * commissionRate / 100`). El admin puede cambiar `commissionRate` (`server/admin/commerces-router.ts:129, 151-155`). El mismo recálculo aparece en `getCommerceOrders` (`order-router.ts:766`) y en la tarjeta de pedido (`CommerceOrderCard.tsx:193-197`). En multi-comercio, `orders.commission` es la suma de todos y Stats recalcula solo esta parte. Los reportes oficiales usan `orders.commission` (`server/admin/settings-router.ts:111, 277`). | Cambiar la tasa reescribe retroactivamente toda la comisión histórica: la “Liquidación Rapidy” no coincide con lo cobrado en checkout. El comercio ve una comisión que nunca se le descontó; disputas de liquidación. | Persistir la comisión por comercio/pedido al crear la orden (por ejemplo `order_items.commission` o una tabla de liquidación) y que Stats sume ese valor; si se mantiene el cálculo actual, etiquetarlo como “estimada a tasa vigente” y no usarlo para liquidar. Requiere cambio de esquema, no ejecutado. |
| STAT-08 | **P1** | Tiempo real / consistencia | `src/pages/commerce/Stats.tsx:91-94`; `src/hooks/useDeliveryData.ts:520-527`; `src/hooks/useOrderEvents.ts:160-163` | El badge “En Vivo” no tiene SSE ni polling: `useCommerceStats` no define `refetchInterval` y Stats no llama `useCommerceEvents`. Incluso si lo llamara, `useCommerceEvents` solo invalida `order.getCommerceOrders` y `product.getByCommerce`, no `commerce.getStats`. El path de entrega de `order.updateStatus` solo emite `order:{id}` y `admin:dashboard` (`server/order-router.ts:681-686`); no emite `commerce:{id}`. Es F-17. | Las ventas, el ticket y la comisión no cambian mientras el comercio mira la pantalla, aunque el driver entregue pedidos. El comercio decide con datos stale y el badge promete algo que no ocurre. | Quitar “En Vivo” o conectar SSE y emitir un evento commerce-scoped al entregar; invalidar `["commerce.getStats", commerceId]` desde `useCommerceEvents`; añadir polling de respaldo de 30 s; invalidar stats en `order.updateStatus`/`markReady` cuando corresponda. |
| STAT-09 | **P1** | Copy / etiquetas | `server/commerce-router.ts:173-188`; `src/pages/commerce/Stats.tsx:123-137`; `src/pages/commerce/Dashboard.tsx:223-233` | `totalOrders` solo incrementa si `order.status === "delivered"`, pero Stats lo llama “Pedidos Despachados” y Dashboard “Pedidos Totales”. “Despachado” sugiere enviado, no entregado; “Totales” sugiere todos los pedidos. `getCommerceOrders` incluye todos menos `pending_payment` (`order-router.ts:735`), así que el número no coincide con la cola. Es F-18. | El comercio no puede reconciliar el KPI con la lista de pedidos; cree que “totales” incluye recibidos, preparando y cancelados. El sublabel “en preparación” del Dashboard se calcula aparte (`Dashboard.tsx:232`) y no sale de stats. | Renombrar a “Pedidos entregados” / “Ventas completadas”; si se necesita el total, devolver `totalOrders` y `deliveredOrders` por separado (desambiguar el dato existente, sin nueva funcionalidad). |
| STAT-10 | **P2** | Copy / definición de ticket | `server/commerce-router.ts:184, 202`; `src/pages/commerce/Stats.tsx:150-154`; `src/pages/commerce/Dashboard.tsx:215` | `avgTicket = totalSales / totalOrders`, donde `totalSales` es la suma de `order_items.total` del comercio (sin envío ni comisión). En multi-comercio, el mismo pedido cuenta una vez por comercio y cada uno recibe solo su parte. El label dice “Promedio por orden”. | No coincide con el total que paga el cliente en `/order/:id` (incluye envío) ni con un ticket global; el comercio puede interpretar que el cliente gasta más de lo que gasta. | Etiquetar “Ticket promedio de productos entregados (mi comercio)” o calcular sobre `orders.total` solo para pedidos de un comercio; documentar el caso multi-comercio. |
| STAT-11 | **P2** | Estados de error | `src/hooks/useDeliveryData.ts:520-527`; `src/pages/commerce/Stats.tsx:49-63` | `useCommerceStats` solo devuelve `data` y `loading`; descarta `error`, `isError` y `refetch`. Si la query falla (403, 500, red), `loading` queda en false y `data` en null, y la página muestra “Sin datos de rendimiento”. No hay reintento ni distinción 401/403/red. | El comercio no sabe si no vendió o si la API falló; un 403 por comercio equivocado deja la página muerta y genera soporte. | Exponer `error`, `isError` y `refetch`; tarjeta de error con botón “Reintentar”; mensajes distintos para 401 (sesión), 403 (sin permiso) y error de red. |
| STAT-12 | **P2** | Loading / vacío | `src/pages/commerce/Stats.tsx:35-63`; `src/hooks/useDeliveryData.ts:121-168`; `package.json:53` | Mientras `commerceId` es null, `useCommerceStats(commerceId || 0)` queda deshabilitada; en TanStack Query v5 `isLoading` es false para una query deshabilitada, así que Stats muestra “Sin datos” antes de que `commerce.me`/`commerce.search` resuelvan. `useMerchantCommerceId` devuelve `loading` (168) pero Stats lo ignora. Además, para un comercio válido sin ventas `getStats` devuelve un objeto con ceros, por lo que el bloque “Sin datos” de la página nunca se muestra: el gráfico pinta 7 barras vacías y el ranking sí tiene empty state (`Stats.tsx:261-272`). | Flash de estado vacío/error en la primera carga; el comercio cree que no hay datos. Un comercio nuevo ve un gráfico vacío en lugar de un mensaje de “aún no hay ventas entregadas”. | Usar `loading` de `useMerchantCommerceId` y renderizar skeleton; mostrar el empty state de la página cuando `stats.totalOrders === 0`; mantener el empty state del ranking; copy “Aún no hay ventas entregadas”. |
| STAT-13 | **P2** | Redondeo / formato | `server/commerce-router.ts:194, 209`; `src/pages/commerce/Stats.tsx:206, 214, 256` | `dailySales[].sales` se redondea a entero (`Math.round`), mientras `totalSales` conserva 2 decimales; la etiqueta de la barra muestra `$d.sales` crudo y el tooltip `toFixed(2)`. `$1234` vs `$1234.00`, sin separador de miles. | La suma de las 7 barras puede no cuadrar con el KPI; el gráfico no se puede reconciliar con ventas. Montos altos se leen mal y pueden truncarse en móvil. | Conservar 2 decimales en `dailySales`; usar un `formatMoney` compartido con `Intl.NumberFormat("es-EC", {style:"currency", currency:"USD"})` en KPI, tooltip, ranking y Dashboard; test de 0, 0.5 y 1234.5. |
| STAT-14 | **P2** | Ranking / unidades | `server/commerce-router.ts:181, 197-200`; `src/pages/commerce/Stats.tsx:278-279, 298-300` | El ranking ordena por `sales` (unidades) pero la barra se dimensiona por `revenue / totalTopRevenue`. Un producto #1 por unidades puede tener una barra menor que el #2. `quantity` es `numeric(10,3)` (`schema.ts:215`): para productos vendidos por kg se muestra “0.5 unidades vendidas”. | El medallero y la barra cuentan historias distintas; los productos por peso se muestran como si fueran unidades. | Elegir un criterio (revenue o unidades) y usarlo para orden y barra; devolver `unitType` y pluralizar “kg”/“unidades”; redondear cantidades según la unidad. |
| STAT-15 | **P2** | Accesibilidad / contraste | `src/pages/commerce/Stats.tsx:196-235`; `src/pages/commerce/Stats.tsx:109-111` | Los valores del gráfico solo aparecen en hover; las barras son `div` sin `tabIndex`, `role` ni `aria-label`; no hay tabla alternativa. Los labels usan `text-zinc-400` sobre blanco (contraste ≈ 2.6:1) en textos de 11-12 px. `animate-pulse` no respeta `prefers-reduced-motion`. | Usuarios de teclado, touch y lectores de pantalla no acceden a los valores; contraste insuficiente para WCAG AA. | Mostrar valores visibles o tooltip en `focus`; `aria-label` por barra; `role="img"` con resumen textual o tabla; subir labels a `zinc-600`; respetar reduced motion. |
| STAT-16 | **P2** | Consistencia Stats/Dashboard | `server/commerce-router.ts:212`; `src/pages/commerce/Stats.tsx:103-174`; `src/pages/commerce/Dashboard.tsx:256-273` | `getStats` calcula y devuelve `totalCommission`, pero Stats solo muestra 4 KPIs (ventas, pedidos, ticket, catálogo); Dashboard sí muestra “Comisión Aplicada”. La ruta se llama “Rendimiento & Métricas” y el alcance incluye comisión. | El comercio no puede reconciliar su liquidación desde Stats; tiene que ir al Dashboard. Las dos pantallas no cuentan la misma historia financiera. | Mostrar comisión y neto (`totalSales - totalCommission`) con el dato ya existente, corregido según STAT-07; o enlazar explícitamente al Dashboard. |
| STAT-17 | **P2** | Sesión / tenant (defensa en profundidad) | `src/hooks/useDeliveryData.ts:123, 134, 155-163`; `server/commerce-router.ts:149`; `src/pages/commerce/Stats.tsx:49-63` | Si falta `merchant_user.commerceId`, el fallback `commerce.search` por nombre toma `results[0].id` sin validar que pertenezca al merchant. `commerce.me` se deshabilita si hay un `commerceId` cacheado (`:134`), así que un id stale nunca se corrige. `JSON.parse` no tiene `try/catch` (`:123`). El server bloquea con 403, pero la UI lo muestra como “Sin datos”. Es F-08. | Merchants legacy o tras una reasignación quedan con la página vacía de forma permanente; no hay fuga de datos porque `assertCommerceOwnership` bloquea, pero sí confusión y soporte. Un localStorage corrupto puede romper el render. | Validar siempre con `commerce.me`; no habilitar `getStats` hasta confirmar ownership; limpiar la caché y mostrar un error 403 claro; `try/catch` en `JSON.parse`; eliminar o guardar el fallback por nombre. |
| STAT-18 | **P2** | Tipos / contrato | `src/hooks/useDeliveryData.ts:523`; `src/pages/commerce/Stats.tsx:36, 65-69, 197, 275`; `src/pages/commerce/Dashboard.tsx:103-115` | La respuesta se consume como `any` (`trpcCall<any>`), sin tipo compartido entre backend y frontend. Eso permitió que `topProducts.id`/`salesCount` se rompieran sin error de compilación (STAT-05). | Regresiones silenciosas: `tsc` no detecta campos faltantes; el Dashboard y Stats pueden divergir sin aviso. | Exportar `CommerceStats`/`TopProduct` desde `contracts/` o inferir el tipo del router; tipar `useCommerceStats`; test de contrato para los campos que consume el Dashboard. |

## 4. Integración con el flujo Cliente

### 4.1 Qué coincide hoy

- **Precios y totales del checkout son autoritativos en servidor.** `order.quote`/`order.create` calculan subtotal, envío, comisión y total (`server/order-router.ts:100-198, 324-337`). El cliente no puede imponer montos.
- **Las ventas se congelan al crear el pedido.** `order_items` guarda `unitPrice`, `total`, `productName`, cantidad y `commerceId` (`server/order-router.ts:348-357`; `db/schema.ts:209-218`). Cambiar precios, nombres o pausar productos después no altera las ventas históricas; el impacto se ve en pedidos nuevos.
- **Solo se suman pedidos `delivered`.** `getStats` filtra `order.status === "delivered"` (`commerce-router.ts:173`). Cancelados, `pending_payment`, `payment_rejected`, recibidos, preparando, listos, asignados, retirados y en camino **no** suman. Las cancelaciones del cliente y del comercio quedan fuera.
- **El comercio no puede marcar `delivered` directamente.** `order.updateStatus` valida rol y transición (`order-router.ts:587-596`; `contracts/orderStatus.ts:196-225`): el merchant solo puede `accepted`, `preparing`, `ready_for_pickup`, `cancelled`; el driver/admin marca `delivered`. En el camino normal, `markReady` no marca entregado y no infla ventas.
- **Aislamiento multi-comercio por ítem.** `order_items.commerce_id` filtra las ventas de cada comercio (`commerce-router.ts:154-157`); un pedido con dos comercios se reparte correctamente entre ambos para ventas y ranking.
- **Sin PII en la respuesta.** `getStats` devuelve solo agregados y nombres de producto (`commerce-router.ts:206-215`): no incluye cliente, teléfono, dirección, repartidor, comprobante ni datos de pago.

### 4.2 Dónde no coincide

- **“Ventas Totales” no es el total del pedido del cliente.** Stats suma `order_items.total` (subtotal de productos del comercio), mientras `/order/:id` muestra `orders.total` = subtotal + envío (`order-router.ts:186-197`). La diferencia es el `deliveryFee`, que no es ingreso del comercio. Es correcto para el negocio, pero el copy “Balance de ingresos” y el ticket promedio deben explicarlo (STAT-10).
- **La comisión no coincide con checkout.** Checkout persiste `orders.commission` (`order-router.ts:336`), pero Stats la recalcula con la tasa actual (`commerce-router.ts:203-204`). Si el admin cambió la tasa, la comisión histórica cambia; los reportes oficiales usan el valor persistido (`admin/settings-router.ts:111, 277`). Es el riesgo de integración más importante después de STAT-01 (STAT-07).
- **`markReady` puede sacar un pedido entregado de las métricas.** El flujo normal no lo hace, pero el endpoint no valida estado terminal (STAT-01). Un pedido `delivered` revertido a `ready_for_pickup` deja de sumar; un `cancelled` revivido puede sumar si luego se entrega.
- **El path admin puede forzar estados.** `admin.updateOrderStatus` no usa `canTransition` (`server/admin/orders-router.ts:220-245`): un admin puede pasar `cancelled` a `delivered` y Stats lo contaría. No es un vector del merchant, pero es una fuente de contaminación de métricas que conviene auditar en el consolidado de admin.
- **Multi-comercio:** las ventas y el ranking están bien atribuidos por ítem, pero `orders.commission` es agregado y el ticket promedio es por comercio, no por pedido global. No hay una comisión por comercio persistida que Stats pueda sumar sin recalcular (STAT-07, STAT-10).
- **Precios inválidos pueden contaminar métricas.** `product.create/update` aceptan `price: z.string()` sin validar positivo/finito (`server/product-router.ts:153-240`; F-03 del mapa). Un precio negativo reduce `order_items.total`, `totalSales`, `dailySales` y la comisión; el gráfico oculta barras negativas (`hasSales = d.sales > 0`, `Stats.tsx:199`) y el KPI muestra un total negativo. No es un bug de Stats, pero Stats es el tablero donde se hace visible.
- **Catálogo pausado:** los ítems históricos siguen contando (correcto), pero el KPI “Catálogo Activo” cuenta productos pausados (STAT-06), así que el negocio no ve el impacto real de sus pausas en esa tarjeta.

### 4.3 Riesgo para el cliente

El cliente no ve `/commerce/stats`, pero sí ve los efectos: si la comisión histórica se recalcula, la liquidación del comercio puede cambiar sin que el pedido haya cambiado; si `markReady` revierte un pedido entregado, el comercio puede reclamar una venta que el cliente ya recibió; si un pedido cancelado revive, el comercio podría preparar/entregar algo que el cliente canceló. La fuente de verdad del pedido sigue siendo `orders.status` + `order_status_history`, y Stats debe reflejarla, no recrearla.

## 5. Lo que funciona y no se debe romper

1. **Autorización y ownership.** `commerce.getStats` es `merchantQuery` (`server/middleware.ts:51-62, 78`) y llama `assertCommerceOwnership` (`commerce-router.ts:149`; `order-access.ts:47-57`). Un `commerceId` manipulado desde localStorage o desde la URL devuelve 401/403; no hay IDOR ni fuga entre comercios.
2. **Sin PII.** La respuesta son agregados y nombres de producto; no expone clientes, teléfonos, direcciones, repartidores, comprobantes ni pagos. `totalCommission` se devuelve solo al merchant dueño: es un dato financiero sensible de su propio comercio, no una fuga cross-tenant.
3. **Filtro `delivered`.** Es la base correcta para “ventas realizadas”: cancelados y pagos rechazados no suman. No cambiar a “todos los estados” sin separar métricas de pipeline y realizadas.
4. **Atribución por comercio.** `order_items.commerce_id` permite que un pedido multi-comercio se reparta sin sumar ventas ajenas.
5. **Snapshot histórico.** `order_items` conserva precio, nombre y total del momento de la compra. No reemplazar por el precio actual del producto.
6. **Validación de transiciones.** `orders.updateStatus` usa `contracts/orderStatus.ts` y deriva el rol de `ctx`; el merchant no puede marcar entregado. Mantener esa regla y corregir solo el bypass de `markReady`.
7. **Comisión persistida.** `orders.commission` existe y los reportes oficiales la usan (`admin/settings-router.ts:111, 277`). Es la fuente que Stats debe reconciliar, no reemplazar por un cálculo nuevo.
8. **USD es correcto.** El proyecto opera en dólares (`src/pages/legal/termsData.ts:98, 103`); no hay que cambiar a ARS. Solo falta un formato consistente con `Intl`.
9. **UI base.** El spinner de carga (`Stats.tsx:38-47`), el empty state del ranking (`Stats.tsx:261-272`), la grilla responsive (`Stats.tsx:104`) y el botón de volver con `aria-label` (`Stats.tsx:78-85`) funcionan y no deben romperse.
10. **Caché compartida.** Stats y Dashboard usan la misma clave `["commerce.getStats", id]` (`useDeliveryData.ts:522`); no crear un segundo `QueryClient` ni duplicar la query con otra clave.
11. **División por cero protegida.** `avgTicket` usa `totalOrders > 0` (`commerce-router.ts:202`), `maxSales` usa `Math.max(..., 1)` (`Stats.tsx:65`) y la barra usa `totalTopRevenue > 0` (`Stats.tsx:279`). No se encontró división por cero en esta ruta.

## 6. Evidencia y verificación

### 6.1 Hallazgos conocidos del mapa

| Hallazgo | Estado en esta auditoría | Evidencia |
|---|---|---|
| **F-11** — N+1 y datos engañosos | **Confirmado y ampliado** | N+1 en `commerce-router.ts:167-169`; gráfico histórico por weekday en `:171, 186-195`; `topProducts` sin `id` en `:197-200`. Se agrega el impacto en Dashboard (`Dashboard.tsx:106-115`). |
| **F-18** — etiquetas no coinciden | **Confirmado parcialmente** | Stats: `totalProducts` incluye pausados (`commerce-router.ts:207`; `Stats.tsx:167-171`). Dashboard ya usa `availableCount` (`Dashboard.tsx:247-248`), así que la parte “catálogo” de F-18 ya no aplica al Dashboard, pero “Pedidos Totales” sigue usando `totalOrders` delivered-only (`Dashboard.tsx:229`). |
| **F-17** — Dashboard/Stats “En Vivo” sin SSE | **Confirmado** | `Stats.tsx:91-94`; `useCommerceStats` sin `refetchInterval` (`useDeliveryData.ts:520-527`); `useCommerceEvents` no invalida stats (`useOrderEvents.ts:160-163`). |
| **`topProducts` sin `id`** | **Confirmado** | `commerce-router.ts:197-200`; Dashboard espera `tp.id`/`tp.salesCount` (`Dashboard.tsx:107-113`) y usa `key={prod.id}` (`:421`). |

### 6.2 Comprobaciones ejecutadas

- **Zona horaria/locale de Node:** `node -e` en el repo devolvió `v24.14.1`, `America/Bogota`, `vie` para `2026-11-13T23:30:00Z` y `jue` para `2026-11-13T02:30:00Z`. El mismo instante `02:30Z` es jueves en Bogotá y viernes en UTC: confirma que agrupar con la zona del servidor puede mover una venta de día. Las abreviaturas actuales (`vie`, `jue`) coinciden con `dayNames` (`commerce-router.ts:191`), pero la solución no debe depender de eso.
- **Versión de TanStack Query:** `package.json:53` declara `^5.101.0`; en v5 una query deshabilitada no está `fetching`, por lo que `isLoading` es false y se explica el flash de “Sin datos” de STAT-12.
- **Moneda:** `src/pages/legal/termsData.ts:98, 103` confirma USD como moneda del proyecto; no es un bug de moneda, sino de formato (STAT-13).
- **Búsqueda de tests:** no se encontraron tests que cubran `commerce.getStats` (grep de `getStats` en el repo solo devuelve implementación y hooks). F-20 sigue vigente para esta ruta.
- **Sin cambios:** no se ejecutaron `tsc`, `npm test`, `npm run build`, `db:generate`, migraciones ni E2E; no se reinició el servidor. El resultado es estático y no genera artefactos.

### 6.3 Matriz de verificación

| Criterio | Resultado | Detalle |
|---|---|---|
| Ownership / IDOR | **PASS** | `merchantQuery` + `assertCommerceOwnership`; 403 ante comercio ajeno. |
| PII | **PASS** | Solo agregados y nombres de producto. |
| Solo `delivered` suma | **PASS** | Filtro en `commerce-router.ts:173`; cancelados fuera. |
| Cancelaciones no suman | **PASS** | Mismo filtro; `cancelled` no es `delivered`. |
| `markReady` no altera ventas | **FAIL** | Puede revertir `delivered` o revivir `cancelled` (STAT-01). |
| Comisión coincide con checkout | **FAIL** | Recalcula con tasa actual (STAT-07). |
| Gráfico = últimos 7 días | **FAIL** | Histórico por weekday (STAT-02). |
| Fecha = día de entrega | **FAIL** | Usa `createdAt` y TZ del servidor (STAT-03). |
| Catálogo activo | **FAIL** | Incluye pausados (STAT-06). |
| `topProducts` contrato Dashboard | **FAIL** | Falta `id`/`salesCount` (STAT-05). |
| “En Vivo” | **FAIL** | Sin SSE/polling (STAT-08). |
| Error / vacío / loading | **PARCIAL** | Hay spinner y empty de ranking; faltan error, retry y empty de página (STAT-11/12). |
| Multi-comercio (ventas/ranking) | **PASS** | Filtro por `order_items.commerce_id`. |
| Multi-comercio (comisión/ticket) | **PARCIAL** | Comisión agregada y ticket por comercio (STAT-07/10). |
| Timezone | **PARCIAL** | Verificado en desarrollo; producción no verificada (STAT-03). |
| Performance | **FAIL** | N+1 y full scan histórico (STAT-04). |

### 6.4 No verificado explícitamente

- No se ejecutó `EXPLAIN ANALYZE` ni se midió latencia real de `getStats`; el N+1 se deduce del código.
- No se verificó la zona horaria del servidor de producción ni el volumen real de `orders`/`order_items`.
- No se reprodujo el bypass de `markReady` contra una base real; se deduce de `commerce-router.ts:247-260` y del flujo del driver (`server/driver-router.ts:327-331`).
- No se probó el cambio de `commissionRate` en vivo ni su efecto en reportes; se deduce de `admin/commerces-router.ts:129, 151-155` y `commerce-router.ts:203-204`.
- No se ejecutó E2E de negocio; no hay test de esta ruta.

## 7. Resumen para consolidado (top 5)

1. **STAT-01 — P0 — `markReady` puede revertir un pedido entregado o revivir uno cancelado.** `server/commerce-router.ts:247-260`; `server/order-router.ts:250-262`. Impacto: la venta desaparece o se infla; rompe F-01 y la conciliación de Stats.
2. **STAT-02 — P1 — El gráfico no es “Últimos 7 días”: suma todo el histórico por día de la semana.** `server/commerce-router.ts:171, 186-195`; `src/pages/commerce/Stats.tsx:190-193`. Impacto: el comercio interpreta meses/años como una semana.
3. **STAT-04 — P1 — N+1: una consulta a `orders` por cada pedido histórico.** `server/commerce-router.ts:167-169`. Impacto: latencia O(N), timeout y carga innecesaria; F-11.
4. **STAT-05 — P1 — `topProducts` no devuelve `id` ni `salesCount`; Dashboard muestra revenue como precio.** `server/commerce-router.ts:197-200`; `src/pages/commerce/Dashboard.tsx:106-115`. Impacto: “Más Populares” roto y claves React inválidas; F-11.
5. **STAT-07 — P1 — La comisión histórica se recalcula con la tasa actual, no con la del checkout.** `server/commerce-router.ts:203-204`; `server/order-router.ts:336`. Impacto: la liquidación no coincide con lo cobrado y cambia retroactivamente.

**Siguientes en prioridad (fuera del top 5):** STAT-06 (catálogo activo incluye pausados), STAT-08 (“En Vivo” sin SSE) y STAT-09 (etiquetas “Pedidos Despachados/Totales” sobre delivered-only).

**Riesgo de integración con Cliente (resumen):** las ventas del comercio no son el total del cliente (excluyen envío), la comisión del tablero no es la del checkout si cambió la tasa, y un pedido entregado puede dejar de contar si se llama `markReady` sobre un estado terminal. El filtro `delivered` y el snapshot de precios sí protegen las ventas reales; no deben cambiarse.