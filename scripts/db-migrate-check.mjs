#!/usr/bin/env node
/**
 * @archivo scripts/db-migrate-check.mjs
 * @modulo 03-produccion / base de datos
 * @proposito Preflight de SOLO LECTURA para las migraciones Drizzle de Rapidy.
 *
 * Valida, sin aplicar migraciones y sin tocar `db/migrations`:
 *   1. `meta/_journal.json`: estructura, idx, tags, timestamps estrictamente crecientes.
 *   2. Archivos SQL: faltantes, huérfanos, vacíos, duplicados y objetos DDL repetidos.
 *   3. Snapshots de `meta/`: faltantes (warning), huérfanos y cadena prevId.
 *   4. `drizzle.config.ts`: schema/out/dialect esperados.
 *   5. `db:generate`: corre `drizzle-kit generate` en una copia temporal y falla si
 *      aparecería una migración nueva (drift entre schema.ts y los snapshots).
 *   6. Pool de `server/queries/connection.ts`: avisos de timeouts/límites.
 *   7. Opcional con `--db`: abre una transacción READ ONLY y compara la tabla
 *      `drizzle.__drizzle_migrations` contra el journal. Nunca escribe.
 *
 * Uso:
 *   node scripts/db-migrate-check.mjs                 # estático + dry-run generate
 *   node scripts/db-migrate-check.mjs --skip-generate # solo estático
 *   node scripts/db-migrate-check.mjs --db            # + verificación read-only de la DB
 *   node scripts/db-migrate-check.mjs --db --expect-current
 *   node scripts/db-migrate-check.mjs --json
 *
 * Salida: 0 = OK (puede haber warnings), 1 = errores, 2 = uso inválido.
 * No usa DATABASE_URL salvo con `--db`. No ejecuta migrate/push/seed.
 */

import { existsSync } from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "db", "migrations");
const META_DIR = path.join(MIGRATIONS_DIR, "meta");
const JOURNAL_PATH = path.join(META_DIR, "_journal.json");
const SCHEMA_PATH = path.join(REPO_ROOT, "db", "schema.ts");
const DRIZZLE_CONFIG_PATH = path.join(REPO_ROOT, "drizzle.config.ts");
const CONNECTION_PATH = path.join(REPO_ROOT, "server", "queries", "connection.ts");
const DRIZZLE_BIN = path.join(REPO_ROOT, "node_modules", "drizzle-kit", "bin.cjs");
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const IS_WINDOWS = process.platform === "win32";

const KNOWN_FLAGS = new Set([
  "--json",
  "--db",
  "--skip-generate",
  "--expect-current",
  "--verbose",
  "--help",
  "-h",
]);

const rawArgs = process.argv.slice(2);
const unknownFlags = rawArgs.filter((arg) => !KNOWN_FLAGS.has(arg));
if (unknownFlags.length > 0) {
  console.error(`Flags desconocidos: ${unknownFlags.join(", ")}`);
  console.error("Usa --help para ver las opciones.");
  process.exit(2);
}

const flags = new Set(rawArgs);
if (flags.has("--help") || flags.has("-h")) {
  console.log(`Rapidy DB migration preflight (solo lectura)

  node scripts/db-migrate-check.mjs [opciones]

Opciones:
  --skip-generate   Omite el dry-run de drizzle-kit generate.
  --db              Verifica la DB en una transacción READ ONLY (requiere DATABASE_URL).
  --expect-current  Con --db, trata migraciones pendientes como error.
  --json            Salida JSON para CI.
  --verbose         Muestra el detalle de cada chequeo.
  -h, --help        Esta ayuda.

Nunca aplica migraciones ni modifica db/migrations.`);
  process.exit(0);
}

const report = {
  passes: [],
  errors: [],
  warnings: [],
  notes: [],
};

function pass(message) {
  report.passes.push(message);
}
function error(section, message) {
  report.errors.push({ section, message });
}
function warn(section, message) {
  report.warnings.push({ section, message });
}
function note(message) {
  report.notes.push(message);
}
function stripAnsi(value) {
  return String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}
function tail(value, max = 1800) {
  const clean = stripAnsi(value).trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return IS_WINDOWS ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readText(file) {
  return fsp.readFile(file, "utf8");
}

async function walkFiles(root, dir = root) {
  const found = [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkFiles(root, full)));
    } else if (entry.isFile()) {
      found.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return found;
}

async function hashTree(root) {
  const hashes = new Map();
  for (const relative of await walkFiles(root)) {
    hashes.set(relative, sha256(await fsp.readFile(path.join(root, relative))));
  }
  return hashes;
}

function splitStatements(sql) {
  return String(sql)
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function sqlWithoutLineComments(statement) {
  return statement
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

function normalizeStatement(statement) {
  return sqlWithoutLineComments(statement)
    .replace(/\s+/g, " ")
    .replace(/;+\s*$/, "")
    .trim();
}

function unquoteSqlString(value) {
  return value.replace(/''/g, "'");
}

/**
 * @returns {Promise<{version: unknown, dialect: unknown, entries: Array<object>} | null>}
 */
async function loadJournal() {
  if (!existsSync(JOURNAL_PATH)) {
    error("journal", `No existe ${path.relative(REPO_ROOT, JOURNAL_PATH)}`);
    return null;
  }
  try {
    const parsed = JSON.parse(await readText(JOURNAL_PATH));
    if (!isRecord(parsed)) {
      error("journal", "_journal.json no contiene un objeto JSON válido");
      return null;
    }
    return parsed;
  } catch (cause) {
    error("journal", `No se pudo parsear _journal.json: ${cause.message}`);
    return null;
  }
}

function validateJournal(journal) {
  if (journal.version !== "7") {
    warn("journal", `Versión de journal inesperada: ${String(journal.version)} (se esperaba "7")`);
  }
  if (journal.dialect !== "postgresql") {
    error("journal", `Dialecto inesperado: ${String(journal.dialect)} (se esperaba "postgresql")`);
  }
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    error("journal", "_journal.json no tiene entradas de migración");
    return [];
  }

  const entries = journal.entries;
  const seenTags = new Map();
  let previousWhen = null;

  entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      error("journal", `entries[${index}] no es un objeto`);
      return;
    }
    const where = `entries[${index}]`;
    if (entry.idx !== index) {
      error("journal", `${where}.idx=${String(entry.idx)} pero está en la posición ${index}; el orden del journal es inválido`);
    }
    if (typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_]+$/.test(entry.tag)) {
      error("journal", `${where}.tag inválido: ${JSON.stringify(entry.tag)}`);
    } else {
      if (seenTags.has(entry.tag)) {
        error("journal", `Tag duplicado "${entry.tag}" (posiciones ${seenTags.get(entry.tag)} y ${index})`);
      } else {
        seenTags.set(entry.tag, index);
      }
      const prefix = Number(entry.tag.slice(0, 4));
      if (prefix !== index) {
        error("journal", `Tag "${entry.tag}" no coincide con idx=${index}`);
      }
    }
    if (!Number.isInteger(entry.when) || entry.when <= 0) {
      error("journal", `${where}.when inválido: ${JSON.stringify(entry.when)}`);
    } else {
      // drizzle-kit usa `when` como folderMillis y solo aplica migraciones con
      // timestamp mayor al último aplicado; un orden roto puede saltarse SQL.
      if (previousWhen !== null && entry.when <= previousWhen) {
        error(
          "journal",
          `${where}.when (${entry.when}) no es estrictamente mayor que el anterior (${previousWhen}); drizzle podría omitir migraciones`,
        );
      }
      previousWhen = entry.when;
    }
    if (entry.breakpoints !== true) {
      warn("journal", `${where}.breakpoints no es true; revisa la configuración de drizzle-kit`);
    }
  });

  if (report.errors.every((item) => item.section !== "journal")) {
    pass(`Journal: ${entries.length} entradas ordenadas (${entries[0]?.tag} → ${entries[entries.length - 1]?.tag})`);
  }
  return entries.filter(isRecord);
}

async function validateSqlFiles(entries, state) {
  let sqlFiles = [];
  try {
    sqlFiles = (await fsp.readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    error("sql", `No se pudo leer db/migrations: ${cause.message}`);
    return;
  }

  const expected = new Set(entries.filter((entry) => typeof entry.tag === "string").map((entry) => `${entry.tag}.sql`));
  for (const file of sqlFiles) {
    if (!expected.has(file)) {
      error("sql", `SQL huérfano: ${file} existe pero no está registrado en _journal.json`);
    }
  }

  let present = 0;
  const contentHashes = new Map();
  const statementOwners = new Map();
  const createdObjects = new Map();
  const droppedObjects = new Set();
  const enumValues = new Map();
  const destructiveHints = new Set();
  const processedTags = new Set();

  for (const entry of entries) {
    if (typeof entry.tag !== "string") continue;
    // Un tag duplicado ya se reporta en validateJournal; no procesar el archivo dos veces.
    if (processedTags.has(entry.tag)) continue;
    processedTags.add(entry.tag);
    const filename = `${entry.tag}.sql`;
    const fullPath = path.join(MIGRATIONS_DIR, filename);
    if (!sqlFiles.includes(filename)) {
      error("sql", `Falta ${filename}: el journal lo referencia pero el archivo no existe`);
      continue;
    }

    let buffer;
    try {
      buffer = await fsp.readFile(fullPath);
    } catch (cause) {
      error("sql", `No se pudo leer ${filename}: ${cause.message}`);
      continue;
    }
    if (buffer.length === 0) {
      error("sql", `${filename} está vacío`);
      continue;
    }
    if (buffer.includes(0)) {
      error("sql", `${filename} contiene bytes NUL; no es SQL de texto válido`);
      continue;
    }

    const text = buffer.toString("utf8");
    if (text.includes("\uFFFD")) {
      warn("sql", `${filename} contiene caracteres UTF-8 inválidos (reemplazados por U+FFFD)`);
    }
    present += 1;
    const contentHash = sha256(buffer);
    state.sqlByTag.set(entry.tag, { text, buffer, contentHash });
    state.sqlHashByTag.set(entry.tag, contentHash);

    if (contentHashes.has(contentHash)) {
      warn("sql", `${filename} tiene contenido idéntico a ${contentHashes.get(contentHash)}`);
    } else {
      contentHashes.set(contentHash, filename);
    }

    const statements = splitStatements(text);
    const meaningful = statements.map(normalizeStatement).filter(Boolean);
    if (meaningful.length === 0) {
      error("sql", `${filename} no contiene sentencias ejecutables`);
      continue;
    }

    const seenInFile = new Map();
    for (const statement of meaningful) {
      if (seenInFile.has(statement)) {
        error("sql", `${filename} repite la misma sentencia (posiciones ${seenInFile.get(statement) + 1} y ${seenInFile.size + 1})`);
      } else {
        seenInFile.set(statement, seenInFile.size);
      }
      const owner = statementOwners.get(statement);
      if (owner && owner !== entry.tag) {
        warn("sql", `Sentencia idéntica en ${owner} y ${entry.tag}; confirma que es intencional`);
      } else if (!owner) {
        statementOwners.set(statement, entry.tag);
      }
    }

    scanSchemaObjects(filename, statements, createdObjects, droppedObjects, enumValues);

    // Riesgo PostgreSQL 55P04: un valor agregado con ALTER TYPE ... ADD VALUE
    // no puede usarse hasta que la transacción haga COMMIT. Drizzle envuelve
    // todas las migraciones pendientes en una sola transacción.
    const addedEnumValues = [];
    for (const statement of meaningful) {
      const addValueRegex =
        /ALTER\s+TYPE\s+(?:"[^"]+"\s*\.\s*)?"([^"]+)"\s+ADD\s+VALUE\s+'((?:''|[^'])*)'/gi;
      for (const match of statement.matchAll(addValueRegex)) {
        addedEnumValues.push({ type: match[1], value: unquoteSqlString(match[2]) });
      }
    }
    for (const added of addedEnumValues) {
      const literal = `'${added.value.replace(/'/g, "''")}'`;
      const sameTransactionUse = meaningful.find(
        (statement) =>
          !/ALTER\s+TYPE[\s\S]*ADD\s+VALUE/i.test(statement) &&
          statement.includes(literal) &&
          /\b(SET\s+DEFAULT|DEFAULT|CHECK|INSERT|UPDATE|WHERE|VALUES)\b/i.test(statement),
      );
      if (sameTransactionUse) {
        warn(
          "sql",
          `${filename} agrega el valor '${added.value}' al enum ${added.type} y lo usa en la misma migración; PostgreSQL 55P04 exige COMMIT previo y drizzle-kit agrupa las pendientes en una transacción. Bloqueante en una DB fresca`,
        );
      }
    }

    if (/\bDROP\s+(TABLE|COLUMN|TYPE)\b|\bTRUNCATE\b/i.test(text)) {
      destructiveHints.add(`${filename}: contiene DROP/TRUNCATE (irreversible sin backup)`);
    }
    if (/\bDELETE\s+FROM\b|\bUPDATE\s+"[^"]+"\s+SET\b/i.test(text)) {
      destructiveHints.add(`${filename}: contiene DELETE/UPDATE de datos (requiere backup y ventana)`);
    }
    if (/\bALTER\s+TYPE\s+"[^"]+"\s+ADD\s+VALUE\b/i.test(text)) {
      destructiveHints.add(`${filename}: agrega valores de enum (forward-only en PostgreSQL)`);
    }
  }

  for (const hint of destructiveHints) note(hint);
  if (present === entries.length && sqlFiles.length === entries.length) {
    pass(`SQL: ${present}/${entries.length} archivos presentes, no vacíos y registrados`);
  }
}

function scanSchemaObjects(filename, statements, createdObjects, droppedObjects, enumValues) {
  // Los objetos pueden venir calificados ("public"."role") o no ("role").
  const createPatterns = [
    {
      kind: "tabla",
      regex: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi,
    },
    {
      kind: "índice",
      regex: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi,
    },
    { kind: "tipo", regex: /CREATE\s+TYPE\s+(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi },
  ];

  const dropPatterns = [
    {
      kind: "tabla",
      regex: /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi,
    },
    {
      kind: "índice",
      regex: /DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi,
    },
    { kind: "tipo", regex: /DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"/gi },
  ];

  for (const statement of statements) {
    for (const pattern of createPatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of statement.matchAll(pattern.regex)) {
        const key = `${pattern.kind}:${match[1]}`;
        registerCreated(filename, key, createdObjects, droppedObjects);
      }
    }

    const constraintRegex =
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"/gi;
    for (const match of statement.matchAll(constraintRegex)) {
      registerCreated(filename, `constraint:${match[1]}.${match[2]}`, createdObjects, droppedObjects);
    }

    for (const pattern of dropPatterns) {
      pattern.regex.lastIndex = 0;
      for (const match of statement.matchAll(pattern.regex)) {
        droppedObjects.add(`${pattern.kind}:${match[1]}`);
        createdObjects.delete(`${pattern.kind}:${match[1]}`);
      }
    }
    const dropConstraintRegex =
      /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"[^"]+"\s*\.\s*)?"([^"]+)"\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;
    for (const match of statement.matchAll(dropConstraintRegex)) {
      droppedObjects.add(`constraint:${match[1]}.${match[2]}`);
      createdObjects.delete(`constraint:${match[1]}.${match[2]}`);
    }

    const createEnumRegex =
      /CREATE\s+TYPE\s+(?:"[^"]+"\s*\.\s*)?"([^"]+)"\s+AS\s+ENUM\s*\(([\s\S]*?)\)/gi;
    for (const match of statement.matchAll(createEnumRegex)) {
      const values = new Set(enumValues.get(match[1]) ?? []);
      for (const valueMatch of match[2].matchAll(/'((?:''|[^'])*)'/g)) {
        const value = unquoteSqlString(valueMatch[1]);
        if (values.has(value)) {
          error("sql", `${filename} declara dos veces el valor '${value}' del enum ${match[1]}`);
        }
        values.add(value);
      }
      enumValues.set(match[1], values);
    }
    const addEnumRegex =
      /ALTER\s+TYPE\s+(?:"[^"]+"\s*\.\s*)?"([^"]+)"\s+ADD\s+VALUE\s+'((?:''|[^'])*)'/gi;
    for (const match of statement.matchAll(addEnumRegex)) {
      const value = unquoteSqlString(match[2]);
      const values = enumValues.get(match[1]) ?? new Set();
      if (values.has(value)) {
        error("sql", `${filename} vuelve a agregar el valor '${value}' al enum ${match[1]}`);
      }
      values.add(value);
      enumValues.set(match[1], values);
    }
  }
}

function registerCreated(filename, key, createdObjects, droppedObjects) {
  if (createdObjects.has(key)) {
    error("sql", `${filename} crea dos veces "${key}" (ya creado en ${createdObjects.get(key)})`);
    return;
  }
  if (droppedObjects.has(key)) {
    droppedObjects.delete(key);
  }
  createdObjects.set(key, filename);
}

async function validateSnapshots(entries) {
  let files = [];
  try {
    files = (await fsp.readdir(META_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith("_snapshot.json"))
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    error("snapshots", `No se pudo leer db/migrations/meta: ${cause.message}`);
    return;
  }

  // drizzle-kit nombra los snapshots por posición (0000_snapshot.json), no por tag.
  const snapshotName = (entry, index) => {
    const idx = Number.isInteger(entry.idx) ? entry.idx : index;
    return `${String(idx).padStart(4, "0")}_snapshot.json`;
  };

  const expected = new Map();
  entries.forEach((entry, index) => {
    expected.set(snapshotName(entry, index), entry.tag);
  });
  for (const file of files) {
    if (!expected.has(file)) {
      error("snapshots", `Snapshot huérfano: ${file} no corresponde a ninguna entrada del journal`);
    }
  }

  let missing = 0;
  let previousId = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (typeof entry.tag !== "string") continue;
    const filename = snapshotName(entry, index);
    if (!files.includes(filename)) {
      missing += 1;
      warn(
        "snapshots",
        `Falta ${filename} (${entry.tag}). Es tolerado si la migración fue manual (caso 0005), pero no se puede reconstruir la cadena completa`,
      );
      continue;
    }
    let snapshot;
    try {
      snapshot = JSON.parse(await readText(path.join(META_DIR, filename)));
    } catch (cause) {
      error("snapshots", `${filename} no es JSON válido: ${cause.message}`);
      continue;
    }
    if (!isRecord(snapshot) || typeof snapshot.id !== "string") {
      error("snapshots", `${filename} no tiene un id válido`);
      continue;
    }
    if (snapshot.dialect !== undefined && snapshot.dialect !== "postgresql") {
      warn("snapshots", `${filename} tiene dialect=${String(snapshot.dialect)}`);
    }
    if (previousId === null) {
      if (snapshot.prevId !== ZERO_UUID) {
        warn("snapshots", `${filename} debería iniciar la cadena con prevId=${ZERO_UUID}`);
      }
    } else if (snapshot.prevId !== previousId) {
      warn("snapshots", `${filename}.prevId no coincide con el snapshot anterior (${previousId})`);
    }
    previousId = snapshot.id;
  }

  if (missing === 0) {
    pass(`Snapshots: ${entries.length}/${entries.length} presentes y cadena verificada`);
  } else {
    warn("snapshots", `Snapshots: ${entries.length - missing}/${entries.length} presentes (${missing} faltante/s)`);
  }
}

async function validateDrizzleConfig() {
  if (!existsSync(DRIZZLE_CONFIG_PATH)) {
    error("config", "No existe drizzle.config.ts");
    return;
  }
  const source = await readText(DRIZZLE_CONFIG_PATH);
  const readField = (field) => {
    const match = new RegExp(`${field}\\s*:\\s*["']([^"']+)["']`).exec(source);
    return match?.[1];
  };
  const schema = readField("schema");
  const out = readField("out");
  const dialect = readField("dialect");

  if (!schema || !samePath(path.resolve(REPO_ROOT, schema), SCHEMA_PATH)) {
    error("config", `drizzle.config.ts schema=${JSON.stringify(schema)}; el checker espera ./db/schema.ts`);
  }
  if (!out || !samePath(path.resolve(REPO_ROOT, out), MIGRATIONS_DIR)) {
    error("config", `drizzle.config.ts out=${JSON.stringify(out)}; el checker espera ./db/migrations`);
  }
  if (dialect !== "postgresql") {
    error("config", `drizzle.config.ts dialect=${JSON.stringify(dialect)}; se esperaba "postgresql"`);
  }
  if (!/process\.env\.DATABASE_URL/.test(source)) {
    warn("config", "drizzle.config.ts no lee DATABASE_URL desde process.env; revisa que no haya credenciales embebidas");
  }
  if (!report.errors.some((item) => item.section === "config")) {
    pass("Configuración drizzle-kit: schema, out y dialect correctos");
  }
}

async function validateConnectionPool() {
  if (!existsSync(CONNECTION_PATH)) {
    warn("pool", "No existe server/queries/connection.ts; no se pudo revisar el pool");
    return;
  }
  const source = await readText(CONNECTION_PATH);
  if (!/new\s+pg\.Pool\s*\(/.test(source)) {
    warn("pool", "No se detectó new pg.Pool en connection.ts");
    return;
  }

  const missing = [];
  const expectedOptions = [
    ["max", /\bmax\s*:/, "max"],
    ["idleTimeoutMillis", /\bidleTimeoutMillis\s*:/, "idleTimeoutMillis"],
    ["connectionTimeoutMillis", /\bconnectionTimeoutMillis\s*:/, "connectionTimeoutMillis"],
    ["statement_timeout", /\bstatement_timeout\s*:/, "statement_timeout"],
    ["application_name", /\bapplication_name\s*:/, "application_name"],
  ];
  for (const [, regex, label] of expectedOptions) {
    if (!regex.test(source)) missing.push(label);
  }
  if (!/pool\.on\(\s*["']error["']/.test(source)) {
    warn("pool", "connection.ts no registra pool.on('error'); un cliente idle con error puede tumbar el proceso");
  }
  if (!/\.end\(\)/.test(source)) {
    note("Pool: no hay cierre ordenado (pool.end()) para SIGTERM/SIGINT; documentado en DATABASE.md");
  }
  if (missing.length > 0) {
    warn(
      "pool",
      `connection.ts no configura ${missing.join(", ")}; pg usa defaults (max=10, idleTimeout=10s, connectionTimeout=0, sin statement_timeout). Ver DATABASE.md`,
    );
  } else {
    pass("Pool pg: límites y timeouts configurados");
  }
}

function runProcess(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 120_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (cause) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${cause.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

async function removeTemporaryDirectory(tempRoot, junctionPath) {
  if (existsSync(junctionPath)) {
    try {
      await fsp.unlink(junctionPath);
    } catch {
      try {
        await fsp.rmdir(junctionPath);
      } catch {
        // No se pudo quitar el junction: no borrar recursivamente para no tocar node_modules.
        warn("generate", `No se pudo limpiar ${junctionPath}; borra manualmente ${tempRoot}`);
        return;
      }
    }
  }
  try {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  } catch (cause) {
    warn("generate", `No se pudo limpiar el temporal ${tempRoot}: ${cause.message}`);
  }
}

async function validateGenerate() {
  if (!existsSync(DRIZZLE_BIN)) {
    error("generate", "No existe node_modules/drizzle-kit/bin.cjs; ejecuta npm ci antes del preflight");
    return;
  }
  if (!existsSync(SCHEMA_PATH)) {
    error("generate", "No existe db/schema.ts");
    return;
  }

  let tempRoot;
  let junctionPath;
  try {
    tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "rapidy-dbcheck-"));
    const tempMigrations = path.join(tempRoot, "migrations");
    const tempSchema = path.join(tempRoot, "schema.ts");
    junctionPath = path.join(tempRoot, "node_modules");

    await fsp.cp(MIGRATIONS_DIR, tempMigrations, { recursive: true });
    await fsp.copyFile(SCHEMA_PATH, tempSchema);
    if (existsSync(path.join(REPO_ROOT, "db", "relations.ts"))) {
      await fsp.copyFile(path.join(REPO_ROOT, "db", "relations.ts"), path.join(tempRoot, "relations.ts"));
    }
    // Junction/symlink al node_modules real: el schema copiado resuelve drizzle-orm
    // sin copiar dependencias y sin escribir dentro del repo.
    await fsp.symlink(path.join(REPO_ROOT, "node_modules"), junctionPath, IS_WINDOWS ? "junction" : "dir");

    const before = await hashTree(tempMigrations);
    const result = await runProcess(
      process.execPath,
      [DRIZZLE_BIN, "generate", "--dialect", "postgresql", "--schema", "./schema.ts", "--out", "./migrations"],
      {
        cwd: tempRoot,
        env: {
          ...process.env,
          // drizzle.config.ts exige DATABASE_URL, pero `generate` no se conecta.
          DATABASE_URL: process.env.DATABASE_URL || "postgresql://check:check@127.0.0.1:5432/check",
          NODE_ENV: "development",
          CI: "1",
        },
        timeoutMs: 120_000,
      },
    );
    const after = await hashTree(tempMigrations);

    if (result.code !== 0 || result.timedOut) {
      error(
        "generate",
        `drizzle-kit generate falló${result.timedOut ? " (timeout)" : ""} con exit ${result.code}: ${tail(result.stderr || result.stdout)}`,
      );
      return;
    }

    const added = [...after.keys()].filter((file) => !before.has(file)).sort();
    const removed = [...before.keys()].filter((file) => !after.has(file)).sort();
    const changed = [...before.keys()].filter((file) => after.has(file) && before.get(file) !== after.get(file)).sort();
    const newSql = added.filter((file) => file.endsWith(".sql"));

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
      pass("db:generate: sin cambios pendientes (schema.ts coincide con los snapshots)");
      return;
    }

    error(
      "generate",
      `db:generate detectó drift: ${newSql.length} SQL nuevo/s, ${added.length} archivo/s agregado/s, ${changed.length} modificado/s, ${removed.length} eliminado/s`,
    );
    for (const file of newSql.slice(0, 3)) {
      const sql = await readText(path.join(tempMigrations, file));
      error("generate", `SQL pendiente ${file} (NO aplicar desde este script):\n${sql.slice(0, 1500)}`);
    }
    for (const file of [...changed, ...removed, ...added.filter((item) => !item.endsWith(".sql"))].slice(0, 12)) {
      warn("generate", `drizzle-kit generaría cambios en ${file}`);
    }
  } catch (cause) {
    error("generate", `No se pudo ejecutar el dry-run de generate: ${cause.message}`);
  } finally {
    if (tempRoot) {
      await removeTemporaryDirectory(tempRoot, junctionPath);
    }
  }
}

async function validateDatabaseReadOnly(entries) {
  if (entries.length === 0) {
    warn("db", "Verificación de DB omitida: journal inválido");
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    error("db", "--db requiere DATABASE_URL en el entorno (no se imprime)");
    return;
  }

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch (cause) {
    error("db", `No se pudo importar pg: ${cause.message}`);
    return;
  }

  const client = new pg.Client({
    connectionString,
    application_name: "rapidy-db-migrate-check",
    // Cinturón y tirantes: cualquier escritura accidental falla en el servidor.
    options: "-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000",
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN TRANSACTION READ ONLY");

    const table = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
    if (!table.rows[0]?.name) {
      warn("db", "No existe drizzle.__drizzle_migrations: la DB no tiene historial Drizzle (¿base vacía?)");
      if (entries.some((entry) => /^0008_/.test(entry.tag))) {
        error(
          "db",
          "DB sin historial y 0008 pendiente: PostgreSQL 55P04 al usar 'received' en la misma transacción; no aplicar el lote completo con drizzle-kit migrate. Ver DATABASE.md §2.1",
        );
      }
      await client.query("ROLLBACK");
      return;
    }

    const result = await client.query(
      "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC",
    );
    await client.query("ROLLBACK");
    const rows = result.rows;

    let mismatches = 0;
    for (let index = 0; index < Math.min(rows.length, entries.length); index += 1) {
      const row = rows[index];
      const entry = entries[index];
      const expectedHash = state.sqlHashByTag.get(entry.tag);
      if (Number(row.created_at) !== entry.when) {
        error(
          "db",
          `DB fila ${index + 1} (${entry.tag}) created_at=${row.created_at}; journal when=${entry.when}`,
        );
        mismatches += 1;
      }
      if (expectedHash && row.hash !== expectedHash) {
        error(
          "db",
          `DB fila ${index + 1} (${entry.tag}) hash distinto: el SQL local fue editado después de aplicarse o la DB tiene otra migración`,
        );
        mismatches += 1;
      }
    }

    if (rows.length > entries.length) {
      error("db", `La DB tiene ${rows.length} migraciones aplicadas y el repo solo ${entries.length}: la DB está adelantada`);
      mismatches += 1;
    } else {
      const appliedWhens = new Set(rows.map((row) => Number(row.created_at)));
      const pendingEntries = entries.filter((entry) => !appliedWhens.has(entry.when));
      if (pendingEntries.length > 0) {
        const pending = pendingEntries.map((entry) => entry.tag);
        const message = `Migraciones pendientes (${pending.length}): ${pending.join(", ")}`;
        if (flags.has("--expect-current")) {
          error("db", message);
          mismatches += 1;
        } else {
          warn("db", message);
        }
        if (pendingEntries.some((entry) => /^0008_/.test(entry.tag))) {
          error(
            "db",
            "0008 está pendiente: PostgreSQL 55P04 al usar 'received' en la misma transacción; no aplicar el lote completo con drizzle-kit migrate. Ver DATABASE.md §2.1",
          );
          mismatches += 1;
        }
      }
    }

    if (mismatches === 0 && rows.length === entries.length) {
      pass(`DB read-only: ${rows.length}/${entries.length} migraciones aplicadas; timestamps y hashes coinciden`);
    }
  } catch (cause) {
    error("db", `Verificación read-only falló: ${cause.message}`);
    try {
      await client.query("ROLLBACK");
    } catch {
      // La conexión pudo haberse cerrado; no hay nada que revertir.
    }
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch {
        // Ignorar errores al cerrar.
      }
    }
  }
}

const state = {
  sqlByTag: new Map(),
  sqlHashByTag: new Map(),
};

const journal = await loadJournal();
let entries = [];
if (journal) {
  entries = validateJournal(journal);
  if (entries.length > 0) {
    await validateSqlFiles(entries, state);
    await validateSnapshots(entries);
  }
}
await validateDrizzleConfig();
await validateConnectionPool();
if (flags.has("--skip-generate")) {
  note("db:generate omitido por --skip-generate; el preflight no está completo");
} else {
  await validateGenerate();
}
if (flags.has("--db")) {
  await validateDatabaseReadOnly(entries);
} else {
  note("DB no consultada (modo estático). Para verificar migraciones aplicadas: --db (READ ONLY).");
}

const ok = report.errors.length === 0;
if (flags.has("--json")) {
  console.log(
    JSON.stringify(
      {
        ok,
        generatedAt: new Date().toISOString(),
        journalEntries: entries.length,
        passes: report.passes,
        errors: report.errors,
        warnings: report.warnings,
        notes: report.notes,
      },
      null,
      2,
    ),
  );
} else {
  console.log("Rapidy DB migration preflight (solo lectura)");
  console.log(`Repo: ${REPO_ROOT}`);
  console.log(`Journal: ${entries.length} migraciones\n`);

  for (const message of report.passes) console.log(`[OK]   ${message}`);
  for (const item of report.warnings) console.log(`[WARN] ${item.section}: ${item.message}`);
  for (const item of report.errors) console.log(`[FAIL] ${item.section}: ${item.message}`);
  if (flags.has("--verbose")) {
    for (const message of report.notes) console.log(`[INFO] ${message}`);
  }

  console.log(
    `\nResumen: ${report.errors.length} error(es), ${report.warnings.length} advertencia(s). ${
      ok ? "Preflight OK." : "Preflight FALLIDO."
    }`,
  );
  if (report.notes.length > 0 && !flags.has("--verbose")) {
    console.log("Notas: usa --verbose para ver avisos de datos/ventana.");
  }
}

process.exitCode = ok ? 0 : 1;