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
 *   - `react` (`useRef`, `useEffect`, `useCallback`)
 *   - `lucide-react` (`Navigation`, `Clock`, `Crosshair`)
 */

import { useRef, useEffect, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation, Clock, Crosshair } from "lucide-react";
import { safeImage } from "@/lib/imageUtils";

// Inyección de animaciones CSS para los pines
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes rapDriverPulse { 0% { box-shadow: 0 0 0 0 rgba(255,106,0,0.6); } 70% { box-shadow: 0 0 0 14px rgba(255,106,0,0); } 100% { box-shadow: 0 0 0 0 rgba(255,106,0,0); } }
    @keyframes rapMarkerBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
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
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;animation:rapMarkerBounce 2.5s ease-in-out infinite;">
      <div style="width:44px;height:44px;border-radius:14px;border:3px solid white;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.2);background:white;">
        <img src="${safeImage(logoUrl, 'cover')}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>
      </div>
      <div style="margin-top:-3px;background:#0E0E12;color:white;font-size:8px;font-weight:900;padding:2px 7px;border-radius:0 0 8px 8px;border:1.5px solid white;white-space:nowrap;max-width:85px;overflow:hidden;text-overflow:ellipsis;">${name}</div>
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
  const prevDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const mapContainerRef = useCallback((element: HTMLDivElement | null) => {
    if (element && !mapRef.current) {
      const map = L.map(element, {
        zoomControl: false,
        attributionControl: false,
      }).setView([-0.1807, -78.4678], 13);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    }
    if (!element && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
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

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer !== driverMarkerRef.current && layer !== deliveryMarkerRef.current) {
        map.removeLayer(layer);
      }
      if (layer instanceof L.Polyline && layer !== polylineRef.current) {
        map.removeLayer(layer);
      }
    });

    const bounds = L.latLngBounds([]);

    // Marcadores de comercio
    if (order.commerces) {
      for (const c of order.commerces) {
        if (c.lat && c.lng) {
          const lat = parseFloat(c.lat);
          const lng = parseFloat(c.lng);
          L.marker([lat, lng], { icon: commerceLogoIcon(c.logo || "", c.name) }).addTo(map);
          bounds.extend([lat, lng]);
        }
      }
    }

    // Marcador de destino
    if (deliveryCoords) {
      if (deliveryMarkerRef.current) {
        deliveryMarkerRef.current.setLatLng([deliveryCoords.lat, deliveryCoords.lng]);
      } else {
        deliveryMarkerRef.current = L.marker([deliveryCoords.lat, deliveryCoords.lng], { icon: destinationIcon })
          .addTo(map)
          .bindPopup(`<b>Destino</b><br/>${order.deliveryAddress}`);
      }
      bounds.extend([deliveryCoords.lat, deliveryCoords.lng]);
    }

    // Marcador de repartidor
    const dlat = driverPos?.lat ?? (order.driver?.currentLat ? parseFloat(order.driver.currentLat) : null);
    const dlng = driverPos?.lng ?? (order.driver?.currentLng ? parseFloat(order.driver.currentLng) : null);

    if (dlat && dlng) {
      if (driverMarkerRef.current) {
        animateDriverMarker(dlat, dlng);
      } else {
        driverMarkerRef.current = L.marker([dlat, dlng], { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${order.driver?.name || "Repartidor Rapidy"}</b>`);
        prevDriverPosRef.current = { lat: dlat, lng: dlng };
      }
      bounds.extend([dlat, dlng]);

      // Línea de ruta discontinua en Flame Orange Rapidy
      let targetLat = deliveryCoords?.lat ?? null;
      let targetLng = deliveryCoords?.lng ?? null;
      if (!targetLat && order.commerces?.length > 0) {
        const first = order.commerces.find((c: any) => c.lat && c.lng);
        if (first) { targetLat = parseFloat(first.lat); targetLng = parseFloat(first.lng); }
      }

      if (polylineRef.current) {
        polylineRef.current.setLatLngs([[dlat, dlng], [targetLat || dlat, targetLng || dlng]]);
      } else if (targetLat && targetLng) {
        polylineRef.current = L.polyline(
          [[dlat, dlng], [targetLat, targetLng]],
          { color: "#FF6A00", weight: 3.5, opacity: 0.85, dashArray: "8,8" }
        ).addTo(map);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [order, driverPos, deliveryCoords, animateDriverMarker]);

  // Centrar en chofer si está activo
  useEffect(() => {
    if (!followDriver || !driverPos || !mapRef.current) return;
    mapRef.current.setView([driverPos.lat, driverPos.lng], 15, { animate: true });
  }, [followDriver, driverPos]);

  return (
    <div className="relative">
      <div className="h-60 sm:h-72 bg-zinc-200 relative z-0">
        <div ref={mapContainerRef} className="absolute inset-0" />
        {geoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10 backdrop-blur-2xs">
            <span className="text-xs font-bold text-zinc-800 bg-white/95 px-3.5 py-1.5 rounded-full shadow-md">
              Localizando destino...
            </span>
          </div>
        )}

        {/* Botón de seguir repartidor */}
        {driverPos && !isDelivered && !isCancelled && (
          <button
            onClick={onToggleFollowDriver}
            className={`absolute bottom-3 right-3 z-10 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 cursor-pointer ${
              followDriver ? "bg-[#FF6A00] text-white shadow-[#FF6A00]/40" : "bg-white text-zinc-700 hover:bg-zinc-50 border border-zinc-200"
            }`}
            aria-label="Centrar en repartidor"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Franja de Información del Repartidor */}
      {order.driver && !isCancelled && (
        <div className="bg-[#0E0E12] text-white px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm border-t border-white/10 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-[#FF6A00]/20 flex items-center justify-center text-[#FF6A00] shrink-0">
              <Navigation className="w-3.5 h-3.5" />
            </div>
            <span className="truncate">
              <strong className="text-white">{order.driver.name}</strong> • {order.driver.phone}
            </span>
          </div>
          {estimatedMinutes && !isDelivered && (
            <div className="flex items-center gap-1.5 text-[#FF6A00] font-black shrink-0 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              <Clock className="w-3.5 h-3.5" />
              <span>~{estimatedMinutes} min</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
