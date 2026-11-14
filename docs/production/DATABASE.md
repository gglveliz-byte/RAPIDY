# Base de datos y migraciones — runbook de producción

**Alcance:** PostgreSQL + Drizzle ORM. Este documento cubre el preflight de
migraciones, la aplicación en producción, backup/rollback, verificación de
índices y FKs, pool de conexiones y la prohibición de seeds.

**Estado verificado (2026-11-13):**

- 12 migraciones registradas: `0000_dear_shooting_star` … `0011_icy_satana`.
- `db:generate` no detecta cambios pendientes: `db/schema.ts` coincide con el
  snapshot `0011`.
- `0005_drivers_commission_rate` es una migración manual y no tiene snapshot.
  Es tolerado por Drizzle, pero se reporta como warning.
- No existen migraciones "down". La estrategia es forward-only.
- 0010 y 0011 están aplicadas en local; **no** se asume nada sobre producción.
- `server/queries/connection.ts` usa un `pg.Pool` con los defaults de `pg`; ver
  la sección de pool. Este runbook no modifica ese archivo.

---

## 1. Preflight obligatorio (solo lectura)

El script asignado es `scripts/db-migrate-check.mjs`. No aplica migraciones, no
ejecuta `push`/`seed` y no escribe en `db/migrations`: el dry-run de
`drizzle-kit generate` se hace sobre una copia temporal en el directorio del
sistema y se elimina al terminar.

```bash
# Preflight estático + dry-run de db:generate (no usa DATABASE_URL)
node scripts/db-migrate-check.mjs --verbose

# Solo estático (sin invocar drizzle-kit)
node scripts/db-migrate-check.mjs --skip-generate

# Salida para CI
node scripts/db-migrate-check.mjs --json

# Verificación READ ONLY de la base (requiere DATABASE_URL)
node scripts/db-migrate-check.mjs --db

# Igual, pero falla si queda alguna migración pendiente (post-migración)
node scripts/db-migrate-check.mjs --db --expect-current
```

Qué valida:

1. `meta/_journal.json`: JSON, `dialect=postgresql`, `idx` consecutivos, tags
   únicos y coincidentes con el prefijo, y `when` **estrictamente creciente**.
   Esto último es crítico: el migrador de Drizzle solo compara el último
   `created_at` de la DB y puede omitir migraciones si el orden se rompe.
2. SQL: archivos faltantes, huérfanos (no registrados), vacíos, contenido
   duplicado, sentencias repetidas y objetos DDL creados dos veces (tablas,
   índices, tipos, constraints, valores de enum). También avisa si un valor de
   enum se usa en la misma migración en que se agrega (riesgo PostgreSQL 55P04,
   ver 2.1).
3. Snapshots: faltantes (warning), huérfanos, JSON inválido y cadena `prevId`.
4. `drizzle.config.ts`: `schema`, `out` y `dialect` esperados.
5. `db:generate`: si aparecería un SQL nuevo o un snapshot modificado, falla.
   El SQL pendiente se muestra solo como diagnóstico; **no se aplica**.
6. Pool: avisa si faltan límites/timeouts o el handler de errores.
7. `--db`: abre `BEGIN TRANSACTION READ ONLY` con
   `default_transaction_read_only=on`, consulta
   `drizzle.__drizzle_migrations` y compara cantidad, `created_at` y `hash`
   SHA-256 contra los archivos locales. Siempre hace `ROLLBACK`. Sin `--db` no
   se conecta a la base. Si `0008` está pendiente (o la DB no tiene historial),
   `--db` falla a propósito por el bloqueante de la sección 2.1.

Salida esperada hoy: **0 errores** y warnings por el snapshot 0005, por el pool
sin timeouts y por el riesgo de enum de 0008 (ver 2.1). Código de salida: `0`
OK, `1` errores, `2` uso inválido.

En CI, ejecutar el preflight después de `npm ci`; el dry-run necesita
`node_modules/drizzle-kit`. No requiere credenciales.

---

## 2. Estrategia de aplicación en producción

Reglas:

- Migraciones **versionadas y forward-only**. Se generan y revisan en
  desarrollo/CI, se commitean y se aplican como un job único de release.
- **Nunca** `npm run db:push` en producción. `push` compara y altera el schema
  directamente, sin journal ni historial, y puede destruir datos.
- **Nunca** ejecutar `db:generate` en producción. Si `db:generate` tiene drift,
  el release se bloquea; se corrige en el repo.
- **Nunca** aplicar migraciones automáticamente en el arranque de la app. El
  boot actual solo intenta crear el admin inicial; no migra. Usar un job
  one-off: `npm run db:migrate` con el artefacto de release.
- Un solo migrador a la vez. Drizzle no toma un advisory lock entre procesos;
  usar el lock de despliegue de la plataforma (concurrency group) o un lock
  externo. No correr dos releases en paralelo.
- Rol separado: `rapidy_migrator` con permisos DDL para el job; el rol de la
  app solo DML. La app no debe poder alterar el schema.
- Conexión **directa** para migrar (puerto 5432 del proveedor), no el pooler en
  modo transaction. El pooler puede romper DDL/transacciones largas.
- TLS obligatorio: `sslmode=require` como mínimo; `verify-full` con CA del
  proveedor si está disponible.

Ventana recomendada:

| Paso | Acción | Criterio |
|---|---|---|
| 0 | Congelar deploys y anunciar ventana | Un solo release en vuelo |
| 1 | Backup + restore de prueba | Ver sección 3 |
| 2 | Preflight estático y `--db` | 0 errores; resolver 0008 si está pendiente (2.1) |
| 3 | Modo mantenimiento / bajar tráfico | Evitar escrituras durante DDL |
| 4 | `npm run db:migrate` una vez | Log guardado; sin reintentos ciegos |
| 5 | `--db --expect-current` | 12/12, hashes y timestamps OK |
| 6 | Verificar índices/FKs/enums | Sección 4 |
| 7 | Desplegar app nueva y smoke tests | Cliente/Negocio/Driver/Admin/SSE |
| 8 | Monitorear 30–60 min y cerrar | Sin errores ni locks residuales |

Orden recomendado para este release: **migrar → desplegar app nueva**. Las
migraciones 0010/0011 son aditivas; el código nuevo espera `settled_at`,
`admin_paused`, `session_version`, `updated_by` y las columnas de comisión. Una
app vieja tolera columnas nuevas, lo que permite rollback de aplicación sin
revertir el schema.

Duración/locks esperados:

- `0007_dashing_mesmero`: crea índices y ejecuta dos `DELETE` de deduplicación;
  en una base con datos puede tardar y bloquear escrituras. Hacer backup.
- `0008_simple_vance_astro`: `ALTER TYPE … ADD VALUE`. Requiere PostgreSQL 12+
  (recomendado 15/16), es forward-only y tiene el bloqueante de la sección 2.1
  si se aplica en una base fresca.
- `0010`/`0011`: columnas y FKs aditivas. La FK de `app_settings.updated_by`
  valida contra `users`; en tablas grandes puede escanear.
- Todas las migraciones pendientes se aplican dentro de una transacción del
  migrador. Si una falla, se revierte el conjunto. Evitar editar un SQL para
  usar `CREATE INDEX CONCURRENTLY`: no puede ejecutarse dentro de esa
  transacción y no está previsto en estas migraciones.

Timeouts del job: configurar a nivel de rol para que apliquen a la sesión del
migrador:

```sql
ALTER ROLE rapidy_migrator SET lock_timeout = '5s';
ALTER ROLE rapidy_migrator SET statement_timeout = '900000'; -- 15 min
ALTER ROLE rapidy_migrator SET idle_in_transaction_session_timeout = '60s';
```

Si `lock_timeout` vence, el job falla y la transacción se revierte: esperar,
revisar `pg_locks` y reprogramar. No subir el timeout sin diagnosticar la causa.
La URL de una sesión puntual también puede llevar
`?options=-c%20lock_timeout%3D5000` si se prefiere no tocar el rol.

### 2.1 Riesgo de 0008 según versión de PostgreSQL

`0008_simple_vance_astro.sql` agrega el valor `'received'` al enum
`order_commerce_status_enum` y, más abajo, ejecuta
`ALTER TABLE "order_commerce_status" ALTER COLUMN "status" SET DEFAULT 'received'`.

**Verificado en el target actual:** PostgreSQL **18.7** (Neon) permite agregar
el valor y usarlo como default en la misma transacción; la migración completa
se aplicó en local sin error. El script de check mantiene el warning porque
una versión anterior fallaría con:

```text
ERROR: 55P04: unsafe use of new value "received" of enum type order_commerce_status_enum
HINT: New enum values must be committed before they can be used.
```

Drizzle ORM 0.45.1 envuelve **todas las migraciones pendientes** en un solo
`session.transaction` (no una transacción por archivo). Por lo tanto:

- En el target PostgreSQL 18.7 actual, `0008` pendiente se aplica completa.
- En PostgreSQL **17 o menor**, si `0008` está pendiente, `db:migrate` fallará
  con 55P04 y revertirá el lote.
- Si el proveedor baja de versión, hay que partir el default a una migración
  posterior y ensayar sobre un clon. Partir `0008` en dos archivos no alcanza
  si ambos quedan pendientes en la misma ejecución.

El script emite un warning por esta condición. Antes del go-live, el responsable
de migraciones debe elegir y **ensayar en un clon/restore de producción**:

1. **Bootstrap con frontera de transacción:** aplicar 0000–0007, commit; aplicar
   solo los `ADD VALUE` de 0008, commit; aplicar el resto de 0008 y 0009–0011.
   Requiere un runner controlado o carpetas/journal por etapas; no es un único
   `drizzle-kit migrate` sobre una base fresca.
2. **Refactor en repo (recomendado):** mover `SET DEFAULT 'received'` y cualquier
   uso de los labels nuevos a una migración posterior. Liberar primero los
   `ADD VALUE` (commit) y el default en un segundo release/ejecución. Mientras
   tanto, la app debe setear el estado explícitamente.
3. Recrear el enum con `DROP TYPE`/`CREATE TYPE` en una transacción es posible
   pero riesgoso; solo con plan revisado y backup.

No aplicar 0008 por primera vez directamente en producción sin este ensayo. Que
0010/0011 estén aplicadas en local no garantiza el estado/hash de 0008 en
producción: usar `--db`.

Comando de aplicación (placeholders, nunca commitear credenciales):

```bash
export DATABASE_URL='postgresql://rapidy_migrator:REEMPLAZAR@HOST:5432/DB?sslmode=require'
node scripts/db-migrate-check.mjs --verbose
node scripts/db-migrate-check.mjs --db
npm run db:migrate
node scripts/db-migrate-check.mjs --db --expect-current
```

`npm run db:migrate` ejecuta `drizzle-kit migrate`. Guardar stdout/stderr como
evidencia del release.

---

## 3. Backup previo (obligatorio)

La migración no es el backup. Antes de la ventana:

1. Snapshot/PITR del proveedor (Neon, Supabase, RDS, etc.). Confirmar que la
   ventana de retención cubre el release y anotar el timestamp/LSN.
2. Dump lógico independiente, cifrado y fuera del repo:

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="rapidy_${STAMP}.dump"
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges \
  --file="rapidy_${STAMP}_schema.sql"
pg_restore --list "rapidy_${STAMP}.dump" > "rapidy_${STAMP}_toc.txt"
sha256sum "rapidy_${STAMP}.dump" > "rapidy_${STAMP}.dump.sha256"
```

3. **Probar la restauración** en una base descartable antes de migrar:

```bash
createdb rapidy_restore_test
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d rapidy_restore_test "rapidy_${STAMP}.dump"
psql -d rapidy_restore_test -c 'select count(*) from drizzle.__drizzle_migrations;'
dropdb rapidy_restore_test
```

4. Registrar baseline: `SELECT pg_current_wal_lsn();`, conteos de tablas
   críticas (`orders`, `users`, `commerces`, `products`, `driver_earnings`),
   versión del servidor y extensiones.
5. Verificar permisos del rol de backup y que el dump incluya el schema
   `drizzle` (historial de migraciones).

Sin backup verificado y restore probado, no se ejecuta la migración.

---

## 4. Verificación post-migración

El script `--db --expect-current` ya valida historial, orden, timestamps y
hashes. Complementar con SQL de solo lectura:

```sql
-- Historial (debe haber 12 filas y la última debe ser 0011)
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY id;

-- Índices inválidos (build fallido o en curso)
SELECT c.relname AS index_name, t.relname AS table_name
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
WHERE NOT i.indisvalid;

-- FKs y constraints no validados
SELECT conrelid::regclass AS table_name, conname, contype, convalidated
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY 1, 2;

-- Inventario de índices
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY 1, 2;

-- Enums (deben incluir received, accepted, pending_payment, payment_rejected)
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'order_commerce_status_enum'
ORDER BY e.enumsortorder;

-- Columnas de 0010/0011
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('app_settings', 'updated_by'),
    ('order_commerce_status', 'settled_at'),
    ('products', 'admin_paused'),
    ('users', 'session_version'),
    ('orders', 'driver_commission_rate'),
    ('drivers', 'commission_rate')
  )
ORDER BY table_name, column_name;
```

Esperado:

- 12 filas en el historial, `0011` última, sin índices inválidos y sin
  constraints `NOT VALID` (estas migraciones no usan `NOT VALID`).
- `products.admin_paused` boolean `NOT NULL DEFAULT false`;
  `users.session_version` integer `NOT NULL DEFAULT 0`;
  `drivers.commission_rate` numeric(5,2) default `80.00`;
  `orders.driver_commission_rate` numeric(5,2) nullable;
  `app_settings.updated_by` con FK `ON DELETE SET NULL`.
- Índices únicos clave: `orders_idempotency_key_idx`,
  `driver_earnings_order_type_idx`,
  `order_commerce_status_order_commerce_idx`, y los índices de 0007/0009.
- Sin duplicados en `driver_earnings(order_id,type)` ni
  `order_commerce_status(order_id,commerce_id)`.

Después de verificar, ejecutar smoke tests de la app: login admin/merchant/
cliente/driver, creación de pedido, cambio de estado multi-comercio, SSE y
paneles. Un fallo de índice único se detecta en la creación de pedidos, no en el
`SELECT`.

Opcional recomendado: `ANALYZE` de `orders`, `order_items`,
`order_commerce_status` y `driver_earnings` tras la ventana.

---

## 5. Pool, conexiones y timeouts

Estado actual de `server/queries/connection.ts`:

```ts
const pool = new pg.Pool({ connectionString: env.databaseUrl });
instance = drizzle(pool, { schema: fullSchema });
```

Implicaciones de los defaults de `pg`:

- `max = 10` conexiones por proceso.
- `idleTimeoutMillis = 10s`.
- `connectionTimeoutMillis = 0` (sin límite para conectar).
- `statement_timeout` sin configurar (consultas pueden colgarse).
- No hay `pool.on("error")`: un error en un cliente idle puede tumbar el
  proceso.
- El pool no se exporta ni se cierra en SIGTERM/SIGINT; no hay apagado
  ordenado.

Recomendación (no aplicada en este frente porque `connection.ts` no está
asignado):

```ts
const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONNECT_MS ?? 5_000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 30_000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS ?? 30_000),
  application_name: "rapidy-api",
  maxLifetimeSeconds: 1_800,
});
pool.on("error", (err) => console.error("[pg] idle client error", err));
```

Además, exportar el pool y llamar `await pool.end()` en el shutdown. Para el
job de migración usar un cliente propio, no el pool de la app.

Dimensionamiento:

- `conexiones_totales = instancias_app × PG_POOL_MAX + margen_admin`.
- Debe quedar por debajo de `max_connections` del proveedor (o del pooler).
- Ejemplo: 2 instancias × 10 = 20; dejar 5–10 para migraciones, backups y
  monitoreo. Si se usa PgBouncer en modo transaction, bajar `max` y no usar
  prepared statements nombrados.
- El job de migración usa una conexión directa; no compite con el pool de la
  app.

Timeouts sugeridos:

| Contexto | Setting | Valor |
|---|---|---|
| App, conexión | `connectionTimeoutMillis` | 5 s |
| App, sentencia | `statement_timeout` | 30 s |
| App, query | `query_timeout` | 30 s |
| App, idle | `idleTimeoutMillis` | 30 s |
| Migración, lock | `lock_timeout` | 5 s |
| Migración, sentencia | `statement_timeout` | 15 min |
| Migración, transacción idle | `idle_in_transaction_session_timeout` | 60 s |

Monitorear `pg_stat_activity` durante la ventana:
`state = 'idle in transaction'`, queries > 60 s y esperas en `pg_locks`.
Alertar si el job de migración falla o si la app empieza a agotar el pool.

---

## 6. Seed y datos de prueba: prohibidos en producción

No ejecutar en producción:

- `npm run db:seed` (`db/seed.ts`): limpia datos, reinicia secuencias e inserta
  categorías, comercios, productos, admin y pedidos demo.
- `npm run db:users` (`db/create-test-users.ts`): crea/actualiza credenciales de
  prueba, con fallback de password `admin123` si no hay `ADMIN_PASSWORD`.
- `db/empty-db.ts`: borra todas las tablas de negocio.
- `db/clean-test-data.ts`: borra datos operativos dejando solo admin/categorías.
- Cualquier `drizzle-kit push` o `drizzle-kit drop`.

El único seed permitido es el bootstrap controlado de admin:
`seedAdminUser()` corre al arrancar, solo inserta si `ADMIN_EMAIL` no existe y no
sobrescribe un admin existente. Usar un `ADMIN_PASSWORD` único de 12+ caracteres,
no credenciales de ejemplo, y verificar el admin antes de abrir tráfico. No es un
mecanismo para cargar datos de negocio.

Si producción necesita datos de referencia (categorías, settings), crear una
migración de datos revisada e idempotente, separada del seed demo.

---

## 7. Rollback

No hay migraciones down. Reglas:

1. **Fallo durante `db:migrate`:** el migrador aplica las pendientes en una
   transacción. Si una sentencia falla, se revierte el conjunto y la DB queda
   como estaba. Verificar con `--db`; corregir el SQL en el repo y generar una
   migración nueva, no editar la aplicada.
2. **Migración aplicada pero app incompatible:** preferir rollback de la app
   (las columnas nuevas son aditivas y la app vieja las ignora) y un forward-fix
   para el schema. No borrar filas de `drizzle.__drizzle_migrations`.
3. **Corrupción/pérdida de datos:** restaurar el backup verificado o PITR del
   proveedor al timestamp previo a la ventana. Procedimiento:
   - Bajar la app / modo mantenimiento.
   - Snapshot del estado actual (para no perder evidencia).
   - Restaurar en una base nueva, validar historial y conteos.
   - Cambiar `DATABASE_URL` al restore, desplegar el artefacto anterior,
     smoke tests.
   - Registrar RPO/RTO real y comunicar.
4. **Enum:** `ALTER TYPE … ADD VALUE` es forward-only; PostgreSQL no elimina
   valores de enum de forma simple. No intentar “deshacerlo” con un `DELETE`
   del journal ni recreando el tipo en caliente. Si es imprescindible, plan de
   mantenimiento con backup y recreación de tipo/columnas.
5. **Nunca** editar un archivo de migración ya aplicado ni `_journal.json`: el
   hash cambia y el preflight `--db` lo detecta; además se rompe la trazabilidad.

Matriz de decisión:

| Síntoma | Acción |
|---|---|
| Error antes del commit | Automático; corregir y reintentar tras revisar |
| Índice inválido | Crear migración de reparación; no aplicar `CONCURRENTLY` dentro del job transaccional |
| FK/constraint faltante | Forward-fix con `ADD CONSTRAINT` (validar datos antes) |
| Datos demo insertados por error | Restaurar backup; no borrar a mano en caliente |
| App nueva falla, schema aditivo | Rollback de app; mantener schema |
| Pérdida/corrupción | Restore/PITR y ventana de mantenimiento |

---

## 8. Checklist de go-live

- [ ] Bloqueante 0008 resuelto/ensayado en base fresca (sección 2.1).
- [ ] Backup del proveedor + `pg_dump` verificados; restore probado.
- [ ] `node scripts/db-migrate-check.mjs --verbose` con 0 errores.
- [ ] `--db` pre-migración revisado; pendientes conocidas.
- [ ] Ventana anunciada y deploys congelados; un solo migrador.
- [ ] Rol `rapidy_migrator` con DDL, timeouts y conexión directa TLS.
- [ ] `npm run db:migrate` ejecutado una vez; log guardado.
- [ ] `--db --expect-current`: 12/12, hashes/timestamps OK.
- [ ] Sin índices inválidos ni constraints no validados.
- [ ] Columnas/enums/índices de 0010/0011 verificados.
- [ ] Smoke tests Cliente/Negocio/Driver/Admin y SSE.
- [ ] Pool/timeouts revisados (pendiente de cambio en `connection.ts`).
- [ ] Ningún seed/push/empty/clean ejecutado en producción.
- [ ] Plan de rollback y responsable definidos; monitoreo activo.

---

## 9. Archivos y pendientes de este frente

**Entregados:** `scripts/db-migrate-check.mjs`,
`docs/production/DATABASE.md`.

**No modificados por asignación:** `db/schema.ts`, `db/migrations/**`,
`drizzle.config.ts`, `server/queries/connection.ts`, `package.json`.

Pendientes recomendados (requieren archivos de otros frentes):

- Agregar `"db:check": "node scripts/db-migrate-check.mjs"` a `package.json`.
- Endurecer `connection.ts` con max/timeouts, `pool.on("error")` y cierre
  ordenado (sección 5).
- Job de CI con `node scripts/db-migrate-check.mjs --json` y `npm ci`.
- Política de backup/PITR y alertas de saturación del pool.