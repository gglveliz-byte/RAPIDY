# Seguridad HTTP y de sesión — Rapidy

Documento del Frente 4 (hardening HTTP/sesión). Aplica a `server/boot.ts`,
`server/lib/cookies.ts` y a la postura que debe verificarse antes de exponer el
dominio. No sustituye al checklist de despliegue general.

## 1. Cabeceras de respuesta

Se aplican en el middleware global de `server/boot.ts` a todo lo que pasa por
Hono (API, HTML y estáticos en el servidor Node de producción).

| Cabecera | Valor | Notas |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Solo en producción y fuera de loopback. Sin `preload` hasta que todos los subdominios sean HTTPS. |
| `X-Frame-Options` | `DENY` | Evita clickjacking; complementado por `frame-ancestors 'none'`. |
| `X-Content-Type-Options` | `nosniff` | Sin cambios. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sin cambios. |
| `Content-Security-Policy` | ver abajo | Cerrada respecto de `img-src https:`; ya no se permite cualquier HTTPS. |

### CSP efectiva

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob:
  https://tile.openstreetmap.org https://*.tile.openstreetmap.org
  https://images.unsplash.com https://plus.unsplash.com
  https://picsum.photos https://fastly.picsum.photos
  https://upload.wikimedia.org https://unpkg.com https://*.supabase.co;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co
  https://nominatim.openstreetmap.org;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none'; frame-src 'none'; frame-ancestors 'none';
base-uri 'self'; form-action 'self';
```

- `'unsafe-inline'` en `script-src` es necesario porque `index.html` tiene el
  script inline que elige el manifest y el registro del service worker. Para
  retirarlo hacen falta hashes/nonces y editar `index.html` (archivo no asignado
  a este frente).
- OSM: las teselas se piden a `*.tile.openstreetmap.org` y se muestran como
  imagen; Nominatim solo en `connect-src`. No se abre `https:` completo.
- `img-src` es una allowlist. Si un comercio pega una URL de imagen de un host
  nuevo, la imagen no cargará hasta añadirlo aquí. Alternativa recomendada:
  almacenar en Supabase Storage. No volver a `img-src https:`.
- Revisar la política de uso de Nominatim/OSM antes de escalar: la instancia
  pública no es un geocoder de producción de alto volumen.

## 2. CSRF

Postura: **same-origin + validación de `Origin`/`Referer` en mutaciones de
tRPC**. No hay token CSRF adicional.

- Se valida todo método no seguro (`POST`, `PUT`, `PATCH`, `DELETE`) bajo
  `/api/trpc/*`. `GET`/`HEAD`/`OPTIONS` (queries, SSE, health) no se tocan.
- Se acepta `Origin`; si falta, se usa `Referer`. El host debe coincidir con el
  host efectivo del request (`Host`/`X-Forwarded-Host`).
- Orígenes extra permitidos: `APP_ORIGIN` y `TRUSTED_ORIGINS`
  (coma-separados, con esquema). Útil para migrar de dominio o para un front
  separado durante una transición.
- En desarrollo (`NODE_ENV !== "production"`) se permite cualquier
  `localhost`/`127.0.0.1`/`[::1]`, con cualquier puerto, y peticiones sin
  `Origin` si el host es loopback (curl/scripts locales).
- En producción, una mutación sin `Origin` ni `Referer` se rechaza con
  `403 {"error":"Origen no permitido"}`. `Origin: null` también se rechaza.
- La WebView de Capacitor carga el dominio remoto, por lo que es same-origin y
  sigue funcionando. Un cliente nativo que llame a la API desde otro origen
  deberá declararse en `TRUSTED_ORIGINS`.
- El guardia se apoya además en cookies `SameSite=Lax`, que impiden enviar la
  sesión en POST cross-site. No bajar a `SameSite=None` sin un motivo explícito
  y sin volver a evaluar CSRF.

## 3. CORS

No hay middleware CORS y no se emite `Access-Control-Allow-Origin`. El navegador
solo puede llamar a la API desde el mismo origen; las peticiones cross-origin
fallan en el preflight. Esto es intencional.

Si en el futuro se necesita un front separado:

1. Añadir allowlist explícita (nunca `*` ni reflejar cualquier origen).
2. Mantener `Access-Control-Allow-Credentials: true` solo para esos orígenes.
3. Añadir los mismos orígenes a `TRUSTED_ORIGINS` para el guardia CSRF.
4. Revisar la CSP del front (no se hereda de la API).

## 4. Cookies de sesión

Implementadas en `server/lib/cookies.ts`:

| Atributo | Valor |
| --- | --- |
| `HttpOnly` | Siempre. |
| `Path` | `/`. |
| `SameSite` | `Lax` (antes `None` fuera de localhost). |
| `Secure` | Producción: `true` salvo loopback. Desarrollo: `true` solo si el request es HTTPS (incluye `X-Forwarded-Proto`). |
| `Domain` | No se define: cookie host-only. |

Cookies: `quickgo_token`/`refresh_token` (cliente),
`quickgo_driver_token`/`quickgo_driver_refresh` (repartidor),
`quickgo_merchant_token`/`quickgo_merchant_refresh` (comercio),
`quickgo_admin_token`/`quickgo_admin_refresh` (admin).

- En producción, si el proxy no informa HTTPS, la cookie se marca `Secure` y el
  navegador la rechaza (falla cerrado). Configurar TLS y `X-Forwarded-Proto`.
- El dominio debe servirse por HTTPS; el HTTP solo se tolera en loopback para
  smoke tests locales.
- Las funciones de borrado de admin/driver/merchant viven en
  `server/*-auth.ts` (no asignados) y emiten `Max-Age=0` sin `Secure/SameSite`.
  No impide borrar la cookie, pero conviene homologarlas a
  `getSessionCookieOptions` en otro frente.
- No se guardan tokens en `localStorage`; la sesión va por cookie HttpOnly.

## 5. Límite de body

- Límite global: **20 MB** (`MAX_BODY_BYTES` permite override). Antes: 50 MB.
- Margen: comprobante de transferencia máx. 7.5 MB como data URL; imágenes de
  producto/logo/portada máx. 2 MB cada una.
- El límite es por request. No sustituye cuotas de subida ni rate limiting.
- Los endpoints SSE no tienen body y no se ven afectados.

## 6. Rate limits existentes

- OTP (`server/customer-router.ts`): 3 códigos/10 min por teléfono, 20/hora por
  IP y cooldown de 45 s. Persistido en `otp_verifications`.
- Login (`server/login-router.ts`): 8 fallos/10 min por IP+identificador y
  bloqueo de 15 min. En memoria del proceso.
- No hay rate limit global por IP para el resto de tRPC. En serverless el mapa
  de login no se comparte entre instancias. **Pendiente recomendado:** rate
  limit en el edge/proxy (por IP y por ruta) y almacenamiento compartido para
  login/OTP si hay varias réplicas.
- `X-Forwarded-For` se usa para identificar IP; asegurarse de que el proxy
  borra/reescribe la cabecera del cliente y no se confía en ella directo.

## 7. Health check

`GET /api/health` responde `200 {"status":"ok"}` con `Cache-Control: no-store`.
No consulta la base de datos, no expone versión, uptime, entorno ni secretos.
Es liveness, no readiness: no usarlo para decidir si la DB está lista.

## 8. Pendientes en archivos no asignados

- `vercel.json`: los estáticos de Vercel no pasan por Hono, así que las
  cabeceras de seguridad no llegan al HTML/CDN. Añadir un bloque `headers` con
  HSTS (solo tras validar HTTPS), CSP, XFO, nosniff y Referrer-Policy, o servir
  todo tras el edge que las inyecte.
- `index.html`: scripts inline impiden quitar `'unsafe-inline'` de `script-src`
  (requiere hashes/nonces).
- `server/admin-auth.ts`, `server/driver-auth.ts`, `server/merchant-auth.ts`:
  homologar cookies de borrado con `getSessionCookieOptions`.
- `.env.example`: documentar `APP_ORIGIN`, `TRUSTED_ORIGINS` y
  `MAX_BODY_BYTES` cuando se definan en el despliegue.

## 9. Checklist antes de exponer el dominio

1. `APP_SECRET` único de ≥32 caracteres y `ADMIN_PASSWORD` ≥12; sin valores de
   ejemplo. Confirmar que `.env` no está en el repo.
2. TLS válido y redirección 301/308 de HTTP a HTTPS en el proxy/CDN.
3. Proxy enviando `Host`, `X-Forwarded-Host` y `X-Forwarded-Proto: https`.
4. Probar `GET /api/health` (200, sin datos sensibles).
5. Probar login cliente, comercio, repartidor y admin; verificar en DevTools que
   las cookies salen `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
6. Probar una mutación tRPC con `Origin` correcto (debe funcionar) y con
   `Origin: https://evil.example` (debe dar 403). Probar también `curl` sin
   `Origin` en producción: 403 esperado.
7. Probar SSE de pedido, comercio, driver y admin (deben seguir abiertos y
   autenticados; el guardia CSRF no aplica a GET).
8. Verificar mapas: teselas OSM, geocodificación Nominatim y logos/imágenes.
9. Confirmar CSP en la respuesta HTML real (no solo en `/api`); si se despliega
   en Vercel, aplicar el bloque `headers` pendiente.
10. Activar rate limiting de borde para `/api/trpc` y `/api/events/*`; revisar
    límites de OTP/login con tráfico real.
11. Revisar logs: sin tokens, cookies, passwords, códigos OTP ni datos de pago.
12. Backups y plan de rotación de secretos/tokens antes del go-live.

## 10. Cómo verificar rápido

```bash
# Liveness
curl -i https://TU_DOMINIO/api/health

# Mutación sin Origin: 403 en producción
curl -i -X POST https://TU_DOMINIO/api/trpc/login.logout

# Mutación con Origin correcto: llega a tRPC (200/401 según sesión)
curl -i -X POST https://TU_DOMINIO/api/trpc/login.logout \
  -H "Origin: https://TU_DOMINIO"

# Cabeceras de la API
curl -sI https://TU_DOMINIO/api/health
```

No se reinició `localhost:3000` ni se ejecutó build durante este frente.