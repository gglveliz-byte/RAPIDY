import { useState } from "react";
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
import { toast } from "sonner";
import { trpc, queryClient } from "@/providers/trpc";
import { trpcMutate, useDriverSession } from "@/hooks/useDeliveryData";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DriverProfile() {
  const navigate = useNavigate();
  const driverSession = useDriverSession();
  const driverId = driverSession?.id ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editLicensePlate, setEditLicensePlate] = useState("");

  const utils = trpc.useUtils();

  const { data: driver, isLoading, isError, error, refetch } = trpc.driver.getProfile.useQuery(
    { id: driverId! },
    { enabled: !!driverId }
  );

  const updateStatusMutation = trpc.driver.updateStatus.useMutation({
    onSuccess: () => {
      if (driverId) utils.driver.getProfile.invalidate({ id: driverId });
    },
    onError: (mutationError) =>
      toast.error(mutationError.message || "No se pudo cambiar el estado."),
  });

  const updateProfileMutation = trpc.driver.updateProfile.useMutation({
    onSuccess: () => {
      if (driverId) utils.driver.getProfile.invalidate({ id: driverId });
      setIsEditing(false);
      toast.success("Perfil actualizado.");
    },
    onError: (mutationError) =>
      toast.error(mutationError.message || "No se pudo guardar el perfil."),
  });

  const handleStartEdit = () => {
    setEditName(driver?.name || "");
    setEditVehicle(driver?.vehicle || "");
    setEditLicensePlate(driver?.licensePlate || "");
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!driverId) return;
    if (!editName.trim() || !editVehicle.trim() || !editLicensePlate.trim()) {
      toast.error("Nombre, vehículo y placa son obligatorios.");
      return;
    }
    await updateProfileMutation.mutateAsync({
      id: driverId,
      name: editName.trim(),
      vehicle: editVehicle.trim(),
      licensePlate: editLicensePlate.trim(),
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleToggleOnline = async () => {
    if (!driver) return;
    if (driver.status === "busy") {
      toast.error("Tienes un pedido activo. Termínalo antes de cambiar tu estado.");
      return;
    }
    const newStatus = driver.status === "online" ? "offline" : "online";
    await updateStatusMutation.mutateAsync({ id: driver.id, status: newStatus });
  };

  const handleLogout = async () => {
    try {
      await trpcMutate("driver.logoutSession", {});
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : "";
      if (message.toLowerCase().includes("pedido activo")) {
        toast.error(message);
        return;
      }
      await trpcMutate("login.logout", { scope: "driver" }).catch(() => {});
    }
    clearRoleUser("driver");
    clearSession("driver");
    dispatchLogout("driver");
    queryClient.clear();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-bold text-red-600 dark:text-red-400">No se pudo cargar tu perfil</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 min-h-11 px-4 py-2 rounded-lg bg-brand hover:brightness-110 text-zinc-950 text-xs font-bold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen flex items-center justify-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Repartidor no encontrado</p>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-surface dark:bg-[#0E0E12] min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand to-brand-strong px-4 pt-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/driver")} aria-label="Volver a pedidos" className="text-white/80 hover:text-white touch-target flex items-center justify-center rounded-xl">
            <ArrowLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle
              size="lg"
              className="!bg-white/20 !border-white/30 !text-white hover:!bg-white/30 hover:!text-white backdrop-blur-sm"
            />
            {!isEditing ? (
              <button onClick={handleStartEdit} className="text-white/80 hover:text-white touch-target" aria-label="Editar perfil">
                <Edit3 className="w-5 h-5" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={handleCancelEdit} className="text-white/80 hover:text-white touch-target disabled:opacity-50" disabled={updateProfileMutation.isPending} aria-label="Cancelar edición">
                  <X className="w-5 h-5" />
                </button>
                <button onClick={handleSaveProfile} className="text-white/80 hover:text-white touch-target disabled:opacity-50" disabled={updateProfileMutation.isPending} aria-label="Guardar cambios">
                  <Save className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 ring-2 ring-white/20 rounded-full flex items-center justify-center">
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
                className="text-xl font-bold text-zinc-900 dark:text-zinc-100 bg-white dark:bg-[#16161B] border border-transparent dark:border-white/15 rounded-lg px-2 py-1 w-full placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/60"
                placeholder="Nombre"
                aria-label="Nombre"
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
        <div className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  driver?.status === "online"
                    ? "bg-green-100 dark:bg-green-500/15"
                    : driver?.status === "busy"
                      ? "bg-amber-100 dark:bg-amber-500/15"
                      : "bg-zinc-100 dark:bg-white/10"
                }`}
              >
                <Bike
                  className={`w-5 h-5 ${
                    driver?.status === "online"
                      ? "text-green-600 dark:text-green-400"
                      : driver?.status === "busy"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-400 dark:text-zinc-500"
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {driver?.status === "online" ? "En línea" : driver?.status === "busy" ? "Ocupado" : "Desconectado"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {driver?.status === "online" ? "Recibiendo pedidos" : driver?.status === "busy" ? "Pedido en curso" : "No recibirás pedidos"}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleOnline}
              className="touch-target disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={updateStatusMutation.isPending || driver.status === "busy"}
              aria-label={driver.status === "online" ? "Desconectarse" : "Conectarse"}
              aria-pressed={driver.status === "online"}
            >
              {driver?.status === "online" ? (
                <ToggleRight className="w-10 h-10 text-brand-strong" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 mt-4">
        <div className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 divide-y divide-zinc-100 dark:divide-white/5">
          <div className="p-4 flex items-center gap-3">
            <Phone className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            <div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Telefono</p>
              <p className="text-sm text-zinc-900 dark:text-zinc-100">{driver?.phone || "-"}</p>
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <Bike className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            <div className="flex-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Vehiculo</p>
              {!isEditing ? (
                <p className="text-sm text-zinc-900 dark:text-zinc-100">{driver?.vehicle || "-"}</p>
              ) : (
                <input
                  type="text"
                  value={editVehicle}
                  onChange={(e) => setEditVehicle(e.target.value)}
                  className="text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-[#16161B] border border-zinc-200 dark:border-white/15 rounded-lg px-2 py-1 w-full mt-0.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  placeholder="Vehiculo"
                  aria-label="Vehículo"
                />
              )}
            </div>
          </div>
          <div className="p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
            <div className="flex-1">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Placa</p>
              {!isEditing ? (
                <p className="text-sm text-zinc-900 dark:text-zinc-100">{driver?.licensePlate || "-"}</p>
              ) : (
                <input
                  type="text"
                  value={editLicensePlate}
                  onChange={(e) => setEditLicensePlate(e.target.value)}
                  className="text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-[#16161B] border border-zinc-200 dark:border-white/15 rounded-lg px-2 py-1 w-full mt-0.5 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  placeholder="Placa"
                  aria-label="Placa"
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
            className="w-full bg-brand text-zinc-950 rounded-xl card-shadow dark:shadow-none p-4 flex items-center justify-center gap-2 text-sm font-semibold hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
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
          className="w-full bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 flex items-center gap-3 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Salir</span>
        </button>
      </div>
    </div>
  );
}