# Frente 6 — OTP / WhatsApp (NeuroChat)

Estado: implementado y pendiente de validación con credenciales reales de NeuroChat.
Archivos: `server/lib/otp.ts`, `server/customer-router.ts`, este documento.

## 0. Hallazgos corregidos

- Las llamadas a NeuroChat no tenían timeout ni reintento acotado.
- Los fallos del proveedor reenviaban su mensaje crudo al cliente.
- El fallback de desarrollo imprimía teléfono y código en consola, y podía
  quedar activo en producción si `OTP_DEV_FALLBACK=true`.
- Los envíos fallidos no dejaban fila: se podía evadir el rate limit cuando el
  proveedor estaba caído.
- El incremento de intentos no era atómico ante verificaciones concurrentes.
- Un `otpId` de desarrollo podía verificar en producción si existían filas
  viejas.

## 1. Flujo actual

1. `customer.requestOtp({ phone, purpose })` normaliza el teléfono a dígitos E.164
   (`normalizePhone`) y aplica el rate limit antes de llamar al proveedor.
2. Rate limit persistido en `otp_verifications`:
   - 3 solicitudes por teléfono cada 10 minutos.
   - 45 segundos de espera entre solicitudes del mismo teléfono.
   - 20 solicitudes por IP cada hora (`x-forwarded-for` primero, luego `x-real-ip`).
   - Los envíos fallidos se guardan como `send_failed` y también cuentan para el
     límite; así una caída del proveedor no permite martillarlo.
   - El límite por IP confía en que el proxy del despliegue sobrescriba
     `x-forwarded-for`; si no lo hace, ese límite es evitable (el límite por
     teléfono sigue vigente).
3. `sendOtp(phone)`:
   - Con `NEUROCHAT_API_KEY`: `POST {NEUROCHAT_BASE_URL}/otp/send` con
     `to`, `length`, `expiry`, `from?` y header `x-api-key`.
   - Sin API Key y con fallback de desarrollo habilitado: genera un OTP local,
     lo hashea con bcrypt y lo devuelve como `devCode` **solo en la respuesta**.
   - Sin API Key en producción (o en staging/NODE_ENV ausente): error
     `PRECONDITION_FAILED` claro. Nunca se emite un OTP local.
4. Se inserta la fila `pending` en `otp_verifications` con `otpId`, `expiresAt`,
   `provider`, `purpose`, `ip` y `codeHash` (solo fallback dev).
5. `customer.verifyOtp({ phone, otpId, code })`:
   - Rechaza ids `local:` en producción aunque existieran filas viejas.
   - Busca una fila `pending` por teléfono + `otpId`.
   - Si expiró, la marca `expired` y responde «El código expiró».
   - Incremento **atómico** de intentos (`attempts < 3` en el `UPDATE`), por lo
     que dos verificaciones concurrentes no superan los 3 intentos.
   - Fallback dev: compara el hash local. Producción: `POST /otp/verify`.
   - Éxito: marca `verified` + `consumedAt`, crea cookies de cliente existente o
     un `registrationToken` para registro. El contrato de respuesta no cambió.
6. Expiración: `OTP_EXPIRY_MINUTES` (1–30, por defecto 5). Se respeta el
   `expires_at` del proveedor si viene válido (ISO, epoch s/ms), sin superar
   nunca el tope local `OTP_EXPIRY_MINUTES`; si no, se calcula localmente. La
   fila se marca `expired` de forma perezosa al intentar verificarla.

Estados en base: `pending`, `verified`, `expired`, `failed`, `send_failed`.

## 2. Timeout y reintentos

| Operación | Intentos | Se reintenta | No se reintenta |
|---|---|---|---|
| `/otp/send` | 2 (1 reintento) | 502/503/504 y error de red | 4xx, 429, timeout, respuesta inválida |
| `/otp/verify` | 1 | — | siempre (cada intento puede consumir un intento del proveedor) |

- Timeout por intento: 8 s por defecto; configurable con
  `NEUROCHAT_TIMEOUT_MS` entre 2 000 y 20 000 ms. Se lee en `otp.ts` porque
  `server/lib/env.ts` no pertenece a este frente.
- Backoff del reintento: 400 ms, o `Retry-After` si existe, con tope de 2 s.
- Un timeout de envío **no** se reintenta para evitar dos WhatsApp con códigos
  distintos. Si el proveedor llegara a ofrecer idempotency key, usarla y
  habilitar el reintento de timeout.
- Un reintento de envío puede producir dos mensajes (fallo de red después de
  que el proveedor procesó el primero). Es un riesgo acotado y documentado; la
  base guarda el `otpId` del segundo envío, por lo que el primer código puede
  fallar. El rate limit limita el impacto.
- Timeout total percibido por el usuario: hasta ~16 s + backoff en el peor caso.

## 3. Errores hacia el cliente

No se reenvía nunca el mensaje crudo del proveedor (puede contener datos del
teléfono). Mensajes estables:

| Condición | Código tRPC | Mensaje |
|---|---|---|
| 429 / `RATE_LIMIT_OTP_SEND` | `TOO_MANY_REQUESTS` | Espera un minuto antes de pedir otro código |
| Cuota / suscripción / 401 / 403 | `FORBIDDEN` | Servicio de códigos no disponible; contacta a soporte |
| `NO_PHONE_NUMBER`, `SENDER_NOT_FOUND`, `TEMPLATES_NOT_APPROVED` | `PRECONDITION_FAILED` | No pudimos enviar por WhatsApp; intenta más tarde |
| 5xx o error de red agotado | `SERVICE_UNAVAILABLE` | Servicio de WhatsApp no disponible; reintenta |
| Timeout agotado | `GATEWAY_TIMEOUT` | El servicio tardó demasiado; reintenta |
| Respuesta sin `otp_id` | `BAD_GATEWAY` | Respuesta inválida del proveedor |
| Sin API Key en producción | `PRECONDITION_FAILED` | Verificación por WhatsApp no configurada |

## 4. Dependencia de NeuroChat

- API Key con scope `otp`, **solo backend** (`x-api-key`). No exponerla al frontend.
- `NEUROCHAT_OTP_FROM` es opcional; si falta se usa el número/línea por defecto.
- Contrato asumido: envelope `{ success, data, error? }`; envío devuelve
  `data.otp_id` y `data.expires_at`; verificación devuelve `data.valid`,
  `data.status` y opcionalmente `data.attempts_left`. Validar contra la
  documentación vigente y una cuenta real antes del go-live.
- Requisitos operativos del proveedor: saldo/suscripción activa, sender
  conectado, plantilla aprobada y número destino con WhatsApp.
- Red: el servidor debe poder salir a `https://api.neurochat.com.ec` (o al
  `NEUROCHAT_BASE_URL` configurado). Un firewall/proxy mal configurado se ve
  como `SERVICE_UNAVAILABLE`.
- Rotación de API Key: actualizar el secreto en la plataforma y reiniciar el
  servicio; no requiere migración.

## 5. Monitoreo y alertas

No se registran teléfonos, códigos OTP, `codeHash`, `otpId` ni payloads. Los
logs nuevos solo incluyen: operación, HTTP status, código de error del
proveedor e intento. Ejemplo:

```
[OTP] fallo de NeuroChat en /otp/send (HTTP 503, intento 1)
[OTP] fallo de NeuroChat en /otp/verify (sin respuesta código TIMEOUT, intento 1)
```

Métricas recomendadas (instrumentar en el APM/logger del despliegue):

- solicitudes `requestOtp` por resultado (`sent`, `rate_limited`, `provider_error`);
- latencia p50/p95 de `/otp/send` y `/otp/verify`;
- tasa de timeout, error de red, 5xx, 429 y 401/403 del proveedor;
- verificaciones correctas/incorrectas y filas `send_failed`;
- OTP `pending` vencidos y antigüedad de la tabla.

Alertas sugeridas: más de 5 % de fallos de envío en 5 min; cualquier 401/403
del proveedor (clave o configuración); p95 > 5 s; picos de 429; `send_failed`
sostenido. `/api/health` no consulta NeuroChat: no usar OTP reales como canary.

## 6. Plan B si el proveedor falla

1. Confirmar en logs el tipo de fallo (timeout, 5xx, 401/403, cuota, sender).
2. Revisar estado/saldo de NeuroChat, API Key, sender y plantilla.
3. Si es 401/403: rotar/corregir la clave y reiniciar. Si es cuota: contactar
   al proveedor o habilitar plan superior.
4. **No** activar `OTP_DEV_FALLBACK` en producción: el arranque falla a
   propósito. Tampoco se permite un login manual sin OTP.
5. Si la caída es prolongada: comunicar mantenimiento, mantener la sesión de
   clientes ya autenticados y reintentar más tarde. Un proveedor secundario o
   una cola de envíos no están implementados; requeriría un adaptador nuevo en
   `server/lib/otp.ts` y definir su contrato.
6. Rollback: volver a la versión anterior. Las filas y estados actuales son
   compatibles; no hay migración en este frente.

## 7. Fallback de desarrollo

- Se habilita solo si `OTP_DEV_FALLBACK=true` **y** `NODE_ENV=development` o
  `test` **y** `NODE_ENV` no es `production`.
- En producción, `OTP_DEV_FALLBACK=true` impide el arranque (fail-fast,
  coincide con `.env.example`; lo valida `env.ts` y se refuerza en `otp.ts`).
- El `devCode` se devuelve en la respuesta tRPC y se muestra en la UI como modo
  desarrollo; no se imprime en consola.
- Un `otpId` con prefijo `local:` se rechaza siempre en producción.

## 8. Pruebas

### Unitarias existentes

```bash
npx vitest run server/lib/otp.test.ts
```

### Fallback local (sin API Key)

```env
NODE_ENV=development
OTP_DEV_FALLBACK=true
# NEUROCHAT_API_KEY vacío
```

- `requestOtp` devuelve `channel: "dev"` y `devCode`.
- Verificar código correcto crea sesión; código incorrecto descuenta intentos
  hasta 3 y luego pide uno nuevo.
- Con `OTP_EXPIRY_MINUTES=1`, esperar > 1 min y comprobar «El código expiró».

### Proveedor real / staging

```bash
E2E_OTP_CODE=123456 node scripts/e2e-smoke.mjs
```

- `E2E_OTP_CODE` debe ser el código leído del WhatsApp del número de prueba.
  Sin él, el script solo funciona con el `devCode` visible en desarrollo.
- El script borra `otp_verifications` al inicio: **no ejecutarlo contra
  producción**.
- Con `NEUROCHAT_API_KEY` configurada, la UI no muestra `devCode`; si no se
  define `E2E_OTP_CODE`, el smoke test falla a propósito.

### Casos negativos recomendados

1. **Rate limit**: 3 solicitudes al mismo teléfono; la 4.ª debe ser 429; una
   segunda solicitud antes de 45 s también.
2. **Intentos concurrentes**: dos `verifyOtp` simultáneos con código incorrecto;
   entre ambos no debe superar 3 intentos locales.
3. **Proveedor caído**: apuntar `NEUROCHAT_BASE_URL` a un host inaccesible;
   verificar 503 claro, un solo reintento y fila `send_failed`.
4. **Timeout**: bajar `NEUROCHAT_TIMEOUT_MS` a 2000 contra un endpoint lento;
   verificar `GATEWAY_TIMEOUT` sin reintento de envío.
5. **Producción sin clave**: `NODE_ENV=production` sin `NEUROCHAT_API_KEY`;
   `requestOtp` debe fallar con `PRECONDITION_FAILED`.
6. **Fallback prohibido**: `NODE_ENV=production` + `OTP_DEV_FALLBACK=true`;
   el proceso debe fallar al arrancar.
7. **Sin PII en logs**: revisar que no aparezcan teléfono, código, `otpId` ni
   `codeHash` en consola/APM.

## 9. Pendientes y archivos compartidos

- Añadir `NEUROCHAT_TIMEOUT_MS` a `.env.example` y a la validación de
  `server/lib/env.ts` (archivos no asignados a este frente).
- Programar limpieza periódica de `otp_verifications` antiguas (`verified`,
  `expired`, `failed`, `send_failed`); hoy no existe job y la tabla solo se
  limpia en el smoke test. No requiere migración para funcionar, pero sí una
  tarea programada.
- Instrumentación de métricas/APM y alertas: hoy solo hay logs estructurados
  sin PII.
- Evaluar idempotency key del proveedor y un segundo proveedor para el plan B.
- Evaluar CAPTCHA/protección anti-bot para `requestOtp` si aparece abuso por
  teléfonos rotativos.
- Validar contrato real de NeuroChat y entrega de WhatsApp en staging antes de
  declarar el frente cerrado.