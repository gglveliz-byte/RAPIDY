#!/usr/bin/env node
/**
 * Rapidy load benchmark (local only, zero dependencies).
 *
 * Mide latencia y throughput de endpoints de lectura con concurrencia fija y
 * percentiles. Rechaza cualquier host que no sea loopback y aplica topes duros
 * de concurrencia, duración y número de requests para no tumbar el entorno
 * local. No ejecuta escrituras, login, create ni SSE.
 *
 * Uso:
 *   node scripts/load-test.mjs
 *   node scripts/load-test.mjs --targets=ping,catalog,quote --concurrency=5 --duration=10
 *   LOAD_TEST_COOKIE="quickgo_token=..." node scripts/load-test.mjs --targets=quote
 *   node scripts/load-test.mjs --list
 */

import process from "node:process";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const HARD_LIMITS = {
  concurrency: 50,
  durationSec: 60,
  warmupSec: 10,
  timeoutMs: 30_000,
  maxRequests: 20_000,
};

const DEFAULT_TARGETS = ["health", "ping", "catalog", "commerce", "quote"];
const ALL_TARGETS = [
  "health",
  "ping",
  "catalog",
  "commerce",
  "categories",
  "featured",
  "top",
  "settings",
  "quote",
];

const VALUE_FLAGS = new Set([
  "base-url",
  "targets",
  "concurrency",
  "duration",
  "warmup",
  "timeout",
  "max-requests",
  "max-error-rate",
  "max-p95-ms",
  "cookie",
]);

const BOOLEAN_FLAGS = new Set(["help", "list", "json"]);

function parseCli(argv) {
  const opts = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Argumento no reconocido: ${token}`);
    }

    let key = token.slice(2);
    let value;
    const equalsAt = key.indexOf("=");
    if (equalsAt >= 0) {
      value = key.slice(equalsAt + 1);
      key = key.slice(0, equalsAt);
    }

    if (BOOLEAN_FLAGS.has(key)) {
      opts[key] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`Opción no reconocida: --${key}`);
    }
    if (value === undefined) {
      index += 1;
      value = argv[index];
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Falta el valor de --${key}`);
    }
    opts[key] = value;
  }
  return opts;
}

function toInteger(value, fallback, label, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function toNumber(value, fallback, label, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} debe ser un número entre ${min} y ${max}.`);
  }
  return parsed;
}

function normalizeBaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Base URL inválida: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("La Base URL debe usar http o https.");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Solo se permite cargar contra localhost/127.0.0.1/::1 (recibido: ${parsed.hostname}). ` +
        "Este script no debe apuntar a staging ni producción."
    );
  }
  return parsed.origin;
}

function trpcUrl(baseUrl, procedure, input = {}) {
  const payload = encodeURIComponent(JSON.stringify({ json: input }));
  return `${baseUrl}/api/trpc/${procedure}?input=${payload}`;
}

function authHeaders(cookie) {
  const headers = {
    accept: "application/json",
    "user-agent": "rapidy-load-test/1.0 (local)",
  };
  if (cookie) headers.cookie = cookie;
  return headers;
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function requestText(url, { timeoutMs, cookie }) {
  const clock = timeoutSignal(timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: authHeaders(cookie),
      signal: clock.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      ms: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      text: "",
      ms: performance.now() - startedAt,
      error:
        error?.name === "AbortError"
          ? "timeout"
          : error?.message || String(error),
    };
  } finally {
    clock.clear();
  }
}

async function requestBuffered(url, { timeoutMs, cookie }) {
  const clock = timeoutSignal(timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      headers: authHeaders(cookie),
      signal: clock.signal,
    });
    const buffer = await response.arrayBuffer();
    return {
      status: response.status,
      ok: response.ok,
      ms: performance.now() - startedAt,
      bytes: buffer.byteLength,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      ms: performance.now() - startedAt,
      bytes: 0,
      error:
        error?.name === "AbortError"
          ? "timeout"
          : error?.message || String(error),
    };
  } finally {
    clock.clear();
  }
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, rank))];
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatStatuses(statuses) {
  return [...statuses.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${status}:${count}`)
    .join(", ");
}

function buildTarget(url, name) {
  return { name, url };
}

function builtInTargets(baseUrl, quoteInput) {
  return {
    health: buildTarget(`${baseUrl}/api/health`, "health"),
    ping: buildTarget(trpcUrl(baseUrl, "ping"), "ping"),
    catalog: buildTarget(trpcUrl(baseUrl, "product.list"), "catalog"),
    commerce: buildTarget(trpcUrl(baseUrl, "commerce.list"), "commerce"),
    categories: buildTarget(trpcUrl(baseUrl, "category.list"), "categories"),
    featured: buildTarget(trpcUrl(baseUrl, "product.getFeatured"), "featured"),
    top: buildTarget(trpcUrl(baseUrl, "product.getTopOrdered"), "top"),
    settings: buildTarget(trpcUrl(baseUrl, "settings.getPublic"), "settings"),
    quote: quoteInput
      ? buildTarget(trpcUrl(baseUrl, "order.quote", quoteInput), "quote")
      : null,
  };
}

async function resolveQuoteInput(baseUrl, cookie, timeoutMs) {
  if (!cookie) return null;

  const catalog = await requestText(trpcUrl(baseUrl, "product.list"), {
    timeoutMs,
    cookie,
  });
  if (!catalog.ok) {
    console.error(
      `[bench] No se pudo preparar quote: product.list respondió ${catalog.status || catalog.error}.`
    );
    return null;
  }

  let products;
  try {
    products = JSON.parse(catalog.text)?.result?.data?.json;
  } catch {
    console.error(
      "[bench] No se pudo interpretar el catálogo para preparar quote."
    );
    return null;
  }

  if (!Array.isArray(products) || products.length === 0) {
    console.error("[bench] El catálogo está vacío; se omite quote.");
    return null;
  }

  const items = products
    .slice(0, 3)
    .filter(product => Number.isInteger(product?.id))
    .map(product => ({ productId: product.id, quantity: 1 }));
  if (items.length === 0) {
    console.error("[bench] No hay productos válidos para preparar quote.");
    return null;
  }

  const input = { items };
  const probe = await requestText(trpcUrl(baseUrl, "order.quote", input), {
    timeoutMs,
    cookie,
  });
  if (!probe.ok) {
    console.error(
      `[bench] quote respondió ${probe.status || probe.error}; revisa LOAD_TEST_COOKIE. Se omite quote.`
    );
    return null;
  }
  return input;
}

async function warmupTarget(target, config) {
  if (config.warmupSec <= 0) return;
  const workers = Math.min(2, config.concurrency);
  const stopAt = performance.now() + config.warmupSec * 1000;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (performance.now() < stopAt) {
        await requestBuffered(target.url, config);
      }
    })
  );
}

async function runTarget(target, config) {
  const samples = [];
  const statuses = new Map();
  const errorSamples = [];
  let issued = 0;
  let errors = 0;

  const stopAt = performance.now() + config.durationSec * 1000;

  async function worker() {
    while (performance.now() < stopAt && issued < config.maxRequests) {
      issued += 1;
      const sample = await requestBuffered(target.url, config);
      samples.push(sample);
      const statusKey = sample.status || "ERR";
      statuses.set(statusKey, (statuses.get(statusKey) ?? 0) + 1);
      if (!sample.ok) {
        errors += 1;
        if (errorSamples.length < 5) {
          errorSamples.push({
            status: sample.status,
            error: sample.error ?? null,
            ms: round(sample.ms),
          });
        }
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: config.concurrency }, worker));
  const elapsedMs = performance.now() - startedAt;

  const latencies = samples.map(sample => sample.ms).sort((a, b) => a - b);
  const totalBytes = samples.reduce((sum, sample) => sum + sample.bytes, 0);
  const requests = samples.length;
  const errorRate = requests > 0 ? errors / requests : 1;

  return {
    name: target.name,
    url: target.url,
    requests,
    errors,
    errorRate: round(errorRate * 100, 2),
    rps: round(requests / (elapsedMs / 1000), 2),
    minMs: round(percentile(latencies, 0)),
    p50Ms: round(percentile(latencies, 50)),
    p75Ms: round(percentile(latencies, 75)),
    p90Ms: round(percentile(latencies, 90)),
    p95Ms: round(percentile(latencies, 95)),
    p99Ms: round(percentile(latencies, 99)),
    maxMs: round(latencies.at(-1) ?? 0),
    bytesPerSecond: round(totalBytes / (elapsedMs / 1000), 0),
    statuses: Object.fromEntries(
      [...statuses.entries()].sort((a, b) => b[1] - a[1])
    ),
    statusSummary: formatStatuses(statuses),
    errorSamples,
  };
}

function printHelp() {
  console.log(`Rapidy load benchmark (solo loopback)

Uso:
  node scripts/load-test.mjs [opciones]

Opciones:
  --base-url=<url>        Default: http://localhost:3000 (solo localhost/127.0.0.1/::1)
  --targets=<lista>       Default: ${DEFAULT_TARGETS.join(",")}
                          Disponibles: ${ALL_TARGETS.join(", ")} o "all"
  --concurrency=<n>       1..${HARD_LIMITS.concurrency} (default 10)
  --duration=<seg>        1..${HARD_LIMITS.durationSec} por target (default 10)
  --warmup=<seg>          0..${HARD_LIMITS.warmupSec} por target (default 1)
  --timeout=<ms>          500..${HARD_LIMITS.timeoutMs} por request (default 5000)
  --max-requests=<n>      1..${HARD_LIMITS.maxRequests} por target (default 20000)
  --max-error-rate=<0..1> Fallo si se supera (default 0.01 = 1%)
  --max-p95-ms=<ms>       Fallo opcional por p95
  --cookie=<cookie>       Cookie para quote (o LOAD_TEST_COOKIE)
  --json                  Imprime solo el JSON de resultados
  --list                  Lista los targets disponibles
  --help                  Muestra esta ayuda

El script no ejecuta login, create, mutaciones ni SSE. Para el plan de carga de
esos flujos usa k6/artillery contra local con los topes de docs/production/PERFORMANCE.md.`);
}

function printResults(result) {
  console.log(
    `\nBase: ${result.baseUrl} | concurrencia=${result.config.concurrency} ` +
      `duración=${result.config.durationSec}s por target | timeout=${result.config.timeoutMs}ms`
  );
  console.log(
    ["target", "req", "rps", "p50", "p90", "p95", "p99", "max", "err%"]
      .map((label, index) => label.padStart(index === 0 ? 0 : 8))
      .join(" ")
  );
  for (const target of result.targets) {
    console.log(
      [
        target.name.padEnd(10),
        String(target.requests).padStart(8),
        String(target.rps).padStart(8),
        `${target.p50Ms}ms`.padStart(8),
        `${target.p90Ms}ms`.padStart(8),
        `${target.p95Ms}ms`.padStart(8),
        `${target.p99Ms}ms`.padStart(8),
        `${target.maxMs}ms`.padStart(8),
        String(target.errorRate).padStart(8),
      ].join(" ")
    );
    console.log(`  status: ${target.statusSummary}`);
    if (target.errorSamples.length > 0) {
      console.log(`  errores: ${JSON.stringify(target.errorSamples)}`);
    }
  }
  console.log(
    `\nRESULT ${result.passed ? "PASS" : "FAIL"} — ${result.failures.join(" | ") || "sin umbrales superados"}`
  );
}

async function main() {
  const options = parseCli(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }
  if (options.list) {
    console.log(ALL_TARGETS.join("\n"));
    return;
  }

  const baseUrl = normalizeBaseUrl(
    options["base-url"] ||
      process.env.LOAD_TEST_BASE_URL ||
      "http://localhost:3000"
  );
  const config = {
    concurrency: toInteger(
      options.concurrency,
      10,
      "--concurrency",
      1,
      HARD_LIMITS.concurrency
    ),
    durationSec: toInteger(
      options.duration,
      10,
      "--duration",
      1,
      HARD_LIMITS.durationSec
    ),
    warmupSec: toInteger(
      options.warmup,
      1,
      "--warmup",
      0,
      HARD_LIMITS.warmupSec
    ),
    timeoutMs: toInteger(
      options.timeout,
      5_000,
      "--timeout",
      500,
      HARD_LIMITS.timeoutMs
    ),
    maxRequests: toInteger(
      options["max-requests"],
      20_000,
      "--max-requests",
      1,
      HARD_LIMITS.maxRequests
    ),
    maxErrorRate: toNumber(
      options["max-error-rate"],
      0.01,
      "--max-error-rate",
      0,
      1
    ),
    maxP95Ms:
      options["max-p95-ms"] === undefined
        ? null
        : toNumber(options["max-p95-ms"], 0, "--max-p95-ms", 1, 600_000),
    cookie: options.cookie || process.env.LOAD_TEST_COOKIE || "",
  };

  const requested = (options.targets || DEFAULT_TARGETS.join(","))
    .split(",")
    .map(name => name.trim())
    .filter(Boolean);
  const names = requested.includes("all")
    ? [...ALL_TARGETS]
    : [...new Set(requested)];
  for (const name of names) {
    if (!ALL_TARGETS.includes(name)) {
      throw new Error(
        `Target desconocido: ${name}. Usa --list para ver los disponibles.`
      );
    }
  }

  const quoteInput = names.includes("quote")
    ? await resolveQuoteInput(baseUrl, config.cookie, config.timeoutMs)
    : null;
  const targets = builtInTargets(baseUrl, quoteInput);
  const selected = [];

  for (const name of names) {
    if (name === "health") {
      const probe = await requestText(`${baseUrl}/api/health`, {
        timeoutMs: config.timeoutMs,
        cookie: "",
      });
      if (!probe.ok) {
        console.error(
          "[bench] /api/health no existe o no responde 2xx en este entorno; se omite. " +
            "Usa ping (tRPC ping) como proxy de liveness."
        );
        continue;
      }
    }
    if (name === "quote" && !quoteInput) {
      console.error(
        "[bench] quote omitido: define LOAD_TEST_COOKIE/--cookie con una sesión de cliente válida."
      );
      continue;
    }
    const target = targets[name];
    if (!target) continue;
    selected.push(target);
  }

  if (selected.length === 0) {
    throw new Error(
      "No quedó ningún target ejecutable. Revisa --targets y la cookie de quote."
    );
  }

  const result = {
    tool: "scripts/load-test.mjs",
    generatedAt: new Date().toISOString(),
    baseUrl,
    config: {
      concurrency: config.concurrency,
      durationSec: config.durationSec,
      warmupSec: config.warmupSec,
      timeoutMs: config.timeoutMs,
      maxRequests: config.maxRequests,
      maxErrorRate: config.maxErrorRate,
      maxP95Ms: config.maxP95Ms,
      targets: selected.map(target => target.name),
      quote: Boolean(quoteInput),
    },
    targets: [],
    passed: true,
    failures: [],
  };

  if (!options.json) {
    console.log(
      `[bench] local-only | targets=${selected.map(target => target.name).join(",")} | ` +
        `concurrency=${config.concurrency} duration=${config.durationSec}s`
    );
  }

  for (const target of selected) {
    if (!options.json)
      console.error(`[bench] warmup ${target.name} (${config.warmupSec}s)`);
    await warmupTarget(target, config);
    if (!options.json)
      console.error(`[bench] midiendo ${target.name} (${config.durationSec}s)`);
    const metrics = await runTarget(target, config);
    result.targets.push(metrics);

    if (metrics.errorRate / 100 > config.maxErrorRate) {
      result.failures.push(
        `${target.name}: error rate ${metrics.errorRate}% > ${round(config.maxErrorRate * 100, 2)}%`
      );
    }
    if (config.maxP95Ms !== null && metrics.p95Ms > config.maxP95Ms) {
      result.failures.push(
        `${target.name}: p95 ${metrics.p95Ms}ms > ${config.maxP95Ms}ms`
      );
    }
  }

  result.passed = result.failures.length === 0;

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResults(result);
  }

  if (!result.passed) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[bench] ${error.message}`);
  process.exitCode = 1;
});
