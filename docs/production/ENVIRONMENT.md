# Entorno y secretos — Rapidy

Documento operativo del frente **Entorno y secretos**. Cubre el inventario de
variables, la validación de arranque, la rotación de credenciales y lo que no
debe llegar al repositorio.

- Validador: `server/lib/env.ts` (se ejecuta al importar el módulo).
- Plantilla: `.env.example` (solo placeholders, sin valores reales).
- Los secretos reales viven en el gestor de secretos de la plataforma
  (Render/Vercel/Docker secrets), nunca en Git.

## Cómo se carga la configuración

1. `server/lib/env.ts` importa `dotenv/config`; en local lee `.env` de la raíz.
2. En producción la plataforma inyecta las variables y `NODE_ENV=production`.
3. Si la configuración es inválida, el módulo lanza **un único error agregado**
   al arrancar, antes de aceptar tráfico. El mensaje enumera las variables
   afectadas y nunca imprime sus valores.
4. En desarrollo no se exigen las variables críticas y se conserva el
   comportamiento histórico (por ejemplo, OTP por consola sin API Key).

## Matriz de variables por entorno

Leyenda: **Sí** = obligatoria; **No** = opcional; **—** = no aplica.

| Variable | Desarrollo | Producción | Default | Uso y validación |
|---|---|---|---|---|
| `NODE_ENV` | No | Sí (la inyecta la plataforma) | — | Activa todas las validaciones de producción. No fijarla a mano en el panel de producción. |
| `PORT` | No | No | `3000` | Puerto HTTP; lo lee `server/boot.ts` directamente. En Render/Vercel lo inyecta la plataforma. |
| `APP_ORIGIN` / `TRUSTED_ORIGINS` | No | No | `""` | Orígenes extra permitidos por el guardia CSRF, separados por coma y con esquema. Necesarios solo con front en otro dominio o transición de dominio. |
| `MAX_BODY_BYTES` | No | No | `20971520` (20 MB) | Límite global de body leído por `server/boot.ts`; si se cambia, ajustar el proxy. |
| `APP_ID` | No | **Sí** | — | Identificador lógico de la app. No es secreto. |
| `APP_SECRET` | No | **Sí** | — | Firma de sesiones de cliente, negocio, reparto y admin. Mínimo 32 caracteres, alta entropía, sin placeholders, distinto de `APP_ID`. |
| `DATABASE_URL` | No | **Sí** | — | PostgreSQL. Debe ser `postgres://` o `postgresql://`, incluir host y nombre de base. En producción se rechazan placeholders. Se recomienda `sslmode=require`. |
| `OWNER_UNION_ID` | No | Recomendada | `""` | `unionId` del admin propietario; si falta se usa el valor local por defecto y se emite un aviso. |
| `ADMIN_EMAIL` | No | **Sí** | — | Email válido y real; se rechazan `example.com`, `admin.com`, `tudominio.com` y similares. |
| `ADMIN_PASSWORD` | No | **Sí** | — | Mínimo 12 caracteres; se rechazan prefijos predecibles (`admin`, `password`, `rapidy`, `quickgo`...) y que sea igual a `APP_SECRET`. Solo se usa para crear el admin si no existe. |
| `ADMIN_NAME` | No | No | `Admin` | Nombre visible del admin. |
| `NEUROCHAT_API_KEY` | No | Sí para OTP productivo | `""` | Sin clave, el envío de OTP falla (no hay fallback en producción). `env.ts` avisa al arrancar, no bloquea. |
| `NEUROCHAT_OTP_FROM` | No | No | `""` | `phone_number_id` o teléfono conectado. |
| `NEUROCHAT_BASE_URL` | No | No | `https://api.neurochat.com.ec/api/v1` | URL `http(s)`; en producción debe ser `https`. |
| `NEUROCHAT_TIMEOUT_MS` | No | No | `8000` | Timeout por intento de OTP, entero 2 000–20 000 ms. Lo acota `server/lib/otp.ts` (no lo valida `env.ts`). |
| `OTP_LENGTH` | No | No | `6` | Entero 4–8. En producción un valor inválido aborta el arranque; en desarrollo se recorta. |
| `OTP_EXPIRY_MINUTES` | No | No | `5` | Entero 1–30. Misma política que `OTP_LENGTH`. |
| `OTP_DEV_FALLBACK` | No | **Prohibida activa** | `false` | Si vale `true`/`1`/`yes`/`on` en producción, el arranque falla. En desarrollo se activa con la variable o automáticamente si no hay `NEUROCHAT_API_KEY`. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | No | `""` | JSON del service account en una línea. Secreto. Si es inválido, `server/lib/firebase.ts` desactiva push con un warning. |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | No | — | Ruta local al JSON de Firebase (Application Default Credentials). El archivo no se commitea. |
| `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` | No | No | — | Proyecto para ADC; solo se consideran si hay una fuente ADC explícita. |
| `LOG_LEVEL` | No | No | `info` | `debug`, `info`, `warn`, `error` o `fatal`; `server/lib/logger.ts`. |
| `LOG_SERVICE` | No | No | `rapidy-api` | Nombre del servicio en los logs. |
| `APP_VERSION` / `GIT_SHA` | No | No | `""` | Versión/revisión incluida en los logs para correlacionar despliegues. |
| `VITE_NOMINATIM_BASE_URL` | No | No | `https://nominatim.openstreetmap.org` | **Pública**: se incrusta en el bundle del navegador. URL base de Nominatim. |
| `VITE_NOMINATIM_EMAIL` | No | No | `""` | **Pública**: email de contacto exigido por la política de Nominatim. |
| `VERCEL` | — | Automática | — | La define Vercel; `server/boot.ts` la usa para no abrir un servidor Node propio. En Docker **no debe definirse**. |

> `render.yaml.bak` está versionado y contiene un `APP_SECRET` de ejemplo
> (`quickgo_dev_secret_...`). No debe usarse en producción; el validador lo
> rechaza. Si ese valor llegó a un entorno real, hay que rotarlo.

### Variables de scripts (no las lee el servidor)

| Grupo | Variables | Notas |
|---|---|---|
| Smoke E2E | `E2E_BASE_URL`, `E2E_OTP_CODE`, `E2E_DRIVER_PHONE`, `E2E_OTHER_DRIVER_PHONE`, `E2E_DRIVER_PASSWORD`, `E2E_DRIVER_ORDER_ID`, `E2E_DRIVER_CHAT_ORDER_ID`, `E2E_MERCHANT_EMAIL`, `E2E_MERCHANT_PASSWORD`, `E2E_CUSTOMER_PHONE`, `E2E_CUSTOMER_ALLOW_WRITES`, `E2E_CUSTOMER_SCREENSHOTS`, `E2E_PRODUCT_ID`, `E2E_DELIVERY_ADDRESS`, `E2E_MAX_QTY`, `E2E_HEADED`, `E2E_IGNORE_HTTPS_ERRORS`, `E2E_ADMIN_ALLOW_WRITES`, `E2E_ADMIN_SCREENSHOTS`, `E2E_ALLOW_REMOTE_DB`, `SMOKE_OUTSIDE_HOST` | Solo desarrollo/staging autorizado. Los `*_ALLOW_WRITES=1` y `E2E_ALLOW_REMOTE_DB=1` habilitan escrituras; nunca en producción real. `E2E_IGNORE_HTTPS_ERRORS=1` solo contra certificados de prueba. |
| Navegador | `CHROME_PATH`, `LOCALAPPDATA`, `ProgramFiles` | Rutas de Chrome/Chromium; `LOCALAPPDATA` y `ProgramFiles` las provee Windows. |
| Healthcheck | `HEALTH_BASE_URL`, `HEALTH_PATH`, `HEALTH_TIMEOUT_MS`, `HEALTH_MAX_LATENCY_MS` | `scripts/production-health-smoke.mjs`; defaults `/api/health`, 10 s, 2 s. |
| Carga | `LOAD_TEST_BASE_URL`, `LOAD_TEST_COOKIE` | `scripts/load-test.mjs`; la cookie es una sesión real, no commitearla. |
| Respaldos | `BACKUP_DATABASE_URL`, `BACKUP_DIR`, `BACKUP_FORMAT`, `PGPASSWORD`, `RESTORE_CHECK_ADMIN_URL`, `RESTORE_CHECK_TIMEOUT_MS` | `scripts/db-backup.mjs` y `db-restore-check.mjs`; `BACKUP_DATABASE_URL` permite saltar el pooler y `PGPASSWORD` es de libpq. Ver `docs/production/BACKUP_DR.md`. |

## Reglas de validación en producción

`server/lib/env.ts` aborta el arranque si:

- falta `APP_ID`, `APP_SECRET`, `DATABASE_URL`, `ADMIN_EMAIL` o `ADMIN_PASSWORD`;
- `APP_SECRET` tiene menos de 32 caracteres, poca entropía, es igual a `APP_ID`
  o contiene marcadores como `change_me`, `example`, `your_jwt`, `secret_here`;
- `DATABASE_URL` no es una URL PostgreSQL válida, no incluye base de datos o
  contiene placeholders (`user:pass@`, `host:port`, `example.com`);
- `ADMIN_EMAIL` no tiene formato de email o usa un dominio de ejemplo;
- `ADMIN_PASSWORD` tiene menos de 12 caracteres, es predecible o coincide con
  `APP_SECRET`;
- `NEUROCHAT_BASE_URL` no es `http(s)` o no usa `https`;
- `OTP_LENGTH` no es entero 4–8, `OTP_EXPIRY_MINUTES` no es entero 1–30, o
  `OTP_DEV_FALLBACK` está activo.

Además, en producción `env.otpDevFallback` siempre es `false`, aunque la
variable falte. Sin `NEUROCHAT_API_KEY`, `sendOtp` responde
`PRECONDITION_FAILED` en lugar de generar códigos locales.

## Generación de secretos

```bash
# APP_SECRET (64 hex = 32 bytes)
openssl rand -hex 32

# Alternativa sin OpenSSL
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Usar un valor distinto por entorno (dev/staging/producción).
- `ADMIN_PASSWORD`: generarla con un gestor de contraseñas; mínimo 12
  caracteres, idealmente 20+.
- No reutilizar la contraseña de la base de datos, la del admin ni la API Key
  de NeuroChat.
- Guardar los valores en el gestor de secretos; `.env.example` solo lleva
  placeholders.

## Rotación de secretos

| Secreto | Procedimiento | Efecto |
|---|---|---|
| `APP_SECRET` | Generar uno nuevo → actualizar el gestor → redeploy → verificar login de los 4 roles → destruir el valor anterior. | Invalida **todas** las sesiones (access y refresh) de cliente, negocio, reparto y admin. Rotar en horario de baja actividad y avisar. No hay soporte de doble clave. |
| `DATABASE_URL` | Crear usuario/contraseña nuevos en PostgreSQL → actualizar variable → redeploy → verificar conexión y lecturas → revocar credencial anterior. | El pool toma la nueva cadena al reiniciar el proceso. No imprimir la URL en logs ni pasarla como argumento de build. |
| `ADMIN_PASSWORD` | Crear un admin nuevo o actualizar el hash bcrypt mediante un script controlado; cambiar la variable **no** actualiza un admin existente. | No hay reset de contraseña de admin en la UI (pendiente conocido). Documentar el cambio y auditar. |
| `NEUROCHAT_API_KEY` | Crear una clave nueva con scope `otp` → actualizar → probar un OTP real → revocar la clave vieja. | Sin downtime si ambas claves coexisten durante la ventana de cambio. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Crear una clave nueva del service account → actualizar el JSON → verificar un push → eliminar la clave vieja en Firebase. | Las claves viejas deben quedar revocadas. |

Regla general ante una filtración: rotar de inmediato, revisar logs de acceso,
invalidar sesiones (`APP_SECRET`) y documentar fecha, causa y alcance.

## Qué NO commitear

Ya están cubiertos por `.gitignore` (verificar con `git check-ignore -v .env`):

- `.env`, `.env.local`, `.env.*.local` y cualquier variante con valores reales.
- `APP_SECRET`, `ADMIN_PASSWORD`, `DATABASE_URL` con credenciales,
  `NEUROCHAT_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `firebase-adminsdk.json` y el archivo apuntado por
  `GOOGLE_APPLICATION_CREDENTIALS`.
- Cookies/tokens capturados en screenshots, storage state de Playwright,
  `dist/`, `.vercel/`, `*.tsbuildinfo` y logs.

`.env.example` es el único archivo de entorno versionado y **nunca** debe
contener valores reales. Si una variable nueva se agrega al código, se añade
aquí con su placeholder y su marca de obligatoriedad.

> **Hallazgo:** el `.gitignore` actual cubre `.env`, `.env.local` y
> `.env.*.local`, pero **no** `.env.production` ni `.env.staging`. Esos archivos
> deben mantenerse fuera del repo; conviene ampliar la regla a `.env*` con
> `!.env.example` (archivo compartido: no se edita en este frente). `.dockerignore`
> sí excluye `.env` y `.env.*`.

## Checklist de despliegue

- [ ] `NODE_ENV=production` definido por la plataforma.
- [ ] `APP_ID`, `APP_SECRET`, `DATABASE_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`
      cargados desde el gestor de secretos.
- [ ] `APP_SECRET` generado para producción (32+ caracteres, sin placeholders).
- [ ] `DATABASE_URL` con SSL y usuario de permisos mínimos; base respaldada.
- [ ] `NEUROCHAT_API_KEY` cargada y un OTP de prueba enviado.
- [ ] `OTP_DEV_FALLBACK` ausente o `false`.
- [ ] `APP_ORIGIN`/`TRUSTED_ORIGINS` definidos si el front o el dominio cambian.
- [ ] `GET /api/health` responde `200 {"status":"ok"}`.
- [ ] Firebase configurado solo si se usarán push.
- [ ] `git check-ignore -v .env` confirma que `.env` está ignorado y que
      `.env.production`/`.env.staging` no están trackeados.
- [ ] Búsqueda de secretos en el diff antes de publicar.

## Verificación manual (sin build ni migraciones)

```powershell
# 1. Typecheck del servidor (no genera artefactos)
npx tsc --noEmit -p tsconfig.server.json

# 2. Fail-fast: vaciar en process.env ANTES de importar evita que dotenv
#    recargue los valores de .env. Debe listar las cinco variables y abortar.
$env:NODE_ENV="production"
npx tsx -e "Object.assign(process.env,{APP_ID:'',APP_SECRET:'',DATABASE_URL:'',ADMIN_EMAIL:'',ADMIN_PASSWORD:'',OTP_DEV_FALLBACK:'false'}); import('./server/lib/env.ts').then(()=>console.log('INESPERADO: arrancó')).catch(e=>console.log(e.message))"

# 3. Fallback prohibido: con el resto válido, OTP_DEV_FALLBACK=true debe fallar.
$env:NODE_ENV="production"
npx tsx -e "Object.assign(process.env,{APP_ID:'rapidy-app',APP_SECRET:'0123456789abcdef'.repeat(4),DATABASE_URL:'postgresql://rapidy:test@db.rapidy.app:5432/rapidy',ADMIN_EMAIL:'ops@rapidy.app',ADMIN_PASSWORD:'TestOnly#2026!x',OTP_DEV_FALLBACK:'true'}); import('./server/lib/env.ts').then(()=>console.log('INESPERADO: arrancó')).catch(e=>console.log(e.message))"
```

Los valores del paso 3 son solo de prueba. Abrir una terminal nueva después de
las pruebas negativas para no contaminar el entorno. En desarrollo,
`npm run dev` debe seguir arrancando sin `APP_SECRET` y mostrar el código OTP en
consola cuando no haya `NEUROCHAT_API_KEY`.