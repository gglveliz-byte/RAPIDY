/**
 * @archivo src/lib/geocoding.ts
 * @modulo Mapas / Geocodificación
 * @proposito
 *   Punto único de acceso a Nominatim (OpenStreetMap) para el cliente.
 *   Aplica timeout, cancelación por AbortSignal, caché en memoria y un límite
 *   global de una petición por segundo, y degrada sin lanzar errores.
 *
 * @resumen_contenido
 *   - `geocodeAddress`: dirección -> coordenadas (forward geocoding).
 *   - `reverseGeocode`: coordenadas -> dirección (reverse geocoding).
 *   - `DEFAULT_MAP_CENTER`: centro por defecto (Quito) para mapas sin datos.
 *   - `clearGeocodeCache`: limpieza de caché (tests / cambio de entorno).
 *
 * @politica_osm
 *   Nominatim exige como máximo 1 request/s, caché y una identificación válida.
 *   En navegador no se puede enviar `User-Agent`; se usa el Referer del sitio y,
 *   si está configurado, el parámetro `email`. Ver docs/production/MAPS.md.
 */

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface GeocodeOptions {
  /** Permite cancelar la petición (desmontaje, nueva búsqueda, etc.). */
  signal?: AbortSignal;
  /** Tiempo máximo de espera de red. Por defecto 8 s. */
  timeoutMs?: number;
}

/** Centro por defecto de Rapidy (Quito, Ecuador). */
export const DEFAULT_MAP_CENTER: Readonly<GeoCoords> = Object.freeze({
  lat: -0.1807,
  lng: -78.4678,
});

const NOMINATIM_DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";
const MIN_REQUEST_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 256;
const MIN_ADDRESS_LENGTH = 4;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

/** Cola global: garantiza al menos 1 s entre inicios de request a Nominatim. */
let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestStartedAt = 0;

function getBaseUrl(): string {
  const configured = import.meta.env.VITE_NOMINATIM_BASE_URL as string | undefined;
  return (configured?.trim() || NOMINATIM_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function getContactEmail(): string {
  const configured = import.meta.env.VITE_NOMINATIM_EMAIL as string | undefined;
  return configured?.trim() || "";
}

function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, " ").trim();
}

function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function createAbortError(): DOMException {
  return new DOMException("Geocoding request aborted", "AbortError");
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Espera el turno del rate limit. La cancelación se evalúa antes y después de
 * la espera para no gastar la ventana de 1 s en una petición ya cancelada.
 */
function withRateLimit<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const queued = requestChain.then(async () => {
    if (signal?.aborted) throw createAbortError();
    const waitMs = lastRequestStartedAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (waitMs > 0) await abortableDelay(waitMs, signal);
    if (signal?.aborted) throw createAbortError();
    lastRequestStartedAt = Date.now();
    return task();
  });
  requestChain = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function fetchJson(url: string, options: GeocodeOptions): Promise<unknown | null> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  if (signal?.aborted) return null;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    // Timeout, aborto, red o JSON inválido: el llamador decide el fallback.
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function requestJson(url: string, options: GeocodeOptions): Promise<unknown | null> {
  try {
    return await withRateLimit(() => fetchJson(url, options), options.signal);
  } catch {
    return null;
  }
}

function readCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  // Refresca el orden de inserción para una evicción tipo LRU.
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.value as T;
}

function writeCache(key: string, value: unknown): void {
  memoryCache.delete(key);
  memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (memoryCache.size > CACHE_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest === undefined) break;
    memoryCache.delete(oldest);
  }
}

function buildUrl(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  const email = getContactEmail();
  if (email && !query.has("email")) query.set("email", email);
  return `${getBaseUrl()}${path}?${query.toString()}`;
}

/**
 * Convierte una dirección en coordenadas. Devuelve `null` si la entrada es
 * inválida, si no hay resultados o si la red falla; nunca lanza.
 */
export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {},
): Promise<GeoCoords | null> {
  if (options.signal?.aborted) return null;
  const normalized = normalizeAddress(address);
  if (normalized.length < MIN_ADDRESS_LENGTH) return null;

  const cacheKey = `forward:${normalized.toLowerCase()}`;
  const cached = readCache<GeoCoords>(cacheKey);
  if (cached) return { ...cached };

  const url = buildUrl("/search", {
    q: normalized,
    format: "json",
    limit: "1",
    "accept-language": "es",
  });
  const data = await requestJson(url, options);
  if (!Array.isArray(data) || data.length === 0) return null;

  const result = data[0] as Record<string, unknown>;
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const coords: GeoCoords = { lat, lng };
  writeCache(cacheKey, coords);
  return coords;
}

/**
 * Convierte coordenadas en una dirección legible. Si falla, devuelve el par
 * `lat, lng` formateado para no romper la UI ni bloquear el guardado.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  options: GeocodeOptions = {},
): Promise<string> {
  if (options.signal?.aborted) return "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const fallback = formatCoordinates(lat, lng);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return fallback;

  // ~1 m de precisión: evita golpear Nominatim por microvariaciones del pin.
  const cacheKey = `reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = readCache<string>(cacheKey);
  if (cached) return cached;

  const url = buildUrl("/reverse", {
    lat: String(lat),
    lon: String(lng),
    format: "json",
    addressdetails: "1",
    "accept-language": "es",
  });
  const data = await requestJson(url, options);
  const displayName =
    data && typeof data === "object" && typeof (data as Record<string, unknown>).display_name === "string"
      ? ((data as Record<string, unknown>).display_name as string).trim()
      : "";

  if (!displayName) return fallback;
  writeCache(cacheKey, displayName);
  return displayName;
}

/** Vacía la caché en memoria. Útil para tests o cambios de configuración. */
export function clearGeocodeCache(): void {
  memoryCache.clear();
}