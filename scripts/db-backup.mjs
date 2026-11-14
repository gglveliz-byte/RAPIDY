#!/usr/bin/env node
/**
 * Backup lógico de PostgreSQL para Rapidy.
 *
 * Uso:
 *   node scripts/db-backup.mjs
 *
 * Variables de entorno:
 *   DATABASE_URL              Conexión a la base a respaldar (obligatoria).
 *   BACKUP_DATABASE_URL       Opcional. Conexión directa (sin pooler) solo para
 *                             el backup; si no se define usa DATABASE_URL.
 *   BACKUP_DIR                Directorio destino. Default: <repo>/backups
 *   BACKUP_FORMAT             "custom" (default) o "plain".
 *                             custom = pg_dump -Fc (comprimido, permite pg_restore selectivo).
 *                             plain  = SQL + gzip de Node (portable, sin pg_restore).
 *   BACKUP_COMPRESS_LEVEL     Nivel 0-9. Default: 6.
 *   BACKUP_RETENTION_DAYS     Días de retención local. Default: 30. 0 desactiva.
 *   BACKUP_TIMEOUT_MS         Timeout de pg_dump. Default: 1800000 (30 min). 0 desactiva.
 *   PG_DUMP_BIN               Ruta explícita a pg_dump si no está en PATH.
 *
 * Salidas:
 *   <BACKUP_DIR>/rapidy_<db>_<YYYYMMDDTHHMMSSZ>.dump|.sql.gz
 *   <archivo>.sha256          Hash SHA-256 (formato sha256sum).
 *   <archivo>.json            Metadatos (sin credenciales).
 *
 * El directorio backups/ se auto-ignora con un .gitignore propio. Aun así se
 * recomienda agregar "backups/" al .gitignore raíz (archivo de otro frente).
 *
 * Este script NO toca la base: solo ejecuta pg_dump (lectura).
 */

import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
} from "node:fs";
import {
  chmod,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const HELP = `Backup lógico de PostgreSQL (Rapidy)

Uso:
  node scripts/db-backup.mjs

Variables:
  DATABASE_URL             Obligatoria.
  BACKUP_DATABASE_URL      Opcional: conexión directa sin pooler para el backup.
  BACKUP_DIR               Default: ${path.join(REPO_ROOT, "backups")}
  BACKUP_FORMAT            custom | plain (default: custom)
  BACKUP_COMPRESS_LEVEL    0-9 (default: 6)
  BACKUP_RETENTION_DAYS    Default: 30 (0 = sin borrado automático)
  BACKUP_TIMEOUT_MS        Default: 1800000 (0 = sin timeout)
  PG_DUMP_BIN              Ruta a pg_dump si no está en PATH

Ejemplos:
  node scripts/db-backup.mjs
  BACKUP_DIR=D:/backups/rapidy BACKUP_RETENTION_DAYS=14 node scripts/db-backup.mjs
`;

function log(message) {
  console.log(`[backup] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function printHelpAndExit() {
  console.log(HELP);
  process.exit(0);
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

function binaryVersion(bin) {
  const probe = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (probe.error || probe.status !== 0) return "desconocida";
  return (probe.stdout || probe.stderr || "").trim() || "desconocida";
}

function parseDatabaseUrl(raw) {
  if (!raw?.trim())
    fail("DATABASE_URL no está definida. Configúrala en .env o en el entorno.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL no es una URL válida.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    fail(
      `DATABASE_URL debe ser postgresql:// (protocolo recibido: ${url.protocol}).`
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) fail("DATABASE_URL no incluye el nombre de la base de datos.");
  const password = url.password ? decodeURIComponent(url.password) : "";
  const cleanUrl = new URL(url.toString());
  cleanUrl.password = "";
  return {
    cleanUrl: cleanUrl.toString(),
    password,
    database,
    host: url.hostname,
    port: url.port || "5432",
  };
}

function resolveBackupDir() {
  const configured = process.env.BACKUP_DIR?.trim();
  if (!configured) return path.join(REPO_ROOT, "backups");
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(REPO_ROOT, configured);
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
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

async function runCustomDump(bin, args, partialPath, env, timeoutMs) {
  const child = spawn(bin, [...args, `--file=${partialPath}`], {
    env,
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  let timedOut = false;
  const timeout = armTimeout(child, timeoutMs);
  child.stderr.on("data", chunk => {
    stderr = appendTail(stderr, chunk.toString("utf8"));
  });

  try {
    const { code, signal } = await waitForExit(child);
    timedOut = timeout.timedOut();
    if (timedOut) fail(`pg_dump excedió el timeout de ${timeoutMs} ms.`);
    if (code !== 0) {
      fail(
        `pg_dump falló (code=${code ?? "null"}, signal=${signal ?? "-"}): ${stderr.trim() || "sin detalle"}`
      );
    }
    if (stderr.trim()) log(`pg_dump: ${stderr.trim()}`);
  } finally {
    timeout.clear();
  }
}

async function runPlainDump(bin, args, partialPath, env, timeoutMs, level) {
  const child = spawn(bin, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exitPromise = waitForExit(child);
  // Evita unhandledRejection si el proceso falla antes de que pipeline termine.
  exitPromise.catch(() => {});
  let stderr = "";
  let timedOut = false;
  const timeout = armTimeout(child, timeoutMs);
  child.stderr.on("data", chunk => {
    stderr = appendTail(stderr, chunk.toString("utf8"));
  });

  try {
    await pipeline(
      child.stdout,
      createGzip({ level }),
      createWriteStream(partialPath, { flags: "wx", mode: 0o600 })
    );
    const { code, signal } = await exitPromise;
    timedOut = timeout.timedOut();
    if (timedOut) fail(`pg_dump excedió el timeout de ${timeoutMs} ms.`);
    if (code !== 0) {
      fail(
        `pg_dump falló (code=${code ?? "null"}, signal=${signal ?? "-"}): ${stderr.trim() || "sin detalle"}`
      );
    }
    if (stderr.trim()) log(`pg_dump: ${stderr.trim()}`);
  } catch (error) {
    if (!child.killed) child.kill();
    await exitPromise.catch(() => {});
    if (timeout.timedOut())
      fail(`pg_dump excedió el timeout de ${timeoutMs} ms.`);
    throw error;
  } finally {
    timeout.clear();
  }
}

/** Calcula el SHA-256 de un archivo en streaming (no lo carga en memoria). */
async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function writePrivateFile(filePath, contents) {
  const tmpPath = `${filePath}.tmp`;
  try {
    await writeFile(tmpPath, contents, { mode: 0o600 });
    await rename(tmpPath, filePath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function ensureBackupDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(dir, 0o700).catch(() => {});

  // El directorio se auto-ignora aunque el .gitignore raíz aún no lo incluya.
  const gitignorePath = path.join(dir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    await writeFile(
      gitignorePath,
      "# Backups locales de Rapidy: no versionar.\n*\n!.gitignore\n",
      { mode: 0o600 }
    );
  }
}

async function applyRetention(dir, currentFiles, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return [];
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const removed = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/^rapidy_.+\.(dump|sql\.gz)$/.test(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (currentFiles.has(path.resolve(fullPath))) continue;
    const info = await stat(fullPath);
    if (info.mtimeMs >= cutoff) continue;
    await rm(fullPath, { force: true });
    await rm(`${fullPath}.sha256`, { force: true });
    await rm(`${fullPath}.json`, { force: true });
    removed.push(entry.name);
  }
  return removed;
}

async function cleanStalePartials(dir) {
  const cutoff = Date.now() - 86_400_000;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".partial")) continue;
    const fullPath = path.join(dir, entry.name);
    const info = await stat(fullPath);
    if (info.mtimeMs < cutoff) await rm(fullPath, { force: true });
  }
}

function readNumberEnv(
  name,
  fallback,
  { min = -Infinity, max = Infinity } = {}
) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(`${name} debe ser un número entre ${min} y ${max}. Recibido: ${raw}`);
  }
  return value;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h"))
    printHelpAndExit();
  const unknown = process.argv.slice(2).filter(arg => arg !== "--");
  if (unknown.length > 0)
    fail(`Argumentos no reconocidos: ${unknown.join(" ")}. Usa --help.`);

  const db = parseDatabaseUrl(
    process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL
  );
  const format = (process.env.BACKUP_FORMAT || "custom").trim().toLowerCase();
  if (!["custom", "plain"].includes(format))
    fail('BACKUP_FORMAT debe ser "custom" o "plain".');

  const level = readNumberEnv("BACKUP_COMPRESS_LEVEL", 6, { min: 0, max: 9 });
  const retentionDays = readNumberEnv("BACKUP_RETENTION_DAYS", 30, {
    min: 0,
    max: 3650,
  });
  const timeoutMs = readNumberEnv("BACKUP_TIMEOUT_MS", 1_800_000, {
    min: 0,
    max: 86_400_000,
  });

  const pgDump = findBinary("PG_DUMP_BIN", "pg_dump");
  if (!pgDump) {
    fail(
      "No se encontró pg_dump. Instala PostgreSQL client tools (>= 14) o define PG_DUMP_BIN.\n" +
        "  Windows: winget install PostgreSQL.PostgreSQL.16\n" +
        "  Debian/Ubuntu: sudo apt install postgresql-client\n" +
        "  Docker: docker run --rm postgres:16 pg_dump --version"
    );
  }

  const version = binaryVersion(pgDump);
  const backupDir = resolveBackupDir();
  await ensureBackupDir(backupDir);
  await cleanStalePartials(backupDir);

  const safeDatabase =
    db.database
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "db";
  const stamp = timestamp();
  const extension = format === "custom" ? "dump" : "sql.gz";
  let baseName = `rapidy_${safeDatabase}_${stamp}`;
  if (existsSync(path.join(backupDir, `${baseName}.${extension}`))) {
    baseName = `${baseName}_${Date.now().toString(36)}`;
  }
  const finalPath = path.join(backupDir, `${baseName}.${extension}`);
  const partialPath = `${finalPath}.partial`;

  const args =
    format === "custom"
      ? [
          "--format=custom",
          `--compress=${level}`,
          "--no-owner",
          "--no-privileges",
          "--no-password",
          "--lock-wait-timeout=30s",
          db.cleanUrl,
        ]
      : [
          "--format=plain",
          "--no-owner",
          "--no-privileges",
          "--no-password",
          "--lock-wait-timeout=30s",
          db.cleanUrl,
        ];

  const childEnv = { ...process.env, PGAPPNAME: "rapidy-db-backup" };
  if (db.password) childEnv.PGPASSWORD = db.password;

  log(
    `Iniciando backup de "${db.database}" en ${db.host}:${db.port} (${format}, ${version})`
  );
  log(`Destino: ${finalPath}`);

  const startedAt = Date.now();
  try {
    if (format === "custom") {
      await runCustomDump(pgDump, args, partialPath, childEnv, timeoutMs);
    } else {
      await runPlainDump(pgDump, args, partialPath, childEnv, timeoutMs, level);
    }
    await rename(partialPath, finalPath);
    if (process.platform !== "win32")
      await chmod(finalPath, 0o600).catch(() => {});
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => {});
    throw error;
  }

  const [sha256, info] = await Promise.all([
    sha256File(finalPath),
    stat(finalPath),
  ]);
  const durationMs = Date.now() - startedAt;

  await writePrivateFile(
    `${finalPath}.sha256`,
    `${sha256}  ${path.basename(finalPath)}\n`
  );
  const metadata = {
    file: path.basename(finalPath),
    createdAt: new Date().toISOString(),
    database: db.database,
    host: db.host,
    port: db.port,
    format,
    compression:
      format === "custom"
        ? `pg_dump custom -Z ${level}`
        : `gzip nivel ${level}`,
    sizeBytes: info.size,
    sha256,
    durationMs,
    pgDumpVersion: version,
    nodeVersion: process.version,
    platform: process.platform,
  };
  await writePrivateFile(
    `${finalPath}.json`,
    `${JSON.stringify(metadata, null, 2)}\n`
  );

  const removed = await applyRetention(
    backupDir,
    new Set([path.resolve(finalPath)]),
    retentionDays
  );

  const sizeMiB = (info.size / 1024 / 1024).toFixed(2);
  log(
    `Backup OK: ${path.basename(finalPath)} (${sizeMiB} MiB, ${(durationMs / 1000).toFixed(1)} s)`
  );
  log(`SHA-256: ${sha256}`);
  if (removed.length > 0)
    log(
      `Retención: eliminados ${removed.length} backup(s) con más de ${retentionDays} días.`
    );
  log(
    "Recuerda copiar el archivo, su .sha256 y su .json al almacenamiento externo."
  );
}

main().catch(error => {
  console.error(`[backup] ERROR: ${error?.message || error}`);
  process.exitCode = 1;
});
