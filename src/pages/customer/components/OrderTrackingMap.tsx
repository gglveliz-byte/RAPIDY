/**
 * @archivo src/pages/customer/components/OrderTrackingMap.tsx
 * @modulo 02-customer-orders (Mapa de Seguimiento GPS en Vivo)
 * @proposito
 *   Renderizado del mapa interactivo con Leaflet y CartoDB para el seguimiento en tiempo real
 *   del repartidor asignado, comercios involucrados y domicilio de destino.
 *   Estilizado con pines luminosos oficiales Rapidy (Flame Orange #FF6A00 y pulsaciones dinámicas).
 *
 * @resumen_contenido
 *   - Componente `OrderTrackingMap`: Contenedor del mapa, marcadores SVG de repartidor y destino,
 *     polilínea de ruta discontinua, botón de seguir repartidor y cinta de datos de chofer.
 *
 * @dependencias_externas
 *   - `leaflet` (`L`)
 *   - `react` (`useRef`, `useEffect`, `useCallback`, `useState`)
 *   - `lucide-react` (`Navigation`, `Clock`, `Crosshair`)
 *
 * @dependencias_internas
 *   - `DEFAULT_MAP_CENTER`, `geocodeAddress` (@/lib/geocoding)
 */

import { useRef, useEffect, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Clock, Crosshair } from "lucide-react";
import { safeImage } from "@/lib/imageUtils";
import { DEFAULT_MAP_CENTER, geocodeAddress } from "@/lib/geocoding";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

const MAP_STYLE_ID = "rapidy-map-styles";

function ensureMapStyles() {
  if (typeof document === "undefined" || document.getElementById(MAP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MAP_STYLE_ID;
  style.textContent = `
    @keyframes rapDriverPulse { 0% { box-shadow: 0 0 0 0 rgba(255,106,0,0.6); } 70% { box-shadow: 0 0 0 14px rgba(255,106,0,0); } 100% { box-shadow: 0 0 0 0 rgba(255,106,0,0); } }
    @keyframes rapMarkerBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) {
      .leaflet-marker-icon * { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// Ícono Oficial del Repartidor Rapidy (Flame Orange)
const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:42px;height:42px;background:linear-gradient(135deg,#FF5E00,#FF7700);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,106,0,0.5);animation:rapDriverPulse 2s infinite;transition:all 0.3s ease;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="15" cy="5" r="1"/>
      <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
    </svg>
  </div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});

// Ícono del Comercio con Logo
function commerceLogoIcon(logoUrl: string, name: string): L.DivIcon {
  const safeLogo = escapeHtml(safeImage(logoUrl, "cover"));
  const safeName = escapeHtml(name);
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;animation:rapMarkerBounce 2.5s ease-in-out infinite;">
      <div style="width:44px;height:44px;border-radius:14px;border:3px solid white;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.2);background:white;">
        <img src="${safeLogo}" alt="${safeName}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>
      </div>
      <div style="margin-top:-3px;background:#0E0E12;color:white;font-size:8px;font-weight:900;padding:2px 7px;border-radius:0 0 8px 8px;border:1.5px solid white;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>
    </div>`,
    iconSize: [44, 60],
    iconAnchor: [22, 44],
  });
}

// Ícono de Destino (Domicilio del Cliente)
const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#0E0E12,#1F1F28);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,0.4);animation:rapMarkerBounce 2.5s ease-in-out infinite;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

interface OrderTrackingMapProps {
  order: any;
  driverPos: { lat: number; lng: number } | null;
  deliveryCoords: { lat: number; lng: number } | null;
  geoLoading: boolean;
  followDriver: boolean;
  onToggleFollowDriver: () => void;
  estimatedMinutes: number | null;
  isDelivered: boolean;
  isCancelled: boolean;
}

export function OrderTrackingMap({
  order,
  driverPos,
  deliveryCoords,
  geoLoading,
  followDriver,
  onToggleFollowDriver,
  estimatedMinutes,
  isDelivered,
  isCancelled,
}: OrderTrackingMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const commerceMarkersRef = useRef<Map<number, L.Marker>>(new Map());
  const prevDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasFittedRef = useRef(false);
  const [fallbackGeocode, setFallbackGeocode] = useState<{
    address: string;
    coords: { lat: number; lng: number };
  } | null>(null);

  useEffect(() => {
    ensureMapStyles();
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // El hook del padre ya geocodifica; esto solo cubre su fallo o ausencia.
  // La caché y el rate limit del helper evitan duplicar tráfico en éxito.
  useEffect(() => {
    if (deliveryCoords || geoLoading) return;
    const address = order?.deliveryAddress?.trim();
    if (!address) return;
    const controller = new AbortController();
    geocodeAddress(address, { signal: controller.signal }).then((coords) => {
      if (coords && !controller.signal.aborted) setFallbackGeocode({ address, coords });
    });
    return () => controller.abort();
  }, [order?.deliveryAddress, deliveryCoords, geoLoading]);

  const deliveryAddress = order?.deliveryAddress?.trim();
  const effectiveDeliveryCoords =
    deliveryCoords ??
    (fallbackGeocode && fallbackGeocode.address === deliveryAddress
      ? fallbackGeocode.coords
      : null);

  useEffect(() => {
    if (effectiveDeliveryCoords) hasFittedRef.current = false;
  }, [effectiveDeliveryCoords]);

  const mapContainerRef = useCallback((element: HTMLDivElement | null) => {
    if (element && !mapRef.current) {
      const map = L.map(element, {
        zoomControl: false,
        attributionControl: true,
      }).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], 13);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      mapRef.current = map;
    }
    if (!element && mapRef.current) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      mapRef.current.remove();
      mapRef.current = null;
      driverMarkerRef.current = null;
      deliveryMarkerRef.current = null;
      polylineRef.current = null;
      commerceMarkersRef.current.clear();
      prevDriverPosRef.current = null;
      hasFittedRef.current = false;
    }
  }, []);

  // Animación fluida de posición de chofer
  const animateDriverMarker = useCallback((newLat: number, newLng: number) => {
    const marker = driverMarkerRef.current;
    if (!marker) return;

    const prevPos = prevDriverPosRef.current;
    if (!prevPos) {
      marker.setLatLng([newLat, newLng]);
      prevDriverPosRef.current = { lat: newLat, lng: newLng };
      return;
    }

    const startLat = prevPos.lat;
    const startLng = prevPos.lng;
    const duration = 900;
    const startTime = performance.now();

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const step = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const lat = startLat + (newLat - startLat) * ease;
      const lng = startLng + (newLng - startLng) * ease;
      marker.setLatLng([lat, lng]);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        prevDriverPosRef.current = { lat: newLat, lng: newLng };
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Actualización de capas y marcadores
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !order) return;

    const bounds = L.latLngBounds([]);

    // Marcadores de comercio: diff por ID para no recrear pines en cada update.
    const seenCommerceIds = new Set<number>();
    for (const c of order.commerces || []) {
      if (!c.lat || !c.lng) continue;
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      seenCommerceIds.add(c.id);
      const existing = commerceMarkersRef.current.get(c.id);
      if (existing) {
        existing.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { icon: commerceLogoIcon(c.logo || "", c.name) })
          .addTo(map)
          .bindPopup(`<b>${escapeHtml(c.name)}</b>`);
        commerceMarkersRef.current.set(c.id, marker);
      }
      bounds.extend([lat, lng]);
    }
    for (const [id, marker] of commerceMarkersRef.current) {
      if (!seenCommerceIds.has(id)) {
        map.removeLayer(marker);
        commerceMarkersRef.current.delete(id);
      }
    }

    // Marcador de destino
    if (effectiveDeliveryCoords) {
      const popup = `<b>Destino</b><br/>${escapeHtml(order.deliveryAddress)}`;
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.setLatLng([effectiveDeliveryCoords.lat, effectiveDeliveryCoords.lng]);
        deliveryMarkerRef.current.setPopupContent(popup);
      } else {
        deliveryMarkerRef.current = L.marker(
          [effectiveDeliveryCoords.lat, effectiveDeliveryCoords.lng],
          { icon: destinationIcon },
        )
          .addTo(map)
          .bindPopup(popup);
      }
      bounds.extend([effectiveDeliveryCoords.lat, effectiveDeliveryCoords.lng]);
    }

    // Marcador de repartidor
    const rawLat = driverPos?.lat ?? (order.driver?.currentLat ? parseFloat(order.driver.currentLat) : null);
    const rawLng = driverPos?.lng ?? (order.driver?.currentLng ? parseFloat(order.driver.currentLng) : null);
    const dlat = typeof rawLat === "number" && Number.isFinite(rawLat) ? rawLat : null;
    const dlng = typeof rawLng === "number" && Number.isFinite(rawLng) ? rawLng : null;

    if (dlat !== null && dlng !== null) {
      if (driverMarkerRef.current) {
        animateDriverMarker(dlat, dlng);
      } else {
        driverMarkerRef.current = L.marker([dlat, dlng], { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${escapeHtml(order.driver?.name || "Repartidor Rapidy")}</b>`);
        prevDriverPosRef.current = { lat: dlat, lng: dlng };
      }
      bounds.extend([dlat, dlng]);

      let targetLat = effectiveDeliveryCoords?.lat ?? null;
      let targetLng = effectiveDeliveryCoords?.lng ?? null;
      if (targetLat === null && order.commerces?.length > 0) {
        const first = order.commerces.find((c: any) => c.lat && c.lng);
        if (first) {
          targetLat = parseFloat(first.lat);
          targetLng = parseFloat(first.lng);
        }
      }

      if (polylineRef.current) {
        polylineRef.current.setLatLngs([[dlat, dlng], [targetLat ?? dlat, targetLng ?? dlng]]);
      } else if (targetLat !== null && targetLng !== null) {
        polylineRef.current = L.polyline(
          [[dlat, dlng], [targetLat, targetLng]],
          { color: "#FF6A00", weight: 3.5, opacity: 0.85, dashArray: "8,8" }
        ).addTo(map);
      }
    } else if (driverMarkerRef.current) {
      map.removeLayer(driverMarkerRef.current);
      driverMarkerRef.current = null;
      prevDriverPosRef.current = null;
    }

    // Solo ajustar el encuadre la primera vez (o si el usuario pulsa centrar),
    // para no resetear el zoom/pan en cada actualización del repartidor.
    if (!hasFittedRef.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      hasFittedRef.current = true;
    }
  }, [order, driverPos, effectiveDeliveryCoords, animateDriverMarker]);

  // Centrar en chofer si está activo
  useEffect(() => {
    if (!followDriver || !driverPos || !mapRef.current) return;
    mapRef.current.setView([driverPos.lat, driverPos.lng], 15, { animate: true });
  }, [followDriver, driverPos]);

  return (
    <div className="relative border-b border-zinc-200 dark:border-white/10">
      <div className="h-60 sm:h-72 bg-zinc-200 dark:bg-[#121216] relative z-0">
        <div ref={mapContainerRef} className="absolute inset-0" />
        {geoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 dark:bg-black/50 z-10 backdrop-blur-2xs">
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 bg-white/95 dark:bg-[#1A1A1E]/95 border border-zinc-200/80 dark:border-white/10 px-3.5 py-1.5 rounded-full shadow-md">
              Localizando destino...
            </span>
          </div>
        )}

        {/* Botón de seguir repartidor */}
        {driverPos && !isDelivered && !isCancelled && (
          <button
            onClick={onToggleFollowDriver}
            className={`absolute bottom-3 right-3 z-10 w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 cursor-pointer ${
              followDriver
                ? "bg-brand text-white shadow-brand/40"
                : "bg-white dark:bg-[#1A1A1E] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10"
            }`}
            aria-label={followDriver ? "Dejar de seguir al repartidor" : "Centrar en el repartidor"}
            aria-pressed={followDriver}
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Franja de Información del Repartidor */}
      {order.driver && !isCancelled && (
        <div className="bg-ink dark:bg-[#1A1A1E] text-white px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm border-t border-white/10 dark:border-white/10 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-brand/20 flex items-center justify-center text-brand shrink-0">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <span className="truncate">
              <strong className="text-white">{order.driver.name}</strong>
              {order.driver.phone ? ` • ${order.driver.phone}` : ""}
            </span>
          </div>
          {estimatedMinutes && !isDelivered && (
            <div className="flex items-center gap-1.5 text-brand font-black shrink-0 bg-white/5 dark:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10">
              <Clock className="w-3.5 h-3.5" />
              <span>≈{estimatedMinutes} min</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

