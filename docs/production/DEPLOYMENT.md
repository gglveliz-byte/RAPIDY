# Despliegue en producción — Rapidy

Runbook del frente 2 (despliegue real). La imagen es un único contenedor Node 20
que sirve la SPA, la API tRPC y los streams SSE. El TLS lo termina un reverse
proxy delante del contenedor.

Inventario completo de variables: `docs/production/ENVIRONMENT.md`. Postura de
seguridad, cookies y CSRF: `docs/production/SECURITY.md`. OTP: `OTP.md`.

> Este documento no ejecuta nada por sí solo. Los comandos son para el operador.
> En este frente no se ejecutaron `docker`, builds ni migraciones.

## 1. Arquitectura de la imagen

```
Internet :443 (HTTPS)
        │
        ▼
reverse proxy (nginx/Caddy, TLS)
        │  HTTP/1.1 127.0.0.1:3000
        ▼
contenedor rapidy  (node dist/boot.js, uid 1001, NODE_ENV=production)
        ├── dist/public        SPA compilada por Vite + assets de public/
        ├── /api/trpc/*        API tRPC (Hono)
        ├── /api/events/*      SSE (Hono streamSSE)
        └── PostgreSQL         vía DATABASE_URL (pool de pg)
```

`server/boot.ts` solo arranca el servidor HTTP cuando
`env.isProduction && !process.env.VERCEL`. Por eso la imagen fija
`NODE_ENV=production`, **no** define `VERCEL`, y el comando de arranque es
`node dist/boot.js` con `WORKDIR /app`.

`server/lib/vite.ts` sirve los estáticos así:

- `serveStatic({ root: "./dist/public" })` → depende del **cwd**; debe ser `/app`.
- El fallback SPA lee `path.resolve(import.meta.dirname, "../dist/public/index.html")`.
  Como el bundle vive en `/app/dist/boot.js`, resuelve `/app/dist/public/index.html`.
- Los archivos con extensión no encontrados devuelven `404` JSON; las rutas sin
  extensión devuelven `index.html` (React Router).
- `GET /api/health` devuelve `200 {"status":"ok"}` con `Cache-Control: no-store`;
  el healthcheck de la imagen lo usa (ver §5). No consulta la DB.

No cambies el `WORKDIR`, no muevas `dist/` y no montes un volumen vacío sobre
`/app/dist`: romperían los estáticos y el fallback SPA.

## 2. Build de la imagen

Requisitos: Docker con BuildKit, acceso al registry y el código en la revisión
que se va a desplegar. El build no necesita secretos: `.dockerignore` excluye
`.env*`, `node_modules`, `dist`, capturas y credenciales.

```bash
IMAGE_TAG="$(git rev-parse --short HEAD)"
docker build --pull -t "rapidy:${IMAGE_TAG}" .
# Opcional: alias móvil solo para comodidad local; producción debe usar el SHA.
docker tag "rapidy:${IMAGE_TAG}" rapidy:latest
```

Etapas del `Dockerfile`:

1. `build` (`node:20-bookworm-slim`): `npm ci --include=dev`, copia el contexto y
   ejecuta `npm run build`. Ese script corre `vite build` (→ `dist/public`) y
   `esbuild server/boot.ts --bundle --format=esm` (→ `dist/boot.js`). Después
   `npm prune --omit=dev`.
2. `runtime` (`node:20-bookworm-slim`): copia `dist/`, `node_modules` de
   producción y `package*.json`; crea el usuario `app` (uid/gid 1001) y ejecuta
   como no root. Expone `3000`, define `NODE_ENV=production`, `PORT=3000`,
   `STOPSIGNAL SIGTERM`, healthcheck y `CMD ["node", "dist/boot.js"]`.

El `package.json` raíz debe estar en la imagen porque declara `"type": "module"`;
`dist/boot.js` es ESM.

Variables públicas `VITE_*` actuales: `VITE_NOMINATIM_BASE_URL` y
`VITE_NOMINATIM_EMAIL`. Se pasan como `--build-arg` y se hornean en el bundle;
el Dockerfile ya las declara. No metas secretos en build args: quedan en el
historial de la imagen. El resto de variables va en runtime.

## 3. Configuración y variables de entorno

La imagen **no contiene `.env`**. Inyecta las variables con `--env-file` o con el
gestor de secretos del orquestador. El archivo de producción debe tener permisos
`600` y vivir fuera del contexto de build.

```bash
# Ejemplo de arranque; ajusta ruta, tag y red.
docker run -d \
  --name rapidy \
  --restart unless-stopped \
  --stop-timeout 30 \
  --env-file /etc/rapidy/production.env \
  -p 127.0.0.1:3000:3000 \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  "rapidy:${IMAGE_TAG}"
```

No publiques `3000` en `0.0.0.0`: solo el reverse proxy debe alcanzarlo. En
Compose/Docker networks, usa `expose: ["3000"]` y el nombre del servicio como
upstream; no hace falta `ports`.

### Variables leídas por el servidor

| Variable | Obligatoria | Notas |
|---|---|---|
| `NODE_ENV` | Sí (la fija la imagen) | Debe ser `production`; activa el arranque HTTP y todas las validaciones de `server/lib/env.ts`. No la sobreescribas con `development`. |
| `PORT` | No | Default `3000`. Si la cambias, actualiza el mapeo, el upstream del proxy y el healthcheck (este lee `process.env.PORT`). |
| `APP_ID` | Sí | Identificador de la app. Si falta, el proceso falla al arrancar. |
| `APP_SECRET` | Sí | Firma de sesiones/JWT. ≥ 32 caracteres, alta entropía, sin placeholders, distinto de `APP_ID`. Genera con `openssl rand -hex 32`. Rotarlo invalida todas las sesiones. |
| `DATABASE_URL` | Sí | PostgreSQL (`postgres://`/`postgresql://`) con host y nombre de base; en producción se rechazan placeholders. Para Supabase/remoto usa `sslmode=require`. El pool se crea de forma perezosa en `server/queries/connection.ts`. |
| `ADMIN_EMAIL` | Sí | Email real y válido; se rechazan dominios de ejemplo (`example.com`, `admin.com`, `tudominio.com`). |
| `ADMIN_PASSWORD` | Sí | Mínimo 12 caracteres; se rechazan prefijos predecibles (`admin`, `password`, `rapidy`, `quickgo`...) y que sea igual a `APP_SECRET`. Cambiarla después del primer arranque **no** actualiza la contraseña existente: `seedAdminUser()` retorna si el email ya existe. |
| `ADMIN_NAME` | No | Default `Admin`. Solo se usa al crear el admin inicial. |
| `OWNER_UNION_ID` | Recomendada | `unionId` del admin propietario; si falta se usa un valor local por defecto y se emite un aviso. |
| `NEUROCHAT_API_KEY` | Sí para OTP productivo | Sin ella no se envían OTP en producción. El arranque no se bloquea, pero `sendOtp` falla. |
| `NEUROCHAT_OTP_FROM` | No | Remitente/número de OTP. |
| `NEUROCHAT_BASE_URL` | No | Default `https://api.neurochat.com.ec/api/v1`; en producción debe ser `https`. |
| `NEUROCHAT_TIMEOUT_MS` | No | Timeout por intento de OTP, entero 2 000–20 000 ms; default 8 000. |
| `OTP_LENGTH` | No | Entero 4–8; default 6. Un valor inválido aborta el arranque en producción. |
| `OTP_EXPIRY_MINUTES` | No | Entero 1–30; default 5. Un valor inválido aborta el arranque en producción. |
| `OTP_DEV_FALLBACK` | No | **Prohibida activa** en producción: si vale `true`/`1`/`yes`/`on`, el arranque falla. Sin API Key no hay fallback; los OTP fallan. |
| `MAX_BODY_BYTES` | No | Límite global de body; default **20 MB** (`20 * 1024 * 1024`). Si lo cambias, ajusta `client_max_body_size` del proxy. |
| `APP_ORIGIN` / `TRUSTED_ORIGINS` | No | Orígenes extra (coma-separados, con esquema) permitidos por el guardia CSRF. Necesarios si hay un front separado o un dominio en transición. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | JSON completo de la service account para push. Si falta o es inválido, `server/lib/firebase.ts` avisa y los push quedan deshabilitados; la app sigue funcionando. Es un secreto: usa secret manager, no `--build-arg`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Alternativa a la anterior: ruta a un JSON montado. El uid 1001 debe poder leerlo (p. ej. `0400` owner 1001 o `0444`). |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` o `fatal`; default `info`. |
| `LOG_SERVICE` | No | Nombre del servicio en los logs; default `rapidy-api`. |
| `APP_VERSION` / `GIT_SHA` | No | Versión incluida en los logs; útil para correlacionar despliegues. |
| `VERCEL` | No | **Debe quedar sin definir/vacía**. Si está definida, `server/boot.ts` no llama a `serve()` y el contenedor no escucha. |

`server/lib/env.ts` valida al cargar el módulo y lanza **un único error
agregado** si falta `APP_ID`, `APP_SECRET`, `DATABASE_URL`, `ADMIN_EMAIL` o
`ADMIN_PASSWORD`, o si algún valor no cumple (secreto débil, URL inválida,
placeholders, OTP fuera de rango, etc.). El mensaje enumera las variables
afectadas y nunca imprime sus valores. Es intencional (fail-fast); revisa
`docker logs` antes de entrar en un bucle de reinicio. El inventario completo y
las reglas de rotación están en `docs/production/ENVIRONMENT.md`.

### Orden de arranque y admin inicial

`seedAdmin()` se lanza sin `await` antes de `serve()`. Si la base de datos no
está disponible en ese instante, el error se registra como `[boot] seedAdmin
failed` y **no se reintenta** hasta el próximo reinicio. Por eso:

1. Verifica que PostgreSQL acepte conexiones.
2. Aplica migraciones antes de arrancar la versión nueva (§10).
3. Define `ADMIN_EMAIL`/`ADMIN_PASSWORD` antes del primer arranque.
4. Si el primer arranque ocurrió sin DB, reinicia el contenedor una vez que la
   DB esté lista.

## 4. Puerto y red

- Contenedor: `3000/tcp`; el proceso escucha en todas las interfaces dentro del
  contenedor (`@hono/node-server` sin hostname explícito).
- Host: publica solo en loopback (`-p 127.0.0.1:3000:3000`) y pon el proxy
  delante. Nunca expongas `3000` directo a Internet.
- TLS: obligatorio en el proxy. Las cookies de sesión se emiten `HttpOnly;
  Secure; SameSite=Lax` (`server/lib/cookies.ts`); sin HTTPS el navegador las
  rechaza. En producción `Secure` es `true` salvo que el Host sea loopback.
- El proxy debe preservar `Host` y enviar `X-Forwarded-Host` con el dominio
  público (`proxy_set_header X-Forwarded-Host $host`). Si reescribe el host a
  `127.0.0.1:3000`, la app lo trata como loopback: no emite HSTS, puede emitir
  cookies sin `Secure` y el guardia CSRF compara contra el host equivocado.
- Enviar `X-Forwarded-Proto: https`. El guardia CSRF de mutaciones tRPC exige
  `Origin`/`Referer` del mismo host; no elimines esas cabeceras en el proxy. Si
  hay un front separado o un dominio en transición, declara los orígenes en
  `APP_ORIGIN`/`TRUSTED_ORIGINS`. Eso solo cubre el guardia CSRF: no habilita
  CORS (la API no emite `Access-Control-Allow-Origin`).
- `client_max_body_size` del proxy debe cubrir el límite de la app: **20 MB**
  por defecto (`MAX_BODY_BYTES`, en `server/boot.ts`). Si cambias la variable,
  ajusta el proxy en consecuencia.

## 5. Healthcheck

El `Dockerfile` incluye:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
```

`GET /api/health` responde `200 {"status":"ok"}` con `Cache-Control: no-store`.
Es un chequeo de **liveness**: confirma que el proceso HTTP responde, pero **no**
valida PostgreSQL, migraciones ni tRPC. Para readiness real, usa un monitor
externo contra una operación tRPC autenticada o contra la base de datos. La
postura de seguridad del endpoint está en `docs/production/SECURITY.md`.

```bash
docker ps --filter name=rapidy
docker inspect --format '{{json .State.Health}}' rapidy
# Alternativa dentro de la imagen:
docker exec rapidy node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status)).catch(console.error)"
```

Docker **no reinicia** un contenedor por estar `unhealthy`; el `--restart` solo
actúa si el proceso termina. Si necesitas auto-recuperación, usa el healthcheck
del orquestador (Swarm/K8s/Compose + monitor) o un watchdog externo.

## 6. Reverse proxy HTTPS (nginx)

Ejemplo mínimo. Ajusta dominio, certificados y rutas. `location /api/events/`
debe ir antes de `location /` y sin buffering.

```nginx
server {
    listen 80;
    server_name rapidy.example.com;
    return 301 https://$host$request_uri;
}

server {
    # En nginx >= 1.25.1 puede usarse: listen 443 ssl; + http2 on;
    listen 443 ssl http2;
    server_name rapidy.example.com;

    ssl_certificate     /etc/letsencrypt/live/rapidy.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rapidy.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 20m;

    # SSE: sin buffer, sin caché y con timeout mayor que el heartbeat.
    location /api/events/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Sobrescribe la cabecera del cliente; no confiar en XFF entrante.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        gzip off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;

        # index.html y fallback SPA: no cachear. /api/trpc tampoco lo necesita.
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-store" always;
    }
}
```

Notas:

- `server/boot.ts` ya envía `X-Accel-Buffering: no` y
  `Cache-Control: no-cache, no-transform` en SSE. Aun así, deja
  `proxy_buffering off` explícito: es la causa más común de eventos “congelados”.
- No pongas `proxy_ignore_headers X-Accel-Buffering`; anularía la señal de la app.
- El heartbeat SSE es de 15 s (30 s en `admin-dashboard`). Un
  `proxy_read_timeout` de 3600 s evita cortes por inactividad.
- No comprimas `text/event-stream`; `gzip off` en esa location.
- Si usas CDN/WAF delante (Cloudflare, etc.), desactiva buffering/compresión para
  `/api/events/` o haz bypass; algunos proxies acumulan SSE.
- `X-Forwarded-For` se sobrescribe con `$remote_addr`. Si hay un CDN delante,
  configura `real_ip`/`set_real_ip_from` para la IP del CDN y usa la cabecera
  real del proveedor; no aceptes XFF del cliente.
- El guardia CSRF exige `Origin`/`Referer` en mutaciones tRPC. No los elimines en
  el proxy. Si el front está en otro origen, declara `APP_ORIGIN` o
  `TRUSTED_ORIGINS` (coma-separados, con esquema).
- HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy` los
  emite la app. No los elimines en el proxy. El CSP permite orígenes concretos
  (Supabase, tiles OSM, Nominatim, Unsplash/plus, Picsum/fastly, Wikimedia y
  Google Fonts); si cambias proveedores, hay que editar `server/boot.ts` y
  reconstruir.

Alternativa Caddy:

```caddyfile
rapidy.example.com {
    # Si activas "encode", excluye text/event-stream para no comprimir SSE.
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
        transport http {
            read_timeout 24h
        }
    }
}
```

`flush_interval -1` desactiva el buffering de respuesta. Verifica con
`curl -N` que los eventos llegan sin ráfagas.

## 7. Archivos estáticos y caché

- `dist/public` contiene el resultado de Vite y los archivos de `public/`
  (favicons, manifest, service worker, imágenes).
- Los assets con hash de Vite pueden cachearse de forma agresiva; `index.html`,
  `sw.js`, `manifest*.json` y las respuestas de `/api/` deben revalidarse o no
  cachearse. La app no fija esas cabeceras para estáticos, así que si usas caché
  en el proxy/CDN, configúralo explícitamente:

```nginx
# "/" y las rutas SPA ya llevan no-store en la location / del ejemplo anterior.
location = /sw.js {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "no-cache" always;
}

location /assets/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_hide_header Cache-Control;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

Si no quieres duplicar configuración, aplica la misma política en el CDN o
mantén el proxy simple y deja que Node sirva los archivos sin caché agresiva.

- No cachees `/api/` ni `/api/events/`.
- El fallback SPA devuelve `index.html` para rutas como `/admin/orders` o
  `/politica-de-privacidad`; si pones otro servidor estático delante, replica ese
  fallback o simplemente proxifica todo a Node.
- El límite de subida es 20 MB por defecto (`MAX_BODY_BYTES`); un `413` normalmente
  viene del proxy, no de la app.
- El service worker (`public/sw.js`) se sirve desde la raíz; al desplegar, prueba
  una ventana nueva y, si hay caché vieja, fuerza recarga/desregistro.

## 8. SSE (buffering off)

Endpoints (todos con autenticación por cookies de sesión):

- `/api/events/orders/:orderId`
- `/api/events/commerce/:commerceId`
- `/api/events/driver/:driverId`
- `/api/events/admin-dashboard`
- `/api/events/commerces`
- `/api/events/products`

Características relevantes:

- Respuesta `text/event-stream`, `Cache-Control: no-cache, no-transform`,
  `X-Accel-Buffering: no`; heartbeat cada 15 s (30 s en admin).
- El proxy debe usar HTTP/1.1 hacia el upstream, `proxy_buffering off` y timeouts
  largos. Sin eso, nginx puede retener eventos hasta llenar el buffer.
- No comprimir, no cachear y no aplicar transformaciones que cambien el chunking.
- Detrás de un balanceador con varias réplicas, **SSE no funciona correctamente**:
  `server/events.ts` usa un bus en memoria. Un evento emitido en la instancia A
  solo llega a los clientes conectados a A. Mantén **una sola réplica** o
  implementa pub/sub (Redis/NATS) y enrutamiento consistente antes de escalar.
- Los clientes reconectan; al reiniciar el contenedor se pierden los streams y se
  reabren. No hay replay de eventos: el cliente debe refrescar el estado al
  reconectar.

Prueba manual (sin pegar tokens reales en el historial):

```bash
curl -N -H "Cookie: quickgo_admin_token=..." \
  https://rapidy.example.com/api/events/admin-dashboard
```

Debe imprimir `event: update` con `{"type":"ping"}` periódicamente y no quedarse
en silencio por buffering.

## 9. Reinicio, actualización y parada

- Política recomendada: `--restart unless-stopped` (o `restart: unless-stopped`
  en Compose). Sobrevive reinicios del host, pero no bucles de configuración.
- `--stop-timeout 30` da margen a cerrar conexiones. La app no implementa un
  graceful shutdown explícito; Node termina con SIGTERM y los clientes SSE
  reconectan. No hay drenaje de pedidos en curso a nivel de aplicación.
- Actualización recomendada (inmutable, sin `latest`):

```bash
NEW_TAG="$(git rev-parse --short HEAD)"
docker build --pull -t "rapidy:${NEW_TAG}" .
docker stop --time 30 rapidy
docker rename rapidy rapidy_prev
docker run -d \
  --name rapidy \
  --restart unless-stopped \
  --stop-timeout 30 \
  --env-file /etc/rapidy/production.env \
  -p 127.0.0.1:3000:3000 \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  "rapidy:${NEW_TAG}"
# Verifica healthcheck y smoke tests; luego elimina rapidy_prev cuando confíes.
```

- Si usas Compose: `docker compose pull`, `docker compose up -d`, y
  `docker compose ps` para el estado. Configura `stop_grace_period: 30s`.
- Con una sola réplica hay una breve interrupción al cambiar el contenedor. Para
  blue-green necesitarías dos instancias y, por el bus SSE en memoria, asumir que
  los eventos no cruzan entre ellas; no es un despliegue sin downtime completo
  para SSE sin trabajo adicional.
- Reinicio simple: `docker restart rapidy` (respeta el timeout configurado).
- Si el contenedor queda en `Restarting`, revisa `docker logs rapidy`; las causas
  típicas son variable faltante, `APP_SECRET` inválido o DB inaccesible.

## 10. Migraciones y base de datos

- Las migraciones **no** se ejecutan al arrancar el contenedor y `drizzle-kit` es
  dependencia de desarrollo (se elimina con `npm prune --omit=dev`). No está en
  la imagen de runtime.
- Aplícalas fuera de banda, antes de arrancar la nueva versión, desde CI o un
  host controlado con el repo y `DATABASE_URL`:

```bash
# Solo en el runner de migraciones, nunca en cada réplica ni en el Dockerfile.
DATABASE_URL='postgresql://...' npm run db:migrate
```

- No uses `db:push` en producción. No ejecutes migraciones en paralelo desde
  varias réplicas.
- Haz backup/verificación de restore antes de migraciones destructivas. Una
  migración debe ser compatible hacia atrás mientras exista la versión anterior,
  porque el rollback de imagen no revierte el esquema.
- Si la migración falla, detén el despliegue; no arranques la app nueva “a ver si
  funciona”.

## 11. Logs

La app escribe a stdout/stderr, no a archivos. El logger estructurado
(`server/lib/logger.ts`) emite una línea JSON por evento; aún quedan mensajes
legacy con `console.*` (`[boot]`, `[SSE]`, `[tRPC]`, `[Firebase]`). Con el driver
`json-file`:

```bash
docker logs -f --tail 200 --timestamps rapidy
docker logs --since 30m rapidy 2>&1 | grep -Ei 'error|warn|SSE|tRPC'
```

- Rota los logs (`--log-opt max-size=10m --log-opt max-file=5`) o envía el driver
  a Loki/CloudWatch/OTLP. Sin rotación, el disco del host se llena.
- `LOG_LEVEL` filtra el logger (`debug`/`info`/`warn`/`error`/`fatal`); los
  `console.*` legacy no pasan por ese filtro. `LOG_SERVICE` y `APP_VERSION`/
  `GIT_SHA` etiquetan las líneas para correlacionar despliegues.
- Los logs de acceso del proxy son complementarios: la app no registra cada
  request; solo tRPC (`[tRPC] matched`), SSE, Firebase y errores.
- No imprimas secretos ni tokens. `--env-file` no aparece en logs, pero
  `docker inspect` sí muestra las variables de entorno: restringe el acceso al
  daemon y prefiere secretos de orquestador cuando estén disponibles.
- Si cambias `TZ`, hazlo de forma consistente con la base de datos y el proxy.

## 12. Rollback

La imagen es inmutable y contiene también el frontend compilado, así que volver a
la imagen anterior revierte UI + API. Requisitos: conservar el tag anterior en el
registry/host y no haber aplicado una migración incompatible.

```bash
# Ver imagen actual antes de cambiar.
docker inspect --format '{{.Config.Image}} {{.Image}}' rapidy

# Volver al tag anterior (ejemplo).
docker stop --time 30 rapidy
docker rename rapidy rapidy_failed
docker run -d \
  --name rapidy \
  --restart unless-stopped \
  --stop-timeout 30 \
  --env-file /etc/rapidy/production.env \
  -p 127.0.0.1:3000:3000 \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=5 \
  "rapidy:<TAG_ANTERIOR>"
docker inspect --format '{{json .State.Health}}' rapidy
```

- No reutilices tags: cada build debe tener SHA/digest propio. `latest` no es un
  plan de rollback.
- Rollback de app **no** revierte la base de datos. Si la migración nueva es
  incompatible, el rollback requiere restaurar el backup según el protocolo de
  incidentes; no luches contra el esquema desde la app.
- Tras el rollback, verifica `/`, login de los cuatro roles, pedido, SSE y logs.
- Documenta el tag anterior y el motivo del rollback en el registro de cambios.

## 13. Checklist de go-live

Antes:

- [ ] DNS apunta al proxy; certificado TLS válido y renovación automática.
- [ ] `NODE_ENV=production`, `PORT=3000`, `VERCEL` vacío.
- [ ] `APP_ID`, `APP_SECRET` (≥32, aleatorio) y `DATABASE_URL` definidos.
- [ ] `ADMIN_EMAIL`/`ADMIN_PASSWORD` definidos antes del primer arranque.
- [ ] `NEUROCHAT_API_KEY` definida si se usará OTP real; `OTP_DEV_FALLBACK`
      ausente o `false` (activo aborta el arranque).
- [ ] Firebase configurado (JSON o archivo montado) si se esperan push.
- [ ] Migraciones aplicadas y backup reciente verificado.
- [ ] Imagen construida con tag SHA y healthcheck en verde.
- [ ] Una sola réplica (bus SSE en memoria).
- [ ] `client_max_body_size` ≥ 20 MB (o el valor de `MAX_BODY_BYTES`) y SSE sin
      buffering.
- [ ] Host y `X-Forwarded-Host` preservados; `X-Forwarded-Proto: https`; HTTPS
      obligatorio.

Después:

- [ ] `GET /api/health` devuelve 200 `{"status":"ok"}` y la SPA carga.
- [ ] Assets (`/assets/...`, favicon, manifest, `sw.js`) devuelven 200.
- [ ] Login admin, negocio, cliente y repartidor; cookies `HttpOnly`, `Secure`
      y `SameSite=Lax`.
- [ ] Mutación tRPC con `Origin` correcto funciona; con `Origin` ajeno devuelve
      403. `curl` sin `Origin` en producción también devuelve 403.
- [ ] Crear/actualizar un pedido y comprobar que el negocio/repartidor/cliente
      reciben el evento SSE sin ráfagas ni silencios.
- [ ] `/api/*` desconocido devuelve 404 JSON; ruta SPA desconocida devuelve HTML.
- [ ] Logs sin `Configuración de entorno inválida`, `APP_SECRET`, `ECONNREFUSED`
      ni errores de migración.
- [ ] Healthcheck estable durante 10–15 minutos y rotación de logs activa.

## 14. Limitaciones conocidas de este frente

- `/api/health` es liveness, no readiness: no consulta la base de datos.
- El bus SSE es en memoria: **no escalar horizontalmente** sin pub/sub.
- No hay graceful shutdown explícito; se depende de SIGTERM y reconexión SSE.
- Las migraciones son un paso externo; la imagen no incluye `drizzle-kit`.
- Node 20 está fuera de soporte desde abril de 2026. Se mantiene por requisito de
  este frente; planifica la migración a Node 22/24 y vuelve a validar la imagen.
- `seedAdmin()` no se espera antes de `serve()`; si la DB no está lista en el
  primer arranque, reinicia el contenedor después de corregir la conexión.