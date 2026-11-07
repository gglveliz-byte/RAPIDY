import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, Star, Sparkles,
  Package, CheckCircle2, XCircle
} from "lucide-react";
import {
  useCreateProduct,
  useDeleteProduct,
  useMerchantCommerceId,
  useProductsByCommerce,
  useUpdateProduct,
} from "@/hooks/useDeliveryData";
import CommerceLayout from "@/components/CommerceLayout";
import ProductModal from "@/components/commerce/ProductModal";
import DeleteConfirmModal from "@/components/commerce/DeleteConfirmModal";

export default function CommerceProducts() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<any>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { commerceId } = useMerchantCommerceId();
  const { data: products = [], loading } = useProductsByCommerce(commerceId || 0);
  const createProduct = useCreateProduct(commerceId || 0);
  const updateProduct = useUpdateProduct(commerceId || 0);
  const deleteProductMutation = useDeleteProduct(commerceId || 0);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p: any) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set);
  }, [products]);

  // Filter products
  const filtered = products.filter((p: any) => {
    const matchesSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || p.category?.trim().toLowerCase() === selectedCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const openAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setShowModal(true);
  };

  const handleSaveProduct = async (formData: any) => {
    setSaving(true);
    try {
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...formData });
      } else {
        await createProduct.mutateAsync(formData);
      }
      setShowModal(false);
      setEditing(null);
    } catch (err: any) {
      alert(err?.message || "Error al guardar producto");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (id: number, current: string) => {
    const newVal = current === "yes" ? "no" : "yes";
    try {
      await updateProduct.mutateAsync({ id, isAvailable: newVal });
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!confirmingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProductMutation.mutateAsync(confirmingDelete.id);
      setConfirmingDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || "No se pudo eliminar el producto.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <CommerceLayout>
      <div className="p-2.5 min-[360px]:p-4 lg:p-6 max-w-6xl mx-auto space-y-3 min-[360px]:space-y-4">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2 bg-white rounded-2xl p-2.5 min-[360px]:p-4 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"
              aria-label="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                Catálogo de Productos
              </h1>
              <p className="text-[10px] text-slate-400 truncate">
                {products.length} productos registrados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="h-8 min-[360px]:h-9 px-2.5 min-[360px]:px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 shadow-sm shadow-emerald-600/25 active:scale-95 transition-all flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo</span>
          </button>
        </div>

        {/* Search & Category Filter Section */}
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o ingredientes..."
              className="w-full h-9 min-[360px]:h-10 pl-9 pr-3 bg-white border border-slate-200/90 rounded-xl text-xs min-[360px]:text-sm focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none text-slate-800 shadow-2xs placeholder:text-slate-400 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Category Pills (Horizontal scroll) */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  selectedCategory === "all"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                Todos ({products.length})
              </button>
              {categories.map((cat) => {
                const count = products.filter((p: any) => p.category?.trim() === cat).length;
                const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                      isSelected
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-2xs">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Sin productos</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              {search || selectedCategory !== "all"
                ? "No hay productos que coincidan con la búsqueda."
                : "Aún no tienes productos en tu menú. ¡Crea el primero ahora!"}
            </p>
            {(!search && selectedCategory === "all") && (
              <button
                type="button"
                onClick={openAdd}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                Crear Primer Producto
              </button>
            )}
          </div>
        )}

        {/* Products Grid (Fluid 1 col on <540px, 2 col on tablet, 3 on desktop) */}
        {!loading && (
          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-2.5 min-[360px]:gap-3">
            {filtered.map((p: any) => {
              const isAvail = p.isAvailable === "yes";
              const isFeat = p.isFeatured === "yes";

              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl border transition-all p-2.5 min-[360px]:p-3 flex flex-col justify-between shadow-2xs hover:shadow-xs ${
                    isAvail ? "border-slate-200/80" : "border-slate-200 opacity-75 bg-slate-50/50"
                  }`}
                >
                  {/* Top section: image + info */}
                  <div className="flex gap-2.5 items-start">
                    {/* Thumbnail */}
                    <div className="relative w-16 h-16 min-[360px]:w-18 min-[360px]:h-18 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-100 shadow-2xs">
                      <img
                        src={
                          p.image ||
                          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop"
                        }
                        alt={p.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop";
                        }}
                      />
                      {isFeat && (
                        <div className="absolute top-1 left-1 bg-amber-500 text-white p-0.5 rounded-md shadow-xs">
                          <Star className="w-3 h-3 fill-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <h3 className="text-xs min-[360px]:text-sm font-bold text-slate-800 truncate">
                            {p.name}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-medium truncate block">
                            {p.category || "General"}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            title="Editar"
                            className="w-7 h-7 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-700 flex items-center justify-center transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingDelete(p);
                              setDeleteError(null);
                            }}
                            title="Eliminar"
                            className="w-7 h-7 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {p.description && (
                        <p className="text-[10px] min-[360px]:text-[11px] text-slate-500 line-clamp-1 mt-0.5 leading-snug">
                          {p.description}
                        </p>
                      )}

                      {/* Price and Stock Toggle */}
                      <div className="flex items-center justify-between gap-1 mt-2 pt-1 border-t border-slate-100">
                        <span className="text-xs min-[360px]:text-sm font-black text-emerald-700">
                          ${parseFloat(p.price || 0).toFixed(2)}
                          {p.unitType === "kg" && (
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">/ kg</span>
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleAvailable(p.id, p.isAvailable)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1 ${
                            isAvail
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isAvail ? "bg-emerald-600" : "bg-slate-400"}`} />
                          {isAvail ? "Activo" : "Pausado"}
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Responsive Product Modal (Works from 240px to Desktop!) */}
        <ProductModal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSave={handleSaveProduct}
          initialData={editing}
          saving={saving}
        />

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={!!confirmingDelete}
          onClose={() => setConfirmingDelete(null)}
          onConfirm={confirmDelete}
          productName={confirmingDelete?.name || ""}
          deleting={deleting}
          error={deleteError}
        />

      </div>
    </CommerceLayout>
  );
}
