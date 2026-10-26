import { useState } from "react";
import { useNavigate } from "react-router";
import {
  User,
  Phone,
  MapPin,
  ShoppingBag,
  ChevronRight,
  LogOut,
  UtensilsCrossed,
  Search,
  ShoppingCart,
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
      <div className="mobile-container bg-gray-50 min-h-screen flex flex-col items-center justify-center px-6">
        <User className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Inicia sesion</h2>
        <p className="text-gray-500 text-sm text-center mb-6">
          Registrate con tu numero de celular para realizar pedidos
        </p>
        <button
          onClick={() => navigate("/register")}
          className="h-12 px-8 bg-[#2E7D32] text-white font-medium rounded-xl hover:bg-[#1B5E20] transition-all"
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
    <div className="mobile-container bg-gray-50 min-h-screen pb-safe-nav">
      {/* Header */}
      <div className="bg-[#2E7D32] px-4 pt-safe pb-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border border-white/20 shadow-sm">
            <User className="w-7 h-7 text-white stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="flex items-center gap-1.5 text-white/80 text-xs mt-0.5 font-medium">
              <Phone className="w-3.5 h-3.5" />
              <span>{customer.phone}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl card-shadow p-4">
          {editingAddress ? (
            <div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#2E7D32] mt-0.5 flex-shrink-0" />
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32] outline-none resize-none"
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={geoLoading}
                className="mt-2 w-full h-9 border border-gray-200 rounded-lg text-xs text-gray-600 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Navigation className="w-3.5 h-3.5 text-[#2E7D32]" />
                {geoLoading ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
              </button>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={saveAddress}
                  disabled={saving}
                  className="flex-1 h-9 bg-[#2E7D32] text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1 hover:bg-[#1B5E20] disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
                <button
                  onClick={cancelEditing}
                  className="h-9 px-4 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg flex items-center justify-center gap-1 hover:bg-gray-50"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4 text-[#2E7D32] mt-0.5 flex-shrink-0" />
                <span>{customer.address}</span>
              </div>
              <button
                onClick={startEditing}
                className="flex-shrink-0 w-7 h-7 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50"
              >
                <Pencil className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="px-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">Historial de pedidos</h2>
        </div>
        {ordersLoading ? (
          <div className="bg-white rounded-xl card-shadow p-6">
            <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl card-shadow p-6 text-center">
            <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No tienes pedidos aun</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order: any) => (
              <button
                key={order.id}
                onClick={() => navigate(`/order/${order.id}`)}
                className="w-full bg-white rounded-xl card-shadow p-4 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">Pedido #{order.id}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" - "}
                    <span className="capitalize">{order.status === "pending_payment" ? "Revisando pago" : order.status.replace(/_/g, " ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#2E7D32]">${order.total}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legal & Help */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Información y Marco Legal</h2>
        <div className="bg-white rounded-xl card-shadow divide-y divide-gray-100 overflow-hidden">
          <button
            onClick={() => navigate("/legal")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#2E7D32]" />
              <span className="text-sm text-gray-800">Centro Legal y Privacidad</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          <button
            onClick={() => navigate("/boton-de-arrepentimiento")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Undo2 className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-800">Botón de Arrepentimiento (🇦🇷)</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          <button
            onClick={() => navigate("/eliminar-cuenta")}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">Eliminar cuenta y datos</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 mt-6 mb-6">
        <button
          onClick={() => {
            logout();
            navigate("/customer-login");
          }}
          className="w-full bg-white rounded-2xl card-shadow p-4 flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 border border-red-100 active:scale-[0.98] transition-all font-semibold text-sm shadow-xs"
        >
          <LogOut className="w-4 h-4 stroke-[2.2]" />
          <span>Cerrar sesión</span>
        </button>
      </div>

      <CustomerBottomNav active="profile" />
    </div>
  );
}
