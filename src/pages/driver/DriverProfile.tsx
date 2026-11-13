import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  User,
  Phone,
  Bike,
  Star,
  ToggleLeft,
  ToggleRight,
  LogOut,
  MapPin,
  Loader2,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { trpcMutate } from "@/hooks/useDeliveryData";
import { queryClient } from "@/providers/trpc";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";

export default function DriverProfile() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editLicensePlate, setEditLicensePlate] = useState("");

  const utils = trpc.useUtils();

  useEffect(() => {
    const session = localStorage.getItem("driver_user");
    if (session) {
      try {
        const data = JSON.parse(session);
        if (data?.id) {
          setDriverId(data.id);
        }
      } catch {}
    }
  }, []);

  const { data: driver, isLoading } = trpc.driver.getById.useQuery(
    { id: driverId! },
    { enabled: !!driverId }
  );

  const updateStatusMutation = trpc.driver.updateStatus.useMutation();

  const updateProfileMutation = trpc.driver.updateProfile.useMutation({
    onSuccess: () => {
      if (driverId) {
        utils.driver.getById.invalidate({ id: driverId });
      }
      setIsEditing(false);
    },
  });

  const handleStartEdit = () => {
    setEditName(driver?.name || "");
    setEditVehicle(driver?.vehicle || "");
    setEditLicensePlate(driver?.licensePlate || "");
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!driverId) return;
    await updateProfileMutation.mutateAsync({
      id: driverId,
      name: editName,
      vehicle: editVehicle,
      licensePlate: editLicensePlate,
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleToggleOnline = async () => {
    if (!driver) return;
    const newStatus = driver.status === "online" ? "offline" : "online";
    await updateStatusMutation.mutateAsync({ id: driver.id, status: newStatus });
  };

  const handleLogout = async () => {
    await trpcMutate("login.logout", { scope: "driver" }).catch(() => {});
    clearRoleUser("driver");
    clearSession("driver");
    dispatchLogout("driver");
    queryClient.clear();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="mobile-container bg-gray-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2E7D32]" />
      </div>
    );
  }

  return (
    <div className="mobile-container bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-[#2E7D32] px-4 pt-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/driver")} className="text-white/80 hover:text-white touch-target">
            <ArrowLeft className="w-6 h-6" />
          </button>
          {!isEditing ? (
            <button onClick={handleStartEdit} className="text-white/80 hover:text-white touch-target">
              <Edit3 className="w-5 h-5" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleCancelEdit} className="text-white/80 hover:text-white touch-target" disabled={updateProfileMutation.isPending}>
                <X className="w-5 h-5" />
              </button>
              <button onClick={handleSaveProfile} className="text-white/80 hover:text-white touch-target" disabled={updateProfileMutation.isPending}>
                <Save className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            {!isEditing ? (
              <h1 className="text-xl font-bold text-white">{driver?.name || "Conductor"}</h1>
            ) : (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-bold text-gray-800 bg-white rounded-lg px-2 py-1 w-full"
                placeholder="Nombre"
              />
            )}
            <div className="flex items-center gap-2 mt-1">
              <Star className="w-4 h-4 text-[#FFC107]" />
              <span className="text-white text-sm">{driver?.rating?.toString() || "4.8"}</span>
              <span className="text-white/50">|</span>
              <span className="text-white/70 text-sm">{driver?.totalEarnings || "0"} ganancias</span>
            </div>
          </div>
        </div>
      </div>

      {/* Online Toggle */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-xl card-shadow p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${driver?.status === "online" ? "bg-green-100" : "bg-gray-100"}`}>
                <Bike className={`w-5 h-5 ${driver?.status === "online" ? "text-[#2E7D32]" : "text-gray-400"}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {driver?.status === "online" ? "En linea" : driver?.status === "busy" ? "Ocupado" : "Desconectado"}
                </p>
                <p className="text-xs text-gray-500">
                  {driver?.status === "online" ? "Recibiendo pedidos" : "No recibiras pedidos"}
                </p>
              </div>
            </div>
            <button onClick={handleToggleOnline} className="touch-target" disabled={updateStatusMutation.isPending}>
              {driver?.status === "online" ? (
                <ToggleRight className="w-10 h-10 text-[#2E7D32]" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl card-shadow divide-y divide-gray-50">
          <div className="p-4 flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Telefono</p>
              <p className="text-sm text-gray-800">{driver?.phone || "-"}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <Bike className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Vehiculo</p>
              {!isEditing ? (
                <p className="text-sm text-gray-800">{driver?.vehicle || "-"}</p>
              ) : (
                <input
                  type="text"
                  value={editVehicle}
                  onChange={(e) => setEditVehicle(e.target.value)}
                  className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 w-full mt-0.5"
                  placeholder="Vehiculo"
                />
              )}
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Placa</p>
              {!isEditing ? (
                <p className="text-sm text-gray-800">{driver?.licensePlate || "-"}</p>
              ) : (
                <input
                  type="text"
                  value={editLicensePlate}
                  onChange={(e) => setEditLicensePlate(e.target.value)}
                  className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 w-full mt-0.5"
                  placeholder="Placa"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Save Button (edit mode) */}
      {isEditing && (
        <div className="px-4 mt-4">
          <button
            onClick={handleSaveProfile}
            disabled={updateProfileMutation.isPending}
            className="w-full bg-[#2E7D32] text-white rounded-xl card-shadow p-4 flex items-center justify-center gap-2 text-sm font-medium hover:bg-[#1B5E20] active:scale-95 transition-all disabled:opacity-50"
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            <span>Guardar</span>
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 mt-6 mb-6">
        <button
          onClick={handleLogout}
          className="w-full bg-white rounded-xl card-shadow p-4 flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Salir</span>
        </button>
      </div>
    </div>
  );
}