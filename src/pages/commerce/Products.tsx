/**
 * @archivo src/pages/commerce/Products.tsx
 * @modulo Comercio - Catálogo de Productos
 * @proposito
 *   Vista principal de gestión del catálogo de productos del comercio en Rapidy.
 *   Permite listar, buscar, filtrar por categorías, conmutar disponibilidad en vivo,
 *   y abrir los modales de creación, edición y eliminación de ítems.
 *
 * @resumen_contenido
 *   - Componente `CommerceProducts`:
 *       * Consulta reactiva de productos por comercio (`useProductsByCommerce`).
 *       * Mutaciones de creación, actualización y eliminación (`useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`).
 *       * Filtrado por término de búsqueda y selector dinámico de categorías en chips Flame Orange.
 *       * Tarjetas de producto de diseño prémium con fotos redondeadas, precio en negrita naranja y switch de estado.
 *       * Integración con `ProductModal` y `DeleteConfirmModal`.
 *
 * @dependencias_internas
 *   - `CommerceLayout` (@/components/CommerceLayout)
 *   - `ProductModal` (@/components/commerce/ProductModal)
 *   - `DeleteConfirmModal` (@/components/commerce/DeleteConfirmModal)
 *   - Hooks de datos (@/hooks/useDeliveryData)
 *   - Utilidad `safeImage` (@/lib/imageUtils)
 *
 * @dependencias_externas
 *   - `react`: useState, useMemo
 *   - `react-router`: useNavigate
 *   - `lucide-react`: ArrowLeft, Plus, Search, Pencil, Trash2, Star, Package
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, Star,
  Package
} from "lucide-react";
import {
  useCreateProduct,
  useDeleteProduct,
  useMerchantCommerceId,
  useProductsByCommerce,
  useUpdateProduct,
} from "@/hooks/useDeliveryData";
import { safeImage } from "@/lib/imageUtils";
import CommerceLayout from "@/components/CommerceLayout";
import ProductModal from "@/components/commerce/ProductModal";
import DeleteConfirmModal from "@/components/commerce/DeleteConfirmModal";

/**
 * Página de catálogo de productos del panel de comercio.
 */
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

  // Extraer categorías únicas
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p: any) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set);
  }, [products]);

  // Filtrar productos por búsqueda y categoría seleccionada
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
      <div className="px-4 min-[380px]:px-6 py-4 sm:py-6 max-w-5xl mx-auto space-y-4 min-[380px]:space-y-5">
        
        {/* Barra Superior de Cabecera */}
        <div className="flex items-center justify-between gap-2 bg-white rounded-2xl min-[380px]:rounded-3xl p-3 min-[380px]:p-4 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate("/commerce")}
              className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-slate-200/80 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0 active:scale-95"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm min-[360px]:text-base font-extrabold text-slate-800 truncate">
                Catálogo de Productos
              </h1>
              <p className="text-[10px] min-[360px]:text-xs text-slate-400 truncate">
                {products.length} productos registrados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openAdd}
            className="bg-[#FF6A00] hover:bg-[#e65f00] text-white font-black py-2 px-3 min-[380px]:py-2.5 min-[380px]:px-4 rounded-2xl shadow-md shadow-[#FF6A00]/25 active:scale-95 transition-all text-xs flex items-center gap-1.5 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden min-[380px]:inline">Nuevo Producto</span>
            <span className="min-[380px]:hidden">Nuevo</span>
          </button>
        </div>

        {/* Sección de Búsqueda y Filtro de Categorías */}
        <div className="space-y-2.5">
          {/* Barra de Búsqueda */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o descripción..."
              className="w-full h-10 pl-10 pr-16 bg-white border border-slate-200/90 rounded-2xl text-xs min-[360px]:text-sm focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20 outline-none text-slate-800 shadow-2xs placeholder:text-slate-400 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-lg transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Chips de Categorías con Desplazamiento Horizontal */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-3.5 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all ${
                  selectedCategory === "all"
                    ? "bg-[#FF6A00] text-white font-black shadow-sm shadow-[#FF6A00]/25"
                    : "bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50 font-medium"
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
                    className={`px-3.5 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all ${
                      isSelected
                        ? "bg-[#FF6A00] text-white font-black shadow-sm shadow-[#FF6A00]/25"
                        : "bg-white text-slate-600 border border-slate-200/90 hover:bg-slate-50 font-medium"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Indicador de Carga */}
        {loading && (
          <div className="flex items-center justify-center py-14">
            <div className="w-8 h-8 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Estado Vacío */}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 text-center shadow-2xs">
            <div className="w-14 h-14 rounded-3xl bg-orange-50 text-[#FF6A00] flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-sm min-[360px]:text-base font-bold text-slate-800">Sin productos disponibles</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              {search || selectedCategory !== "all"
                ? "No hay productos que coincidan con el filtro actual."
                : "Aún no tienes productos en tu menú. ¡Publica tu primer plato o artículo ahora!"}
            </p>
            {(!search && selectedCategory === "all") && (
              <button
                type="button"
                onClick={openAdd}
                className="mt-4 px-4 py-2.5 bg-[#FF6A00] hover:bg-[#e65f00] text-white rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-[#FF6A00]/25 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                Crear Primer Producto
              </button>
            )}
          </div>
        )}

        {/* Grilla Responsiva de Productos */}
        {!loading && (
          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-3 min-[360px]:gap-3.5">
            {filtered.map((p: any) => {
              const isAvail = p.isAvailable === "yes";
              const isFeat = p.isFeatured === "yes";

              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-3xl border transition-all duration-200 p-3.5 min-[380px]:p-4 flex flex-col justify-between shadow-2xs hover:shadow-md ${
                    isAvail
                      ? "border-slate-200/80 hover:border-orange-200/80"
                      : "border-slate-200/60 opacity-80 bg-slate-50/40"
                  }`}
                >
                  {/* Sección Superior: Imagen e Información */}
                  <div className="flex gap-3 items-start">
                    {/* Miniatura del Producto */}
                    <div className="relative w-18 h-18 min-[360px]:w-20 min-[360px]:h-20 rounded-2xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-100 shadow-2xs">
                      <img
                        src={
                          safeImage(p.image, "product") ||
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
                        <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white p-1 rounded-lg shadow-xs flex items-center justify-center">
                          <Star className="w-3 h-3 fill-white" />
                        </div>
                      )}
                    </div>

                    {/* Datos del Producto */}
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

                        {/* Botones de Acción */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            title="Editar"
                            className="w-7 h-7 rounded-xl hover:bg-orange-50 text-slate-400 hover:text-[#FF6A00] flex items-center justify-center transition-colors active:scale-90"
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
                            className="w-7 h-7 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors active:scale-90"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {p.description && (
                        <p className="text-[10px] min-[360px]:text-[11px] text-slate-500 line-clamp-1 mt-1 leading-snug">
                          {p.description}
                        </p>
                      )}

                      {/* Precio y Conmutador de Disponibilidad */}
                      <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-100">
                        <span className="text-xs min-[360px]:text-sm font-black text-[#FF6A00] tracking-tight">
                          ${parseFloat(p.price || 0).toFixed(2)}
                          {p.unitType === "kg" && (
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">/ kg</span>
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleAvailable(p.id, p.isAvailable)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 select-none ${
                            isAvail
                              ? "bg-orange-500/10 text-[#FF6A00] border border-[#FF6A00]/30 hover:bg-orange-500/15"
                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200/70"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvail ? "bg-[#FF6A00]" : "bg-slate-400"
                            }`}
                          />
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

        {/* Modal de Creación / Edición */}
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

        {/* Modal de Confirmación de Eliminación */}
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
