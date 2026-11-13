import { useQuery } from "@tanstack/react-query";

export interface GeoCoords {
  lat: number;
  lng: number;
}

const CACHE_PREFIX = "rapidy:geo:";

async function geocodeAddress(address: string, signal: AbortSignal): Promise<GeoCoords | null> {
  const cacheKey = `${CACHE_PREFIX}${address}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as GeoCoords;
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) return parsed;
    }
  } catch {
    // sessionStorage no disponible; seguimos con la red.
  }

  const query = encodeURIComponent(address);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`,
    { signal },
  );
  if (!response.ok) return null;
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(coords));
  } catch {
    // Sin caché de sesión; no es crítico.
  }
  return coords;
}

export function useGeocode(address: string | null | undefined) {
  const query = useQuery({
    queryKey: ["geocode", address],
    queryFn: ({ signal }) => geocodeAddress(address!, signal),
    enabled: Boolean(address && address.trim().length >= 4),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    coords: query.data ?? null,
    loading: query.isLoading || query.isFetching,
    error: query.error as Error | null,
  };
}