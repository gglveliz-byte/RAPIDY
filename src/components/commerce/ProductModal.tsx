/**
 * @archivo src/components/commerce/ProductModal.tsx
 * @modulo Comercio - Catálogo de Productos
 * @proposito
 *   Modal de creación y edición de productos para el catálogo del comercio,
 *   con cabecera Dark Velvet #0E0E12, inputs con foco en Flame Orange #FF6A00,
 *   selector de unidad/kilogramo en chips interactivos y previsualizador de fotografía.
 *
 * @resumen_contenido
 *   - Función auxiliar `readFileAsDataURL`: Convierte archivos de imagen a Base64.
 *   - Interfaz `ProductModalProps`: Definición de props y handlers de persistencia.
 *   - Componente `ProductModal`: Formulario responsivo con selector de tabs para imagen,
 *     chips de tipo de venta, conmutadores de disponibilidad/destacado y botón de guardado.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `react`: useState
 *   - `lucide-react`: Iconos `X`, `Camera`, `Image as ImageIcon`, `Sparkles`
 */

import { useState } from "react";
import { X, Camera, Image as ImageIcon, Sparkles } from "lucide-react";

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: {
    name: string;
    description: string;
    price: string;
    category: string;
    image: string;
    unitType: string;
    isFeatured: string;
    isAvailable: string;
  }) => Promise<void>;
  initialData?: {
    name?: string;
    description?: string;
    price?: string;
    category?: string;
    image?: string;
    unitType?: string;
    isFeatured?: string;
    isAvailable?: string;
  } | null;
  saving?: boolean;
}

/**
 * Convierte un objeto File en una cadena Data URL en formato Base64.
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Modal responsivo para agregar o editar un producto en el menú del comercio.
 */
export default function ProductModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  saving = false,
}: ProductModalProps) {
  const [form, setForm] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    price: initialData?.price ? String(initialData.price) : "",
    category: initialData?.category || "",
    image: initialData?.image || "",
    unitType: initialData?.unitType || "unit",
    isFeatured: initialData?.isFeatured || "no",
    isAvailable: initialData?.isAvailable || "yes",
  });
  const [activeImageTab, setActiveImageTab] = useState<"file" | "url">("file");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price.trim()) return;
    await onSave(form);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await readFileAsDataURL(file);
        setForm((prev) => ({ ...prev, image: base64 }));
      } catch (err) {
        console.error("Error al leer archivo:", err);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 overflow-hidden">
      {/* Contenedor adaptativo: Pantalla completa en móviles pequeños, ventana centrada en tablets y desktops */}
      <div className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200 border border-slate-100">
        
        {/* Cabecera Fija Dark Velvet */}
        <div className="flex items-center justify-between px-4 min-[360px]:px-5 py-3 min-[360px]:py-3.5 bg-[#0E0E12] border-b border-white/10 flex-shrink-0 text-white">
          <div className="min-w-0 pr-2">
            <h2 className="text-sm min-[360px]:text-base font-bold text-white truncate">
              {initialData ? "Editar producto" : "Nuevo producto"}
            </h2>
            <p className="text-[10px] min-[360px]:text-xs text-white/60 truncate">
              {initialData ? "Actualiza datos y precios de venta" : "Agrega un ítem a tu catálogo"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors flex-shrink-0 active:scale-95"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo del Formulario con Desplazamiento */}
        <form id="product-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 min-[360px]:px-5 py-3.5 space-y-3.5 text-xs min-[360px]:text-sm">
          
          {/* Nombre del Producto */}
          <div>
            <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Nombre del Producto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Hamburguesa Doble Queso"
              className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none transition-all text-slate-800 placeholder:text-slate-400"
            />
          </div>

          {/* Grilla de Precio y Categoría */}
          <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5 min-[360px]:gap-3">
            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Precio ($ USD) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                  className="w-full h-9 min-[360px]:h-10 pl-7 pr-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none transition-all text-slate-800 font-bold text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Categoría
              </label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej: Principales"
                className="w-full h-9 min-[360px]:h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none transition-all text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Selector de Tipo de Cobro en Chips Interactivos */}
          <div>
            <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Tipo de Venta / Unidad
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, unitType: "unit" })}
                className={`py-2 px-3 rounded-xl border text-center transition-all ${
                  form.unitType === "unit"
                    ? "border-[#FF6A00] bg-orange-50/70 text-[#FF6A00] ring-1 ring-[#FF6A00] shadow-2xs font-bold"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 font-medium"
                }`}
              >
                <div className="text-[11px] min-[360px]:text-xs">Por Unidad</div>
                <div className="text-[9px] opacity-75">1 u, plato, porción</div>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, unitType: "kg" })}
                className={`py-2 px-3 rounded-xl border text-center transition-all ${
                  form.unitType === "kg"
                    ? "border-[#FF6A00] bg-orange-50/70 text-[#FF6A00] ring-1 ring-[#FF6A00] shadow-2xs font-bold"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 font-medium"
                }`}
              >
                <div className="text-[11px] min-[360px]:text-xs">Por Kilo</div>
                <div className="text-[9px] opacity-75">Carnes, peso</div>
              </button>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Descripción del Producto
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ingredientes, acompañamientos o detalles..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none transition-all text-slate-800 resize-none text-xs min-[360px]:text-sm placeholder:text-slate-400"
            />
          </div>

          {/* Previsualizador de Fotografía y Selector */}
          <div className="border border-slate-200/90 rounded-2xl p-3 bg-slate-50/60">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-[10px] min-[360px]:text-xs font-bold text-slate-600 uppercase tracking-wider">
                Foto del Producto
              </label>
              <div className="flex rounded-xl bg-slate-200/80 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveImageTab("file")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    activeImageTab === "file" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Subir
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImageTab("url")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    activeImageTab === "url" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Link URL
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Previsualizador */}
              <div className="w-14 h-14 min-[360px]:w-16 min-[360px]:h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-xs">
                {form.image ? (
                  <img
                    src={form.image}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&h=120&fit=crop";
                    }}
                  />
                ) : (
                  <ImageIcon className="w-6 h-6 text-slate-300" />
                )}
              </div>

              {/* Selector de Archivo o Input de URL */}
              <div className="flex-1 min-w-0">
                {activeImageTab === "file" ? (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-orange-200 hover:border-[#FF6A00] bg-orange-50/40 hover:bg-orange-50/70 rounded-xl p-2 cursor-pointer transition-all">
                    <Camera className="w-4 h-4 text-[#FF6A00] mb-0.5" />
                    <span className="text-[10px] min-[360px]:text-xs text-[#FF6A00] font-bold text-center">
                      Cargar foto desde equipo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <input
                    type="url"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder="https://ejemplo.com/foto.jpg"
                    className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none text-slate-800"
                  />
                )}
                {form.image && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, image: "" })}
                    className="text-[10px] text-red-500 hover:underline mt-1 font-semibold block"
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Conmutadores: Stock Disponible y Destacado */}
          <div className="space-y-2 pt-0.5">
            {/* Conmutador de Disponibilidad */}
            <div
              onClick={() =>
                setForm({
                  ...form,
                  isAvailable: form.isAvailable === "yes" ? "no" : "yes",
                })
              }
              className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 cursor-pointer select-none transition-colors"
            >
              <div>
                <div className="text-xs font-bold text-slate-700">Stock Disponible</div>
                <div className="text-[10px] text-slate-400">Los clientes podrán pedirlo inmediatamente</div>
              </div>
              <div
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  form.isAvailable === "yes" ? "bg-[#FF6A00]" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                    form.isAvailable === "yes" ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </div>

            {/* Conmutador de Destacado */}
            <div
              onClick={() =>
                setForm({
                  ...form,
                  isFeatured: form.isFeatured === "yes" ? "no" : "yes",
                })
              }
              className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 cursor-pointer select-none transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <div>
                  <div className="text-xs font-bold text-slate-700">Destacar Producto</div>
                  <div className="text-[10px] text-slate-400">Aparecerá en la sección superior destacada</div>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
                  form.isFeatured === "yes" ? "bg-amber-500" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform ${
                    form.isFeatured === "yes" ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </div>
          </div>
        </form>

        {/* Pie Fijo con Botones de Acción */}
        <div className="p-3 min-[360px]:p-3.5 border-t border-slate-100 bg-white flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-9 min-[360px]:h-10 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-100 active:scale-98 transition-all text-xs min-[360px]:text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="product-form"
            disabled={saving}
            className="flex-[2] h-9 min-[360px]:h-10 rounded-xl bg-[#FF6A00] hover:bg-[#e65f00] text-white font-black shadow-md shadow-[#FF6A00]/25 active:scale-98 transition-all flex items-center justify-center gap-1.5 text-xs min-[360px]:text-sm disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Guardando...
              </span>
            ) : (
              <span>{initialData ? "Guardar cambios" : "Crear producto"}</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
