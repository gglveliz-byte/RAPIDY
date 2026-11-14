import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Store, Star, Search, X, Plus, Eye, EyeOff, Trash2, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { trpcCall, trpcMutate } from "@/hooks/useDeliveryData";
import AdminLayout from "@/components/AdminLayout";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function readImageAsCompressedDataURL(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera el máximo de 8 MB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function AdminCommerces() {
  const navigate = useNavigate();
  const [commerceList, setCommerceList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showNewMerchant, setShowNewMerchant] = useState(false);
  const [merchantForm, setMerchantForm] = useState({ name: "", email: "", password: "", categoryId: "" });
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "", lat: "", lng: "", commissionRate: "", deliveryTime: "", minOrder: "", description: "", categoryId: "", logo: "", coverImage: "", isOpen: "open", openHours: "", rating: "" });
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<any>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    trpcCall<any[]>("admin.listCommerces")
      .then(setCommerceList)
      .catch((error: any) => {
        setLoadError(error?.message || "No se pudieron cargar los comercios");
      })
      .finally(() => setLoading(false));
    trpcCall<any[]>("admin.listCategories")
      .then(setCategories)
      .catch((error: any) => {
        toast.error(error?.message || "No se pudieron cargar las categorías");
      });
  };

  useEffect(() => { load(); }, []);

  const filtered = commerceList.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const openDeleteConfirm = (c: any) => {
    setConfirmingDelete(c);
    setDeleteError(null);
    setDeleting(false);
  };

  const closeConfirm = () => {
    setConfirmingDelete(null);
    setDeleteError(null);
    setDeleting(false);
  };

  const confirmDelete = async () => {
    if (!confirmingDelete) return;
    setDeleting(true);
    try {
      await trpcMutate("admin.deleteCommerce", { id: confirmingDelete.id });
      setCommerceList(commerceList.map(c => c.id === confirmingDelete.id
        ? { ...c, status: "inactive", isOpen: "closed" }
        : c));
      toast.success("Comercio desactivado. El historial se conserva.");
      closeConfirm();
    } catch (err: any) {
      setDeleteError(err?.message || "Error al desactivar");
      setDeleting(false);
    }
  };

  const toggleStatus = async (id: number) => {
    try {
      const c = commerceList.find(c => c.id === id);
      if (!c) return;
      const current = c.status;
      const next = current === "active" ? "suspended" : "active";
      if (
        current === "active" &&
        !confirm(`¿Suspender "${c.name}"? Dejará de recibir pedidos hasta que lo reactives.`)
      ) {
        return;
      }
      const updated = await trpcMutate<any>("admin.updateCommerce", { id, status: next });
      setCommerceList(commerceList.map(c => c.id === id ? { ...c, ...updated } : c));
      toast.success(next === "active" ? "Comercio activado." : "Comercio suspendido.");
    } catch (err: any) {
      toast.error(err?.message || "No se pudo cambiar el estado.");
    }
  };

  const openNewMerchant = () => {
    setMerchantForm({ name: "", email: "", password: "", categoryId: "" });
    setShowNewMerchant(true);
  };

  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await trpcMutate("admin.createMerchant", {
        name: merchantForm.name,
        email: merchantForm.email,
        password: merchantForm.password,
        categoryId: Number(merchantForm.categoryId),
      });
      setShowNewMerchant(false);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: any) => {
    setEditing(c);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      lat: c.lat || "",
      lng: c.lng || "",
      commissionRate: c.commissionRate || "",
      deliveryTime: c.deliveryTime || "",
      minOrder: c.minOrder || "",
      description: c.description || "",
      categoryId: String(c.categoryId || ""),
      logo: c.logo || "",
      coverImage: c.coverImage || "",
      isOpen: c.isOpen || "open",
      openHours: c.openHours || "",
      rating: c.rating || "",
    });
    setShowForm(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { id: editing.id, ...editForm };
      // Los campos vacíos no deben sobrescribir valores existentes con cero.
      if (!payload.commissionRate) delete payload.commissionRate;
      if (!payload.minOrder) delete payload.minOrder;
      if (!payload.rating) delete payload.rating;
      if (!payload.lat) delete payload.lat;
      if (!payload.lng) delete payload.lng;
      if (payload.categoryId) payload.categoryId = Number(payload.categoryId);
      else delete payload.categoryId;
      const updated = await trpcMutate<any>("admin.updateCommerce", payload);
      setCommerceList(commerceList.map(c => c.id === editing.id ? { ...c, ...updated } : c));
      setShowForm(false);
      toast.success("Comercio actualizado.");
    } catch (err: any) {
      toast.error(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <header className="bg-white border-b border-gray-200 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button onClick={() => navigate("/admin")} className="touch-target shrink-0">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-gray-600" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-gray-800 truncate">Comercios</h1>
          </div>
          <button onClick={openNewMerchant} className="flex items-center gap-1.5 lg:gap-2 bg-[#2E7D32] text-white px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-medium hover:bg-[#1B5E20] transition-colors shrink-0 shadow-xs">
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Nuevo</span>
          </button>
        </div>
      </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Cargando...</div>
          ) : loadError ? (
            <div className="bg-white rounded-xl p-6 text-center border border-red-200">
              <p className="text-sm font-semibold text-red-700">
                No se pudieron cargar los comercios
              </p>
              <p className="text-xs text-red-600/80 mt-1">{loadError}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar comercio..."
                    className="w-full h-9 lg:h-10 pl-9 pr-4 bg-white rounded-xl border border-gray-200 text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              <div className="bg-white lg:bg-transparent lg:rounded-xl lg:card-shadow lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 lg:sticky lg:top-0 lg:z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Comercio</th>
                        <th className="text-left px-4 py-3 font-medium">Telefono</th>
                        <th className="text-left px-4 py-3 font-medium">Comision</th>
                        <th className="text-left px-4 py-3 font-medium">Estado</th>
                        <th className="text-left px-4 py-3 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                {c.logo ? (
                                  <img src={c.logo} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class=\"w-4 h-4 text-gray-500\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"M21 15l-5-5L5 21\"/></svg>' }} />
                                ) : (
                                  <Store className="w-4 h-4 text-gray-500" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 leading-tight">{c.name}</p>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Star className="w-3 h-3 text-[#FFC107]" />
                                  {c.rating || "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.phone || "-"}</td>
                          <td className="px-4 py-3 text-gray-600">{c.commissionRate ? `${c.commissionRate}%` : "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "active" ? "bg-green-100 text-green-700" : c.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                              {c.status === "active"
                                ? `Activo · ${c.isOpen === "open" ? "Abierto" : "Cerrado"}`
                                : c.status === "pending"
                                  ? "Pendiente"
                                  : c.status === "inactive"
                                    ? "Desactivado"
                                    : "Suspendido"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleStatus(c.id)} className="p-1.5 text-gray-400 hover:text-[#2E7D32] rounded-lg hover:bg-green-50" title={c.status === "active" ? "Suspender" : "Activar"}>
                                {c.status === "active" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" title="Editar">
                                <span className="hidden lg:inline text-xs font-medium">Editar</span>
                                <span className="lg:hidden text-[10px] font-medium uppercase">Ed</span>
                              </button>
                              <button onClick={() => openDeleteConfirm(c)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-8 text-gray-400">{search ? "No hay comercios que coincidan con la búsqueda" : "Sin comercios registrados"}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden flex flex-col gap-3 pb-4">
                  {filtered.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">{search ? "No hay comercios que coincidan con la búsqueda" : "Sin comercios registrados"}</div>
                  ) : (
                    filtered.map((c) => (
                      <div key={c.id} className="bg-white rounded-xl card-shadow p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                              {c.logo ? (
                                <img src={c.logo} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class=\"w-4 h-4 text-gray-500\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"M21 15l-5-5L5 21\"/></svg>' }} />
                              ) : (
                                <Store className="w-5 h-5 text-gray-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-800 leading-tight">{c.name}</p>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Star className="w-3 h-3 text-[#FFC107]" />
                                {c.rating || "—"}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.status === "active" ? "bg-green-100 text-green-700" : c.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {c.status === "active"
                              ? "Activo"
                              : c.status === "pending"
                                ? "Pendiente"
                                : c.status === "inactive"
                                  ? "Desactivado"
                                  : "Suspendido"}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="block text-[10px] text-gray-500">Teléfono</span>
                            <span className="text-gray-800">{c.phone || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-500">Comisión</span>
                            <span className="text-gray-800">{c.commissionRate ? `${c.commissionRate}%` : "-"}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleStatus(c.id)}
                            className="min-h-[40px] px-3 flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-[#2E7D32] bg-gray-100 hover:bg-green-50 rounded-xl transition-all active:scale-95"
                            title={c.status === "active" ? "Suspender" : "Activar"}
                          >
                            {c.status === "active" ? <EyeOff className="w-4 h-4 text-amber-600" /> : <Eye className="w-4 h-4 text-green-600" />}
                            <span>{c.status === "active" ? "Pausar" : "Activar"}</span>
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            className="min-h-[40px] px-3.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all active:scale-95"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(c)}
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

      {/* Modal Nuevo Comercio (crea usuario merchant) */}
      {showNewMerchant && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[70] p-2.5 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden my-auto">
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-gray-100 shrink-0 bg-white">
              <h2 className="text-base sm:text-lg font-bold text-gray-800">Nuevo comercio</h2>
              <button
                onClick={() => setShowNewMerchant(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreateMerchant} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3.5 overscroll-contain">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Crea las credenciales de acceso para este negocio. Con este email y contraseña, el dueño del local podrá entrar a su propio panel para agregar sus productos y ver sus ventas.
                </p>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Nombre Comercial</label>
                  <input
                    placeholder="Ej: Pizzería Don Juan"
                    value={merchantForm.name}
                    onChange={(e) => setMerchantForm({...merchantForm, name: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Correo de Acceso (Email)</label>
                  <input
                    type="email"
                    placeholder="contacto@pizzeria.com"
                    value={merchantForm.email}
                    onChange={(e) => setMerchantForm({...merchantForm, email: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Contraseña temporal</label>
                  <input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={merchantForm.password}
                    onChange={(e) => setMerchantForm({...merchantForm, password: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Categoría principal</label>
                  <select
                    value={merchantForm.categoryId}
                    onChange={(e) => setMerchantForm({...merchantForm, categoryId: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 bg-white"
                    required
                  >
                    <option value="">Seleccionar categoría...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="p-3.5 sm:p-5 border-t border-gray-100 bg-gray-50/90 shrink-0 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowNewMerchant(false)}
                  className="flex-1 h-11 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-white active:scale-98 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-[#2E7D32] text-white rounded-xl text-sm font-semibold hover:bg-[#1B5E20] disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-[#2E7D32]/20"
                >
                  {saving ? "Creando..." : "Crear comercio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Eliminar Comercio */}
      {confirmingDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 sm:p-6 shadow-2xl border border-gray-100 my-auto">
            {deleteError ? (
              <>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-red-600">No se puede desactivar</h2>
                  <button
                    onClick={closeConfirm}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  No pudimos desactivar <strong>{confirmingDelete.name}</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-5 leading-relaxed">{deleteError}</p>
                <div className="flex gap-2">
                  <button
                    onClick={closeConfirm}
                    className="flex-1 h-11 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 active:scale-98 transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h2 className="text-base sm:text-lg font-bold text-gray-800">Desactivar comercio</h2>
                  <button
                    onClick={closeConfirm}
                    className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  ¿Estás seguro de desactivar <strong>{confirmingDelete.name}</strong>?
                </p>
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                  El comercio dejará de recibir pedidos, sus productos se pausan y se revoca
                  el acceso del merchant. El historial de pedidos y la contabilidad se conservan.
                </p>
                <div className="flex gap-2.5 sm:gap-3">
                  <button
                    onClick={closeConfirm}
                    className="flex-1 h-11 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 active:scale-98 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="flex-1 h-11 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-red-600/20"
                  >
                    {deleting ? "Desactivando..." : "Desactivar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Editar Comercio */}
      {showForm && editing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[70] p-2.5 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden my-auto">
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-gray-100 shrink-0 bg-white">
              <h2 className="text-base sm:text-lg font-bold text-gray-800">Editar comercio</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3.5 overscroll-contain">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Modifica la información pública del negocio, los horarios en los que operan, y el porcentaje exacto de comisión que les vas a cobrar por cada venta que hagan a través de la app.
                </p>
              {/* Logo + Portada: responsive 1 col mobile, 2 col sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block">Logo del Comercio</label>
                  <div className="flex gap-2.5 items-center">
                    {editForm.logo ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-white shadow-xs">
                        <img src={editForm.logo} alt="logo" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 text-gray-400">
                        <Store className="w-6 h-6" />
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#2E7D32] cursor-pointer hover:text-[#1B5E20] bg-white px-3 py-2 rounded-lg border border-green-200 hover:bg-green-50 transition-colors">
                      <Camera className="w-4 h-4 shrink-0" />
                      {editForm.logo ? "Cambiar" : "Subir"}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          setEditForm({...editForm, logo: await readImageAsCompressedDataURL(f)});
                        } catch (error: any) {
                          toast.error(error?.message || "No se pudo procesar la imagen.");
                        }
                      }} />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block">Foto de Portada</label>
                  <div className="flex gap-2.5 items-center">
                    {editForm.coverImage ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-white shadow-xs">
                        <img src={editForm.coverImage} alt="cover" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-200 flex items-center justify-center shrink-0 text-gray-400">
                        <Camera className="w-6 h-6" />
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#2E7D32] cursor-pointer hover:text-[#1B5E20] bg-white px-3 py-2 rounded-lg border border-green-200 hover:bg-green-50 transition-colors">
                      <Camera className="w-4 h-4 shrink-0" />
                      {editForm.coverImage ? "Cambiar" : "Subir"}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          setEditForm({...editForm, coverImage: await readImageAsCompressedDataURL(f)});
                        } catch (error: any) {
                          toast.error(error?.message || "No se pudo procesar la imagen.");
                        }
                      }} />
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Nombre Público</label>
                <input
                  placeholder="Nombre que verán los clientes"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Teléfono</label>
                  <input
                    placeholder="Para contacto"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Email</label>
                  <input
                    placeholder="Correo público"
                    value={editForm.email}
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Dirección física</label>
                <input
                  placeholder="Calle y número"
                  value={editForm.address}
                  onChange={(e) => setEditForm({...editForm, address: e.target.value})}
                  className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Latitud</label>
                  <input
                    inputMode="decimal"
                    placeholder="Ej: -0.180700"
                    value={editForm.lat}
                    onChange={(e) => setEditForm({...editForm, lat: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Longitud</label>
                  <input
                    inputMode="decimal"
                    placeholder="Ej: -78.467800"
                    value={editForm.lng}
                    onChange={(e) => setEditForm({...editForm, lng: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              {editing?.merchantEmail && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-blue-500">Email de acceso del merchant</p>
                  <p className="text-xs font-semibold text-blue-800 break-all">{editing.merchantEmail}</p>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Categoría</label>
                  <select
                    value={editForm.categoryId}
                    onChange={(e) => setEditForm({...editForm, categoryId: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 bg-white"
                  >
                    <option value="">Seleccione...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Disponibilidad</label>
                  <select
                    value={editForm.isOpen}
                    onChange={(e) => setEditForm({...editForm, isOpen: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 bg-white"
                  >
                    <option value="open">Abierto recibiendo pedidos</option>
                    <option value="closed">Cerrado actualmente</option>
                  </select>
                </div>
              </div>

              {/* Commission, Rating, MinOrder: 1 col on mobile, 3 col on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Comisión (%)</label>
                  <input
                    placeholder="Ej: 10"
                    value={editForm.commissionRate}
                    onChange={(e) => setEditForm({...editForm, commissionRate: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Rating (Estrellas)</label>
                  <input
                    placeholder="Ej: 4.5"
                    value={editForm.rating}
                    onChange={(e) => setEditForm({...editForm, rating: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Pedido Mín ($)</label>
                  <input
                    placeholder="Ej: 5.00"
                    value={editForm.minOrder}
                    onChange={(e) => setEditForm({...editForm, minOrder: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Tiempo de entrega</label>
                  <input
                    placeholder="Ej: 30-45 min"
                    value={editForm.deliveryTime}
                    onChange={(e) => setEditForm({...editForm, deliveryTime: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Horarios de atención</label>
                  <input
                    placeholder="Ej: Lun-Vie 9-21"
                    value={editForm.openHours}
                    onChange={(e) => setEditForm({...editForm, openHours: e.target.value})}
                    className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Descripción breve</label>
                <textarea
                  placeholder="De qué trata este negocio..."
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#2E7D32] focus:ring-2 focus:ring-[#2E7D32]/20 resize-none"
                />
              </div>
              
              </div>
              
              {/* Sticky Action Footer */}
              <div className="p-3.5 sm:p-5 border-t border-gray-100 bg-gray-50/90 shrink-0 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-white active:scale-98 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-[#2E7D32] text-white rounded-xl text-sm font-semibold hover:bg-[#1B5E20] disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-[#2E7D32]/20"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}