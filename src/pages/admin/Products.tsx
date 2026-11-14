import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpcCall, trpcMutate } from "@/hooks/useDeliveryData";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  DollarSign,
  Search,
  Star,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminProducts() {
  const navigate = useNavigate();
  const topProductsQuery = useQuery({
    queryKey: ["admin.topProducts", 20],
    queryFn: () => trpcCall<any[]>("admin.topProducts", { limit: 20 }),
  });
  const topProducts = topProductsQuery.data ?? [];

  const [activeTab, setActiveTab] = useState<"ranking" | "all">("ranking");
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [errorAll, setErrorAll] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadAllProducts = () => {
    setLoadingAll(true);
    setErrorAll(null);
    trpcCall<any[]>("admin.listProducts")
      .then(setAllProducts)
      .catch((e: any) => setErrorAll(e?.message || "No se pudieron cargar los productos"))
      .finally(() => setLoadingAll(false));
  };

  useEffect(() => {
    if (activeTab === "all" && allProducts.length === 0) {
      loadAllProducts();
    }
  }, [activeTab]);

  const toggleAvailability = async (product: any) => {
    try {
      const result = await trpcMutate<{ adminPaused: boolean; isAvailable: string }>(
        "admin.toggleProductAvailability",
        { id: product.id },
      );
      setAllProducts((current) =>
        current.map((item) =>
          item.id === product.id
            ? { ...item, adminPaused: result.adminPaused, isAvailable: result.isAvailable }
            : item,
        ),
      );
      toast.success(result.adminPaused ? "Producto pausado." : "Producto reactivado.");
      topProductsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo moderar el producto.");
    }
  };

  const toggleFeatured = async (product: any) => {
    try {
      const result = await trpcMutate<{ isFeatured: string }>(
        "admin.toggleProductFeatured",
        { id: product.id },
      );
      setAllProducts((current) =>
        current.map((item) =>
          item.id === product.id ? { ...item, isFeatured: result.isFeatured } : item,
        ),
      );
      toast.success(result.isFeatured === "yes" ? "Producto destacado." : "Destacado retirado.");
      topProductsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cambiar el destacado.");
    }
  };

  const deleteProduct = async (product: any) => {
    if (!confirm(`¿Eliminar "${product.name}"? Solo se permite si nunca tuvo ventas.`)) {
      return;
    }
    try {
      await trpcMutate("admin.deleteProduct", { id: product.id });
      setAllProducts((current) => current.filter((item) => item.id !== product.id));
      toast.success("Producto eliminado.");
      topProductsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar el producto.");
    }
  };

  const totalProducts = topProducts.length;
  const totalSold = topProducts.reduce((sum, p) => sum + (Number(p.sold) || 0), 0);
  const totalRevenue = topProducts.reduce((sum, p) => sum + (Number(p.revenue) || 0), 0);

  const filteredProducts = allProducts.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col bg-[#F7F7FA] dark:bg-[#0A0A0D] text-zinc-900 dark:text-zinc-100">
        <header className="bg-white dark:bg-[#111115] border-b border-zinc-100 dark:border-white/10 px-3 lg:px-4 pt-safe-top pb-2 lg:py-4">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button type="button" onClick={() => navigate("/admin")} aria-label="Volver al panel" className="touch-target shrink-0">
              <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-600 dark:text-zinc-300" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">Productos</h1>
          </div>
        </header>

        <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
          <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
            {/* Tabs */}
            <div className="flex gap-2 mb-3 lg:mb-4 lg:shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("ranking")}
                aria-pressed={activeTab === "ranking"}
                className={`min-h-11 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-xs ${
                  activeTab === "ranking"
                    ? "bg-brand text-zinc-950 shadow-sm shadow-brand/20"
                    : "bg-white dark:bg-[#1A1A1E] text-zinc-600 dark:text-zinc-300 border border-zinc-100 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5"
                }`}
              >
                Más vendidos
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                aria-pressed={activeTab === "all"}
                className={`min-h-11 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-xs ${
                  activeTab === "all"
                    ? "bg-brand text-zinc-950 shadow-sm shadow-brand/20"
                    : "bg-white dark:bg-[#1A1A1E] text-zinc-600 dark:text-zinc-300 border border-zinc-100 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5"
                }`}
              >
                Todos los productos
              </button>
            </div>

            {activeTab === "ranking" && (
              <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col gap-2 lg:gap-3">
                {topProductsQuery.isLoading ? (
                  <div className="text-center py-10 text-zinc-500 dark:text-zinc-400 text-sm">Cargando productos top...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 lg:gap-4 lg:shrink-0">
                      <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                        <Package className="w-4 h-4 lg:w-5 lg:h-5 text-brand-strong dark:text-brand mb-1 lg:mb-2 mx-auto lg:mx-0" />
                        <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight">{totalProducts}</p>
                        <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-tight">Prods. top</p>
                      </div>
                      <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                        <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-brand-strong dark:text-brand mb-1 lg:mb-2 mx-auto lg:mx-0" />
                        <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight">{totalSold.toLocaleString()}</p>
                        <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-tight">U. vendidas</p>
                      </div>
                      <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                        <DollarSign className="w-4 h-4 lg:w-5 lg:h-5 text-brand-strong dark:text-brand mb-1 lg:mb-2 mx-auto lg:mx-0" />
                        <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight">${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-tight">Ingresos</p>
                      </div>
                    </div>

                <div className="lg:rounded-xl lg:card-shadow dark:shadow-none lg:overflow-hidden lg:flex-1 lg:min-h-0">
                  {/* Desktop Table View */}
                  <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white dark:bg-[#1A1A1E]">
                    <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-600 dark:text-zinc-400">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">#</th>
                        <th className="text-left px-4 py-3 font-medium">Producto</th>
                        <th className="text-left px-4 py-3 font-medium">Comercio</th>
                        <th className="text-left px-4 py-3 font-medium">Categoria</th>
                        <th className="text-left px-4 py-3 font-medium">Vendidos</th>
                        <th className="text-left px-4 py-3 font-medium">Fact.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                      {topProducts.map((p, i) => (
                        <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              i < 3 ? "bg-brand text-zinc-950" : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300"
                            }`}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.commerceName}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-full">{p.category || "-"}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium">{Number(p.sold || 0).toLocaleString()}</td>
                            <td className="px-4 py-3 font-medium text-brand-strong dark:text-brand">${Number(p.revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="lg:hidden flex flex-col gap-3 pb-4">
                    {topProducts.length === 0 ? (
                      <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">Sin datos</div>
                    ) : (
                      topProducts.map((p, i) => (
                        <div key={p.id} className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-4 flex flex-col gap-2">
                          <div className="flex items-start gap-3">
                            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                              i < 3 ? "bg-brand text-zinc-950" : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300"
                            }`}>
                              {i + 1}
                            </span>
                            <div className="flex-1">
                              <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight">{p.name}</p>
                              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{p.commerceName}</p>
                            </div>
                            <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-full shrink-0">{p.category || "-"}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-white/10 text-sm">
                            <div>
                              <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Vendidos</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">{Number(p.sold || 0).toLocaleString()}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Facturación</span>
                              <span className="font-medium text-brand-strong dark:text-brand">${Number(p.revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                </>
                )}
              </div>
            )}

            {activeTab === "all" && (
              <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col gap-2 lg:gap-3">
                {/* Search bar */}
                <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-2 lg:p-4 lg:shrink-0">
                  <div className="relative">
                    <label htmlFor="product-search" className="sr-only">Buscar producto por nombre</label>
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                    <input
                      id="product-search"
                      type="text"
                      placeholder="Buscar producto por nombre..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full min-h-[44px] pl-10 pr-4 bg-zinc-50 dark:bg-[#16161B] border border-zinc-200 dark:border-white/10 rounded-xl text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
                    />
                  </div>
                </div>

                <div className="lg:rounded-xl lg:card-shadow dark:shadow-none lg:overflow-hidden lg:flex-1 lg:min-h-0">
                  {errorAll ? (
                    <div className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl p-6 text-center">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-3">{errorAll}</p>
                      <button
                        type="button"
                        onClick={loadAllProducts}
                        className="min-h-11 px-4 py-2 bg-brand text-zinc-950 rounded-xl text-xs sm:text-sm font-semibold hover:bg-brand-strong transition-colors"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : loadingAll ? (
                    <div className="flex items-center justify-center py-16 bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl">
                      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white dark:bg-[#1A1A1E]">
                        <table className="w-full text-sm">
                      <thead className="bg-zinc-50 dark:bg-[#16161B] text-zinc-600 dark:text-zinc-400 lg:sticky lg:top-0 lg:z-10">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Img</th>
                          <th className="text-left px-4 py-3 font-medium">Nombre</th>
                          <th className="text-left px-4 py-3 font-medium">Comercio</th>
                          <th className="text-left px-4 py-3 font-medium">Categoría</th>
                          <th className="text-left px-4 py-3 font-medium">Precio</th>
                          <th className="text-left px-4 py-3 font-medium">Estado</th>
                          <th className="text-left px-4 py-3 font-medium">Dest.</th>
                          <th className="text-left px-4 py-3 font-medium">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                          {filteredProducts.map((p) => (
                            <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3">
                                {p.image ? (
                                  <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
                                    <Package className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                                {p.name}
                              </td>
                              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{p.commerceName || "-"}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-full">{p.category || "-"}</span>
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                ${Number(p.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal ml-1">
                                  {p.unitType === "kg" ? "/kg" : "/u"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  p.isAvailable === "yes"
                                    ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                                    : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                                }`}>
                                  {p.isAvailable === "yes" ? "Disp." : "No Disp."}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => toggleFeatured(p)}
                                  aria-label={p.isFeatured === "yes" ? `Quitar destacado a ${p.name}` : `Destacar ${p.name}`}
                                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10"
                                  title={p.isFeatured === "yes" ? "Quitar destacado" : "Destacar"}
                                >
                                  {p.isFeatured === "yes" ? (
                                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                                  ) : (
                                    <Star className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleAvailability(p)}
                                    className="min-h-11 px-2.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-lg bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/15"
                                    title={p.adminPaused ? "Reactivar" : "Pausar"}
                                  >
                                    {p.adminPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                    {p.adminPaused ? "Activar" : "Pausar"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteProduct(p)}
                                    aria-label={`Eliminar ${p.name}`}
                                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredProducts.length === 0 && !loadingAll && (
                            <tr>
                              <td colSpan={8} className="px-2 lg:px-4 py-8 lg:py-12 text-center text-zinc-500 dark:text-zinc-400 text-xs lg:text-sm">
                                No se encontraron productos
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="lg:hidden flex flex-col gap-3 pb-4">
                      {filteredProducts.length === 0 && !loadingAll ? (
                        <div className="p-4 text-center text-zinc-500 dark:text-zinc-400 text-sm">No se encontraron productos</div>
                      ) : (
                        filteredProducts.map((p) => (
                          <div key={p.id} className="bg-white dark:bg-[#1A1A1E] border border-zinc-100 dark:border-white/10 rounded-xl card-shadow dark:shadow-none p-4 flex gap-3">
                            <div className="shrink-0">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />
                              ) : (
                                <div className="w-14 h-14 rounded-lg bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
                                  <Package className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <p className="font-medium text-zinc-900 dark:text-zinc-100 leading-tight truncate">{p.name}</p>
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{p.commerceName}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-bold text-brand-strong dark:text-brand">
                                    ${Number(p.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-normal ml-0.5">
                                      {p.unitType === "kg" ? "/kg" : "/u"}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  p.isAvailable === "yes"
                                    ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400"
                                    : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                                }`}>
                                  {p.isAvailable === "yes" ? "Disponible" : "Agotado"}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-full">{p.category || "-"}</span>
                                {p.adminPaused && (
                                  <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded-full font-semibold">
                                    Pausado admin
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => toggleFeatured(p)}
                                  aria-label={p.isFeatured === "yes" ? `Quitar destacado a ${p.name}` : `Destacar ${p.name}`}
                                  className="ml-auto min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10"
                                  title={p.isFeatured === "yes" ? "Quitar destacado" : "Destacar"}
                                >
                                  {p.isFeatured === "yes" ? (
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                  ) : (
                                    <Star className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                                  )}
                                </button>
                              </div>

                              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-white/10">
                                <button
                                  type="button"
                                  onClick={() => toggleAvailability(p)}
                                  className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-lg bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-white/15"
                                >
                                  {p.adminPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                  {p.adminPaused ? "Reactivar" : "Pausar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteProduct(p)}
                                  aria-label={`Eliminar ${p.name}`}
                                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}