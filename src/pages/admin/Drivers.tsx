import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Star, Search, Bike, X, Plus, Trash2,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { trpcMutate } from "@/hooks/useDeliveryData";
import { trpc } from "@/providers/trpc";
import PhoneInput from "@/components/PhoneInput";
import AdminLayout from "@/components/AdminLayout";

export default function AdminDrivers() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { data: driverListData, isLoading: loading } = trpc.driver.list.useQuery();
  const driverList = driverListData || [];
  
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", password: "", vehicle: "", licensePlate: "", commissionRate: "75" });
  const [saving, setSaving] = useState(false);
  const phoneFieldRef = useRef<HTMLDivElement>(null);

  // PhoneInput no expone props de label; asociamos su input al label visible.
  useEffect(() => {
    if (!showForm) return;
    const input = phoneFieldRef.current?.querySelector("input");
    input?.setAttribute("aria-labelledby", "driver-phone-label");
  }, [showForm]);

  const filtered = driverList.filter((d) =>
    d.name?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = driverList.filter((d) => d.status === "online").length;
  const busyCount = driverList.filter((d) => d.status === "busy").length;
  const offlineCount = driverList.filter((d) => d.status === "offline").length;

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", phone: "", password: "", vehicle: "", licensePlate: "", commissionRate: "75" });
    setShowForm(true);
  };

  const openEdit = (d: any) => {
    setEditing(d);
    setForm({ name: d.name, phone: d.phone, password: "", vehicle: d.vehicle || "", licensePlate: d.licensePlate || "", commissionRate: d.commissionRate || "75" });
    setShowForm(true);
  };

  const handleDeleteDriver = async (id: number, name: string) => {
    if (!confirm(`Eliminar repartidor "${name}"?`)) return;
    try {
      await trpcMutate("admin.deleteDriver", { id });
      await utils.driver.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Error al eliminar");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const commission = Number(form.commissionRate);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast.error("La comisión debe ser un número entre 0 y 100.");
      return;
    }
    if (form.password && form.password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const commissionRate = commission.toFixed(2);
      if (editing) {
        const payload: any = { id: editing.id, name: form.name, phone: form.phone, vehicle: form.vehicle, licensePlate: form.licensePlate, commissionRate };
        if (form.password) payload.password = form.password;
        await trpcMutate("admin.updateDriver", payload);
      } else {
        await trpcMutate("admin.createDriver", { ...form, commissionRate });
      }
      setShowForm(false);
      await utils.driver.list.invalidate();
      toast.success(editing ? "Repartidor actualizado." : "Repartidor creado.");
    } catch (err: any) {
      toast.error(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <header className="bg-white dark:bg-[#111115] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button type="button" onClick={() => navigate("/admin")} aria-label="Volver al panel" className="touch-target shrink-0">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-500 dark:text-zinc-400" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">Repartidores</h1>
          </div>
          <button type="button" onClick={openCreate} className="min-h-11 flex items-center gap-1.5 lg:gap-2 bg-brand text-zinc-950 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold hover:bg-brand-strong transition-colors shrink-0 shadow-xs shadow-brand/20">
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Nuevo</span>
          </button>
        </div>
      </header>

      <div className="flex-1 bg-[#F7F7FA] dark:bg-[#0A0A0D] p-2 lg:p-4 lg:overflow-hidden">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          {loading ? (
            <div role="status" aria-live="polite" className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">Cargando...</div>
          ) : (
            <>
              {/* Status Cards */}
              <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
                <div className="bg-green-50 dark:bg-green-500/10 border border-green-100 dark:border-green-500/20 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs dark:shadow-none">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-green-700 dark:text-green-400 leading-tight">{onlineCount}</p>
                  <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400 font-medium">En línea</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs dark:shadow-none">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-amber-700 dark:text-amber-400 leading-tight">{busyCount}</p>
                  <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 font-medium">Ocupados</p>
                </div>
                <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs dark:shadow-none">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-zinc-700 dark:text-zinc-300 leading-tight">{offlineCount}</p>
                  <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium">Desconectados</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3 lg:mb-4 lg:shrink-0">
                <label htmlFor="driver-search" className="sr-only">Buscar repartidor</label>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                <input
                  id="driver-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar repartidor..."
                  className="w-full h-10 lg:h-11 pl-9 pr-4 bg-white dark:bg-[#1A1A1E] rounded-xl border border-zinc-200 dark:border-white/10 text-xs lg:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>

              {/* Drivers Table */}
              <div className="bg-transparent lg:bg-white dark:lg:bg-[#1A1A1E] lg:rounded-xl lg:card-shadow dark:lg:shadow-none lg:border lg:border-zinc-100 dark:lg:border-white/10 lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white dark:bg-[#1A1A1E]">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-500 dark:text-zinc-400 lg:sticky lg:top-0 lg:z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Repartidor</th>
                        <th className="text-left px-4 py-3 font-medium">Vehiculo</th>
                        <th className="text-left px-4 py-3 font-medium">Patente</th>
                        <th className="text-left px-4 py-3 font-medium">Estado</th>
                        <th className="text-left px-4 py-3 font-medium">Ubicacion</th>
                        <th className="text-left px-4 py-3 font-medium">Calif.</th>
                        <th className="text-left px-4 py-3 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                      {filtered.map((d) => (
                        <tr key={d.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${d.status === "online" ? "bg-green-100 dark:bg-green-500/15" : d.status === "busy" ? "bg-amber-100 dark:bg-amber-500/15" : "bg-zinc-100 dark:bg-white/10"}`}>
                                <Bike className={`w-4 h-4 ${d.status === "online" ? "text-green-600 dark:text-green-400" : d.status === "busy" ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`} />
                              </div>
                              <div>
                                <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{d.name}</p>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">{d.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{d.vehicle || "-"}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{d.licensePlate || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === "online" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : d.status === "busy" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"}`}>
                              {d.status === "online" ? "Online" : d.status === "busy" ? "Ocupado" : "Offline"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                            {d.currentLat && d.currentLng ? `${parseFloat(d.currentLat).toFixed(4)}, ${parseFloat(d.currentLng).toFixed(4)}` : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-amber-400" />
                              <span className="text-zinc-700 dark:text-zinc-300">{d.rating || "4.5"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => openEdit(d)} aria-label={`Editar a ${d.name}`} className="min-h-11 min-w-11 px-2.5 text-xs text-brand-strong dark:text-brand hover:bg-brand-soft dark:hover:bg-brand/10 rounded-lg transition-colors">Editar</button>
                              <button type="button" onClick={() => handleDeleteDriver(d.id, d.name)} aria-label={`Eliminar a ${d.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm">Sin repartidores</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden flex flex-col gap-3 pb-4">
                  {filtered.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">Sin repartidores</div>
                  ) : (
                    filtered.map((d) => (
                      <div key={d.id} className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${d.status === "online" ? "bg-green-100 dark:bg-green-500/15" : d.status === "busy" ? "bg-amber-100 dark:bg-amber-500/15" : "bg-zinc-100 dark:bg-white/10"}`}>
                              <Bike className={`w-5 h-5 ${d.status === "online" ? "text-green-600 dark:text-green-400" : d.status === "busy" ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`} />
                            </div>
                            <div>
                              <p className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">{d.name}</p>
                              <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                <Star className="w-3 h-3 text-amber-400" />
                                {d.rating || "4.5"}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.status === "online" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : d.status === "busy" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"}`}>
                            {d.status === "online" ? "Online" : d.status === "busy" ? "Ocupado" : "Offline"}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm bg-zinc-50 dark:bg-[#16161B] p-2.5 rounded-xl border border-zinc-100 dark:border-white/10">
                          <div>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Teléfono</span>
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium text-xs sm:text-sm">{d.phone}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Vehículo</span>
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium text-xs sm:text-sm truncate block">{d.vehicle || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Patente</span>
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium text-xs sm:text-sm">{d.licensePlate || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Comisión</span>
                            <span className="text-brand-strong dark:text-brand font-semibold text-xs sm:text-sm">{d.commissionRate || "75"}%</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-100 dark:border-white/10 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(d)}
                            className="min-h-11 px-4 text-xs font-semibold text-brand-strong dark:text-brand bg-brand-soft dark:bg-brand/10 hover:bg-brand/15 dark:hover:bg-brand/20 rounded-xl transition-all active:scale-95"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDriver(d.id, d.name)}
                            aria-label={`Eliminar a ${d.name}`}
                            className="min-h-11 min-w-11 flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-all active:scale-95"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      <DialogPrimitive.Root open={showForm} onOpenChange={(open) => { if (!open) setShowForm(false); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs animate-fade-in" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#16161B] rounded-2xl w-[calc(100%_-_1.25rem)] sm:w-full max-w-md max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-zinc-100 dark:border-white/10 overflow-hidden focus:outline-none"
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-zinc-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#16161B]">
              <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">{editing ? "Editar repartidor" : "Nuevo repartidor"}</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Cerrar"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3.5 overscroll-contain">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  {editing 
                    ? "Edita los datos del repartidor, su vehículo o el porcentaje de comisión que gana por cada viaje que realiza." 
                    : "Registra a un nuevo repartidor en el sistema. Con el teléfono y la contraseña que ingreses aquí, el repartidor podrá iniciar sesión en su propia aplicación."}
                </p>
                <div>
                  <label htmlFor="driver-name" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Nombre completo</label>
                  <input
                    id="driver-name"
                    placeholder="Ej: Carlos Ramírez"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    required
                  />
                </div>
                
                <div ref={phoneFieldRef}>
                  <label id="driver-phone-label" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Teléfono (Usuario para Login)</label>
                  <div className="dark:[&_label]:text-zinc-400 dark:[&_input]:text-zinc-100 dark:[&_input]:placeholder:text-zinc-500 dark:[&_p]:text-zinc-500 dark:[&_svg]:text-zinc-500 dark:[&>div>div]:bg-[#16161B] dark:[&>div>div]:border-white/10 dark:[&>div>div>div>button]:bg-[#1A1A1E] dark:[&>div>div>div>button]:text-zinc-200 dark:[&>div>div>div>button]:border-white/10 dark:[&_.absolute]:bg-[#1F1F22] dark:[&_.absolute]:border-white/15 dark:[&_.absolute_button]:text-zinc-200 dark:[&_.absolute_button:hover]:bg-white/10">
                    <PhoneInput value={form.phone} onChange={(v) => setForm({...form, phone: v})} />
                  </div>
                </div>

                <div>
                  <label htmlFor="driver-password" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">{editing ? "Cambiar Contraseña (opcional)" : "Contraseña de acceso"}</label>
                  <input
                    id="driver-password"
                    type="password"
                    placeholder={editing ? "Dejar vacío para no cambiarla" : "Mínimo 8 caracteres"}
                    value={form.password}
                    onChange={(e) => setForm({...form, password: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    minLength={8}
                    required={!editing}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="driver-vehicle" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Vehículo</label>
                    <input
                      id="driver-vehicle"
                      placeholder="Ej: Moto Honda 150"
                      value={form.vehicle}
                      onChange={(e) => setForm({...form, vehicle: e.target.value})}
                      className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="driver-license-plate" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Patente</label>
                    <input
                      id="driver-license-plate"
                      placeholder="Ej: ABC-123"
                      value={form.licensePlate}
                      onChange={(e) => setForm({...form, licensePlate: e.target.value})}
                      className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="driver-commission" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Ganancia del Repartidor (%)</label>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-2">Porcentaje del "Costo de Envío" que el repartidor se queda para él.</p>
                  <input
                    id="driver-commission"
                    type="number"
                    min="0"
                    max="100"
                    value={form.commissionRate}
                    onChange={(e) => setForm({...form, commissionRate: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="p-3.5 sm:p-5 border-t border-zinc-100 dark:border-white/10 bg-zinc-50/90 dark:bg-[#111115] shrink-0 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 border border-zinc-200 dark:border-white/10 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-white/10 active:scale-98 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-brand text-zinc-950 rounded-xl text-sm font-semibold hover:bg-brand-strong transition-all active:scale-98 disabled:opacity-50 shadow-sm shadow-brand/20"
                >
                  {saving ? "Guardando..." : "Guardar repartidor"}
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AdminLayout>
  );
}