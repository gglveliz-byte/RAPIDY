# Performance y carga — Rapidy

**Frente:** 10 (performance y carga)
**Fecha:** 2026-11-13
**Alcance:** benchmark local de endpoints de lectura + plan de carga para login,
quote/create, listados admin y SSE. No se ejecutó carga contra producción ni se
reinició `localhost:3000`. No se ejecutaron migraciones.

## 1. Entregables

- `scripts/load-test.mjs`: benchmark Node sin dependencias nuevas.
- Este documento: límites, datos de prueba, criterios de aceptación y auditoría
  estática de consultas sin límite / N+1.

## 2. Benchmark local

### 2.1 Qué mide

El script usa `fetch` nativo (Node 18+), `performance.now()` y percentiles por
rango (nearest-rank). Mide latencia total incluyendo lectura del body, throughput,
histograma de status y muestras de error. No hace login, mutaciones ni SSE.

| Target       | Endpoint                | Auth           | Observación                                    |
| ------------ | ----------------------- | -------------- | ---------------------------------------------- |
| `health`     | `GET /api/health`       | No             | Liveness sin DB (`server/boot.ts:178`)         |
| `ping`       | `GET /api/trpc/ping`    | No             | Proxy tRPC de liveness (`server/router.ts:14`) |
| `catalog`    | `product.list`          | No             | Catálogo público                               |
| `commerce`   | `commerce.list`         | No             | Comercios activos                              |
| `categories` | `category.list`         | No             | Categorías                                     |
| `featured`   | `product.getFeatured`   | No             | Destacados                                     |
| `top`        | `product.getTopOrdered` | No             | Ranking (consulta agregada + catálogo)         |
| `settings`   | `settings.getPublic`    | No             | Configuración pública                          |
| `quote`      | `order.quote`           | Cookie cliente | Usa los 3 primeros productos del catálogo      |

`quote` se omite si no hay `LOAD_TEST_COOKIE`/`--cookie`, si el catálogo está
vacío o si la cookie no autentica. El script valida `/api/health` antes de
medirlo; si no responde 2xx, lo omite con un aviso.

### 2.2 Seguridad y límites del script

- Solo acepta `localhost`, `127.0.0.1` o `::1`. Cualquier otro host se rechaza
  sin opción de override. No debe apuntar a staging ni producción.
- Topes duros: concurrencia 1–50, duración 1–60 s por target, warmup 0–10 s,
  timeout 0.5–30 s, máximo 20 000 requests por target (default).
- Por defecto: `health,ping,catalog,commerce,quote`, concurrencia 10, 10 s por
  target, warmup 1 s, timeout 5 s.
- No modifica datos. `quote` es una query de lectura.

### 2.3 Ejecución

```powershell
# Listar targets
node scripts/load-test.mjs --list

# Lecturas públicas (rápido)
node scripts/load-test.mjs --targets=health,ping,catalog,commerce `
  --concurrency=5 --duration=5 --warmup=1 --max-requests=3000

# Suite completa de lecturas
node scripts/load-test.mjs --targets=all --concurrency=5 --duration=10 --warmup=1

# Quote autenticado (cookie de una sesión local de cliente)
$env:LOAD_TEST_COOKIE = "quickgo_token=<cookie-local>"
node scripts/load-test.mjs --targets=quote --concurrency=5 --duration=10 --warmup=1
Remove-Item Env:LOAD_TEST_COOKIE

# Salida JSON para comparar ejecuciones
node scripts/load-test.mjs --targets=health,ping,catalog `
  --concurrency=5 --duration=10 --warmup=1 --json |
  Set-Content -Encoding utf8 .\load-results.json
```

El script sale con código 1 si se supera `--max-error-rate` (default 1 %) o el
`--max-p95-ms` opcional. Para aceptación usar `--max-error-rate=0.001` en
lecturas y `0` en escrituras.

### 2.4 Baseline local de referencia

Medición corta ejecutada contra el `localhost:3000` ya en marcha, el
2026-11-13: concurrencia 5, 5 s por target, warmup 1 s, máximo 3 000 requests.
Es una referencia de no regresión, **no un SLA de producción**. La DB local de
este entorno tiene latencia de red; los endpoints tRPC incluyen una ida y vuelta
a DB por request.

| Target     | Requests |    RPS |      p50 |      p95 |        p99 | Errores |
| ---------- | -------: | -----: | -------: | -------: | ---------: | ------: |
| health     |    2 031 | 405.66 |   7.2 ms |  39.3 ms |     119 ms |       0 |
| ping       |      165 |  28.99 | 127.8 ms | 382.5 ms |   1 077 ms |       0 |
| catalog    |      132 |  25.73 | 147.1 ms | 408.1 ms | 1 007.9 ms |       0 |
| commerce   |      135 |  25.51 | 145.6 ms | 401.2 ms |   450.1 ms |       0 |
| categories |       75 |  14.37 | 327.6 ms | 642.8 ms |   851.2 ms |       0 |
| featured   |      142 |  27.39 | 132.7 ms | 414.2 ms |   509.3 ms |       0 |
| top        |       78 |  14.87 | 277.6 ms | 761.4 ms |   963.7 ms |       0 |
| settings   |       75 |  14.89 | 313.5 ms | 615.1 ms |   719.2 ms |       0 |

Conclusiones del baseline:

- `/api/health` no toca DB y es el único endpoint con throughput alto.
- Todos los endpoints tRPC pagan contexto/sesión + DB. `ping` ya cuesta ~128 ms
  p50, por lo que el costo base de tRPC/DB domina a los catálogos pequeños.
- `top` es el más costoso (agrega todo el historial de `order_items` y luego
  ordena en JS); ver riesgo H3.
- El baseline es sensible a otros procesos/agentes y a la latencia de DB. Hay
  que repetirlo 3 veces y usar la mediana antes de comparar.

## 3. Plan de carga

### 3.1 Reglas generales

1. Solo local y con datos descartables. No ejecutar contra producción.
2. Un escenario a la vez; no mezclar login + create + SSE en la misma ventana.
3. Warmup obligatorio (mínimo 30 s o 1 s por target en el benchmark).
4. Tres corridas por escenario; reportar mediana/p95, no la mejor corrida.
5. Si hay 5xx, timeouts o 429 inesperados, detener y revisar antes de subir carga.
6. No usar OTP real, push real ni comprobantes grandes en pruebas de carga.
7. Limpiar los datos creados y verificar conteos antes/después.

### 3.2 Datos de prueba

- Usar la DB local sembrada con `db/seed.ts` o un dump local anonimizado. No
  tocar producción ni ejecutar migraciones para este frente.
- Cuentas dedicadas: `LOAD_TEST_ADMIN_EMAIL`, `LOAD_TEST_MERCHANT_EMAIL`,
  `LOAD_TEST_DRIVER_PHONE` y sus passwords solo en `.env` local o variables de
  sesión. No commitear secretos ni usar credenciales reales.
- Cliente: cookie de una sesión local (`LOAD_TEST_COOKIE`), no un teléfono real.
  Si el proveedor de OTP es externo, **no** cargar `customer.requestOtp`.
- Pedidos de prueba: `idempotencyKey` con prefijo `load-<runId>-` y
  `notes=LOADTEST-<runId>`; dirección y teléfono sintéticos.
- Para listados admin con volumen, usar un dump local desechable con al menos
  1 000 pedidos y 10 000 líneas; nunca poblar producción para la prueba.
- Al terminar, borrar `orders` de prueba y sus hijos (`order_items`,
  `order_status_history`, `order_commerce_status`, `driver_earnings` si aplica).

### 3.3 Matriz de límites

| Escenario                     | VUs / conexiones | Techo aproximado | Duración | Requests máx. |
| ----------------------------- | ---------------: | ---------------: | -------: | ------------: |
| Lecturas públicas (benchmark) |             5–10 |           50 rps |  30–60 s |  3 000/target |
| Login admin/merchant/driver   |              1–2 |            2 rps |     60 s |   100 por rol |
| Quote                         |                5 |           10 rps |     60 s |           500 |
| Create                        |                1 |          0.5 rps |     60 s |            30 |
| Listados admin                |              2–3 |            5 rps |     60 s |           200 |
| SSE                           |            25–50 |              n/a |    5 min | 50 conexiones |

Estos techos son para local. Si el equipo necesita números de capacidad, se
aprueba una ventana separada y se ejecuta contra un entorno de staging con la
misma configuración de DB, proxy y límites de conexiones.

### 3.4 Login

- Endpoint: `POST /api/trpc/login.login` con `{ json: { email, password } }` o
  `{ json: { phone, password } }` para driver.
- Probar admin, merchant y driver por separado. Cada login válido actualiza
  `lastSignInAt`; es una escritura pequeña pero real.
- No probar fuerza bruta: el límite es 8 fallos por IP+identificador en 10 min y
  bloqueo de 15 min (`server/login-router.ts:26-28`). Un 429 durante la prueba
  invalida el escenario.
- No cargar login de cliente por OTP: depende de WhatsApp y puede costar dinero
  o bloquear números. Usar cookie ya emitida para quote.
- Criterio: 100 % de logins válidos, 0 respuestas 429, p95 ≤ 2 000 ms local,
  cookie de sesión presente y `login.checkAuth` correcto después.
- Datos: cuentas de prueba; limpiar solo `lastSignInAt` si se necesita dejar el
  entorno como estaba.

### 3.5 Quote

- Endpoint: `order.quote` (query) con 1–3 `productId` activos y `quantity: 1`.
- Precondición: comercio `active`/`open`, productos disponibles, moneda y
  `delivery_fee`/`min_order_amount` válidos.
- Límite: 5 VUs, 10 rps, 60 s, 500 requests. Solo lectura.
- Criterio: 0 errores, p95 ≤ 1 500 ms local, `lines` coherentes con los
  productos enviados y totales sin `NaN`. Probar también 2 comercios distintos
  para verificar agrupación y comisión, sin crear pedido.
- No usar `paymentReceipt` en quote.

### 3.6 Create

- Endpoint: `order.create` (mutación) con `paymentMethod: "cash"`, dirección y
  teléfono sintéticos, e `idempotencyKey` único por iteración.
- Límite: 1 VU, 0.5 rps, 60 s, máximo 30 pedidos. Es escritura y transacción.
- Criterio: 100 % de respuestas exitosas, p95 ≤ 3 000 ms local, exactamente 30
  pedidos distintos, 0 duplicados por idempotencia, totales iguales a quote y
  filas de `order_items`/`order_commerce_status` completas.
- Replay: repetir el mismo `idempotencyKey` 5 veces y verificar que devuelve
  `idempotent: true` y no crea filas nuevas.
- No usar transferencias ni comprobantes grandes en carga.
- Si `order.create` empieza a fallar por pool o locks, detener; no subir VUs.

### 3.7 Listados admin

- Endpoints y payloads:
  - `admin.orders` con `{ limit: 100, offset: 0 }`.
  - `admin.listProducts` con `{ limit: 200, offset: 0 }`.
  - `admin.listCommerces`.
  - `admin.dashboard` y `admin.commerceCommissions` (estos cargan historial; ver
    auditoría H1/H2/H3).
  - `admin.getReports` con rango de 30 días y tipo `orders`.
- Límite: 2–3 VUs, 5 rps, 60 s, 200 requests. Cookie admin local.
- Criterio: 0 errores, p95 ≤ 2 000 ms para listados paginados y ≤ 3 000 ms para
  dashboard con hasta 10 000 pedidos entregados. Si el dashboard supera el
  umbral, priorizar H1/H2 antes de considerar la prueba aprobada.
- Verificar que `limit`/`offset` se respetan y que no se materializan todos los
  históricos en memoria.

### 3.8 SSE

- Endpoints: `/api/events/admin-dashboard`, `/api/events/orders/:orderId`,
  `/api/events/commerce/:commerceId` y `/api/events/driver/:driverId`.
- Límite: 25 conexiones primero, 50 como máximo, 5 minutos. No superar 50 sin
  revisar memoria del proceso y del proxy.
- Handshake: medir tiempo desde el connect hasta el primer byte; p95 ≤ 2 000 ms
  local. Cada conexión resuelve identidades con varias consultas (ver H8).
- Estabilidad: sin desconexiones inesperadas, sin `MaxListenersExceededWarning`,
  memoria del proceso estable (±10 % después de desconectar) y CPU sin subir de
  forma sostenida.
- Eventos: generar como máximo 10–20 eventos controlados en un pedido de prueba
  (por ejemplo `chat.send` o un cambio de estado local cada 5 s) y medir
  entrega/duplicados. No usar esto para simular carga masiva de escrituras.
- Cleanup: abortar todos los clientes y confirmar que los listeners se retiran
  (los handlers de abort ya existen en `setupSSE`); verificar que no quedan
  conexiones abiertas en el proceso.

### 3.9 Criterios de aceptación local

Se consideran aprobados los escenarios que cumplan:

- 0 respuestas 5xx y 0 timeouts; error rate ≤ 0.1 % en lecturas y 0 % en
  escrituras.
- p95 dentro de los umbrales de las secciones anteriores, en la mediana de 3
  corridas.
- Sin 429 inesperados en login.
- Sin duplicados de pedidos ni filas huérfanas después de create.
- SSE estable 5 minutos con 50 conexiones y limpieza de listeners.
- Sin crecimiento de memoria > 10 % atribuible a la prueba.
- El benchmark `scripts/load-test.mjs` termina con `RESULT PASS`.

Estos criterios son de regresión local. Un SLA de producción requiere una línea
base separada con la infraestructura real, backups y ventana de mantenimiento.

## 4. Auditoría de consultas

Método: lectura estática de los routers y `EXPLAIN` no ejecutado (no se hicieron
migraciones). No se encontraron N+1 de lectura por fila en los listados
principales: `admin.orders` (`server/admin/orders-router.ts:61-142`),
`order.getCommerceOrders` (`server/order-router.ts:998-1121`) y
`order.getByCustomer` (`server/order-router.ts:630-666`) paginan primero y
resuelven los hijos con `inArray`/`Promise.all`. Los riesgos restantes son
consultas sin límite, agregaciones en JS y fan-outs por evento/escritura.

### 4.1 Riesgos altos

| ID  | Archivo:línea                                                         | Hallazgo                                                                                                                            | Impacto                                                                                | Recomendación                                                                                                              |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| H1  | `server/admin/dashboard-router.ts:63`, `:206`, `:412`                 | `loadDeliveredCommissions()` se llama sin cutoff; carga todo el historial de pedidos entregados y, para legacy, todo `order_items`. | Dashboard y comisiones crecen linealmente con el historial; p95 y memoria se degradan. | Agregar `cutoff` obligatorio, agregar en SQL (`SUM/GROUP BY`) y cachear/rollup por período.                                |
| H2  | `server/admin/dashboard-router.ts:231-248`, `:286-337`                | `salesByPeriod`/`earningsByPeriod` cargan todas las órdenes/fees/payouts del período (hasta 10 años para `year`) y agrupan en JS.   | Consulta y payload sin techo; un admin puede pedir 10 años.                            | `GROUP BY` de fecha en SQL con zona Guayaquil; limitar rango y paginar.                                                    |
| H3  | `server/admin/dashboard-router.ts:348-362`, `:385-397`                | `topCommerces` y `categoryRanking` cargan todo `order_items` entregado y recién aplican `limit`/orden en JS.                        | Memoria y CPU O(historial); `limit` no protege la DB.                                  | `GROUP BY`/`ORDER BY`/`LIMIT` en SQL, con filtro de fechas.                                                                |
| H4  | `server/commerce-router.ts:240`, `:266-292`                           | `commerce.getStats` carga todas las líneas entregadas del comercio y agrega en JS, sin rango de fechas.                             | Stats del negocio se degradan con el histórico.                                        | Agregados SQL + rango de fechas/`limit`; snapshot diario si hace falta.                                                    |
| H5  | `server/order-router.ts:683-710`                                      | `getAvailableForDriver` devuelve todos los pedidos `ready_for_pickup` sin `driver_id`, con joins, sin límite.                       | Si se acumulan pedidos listos, el repartidor recibe un payload enorme.                 | `.limit(50)`/cursor y índice compuesto `(status, driver_id, created_at)`.                                                  |
| H6  | `server/driver-router.ts:46-60`                                       | `getProfile` carga todas las ganancias del driver para sumarlas en JS.                                                              | Perfil de driver histórico cada vez más lento.                                         | `SUM(amount)` en SQL; conservar `getEarnings` paginado.                                                                    |
| H7  | `server/events.ts:71-87`, `:90-186`; `server/order-router.ts:239-247` | Cada `emit()` dispara `handlePushNotification`, que consulta DB por evento; `notifyReadyDrivers` emite uno por driver online.       | Un cambio de estado puede generar N consultas y amplificar carga de SSE/push.          | Salir temprano si Firebase no está configurado; resolver token en una sola query; batch/cola; evitar push por cada driver. |
| H8  | `server/boot.ts:223-335`, `:424`                                      | Cada conexión SSE resuelve access+refresh de hasta 4 roles en secuencia (hasta 8 selects) y no hay tope de conexiones.              | Handshake caro y riesgo de agotar DB/pool con muchas pestañas.                         | Resolver identidades únicas por tabla en una query, deduplicar tokens, cachear sesión y limitar conexiones en proxy.       |

### 4.2 Riesgos medios

| ID  | Archivo:línea                                                                                                       | Hallazgo                                                                                                                                 | Impacto                                                                      | Recomendación                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M1  | `server/product-router.ts:75-88`, `:111-121`, `:133-147`, `:168-179`                                                | `product.list`, `getByCommerce`, `getFeatured` y `getTopOrdered` no tienen límite; `getTopOrdered` además ordena todo el catálogo en JS. | Catálogo grande = payload y latencia crecientes.                             | Paginación/cursor o tope explícito; ranking en SQL.                                                              |
| M2  | `server/commerce-router.ts:50-55`, `:89-99`, `:101-111`                                                             | `commerce.list`, `getByCategory` y `commerce.search` devuelven todos los comercios activos sin límite.                                   | Crecimiento del directorio.                                                  | Límite + cursor; `search` ya debería paginar.                                                                    |
| M3  | `server/category-router.ts:8-10`, `server/settings-router.ts:15-17`                                                 | Listados completos de categorías y settings.                                                                                             | Bajo hoy por tamaño de tabla; riesgo si crece.                               | Filtrar solo claves públicas en SQL y cachear settings.                                                          |
| M4  | `server/admin/commerces-router.ts:40-50`; `server/driver-router.ts:15-30`; `server/admin/drivers-router.ts:209-232` | `listCommerces` y `list` de drivers no paginan; `driverPerformance` carga todos los drivers.                                             | Paneles admin con payload creciente.                                         | `limit/offset` o cursor; búsqueda server-side.                                                                   |
| M5  | `server/customer-router.ts:452-455`                                                                                 | `customer.list` tiene `limit(500)` fijo.                                                                                                 | Es un techo, pero 500 clientes por request es alto y no hay paginación real. | Cursor/offset con default 50 y máximo 200.                                                                       |
| M6  | `server/admin/settings-router.ts:152-180`, `:188-240`; `:306`, `:425`, `:484`, `:512`                               | Reportes permiten 2 años; la rama `sales` no tiene límite y las otras usan 5 000/10 000 filas.                                           | Respuestas muy grandes y presión de memoria; export bloqueante.              | Paginar/exportar en job, bajar topes y agregar en SQL.                                                           |
| M7  | `server/customer-router.ts:43-58`, `:98-106`; `db/schema.ts:304-321`                                                | `findCustomerByPhone` usa `REGEXP_REPLACE(phone)` (no sargable) y el rate limit por IP escanea `otp_verifications` sin índice de `ip`.   | OTP lento bajo volumen; no usar para carga masiva.                           | Normalizar teléfono al guardar y usar igualdad; agregar índice `(ip, created_at)` si se habilita OTP productivo. |
| M8  | `server/context.ts:203-212`                                                                                         | Cada request tRPC resuelve hasta 4 roles en serie; cada rol con cookie hace su select.                                                   | Admin/merchant con varias cookies pagan 2–4 queries antes del procedimiento. | Resolver en paralelo los roles con cookie o cachear la sesión por request.                                       |
| M9  | `server/order-router.ts:572-617`                                                                                    | `getById` hace fan-out fijo: acceso (2 queries) + driver + comercios + estados + historial (hasta 6).                                    | No es N+1 por fila, pero es el detalle más caro.                             | Medir y, si hace falta, combinar agregados/joins; mantener límites actuales.                                     |

### 4.3 Escrituras y fan-out

| ID  | Archivo:línea                                | Hallazgo                                                                                                  | Impacto                                                                    | Recomendación                                            |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| W1  | `server/order-router.ts:493-503`, `:526-537` | `order.create` inserta ítems y estados de comercio en un `for` con un `await` por fila (hasta 50 líneas). | Hasta ~50 round-trips dentro de una transacción; sube p95 y retiene locks. | `insert().values(array)` en un solo statement por tabla. |
| W2  | `server/admin/settings-router.ts:143-145`    | `updateSettingsBulk` hace upsert por setting dentro de la transacción.                                    | Bajo (lista acotada), pero es N+1 de escritura.                            | Un solo `INSERT ... ON CONFLICT` con `values` múltiples. |

### 4.4 Consultas correctas (no tocar sin medir)

- `admin.orders` pagina antes de resolver hijos (`server/admin/orders-router.ts:61-142`).
- `order.getCommerceOrders` pagina IDs y usa `Promise.all` + `inArray`
  (`server/order-router.ts:998-1121`).
- `order.getByCustomer` pagina y resuelve ítems con `inArray`
  (`server/order-router.ts:630-666`).
- `admin.listProducts` usa `limit/offset` (`server/admin/products-router.ts:25-58`).
- `chat.getByOrder` usa `limit` y cursor `before` (`server/chat-router.ts:129-150`).

### 4.5 Índices recomendados (no aplicar en este frente)

Ya existen índices útiles en `db/schema.ts` para pedidos, ítems, comercios,
productos y chat. Faltan o conviene revisar:

- `orders (status, driver_id, created_at)` para `getAvailableForDriver`.
- `driver_earnings (driver_id, created_at)` para historial/perfil.
- `otp_verifications (ip, created_at)` solo si se habilita OTP productivo.
- Evaluar `customers` con teléfono normalizado (la consulta actual con
  `REGEXP_REPLACE` no usa el índice único).

No ejecutar `db:push` ni migraciones por este documento; requieren revisión y
ventana propia.

## 5. Orden de remediación sugerido

1. H1/H2/H3/H4: agregados SQL y cutoff; son los que más crecen con el historial.
2. H5/H6/M1/M2/M4: límites/paginación en lecturas públicas y admin.
3. W1: bulk insert en `order.create`.
4. H7: evitar consultas de push por evento y batch de tokens.
5. H8: deduplicar identidad SSE y tope de conexiones.
6. M7/M8 e índices: después de medir `EXPLAIN (ANALYZE, BUFFERS)` local.

## 6. Fuera de alcance / pendientes

- No se ejecutó login, create ni SSE en este frente; el plan queda listo para
  que el agente principal o QA lo corra en local con las cuotas indicadas.
- No se instalaron k6/artillery ni dependencias nuevas. Para escenarios de
  escritura/SSE se puede usar una herramienta externa o un script Node aparte,
  siempre contra loopback.
- No se modificó `package.json` (archivo compartido no asignado); por eso no hay
  un alias `npm run load:test`. Se invoca con `node scripts/load-test.mjs`.
- No se midió con datos de producción ni se hizo tuning de PostgreSQL.
- Observabilidad de latencia/errores por endpoint y alertas queda para el
  frente correspondiente.
