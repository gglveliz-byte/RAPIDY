import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Phone, MapPin, Navigation, Clock, Crosshair, AlertTriangle, Upload } from "lucide-react";
import { useOrder, useUpdatePaymentReceipt } from "@/hooks/useDeliveryData";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import { trpc } from "@/providers/trpc";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ChatBubble from "@/components/ChatBubble";

// Elegant marker styles
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes driverPulse { 0% { box-shadow: 0 3px 12px rgba(46,125,50,0.4); } 50% { box-shadow: 0 3px 20px rgba(46,125,50,0.8); } 100% { box-shadow: 0 3px 12px rgba(46,125,50,0.4); } }
    @keyframes markerBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  `;
  document.head.appendChild(style);
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#2E7D32,#1B5E20);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(46,125,50,0.5);animation:driverPulse 2s infinite;transition:all 0.3s ease;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 18a2 2 0 1 0 4 0a2 2 0 0 0-4 0"/>
      <path d="M15 18a2 2 0 1 0 4 0a2 2 0 0 0-4 0"/>
      <path d="M5 18H3V6a1 1 0 0 1 1-1h10l3 5h2a3 3 0 0 1 3 3v5h-2"/>
      <path d="M9 18h6"/>
      <circle cx="18" cy="10" r="1"/>
    </svg>
  </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function commerceLogoIcon(logoUrl: string, name: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;animation:markerBounce 2s ease-in-out infinite;">
      <div style="width:48px;height:48px;border-radius:14px;border:3px solid white;overflow:hidden;box-shadow:0 3px 10px rgba(0,0,0,0.15);background:white;">
        <img src="${logoUrl}" alt="${name}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>
      </div>
      <div style="margin-top:-2px;background:linear-gradient(135deg,#1565C0,#0D47A1);color:white;font-size:7.5px;font-weight:700;padding:2px 8px;border-radius:0 0 8px 8px;border:1.5px solid white;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;">${name}</div>
    </div>`,
    iconSize: [48, 66],
    iconAnchor: [24, 48],
  });
}

const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#E53935,#C62828);border:3px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(229,57,53,0.4);animation:markerBounce 2s ease-in-out infinite;">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const statusSteps = [
  { key: "received", label: "Recibido", description: "Pedido recibido" },
  { key: "preparing", label: "Preparando", description: "Preparando tu pedido" },
  { key: "ready_for_pickup", label: "Listo", description: "Listo para entregar" },
  { key: "picked_up", label: "Retirado", description: "Repartidor retiró el pedido" },
  { key: "on_the_way", label: "En camino", description: "Repartidor en camino" },
  { key: "delivered", label: "Entregado", description: "Pedido entregado" },
];

export default function OrderTracking() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, loading } = useOrder(Number(id));
  const orderUtils = trpc.useUtils();
  useOrderEvents(Number(id), orderUtils);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const prevDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateReceipt = useUpdatePaymentReceipt();

  const handleReuploadReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          await updateReceipt.mutateAsync({ orderId: Number(id), receipt: base64 });
          alert("Comprobante enviado exitosamente. En espera de revisión.");
        } catch (err) {
          alert("Error al enviar el comprobante.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Geocode delivery address when order loads
  useEffect(() => {
    if (!order?.deliveryAddress || deliveryCoords) return;
    setGeoLoading(true);
    const q = encodeURIComponent(order.deliveryAddress);
    fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=es`, {
      headers: { "User-Agent": "YALlega-App/1.0" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.length > 0) {
          setDeliveryCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        }
      })
      .catch(() => {})
      .finally(() => setGeoLoading(false));
  }, [order?.deliveryAddress]);

  const mapContainerRef = useCallback((element: HTMLDivElement | null) => {
    if (element && !mapRef.current) {
      const map = L.map(element, {
        zoomControl: false,
        attributionControl: false,
      }).setView([-33.45, -70.65], 12);

      // Elegant CartoDB tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      }).addTo(map);

      mapRef.current = map;
    }
    if (!element && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  // Smooth driver marker animation
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
    const duration = 1000;
    const startTime = performance.now();

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const step = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
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

  // Update map markers when order data changes
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

    // Commerce markers with logo images
    if (order.commerces) {
      for (const c of order.commerces) {
        if (c.lat && c.lng) {
          const lat = parseFloat(c.lat);
          const lng = parseFloat(c.lng);
          L.marker([lat, lng], {
            icon: commerceLogoIcon(c.logo || "", c.name),
          }).addTo(map);
          bounds.extend([lat, lng]);
        }
      }
    }

    // Delivery address marker
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

    // Driver marker with smooth animation
    const dlat = driverPos?.lat ?? (order.driver?.currentLat ? parseFloat(order.driver.currentLat) : null);
    const dlng = driverPos?.lng ?? (order.driver?.currentLng ? parseFloat(order.driver.currentLng) : null);

    if (dlat && dlng) {
      if (driverMarkerRef.current) {
        animateDriverMarker(dlat, dlng);
      } else {
        driverMarkerRef.current = L.marker([dlat, dlng], { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${order.driver?.name || "Repartidor"}</b>`);
        prevDriverPosRef.current = { lat: dlat, lng: dlng };
      }
      bounds.extend([dlat, dlng]);

      // Dashed route polyline
      let targetLat: number | null = null;
      let targetLng: number | null = null;
      if (deliveryCoords) {
        targetLat = deliveryCoords.lat;
        targetLng = deliveryCoords.lng;
      } else if (order.commerces?.length > 0) {
        const first = order.commerces.find((c: any) => c.lat && c.lng);
        if (first) { targetLat = parseFloat(first.lat); targetLng = parseFloat(first.lng); }
      }
      if (polylineRef.current) {
        polylineRef.current.setLatLngs([[dlat, dlng], [targetLat || dlat, targetLng || dlng]]);
      } else if (targetLat && targetLng) {
        polylineRef.current = L.polyline(
          [[dlat, dlng], [targetLat, targetLng]],
          { color: "#2E7D32", weight: 3, opacity: 0.7, dashArray: "10,10" }
        ).addTo(map);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [order, driverPos, deliveryCoords, animateDriverMarker]);

  // Listen to SSE for driver location updates
  useEffect(() => {
    if (!order?.driver?.id) return;

    const eventSource = new EventSource(`/api/events/driver/${order.driver.id}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "location_update" && data.lat && data.lng) {
          setDriverPos({ lat: parseFloat(data.lat), lng: parseFloat(data.lng) });
        }
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [order?.driver?.id]);

  // Follow driver
  useEffect(() => {
    if (!followDriver || !driverPos || !mapRef.current) return;
    mapRef.current.setView([driverPos.lat, driverPos.lng], 15, { animate: true });
  }, [followDriver, driverPos]);

  const isDelivered = order?.status === "delivered";
  const isCancelled = order?.status === "cancelled";
  const isPaymentRejected = order?.status === "payment_rejected";
  const hasDriver = !!order?.driver;

  // Auto-redirect to /home after 5s on delivery
  useEffect(() => {
    if (isDelivered) {
      const timer = setTimeout(() => navigate("/home"), 5000);
      return () => clearTimeout(timer);
    }
  }, [isDelivered, navigate]);

  if (loading || !order) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen flex items-center justify-center">
        {loading ? (
          <div className="w-8 h-8 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
        ) : (
          <p className="text-gray-500">Pedido no encontrado</p>
        )}
      </div>
    );
  }

  const currentStepIndex = statusSteps.findIndex((s) => s.key === order.status);
  const progress = currentStepIndex >= 0 ? ((currentStepIndex + 1) / statusSteps.length) * 100 : 0;

  // Estimated time
  const estimatedMinutes = (() => {
    if (!driverPos || !deliveryCoords) return null;
    const R = 6371;
    const dLat = (deliveryCoords.lat - driverPos.lat) * Math.PI / 180;
    const dLng = (deliveryCoords.lng - driverPos.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(driverPos.lat * Math.PI / 180) * Math.cos(deliveryCoords.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(1, Math.round(distanceKm * 3));
  })();

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-safe">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur-md px-4 pt-safe-top pb-3 flex items-center gap-3 border-b border-gray-100 shadow-xs">
        <button 
          onClick={() => navigate("/home")} 
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100 active:scale-90 transition-transform"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-800">Pedido #{order.id}</h1>
          <p className="text-[11px] text-gray-500 font-medium">
            {new Date(order.createdAt).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Elegant Map */}
      <div className="h-60 sm:h-64 bg-gray-100 relative" style={{ zIndex: 1 }}>
        <div ref={mapContainerRef} className="absolute inset-0" />
        {geoLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-10">
            <span className="text-xs text-gray-600 bg-white px-3 py-1.5 rounded-full shadow">Buscando dirección...</span>
          </div>
        )}
        {/* Follow driver button */}
        {driverPos && !isDelivered && !isCancelled && (
          <button
            onClick={() => setFollowDriver(!followDriver)}
            className={`absolute bottom-3 right-3 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
              followDriver ? "bg-[#2E7D32] text-white" : "bg-white text-gray-600"
            }`}
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Driver info strip */}
      {order.driver && !isCancelled && (
        <div className="bg-[#2E7D32]/10 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#2E7D32]" />
            <span className="text-gray-700">
              <strong>{order.driver.name}</strong> — {order.driver.phone}
            </span>
          </div>
          {estimatedMinutes && !isDelivered && (
            <div className="flex items-center gap-1 text-[#2E7D32] font-bold">
              <Clock className="w-3.5 h-3.5" />
              <span>~{estimatedMinutes} min</span>
            </div>
          )}
        </div>
      )}

      {/* Progress or Rejected Payment */}
      <div className="px-4 mt-4">
        {isPaymentRejected ? (
          <div className="bg-red-50 rounded-2xl card-shadow p-5 border border-red-200 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <h3 className="text-lg font-bold text-red-700 mb-1">Pago Rechazado</h3>
            <p className="text-sm text-red-600 mb-4">El comprobante subido no es válido o es ilegible. Por favor, sube el comprobante verdadero para continuar con el pedido.</p>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleReuploadReceipt}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={updateReceipt.isPending}
              className="w-full h-11 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {updateReceipt.isPending ? "Subiendo..." : "Reenviar Comprobante"}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow p-4 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Estado actual</span>
              {!isCancelled && (
                <span className="text-xs font-bold text-[#2E7D32] bg-green-50 px-2.5 py-0.5 rounded-full">
                  {hasDriver && order.commerces?.some((c: any) => c.status !== "preparing")
                    ? `${order.commerces.filter((c: any) => c.status === "picked_up").length}/${order.commerces.length} recogidos`
                    : currentStepIndex >= 0
                      ? statusSteps[currentStepIndex]?.label
                      : order.status === "pending_payment" ? "Revisando pago" : order.status.replace(/_/g, " ")}
                </span>
              )}
              {isCancelled && (
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">Cancelado</span>
              )}
            </div>

            {!isCancelled && (
              <>
                <div className="my-3">
                  <p className="text-base font-bold text-gray-800">
                    {currentStepIndex >= 0 ? statusSteps[currentStepIndex]?.description : "Procesando pedido"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Paso {Math.max(1, currentStepIndex + 1)} de {statusSteps.length}
                  </p>
                </div>

                <div className="progress-track mb-3">
                  <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>

                {/* Compact Step Dots */}
                <div className="flex justify-between items-center px-1">
                  {statusSteps.map((step, i) => (
                    <div key={step.key} className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                          i < currentStepIndex
                            ? "bg-[#2E7D32] text-white"
                            : i === currentStepIndex
                              ? "bg-[#2E7D32] text-white ring-4 ring-[#2E7D32]/20 scale-110"
                              : "bg-gray-200 text-gray-400"
                        }`}
                      >
                        {i < currentStepIndex ? "✓" : i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Commerce Pickup Status — show when driver assigned or any commerce not preparing */}
      {hasDriver && order.commerces?.some((c: any) => c.status !== "preparing") && (
        <div className="px-4 mt-4">
          <div className="bg-white rounded-xl card-shadow p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Recogida en comercios</h3>
            <div className="space-y-2">
              {order.commerces?.map((c: any) => {
                const cStatus = c?.status || "preparing";
                const isReady = cStatus === "ready_for_pickup";
                const isPreparing = cStatus === "preparing";
                const statusLabel = isPreparing ? "Preparando" : isReady ? "Listo para recoger" : "Recogido";
                const statusColor = isPreparing ? "text-gray-600 bg-gray-50" : isReady ? "text-yellow-700 bg-yellow-50" : "text-green-600 bg-green-50";
                return (
                  <div key={c.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600">{c.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Order Details */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl card-shadow p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Detalles del pedido</h3>
          <div className="space-y-2">
            {order.items?.map((item: any) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {Number(item.quantity) % 1 === 0 ? item.quantity : Number(item.quantity).toFixed(2)}x {item.productName}
                </span>
                <span className="text-gray-800 font-medium">${item.total}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>${order.subtotal}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Envio</span>
              <span>${order.deliveryFee}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Comision</span>
              <span>${order.commission}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-800 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span className="text-[#2E7D32]">${order.total}</span>
            </div>
          </div>
        </div>
      </div>

      {!isDelivered && !isCancelled && (
        <>
          <div className="px-4 mt-4">
            <div className="bg-white rounded-xl card-shadow p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Entrega</h3>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-[#2E7D32] mt-0.5 flex-shrink-0" />
                <span>{order.deliveryAddress}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <Phone className="w-4 h-4 text-[#2E7D32] flex-shrink-0" />
                <span>{order.customerPhone}</span>
              </div>
            </div>
          </div>

          <div className="mb-20" />
        </>
      )}

      {!isDelivered && !isCancelled && <ChatBubble orderId={order.id} />}

      {isDelivered && (
        <div className="px-4 mt-6 mb-6">
          <div className="bg-green-50 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-[#2E7D32] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">¡Pedido entregado!</h2>
            <p className="text-sm text-gray-500 mb-6">Gracias por tu compra</p>
            <button
              onClick={() => navigate("/home")}
              className="w-full h-12 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all flex items-center justify-center gap-2"
            >
              Seguir comprando
            </button>
            <p className="text-xs text-gray-400 mt-3">Redirigiendo en 5 segundos...</p>
          </div>
        </div>
      )}
    </div>
  );
}
