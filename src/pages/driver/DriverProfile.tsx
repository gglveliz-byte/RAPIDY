import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Bike,
  Check,
  Edit3,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Save,
  Star,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc, queryClient } from "@/providers/trpc";
import { trpcMutate, useDriverSession } from "@/hooks/useDeliveryData";
import { clearRoleUser, clearSession, dispatchLogout } from "@/hooks/useSessionSync";
import DriverLayout from "@/components/DriverLayout";

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
    { enabled: !!driverId },
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
      <DriverLayout title="Perfil" subtitle="Tus datos de repartidor">
        <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
          <span className="sr-only">Cargando perfil…</span>
        </div>
      </DriverLayout>
    );
  }

  if (isError) {
    return (
      <DriverLayout title="Perfil" subtitle="Tus datos de repartidor">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[13px] font-bold text-red-600 dark:text-red-400">
            No se pudo cargar tu perfil
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{error.message}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 min-h-10 rounded-lg bg-brand px-4 text-[11px] font-bold text-zinc-950 transition-colors hover:brightness-110"
          >
            Reintentar
          </button>
        </div>
      </DriverLayout>
    );
  }

  if (!driver) {
    return (
      <DriverLayout title="Perfil" subtitle="Tus datos de repartidor">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Repartidor no encontrado</p>
        </div>
      </DriverLayout>
    );
  }

  const statusLabel =
    driver.status === "online" ? "En línea" : driver.status === "busy" ? "Ocupado" : "Desconectado";
  const statusHint =
    driver.status === "online"
      ? "Recibiendo pedidos"
      : driver.status === "busy"
        ? "Pedido en curso"
        : "No recibirás pedidos";

  return (
    <DriverLayout
      title="Perfil"
      subtitle={`Repartidor · ${statusLabel}`}
      headerRight={
        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={updateProfileMutation.isPending}
                aria-label="Cancelar edición"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                <X className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                aria-label="Guardar cambios"
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-brand-strong transition-colors hover:bg-white/90 disabled:opacity-50"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4.5 w-4.5" aria-hidden="true" />
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              aria-label="Editar perfil"
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <Edit3 className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3 px-4 py-4">
        {/* Identidad */}
        <section className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-strong text-white shadow-[0_4px_14px_rgba(255,106,0,0.35)]">
            <User className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[14px] font-bold text-zinc-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand dark:border-white/15 dark:bg-[#101014] dark:text-zinc-100"
                placeholder="Nombre"
                aria-label="Nombre"
              />
            ) : (
              <h2 className="truncate text-[15px] font-black leading-tight">
                {driver.name || "Conductor"}
              </h2>
            )}
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                {driver.rating ? Number(driver.rating).toFixed(1) : "—"}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">·</span>
              <span className="truncate">
                ${Number(driver.totalEarnings || 0).toFixed(2)} ganado
              </span>
            </div>
          </div>
        </section>

        {/* Estado */}
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#15151A]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                driver.status === "online"
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : driver.status === "busy"
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-white/10 dark:text-zinc-500"
              }`}
            >
              <Bike className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-tight">{statusLabel}</p>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{statusHint}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleOnline}
            disabled={updateStatusMutation.isPending || driver.status === "busy"}
            aria-label={driver.status === "online" ? "Desconectarse" : "Conectarse"}
            aria-pressed={driver.status === "online"}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              driver.status === "online" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                driver.status === "online" ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
        </section>

        {/* Datos */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white divide-y divide-zinc-100 dark:border-white/10 dark:bg-[#15151A] dark:divide-white/5">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <Phone className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Teléfono
              </p>
              <p className="truncate text-[13px] font-semibold">{driver.phone || "-"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-3.5 py-3">
            <Bike className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Vehículo
              </p>
              {isEditing ? (
                <input
                  type="text"
                  value={editVehicle}
                  onChange={(e) => setEditVehicle(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[13px] font-semibold text-zinc-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand dark:border-white/15 dark:bg-[#101014] dark:text-zinc-100"
                  placeholder="Vehículo"
                  aria-label="Vehículo"
                />
              ) : (
                <p className="truncate text-[13px] font-semibold">{driver.vehicle || "-"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 px-3.5 py-3">
            <MapPin className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Placa
              </p>
              {isEditing ? (
                <input
                  type="text"
                  value={editLicensePlate}
                  onChange={(e) => setEditLicensePlate(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[13px] font-semibold uppercase text-zinc-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand dark:border-white/15 dark:bg-[#101014] dark:text-zinc-100"
                  placeholder="Placa"
                  aria-label="Placa"
                />
              ) : (
                <p className="truncate text-[13px] font-semibold uppercase">{driver.licensePlate || "-"}</p>
              )}
            </div>
          </div>
        </section>

        {isEditing && (
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={updateProfileMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[13px] font-bold text-zinc-950 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            {updateProfileMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            Guardar cambios
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3 text-[13px] font-bold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/25 dark:bg-[#15151A] dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </DriverLayout>
  );
}
