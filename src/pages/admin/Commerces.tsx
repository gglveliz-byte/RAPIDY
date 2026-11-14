import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Store, Star, Search, X, Plus, Eye, EyeOff, Trash2, Camera,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordResetDone, setPasswordResetDone] = useState<string | null>(null);

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
    setResetPasswordOpen(false);
    setResetPasswordValue("");
    setResetPasswordError(null);
    setResettingPassword(false);
    setPasswordResetDone(null);
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

  const handleResetMerchantPassword = async () => {
    if (!editing?.merchantUserId) {
      setResetPasswordError("Este comercio no tiene un merchant asignado.");
      return;
    }
    const temporaryPassword = resetPasswordValue;
    if (temporaryPassword.length < 8) {
      setResetPasswordError("La contraseña temporal debe tener al menos 8 caracteres.");
      return;
    }
    if (temporaryPassword.length > 72) {
      setResetPasswordError("La contraseña temporal no puede superar los 72 caracteres.");
      return;
    }
    setResettingPassword(true);
    setResetPasswordError(null);
    try {
      const result = await trpcMutate<{ success: boolean; email: string }>(
        "admin.resetMerchantPassword",
        { userId: editing.merchantUserId, password: temporaryPassword },
      );
      // La contraseña nunca se conserva ni se muestra después del reset.
      setResetPasswordValue("");
      setResetPasswordOpen(false);
      setPasswordResetDone(result.email);
      toast.success("Contraseña temporal actualizada. Se revocaron las sesiones del merchant.");
    } catch (err: any) {
      setResetPasswordError(err?.message || "No se pudo resetear la contraseña.");
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col min-h-full bg-[#F7F7FA] dark:bg-[#0A0A0D]">
      <header className="bg-white dark:bg-[#111115] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button type="button" onClick={() => navigate("/admin")} aria-label="Volver al panel" className="touch-target shrink-0">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-500 dark:text-zinc-400" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">Comercios</h1>
          </div>
          <button type="button" onClick={openNewMerchant} className="min-h-11 flex items-center gap-1.5 lg:gap-2 bg-brand text-zinc-950 px-3 lg:px-4 py-1.5 lg:py-2 rounded-xl text-xs lg:text-sm font-semibold hover:bg-brand-strong transition-colors shrink-0 shadow-xs shadow-brand/20">
            <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Nuevo</span>
          </button>
        </div>
      </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          {loading ? (
            <div role="status" aria-live="polite" className="text-center py-12 text-zinc-500 dark:text-zinc-400 text-sm">Cargando...</div>
          ) : loadError ? (
            <div className="bg-white dark:bg-[#16161B] rounded-xl p-6 text-center border border-red-200 dark:border-red-900/50">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                No se pudieron cargar los comercios
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">{loadError}</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 min-h-11 px-4 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 lg:gap-3 mb-3 lg:mb-4 lg:shrink-0">
                <div className="relative flex-1">
                  <label htmlFor="commerce-search" className="sr-only">Buscar comercio</label>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                  <input
                    id="commerce-search"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar comercio..."
                    className="w-full h-9 lg:h-10 pl-9 pr-4 bg-white dark:bg-[#16161B] rounded-xl border border-zinc-200 dark:border-white/10 text-xs lg:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <div className="bg-transparent lg:bg-white dark:lg:bg-[#1A1A1E] lg:rounded-xl lg:card-shadow dark:lg:shadow-none lg:border lg:border-zinc-100 dark:lg:border-white/10 lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white dark:bg-[#1A1A1E]">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-500 dark:text-zinc-400 lg:sticky lg:top-0 lg:z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Comercio</th>
                        <th className="text-left px-4 py-3 font-medium">Telefono</th>
                        <th className="text-left px-4 py-3 font-medium">Comision</th>
                        <th className="text-left px-4 py-3 font-medium">Estado</th>
                        <th className="text-left px-4 py-3 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                      {filtered.map((c) => (
                        <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-zinc-100 dark:bg-white/10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                                {c.logo ? (
                                  <img src={c.logo} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-4 h-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' }} />
                                ) : (
                                  <Store className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{c.name}</p>
                                <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  <Star className="w-3 h-3 text-[#FFC107]" />
                                  {c.rating || "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{c.phone || "-"}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{c.commissionRate ? `${c.commissionRate}%` : "-"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : c.status === "pending" ? "bg-yellow-100 text-yellow-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"}`}>
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
                              <button type="button" onClick={() => toggleStatus(c.id)} aria-label={`${c.status === "active" ? "Suspender" : "Activar"} ${c.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-brand rounded-lg hover:bg-brand-soft transition-colors" title={c.status === "active" ? "Suspender" : "Activar"}>
                                {c.status === "active" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button type="button" onClick={() => openEdit(c)} aria-label={`Editar ${c.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center px-2 text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/15 transition-colors" title="Editar">
                                <span className="hidden lg:inline text-xs font-medium">Editar</span>
                                <span className="lg:hidden text-[10px] font-medium uppercase">Ed</span>
                              </button>
                              <button type="button" onClick={() => openDeleteConfirm(c)} aria-label={`Eliminar ${c.name}`} className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors" title="Eliminar">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-8 text-zinc-500 dark:text-zinc-400">{search ? "No hay comercios que coincidan con la búsqueda" : "Sin comercios registrados"}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden flex flex-col gap-3 pb-4">
                  {filtered.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">{search ? "No hay comercios que coincidan con la búsqueda" : "Sin comercios registrados"}</div>
                  ) : (
                    filtered.map((c) => (
                      <div key={c.id} className="bg-white dark:bg-[#1A1A1E] rounded-xl card-shadow dark:shadow-none border border-zinc-100 dark:border-white/10 p-4 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-zinc-100 dark:bg-white/10 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                              {c.logo ? (
                                <img src={c.logo} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-4 h-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' }} />
                              ) : (
                                <Store className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{c.name}</p>
                              <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                                <Star className="w-3 h-3 text-[#FFC107]" />
                                {c.rating || "—"}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${c.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : c.status === "pending" ? "bg-yellow-100 text-yellow-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"}`}>
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
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Teléfono</span>
                            <span className="text-zinc-800 dark:text-zinc-200">{c.phone || "-"}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Comisión</span>
                            <span className="text-zinc-800 dark:text-zinc-200">{c.commissionRate ? `${c.commissionRate}%` : "-"}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-100 dark:border-white/10 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleStatus(c.id)}
                            aria-label={`${c.status === "active" ? "Suspender" : "Activar"} ${c.name}`}
                            className="min-h-11 px-3 flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-brand bg-zinc-100 dark:bg-white/10 hover:bg-brand-soft dark:hover:bg-brand-soft rounded-xl transition-all active:scale-95"
                            title={c.status === "active" ? "Suspender" : "Activar"}
                          >
                            {c.status === "active" ? <EyeOff className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <Eye className="w-4 h-4 text-green-600 dark:text-green-400" />}
                            <span>{c.status === "active" ? "Pausar" : "Activar"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={`Editar ${c.name}`}
                            className="min-h-11 px-3.5 text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 rounded-xl transition-all active:scale-95"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteConfirm(c)}
                            aria-label={`Eliminar ${c.name}`}
                            className="min-h-11 min-w-11 flex items-center justify-center text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/15 hover:bg-red-100 dark:hover:bg-red-500/25 rounded-xl transition-all active:scale-95"
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
      <DialogPrimitive.Root open={showNewMerchant} onOpenChange={(open) => { if (!open) setShowNewMerchant(false); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs animate-fade-in" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#16161B] rounded-2xl w-[calc(100%_-_1.25rem)] sm:w-full max-w-md max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-zinc-100 dark:border-white/10 overflow-hidden focus:outline-none"
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-zinc-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#16161B]">
              <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">Nuevo comercio</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Cerrar"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreateMerchant} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3.5 overscroll-contain">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Crea las credenciales de acceso para este negocio. Con este email y contraseña, el dueño del local podrá entrar a su propio panel para agregar sus productos y ver sus ventas.
                </p>
                <div>
                  <label htmlFor="merchant-name" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Nombre Comercial</label>
                  <input
                    id="merchant-name"
                    placeholder="Ej: Pizzería Don Juan"
                    value={merchantForm.name}
                    onChange={(e) => setMerchantForm({...merchantForm, name: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="merchant-email" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Correo de Acceso (Email)</label>
                  <input
                    id="merchant-email"
                    type="email"
                    placeholder="contacto@pizzeria.com"
                    value={merchantForm.email}
                    onChange={(e) => setMerchantForm({...merchantForm, email: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="merchant-password" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Contraseña temporal</label>
                  <input
                    id="merchant-password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={merchantForm.password}
                    onChange={(e) => setMerchantForm({...merchantForm, password: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="merchant-category" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Categoría principal</label>
                  <select
                    id="merchant-category"
                    value={merchantForm.categoryId}
                    onChange={(e) => setMerchantForm({...merchantForm, categoryId: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
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
              <div className="p-3.5 sm:p-5 border-t border-zinc-100 dark:border-white/10 bg-zinc-50/90 dark:bg-[#111115] shrink-0 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowNewMerchant(false)}
                  className="flex-1 h-11 border border-zinc-200 dark:border-white/10 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-white/10 active:scale-98 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 h-11 bg-brand text-zinc-950 rounded-xl text-sm font-semibold hover:bg-brand-strong disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-brand/20"
                >
                  {saving ? "Creando..." : "Crear comercio"}
                </button>
              </div>
            </form>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Modal Eliminar Comercio */}
      <DialogPrimitive.Root open={Boolean(confirmingDelete)} onOpenChange={(open) => { if (!open) closeConfirm(); }}>
        {confirmingDelete && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs animate-fade-in" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#16161B] rounded-2xl w-[calc(100%_-_1.5rem)] sm:w-full max-w-sm p-4 sm:p-6 shadow-2xl border border-zinc-100 dark:border-white/10 focus:outline-none"
            >
            {deleteError ? (
              <>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-red-600 dark:text-red-400">No se puede desactivar</DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    aria-label="Cerrar"
                    className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </DialogPrimitive.Close>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">
                  No pudimos desactivar <strong>{confirmingDelete.name}</strong>.
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 leading-relaxed">{deleteError}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeConfirm}
                    className="flex-1 h-11 bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 text-sm font-medium rounded-xl hover:bg-zinc-200 dark:hover:bg-white/15 active:scale-98 transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">Desactivar comercio</DialogPrimitive.Title>
                  <DialogPrimitive.Close
                    aria-label="Cerrar"
                    className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </DialogPrimitive.Close>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-1">
                  ¿Estás seguro de desactivar <strong>{confirmingDelete.name}</strong>?
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5 leading-relaxed">
                  El comercio dejará de recibir pedidos, sus productos se pausan y se revoca
                  el acceso del merchant. El historial de pedidos y la contabilidad se conservan.
                </p>
                <div className="flex gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={closeConfirm}
                    className="flex-1 h-11 bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 text-sm font-medium rounded-xl hover:bg-zinc-200 dark:hover:bg-white/15 active:scale-98 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deleting}
                    className="flex-1 h-11 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-red-600/20"
                  >
                    {deleting ? "Desactivando..." : "Desactivar"}
                  </button>
                </div>
              </>
            )}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </DialogPrimitive.Root>

      {/* Modal Editar Comercio */}
      <DialogPrimitive.Root open={showForm && Boolean(editing)} onOpenChange={(open) => { if (!open) setShowForm(false); }}>
        {showForm && editing && (
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs animate-fade-in" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#16161B] rounded-2xl w-[calc(100%_-_1.25rem)] sm:w-full max-w-lg max-h-[80dvh] sm:max-h-[85dvh] flex flex-col shadow-2xl border border-zinc-100 dark:border-white/10 overflow-hidden focus:outline-none"
            >
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-zinc-100 dark:border-white/10 shrink-0 bg-white dark:bg-[#16161B]">
              <DialogPrimitive.Title className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">Editar comercio</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Cerrar"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </DialogPrimitive.Close>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-3.5 overscroll-contain">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Modifica la información pública del negocio, los horarios en los que operan, y el porcentaje exacto de comisión que les vas a cobrar por cada venta que hagan a través de la app.
                </p>
              {/* Logo + Portada: responsive 1 col mobile, 2 col sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50 dark:bg-[#1A1A1E] p-3 rounded-xl border border-zinc-100 dark:border-white/10">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1.5 block">Logo del Comercio</label>
                  <div className="flex gap-2.5 items-center">
                    {editForm.logo ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#16161B] shadow-xs">
                        <img src={editForm.logo} alt="logo" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-zinc-200 dark:bg-white/10 flex items-center justify-center shrink-0 text-zinc-400 dark:text-zinc-500">
                        <Store className="w-6 h-6" />
                      </div>
                    )}
                    <label className="min-h-11 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-strong dark:text-brand cursor-pointer hover:text-brand-strong bg-white dark:bg-[#1A1A1E] px-3 py-2 rounded-lg border border-brand/20 dark:border-brand/30 hover:bg-brand-soft dark:hover:bg-brand-soft transition-colors">
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
                  <label className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1.5 block">Foto de Portada</label>
                  <div className="flex gap-2.5 items-center">
                    {editForm.coverImage ? (
                      <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#16161B] shadow-xs">
                        <img src={editForm.coverImage} alt="cover" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-zinc-200 dark:bg-white/10 flex items-center justify-center shrink-0 text-zinc-400 dark:text-zinc-500">
                        <Camera className="w-6 h-6" />
                      </div>
                    )}
                    <label className="min-h-11 flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-brand-strong dark:text-brand cursor-pointer hover:text-brand-strong bg-white dark:bg-[#1A1A1E] px-3 py-2 rounded-lg border border-brand/20 dark:border-brand/30 hover:bg-brand-soft dark:hover:bg-brand-soft transition-colors">
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
                <label htmlFor="commerce-name" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Nombre Público</label>
                <input
                  id="commerce-name"
                  placeholder="Nombre que verán los clientes"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="commerce-phone" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Teléfono</label>
                  <input
                    id="commerce-phone"
                    placeholder="Para contacto"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label htmlFor="commerce-email" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Email</label>
                  <input
                    id="commerce-email"
                    placeholder="Correo público"
                    value={editForm.email}
                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="commerce-address" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Dirección física</label>
                <input
                  id="commerce-address"
                  placeholder="Calle y número"
                  value={editForm.address}
                  onChange={(e) => setEditForm({...editForm, address: e.target.value})}
                  className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="commerce-lat" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Latitud</label>
                  <input
                    id="commerce-lat"
                    inputMode="decimal"
                    placeholder="Ej: -0.180700"
                    value={editForm.lat}
                    onChange={(e) => setEditForm({...editForm, lat: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label htmlFor="commerce-lng" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Longitud</label>
                  <input
                    id="commerce-lng"
                    inputMode="decimal"
                    placeholder="Ej: -78.467800"
                    value={editForm.lng}
                    onChange={(e) => setEditForm({...editForm, lng: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              {editing?.merchantEmail && (
                <div className="rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-blue-500 dark:text-blue-400">Email de acceso del merchant</p>
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 break-all">{editing.merchantEmail}</p>
                </div>
              )}

              {editing?.merchantUserId && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-3 space-y-2">
                  {passwordResetDone ? (
                    <>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        Contraseña temporal actualizada para {passwordResetDone}.
                      </p>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        Compártela por un canal seguro. Se revocaron todas las sesiones activas del merchant;
                        no se vuelve a mostrar.
                      </p>
                    </>
                  ) : resetPasswordOpen ? (
                    <>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Confirmar reseteo de contraseña
                      </p>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        Se cerrarán las sesiones activas de <strong>{editing.merchantEmail || "este merchant"}</strong>.
                        Define una contraseña temporal (8 a 72 caracteres).
                      </p>
                      <input
                        type="password"
                        autoComplete="new-password"
                        aria-label="Contraseña temporal"
                        placeholder="Contraseña temporal"
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        minLength={8}
                        maxLength={72}
                        className="w-full h-10 px-3 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                      />
                      {resetPasswordError && (
                        <p className="text-[11px] text-red-600 dark:text-red-400">{resetPasswordError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setResetPasswordOpen(false);
                            setResetPasswordValue("");
                            setResetPasswordError(null);
                          }}
                          disabled={resettingPassword}
                          className="flex-1 min-h-11 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-white/10 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/15 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleResetMerchantPassword}
                          disabled={resettingPassword || resetPasswordValue.length < 8 || resetPasswordValue.length > 72}
                          className="flex-1 min-h-11 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 shadow-sm shadow-red-600/20"
                        >
                          {resettingPassword ? "Reseteando..." : "Confirmar reset"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">Acceso del merchant</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            Genera una contraseña temporal y revoca sus sesiones.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setResetPasswordOpen(true);
                            setResetPasswordError(null);
                            setPasswordResetDone(null);
                          }}
                          className="shrink-0 min-h-11 px-3 rounded-xl text-xs font-semibold text-red-700 dark:text-red-400 bg-white dark:bg-white/10 border border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/15"
                        >
                          Resetear contraseña
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="commerce-category" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Categoría</label>
                  <select
                    id="commerce-category"
                    value={editForm.categoryId}
                    onChange={(e) => setEditForm({...editForm, categoryId: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  >
                    <option value="">Seleccione...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="commerce-is-open" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Disponibilidad</label>
                  <select
                    id="commerce-is-open"
                    value={editForm.isOpen}
                    onChange={(e) => setEditForm({...editForm, isOpen: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  >
                    <option value="open">Abierto recibiendo pedidos</option>
                    <option value="closed">Cerrado actualmente</option>
                  </select>
                </div>
              </div>

              {/* Commission, Rating, MinOrder: 1 col on mobile, 3 col on sm+ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="commerce-commission" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Comisión (%)</label>
                  <input
                    id="commerce-commission"
                    placeholder="Ej: 10"
                    value={editForm.commissionRate}
                    onChange={(e) => setEditForm({...editForm, commissionRate: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label htmlFor="commerce-rating" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Rating (Estrellas)</label>
                  <input
                    id="commerce-rating"
                    placeholder="Ej: 4.5"
                    value={editForm.rating}
                    onChange={(e) => setEditForm({...editForm, rating: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label htmlFor="commerce-min-order" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Pedido Mín ($)</label>
                  <input
                    id="commerce-min-order"
                    placeholder="Ej: 5.00"
                    value={editForm.minOrder}
                    onChange={(e) => setEditForm({...editForm, minOrder: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="commerce-delivery-time" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Tiempo de entrega</label>
                  <input
                    id="commerce-delivery-time"
                    placeholder="Ej: 30-45 min"
                    value={editForm.deliveryTime}
                    onChange={(e) => setEditForm({...editForm, deliveryTime: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label htmlFor="commerce-open-hours" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Horarios de atención</label>
                  <input
                    id="commerce-open-hours"
                    placeholder="Ej: Lun-Vie 9-21"
                    value={editForm.openHours}
                    onChange={(e) => setEditForm({...editForm, openHours: e.target.value})}
                    className="w-full h-11 px-4 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="commerce-description" className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1 block">Descripción breve</label>
                <textarea
                  id="commerce-description"
                  placeholder="De qué trata este negocio..."
                  value={editForm.description}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-white dark:bg-[#1A1A1E] border border-zinc-200 dark:border-white/10 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 resize-none"
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
                  className="flex-1 h-11 bg-brand text-zinc-950 rounded-xl text-sm font-semibold hover:bg-brand-strong disabled:opacity-50 active:scale-98 transition-all shadow-sm shadow-brand/20"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </DialogPrimitive.Root>
      </div>
    </AdminLayout>
  );
}