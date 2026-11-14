# Mapas y geocodificación — Frente 8

**Estado:** implementado en cliente. Pendiente migrar dos consumidores fuera del
alcance asignado y decidir proveedor con SLA para producción.

## 1. Alcance

- Centralizar las llamadas a Nominatim en `src/lib/geocoding.ts`.
- Integrar el helper en:
  - `src/pages/customer/components/OrderTrackingMap.tsx`
  - `src/pages/commerce/Profile.tsx`
  - `src/pages/driver/DriverOrder.tsx`
- Mantener OpenStreetMap (OSM) como fuente de tiles y su atribución.
- No cambiar layout, contratos de props ni la lógica de estados de pedidos.

## 2. Helper `src/lib/geocoding.ts`

API pública:

| Función | Uso | Fallo |
| --- | --- | --- |
| `geocodeAddress(address, options)` | Dirección → `{ lat, lng }` | `null` |
| `reverseGeocode(lat, lng, options)` | Coordenadas → dirección | `"lat, lng"` |
| `DEFAULT_MAP_CENTER` | Centro por defecto (Quito) | constante |
| `clearGeocodeCache()` | Limpiar caché en memoria | — |

Garantías:

- **Timeout:** 8 s por intento de red (`timeoutMs` configurable).
- **Cancelación:** acepta `AbortSignal`; el aborto se propaga al `fetch` y a la
  cola de espera. Los componentes abortan al desmontar o al iniciar otra
  geocodificación.
- **Caché en memoria:** 24 h, máximo 256 entradas, evicción tipo LRU. Solo se
  cachean respuestas exitosas; los fallos no se congelan.
- **Rate limit:** cola global que garantiza ≥ 1 s entre inicios de request a
  Nominatim. Los aciertos de caché no consumen turno. Es un límite por pestaña;
  no reemplaza un proxy/caché compartida en servidor.
- **Degradación:** ninguna función lanza. Forward devuelve `null`; reverse
  devuelve el par de coordenadas formateado. Los mapas siguen renderizando.
- **Privacidad:** no se envía `User-Agent` (cabecera prohibida en navegador).
  Se usa el `Referer` del sitio y, si está configurado, el parámetro `email`.
- **Idioma:** `accept-language=es`.
- **Precisión de caché reverse:** 5 decimales (~1 m) para evitar golpear
  Nominatim por microvariaciones del pin.

## 3. Integraciones

### Tracking del cliente

`OrderTrackingMap` conserva a `useGeocode` como fuente principal. Si el hook no
entrega coordenadas (fallo o ausencia), el componente ejecuta un único fallback
con `geocodeAddress`, cancelable y cacheado. El mapa se monta antes de la
respuesta; si todo falla, mantiene comercios/repartidor o `DEFAULT_MAP_CENTER`.
No se agregó UI nueva ni se modificó el contrato de props.

### Perfil del comercio

- Se eliminó el `fetch` directo a Nominatim.
- El pin arrastrado usa `reverseGeocode`; cada nuevo `dragend` aborta la
  petición anterior para que una respuesta vieja no sobrescriba la dirección.
- “Mi Ubicación” usa el mismo helper y también aborta la petición previa.
- La caché evita repetir la reverse para el mismo punto.
- Atribución de tiles enlazada a la página de copyright de OSM.

### Detalle del repartidor

- Se eliminó el `fetch` directo a Nominatim.
- La dirección del pedido se geocodifica con `geocodeAddress`, cancelando al
  cambiar de pedido o desmontar.
- Si falla, no hay marcador de destino inventado: el mapa queda con los
  comercios o con `DEFAULT_MAP_CENTER` y sigue operativo.
- Tiles, atribución y controles de Leaflet se mantienen.

## 4. Política de uso de OpenStreetMap / Nominatim

Nominatim público (`nominatim.openstreetmap.org`) es un servicio comunitario, no
un SLA comercial. Reglas aplicadas:

1. Máximo absoluto de 1 request/s; el helper aplica la cola.
2. Cachear resultados; prohibido repetir la misma búsqueda en cada render.
3. Identificar la aplicación. En navegador el `Referer` es la señal disponible;
   configurar `VITE_NOMINATIM_EMAIL` para dar contacto.
4. No usar autocompletado por tecla ni geocodificación masiva.
5. Mostrar atribución OSM en mapas y resultados.
6. No eludir bloqueos ni usar varios subdominios para saltar el límite.

Tiles: se mantiene `tile.openstreetmap.org` con atribución visible. La política
de tiles de OSM tampoco garantiza SLA y desaconseja tráfico comercial alto.
Para producción con volumen se debe usar un proveedor con SLA o self-host.

El modo oscuro de la UI se conserva (contenedores, controles y atribución con
clases `dark:`). Los tiles estándar de OSM no tienen variante oscura; no se
aplican filtros CSS de inversión porque distorsionan colores y atribución.

## 5. Alternativas con SLA

| Proveedor | Geocoding | Tiles | Nota |
| --- | --- | --- | --- |
| MapTiler | Sí | Sí | Planes con SLA; API key |
| Stadia Maps | Sí | Sí | Estilos claros/oscuros |
| LocationIQ | Sí | No | Compatible con API Nominatim |
| Mapbox | Sí | Sí | Ecosistema completo |
| Google Maps Platform | Sí | Sí | Mayor costo, requiere revisar licencia |
| HERE | Sí | No | Cobertura empresarial |

Recomendación: mantener OSM/Nominatim para desarrollo y bajo volumen; para
producción contratar geocoding + tiles con SLA, o self-host. Las API keys deben
vivir en el servidor y exponerse mediante un proxy; nunca en `VITE_*`.

## 6. Self-host

- **Nominatim:** contenedor oficial/comunitario, importar extracto de Ecuador de
  Geofabrik, PostgreSQL + PostGIS. Para solo reverse se puede usar
  `--reverse-only`, que reduce disco. Requiere RAM/disco para importación y un
  plan de actualización periódica del extracto.
- **Tiles:** OpenMapTiles + Tileserver GL, MapTiler Server o stack
  `switch2osm`. Servir con caché CDN y `Access-Control-Allow-Origin` correcto.
- **Proxy:** exponer `/api/geocode/search` y `/api/geocode/reverse`, con caché
  compartida (Redis/Postgres), rate limit por usuario y contacto identificable.
- **Ventaja:** elimina dependencia de la política del servicio público y permite
  SLA interno. **Costo:** operación, actualizaciones y capacidad.

## 7. Variables de entorno

Implementadas hoy:

| Variable | Ámbito | Uso |
| --- | --- | --- |
| `VITE_NOMINATIM_BASE_URL` | cliente | Base URL de Nominatim o proxy compatible. Default: `https://nominatim.openstreetmap.org` |
| `VITE_NOMINATIM_EMAIL` | cliente | Contacto opcional enviado como `email` a Nominatim |

Futuras (documentadas, aún no implementadas):

| Variable | Ámbito | Uso previsto |
| --- | --- | --- |
| `VITE_GEOCODING_PROXY_URL` | cliente | Proxy propio con caché compartida |
| `VITE_MAP_TILE_URL` | cliente | Plantilla de tiles con SLA |
| `VITE_MAP_ATTRIBUTION` | cliente | Atribución del proveedor de tiles |
| `VITE_MAP_DARK_TILE_URL` | cliente | Tiles oscuros opcionales |
| `NOMINATIM_UPSTREAM_URL` | servidor | Upstream del proxy |
| `NOMINATIM_CONTACT_EMAIL` | servidor | Contacto para la política |
| `NOMINATIM_RATE_LIMIT_MS` | servidor | Intervalo global del proxy |
| `NOMINATIM_CACHE_TTL_S` | servidor | TTL de caché compartida |
| `MAP_PROVIDER_API_KEY` | servidor | Clave del proveedor con SLA |

`VITE_*` es público. No colocar secretos ni claves de proveedores pagos ahí.

## 8. Pendientes y archivos compartidos no asignados

No se editaron por estar fuera del alcance del frente:

- `src/hooks/useGeocode.ts`: sigue llamando a Nominatim directo. Debe delegar en
  `geocodeAddress` para compartir caché/rate limit con el resto.
- `src/lib/locationUtils.ts`: reverse directo usado por Cliente (registro,
  perfil, carrito). Debe delegar en `reverseGeocode`.
- `server/boot.ts`: el CSP solo permite `connect-src` a
  `https://nominatim.openstreetmap.org`. Si se usa
  `VITE_NOMINATIM_BASE_URL` con proxy/self-host, hay que añadir ese host al CSP
  (archivo compartido, no asignado a este frente).
- Persistir `lat/lng` del destino al crear el pedido para eliminar la
  geocodificación en cada visita al tracking (recomendación de auditoría).
- Migrar a proxy server-side antes de tráfico alto.

## 9. Verificación

Automática:

```bash
npx tsc -p tsconfig.app.json --noEmit
npx eslint src/lib/geocoding.ts \
  src/pages/customer/components/OrderTrackingMap.tsx \
  src/pages/commerce/Profile.tsx \
  src/pages/driver/DriverOrder.tsx
```

Manual:

1. Abrir tracking con red normal: el mapa aparece antes que el geocode; el pin
   de destino se agrega al responder.
2. Bloquear `nominatim.openstreetmap.org` en DevTools: el mapa sigue visible,
   sin errores en consola y sin bloquear la página.
3. En Perfil del comercio, arrastrar el pin varias veces rápido: solo la última
   posición debe fijar la dirección.
4. Repetir la misma búsqueda o el mismo pin: no debe salir una segunda request
   (caché en memoria).
5. Con throttling lento, confirmar en Network que no hay dos requests a
   Nominatim separadas por menos de 1 s.
6. Verificar atribución OSM visible en tracking, perfil y detalle driver, en
   tema claro y oscuro.

## 10. Riesgos conocidos

- La caché es por pestaña; no se comparte entre usuarios ni dispositivos.
- El rate limit es de cliente; un proxy server-side es la única garantía global.
- Nominatim público puede responder 403/429 o cambiar su política sin aviso.
- El `Referer` puede faltar por políticas de privacidad del navegador; el
  parámetro `email` mitiga la identificación, no el rate limit.
- Los tiles estándar de OSM no ofrecen SLA ni variante oscura oficial.