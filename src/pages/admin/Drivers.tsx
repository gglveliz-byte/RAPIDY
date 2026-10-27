import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Star, Search, Bike, X, Plus, Trash2,
} from "lucide-react";
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
      setDriverList(driverList.filter(d => d.id !== id));
    } catch (err: any) {
      alert(err?.message || "Error al eliminar");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const parsedCommission = (!isNaN(parseFloat(form.commissionRate)) ? parseFloat(form.commissionRate) : 80).toFixed(2);
      
      if (editing) {
        const payload: any = { id: editing.id, name: form.name, phone: form.phone, vehicle: form.vehicle, licensePlate: form.licensePlate, commissionRate: parsedCommission };
        if (form.password) payload.password = form.password;
        await trpcMutate("admin.updateDriver", payload);
      } else {
        await trpcMutate("admin.createDriver", { ...form, commissionRate: parsedCommission });
      }
      setShowForm(false);
      await utils.driver.list.invalidate();
    } catch (err: any) {
      alert(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <header className="bg-white border-b border-gray-200 px-3 lg:px-4 py-2 lg:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-3">
            <button onClick={() => navigate("/admin")} className="touch-target">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-gray-600" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-gray-800">Repartidores</h1>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 lg:gap-2 bg-[#2E7D32] text-white px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-medium hover:bg-[#1B5E20] transition-colors">
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            Nuevo
          </button>
        </div>
      </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Cargando...</div>
          ) : (
            <>
              {/* Status Cards */}
              <div className="grid grid-cols-3 gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
                <div className="bg-green-50 border border-green-100 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-green-700 leading-tight">{onlineCount}</p>
                  <p className="text-[10px] sm:text-xs text-green-600 font-medium">En línea</p>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-orange-700 leading-tight">{busyCount}</p>
                  <p className="text-[10px] sm:text-xs text-orange-600 font-medium">Ocupados</p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-2 sm:p-3 lg:p-4 text-center shadow-xs">
                  <p className="text-base sm:text-xl lg:text-2xl font-bold text-gray-700 leading-tight">{offlineCount}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 font-medium">Desconectados</p>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-3 lg:mb-4 lg:shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar repartidor..."
                  className="w-full h-10 lg:h-11 pl-9 pr-4 bg-white rounded-xl border border-gray-200 text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
                />
              </div>

              {/* Drivers Table */}
              <div className="bg-white lg:bg-transparent lg:rounded-xl lg:card-shadow lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 lg:sticky lg:top-0 lg:z-10">
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
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${d.status === "online" ? "bg-green-100" : d.status === "busy" ? "bg-orange-100" : "bg-gray-100"}`}>
                                <Bike className={`w-4 h-4 ${d.status === "online" ? "text-green-600" : d.status === "busy" ? "text-orange-600" : "text-gray-500"}`} />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 leading-tight">{d.name}</p>
                                <p className="text-xs text-gray-500">{d.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{d.vehicle || "-"}</td>
                          <td className="px-4 py-3 text-gray-600">{d.licensePlate || "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.status === "online" ? "bg-green-100 text-green-700" : d.status === "busy" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                              {d.status === "online" ? "Online" : d.status === "busy" ? "Ocupado" : "Offline"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {d.currentLat && d.currentLng ? `${parseFloat(d.currentLat).toFixed(4)}, ${parseFloat(d.currentLng).toFixed(4)}` : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 text-[#FFC107]" />
                              <span className="text-gray-700">{d.rating || "4.5"}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEdit(d)} className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">Editar</button>
                              <button onClick={() => handleDeleteDriver(d.id, d.name)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">Sin repartidores</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden flex flex-col gap-3 pb-4">
                  {filtered.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Sin repartidores</div>
                  ) : (
                    filtered.map((d) => (
                      <div key={d.id} className="bg-white rounded-xl card-shadow p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${d.status === "online" ? "bg-green-100" : d.status === "busy" ? "bg-orange-100" : "bg-gray-100"}`}>
                              <Bike className={`w-5 h-5 ${d.status === "online" ? "text-green-600" : d.status === "busy" ? "text-orange-600" : "text-gray-500"}`} />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 leading-tight">{d.name}</p>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Star className="w-3 h-3 text-[#FFC107]" />
                                {d.rating || "4.5"}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${d.status === "online" ? "bg-green-100 text-green-700" : d.status === "busy" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"}`}>
                            {d.status === "online" ? "Online" : d.status === "busy" ? "Ocupado" : "Offline"}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                          <div>
                            <span className="block text-[10px] text-gray-500">Teléfono</span>
                            <span className="text-gray-800 font-medium text-xs sm:text-sm">{d.phone}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-500">Vehículo</span>
                            <span className="text-gray-800 font-medium text-xs sm:text-sm truncate block">{d.vehicle || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-500">Patente</span>
                            <span className="text-gray-800 font-medium text-xs sm:text-sm">{d.licensePlate || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-500">Comisión</span>
                            <span className="text-[#2E7D32] font-semibold text-xs sm:text-sm">{d.commissionRate || "75"}%</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(d)}
                            className="min-h-[40px] px-4 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all active:scale-95"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteDriver(d.id, d.name)}
                            className="min-h-[40px] w-10 flex items-center justify-center text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all active:scale-95"
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
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-4 sm:p-6 max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-gray-800">{editing ? "Editar repartidor" : "Nuevo repartidor"}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              {editing 
                ? "Edita los datos del repartidor, su vehículo o el porcentaje de comisión que gana por cada viaje que realiza." 
                : "Registra a un nuevo repartidor en el sistema. Con el teléfono y la contraseña que ingreses aquí, el repartidor podrá iniciar sesión en su propia aplicación."}
            </p>
            <form onSubmit={handleSave} className="space-y-3.5 sm:space-y-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Nombre completo</label>
                <input
                  placeholder="Ej: Carlos Ramírez"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  required
                />
              </div>
              
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Teléfono (Usuario para Login)</label>
                <PhoneInput value={form.phone} onChange={(v) => setForm({...form, phone: v})} />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">{editing ? "Cambiar Contraseña (opcional)" : "Contraseña de acceso"}</label>
                <input
                  type="password"
                  placeholder={editing ? "Dejar vacío para no cambiarla" : "Min. 6 caracteres"}
                  value={form.password}
                  onChange={(e) => setForm({...form, password: e.target.value})}
                  className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  required={!editing}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Vehículo</label>
                  <input
                    placeholder="Ej: Moto Honda 150"
                    value={form.vehicle}
                    onChange={(e) => setForm({...form, vehicle: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Patente</label>
                  <input
                    placeholder="Ej: ABC-123"
                    value={form.licensePlate}
                    onChange={(e) => setForm({...form, licensePlate: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Ganancia del Repartidor (%)</label>
                <p className="text-[10px] text-gray-400 mb-2">Porcentaje del "Costo de Envío" que el repartidor se queda para él.</p>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.commissionRate}
                  onChange={(e) => setForm({...form, commissionRate: e.target.value})}
                  className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                />
              </div>

              <div className="flex gap-2.5 sm:gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-98 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-[#2E7D32] text-white rounded-xl text-sm font-semibold hover:bg-[#1B5E20] transition-all active:scale-98 disabled:opacity-50 shadow-sm shadow-[#2E7D32]/20"
                >
                  {saving ? "Guardando..." : "Guardar repartidor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}