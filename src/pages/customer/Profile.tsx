/**
 * @archivo src/pages/customer/Profile.tsx
 * @modulo 02-customer-profile (Perfil, Domicilio e Historial de Clientes)
 * @proposito
 *   Pantalla de perfil de cliente para Rapidy.
 *   Diseñada con cabecera superior fixed Dark Velvet, botón de cierre de sesión integrado
 *   en el encabezado, tarjeta de presentación del cliente, editor de domicilio con GPS Nominatim,
 *   vista previa del historial de pedidos con modal completo deslizable y marco legal.
 *
 * @resumen_contenido
 *   - Componente `CustomerProfile`: Datos del cliente, botón de logout en cabecera fixed,
 *     editor de dirección, vista previa de última orden, modal de historial y enlaces legales.
 *
 * @dependencias_internas
 *   - `CustomerBottomNav` (@/components/CustomerBottomNav)
 *   - `useCustomerSession` (@/hooks/useCustomerSession)
 *   - `useCustomerOrders`, `useUpdateCustomerProfile` (@/hooks/useDeliveryData)
 *   - `getAddressFromCoords` (@/lib/locationUtils)
 *   - `ProfileOrdersModal` (./components/ProfileOrdersModal)
 *
 * @dependencias_externas
 *   - `react` (`useState`)
 *   - `react-router` (`useNavigate`)
 *   - `lucide-react` (`User`, `Phone`, `MapPin`, `ShoppingBag`, `ChevronRight`, `LogOut`, `Navigation`, `Pencil`, `Check`, `X`, `Shield`, `Undo2`, `Trash2`, `Sparkles`, `Clock`)
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
  Sparkles,
  Clock,
} from "lucide-react";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCustomerOrders, useUpdateCustomerProfile } from "@/hooks/useDeliveryData";
import { CustomerBottomNav } from "@/components/CustomerBottomNav";
import { getAddressFromCoords } from "@/lib/locationUtils";
import { ProfileOrdersModal } from "./components/ProfileOrdersModal";

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { customer, login, logout, isAuthenticated } = useCustomerSession();
  const [editingAddress, setEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllOrdersModal, setShowAllOrdersModal] = useState(false);

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

  const handleLogout = () => {
    logout();
    navigate("/customer-login");
  };

  const ordersList = orders || [];
  const previewOrders = ordersList.slice(0, 2);

  return (
    <div className="mobile-container bg-[#F7F7FA] min-h-screen text-zinc-900 pb-32 select-none">
      {/* 1. Cabecera Fija Dark Velvet (Fixed Top Header con datos del cliente y salir) */}
      <header className="fixed top-0 left-0 right-0 max-w-[480px] mx-auto z-40 bg-[#0E0E12]/95 backdrop-blur-2xl border-b border-white/10 shadow-xl px-4 pt-safe pb-2.5 transition-all flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-[#FF6A00] ring-1 ring-[#FF6A00]/40 shadow-xs shrink-0">
            <User className="w-4 h-4 text-[#FF6A00]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs sm:text-sm font-black text-white tracking-tight truncate">
                {customer.firstName} {customer.lastName}
              </span>
              <Sparkles className="w-3 h-3 text-[#FF6A00] shrink-0" />
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-400 font-medium truncate">
              <Phone className="w-3 h-3 text-[#FF6A00] shrink-0" />
              <span className="truncate">{customer.phone}</span>
            </div>
          </div>
        </div>

        {/* Botón Salir reubicado en la cabecera fija */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 hover:text-red-300 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs shrink-0 ml-2"
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-3.5 h-3.5 stroke-[2.2]" />
          <span>Salir</span>
        </button>
      </header>

      {/* 2. Contenido desplazable por detrás de la cabecera fija */}
      <div className="px-4 pt-[calc(env(safe-area-inset-top,0px)+68px)] space-y-4">
        {/* Tarjeta de Dirección de Entrega con Edición / GPS */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_4px_16px_rgba(0,0,0,0.05)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
              Dirección de entrega
            </span>
            {!editingAddress && (
              <button
                onClick={startEditing}
                className="w-7 h-7 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                aria-label="Editar dirección"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {editingAddress ? (
            <div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FF6A00] mt-1 shrink-0" />
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="flex-1 text-xs sm:text-sm bg-zinc-50 border border-zinc-200 rounded-xl p-2.5 focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none resize-none text-zinc-900"
                  placeholder="Ingresa tu dirección completa"
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="mt-2 w-full h-8 border border-zinc-200 bg-white rounded-xl text-xs text-zinc-700 font-semibold flex items-center justify-center gap-2 hover:bg-zinc-50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Navigation className="w-3.5 h-3.5 text-[#FF6A00]" />
                {geoLoading ? "Obteniendo ubicación..." : "Usar mi ubicación GPS actual"}
              </button>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveAddress}
                  disabled={saving}
                  className="flex-1 h-8 bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm shadow-[#FF6A00]/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={cancelEditing}
                  className="h-8 px-3 border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-xs sm:text-sm text-zinc-700">
              <MapPin className="w-4 h-4 text-[#FF6A00] mt-0.5 shrink-0" />
              <span className="font-semibold">{customer.address || "Sin dirección guardada"}</span>
            </div>
          )}
        </div>

        {/* Sección de Historial de Pedidos (Preview + Botón de Modal) */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-black text-zinc-900 tracking-tight">
              Historial de pedidos
            </h2>
            {ordersList.length > 0 && (
              <button
                onClick={() => setShowAllOrdersModal(true)}
                className="text-xs font-bold text-[#FF6A00] hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>Ver todos ({ordersList.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {ordersLoading ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
              <div className="h-14 bg-zinc-100 rounded-xl animate-pulse" />
            </div>
          ) : ordersList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 text-center">
              <ShoppingBag className="w-10 h-10 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500">No tienes pedidos aún</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {previewOrders.map((order: any) => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/order/${order.id}`)}
                  className="w-full bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-3.5 flex items-center justify-between text-left hover:border-[#FF6A00]/40 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900 group-hover:text-[#FF6A00] transition-colors">
                        Pedido #{order.id}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-50 text-[#FF6A00] border border-orange-100">
                        {order.status === "pending_payment"
                          ? "Revisando pago"
                          : order.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span>
                        {new Date(order.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-[#FF6A00]">${order.total}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-[#FF6A00] transition-colors" />
                  </div>
                </button>
              ))}

              {ordersList.length > 2 && (
                <button
                  onClick={() => setShowAllOrdersModal(true)}
                  className="w-full py-2.5 px-4 bg-white border border-zinc-200/80 hover:bg-zinc-50 rounded-2xl text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <span>Ver los {ordersList.length} pedidos anteriores</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#FF6A00]" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Información y Marco Legal */}
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">
            Información y Marco Legal
          </h2>
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] divide-y divide-zinc-100 overflow-hidden">
            <button
              onClick={() => navigate("/legal")}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-[#FF6A00]" />
                <span className="text-xs sm:text-sm font-semibold text-zinc-800">
                  Centro Legal y Privacidad
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>

            <button
              onClick={() => navigate("/boton-de-arrepentimiento")}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Undo2 className="w-4 h-4 text-amber-500" />
                <span className="text-xs sm:text-sm font-semibold text-zinc-800">
                  Botón de Arrepentimiento (🇦🇷)
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>

            <button
              onClick={() => navigate("/eliminar-cuenta")}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-zinc-400" />
                <span className="text-xs sm:text-sm font-semibold text-zinc-500">
                  Eliminar cuenta y datos
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Deslizable con Todos los Pedidos */}
      <ProfileOrdersModal
        isOpen={showAllOrdersModal}
        onClose={() => setShowAllOrdersModal(false)}
        orders={ordersList}
      />

      {/* Navegación Inferior Flotante en Tema Oscuro */}
      <CustomerBottomNav active="profile" />
    </div>
  );
}
