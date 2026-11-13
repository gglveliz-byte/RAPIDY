/**
 * @archivo src/pages/customer/Profile.tsx
 * @modulo 02-customer-profile (Perfil, Domicilio e Historial de Clientes)
 * @proposito
 *   Pantalla de perfil de cliente para Rapidy.
 *   Diseñada con la estética oficial: cabecera superior Dark Velvet con avatar resplandeciente,
 *   cuerpo de datos luminoso (#F7F7FA), tarjeta flotante de domicilio con geocodificación GPS en vivo,
 *   historial de pedidos interactivo en tarjetas blancas de alta gama, marco legal y barra inferior.
 *
 * @resumen_contenido
 *   - Componente `CustomerProfile`: Muestra datos del cliente, editor de dirección con geolocalización,
 *     listado de órdenes con estados en tiempo real, accesos a políticas legales y cierre de sesión.
 *
 * @dependencias_internas
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCustomerOrders`, `useUpdateCustomerProfile` (@/hooks/useDeliveryData)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`User`, `Phone`, `MapPin`, `ShoppingBag`, `ChevronRight`, `LogOut`, `Navigation`, `Pencil`, `Check`, `X`, `Shield`, `Undo2`, `Trash2`)
 *
 * @tablas_bd_o_redis
 *   - PostgreSQL (Neon): `customers`, `orders`
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
      <div className="mobile-container bg-[#F7F7FA] min-h-screen flex flex-col items-center justify-center px-6 text-center select-none pb-safe-nav">
        <div className="w-20 h-20 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-4 shadow-xs">
          <User className="w-10 h-10 text-[#FF6A00]" />
        </div>
        <h2 className="text-xl font-black text-zinc-900 mb-2">Inicia sesión en Rapidy</h2>
        <p className="text-zinc-500 text-sm max-w-[260px] mb-6">
          Registrate o ingresa con tu número de celular para realizar pedidos
        </p>
        <button
          onClick={() => navigate("/register")}
          className="h-12 px-8 bg-[#FF6A00] hover:bg-[#e65f00] text-white font-bold rounded-2xl shadow-md shadow-[#FF6A00]/30 active:scale-95 transition-all cursor-pointer"
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
    } catch {} finally {
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
    } catch {} finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen text-zinc-900 pb-32 select-none">
      {/* Cabecera Dark Velvet */}
      <div className="bg-gradient-to-b from-[#0E0E12] via-[#141419] to-[#0E0E12] border-b border-white/10 px-4 pt-safe pb-8 relative overflow-hidden shadow-xl text-white">
        <div className="absolute top-0 right-4 w-44 h-24 bg-[#FF6A00]/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3.5 pt-1">
          <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-[#FF6A00] ring-2 ring-[#FF6A00]/30 shadow-[0_0_18px_rgba(255,106,0,0.3)] shrink-0">
            <User className="w-7 h-7 text-white stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-white tracking-tight truncate">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs mt-1 font-medium">
              <Phone className="w-3.5 h-3.5 text-[#FF6A00]" />
              <span>{customer.phone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta Flotante de Dirección */}
      <div className="px-4 -mt-4 relative z-20">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_20px_rgba(0,0,0,0.06)] p-4">
          {editingAddress ? (
            <div>
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#FF6A00] mt-1 shrink-0" />
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="flex-1 text-xs sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none resize-none text-zinc-900"
                  placeholder="Ingresa tu dirección exacta"
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="mt-2.5 w-full h-9 border border-zinc-200 bg-white rounded-xl text-xs text-zinc-700 font-semibold flex items-center justify-center gap-2 hover:bg-zinc-50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Navigation className="w-3.5 h-3.5 text-[#FF6A00]" />
                {geoLoading ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
              </button>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={saveAddress}
                  disabled={saving}
                  className="flex-1 h-9 bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm shadow-[#FF6A00]/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={cancelEditing}
                  className="h-9 px-4 border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-700 min-w-0">
                <MapPin className="w-4 h-4 text-[#FF6A00] mt-0.5 shrink-0" />
                <span className="font-medium truncate">{customer.address || "Sin dirección registrada"}</span>
              </div>
              <button
                onClick={startEditing}
                className="shrink-0 w-8 h-8 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-all cursor-pointer"
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
        <h2 className="text-base sm:text-lg font-black text-zinc-900 tracking-tight mb-3">
          Historial de pedidos
        </h2>

        {ordersLoading ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <div className="h-16 bg-zinc-100 rounded-xl animate-pulse" />
          </div>
        ) : (orders || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
            <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-500">No tienes pedidos aún</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(orders || []).map((order: any) => (
              <button
                key={order.id}
                onClick={() => navigate(`/order/${order.id}`)}
                className="w-full bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 flex items-center justify-between text-left hover:border-zinc-200 hover:shadow-md transition-all group cursor-pointer"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900 group-hover:text-[#FF6A00] transition-colors">
                    Pedido #{order.id}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" • "}
                    <span className="capitalize font-medium text-zinc-600">
                      {order.status === "pending_payment"
                        ? "Revisando pago"
                        : order.status.replace(/_/g, " ")}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-[#FF6A00]">
                    ${order.total}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Información y Marco Legal */}
      <div className="px-4 mt-6">
        <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">
          Información y Marco Legal
        </h2>
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] divide-y divide-zinc-100 overflow-hidden">
          <button
            onClick={() => navigate("/legal")}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#FF6A00]" />
              <span className="text-sm font-semibold text-zinc-800">Centro Legal y Privacidad</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>

          <button
            onClick={() => navigate("/boton-de-arrepentimiento")}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Undo2 className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-zinc-800">Botón de Arrepentimiento (🇦🇷)</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>

          <button
            onClick={() => navigate("/eliminar-cuenta")}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-500">Eliminar cuenta y datos</span>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Cerrar Sesión */}
      <div className="px-4 mt-6 mb-6">
        <button
          onClick={() => {
            logout();
            navigate("/customer-login");
          }}
          className="w-full bg-white hover:bg-red-50 text-red-600 border border-red-100 rounded-2xl p-4 flex items-center justify-center gap-2 font-bold text-sm shadow-[0_2px_12px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4 stroke-[2.2]" />
          <span>Cerrar sesión</span>
        </button>
      </div>

      {/* Navegación Inferior Flotante */}
      <CustomerBottomNav active="profile" />
    </div>
  );
}
