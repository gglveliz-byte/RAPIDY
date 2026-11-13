/**
 * @archivo src/pages/customer/Profile.tsx
 * @modulo Cliente / Perfil
 * @descripcion Vista de perfil de usuario en la plataforma Rapidy con estética Dark Velvet & Flame Orange.
 * Permite visualizar datos del usuario, editar dirección con geolocalización GPS, consultar historial de pedidos,
 * acceder al marco legal y cerrar sesión.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Phone,
  MapPin,
  ShoppingBag,
  ChevronRight,
  LogOut,
  Navigation,
  Pencil,
  Check,
  X,
  Shield,
  Undo2,
  Trash2,
} from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCustomerOrders, useUpdateCustomerProfile } from "@/hooks/useDeliveryData";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { getAddressFromCoords } from "@/lib/locationUtils";

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { customer, login, logout, isAuthenticated } = useCustomerSession();
  const [editingAddress, setEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const customerId = customer?.id ?? 0;
  const { data: orders, loading: ordersLoading } = useCustomerOrders(customerId);
  const updateCustomerProfile = useUpdateCustomerProfile();

  if (!isAuthenticated || !customer) {
    return (
      <div className="mobile-container bg-[#121212] min-h-screen text-white flex flex-col items-center justify-center px-6 pb-safe-nav">
        <User className="w-16 h-16 text-zinc-600 mb-4" />
        <h2 className="text-white font-bold text-xl mb-2">Inicia sesión</h2>
        <p className="text-zinc-400 text-sm text-center mb-6">
          Regístrate con tu número de celular para realizar pedidos
        </p>
        <button
          onClick={() => navigate("/register")}
          className="h-12 px-8 bg-gradient-to-r from-[#FF6A00] to-[#EE5A00] text-white font-bold rounded-xl shadow-[0_4px_16px_rgba(255,106,0,0.35)] hover:brightness-110 transition-all active:scale-[0.98]"
        >
          Crear cuenta
        </button>

        <CustomerBottomNav active="profile" />
      </div>
    );
  }

  const handleGetLocation = async () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const addr = await getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
      setEditAddress(addr);
    } catch {
    } finally {
      setGeoLoading(false);
    }
  };

  const startEditing = () => {
    setEditAddress(customer.address);
    setEditingAddress(true);
  };

  const cancelEditing = () => {
    setEditingAddress(false);
    setEditAddress("");
  };

  const saveAddress = async () => {
    if (!editAddress.trim()) return;
    setSaving(true);
    try {
      await updateCustomerProfile.mutateAsync({ address: editAddress.trim() });
      login({ ...customer, address: editAddress.trim() });
      setEditingAddress(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-container bg-[#121212] min-h-screen text-white pb-safe-nav">
      {/* Cabecera de Perfil Autenticado */}
      <div className="bg-gradient-to-b from-[#0E0E12] via-[#141419] to-[#0E0E12] border-b border-white/10 px-4 pt-safe pb-8 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-4 w-44 h-24 bg-[#FF6A00]/15 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-[#FF6A00] ring-2 ring-[#FF6A00]/30 shadow-[0_0_18px_rgba(255,106,0,0.3)] shrink-0">
            <User className="w-7 h-7 text-[#FF6A00] stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs mt-1 font-medium">
              <Phone className="w-3.5 h-3.5" />
              <span>{customer.phone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta de Dirección Flotante */}
      <div className="px-4 -mt-4 relative z-10">
        <div className="bg-[#18181F] border border-white/10 rounded-2xl p-4 shadow-xl">
          {editingAddress ? (
            <div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FF6A00] mt-0.5 shrink-0" />
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="flex-1 text-sm bg-white/5 border border-white/15 text-white rounded-xl p-3 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none resize-none placeholder-zinc-500"
                  placeholder="Ingresa tu dirección..."
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="w-full border border-white/10 text-zinc-300 hover:bg-white/5 rounded-xl h-9 text-xs font-semibold flex items-center justify-center gap-2 mt-2 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                <Navigation className="w-3.5 h-3.5 text-[#FF6A00]" />
                {geoLoading ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
              </button>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveAddress}
                  disabled={saving}
                  className="flex-1 bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold h-9 rounded-xl text-xs flex items-center justify-center gap-1 shadow-md disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={cancelEditing}
                  className="h-9 px-4 border border-white/10 text-zinc-400 hover:bg-white/5 h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 text-sm text-zinc-200 font-medium">
                <MapPin className="w-4 h-4 text-[#FF6A00] mt-0.5 shrink-0" />
                <span className="leading-snug">{customer.address || "Sin dirección registrada"}</span>
              </div>
              <button
                onClick={startEditing}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all shrink-0"
                aria-label="Editar dirección"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Historial de Pedidos */}
      <div className="px-4 mt-6">
        <h2 className="text-white font-bold text-base mb-3">Historial de pedidos</h2>
        {ordersLoading ? (
          <div className="bg-[#18181F] border border-white/10 rounded-2xl p-6 shadow-lg">
            <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-[#18181F] border border-white/10 rounded-2xl p-6 text-center shadow-lg">
            <ShoppingBag className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-400 text-sm">No tienes pedidos aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order: any) => (
              <button
                key={order.id}
                onClick={() => navigate(`/order/${order.id}`)}
                className="w-full bg-[#18181F] border border-white/10 rounded-2xl p-4 flex items-center justify-between text-left hover:border-white/20 transition-all shadow-md group"
              >
                <div>
                  <p className="text-white font-bold text-sm group-hover:text-[#FF6A00] transition-colors">
                    Pedido #{order.id}
                  </p>
                  <p className="text-zinc-400 text-xs mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" - "}
                    <span className="capitalize">
                      {order.status === "pending_payment" ? "Revisando pago" : order.status.replace(/_/g, " ")}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-extrabold text-[#FF6A00]">${order.total}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Información y Marco Legal */}
      <div className="px-4 mt-6">
        <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
          Información y Marco Legal
        </h2>
        <div className="bg-[#18181F] border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-lg">
          <button
            onClick={() => navigate("/legal")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#FF6A00]" />
              <span className="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">
                Centro Legal y Privacidad
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
          </button>

          <button
            onClick={() => navigate("/boton-de-arrepentimiento")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Undo2 className="w-4 h-4 text-amber-400" />
              <span className="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">
                Botón de Arrepentimiento (🇦🇷)
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
          </button>

          <button
            onClick={() => navigate("/eliminar-cuenta")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span className="text-red-400/80 text-sm font-medium group-hover:text-red-400 transition-colors">
                Eliminar cuenta y datos
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* Botón Cerrar Sesión */}
      <div className="px-4 mt-6 mb-6">
        <button
          onClick={() => {
            logout();
            navigate("/customer-login");
          }}
          className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm shadow-sm transition-all active:scale-[0.98]"
        >
          <LogOut className="w-4 h-4 stroke-[2.2]" />
          <span>Cerrar sesión</span>
        </button>
      </div>

      <CustomerBottomNav active="profile" />
    </div>
  );
}
