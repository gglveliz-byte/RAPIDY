/**
 * @archivo src/pages/commerce/Profile.tsx
 * @modulo Comercio - Perfil, Horarios y Ubicación
 * @proposito
 *   Configuración integral del comercio: datos comerciales, fotografías (logo y portada),
 *   horarios, monto mínimo, tiempo de entrega, geolocalización interactiva con Leaflet/OSM
 *   y conmutador de estado operativo (abierto/cerrado).
 *
 * @resumen_contenido
 *   - `CommerceProfile`: Vista y formulario de ajustes del comercio.
 *   - Leaflet Map: Pin personalizado Flame Orange (#FF6A00) y geocodificación reversa OSM Nominatim.
 *   - Mutaciones: `useUpdateCommerceProfile` y `useToggleCommerceStatus`.
 *
 * @dependencias_internas
 *   - `useCommerce`, `useMerchantCommerceId`, `useToggleCommerceStatus`, `useUpdateCommerceProfile`, `trpcMutate` (@/hooks/useDeliveryData)
 *   - `CommerceLayout` (@/components/CommerceLayout)
 *   - `safeImage` (@/lib/imageUtils)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Camera, Store, LocateFixed, MapPin, Save, LogOut, Power } from "lucide-react";
import { safeImage } from "@/lib/imageUtils";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";
import {
  useCommerce,
  useMerchantCommerceId,
  useToggleCommerceStatus,
  useUpdateCommerceProfile,
  trpcMutate,
} from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";
import { queryClient } from "@/providers/trpc";
import {
  clearRoleUser,
  clearSession,
  dispatchLogout,
  getRoleUser,
} from "@/hooks/useSessionSync";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Pin de mapa estilizado con identidad Flame Orange (#FF6A00) de Rapidy */
function createFlamePinIcon(): L.DivIcon {
  return L.divIcon({
    className: "rapidy-flame-marker",
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:grab;"><div style="background:#FF6A00;color:#fff;width:38px;height:38px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(255,106,0,0.45);border:2.5px solid #fff;"><svg style="transform:rotate(45deg);width:18px;height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg></div><div style="width:12px;height:4px;background:rgba(0,0,0,0.25);border-radius:50%;margin-top:3px;filter:blur(1px);"></div></div>`,
    iconSize: [38, 44],
    iconAnchor: [19, 44],
  });
}



async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
      { headers: { "User-Agent": "Rapidy-App/1.0" } }
    );
    const data = await res.json();
    return data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

export default function CommerceProfile() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const hydratedCommerceRef = useRef<number | null>(null);

  const merchantUser = getRoleUser<{ email?: string }>("merchant");
  const registeredEmail = merchantUser?.email || "";
  const {
    commerceId,
    loading: commerceLoading,
    error: commerceError,
    refresh: refreshCommerce,
  } = useMerchantCommerceId();
  const { data: commerce, loading, error, refresh } = useCommerce(commerceId || 0);
  const isLoading = commerceLoading || loading;
  const loadError = commerceError || error;

  const [form, setForm] = useState({
    name: "", description: "", address: "", phone: "", email: "",
    logo: "", coverImage: "", minOrder: "", deliveryTime: "", openHours: "",
    lat: "", lng: "",
  });
  const [geoLoading, setGeoLoading] = useState(false);

  const initMap = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch {}
      mapInstanceRef.current = null;
    }
    if ((mapRef.current as any)._leaflet_id) delete (mapRef.current as any)._leaflet_id;
    try {
      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true, icon: createFlamePinIcon() }).addTo(map);
      marker.on("dragend", async () => {
        const pos = marker.getLatLng();
        setForm((prev) => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
        const addr = await getAddressFromCoords(pos.lat, pos.lng);
        setForm((prev) => ({ ...prev, address: addr }));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } catch (e) {
      console.warn("Leaflet map init caught:", e);
    }
  }, []);

  const updateMarker = useCallback((lat: number, lng: number) => {
    if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
    if (mapInstanceRef.current) mapInstanceRef.current.setView([lat, lng], 15);
  }, []);

  useEffect(() => {
    if (!commerce) return;
    // Solo hidratar al cambiar de comercio; un refetch no debe borrar
    // cambios locales que el usuario todavía no guardó.
    if (hydratedCommerceRef.current === commerce.id) return;
    hydratedCommerceRef.current = commerce.id;

    // Quito solo se usa para centrar el mapa; no se persiste si el comercio
    // todavía no tiene coordenadas.
    const hasCoords = Boolean(commerce.lat && commerce.lng);
    const clat = hasCoords ? parseFloat(commerce.lat) : -0.1807;
    const clng = hasCoords ? parseFloat(commerce.lng) : -78.4678;
    setForm({
      name: commerce.name || "", description: commerce.description || "",
      address: commerce.address || "", phone: commerce.phone || "", email: commerce.email || "",
      logo: commerce.logo || "", coverImage: commerce.coverImage || "",
      minOrder: commerce.minOrder || "", deliveryTime: commerce.deliveryTime || "",
      openHours: commerce.openHours || "",
      lat: hasCoords ? String(commerce.lat) : "",
      lng: hasCoords ? String(commerce.lng) : "",
    });
    const t = setTimeout(() => initMap(clat, clng), 150);
    return () => {
      clearTimeout(t);
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [commerce, initMap]);

  const updateCommerceProfile = useUpdateCommerceProfile(commerceId || 0);
  const toggleCommerceStatus = useToggleCommerceStatus(commerceId || 0);

  const handleSave = async () => {
    if (!commerceId) return;
    setSaving(true);
    setSaved(false);
    try {
      const { email: _email, ...editable } = form;
      const payload: Record<string, unknown> = { ...editable };
      if (!payload.minOrder) delete payload.minOrder;
      if (!payload.lat) delete payload.lat;
      if (!payload.lng) delete payload.lng;
      await updateCommerceProfile.mutateAsync(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error al guardar el perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOpen = async () => {
    if (!commerceId) return;
    try {
      await toggleCommerceStatus.mutateAsync();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxWidth: 640,
        maxHeight: 640,
        quality: 0.82,
      });
      setForm((prev) => ({ ...prev, logo: dataUrl }));
    }
  };

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxWidth: 1600,
        maxHeight: 900,
        quality: 0.8,
      });
      setForm((prev) => ({ ...prev, coverImage: dataUrl }));
    }
  };

  const handleGetLocation = async () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const addr = await getAddressFromCoords(lat, lng);
      setForm((prev) => ({ ...prev, address: addr, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
      updateMarker(lat, lng);
    } catch {} finally {
      setGeoLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await trpcMutate("commerce.unregisterDeviceToken", {});
    } catch { /* el logout debe continuar */ }
    try {
      await trpcMutate("login.logout", { scope: "merchant" });
    } catch {
      // La cookie se limpia igual en el servidor cuando vuelva la conexión.
    }
    clearRoleUser("merchant");
    clearSession("merchant");
    dispatchLogout("merchant");
    queryClient.clear();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <CommerceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
        </div>
      </CommerceLayout>
    );
  }

  if (loadError) {
    return (
      <CommerceLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center mb-3">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white">No se pudo cargar el perfil</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
            {loadError.message || "Revisa tu conexión e inténtalo de nuevo."}
          </p>
          <button
            type="button"
            onClick={() => {
              refreshCommerce();
              refresh();
            }}
            className="mt-4 px-4 py-2 rounded-xl bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold"
          >
            Reintentar
          </button>
        </div>
      </CommerceLayout>
    );
  }

  if (!commerce) {
    return (
      <CommerceLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mb-3">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-zinc-800 dark:text-white">Comercio sin asignar</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs">
            Tu usuario no tiene un comercio vinculado. Contacta a soporte para completar la configuración.
          </p>
        </div>
      </CommerceLayout>
    );
  }

  const isOpen = commerce.isOpen === "open";
  const isActive = commerce.status === "active";

  return (
    <CommerceLayout>
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 min-[380px]:space-y-5">
        
        {/* Barra Superior de Cabecera */}
        <div className="flex items-center justify-between gap-2 bg-white dark:bg-[#16161B] rounded-2xl min-[380px]:rounded-3xl p-3 min-[380px]:p-4.5 border border-slate-200/80 dark:border-white/10 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-8.5 h-8.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-zinc-200 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-900 dark:text-white truncate">Perfil de mi Negocio</h1>
              <p className="text-[10px] min-[360px]:text-xs text-slate-400 dark:text-zinc-400 truncate">Ajustes comerciales, horarios y geolocalización</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-8.5 min-[360px]:h-9 px-3.5 bg-[#FF6A00] hover:bg-[#e65f00] text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-[#FF6A00]/25 active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar"}</span>
          </button>
        </div>

        {/* Tarjeta de Estado Operativo */}
        <div className="bg-white dark:bg-[#16161B] rounded-2xl border border-slate-200/80 dark:border-white/10 p-3 min-[360px]:p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isOpen && isActive ? "bg-[#FF6A00] ring-4 ring-[#FF6A00]/20 animate-pulse" : "bg-slate-300 dark:bg-zinc-600"}`} />
              <p className="text-xs min-[360px]:text-sm font-bold text-slate-900 dark:text-white">Estado Operativo</p>
            </div>
            <p className="text-[10px] min-[360px]:text-xs text-slate-500 dark:text-zinc-400 mt-0.5 ml-4.5 truncate">
              {!isActive
                ? "Comercio pendiente de activación o suspendido. Contacta a soporte."
                : isOpen
                  ? "Aceptando pedidos en vivo en la app Rapidy"
                  : "Comercio cerrado temporalmente"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleOpen}
            disabled={toggleCommerceStatus.isPending || !isActive}
            className={`px-3 py-1.5 min-[360px]:px-3.5 min-[360px]:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 flex-shrink-0 shadow-xs disabled:opacity-50 ${
              isOpen
                ? "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-slate-200 dark:border-white/10"
                : "bg-[#FF6A00] text-white hover:bg-[#e65f00] shadow-[#FF6A00]/20"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {toggleCommerceStatus.isPending ? "Actualizando..." : isOpen ? "Cerrar Tienda" : "Abrir Tienda"}
          </button>
        </div>

        {/* Banner de Portada & Foto de Logo */}
        <div className="bg-white dark:bg-[#16161B] rounded-2xl min-[380px]:rounded-3xl border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-xs">
          {/* Portada estilo Dark Velvet #0E0E12 a #18181F */}
          <div className="relative h-28 min-[360px]:h-36 sm:h-44 bg-gradient-to-r from-[#0E0E12] via-[#14141A] to-[#18181F]">
            {form.coverImage ? (
              <img
                src={safeImage(form.coverImage, "cover")}
                alt="Portada"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = safeImage(null, "cover"); }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-medium">Banner de Portada del Comercio</div>
            )}
            <label className="absolute bottom-2.5 right-2.5 px-2.5 py-1.5 bg-black/60 hover:bg-black/80 text-white rounded-xl flex items-center gap-1.5 text-[10px] min-[360px]:text-[11px] font-bold cursor-pointer transition-all border border-white/20 hover:border-white/40 backdrop-blur-md shadow-sm active:scale-95">
              <Camera className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>Cambiar Portada</span>
              <input type="file" accept="image/*" onChange={handleCoverFile} className="hidden" />
            </label>
          </div>

          {/* Logo superpuesto con anillo Flame Orange y badge dinámico */}
          <div className="px-3 min-[360px]:px-5 pb-3 min-[360px]:pb-4">
            <div className="flex items-center gap-3.5 -mt-9 min-[360px]:-mt-11">
              <div className="relative w-18 h-18 min-[360px]:w-22 min-[360px]:h-22 rounded-2xl bg-[#0E0E12] ring-4 ring-[#FF6A00]/25 border-2 border-[#FF6A00] shadow-md overflow-hidden flex-shrink-0 flex items-center justify-center group">
                {form.logo ? (
                  <img
                    src={safeImage(form.logo, "logo")}
                    alt="Logo del comercio"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = safeImage(null, "logo"); }}
                  />
                ) : (
                  <Store className="w-8 h-8 text-slate-400" />
                )}
                <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity backdrop-blur-xs text-white">
                  <Camera className="w-4 h-4 text-[#FF6A00]" />
                  <span className="text-[9px] font-bold mt-0.5">Editar</span>
                  <input type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                </label>
              </div>

              <div className="flex-1 min-w-0 pt-9 min-[360px]:pt-11">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm min-[360px]:text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
                    {form.name || commerce?.name || "Mi Negocio"}
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isOpen ? "bg-[#FF6A00]/10 text-[#FF6A00] border border-[#FF6A00]/30" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-white/10"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-[#FF6A00] animate-pulse" : "bg-slate-400"}`} />
                    {!isActive ? "No activo" : isOpen ? "Abierto" : "Cerrado"}
                  </span>
                </div>
                <p className="text-[10px] min-[360px]:text-xs text-slate-400 dark:text-zinc-400 truncate mt-0.5">
                  ID: #{commerceId || "0"} • {form.openHours || "Horario pendiente"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulario Principal de Datos del Negocio */}
        <div className="bg-white dark:bg-[#16161B] rounded-2xl min-[380px]:rounded-3xl border border-slate-200/80 dark:border-white/10 p-3 min-[360px]:p-5 shadow-xs space-y-3.5 min-[360px]:space-y-4 text-xs min-[360px]:text-sm">
          
          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Nombre de la Tienda</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Hamburguesas La Floresta" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white font-medium transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Email de Registro</label>
              <input type="email" value={registeredEmail} readOnly className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-white/10 rounded-xl text-slate-500 dark:text-zinc-400 cursor-not-allowed text-xs font-medium" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Descripción / Sobre Nosotros</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Especialidad de la casa, menú diario, ingredientes frescos..." className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white resize-none text-xs min-[360px]:text-sm transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
          </div>

          {/* Dirección y Mapa de Geolocalización Leaflet */}
          <div className="p-3 min-[360px]:p-4 bg-slate-50/70 dark:bg-zinc-900/60 rounded-2xl border border-slate-200/80 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" /> Dirección del Local
              </label>
              <button type="button" onClick={handleGetLocation} disabled={geoLoading} className="px-2.5 py-1 rounded-xl bg-[#FF6A00] hover:bg-[#e65f00] text-white text-[10px] min-[360px]:text-xs font-bold flex items-center gap-1 shadow-sm shadow-[#FF6A00]/25 transition-all active:scale-95 disabled:opacity-50">
                <LocateFixed className="w-3 h-3" />
                <span>{geoLoading ? "Obteniendo..." : "Mi Ubicación"}</span>
              </button>
            </div>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ej: Av. Amazonas y Naciones Unidas, Quito" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl text-xs min-[360px]:text-sm focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white transition-all font-medium placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            <div ref={mapRef} className="w-full h-48 min-[360px]:h-56 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-xs z-0" />
            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-400 px-1">
              <span>Arrastra el pin naranja para ajustar la ubicación exacta</span>
              <span>Lat: {form.lat || "-"} | Lng: {form.lng || "-"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Teléfono de Contacto</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+593 99 123 4567" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white font-medium transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Horarios de Atención</label>
              <input type="text" value={form.openHours} onChange={(e) => setForm({ ...form, openHours: e.target.value })} placeholder="Ej: Lun-Sáb 11:00 a 22:00" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white font-medium transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Monto Mínimo de Pedido ($ USD)</label>
              <input type="text" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} placeholder="5.00" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white font-medium transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">Tiempo Estimado de Entrega</label>
              <input type="text" value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} placeholder="Ej: 30-45 min" className="w-full h-9.5 min-[360px]:h-10 px-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800 dark:text-white font-medium transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500" />
            </div>
          </div>

          {/* Botón Guardar Cambios Principal */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold py-3 px-6 rounded-2xl shadow-lg shadow-[#FF6A00]/25 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs min-[360px]:text-sm disabled:opacity-50 mt-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Guardando cambios..." : saved ? "¡Cambios guardados con éxito!" : "Guardar Cambios"}</span>
          </button>
        </div>

        {/* Sección de Cerrar Sesión del Comercio */}
        <div className="bg-red-50/60 dark:bg-red-950/20 rounded-2xl border border-red-200/80 dark:border-red-900/30 p-3 min-[360px]:p-4 shadow-xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs min-[360px]:text-sm font-bold text-red-800 dark:text-red-300">Cerrar Sesión del Comercio</h3>
            <p className="text-[10px] text-red-600/80 dark:text-red-400/80 truncate">Sesión activa como {registeredEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-red-600/25 active:scale-95 transition-all flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Salir</span>
          </button>
        </div>

      </div>
    </CommerceLayout>
  );
}
