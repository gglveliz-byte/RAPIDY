/**
 * Métricas en memoria, sin dependencias, en formato Prometheus.
 *
 * Reglas de uso:
 * - Los labels deben ser enums acotados (role, outcome, procedure, channel).
 * - Nunca usar ids de usuario/pedido, teléfonos, emails ni tokens como label.
 * - El proceso es la fuente de verdad: las métricas se reinician al reiniciar.
 */

export type MetricLabels = Record<string, string | number | boolean | null | undefined>;
export type MetricValue = number;

type Labels = Record<string, string>;

interface CounterSeries {
  name: string;
  labels: Labels;
  value: number;
}

interface GaugeSeries {
  name: string;
  labels: Labels;
  value: number;
}

interface HistogramSeries {
  name: string;
  labels: Labels;
  buckets: number[];
  bucketCounts: number[];
  count: number;
  sum: number;
}

export const DEFAULT_HISTOGRAM_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];

const MAX_SERIES = readIntegerEnv("METRICS_MAX_SERIES", 2_000, 100, 50_000);
const LABEL_VALUE_MAX_LENGTH = 120;

const counters = new Map<string, CounterSeries>();
const gauges = new Map<string, GaugeSeries>();
const histograms = new Map<string, HistogramSeries>();
const histogramBuckets = new Map<string, number[]>();
const sseActive = new Map<string, number>();

let droppedSeries = 0;
let startedAt = Date.now();

const FORBIDDEN_LABEL_KEY =
  /(pass(word|wd)?|secret|token|authorization|cookie|apikey|otp|phone|email|userid|customerid|driverid|merchantid|orderid|sessionid|cardnumber|cvv)/;

const ROLES = new Set(["customer", "driver", "merchant", "admin", "system", "unknown"]);
const SSE_CHANNELS = new Set(["order", "commerce", "driver", "admin", "commerces", "products", "other"]);
const DB_OPERATIONS = new Set(["select", "insert", "update", "delete", "transaction", "connect", "pool", "other"]);

const JWT_VALUE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const DATABASE_URL_VALUE = /^postgres(ql)?:\/\//i;
const BEARER_VALUE = /^Bearer\s+/i;
const PHONE_VALUE = /^\+\d{7,15}$/;

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeLabelName(name: string): string {
  let safe = name.trim().replace(/[^A-Za-z0-9_]/g, "_");
  if (!safe) safe = "label";
  if (!/^[A-Za-z_]/.test(safe)) safe = `l_${safe}`;
  return safe.slice(0, 100);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripControlChars(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) output += char;
  }
  return output;
}

function sanitizeLabelValue(value: string | number | boolean): string {
  const text = stripControlChars(String(value)).replace(/\s+/g, " ").trim();
  if (!text) return "none";
  if (
    JWT_VALUE.test(text) ||
    DATABASE_URL_VALUE.test(text) ||
    BEARER_VALUE.test(text) ||
    PHONE_VALUE.test(text) ||
    text.includes("@")
  ) {
    return "[REDACTED]";
  }
  return text.length > LABEL_VALUE_MAX_LENGTH
    ? `${text.slice(0, LABEL_VALUE_MAX_LENGTH - 3)}...`
    : text;
}

function normalizeLabels(labels: MetricLabels): Labels {
  const output: Labels = {};
  for (const key of Object.keys(labels).sort()) {
    const value = labels[key];
    if (value === undefined || value === null) continue;
    const name = normalizeLabelName(key);
    if (FORBIDDEN_LABEL_KEY.test(normalizeKey(key))) {
      output[name] = "[REDACTED]";
      continue;
    }
    output[name] = sanitizeLabelValue(value);
  }
  return output;
}

function metricName(name: string): string {
  let safe = String(name ?? "").trim().replace(/[^A-Za-z0-9_:]/g, "_");
  if (!safe) safe = "metric";
  if (!/^[A-Za-z_:]/.test(safe)) safe = `m_${safe}`;
  return safe.slice(0, 200);
}

function seriesKey(name: string, labels: Labels): string {
  const parts = Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`);
  return `${name}\u0000${parts.join("\u0001")}`;
}

function totalSeries(): number {
  return counters.size + gauges.size + histograms.size;
}

function getCounter(rawName: string, rawLabels: MetricLabels = {}): CounterSeries | null {
  const name = metricName(rawName);
  const labels = normalizeLabels(rawLabels);
  const key = seriesKey(name, labels);
  const existing = counters.get(key);
  if (existing) return existing;

  if (totalSeries() >= MAX_SERIES) {
    droppedSeries += 1;
    return null;
  }

  const series: CounterSeries = { name, labels, value: 0 };
  counters.set(key, series);
  return series;
}

function getGauge(rawName: string, rawLabels: MetricLabels = {}): GaugeSeries | null {
  const name = metricName(rawName);
  const labels = normalizeLabels(rawLabels);
  const key = seriesKey(name, labels);
  const existing = gauges.get(key);
  if (existing) return existing;

  if (totalSeries() >= MAX_SERIES) {
    droppedSeries += 1;
    return null;
  }

  const series: GaugeSeries = { name, labels, value: 0 };
  gauges.set(key, series);
  return series;
}

function getHistogram(rawName: string, rawLabels: MetricLabels = {}): HistogramSeries | null {
  const name = metricName(rawName);
  const labels = normalizeLabels(rawLabels);
  const key = seriesKey(name, labels);
  const existing = histograms.get(key);
  if (existing) return existing;

  if (totalSeries() >= MAX_SERIES) {
    droppedSeries += 1;
    return null;
  }

  const buckets = [...(histogramBuckets.get(name) ?? DEFAULT_HISTOGRAM_BUCKETS_MS)];
  const series: HistogramSeries = {
    name,
    labels,
    buckets,
    bucketCounts: new Array(buckets.length + 1).fill(0),
    count: 0,
    sum: 0,
  };
  histograms.set(key, series);
  return series;
}

/** Suma a un contador. Ignora valores no finitos o negativos. */
export function increment(name: string, labels: MetricLabels = {}, amount = 1): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const series = getCounter(name, labels);
  if (series) series.value += amount;
}

/** Fija un gauge. */
export function setGauge(name: string, value: number, labels: MetricLabels = {}): void {
  if (!Number.isFinite(value)) return;
  const series = getGauge(name, labels);
  if (series) series.value = value;
}

export function incrementGauge(name: string, amount = 1, labels: MetricLabels = {}): void {
  if (!Number.isFinite(amount)) return;
  const series = getGauge(name, labels);
  if (series) series.value += amount;
}

export function decrementGauge(name: string, amount = 1, labels: MetricLabels = {}): void {
  if (!Number.isFinite(amount)) return;
  const series = getGauge(name, labels);
  if (series) series.value -= amount;
}

/** Registra una latencia en milisegundos. */
export function observe(name: string, durationMs: number, labels: MetricLabels = {}): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const series = getHistogram(name, labels);
  if (!series) return;

  series.count += 1;
  series.sum += durationMs;
  const index = series.buckets.findIndex((bucket) => durationMs <= bucket);
  if (index === -1) {
    series.bucketCounts[series.buckets.length] += 1;
  } else {
    series.bucketCounts[index] += 1;
  }
}

/** Debe llamarse al arranque, antes de la primera observación. */
export function configureHistogram(name: string, buckets: number[]): void {
  const metric = metricName(name);
  const clean = [...new Set(buckets.filter((bucket) => Number.isFinite(bucket) && bucket > 0))]
    .sort((a, b) => a - b);
  if (!clean.length) return;
  histogramBuckets.set(metric, clean);
}

export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
  sseActive.clear();
  droppedSeries = 0;
  startedAt = Date.now();
}

export function getSseActiveConnections(): Record<string, number> {
  return Object.fromEntries([...sseActive.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function getSseConnectionCount(): number {
  return [...sseActive.values()].reduce((sum, value) => sum + value, 0);
}

function roleLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ROLES.has(normalized) ? normalized : "unknown";
}

function outcomeLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_");
  return (normalized || "unknown").slice(0, 60);
}

function reasonLabel(value: string | null | undefined): string {
  return outcomeLabel(value);
}

function procedureLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return (normalized || "unknown").slice(0, 80);
}

function channelKind(value: string | null | undefined): string {
  const kind = String(value ?? "").split(":")[0]?.trim().toLowerCase() || "other";
  return SSE_CHANNELS.has(kind) ? kind : "other";
}

function dbOperationLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return DB_OPERATIONS.has(normalized) ? normalized : "other";
}

/** Timer reusable para envolver handlers sin dependencias. */
export function startTimer(onStop: (durationMs: number) => void): () => number {
  const start = performance.now();
  let stopped = false;
  return () => {
    if (stopped) return 0;
    stopped = true;
    const durationMs = Math.max(0, performance.now() - start);
    try {
      onStop(durationMs);
    } catch {
      // Una métrica nunca debe tumbar el flujo principal.
    }
    return durationMs;
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function renderLabels(labels: Labels, extra: Labels = {}): string {
  const merged = { ...labels, ...extra };
  const keys = Object.keys(merged).sort();
  if (keys.length === 0) return "";
  return `{${keys.map((key) => `${key}="${escapeLabelValue(merged[key])}"`).join(",")}}`;
}

function sortedBySeries<T extends { name: string; labels: Labels }>(items: Iterable<T>): T[] {
  return [...items].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return seriesKey(left.name, left.labels).localeCompare(seriesKey(right.name, right.labels));
  });
}

/** Expone todas las métricas en el formato de texto de Prometheus. */
export function renderPrometheus(): string {
  const lines: string[] = [];

  const counterNames = [...new Set([...counters.values()].map((series) => series.name))].sort();
  for (const name of counterNames) {
    lines.push(`# HELP ${name} Rapidy counter.`);
    lines.push(`# TYPE ${name} counter`);
    for (const series of sortedBySeries(counters.values())) {
      if (series.name !== name) continue;
      lines.push(`${name}${renderLabels(series.labels)} ${formatNumber(series.value)}`);
    }
  }

  const gaugeNames = [...new Set([...gauges.values()].map((series) => series.name))].sort();
  for (const name of gaugeNames) {
    lines.push(`# HELP ${name} Rapidy gauge.`);
    lines.push(`# TYPE ${name} gauge`);
    for (const series of sortedBySeries(gauges.values())) {
      if (series.name !== name) continue;
      lines.push(`${name}${renderLabels(series.labels)} ${formatNumber(series.value)}`);
    }
  }

  const histogramNames = [...new Set([...histograms.values()].map((series) => series.name))].sort();
  for (const name of histogramNames) {
    lines.push(`# HELP ${name} Rapidy histogram in milliseconds.`);
    lines.push(`# TYPE ${name} histogram`);
    for (const series of sortedBySeries(histograms.values())) {
      if (series.name !== name) continue;
      let cumulative = 0;
      for (let index = 0; index < series.buckets.length; index += 1) {
        cumulative += series.bucketCounts[index];
        lines.push(
          `${name}_bucket${renderLabels(series.labels, { le: formatNumber(series.buckets[index]) })} ${formatNumber(cumulative)}`,
        );
      }
      lines.push(`${name}_bucket${renderLabels(series.labels, { le: "+Inf" })} ${formatNumber(series.count)}`);
      lines.push(`${name}_sum${renderLabels(series.labels)} ${formatNumber(series.sum)}`);
      lines.push(`${name}_count${renderLabels(series.labels)} ${formatNumber(series.count)}`);
    }
  }

  lines.push("# HELP rapidy_metrics_series Series activas en memoria.");
  lines.push("# TYPE rapidy_metrics_series gauge");
  lines.push(`rapidy_metrics_series ${formatNumber(totalSeries())}`);
  lines.push("# HELP rapidy_metrics_series_max Límite configurado de series.");
  lines.push("# TYPE rapidy_metrics_series_max gauge");
  lines.push(`rapidy_metrics_series_max ${formatNumber(MAX_SERIES)}`);
  lines.push("# HELP rapidy_metrics_series_dropped_total Series descartadas por el límite.");
  lines.push("# TYPE rapidy_metrics_series_dropped_total counter");
  lines.push(`rapidy_metrics_series_dropped_total ${formatNumber(droppedSeries)}`);

  return `${lines.join("\n")}\n`;
}

export interface MetricsSnapshot {
  startedAt: string;
  uptimeMs: number;
  series: number;
  maxSeries: number;
  droppedSeries: number;
  counters: Array<{ name: string; labels: Labels; value: number }>;
  gauges: Array<{ name: string; labels: Labels; value: number }>;
  histograms: Array<{
    name: string;
    labels: Labels;
    count: number;
    sumMs: number;
    buckets: Array<{ le: number | "+Inf"; count: number }>;
  }>;
  sseActive: Record<string, number>;
}

/** Vista JSON para /api/health o tests; no expone labels sin sanear. */
export function snapshot(): MetricsSnapshot {
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeMs: Date.now() - startedAt,
    series: totalSeries(),
    maxSeries: MAX_SERIES,
    droppedSeries,
    counters: sortedBySeries(counters.values()).map((series) => ({
      name: series.name,
      labels: { ...series.labels },
      value: series.value,
    })),
    gauges: sortedBySeries(gauges.values()).map((series) => ({
      name: series.name,
      labels: { ...series.labels },
      value: series.value,
    })),
    histograms: sortedBySeries(histograms.values()).map((series) => {
      let cumulative = 0;
      const buckets = series.buckets.map((bucket, index) => {
        cumulative += series.bucketCounts[index];
        return { le: bucket as number | "+Inf", count: cumulative };
      });
      buckets.push({ le: "+Inf" as const, count: series.count });
      return {
        name: series.name,
        labels: { ...series.labels },
        count: series.count,
        sumMs: series.sum,
        buckets,
      };
    }),
    sseActive: getSseActiveConnections(),
  };
}

/**
 * Helpers de instrumentación. No detectan nada por sí solos: hay que llamarlos
 * en los puntos de integración documentados en docs/production/OBSERVABILITY.md.
 */
export const metrics = {
  auth: {
    /** Login/OTP password flow: intento + latencia del intento. */
    login(role: string, outcome: string, durationMs?: MetricValue): void {
      const labels = { role: roleLabel(role), outcome: outcomeLabel(outcome) };
      increment("rapidy_auth_attempts_total", labels);
      if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
        observe("rapidy_auth_login_duration_ms", durationMs, labels);
      }
    },
    tokenRefresh(role: string, outcome: string): void {
      increment("rapidy_auth_token_refresh_total", {
        role: roleLabel(role),
        outcome: outcomeLabel(outcome),
      });
    },
    sessionRejected(role: string, reason: string): void {
      increment("rapidy_auth_session_rejected_total", {
        role: roleLabel(role),
        reason: reasonLabel(reason),
      });
    },
    otp(flow: "request" | "verify" | string, outcome: string): void {
      increment("rapidy_auth_otp_total", {
        flow: outcomeLabel(flow),
        outcome: outcomeLabel(outcome),
      });
    },
  },

  trpc: {
    request(procedure: string, outcome: "success" | "error", durationMs: number): void {
      const labels = { procedure: procedureLabel(procedure), outcome };
      increment("rapidy_trpc_requests_total", labels);
      observe("rapidy_trpc_request_duration_ms", durationMs, labels);
    },
    error(procedure: string, code: string): void {
      increment("rapidy_trpc_errors_total", {
        procedure: procedureLabel(procedure),
        code: reasonLabel(code),
      });
    },
  },

  sse: {
    opened(channel: string): void {
      const kind = channelKind(channel);
      const next = (sseActive.get(kind) ?? 0) + 1;
      sseActive.set(kind, next);
      setGauge("rapidy_sse_connections", next, { channel: kind });
      increment("rapidy_sse_connections_total", { channel: kind, event: "opened" });
    },
    closed(channel: string): void {
      const kind = channelKind(channel);
      const next = Math.max(0, (sseActive.get(kind) ?? 0) - 1);
      sseActive.set(kind, next);
      setGauge("rapidy_sse_connections", next, { channel: kind });
      increment("rapidy_sse_connections_total", { channel: kind, event: "closed" });
    },
    event(channel: string, event: string): void {
      increment("rapidy_sse_events_total", {
        channel: channelKind(channel),
        event: reasonLabel(event),
      });
    },
    writeError(channel: string): void {
      increment("rapidy_sse_write_errors_total", { channel: channelKind(channel) });
    },
  },

  db: {
    query(operation: string, outcome: "success" | "error", durationMs: number): void {
      const labels = { operation: dbOperationLabel(operation), outcome };
      increment("rapidy_db_queries_total", labels);
      observe("rapidy_db_query_duration_ms", durationMs, labels);
    },
    pool(active: number, idle: number, waiting: number): void {
      if (Number.isFinite(active)) {
        setGauge("rapidy_db_pool_connections", Math.max(0, active), { state: "active" });
      }
      if (Number.isFinite(idle)) {
        setGauge("rapidy_db_pool_connections", Math.max(0, idle), { state: "idle" });
      }
      if (Number.isFinite(waiting)) {
        setGauge("rapidy_db_pool_waiting", Math.max(0, waiting));
      }
    },
  },
};