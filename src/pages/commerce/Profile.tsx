import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Camera, Store, Mail, FileText, Clock, LocateFixed, MapPin, Phone, Save,
  LogOut, Power
} from "lucide-react";
import { safeImage } from "@/lib/imageUtils";
import {
  useCommerce,
  useMerchantCommerceId,
  useToggleCommerceStatus,
  useUpdateCommerceProfile,
  trpcMutate,
} from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function getAddressFromCoords(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
      { headers: { "User-Agent": "YALlega-App/1.0" } }
    );
    const data = await res.json();
    if (data?.display_name) return data.display_name;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
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

  const storedUser = localStorage.getItem("merchant_user");
  const merchantUser = storedUser ? JSON.parse(storedUser) : null;
  const registeredEmail = merchantUser?.email || "";
  const { commerceId } = useMerchantCommerceId();
  const { data: commerce, loading } = useCommerce(commerceId || 0);

  const [form, setForm] = useState({
    name: "", description: "", address: "", phone: "", email: "",
    logo: "", coverImage: "", minOrder: "", deliveryTime: "", openHours: "",
    lat: "", lng: "",
  });
  const [geoLoading, setGeoLoading] = useState(false);

  const initMap = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
    }
    if ((mapRef.current as any)._leaflet_id) {
      delete (mapRef.current as any)._leaflet_id;
    }
    try {
      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([lat, lng], 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
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
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 15);
    }
  }, []);

  useEffect(() => {
    if (!commerce) return;
    const clat = parseFloat(commerce.lat) || -34.6037;
    const clng = parseFloat(commerce.lng) || -58.3816;
    setForm({
      name: commerce.name || "",
      description: commerce.description || "",
      address: commerce.address || "",
      phone: commerce.phone || "",
      email: commerce.email || "",
      logo: commerce.logo || "",
      coverImage: commerce.coverImage || "",
      minOrder: commerce.minOrder || "",
      deliveryTime: commerce.deliveryTime || "",
      openHours: commerce.openHours || "",
      lat: String(clat),
      lng: String(clng),
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
      await updateCommerceProfile.mutateAsync(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      alert("Error al guardar el perfil");
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
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setForm((prev) => ({ ...prev, logo: dataUrl }));
  };

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setForm((prev) => ({ ...prev, coverImage: dataUrl }));
  };

  const handleGetLocation = async () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
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
      await trpcMutate("login.logout", {});
    } catch {}
    localStorage.removeItem("merchant_user");
    localStorage.removeItem("qs_session");
    navigate("/login");
  };

  if (loading) {
    return (
      <CommerceLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </CommerceLayout>
    );
  }

  const isOpen = commerce?.isOpen === "open";

  return (
    <CommerceLayout>
      <div className="p-2.5 min-[360px]:p-4 lg:p-6 max-w-3xl mx-auto space-y-3 min-[360px]:space-y-4">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 bg-white rounded-2xl p-2.5 min-[360px]:p-4 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                Perfil de mi Negocio
              </h1>
              <p className="text-[10px] text-slate-400 truncate">
                Ajustes de tienda, horarios y contacto
              </p>
            </div>
          </div>

          {/* Quick save button in header */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-8 min-[360px]:h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-emerald-600/25 active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar"}</span>
          </button>
        </div>

        {/* Store Open/Closed Toggle Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-4 shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs min-[360px]:text-sm font-bold text-slate-800">
              Estado Operativo
            </p>
            <p className="text-[10px] min-[360px]:text-xs text-slate-400 mt-0.5">
              {isOpen ? "Aceptando pedidos en la app" : "Comercio cerrado temporalmente"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleOpen}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 flex-shrink-0 ${
              isOpen
                ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {isOpen ? "Cerrar Tienda" : "Abrir Tienda"}
          </button>
        </div>

        {/* Cover & Avatar Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs">
          {/* Cover Photo */}
          <div className="relative h-28 min-[360px]:h-36 bg-gradient-to-r from-emerald-800 to-slate-900">
            {form.coverImage ? (
              <img
                src={safeImage(form.coverImage, "cover")}
                alt="Portada"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = safeImage(null, "cover");
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-xs">
                Imagen de Portada
              </div>
            )}
            <label className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/80 text-white rounded-lg flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors backdrop-blur-xs">
              <Camera className="w-3 h-3" />
              <span>Cambiar Portada</span>
              <input type="file" accept="image/*" onChange={handleCoverFile} className="hidden" />
            </label>
          </div>

          {/* Avatar and Store Title */}
          <div className="px-3 min-[360px]:px-5 pb-3 min-[360px]:pb-4 -mt-9 min-[360px]:-mt-10">
            <div className="flex items-end gap-3">
              <div className="relative w-18 h-18 min-[360px]:w-20 min-[360px]:h-20 rounded-2xl bg-white border-4 border-white shadow-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                {form.logo ? (
                  <img
                    src={safeImage(form.logo, "logo")}
                    alt="Logo"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = safeImage(null, "logo");
                    }}
                  />
                ) : (
                  <Store className="w-8 h-8 text-slate-400" />
                )}
                <label className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                  <input type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                </label>
              </div>

              <div className="flex-1 min-w-0 pb-1">
                <h2 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                  {form.name || commerce?.name}
                </h2>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold inline-block mt-0.5">
                  {commerce?.status || "Activo"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Form Details */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 min-[360px]:p-5 shadow-2xs space-y-3 min-[360px]:space-y-4 text-xs min-[360px]:text-sm">
          
          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Nombre de la Tienda</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800 font-medium" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Email de Registro</label>
              <input type="email" value={registeredEmail} readOnly className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed text-xs" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Descripción / Sobre Nosotros</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Especialidad de la casa, menú diario..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800 resize-none text-xs min-[360px]:text-sm" />
          </div>

          {/* Address & GPS Map */}
          <div className="p-2.5 min-[360px]:p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] min-[360px]:text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Dirección del Local
              </label>
              <button type="button" onClick={handleGetLocation} disabled={geoLoading} className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50">
                <LocateFixed className="w-3 h-3" />
                <span>{geoLoading ? "Obteniendo..." : "Mi Ubicación"}</span>
              </button>
            </div>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ej: Av. Corrientes 1234, CABA" className="w-full h-9 min-[360px]:h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs min-[360px]:text-sm focus:border-emerald-600 outline-none text-slate-800" />
            <div ref={mapRef} className="w-full h-48 min-[360px]:h-56 rounded-xl border border-slate-200 overflow-hidden shadow-2xs z-0" />
            <p className="text-[9px] text-slate-400">Coordenadas: Lat {form.lat || "-"} | Lng {form.lng || "-"}</p>
          </div>

          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Teléfono de Contacto</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+54 9 11 ..." className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Horarios de Atención</label>
              <input type="text" value={form.openHours} onChange={(e) => setForm({ ...form, openHours: e.target.value })} placeholder="Ej: Lun-Vie 11:00 a 23:00" className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800" />
            </div>
          </div>

          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Monto Mínimo de Pedido ($)</label>
              <input type="text" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} placeholder="0.00" className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800" />
            </div>
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Tiempo Estimado de Entrega</label>
              <input type="text" value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} placeholder="Ej: 30-45 min" className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 outline-none text-slate-800" />
            </div>
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full h-10 min-[360px]:h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-600/25 active:scale-98 transition-all flex items-center justify-center gap-2 text-xs min-[360px]:text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Guardando cambios..." : saved ? "¡Cambios guardados con éxito!" : "Guardar Cambios"}</span>
          </button>
        </div>

        {/* Dedicated Mobile & Desktop Logout Section */}
        <div className="bg-red-50/60 rounded-2xl border border-red-200/80 p-3 min-[360px]:p-4 shadow-2xs flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs min-[360px]:text-sm font-bold text-red-800">
              Cerrar Sesión del Comercio
            </h3>
            <p className="text-[10px] text-red-600/80 truncate">
              Sesión activa como {registeredEmail}
            </p>
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
