#!/usr/bin/env node
/**
 * Verificación de backups de Rapidy.
 *
 * Dos niveles, ninguno escribe en la base de producción:
 *   1. Verificación estructural (default): checksum SHA-256 + lectura del
 *      archivo (pg_restore --list o escaneo del SQL comprimido) + tablas
 *      obligatorias. No abre conexión a ninguna base.
 *   2. Restore real a una base temporal (--restore): crea
 *      rapidy_restore_check_<timestamp>_<rand>, restaura allí, valida tablas y
 *      conteos, y elimina la base temporal al terminar (salvo --keep).
 *
 * Uso:
 *   node scripts/db-restore-check.mjs [--dump <archivo>] [--restore] [--keep]
 *                                     [--skip-checksum]
 *
 * Variables:
 *   DATABASE_URL              Obligatoria solo con --restore. Se usa para
 *                             derivar la conexión administrativa (base "postgres").
 *   RESTORE_CHECK_ADMIN_URL   Opcional. Conexión administrativa alternativa
 *                             (debe apuntar a la base "postgres" del servidor).
 *   PG_RESTORE_BIN, PSQL_BIN  Rutas explícitas si no están en PATH.
 *   BACKUP_DIR                Default: <repo>/backups
 *   RESTORE_CHECK_TIMEOUT_MS  Default: 3600000 (1 h). 0 desactiva.
 *
 * Códigos de salida: 0 = OK, 1 = fallo de verificación/restore.
 */

import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
} from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import pg from "pg";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const REQUIRED_TABLES = [
  "users",
  "customers",
  "drivers",
  "categories",
  "commerces",
  "products",
  "orders",
  "order_items",
  "order_status_history",
  "order_commerce_status",
  "chat_messages",
  "driver_earnings",
  "otp_verifications",
  "account_deletion_requests",
  "app_settings",
];

const COUNT_TABLES = [
  "users",
  "customers",
  "drivers",
  "commerces",
  "products",
  "orders",
  "order_items",
  "chat_messages",
  "driver_earnings",
  "app_settings",
];

const HELP = `Verificación de backups de PostgreSQL (Rapidy)

Uso:
  node scripts/db-restore-check.mjs [opciones]

Opciones:
  --dump <archivo>   Dump a verificar. Default: el más reciente de BACKUP_DIR.
  --restore          Restaura a una base temporal aislada y la valida.
  --keep             Con --restore, conserva la base temporal para inspección.
  --skip-checksum    No exige el sidecar .sha256 (usar solo si el origen es confiable).
  -h, --help         Muestra esta ayuda.

Sin --restore no se conecta a ninguna base de datos: solo valida el archivo.
Con --restore nunca usa la base de DATABASE_URL como destino; crea una base
rapidy_restore_check_* y la elimina al finalizar.
`;

function log(message) {
  console.log(`[restore-check] ${message}`);
}

function warn(message) {
  console.warn(`[restore-check] AVISO: ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function isCommandAvailable(command) {
  const probe = spawnSync(command, ["--version"], {
    stdio: "ignore",
    timeout: 5000,
    windowsHide: true,
  });
  return !probe.error && probe.status === 0;
}

function findBinary(envVar, name) {
  const override = process.env[envVar]?.trim();
  if (override) return override;
  if (isCommandAvailable(name)) return name;

  const candidates = [];
  if (process.platform === "win32") {
    for (const root of [
      process.env.ProgramFiles,
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ]) {
      if (!root) continue;
      const base = path.join(root, "PostgreSQL");
      if (!existsSync(base)) continue;
      for (const version of readdirSync(base).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true })
      )) {
        candidates.push(path.join(base, version, "bin", `${name}.exe`));
      }
    }
  } else {
    for (const base of [
      "/usr/lib/postgresql",
      "/usr/local/pgsql",
      "/opt/homebrew/opt",
      "/usr/local/opt",
    ]) {
      if (!existsSync(base)) continue;
      for (const version of readdirSync(base).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true })
      )) {
        candidates.push(path.join(base, version, "bin", name));
      }
    }
    const postgresApp = "/Applications/Postgres.app/Contents/Versions";
    if (existsSync(postgresApp)) {
      for (const version of readdirSync(postgresApp).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true })
      )) {
        candidates.push(path.join(postgresApp, version, "bin", name));
      }
    }
  }

  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

function requireBinary(envVar, name, hint) {
  const bin = findBinary(envVar, name);
  if (!bin) fail(`No se encontró ${name}. ${hint} o define ${envVar}.`);
  return bin;
}

function backupDir() {
  const configured = process.env.BACKUP_DIR?.trim();
  if (!configured) return path.join(REPO_ROOT, "backups");
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(REPO_ROOT, configured);
}

function parseArgs(argv) {
  const opts = {
    restore: false,
    keep: false,
    skipChecksum: false,
    dump: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--restore") opts.restore = true;
    else if (arg === "--keep") opts.keep = true;
    else if (arg === "--skip-checksum") opts.skipChecksum = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--dump") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--"))
        fail("--dump requiere la ruta de un archivo.");
      opts.dump = value;
      i += 1;
    } else if (arg !== "--") {
      fail(`Argumento no reconocido: ${arg}. Usa --help.`);
    }
  }
  if (opts.keep && !opts.restore)
    fail("--keep solo tiene sentido junto con --restore.");
  return opts;
}

function detectFormat(filePath) {
  if (filePath.endsWith(".dump")) return "custom";
  if (filePath.endsWith(".sql.gz") || filePath.endsWith(".sql")) return "plain";
  fail(
    `Formato no soportado: ${path.basename(filePath)} (se espera .dump, .sql.gz o .sql).`
  );
}

async function latestDump() {
  const dir = backupDir();
  if (!existsSync(dir)) fail(`No existe el directorio de backups: ${dir}.`);
  const entries = await readdir(dir, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^rapidy_.+\.(dump|sql\.gz|sql)$/.test(entry.name))
      continue;
    const fullPath = path.join(dir, entry.name);
    candidates.push({ fullPath, mtimeMs: (await stat(fullPath)).mtimeMs });
  }
  if (candidates.length === 0)
    fail(`No hay backups en ${dir}. Ejecuta scripts/db-backup.mjs.`);
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].fullPath;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function readMetadata(dumpPath) {
  const metadataPath = `${dumpPath}.json`;
  if (!existsSync(metadataPath)) return null;
  try {
    return JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    warn(`No se pudo leer ${path.basename(metadataPath)}; se ignora.`);
    return null;
  }
}

async function verifyChecksum(dumpPath, skip) {
  const sidecar = `${dumpPath}.sha256`;
  if (skip) {
    warn("Verificación de checksum omitida (--skip-checksum).");
    return null;
  }
  if (!existsSync(sidecar)) {
    fail(
      `Falta ${path.basename(sidecar)}. No se puede validar la integridad del dump.\n` +
        "  Copia el .sha256 junto al dump o usa --skip-checksum solo si confías en el origen."
    );
  }
  const expected = (await readFile(sidecar, "utf8"))
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected ?? "")) {
    fail(`${path.basename(sidecar)} no contiene un SHA-256 válido.`);
  }
  const actual = await sha256File(dumpPath);
  if (actual !== expected) {
    fail(
      `Checksum no coincide para ${path.basename(dumpPath)}\n  esperado: ${expected}\n  obtenido: ${actual}`
    );
  }
  return actual;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    let spawnError;
    child.once("error", error => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      if (spawnError) reject(spawnError);
      else resolve({ code, signal });
    });
  });
}

function armTimeout(child, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0)
    return { clear: () => {}, timedOut: () => false };
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 10_000).unref?.();
  }, timeoutMs);
  timer.unref?.();
  return { clear: () => clearTimeout(timer), timedOut: () => timedOut };
}

function appendTail(current, chunk, max = 16_000) {
  const next = current + chunk;
  return next.length > max ? next.slice(-max) : next;
}

async function runCommand(
  bin,
  args,
  { env, timeoutMs, label, captureStdout = false }
) {
  const child = spawn(bin, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timeout = armTimeout(child, timeoutMs);
  child.stderr.on("data", chunk => {
    stderr = appendTail(stderr, chunk.toString("utf8"));
  });
  if (captureStdout) {
    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");
    });
  }

  try {
    const { code, signal } = await waitForExit(child);
    if (timeout.timedOut())
      fail(`${label} excedió el timeout de ${timeoutMs} ms.`);
    if (code !== 0) {
      fail(
        `${label} falló (code=${code ?? "null"}, signal=${signal ?? "-"}):\n${stderr.trim() || "sin detalle"}`
      );
    }
    return { stdout, stderr };
  } finally {
    timeout.clear();
  }
}

function cleanTableToken(token) {
  return token.replace(/^"|"$/g, "");
}

function parseRestoreList(toc) {
  const found = new Set();
  for (const line of toc.split(/\r?\n/)) {
    const match = line.match(
      /^\d+;\s+\d+\s+\d+\s+(TABLE DATA|TABLE)\s+(\S+)\s+(\S+)/
    );
    if (!match || match[1] !== "TABLE") continue;
    const schema = cleanTableToken(match[2]);
    const table = cleanTableToken(match[3]);
    found.add(`${schema}.${table}`);
  }
  return found;
}

async function verifyCustomDump(dumpPath) {
  const pgRestore = requireBinary(
    "PG_RESTORE_BIN",
    "pg_restore",
    "Instala PostgreSQL client tools (>= 14) o define PG_RESTORE_BIN"
  );
  const { stdout } = await runCommand(pgRestore, ["--list", dumpPath], {
    env: process.env,
    timeoutMs: 120_000,
    label: "pg_restore --list",
    captureStdout: true,
  });
  const found = parseRestoreList(stdout);
  if (found.size === 0)
    fail(
      "pg_restore no reportó tablas en el archivo (¿dump vacío o corrupto?)."
    );
  return found;
}

function plainStream(dumpPath) {
  const input = createReadStream(dumpPath);
  return dumpPath.endsWith(".gz") ? input.pipe(createGunzip()) : input;
}

async function verifyPlainDump(dumpPath) {
  const found = new Set();
  let sawHeader = false;
  let sawFooter = false;
  let tail = "";

  try {
    for await (const chunk of plainStream(dumpPath)) {
      const text = tail + chunk.toString("utf8");
      if (!sawHeader && /PostgreSQL database dump/.test(text)) sawHeader = true;
      if (!sawFooter && text.includes("PostgreSQL database dump complete"))
        sawFooter = true;
      for (const table of REQUIRED_TABLES) {
        const qualified = `public.${table}`;
        if (found.has(qualified)) continue;
        const pattern = new RegExp(
          `CREATE TABLE (?:public\\.)?${table}\\s*\\(`
        );
        if (pattern.test(text)) found.add(qualified);
      }
      tail = text.slice(-16_384);
    }
  } catch (error) {
    fail(
      `No se pudo descomprimir/leer ${path.basename(dumpPath)}: ${error?.message || error}`
    );
  }

  if (!sawHeader)
    fail(
      "El SQL no parece un dump de PostgreSQL (falta la cabecera estándar)."
    );
  if (!sawFooter)
    fail(
      "El SQL está incompleto (falta el marcador 'PostgreSQL database dump complete')."
    );
  return found;
}

function assertRequiredTables(found, label) {
  const missing = REQUIRED_TABLES.filter(
    table => !found.has(`public.${table}`)
  );
  if (missing.length > 0) {
    fail(`${label}: faltan tablas obligatorias: ${missing.join(", ")}`);
  }
}

function splitDatabaseUrl(raw, label) {
  if (!raw?.trim()) fail(`${label} no está definida.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} no es una URL válida.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    fail(
      `${label} debe ser postgresql:// (protocolo recibido: ${url.protocol}).`
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) fail(`${label} no incluye el nombre de la base de datos.`);
  const password = url.password
    ? decodeURIComponent(url.password)
    : process.env.PGPASSWORD || "";
  const cleanUrl = new URL(url.toString());
  cleanUrl.password = "";
  return {
    rawUrl: url.toString(),
    cleanUrl: cleanUrl.toString(),
    password,
    database,
    host: url.hostname,
    port: url.port || "5432",
  };
}

function withDatabase(rawUrl, database) {
  const url = new URL(rawUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function clientConfig(connection) {
  return {
    connectionString: connection.cleanUrl,
    password: connection.password || undefined,
    application_name: "rapidy-restore-check",
    connectionTimeoutMillis: 15_000,
  };
}

async function createTempDatabase(adminConfig, name) {
  const client = new pg.Client(adminConfig);
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function dropTempDatabase(adminConfig, name) {
  const client = new pg.Client(adminConfig);
  try {
    await client.connect();
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [name]
    );
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function validateRestoredDatabase(tempConfig) {
  const client = new pg.Client(tempConfig);
  try {
    await client.connect();
    const tablesResult = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const found = new Set(
      tablesResult.rows.map(row => `public.${row.table_name}`)
    );
    const missing = REQUIRED_TABLES.filter(
      table => !found.has(`public.${table}`)
    );
    if (missing.length > 0)
      fail(`Restore incompleto: faltan tablas ${missing.join(", ")}`);

    const countSql = `SELECT ${COUNT_TABLES.map(
      table => `(SELECT count(*)::bigint FROM "${table}") AS "${table}"`
    ).join(", ")}`;
    const counts = (await client.query(countSql)).rows[0];
    const migrations = await client.query(
      `SELECT to_regclass('drizzle.__drizzle_migrations') AS oid`
    );
    return { counts, hasMigrationsTable: Boolean(migrations.rows[0]?.oid) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function restoreCustom(
  pgRestore,
  dumpPath,
  tempUrl,
  password,
  timeoutMs
) {
  const env = {
    ...process.env,
    PGPASSWORD: password,
    PGAPPNAME: "rapidy-restore-check",
  };
  await runCommand(
    pgRestore,
    [
      "--dbname",
      tempUrl,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--single-transaction",
      "--no-password",
      dumpPath,
    ],
    { env, timeoutMs, label: "pg_restore" }
  );
}

async function restorePlain(psql, dumpPath, tempUrl, password, timeoutMs) {
  const env = {
    ...process.env,
    PGPASSWORD: password,
    PGAPPNAME: "rapidy-restore-check",
  };
  const workDir = await mkdtemp(
    path.join(os.tmpdir(), "rapidy-restore-check-")
  );
  const sqlPath = path.join(workDir, "dump.sql");
  try {
    if (dumpPath.endsWith(".gz")) {
      await pipeline(plainStream(dumpPath), createWriteStreamSafe(sqlPath));
    } else {
      await pipeline(
        createReadStream(dumpPath),
        createWriteStreamSafe(sqlPath)
      );
    }
    await runCommand(
      psql,
      [
        "--no-psqlrc",
        "--quiet",
        "--no-password",
        "--set",
        "ON_ERROR_STOP=1",
        "--dbname",
        tempUrl,
        "--file",
        sqlPath,
      ],
      { env, timeoutMs, label: "psql" }
    );
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function createWriteStreamSafe(filePath) {
  return createWriteStream(filePath, { flags: "wx", mode: 0o600 });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const dumpPath = opts.dump ? path.resolve(opts.dump) : await latestDump();
  if (!existsSync(dumpPath)) fail(`No existe el dump: ${dumpPath}`);
  const dumpStat = await stat(dumpPath);
  if (!dumpStat.isFile() || dumpStat.size === 0)
    fail(`El dump está vacío o no es un archivo: ${dumpPath}`);

  const format = detectFormat(dumpPath);
  const metadata = await readMetadata(dumpPath);

  log(`Dump: ${dumpPath}`);
  log(
    `Formato: ${format}; tamaño: ${(dumpStat.size / 1024 / 1024).toFixed(2)} MiB`
  );
  if (metadata) {
    log(
      `Metadatos: creado=${metadata.createdAt ?? "?"}; base=${metadata.database ?? "?"}; ` +
        `compresión=${metadata.compression ?? "?"}; duración=${metadata.durationMs ?? "?"} ms`
    );
    if (
      Number.isFinite(metadata.sizeBytes) &&
      metadata.sizeBytes !== dumpStat.size
    ) {
      warn(
        "El tamaño actual no coincide con el .json; el archivo pudo modificarse."
      );
    }
  } else {
    warn(
      "No hay .json de metadatos; se validará solo el contenido y el checksum."
    );
  }

  const sha256 = await verifyChecksum(dumpPath, opts.skipChecksum);
  if (
    sha256 &&
    metadata?.sha256 &&
    String(metadata.sha256).toLowerCase() !== sha256
  ) {
    warn(
      "El SHA-256 del .json no coincide con el archivo (el sidecar .sha256 sí coincide)."
    );
  }
  if (sha256) log(`Checksum OK: ${sha256}`);

  let found;
  if (format === "custom") {
    found = await verifyCustomDump(dumpPath);
  } else {
    found = await verifyPlainDump(dumpPath);
  }
  assertRequiredTables(found, "Verificación del dump");
  log(
    `Estructura OK: ${REQUIRED_TABLES.length} tablas obligatorias presentes.`
  );

  if (!opts.restore) {
    log(
      "Modo verificación: no se abrió ninguna base de datos. Nada que limpiar."
    );
    return;
  }

  const db = splitDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
  const admin = splitDatabaseUrl(
    process.env.RESTORE_CHECK_ADMIN_URL || withDatabase(db.rawUrl, "postgres"),
    "RESTORE_CHECK_ADMIN_URL"
  );
  const adminConfig = clientConfig(admin);
  const sourceName = db.database;
  const tempName = `rapidy_restore_check_${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}_${randomBytes(2).toString("hex")}`;

  if (!/^rapidy_restore_check_[a-z0-9_]+$/.test(tempName))
    fail("Nombre de base temporal inválido (abortado).");
  if (tempName === sourceName)
    fail("La base temporal coincide con la base de producción (abortado).");

  const tempUrl = withDatabase(admin.cleanUrl, tempName);
  const tempConfig = clientConfig({ ...admin, cleanUrl: tempUrl });

  const timeoutMs = Number(process.env.RESTORE_CHECK_TIMEOUT_MS || 3_600_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
    fail("RESTORE_CHECK_TIMEOUT_MS inválido.");

  const pgRestore =
    format === "custom"
      ? requireBinary(
          "PG_RESTORE_BIN",
          "pg_restore",
          "Instala PostgreSQL client tools"
        )
      : null;
  const psql =
    format === "plain"
      ? requireBinary("PSQL_BIN", "psql", "Instala PostgreSQL client tools")
      : null;

  let tempCreated = false;
  try {
    log(
      `Creando base temporal ${tempName} en ${admin.host}:${admin.port} (base administrativa "${admin.database}") ...`
    );
    await createTempDatabase(adminConfig, tempName);
    tempCreated = true;
    log(`Base temporal creada. Restaurando ${path.basename(dumpPath)} ...`);
    const startedAt = Date.now();

    if (format === "custom") {
      await restoreCustom(
        pgRestore,
        dumpPath,
        tempUrl,
        admin.password,
        timeoutMs
      );
    } else {
      await restorePlain(psql, dumpPath, tempUrl, admin.password, timeoutMs);
    }

    log(
      `Restore completado en ${((Date.now() - startedAt) / 1000).toFixed(1)} s. Validando ...`
    );
    const { counts, hasMigrationsTable } =
      await validateRestoredDatabase(tempConfig);
    log("Tablas obligatorias: OK");
    log(
      `Conteos: ${COUNT_TABLES.map(table => `${table}=${counts[table]}`).join(", ")}`
    );
    if (hasMigrationsTable) log("Tabla drizzle.__drizzle_migrations presente.");
    else
      warn(
        "No se encontró drizzle.__drizzle_migrations; revisa migraciones antes del cutover."
      );
    log(
      "Restore de prueba OK: el dump es restaurable y consistente a nivel de tablas."
    );
  } finally {
    if (tempCreated && opts.keep) {
      log(`Base temporal conservada: ${tempName}`);
      log(
        `Para eliminarla luego: DROP DATABASE IF EXISTS "${tempName}"; (con pg_terminate_backend previo)`
      );
    } else if (tempCreated) {
      try {
        await dropTempDatabase(adminConfig, tempName);
        log(`Base temporal ${tempName} eliminada.`);
      } catch (error) {
        console.error(
          `[restore-check] ERROR al eliminar ${tempName}: ${error?.message || error}. ` +
            `Elimínala manualmente con DROP DATABASE "${tempName}";`
        );
      }
    }
  }
}

main().catch(error => {
  console.error(`[restore-check] ERROR: ${error?.message || error}`);
  process.exitCode = 1;
});
