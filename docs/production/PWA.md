# Frente 13 — PWA y cache

Fecha: 2026-11-13
Alcance editado: `public/manifest.json`, `public/sw.js`,
`src/components/PWAInstallBanner.tsx`, `src/hooks/usePWAInstall.ts`,
`docs/production/PWA.md`.

## 1. Auditoría inicial

| Elemento | Hallazgo | Estado |
| --- | --- | --- |
| `manifest.json` | `theme_color: #FF6A00` no coincidía con `index.html` (`#121212`) ni con el fondo de la app. | Corregido a `#121212`. |
| `manifest.json` | Iconos declarados como `"purpose": "any maskable"`. El PNG tiene fondo crema y el logo casi toca los bordes: al recortarlo como maskable se pierde parte del logo. | Se dejó `"any"`; falta un maskable dedicado con safe zone. |
| `manifest.json` | Faltaban `lang` y `categories`; `start_url` no incluía el identificador de la app cliente. | Agregados `es-AR`, `food/shopping` y `start_url=/?source=pwa&app=cliente`. El `id` no se tocó para no duplicar instalaciones. |
| `sw.js` | `CACHE_NAME = rapidy-v4` fijo; no había estrategia de versión documentada. | Versión `rapidy-static-v5`, limpieza por prefijo y bump documentado. |
| `sw.js` | Excluía `/api/` y `/events/`, navegación y HTML, pero no JSON, `Authorization`, `Range`, `no-store`, query strings ni manifest/sw. | Todas esas exclusiones agregadas. |
| `sw.js` | Borraba toda caché del origen que no fuera la actual. | Ahora solo borra `rapidy-*` (incluye la vieja `rapidy-v4`). |
| `sw.js` | Cacheaba cualquier estático con network-first, sin distinguir assets inmutables. | `/assets/*` (hash de Vite) cache-first; el resto network-first con fallback. |
| `PWAInstallBanner` | No estaba montado en ninguna ruta; usaba `any`; el dismiss era para siempre. | Componente reescrito; falta montarlo (ver §6). |
| `usePWAInstall` | Hook vacío, sin captura real de `beforeinstallprompt`. | Hook real con evento tipado, instalación, dismiss con vencimiento e iOS. |
| Iconos | `icon-192.png` y `icon-512.png` existen y miden 192×192 / 512×512. `apple-touch-icon.png` mide 180×180. | Correctos. |
| Iconos SVG | `icon-192.svg` / `icon-512.svg` son placeholders verdes con una «Q», no el logo Rapidy. | No se referencian; no usar. Pendiente borrarlos/reemplazarlos. |

## 2. Manifest final

- `name`/`short_name`: Rapidy.
- `id`: `/?app=cliente` (sin cambios, para conservar la identidad de instalaciones existentes).
- `start_url`: `/?source=pwa&app=cliente`.
- `scope`: `/` (la SPA vive en la raíz; cubre cliente y backoffice).
- `display`: `standalone`.
- `background_color`: `#121212` (splash oscuro, igual que `html/body`).
- `theme_color`: `#121212` (igual que el `meta theme-color` de `index.html`).
- Iconos: `icon-192.png` y `icon-512.png` con `purpose: "any"`.

Decisión de tema: el shell de la app es oscuro (`html`, `body` y `meta theme-color`
en `#121212`). El naranja `#FF6A00` queda como color de marca/acento, no como
color de barra del sistema. Si más adelante se quiere que el manifest siga el
tema claro/oscuro dinámicamente, hay que generar manifests por tema o actualizar
`theme-color` desde JS; hoy no está implementado.

## 3. Estrategia del service worker

Archivo servido desde `/sw.js`, scope raíz.

### Nunca se intercepta ni cachea

- Navegación (`request.mode === 'navigate'`) y cualquier respuesta HTML.
- `Accept: application/json`.
- `/api` y `/api/*` (trpc/REST autenticado).
- `/events` y `/events/*` (SSE).
- `/sw.js`, `/manifest.json`, `/manifest-partners.json`.
- Peticiones con `Authorization`, `Range`, `cache: 'no-store'` o query string.
- Origen distinto al de la app (mapas, Unsplash, fuentes de Google, etc.).
- Métodos distintos de `GET`.

### Cacheables

Solo mismo origen y extensiones estáticas:
`js, mjs, css, png, jpg/jpeg, gif, svg, webp, avif, ico, woff/woff2, ttf, otf, eot`.

| Ruta | Estrategia | Motivo |
| --- | --- | --- |
| `/assets/*` | Cache-first | Vite incluye content-hash; el archivo es inmutable. |
| Resto de estáticos | Network-first, fallback a caché | Evita servir una imagen/fuente vieja si hay red. |
| Sin red y sin caché | `504 Offline` | Falla explícita, sin HTML de fallback. |

No se precachea el shell HTML a propósito: así una versión vieja del SW nunca
sirve una SPA desactualizada ni HTML autenticado. La app requiere red para
navegar; el SW solo acelera/offline-iza assets.

### Versión y actualización

- `CACHE_VERSION = 'v5'`; la caché se llama `rapidy-static-v5`.
- Al activarse, se borran todas las cachés `rapidy-*` que no sean la actual
  (esto elimina `rapidy-v4` de instalaciones viejas).
- `install` hace `skipWaiting()`; `activate` hace `clients.claim()` y avisa a
  las pestañas con `{ type: 'RAPIDY_SW_ACTIVATED', version }`.
- Se acepta el mensaje `{ type: 'SKIP_WAITING' }` para forzar activación.
- `trimCache` limita la caché a 120 entradas (FIFO) para que no crezca sin
  control con assets hasheados viejos.

**Procedimiento de deploy:**

1. Si cambió `sw.js`, assets públicos no hasheados o la estrategia, subir
   `CACHE_VERSION` (por ejemplo `v5` → `v6`).
2. Servir `/sw.js` con `Cache-Control: no-cache, no-store, must-revalidate`
   (o como mínimo `no-cache`) y sin cachear en CDN. Si el navegador/CDN cachea
   `sw.js`, los clientes no ven la actualización.
3. Publicar. El navegador busca `sw.js` al navegar/registrar; el SW nuevo se
   instala, activa y borra cachés viejas.
4. Recomendar recargar una vez a las pestañas abiertas. No se fuerza
   `window.location.reload()` desde el SW para no interrumpir checkout/chat.

`index.html` registra el SW sin `updateViaCache: 'none'`. Es una mejora
pendiente en archivo no asignado (§6).

## 4. Install prompt

`usePWAInstall` captura `beforeinstallprompt` a nivel de módulo (antes de que
monte el banner) y expone:

- `canInstall`, `showPrompt`
- `isInstalled` (`display-mode: standalone` o `navigator.standalone`)
- `isIos` (incluye iPadOS con `MacIntel` + touch)
- `isDismissed`
- `install()` → `accepted | dismissed | unavailable`
- `triggerPrompt` (alias de `install`) y `dismiss()`

El dismiss se guarda en `localStorage` como `rapidy_pwa_dismissed_until` por
14 días, no para siempre. El flag viejo `pwa_dismissed` se migra a 14 días y se
elimina.

`PWAInstallBanner`:
- No aparece en `/descargar` ni `/descargar-socios`.
- No aparece si la app ya está instalada o si el usuario descartó el aviso.
- Chromium/Android: botón «Instalar» que dispara el prompt nativo.
- iOS: tras 5 s muestra instrucciones («Compartir → Agregar a pantalla de
  inicio»), porque iOS no emite `beforeinstallprompt`.
- Usa clases `dark:` para el backoffice con tema oscuro.

Limitación: el componente **no está montado** en `App.tsx`/`main.tsx` (no son
archivos asignados). Hasta montarlo, no se muestra ningún banner.

## 5. Verificación manual

1. `npx tsc --noEmit` (0 errores).
2. DevTools → Application → Manifest:
   - `start_url=/?source=pwa&app=cliente`, `scope=/`, `theme_color=#121212`.
   - Iconos 192 y 512 cargan sin error.
3. DevTools → Application → Service Workers:
   - Activar «Update on reload»; recargar dos veces.
   - En Cache Storage debe quedar solo `rapidy-static-v5` (o la versión vigente).
4. DevTools → Network, con sesión iniciada:
   - Login, pedidos, productos y SSE: ninguna entrada de `/api` o `/events` en
     Cache Storage.
   - Navegar offline: la navegación falla (esperado); una imagen cacheada carga;
     `/api` falla sin devolver datos viejos.
5. Instalación:
   - Chrome Android/desktop: aparece prompt; «Ahora no» oculta 14 días.
   - iOS Safari: a los 5 s aparece el instructivo.
   - Tras instalar, el banner no vuelve a aparecer.
6. Actualización:
   - Cambiar `CACHE_VERSION`, recargar; verificar que la caché vieja desaparece
     y que llega `RAPIDY_SW_ACTIVATED` en la consola del SW.
7. Lighthouse: comprobar «Installable». Puede advertir por falta de icono
   maskable y por no tener fallback offline de navegación (decisiones
   conscientes).

## 6. Pendientes en archivos no asignados

No se editaron por regla del brief:

1. `src/App.tsx` o `src/main.tsx`: montar `<PWAInstallBanner />` (import y render
   global; no dentro de rutas de descarga). Sin esto el banner no se ve.
2. `index.html`:
   - Registrar con `navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })`.
   - Llamar `registration.update()` al volver a primer plano (visibilitychange)
     para acelerar actualizaciones.
   - Agregar `<link rel="manifest" href="/manifest.json">` de fallback (hoy se
     inyecta por JS) y `apple-mobile-web-app-title`.
   - Evaluar capturar `beforeinstallprompt` inline si se detecta que el evento
     se pierde antes de cargar el bundle.
3. `public/manifest-partners.json`: sigue con `theme_color: #FF6A00`, iconos
   `"any maskable"` y sin `lang`. Alinear a `#121212`, `purpose: "any"` y
   `lang: "es-AR"`; el `start_url` `/login?source=pwa-partners` es correcto.
4. Iconos: crear maskable 192/512 con 20 % de safe zone (logo centrado y fondo
   sólido) y borrar/reemplazar `icon-192.svg` y `icon-512.svg` (placeholders
   verdes con «Q»). Los PNG actuales son el logo correcto.
5. Servidor/CDN: header `Cache-Control` específico para `/sw.js` y para
   `/manifest*.json` (`no-cache`). `server/lib/vite.ts` sirve `dist/public` sin
   headers propios; no se tocó.
6. `src/components/DynamicManifest.tsx` no está montado; `index.html` ya elige
   manifest según la ruta. Si se monta, evitar dos links `rel=manifest`
   duplicados. No es necesario para el cliente, pero sí para cambiar de
   manifest al navegar dentro del backoffice.