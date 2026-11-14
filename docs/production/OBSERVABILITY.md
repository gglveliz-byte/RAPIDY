# Observabilidad — Rapidy

Documento operativo del frente 9. Cubre logging estructurado, métricas en
memoria, smoke de producción, integración pendiente con Sentry/OpenTelemetry,
dashboards, alertas y retención.

## 1. Estado y alcance

Implementado en este frente (sin dependencias nuevas):

| Archivo | Contenido |
| --- | --- |
| `server/lib/logger.ts` | Logger JSON por niveles, `requestId`, redacción de secretos/PII |
| `server/lib/metrics.ts` | Contadores, gauges e histogramas en memoria; render Prometheus |
| `scripts/production-health-smoke.mjs` | Smoke de `/api/health` y fuga de secretos |
| `docs/production/OBSERVABILITY.md` | Este runbook |

Pendiente de integrar (archivos propiedad de otros frentes; **no se editaron**):

| Archivo / punto | Cambio pendiente | Dueño |
| --- | --- | --- |
| `server/boot.ts` | Middleware de `requestId`, readiness `/api/health/ready`, `/api/metrics`, métricas SSE y tRPC (el liveness `/api/health` ya existe) | Seguridad |
| `server/login-router.ts` | Métricas de login/OTP y logs de intentos sin credenciales | Seguridad |
| `server/context.ts`, `server/*-auth.ts` | Métricas de refresh y sesiones rechazadas | Seguridad |
| `server/queries/connection.ts` | Latencia de queries y gauges del pool | Seguridad / DB |
| `server/lib/otp.ts` | Métricas de envío/verificación OTP | Seguridad |
| Despliegue | Log drain, scrape de métricas, Sentry u OTel, probes externos | Infra |

> El liveness `/api/health` ya está implementado por Seguridad y el smoke pasa
> contra él. Queda pendiente: `requestId`, readiness, `/api/metrics` y la
> instrumentación de SSE/tRPC. Registrar cualquier ruta nueva antes del
> catch-all `app.all("/api/*", ... 404)`.

## 2. `/api/health` y readiness

### 2.1 Contrato actual (liveness, ya implementado)

`server/boot.ts` (propiedad de Seguridad) expone un **liveness** barato, sin
consultar la base de datos ni exponer versión/entorno:

```http
GET /api/health HTTP/1.1
Accept: application/json
```

```json
{ "status": "ok" }
```

Requisitos que valida el smoke:

- `200`, `Content-Type: application/json`, `Cache-Control: no-store`.
- JSON objeto con `status` en `ok`/`healthy`/`up`.
- Sin `Set-Cookie`, `X-Powered-By`, secretos, PII ni stack traces.

Este contrato es suficiente para un probe externo de liveness. No reemplazarlo
por un chequeo profundo: un fallo de DB reiniciaría el proceso innecesariamente.

### 2.2 Campos extendidos (opcionales)

El smoke valida estos campos **solo si están presentes**; no son obligatorios
para el liveness actual:

| Campo | Validación |
| --- | --- |
| `uptimeSeconds` / `uptime` | número finito `>= 0` |
| `timestamp` / `checkedAt` | fecha ISO parseable |
| `service` | string no vacío |
| `checks.db` o `db` | estado `ok`/`healthy`/`up` |
| `checks.*` | todos los checks en estado sano |
| `X-Request-Id` | `[A-Za-z0-9._:-]{8,128}` si se devuelve |

Si se amplía la respuesta, nunca incluir `error.message`, `stack`,
`DATABASE_URL`, versión de PostgreSQL, cookies, tokens, teléfonos ni emails.

### 2.3 Readiness recomendado `/api/health/ready` (pendiente)

Añadir un endpoint separado que sí consulte DB y devuelva `503` cuando esté
degradado. No aplicar desde este frente; el snippet asume imports existentes y
`sql` de `drizzle-orm`:

```ts
import { sql } from "drizzle-orm";
import { logger, logError } from "./lib/logger";
import { getSseConnectionCount, snapshot } from "./lib/metrics";

app.get("/api/health/ready", async (c) => {
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;

  try {
    const { getDb } = await import("./queries/connection");
    const startedDb = performance.now();
    await getDb().execute(sql`select 1`);
    dbLatencyMs = Math.round(performance.now() - startedDb);
  } catch (error) {
    dbStatus = "error";
    logger.error("health_db_check_failed", { error: logError(error) });
  }

  const healthy = dbStatus === "ok";
  c.header("Cache-Control", "no-store");
  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "rapidy-api",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        db: { status: dbStatus, latencyMs: dbLatencyMs },
        sse: { status: "ok", connections: getSseConnectionCount() },
        metrics: { status: "ok", series: snapshot().series },
      },
    },
    healthy ? 200 : 503,
  );
});
```

El smoke puede apuntar al readiness sin cambiar código:

```bash
HEALTH_PATH=/api/health/ready node scripts/production-health-smoke.mjs
```

### 2.4 requestId (pendiente en `server/boot.ts`)

No aplicar desde este frente. Va antes de las rutas, tRPC y el catch-all
`app.all("/api/*", ...)`:

```ts
import { requestIdFromHeaders, runWithRequestId } from "./lib/logger";

app.use("*", async (c, next) => {
  const requestId = requestIdFromHeaders(c.req.raw.headers);
  c.header("X-Request-Id", requestId);
  await runWithRequestId(requestId, next);
});
```

`/api/metrics` para Prometheus (no público; red privada o token):

```ts
import { renderPrometheus } from "./lib/metrics";

app.get("/api/metrics", (c) => {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return c.text("Not Found", 404);
  const authorization = c.req.header("authorization") ?? "";
  if (authorization !== `Bearer ${expected}`) return c.text("Unauthorized", 401);

  c.header("Cache-Control", "no-store");
  c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return c.body(renderPrometheus());
});
```

Notas: comparar el token en tiempo constante (`crypto.timingSafeEqual`) o
restringir el scrape a la red privada. El ejemplo simple prioriza claridad.

## 3. Logger estructurado

`server/lib/logger.ts` escribe **una línea JSON por evento** a stdout
(`debug`/`info`) o stderr (`warn`/`error`/`fatal`). No usa `console.*` para
evitar formato libre.

### Uso

```ts
import { createLogger, logger, logError } from "./lib/logger";

logger.info("order_status_updated", {
  orderId: 123,
  role: "driver",
  from: "picked_up",
  to: "on_the_way",
  durationMs: 184,
});

// Logger con campos fijos (job, worker, integración)
const pushLogger = createLogger({ component: "firebase" });
pushLogger.warn("push_failed", { attempt: 2, error: logError(error) });

// Nunca pasar el request/body completo ni cookies.
```

Salida (una línea, sin saltos internos):

```json
{"component":"firebase","attempt":2,"timestamp":"2026-11-13T18:04:11.000Z","level":"warn","msg":"push_failed","service":"rapidy-api","env":"production","requestId":"9f1c..."}
```

### Niveles y variables

| Variable | Default | Uso |
| --- | --- | --- |
| `LOG_LEVEL` | `info` (`warn` en test) | `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_SERVICE` | `rapidy-api` | Campo `service` |
| `APP_VERSION` o `GIT_SHA` | vacío | Campo `version`; también para Sentry |
| `NODE_ENV` | `development` | Campo `env` |

### requestId

- `requestIdFromHeaders(headers)` reutiliza `x-request-id`,
  `x-correlation-id` o el `trace-id` de `traceparent` W3C; si no hay, genera un
  UUID. Rechaza valores fuera de `[A-Za-z0-9._:-]{8,128}`.
- `runWithRequestId(id, fn)` instala el id en `AsyncLocalStorage`; todos los
  logs del handler, promesas y callbacks lo heredan.
- `logger.child({ requestId })` sirve para jobs fuera de un request HTTP.
- Devolver `X-Request-Id` al cliente permite cruzar un incidente con logs.

### Redacción

`redact()` y el logger redactan antes de serializar:

| Dato | Tratamiento |
| --- | --- |
| Password, passwd, pwd, secret, token, cookie, authorization, api key, private key, OTP, session id, CVV | `[REDACTED]` |
| Teléfonos (por clave `phone`, `telefono`, `celular`, `whatsapp`, etc.) | Solo últimos 2 dígitos: `***67` |
| Email | `j***@dominio.com` |
| JWT, `Bearer`, URL `postgres://user:pass@...`, bloques PEM | Patrón reemplazado, incluso dentro de textos |
| `password=...`, `token: ...` en mensajes libres | Valor reemplazado |
| Errores | `name`, `message`, `stack` y `cause` redactados |
| Objetos circulares, getters, profundidad, arrays enormes | `[Circular]`, `[Getter]`, `[MaxDepth]`, límite de 50 ítems |

Limitaciones: la redacción es defensa en profundidad, no una autorización para
loguear payloads completos. No registrar `req`/`res` completos, cuerpos de
login, códigos OTP, direcciones, notas de pedido ni `Set-Cookie`. Para datos de
soporte usar `requestId` y el id interno del pedido, no PII.

## 4. Métricas en memoria

`server/lib/metrics.ts` implementa contadores, gauges e histogramas sin
dependencias, con exposición Prometheus (`text/plain; version=0.0.4`). Son
**por proceso**: se reinician al reiniciar y no se comparten entre réplicas.

### Helpers

```ts
import { metrics, startTimer } from "./lib/metrics";

// Auth: role customer|driver|merchant|admin; outcome success|failure|...
metrics.auth.login("merchant", "failure", 182);
metrics.auth.tokenRefresh("customer", "success");
metrics.auth.sessionRejected("driver", "session_version");
metrics.auth.otp("verify", "failure");

// tRPC
const stop = startTimer((durationMs) =>
  metrics.trpc.request("order.create", "success", durationMs),
);
// ... handler ...
stop();
metrics.trpc.error("order.create", "CONFLICT");

// SSE (el helper normaliza order:123 -> order)
metrics.sse.opened("order:123");
metrics.sse.event("order:123", "status_update");
metrics.sse.writeError("order:123");
metrics.sse.closed("order:123");

// DB
metrics.db.query("select", "success", 7);
metrics.db.pool(active, idle, waiting);
```

### Métricas emitidas

| Métrica | Tipo | Labels |
| --- | --- | --- |
| `rapidy_auth_attempts_total` | counter | `role`, `outcome` |
| `rapidy_auth_login_duration_ms` | histogram | `role`, `outcome` |
| `rapidy_auth_token_refresh_total` | counter | `role`, `outcome` |
| `rapidy_auth_session_rejected_total` | counter | `role`, `reason` |
| `rapidy_auth_otp_total` | counter | `flow`, `outcome` |
| `rapidy_trpc_requests_total` | counter | `procedure`, `outcome` |
| `rapidy_trpc_request_duration_ms` | histogram | `procedure`, `outcome` |
| `rapidy_trpc_errors_total` | counter | `procedure`, `code` |
| `rapidy_sse_connections` | gauge | `channel` |
| `rapidy_sse_connections_total` | counter | `channel`, `event` |
| `rapidy_sse_events_total` | counter | `channel`, `event` |
| `rapidy_sse_write_errors_total` | counter | `channel` |
| `rapidy_db_queries_total` | counter | `operation`, `outcome` |
| `rapidy_db_query_duration_ms` | histogram | `operation`, `outcome` |
| `rapidy_db_pool_connections` | gauge | `state` (`active`/`idle`) |
| `rapidy_db_pool_waiting` | gauge | — |
| `rapidy_metrics_series` / `_max` / `_dropped_total` | gauge/counter | — |

Buckets de latencia (ms): `5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000`.
Se pueden cambiar al arranque con `configureHistogram(name, buckets)`.

### Reglas de cardinalidad

- Labels solo con enums acotados: `role`, `outcome`, `procedure`, `channel`,
  `operation`, `code`, `state`. **Nunca** ids, teléfonos, emails, tokens ni
  texto libre.
- `METRICS_MAX_SERIES` (default `2000`, rango `100..50000`) limita series. Al
  superarlo se descartan nuevas series y sube
  `rapidy_metrics_series_dropped_total`.
- Un `procedure` desconocido se normaliza y trunca; aun así, no exponer el
  endpoint de métricas a Internet sin token/proxy.
- Contadores: usar `rate()`/`increase()` en consultas, nunca el valor absoluto
  tras un reinicio.

### Vista JSON

`snapshot()` devuelve `startedAt`, `uptimeMs`, `series`, `maxSeries`,
`droppedSeries`, contadores, gauges, histogramas y `sseActive`. Es apto para
`/api/health` o tests; no incluye labels sin sanear.

## 5. Integración pendiente: tRPC, SSE y DB

Estos cambios no están aplicados. Deben hacerlos los dueños de los archivos.

### tRPC (`server/boot.ts`)

```ts
import { metrics } from "./lib/metrics";

app.all("/api/trpc/*", async (c) => {
  const started = performance.now();
  const procedure = c.req.path.replace(/^\/api\/trpc\/?/, "").split("?")[0] || "unknown";
  try {
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext,
    });
    metrics.trpc.request(
      procedure,
      response.ok ? "success" : "error",
      performance.now() - started,
    );
    if (!response.ok) metrics.trpc.error(procedure, String(response.status));
    return response;
  } catch (error) {
    metrics.trpc.request(procedure, "error", performance.now() - started);
    metrics.trpc.error(procedure, "handler_exception");
    throw error;
  }
});
```

Si el adapter permite `onError`, registrar ahí el `TRPCError.code` real
(`UNAUTHORIZED`, `CONFLICT`, etc.) en lugar del status HTTP.

### SSE (`server/boot.ts`, `setupSSE`)

```ts
import { metrics } from "./lib/metrics";

metrics.sse.opened(channel);
// dentro del listener, tras writeSSE:
metrics.sse.event(channel, "update");
// en catch de writeSSE:
metrics.sse.writeError(channel);
// dentro de cleanup(), una sola vez:
metrics.sse.closed(channel);
```

El gauge baja aunque el cliente cierre abruptamente porque `cleanup()` es
idempotente. Vigilar que no quede negativo: el helper ya hace `max(0, n)`.

### DB (`server/queries/connection.ts`)

Envolver el pool una sola vez y exportar el pool si se necesitan gauges:

```ts
import { metrics } from "../lib/metrics";

const originalQuery = pool.query.bind(pool);
pool.query = async (...args: Parameters<typeof pool.query>) => {
  const started = performance.now();
  const first = args[0];
  const text = typeof first === "string" ? first : (first as { text?: string })?.text ?? "";
  const operation = text.trim().split(/\s+/)[0]?.toLowerCase() || "other";
  try {
    const result = await originalQuery(...args);
    metrics.db.query(operation, "success", performance.now() - started);
    return result;
  } catch (error) {
    metrics.db.query(operation, "error", performance.now() - started);
    throw error;
  }
};

pool.on("error", (error) => {
  logger.error("db_pool_error", { error: logError(error) });
});

// Gauges: actualizar en cada scrape/health o con un intervalo .unref().
metrics.db.pool(pool.totalCount, pool.idleCount, pool.waitingCount);
```

Alternativa de bajo riesgo: instrumentar solo los repositorios/hot paths
(`order.create`, `order.list`, `login`, jobs) en lugar de parchear el pool. Si
se parchea, validar tipos con `tsc` y no loguear el SQL ni los parámetros.

### Auth

Puntos mínimos:

| Punto | Helper |
| --- | --- |
| `login-router.ts` éxito/fallo/bloqueo | `metrics.auth.login(role, outcome, durationMs)` |
| `login-router.ts` refresh/logout | `metrics.auth.tokenRefresh(role, outcome)` |
| `context.ts` y `*-auth.ts` sessionVersion inválido | `metrics.auth.sessionRejected(role, "session_version")` |
| `lib/otp.ts` envío/verificación | `metrics.auth.otp("request" \| "verify", outcome)` |

No incluir el identificador usado para login (teléfono/email), ni el código OTP,
ni el motivo exacto con datos del usuario. Usar enums: `invalid_credentials`,
`rate_limited`, `blocked`, `session_version`, `expired`, `invalid_code`.

## 6. Sentry (errores y trazas de excepción)

Dependencia nueva, **pendiente de aprobar/instalar**:

```bash
npm install @sentry/node
```

Variables (no commitear valores):

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

`server/instrument.ts` (nuevo, importado **primero** en `server/boot.ts`, que es
propiedad de Seguridad):

```ts
import * as Sentry from "@sentry/node";
import { redact } from "./lib/logger";
import { getRequestId } from "./lib/logger";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.APP_VERSION || process.env.GIT_SHA,
    tracesSampleRate: Number(
      process.env.SENTRY_TRACES_SAMPLE_RATE ??
        (process.env.NODE_ENV === "production" ? 0.1 : 0),
    ),
    sendDefaultPii: false,
    attachStacktrace: true,
    beforeSend(event) {
      // Defensa en profundidad: headers, extra, breadcrumbs y request data.
      return redact(event) as typeof event;
    },
  });
}
```

Captura en el handler de errores de Hono (si Seguridad lo añade):

```ts
import * as Sentry from "@sentry/node";
import { getRequestId, logger, logError } from "./lib/logger";

app.onError((error, c) => {
  Sentry.captureException(error, { tags: { requestId: getRequestId() ?? "unknown" } });
  logger.error("unhandled_request_error", { error: logError(error), path: c.req.path });
  return c.json({ error: "Internal Server Error" }, 500);
});
```

Reglas:

- No adjuntar cookies, headers de autorización, body de login, OTP ni teléfonos.
- No usar `Sentry.setUser` con email/teléfono; como máximo un id interno opaco.
- `tracesSampleRate` bajo (0.05–0.1). Errores al 100 %.
- Subir source maps en CI (`sentry-cli sourcemaps upload dist`) con
  `SENTRY_AUTH_TOKEN` solo en el entorno de build.
- Sentry y OpenTelemetry a la vez duplican trazas: elegir uno como primario o
  usar la integración OTel de Sentry.

## 7. OpenTelemetry (trazas y métricas)

Dependencias nuevas, **pendientes**:

```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http
```

`server/instrument.ts`, cargado antes de `app`/`boot`:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "rapidy-api",
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT, // ej. http://otel-collector:4318/v1/traces
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

Variables:

```dotenv
OTEL_SERVICE_NAME=rapidy-api
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
```

Notas:

- La auto-instrumentación cubre HTTP y `pg`; Hono/tRPC no genera spans de
  procedimiento automáticamente. Para eso, crear spans manuales con
  `trace.getTracer("rapidy")` en el wrapper de `/api/trpc/*` o en los
  middlewares de auth.
- Atributos permitidos: `rapidy.role`, `rapidy.outcome`, `rapidy.procedure`,
  `rapidy.channel`, `http.status_code`, `request.id`. Prohibidos: teléfono,
  email, cookies, Authorization, body, SQL con parámetros, OTP.
- Sampling 10 % en producción; 100 % de errores con tail sampling si el
  collector lo permite.
- Enviar logs JSON por stdout al colector (Loki/CloudWatch/OTLP logs) en vez de
  duplicarlos como spans de log.

## 8. Dashboards mínimos

Un tablero "Rapidy / Producción" con filas Salud, Tráfico, Auth, SSE y DB.
Scrape cada 15 s; `sum by` para agregar réplicas.

| Panel | Consulta PromQL | Objetivo |
| --- | --- | --- |
| Salud | probe externo a `/api/health` | 200 en < 2 s |
| Requests tRPC | `sum by (procedure) (rate(rapidy_trpc_requests_total[5m]))` | ver tráfico y errores |
| Error ratio | `sum(rate(rapidy_trpc_requests_total{outcome="error"}[5m])) / clamp_min(sum(rate(rapidy_trpc_requests_total[5m])), 0.001)` | < 1 % |
| Latencia p95 | `histogram_quantile(0.95, sum by (le, procedure) (rate(rapidy_trpc_request_duration_ms_bucket[5m])))` | < 1.5 s |
| Latencia p99 | igual con `0.99` | < 3 s |
| Errores por código | `sum by (procedure, code) (rate(rapidy_trpc_errors_total[5m]))` | top offenders |
| Intentos auth | `sum by (role, outcome) (rate(rapidy_auth_attempts_total[5m]))` | detectar fallos |
| Fallos auth | `sum by (role) (rate(rapidy_auth_attempts_total{outcome!="success"}[5m]))` | < 20/min por rol |
| Latencia login | `histogram_quantile(0.95, sum by (le, role) (rate(rapidy_auth_login_duration_ms_bucket[5m])))` | < 1 s |
| OTP | `sum by (flow, outcome) (rate(rapidy_auth_otp_total[5m]))` | fallos de envío/verificación |
| SSE activas | `sum by (channel) (rapidy_sse_connections)` | capacidad |
| SSE eventos | `sum by (channel, event) (rate(rapidy_sse_events_total[5m]))` | throughput |
| SSE errores | `sum(rate(rapidy_sse_write_errors_total[5m]))` | < 0.2/s |
| DB p95 | `histogram_quantile(0.95, sum by (le, operation) (rate(rapidy_db_query_duration_ms_bucket[5m])))` | < 250 ms |
| DB errores | `sum by (operation) (rate(rapidy_db_queries_total{outcome="error"}[5m]))` | 0 |
| Pool DB | `rapidy_db_pool_connections` y `rapidy_db_pool_waiting` | waiting = 0 |
| Cardinalidad | `rapidy_metrics_series_dropped_total` | 0 |

Añadir en el mismo tablero (node exporter / runtime, no incluidas en este
frente): `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds`,
reinicios del proceso y uso de CPU. Sin `prom-client` no se exponen estas
últimas desde la app.

## 9. Alertas mínimas

| Alerta | Condición | Ventana | Severidad | Acción |
| --- | --- | --- | --- | --- |
| Health down | probe externo falla 3 veces seguidas | 90 s | Crítica | revisar proceso/DB; no reiniciar en bucle |
| Error ratio tRPC | ratio 5xx > 2 % | 5 min | Crítica | revisar top `procedure`/`code` y logs por `requestId` |
| Error ratio alto | ratio 5xx > 0.5 % | 10 min | Warning | investigar antes de que escale |
| Latencia p95 | `> 1.5 s` | 10 min | Warning | DB pool, queries lentas, SSE |
| Latencia p95 | `> 3 s` | 5 min | Crítica | page on-call |
| Fallos auth | ratio fallos > 50 % y > 20/min | 5 min | Warning (seguridad) | posible credential stuffing; revisar bloqueos |
| Rate limit login | `increase(rapidy_auth_attempts_total{outcome="rate_limited"}[5m]) > 10` | 5 min | Warning | revisar IPs/identificadores agregados |
| DB errores | `> 5` errores | 5 min | Crítica | ver pool/conexiones; no exponer error al cliente |
| DB p95 | `> 500 ms` | 10 min | Warning | índices/queries; revisar `operation` |
| Pool waiting | `> 5` | 5 min | Warning | ampliar pool o revisar fugas |
| SSE write errors | `> 0.2/s` | 5 min | Warning | clientes móviles/red/proxy |
| SSE caída | conexiones bajan > 50 % con tráfico estable | 5 min | Warning | proxy, timeouts, deploy |
| Cardinalidad | `rapidy_metrics_series_dropped_total > 0` | 15 min | Warning | agregar/revisar labels |
| Reinicios | > 2 reinicios del proceso | 15 min | Crítica | crash loop/OOM |
| Memoria | RSS > 85 % del límite | 15 min | Warning | fuga/carga; revisar heap |
| Event loop lag | p99 > 200 ms | 5 min | Warning | CPU/bloqueo síncrono |

Canal: críticas a página on-call; warnings a Slack/email. Toda alerta debe
enlazar este documento y el panel. Probar las alertas con un entorno staging;
no silenciar más de 30 min sin ticket.

## 10. Retención y privacidad

| Señal | Retención sugerida | Notas |
| --- | --- | --- |
| Logs JSON de aplicación | 14 días calientes, 90 días fríos | Nivel `info` en producción; `debug` solo temporal |
| Logs de auth/seguridad | 1 año | Sin OTP, tokens, passwords ni teléfonos completos |
| Métricas Prometheus | 15 s scrape; 30 días raw, 1 año downsampled | Agregar por `procedure`/`role`; no por usuario |
| Trazas | 10 % sampling; 7 días hot, 30 días errores | 100 % errores si el costo lo permite |
| Sentry | 30 días (errores), según plan | `sendDefaultPii: false`; eventos redactados |
| Resultados del health smoke | 30 días en CI | No guardar cuerpos de respuesta con secretos |
| Auditoría de settings/admin | 1 año | Frente de auditoría; no mezclar con logs técnicos |

- Cifrado en tránsito (TLS) y en reposo en el proveedor de logs.
- Acceso de solo lectura para dashboards; mínimo privilegio para el colector.
- Relojes en UTC; el logger ya emite ISO-8601 con `Z`.
- Residencia de datos según el proveedor y normativa aplicable (LOPDP Ecuador /
  contratos con clientes). No enviar PII a Sentry/OTel.
- Borrado por retención automática; los backups se rigen por el frente de
  backups, no por este documento.
- Coste: no loguear bodies, query params ni payloads; usar muestreo y niveles.

## 11. Verificación

### Tipos y sintaxis

```bash
npx tsc -b
node --check scripts/production-health-smoke.mjs
```

### Smoke

```bash
# Local (no reinicia el servidor)
node scripts/production-health-smoke.mjs

# Otro entorno
HEALTH_BASE_URL=https://rapidy.example.com node scripts/production-health-smoke.mjs
```

Comprueba: `200`, JSON, `Cache-Control: no-store`, latencia, tamaño, ausencia de
`Set-Cookie`/`X-Powered-By`, `status` saludable, valores de entorno sensibles,
patrones de secretos/stack traces y claves sensibles en el JSON. Si el endpoint
expone `uptime`, `timestamp`, `service`, `checks` o `X-Request-Id`, también los
valida; el check de DB solo se exige cuando el endpoint reporta `checks`.

Contra el liveness actual el resultado esperado es todo `PASS` (12 checks). Con
`HEALTH_PATH=/api/health/ready`, el smoke exige además el check de DB. El script
nunca imprime el valor de un secreto encontrado, solo la variable o el patrón.

### Checklist de go-live

- [ ] `requestId` en logs y header `X-Request-Id`.
- [ ] `/api/health` responde 200 sin secretos y con `no-store`; readiness responde 200/503 si se añade.
- [ ] `/api/metrics` solo accesible por red privada/token.
- [ ] Login, refresh, sesión rechazada y OTP instrumentados.
- [ ] tRPC, SSE y DB instrumentados; gauges del pool actualizados.
- [ ] Log drain configurado y JSON parseado; alertas de parseo.
- [ ] Sentry u OTel inicializado antes de la app; PII desactivada.
- [ ] Dashboard y las alertas críticas probadas en staging.
- [ ] Retención y acceso revisados; sin secretos en muestras.
- [ ] Smoke ejecutado contra producción desde la red externa.