# Backup y recuperación (DR) — Rapidy

**Frente 20 · Estado:** implementado a nivel de scripts y runbook. No se ejecutó
ningún backup ni restore real (regla del brief) y la máquina de desarrollo no
tiene `pg_dump`/`pg_restore` instalados todavía.

Alcance: base PostgreSQL de Rapidy (`DATABASE_URL`). No cubre archivos locales,
secretos, Firebase ni configuración de infraestructura; esos deben respaldarse
por separado.

---

## 1. Objetivos

| Métrica                                   | Objetivo | Máximo aceptado | Cómo se logra                                                                  |
| ----------------------------------------- | -------- | --------------- | ------------------------------------------------------------------------------ |
| **RPO** (pérdida máxima de datos)         | 24 h     | 24 h            | Backup lógico completo diario + backup manual antes de migraciones/despliegues |
| **RTO** (tiempo hasta servicio operativo) | 2 h      | 4 h             | Dump comprimido, restore probado mensualmente, runbook y credenciales listas   |
| **Retención local**                       | 30 días  | —               | `BACKUP_RETENTION_DAYS=30`                                                     |
| **Retención externa**                     | 12 meses | —               | Copia mensual en almacenamiento de objetos                                     |
| **Frecuencia de prueba**                  | Mensual  | 35 días         | Drill del primer lunes de cada mes                                             |

Supuestos del RTO: base de tamaño actual (decenas/cientos de MB), cliente
PostgreSQL disponible, backup ya descargado y verificado. Si el tamaño crece,
medir el drill y ajustar el objetivo. Casos extremos (ransomware, pérdida de
toda la infraestructura) pueden exceder el RTO y se documentan como excepción.

> **Limitación importante:** hoy no hay PITR (archivado de WAL). Si el negocio
> exige un RPO menor a 24 h, hay que habilitar PITR en el proveedor (backups
> continuos + WAL) o programar dumps más frecuentes. Los dumps lógicos también
> son la única defensa ante corrupción lógica (borrado accidental), porque los
> snapshots replican el borrado.

---

## 2. Estrategia y frecuencia

1. **Diario automático:** 03:00 UTC (22:00 America/Guayaquil), backup lógico
   completo con `pg_dump`. Evita la ventana de mayor tráfico.
2. **Antes de cada despliegue o migración** (`db:migrate`/`db:push`): backup
   manual adicional. Si la migración falla, el RPO de ese cambio es 0.
3. **Mensual:** copia del primer backup del mes a almacenamiento externo de
   larga duración (12 meses).
4. **Semanal (opcional, recomendado):** copia completa externa adicional para
   reducir la ventana de pérdida del proveedor local.

Cron de ejemplo (Linux, ejecutar como usuario con acceso a `DATABASE_URL`):

```cron
# /etc/cron.d/rapidy-backup
CRON_TZ=UTC
0 3 * * * rapidy cd /srv/rapidy && /usr/bin/node scripts/db-backup.mjs >> /var/log/rapidy/backup.log 2>&1
```

En Windows, Programador de tareas con acción:

```text
Programa:   C:\Program Files\nodejs\node.exe
Argumentos: scripts\db-backup.mjs
Iniciar en: C:\ruta\Rapidy
```

Requisitos en el servidor: `pg_dump` del **mismo major o superior** al servidor
PostgreSQL, `node` >= 20 y `DATABASE_URL` en el entorno (nunca en el comando,
para no filtrarla en el historial de procesos).

---

## 3. Scripts

### 3.1 Backup — `scripts/db-backup.mjs`

```bash
node scripts/db-backup.mjs

# Con conexión directa (sin pooler) para pg_dump
BACKUP_DATABASE_URL="postgresql://usuario:clave@host-directo:5432/neondb?sslmode=require" \
  node scripts/db-backup.mjs
```

Genera en `BACKUP_DIR` (default `<repo>/backups`):

```text
rapidy_<db>_<YYYYMMDDTHHMMSSZ>.dump        # formato custom comprimido (default)
rapidy_<db>_<YYYYMMDDTHHMMSSZ>.dump.sha256 # SHA-256 formato sha256sum
rapidy_<db>_<YYYYMMDDTHHMMSSZ>.dump.json   # metadatos, sin credenciales
```

- **Nombre timestamped** en UTC; si se repite el segundo, agrega sufijo.
- **Checksum SHA-256** calculado sobre el archivo final y guardado en sidecar.
- **Compresión:** `pg_dump -Fc -Z 6` (nativa, default). Con
  `BACKUP_FORMAT=plain` genera SQL y lo comprime con gzip de Node (nivel
  configurable); útil si no se dispone de `pg_restore` en el destino.
- **Escritura atómica:** primero `.partial`, luego `rename`; un fallo no deja
  un dump “válido” a medias.
- **Contraseña:** se extrae de la URL de conexión y se pasa por `PGPASSWORD`,
  no como argumento visible en el process list. Los logs y el `.json` no
  incluyen usuario ni contraseña.
- **Retención local:** borra dumps (y sus sidecars) con más de
  `BACKUP_RETENTION_DAYS` días. También limpia `.partial` huérfanos de más de
  24 h.
- **Permisos:** crea el directorio `0700` y los archivos `0600` en Linux/macOS.

Variables:

| Variable                | Default          | Descripción                                                      |
| ----------------------- | ---------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`          | —                | Obligatoria.                                                     |
| `BACKUP_DATABASE_URL`   | `DATABASE_URL`   | Opcional: conexión **directa** (sin pooler) solo para el backup. |
| `BACKUP_DIR`            | `<repo>/backups` | Absoluta o relativa al repo.                                     |
| `BACKUP_FORMAT`         | `custom`         | `custom` (`-Fc`) o `plain` (`.sql.gz`).                          |
| `BACKUP_COMPRESS_LEVEL` | `6`              | 0–9.                                                             |
| `BACKUP_RETENTION_DAYS` | `30`             | 0 desactiva el borrado.                                          |
| `BACKUP_TIMEOUT_MS`     | `1800000`        | 0 desactiva timeout.                                             |
| `PG_DUMP_BIN`           | autodetectado    | Ruta explícita a `pg_dump`.                                      |

> **Poolers:** si `DATABASE_URL` apunta a un pooler (p. ej. endpoint
> `-pooler` de Neon), define `BACKUP_DATABASE_URL` con la conexión directa.
> `pg_dump` necesita una sesión estable y puede fallar o comportarse distinto a
> través de PgBouncer en modo transacción.

Salida esperada:

```text
[backup] Iniciando backup de "rapidy" en db.example.com:5432 (custom, pg_dump (PostgreSQL) 16.3)
[backup] Destino: /var/backups/rapidy/rapidy_rapidy_20261113T030000Z.dump
[backup] Backup OK: rapidy_rapidy_20261113T030000Z.dump (12.40 MiB, 3.2 s)
[backup] SHA-256: 9f2c...
```

### 3.2 Verificación — `scripts/db-restore-check.mjs`

**Modo A — validar sin tocar ninguna base (default):**

```bash
node scripts/db-restore-check.mjs
node scripts/db-restore-check.mjs --dump /var/backups/rapidy/rapidy_....dump
```

Valida: existencia del archivo, sidecar SHA-256, metadatos `.json`, integridad
del archivo (`pg_restore --list` para custom; cabecera, pie y `CREATE TABLE`
para plain) y presencia de las 15 tablas obligatorias. **No abre conexión a la
base de datos.**

**Modo B — restore real a base temporal aislada:**

```bash
RESTORE_CHECK_ADMIN_URL="postgresql://usuario:clave@host:5432/postgres?sslmode=require" \
  node scripts/db-restore-check.mjs --restore
```

- Crea `rapidy_restore_check_<timestamp>_<rand>` en el servidor indicado.
- Restaura con `pg_restore --single-transaction --exit-on-error` (o `psql` para
  plain) y valida tablas + conteos de `users`, `orders`, `commerces`, etc.
- Elimina la base temporal al terminar. Con `--keep` la conserva para
  inspección.
- **Nunca** usa `DATABASE_URL` como destino: deriva la conexión administrativa
  a la base `postgres` (o usa `RESTORE_CHECK_ADMIN_URL`) y aborta si el nombre
  temporal coincidiera con la base de producción. Si `DATABASE_URL` usa un
  pooler, define `RESTORE_CHECK_ADMIN_URL` con la conexión directa:
  `CREATE DATABASE` no debe pasar por PgBouncer.

Opciones: `--dump <archivo>`, `--restore`, `--keep`, `--skip-checksum`
(peligroso), `--help`. Variables: `BACKUP_DIR`, `PG_RESTORE_BIN`, `PSQL_BIN`,
`RESTORE_CHECK_TIMEOUT_MS` (default 1 h).

Requisitos: usuario con `CREATEDB` (solo para el drill), `pg_restore`/`psql` del
mismo major o superior al servidor, y espacio libre para una copia temporal.

---

## 4. Retención, cifrado y almacenamiento externo

### Retención (esquema GFS simplificado)

| Capa            | Contenido           | Retención  | Ubicación                             |
| --------------- | ------------------- | ---------- | ------------------------------------- |
| Local           | 1 dump/día          | 30 días    | Disco del servidor o volumen dedicado |
| Externa diaria  | 1 dump/día          | 30–90 días | Bucket de objetos, región distinta    |
| Externa mensual | Primer dump del mes | 12 meses   | Bucket frío / Object Lock             |
| Pre-despliegue  | Dump manual         | 7–30 días  | Local + externo                       |

Los dumps mensuales se copian **fuera** del alcance del script de retención
(que solo borra el directorio local).

### Cifrado

- **En tránsito:** `DATABASE_URL` debe usar TLS (`sslmode=require`; ideal
  `verify-full` con CA del proveedor). No usar `sslmode=disable` en producción.
- **En reposo local:** el directorio de backups debe vivir en un volumen
  cifrado (LUKS, BitLocker o disco cifrado del proveedor). Permisos `0700`.
- **En reposo externo:** bucket privado con cifrado del lado del servidor
  (SSE-KMS/SSE-S3 o equivalente de R2/B2). Activar versioning y, si está
  disponible, Object Lock durante 30 días para proteger ante ransomware.
- **Cifrado del lado del cliente (recomendado si el dump sale del perímetro):**

  ```bash
  age -r age1... -o rapidy_20261113.dump.age rapidy_20261113.dump
  sha256sum rapidy_20261113.dump.age > rapidy_20261113.dump.age.sha256
  ```

  La clave privada (`age`/GPG) se guarda en un gestor de secretos, **nunca** en
  el mismo bucket ni en el repo. Rotarla al menos cada 12 meses y al salir
  alguien del equipo. Para restaurar, descifrar en una máquina controlada:

  ```bash
  age -d -i /ruta/segura/rapidy-backup.key -o dump.dump dump.dump.age
  ```

- Los scripts actuales **no cifran** el dump (necesitan el archivo legible para
  `pg_restore`). El cifrado es un paso del pipeline de backup/upload. Pendiente
  de mejora: integrar `age` directamente en `db-backup.mjs`.

### Almacenamiento externo (regla 3-2-1)

- **3 copias:** producción + backup local + copia externa.
- **2 medios/proveedores:** disco local y object storage (S3, R2, B2 o similar),
  preferiblemente en otra región/cuenta.
- **1 fuera de sitio:** copia mensual en frío, con acceso restringido.

Buenas prácticas:

- Bucket privado, sin listado público, IAM mínimo (solo `PutObject` para el
  usuario de backup; `GetObject` para el de restore).
- Versioning + lifecycle (transición a frío a los 30 días; expiración a los 12
  meses para mensuales).
- Subir siempre el dump, su `.sha256` y su `.json`. Verificar el checksum
  **después** de subir (releer el objeto) y de nuevo al descargar en el drill:

  ```bash
  aws s3 cp rapidy_....dump s3://rapidy-backups/daily/ --sse aws:kms
  aws s3 cp rapidy_....dump.sha256 s3://rapidy-backups/daily/
  # Verificación en el drill, tras descargar dump + sidecar:
  # sha256sum -c rapidy_....dump.sha256
  ```

- Alertar si no aparece un backup nuevo en 26 h o si el checksum falla.
- **Atención en desarrollo:** este repo vive bajo `OneDrive\Desktop\Rapidy`.
  No dejar dumps con datos reales en `backups/` dentro de OneDrive: sincroniza
  a la nube personal. En producción usar `BACKUP_DIR=/var/backups/rapidy` (u
  otro disco cifrado fuera de la carpeta sincronizada). El `.gitignore` propio
  de `backups/` evita commitearlos, pero no evita la sincronización.

---

## 5. Prueba mensual de restore

**Cuándo:** primer lunes de cada mes, 09:00 UTC. Duración esperada: 30–60 min.

1. Elegir el backup más reciente del almacenamiento externo (no el local).
2. Descargar dump + `.sha256` + `.json` a una máquina de staging/DR.
3. Verificar checksum y estructura:

   ```bash
   sha256sum -c rapidy_....dump.sha256
   node scripts/db-restore-check.mjs --dump /ruta/rapidy_....dump
   ```

4. Ejecutar el restore real a base temporal:

   ```bash
   DATABASE_URL="postgresql://.../rapidy_staging?sslmode=require" \
   RESTORE_CHECK_ADMIN_URL="postgresql://.../postgres?sslmode=require" \
     node scripts/db-restore-check.mjs --restore
   ```

5. Revisar que el resultado incluya las 15 tablas, conteos plausibles y
   `drizzle.__drizzle_migrations`.
6. Medir el tiempo total y compararlo con el RTO. Si supera 2 h, ajustar.
7. Confirmar que la base temporal fue eliminada (o eliminarla si se usó
   `--keep`).
8. Registrar el drill y archivar la salida del comando.

Plantilla de registro:

| Fecha      | Backup probado                        | SHA-256 verificado | Inicio/fin  | Tiempo | ¿OK? | Incidencias |
| ---------- | ------------------------------------- | ------------------ | ----------- | ------ | ---- | ----------- |
| 2026-12-07 | `rapidy_rapidy_20261201T030000Z.dump` | Sí                 | 09:00–09:35 | 35 min | Sí   | —           |

**Criterio de éxito:** exit code 0, checksum válido, 15 tablas presentes,
conteos coherentes y tiempo dentro del RTO. Si falla: abrir incidente, no
esperar al siguiente mes, y conservar el dump fallido para diagnóstico.

**Limpieza de bases huérfanas** (si un drill se interrumpe):

```sql
SELECT datname FROM pg_database WHERE datname LIKE 'rapidy_restore_check_%';
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = 'rapidy_restore_check_....' AND pid <> pg_backend_pid();
DROP DATABASE "rapidy_restore_check_....";
```

---

## 6. Restauración paso a paso

### 6.1 Verificación previa (sin tocar producción)

```bash
node scripts/db-restore-check.mjs --dump /ruta/backup.dump
```

Si falla el checksum, **detenerse** y buscar otra copia. No restaurar un dump
sin verificar.

### 6.2 Restore a base temporal (staging o mismo servidor)

```bash
RESTORE_CHECK_ADMIN_URL="postgresql://usuario:clave@host:5432/postgres?sslmode=require" \
  node scripts/db-restore-check.mjs --restore
```

Esto demuestra que el dump es restaurable sin tocar la base de la aplicación.
Es el paso obligatorio antes de cualquier cutover.

### 6.3 Restauración real (DR)

1. **Declarar incidente y congelar escrituras.** Escalar la app a cero o poner
   modo mantenimiento. No reiniciar `localhost:3000` en desarrollo como parte de
   este frente; en producción, detener las instancias que escriben.
2. **Preservar el estado actual.** Snapshot del proveedor y/o renombrar la base
   dañada (no borrarla):

   ```sql
   ALTER DATABASE rapidy RENAME TO rapidy_broken_20261113;
   ```

3. **Obtener la copia más reciente** del almacenamiento externo y verificar:

   ```bash
   sha256sum -c rapidy_....dump.sha256
   node scripts/db-restore-check.mjs --dump rapidy_....dump
   ```

4. **Descifrar** si aplica (`age -d`/`gpg`) en una máquina controlada.
5. **Crear la base destino** vacía (o restaurar a una nueva y luego renombrar):

   ```bash
   createdb -h "$PGHOST" -U "$PGUSER" rapidy_restored
   ```

6. **Restaurar:**

   ```bash
   export TARGET_URL="postgresql://usuario:clave@host:5432/rapidy_restored?sslmode=require"
   pg_restore \
     --dbname "$TARGET_URL" \
     --no-owner --no-privileges --exit-on-error --single-transaction \
     rapidy_....dump
   ```

   Para formato `plain`:

   ```bash
   gunzip -c rapidy_....sql.gz | psql \
     --set ON_ERROR_STOP=1 \
     --dbname "$TARGET_URL"
   ```

7. **Validar datos** (además del script de restore-check):

   ```sql
   SELECT count(*) FROM users;
   SELECT count(*) FROM customers;
   SELECT count(*) FROM drivers;
   SELECT count(*) FROM commerces;
   SELECT count(*) FROM products;
   SELECT count(*) FROM orders;
   SELECT count(*) FROM order_items;
   SELECT count(*) FROM chat_messages;
   SELECT count(*) FROM drizzle.__drizzle_migrations;

   -- Invariantes básicas: todos deben devolver 0
   SELECT count(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL;
   SELECT count(*) FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL;
   SELECT count(*) FROM orders WHERE total < 0;
   ```

   Comparar los conteos con la última métrica conocida o con el `.json` del
   backup. Diferencias grandes → investigar antes del cutover.

8. **Probar la aplicación** contra la base restaurada (staging): login de
   cliente/negocio/repartidor/admin, listado de pedidos, carrito y SSE. Usar los
   smoke scripts existentes (`scripts/e2e-*.mjs`) apuntando a la instancia de
   staging, nunca contra producción durante el incidente.
9. **Cutover:** actualizar el secreto `DATABASE_URL` al nuevo host/base,
   desplegar/reiniciar las instancias de la app y verificar `/health` (o el
   endpoint de salud disponible) y los flujos críticos.
10. **Monitorear 24 h:** errores 5xx, latencia, pedidos nuevos, SSE y jobs.
11. **Cierre:** conservar la base anterior/snapshot al menos 7 días, comunicar
    la resolución, documentar causa raíz y tiempo real de recuperación.
12. **Rotar credenciales** si el incidente fue de seguridad.

### 6.4 Escenarios y decisión

| Escenario                            | Acción                                                         | RPO real                        | RTO esperado |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------- | ------------ |
| Borrado/corrupción de filas o tablas | Restaurar dump a base nueva, extraer datos puntuales o cutover | 24 h                            | 1–2 h        |
| Migración fallida                    | Restaurar backup pre-despliegue (RPO 0 respecto al cambio)     | minutos                         | 30–60 min    |
| Pérdida total del servidor/proveedor | Provisionar PostgreSQL, restaurar último dump externo, cutover | 24 h                            | 2–4 h        |
| Ransomware                           | Aislar, restaurar desde copia con Object Lock, rotar secretos  | 24 h (o última copia inmutable) | 4–8 h        |
| Corrupción detectada tarde           | Último dump verificable; evaluar PITR si se habilita           | 24 h                            | 2 h          |

---

## 7. Operación y verificaciones pendientes

- [ ] Instalar `pg_dump`/`pg_restore`/`psql` (>= 14) en el host de backups y en
      la máquina de drills.
- [ ] Configurar `DATABASE_URL` y `BACKUP_DIR` en el entorno del cron (no en
      texto plano del repositorio).
- [ ] Agregar `backups/` al `.gitignore` raíz. **No editado en este frente**
      porque el archivo no está asignado; mientras tanto el script crea
      `backups/.gitignore` con `*` y `!.gitignore`.
- [ ] Documentar `BACKUP_DIR`, `BACKUP_DATABASE_URL` y `RESTORE_CHECK_ADMIN_URL`
      en `.env.example`. **No editado**: archivo compartido no asignado.
- [ ] Agregar alias `npm run db:backup` / `db:restore-check` en `package.json`.
      **No editado**: archivo compartido no asignado. Comandos actuales:
      `node scripts/db-backup.mjs` y `node scripts/db-restore-check.mjs`.
- [ ] Programar cron/Programador de tareas y alerta de “sin backup en 26 h”.
- [ ] Configurar bucket externo con versioning, cifrado y lifecycle.
- [ ] Definir responsable y calendario del drill mensual.
- [ ] Ejecutar el primer backup real y el primer drill (no realizados aquí por
      instrucción del brief).
- [ ] Evaluar PITR si se requiere RPO < 24 h.

---

## 8. Referencia rápida

```bash
# Backup manual
node scripts/db-backup.mjs

# Verificar el backup más reciente (no toca la BD)
node scripts/db-restore-check.mjs

# Verificar un backup concreto
node scripts/db-restore-check.mjs --dump /ruta/rapidy_....dump

# Restore de prueba a base temporal (requiere CREATEDB)
RESTORE_CHECK_ADMIN_URL="postgresql://.../postgres" node scripts/db-restore-check.mjs --restore

# Conservar la base temporal para inspección
RESTORE_CHECK_ADMIN_URL="postgresql://.../postgres" node scripts/db-restore-check.mjs --restore --keep
```

Códigos de salida: `0` = correcto; `1` = fallo de backup, checksum, estructura
o restore. Un fallo debe tratarse como incidente de backup (revisar logs,
espacio en disco, credenciales y versión de `pg_dump`).
