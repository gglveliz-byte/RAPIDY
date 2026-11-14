# Autenticación y sesión — smoke de producción

Fecha de verificación: 2026-11-13
Script: `scripts/production-auth-smoke.mjs`
Alcance: login, cookies, `checkAuth`, aislamiento entre roles, refresh y logout de
admin, merchant y driver. No cubre cliente/OTP (otro frente).

## Ejecución

Requisitos:

- Servidor ya levantado en `http://localhost:3000` (no lo reinicia).
- `.env` con `DATABASE_URL` válido; el script crea y elimina sus propios datos.
- `E2E_BASE_URL` opcional si el servidor está en otra URL.
- `SMOKE_OUTSIDE_HOST` opcional para cambiar el host externo simulado
  (por defecto `auth-smoke.example.test`).

```powershell
node scripts/production-auth-smoke.mjs
```

No ejecuta migraciones ni `db:push`, no modifica código de auth y no reinicia el
servidor. Sale con código 1 si alguna comprobación falla.

## Datos temporales

El script inserta, con contraseña bcrypt aleatoria:

- Un usuario `admin` con email `auth-smoke-admin-<timestamp>@example.test`.
- Un usuario `merchant` con email `auth-smoke-merchant-<timestamp>@example.test`.
- Un driver `Smoke Auth Driver` con teléfono aleatorio de 10 dígitos.

Todo se elimina en el bloque `finally`. Si el proceso se interrumpe de forma
abrupta, los restos se pueden limpiar con:

```sql
delete from drivers where name = 'Smoke Auth Driver';
delete from users where email like 'auth-smoke-%@example.test';
```

No se usan las credenciales reales de `ADMIN_EMAIL`/`ADMIN_PASSWORD`, para no
revocar la sesión del administrador que esté usando el panel.

## Cobertura

| Bloque | Comprobaciones |
| --- | --- |
| Anónimo | 401 en `admin.dashboard`, `commerce.me`, `driver.getProfile`; `checkAuth` responde `authenticated:false` |
| Login | admin/merchant/driver con sus credenciales temporales |
| Cookies locales | `HttpOnly`, sin `Secure`, `SameSite=Lax`, `Path=/` |
| Cookies externas | `HttpOnly` + `Secure` con `X-Forwarded-Host` externo y `X-Forwarded-Proto: https` |
| `checkAuth` | rol e id correctos para cada sesión |
| Endpoint protegido | cada rol accede solo a su endpoint |
| Aislamiento | 6 combinaciones rol → endpoint ajeno devuelven 401; el login de un rol borra las cookies del rol anterior |
| Refresh | `login.refresh` para los 3 roles con solo la cookie de refresh; `admin.refresh` con sesión vigente |
| Logout | borra cookies con `Max-Age=0`, invalida el access anterior y `login.refresh` |
| Revocación de refresh | reintento del refresh sin access token y `admin.refresh` después del logout |

Resultado observado: **46/49 PASS**, 3 fallos que corresponden a un mismo
defecto de revocación (ver abajo). El script termina con código 1 a propósito
hasta que se corrija.

## Hallazgo P1 — el logout no revoca el refresh de admin/merchant

Evidencia de ejecución:

```text
FAIL Logout admin no reemite sesión con refresh revocado — check=false/true set-cookie=access,refresh
FAIL Logout admin invalida admin.refresh — success=true
FAIL Logout merchant no reemite sesión con refresh revocado — check=false/true set-cookie=access,refresh
```

### Causa 1: refresco transparente en el contexto antes de validar la versión

- `server/context.ts:94-100` (admin): si falta el access token, verifica el
  refresh, asigna `adminId` y llama a `setAdminCookie(...)`.
- La comparación de `sessionVersion` ocurre después, en
  `server/context.ts:109-113`. Para entonces ya se emitieron cookies nuevas.
- `server/context.ts:175-185` (merchant) hace lo mismo y recién compara la
  versión en `server/context.ts:194-198`.
- El camino de driver sí es seguro porque llama a `refreshDriverAccessToken`,
  que valida la versión antes de firmar (`server/driver-auth.ts:119-134`,
  usado en `server/context.ts:137-139`).

Secuencia reproducible:

1. Login de admin.
2. `login.logout` con `scope:"admin"` (incrementa `session_version`).
3. `GET /api/trpc/login.checkAuth` enviando **solo** la cookie
   `quickgo_admin_refresh` anterior.
4. La respuesta devuelve `authenticated:false`, pero incluye `Set-Cookie` con
   `quickgo_admin_token` y `quickgo_admin_refresh` nuevos, firmados con la
   versión actual.
5. Un segundo `checkAuth` con esas cookies devuelve `authenticated:true`.

Impacto: quien conserve una copia del refresh cookie puede resucitar la sesión
después del logout. La revocación por `session_version` no se cumple para
admin ni merchant. El mismo patrón aplica al refresco del contexto en cada
request, no solo a `checkAuth`.

Corrección sugerida (no aplicada: el archivo no pertenece a este frente):
validar `payload.sessionVersion` contra la versión actual en base de datos
antes de llamar a `setAdminCookie`/`setMerchantCookie`, igual que hace
`refreshDriverAccessToken`.

### Causa 2: `admin.refresh` ignora `session_version`

- `server/admin-router.ts:32-47`: usa `verifyAdminRefreshToken`, que solo
  devuelve el `userId` (`server/admin-auth.ts:92-94`), y llama directamente a
  `setAdminCookie` sin comparar la versión.
- Por eso, después del logout, `admin.refresh` con el refresh anterior
  devuelve `success:true` y emite cookies válidas.

Corrección sugerida: usar `verifyAdminRefreshTokenPayload` y comparar
`sessionVersion` con `users.session_version` antes de renovar, o delegar en la
lógica de `login.refresh`.

## Observaciones de despliegue (no son fallos del smoke)

- La decisión de `Secure` depende de `X-Forwarded-Host` y
  `X-Forwarded-Proto` (`server/lib/cookies.ts:3-44`); `SameSite` es `Lax` fijo.
  El proxy debe sobrescribir esas cabeceras, no confiar en las que envíe el
  cliente; de lo contrario un cliente puede forzar la rama no segura.
- Las cookies de borrado de `clearAdminCookie`, `clearMerchantCookie` y
  `clearDriverCookies` no incluyen `Secure` ni `SameSite`
  (`server/admin-auth.ts:130-132`, `server/merchant-auth.ts:129-131`,
  `server/driver-auth.ts:114-116`). El navegador las elimina igual porque
  coinciden nombre y `Path`, pero conviene alinearlas con las cookies de sesión
  para escáneres y consistencia.
- El smoke simula el proxy con `X-Forwarded-Host: auth-smoke.example.test` y
  `X-Forwarded-Proto: https` cuando `E2E_BASE_URL` no es HTTPS (por defecto,
  `http://localhost:3000`). Si se ejecuta contra una URL HTTPS real, no envía
  esas cabeceras y valida el `Set-Cookie` real.

## Verificación esperada tras corregir

```powershell
node scripts/production-auth-smoke.mjs
# RESULT 49/49 PASS, exit code 0
```

Mientras el defecto P1 siga presente, el resultado esperado es `46/49` con los
tres FAIL indicados.