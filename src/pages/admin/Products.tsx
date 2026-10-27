import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { trpcCall } from "@/hooks/useDeliveryData";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  DollarSign,
  Search,
  Star,
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

  const totalProducts = topProducts.length;
  const totalSold = topProducts.reduce((sum, p) => sum + (Number(p.sold) || 0), 0);
  const totalRevenue = topProducts.reduce((sum, p) => sum + (Number(p.revenue) || 0), 0);

  const filteredProducts = allProducts.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <header className="bg-white border-b border-gray-200 px-3 lg:px-4 py-2 lg:py-4">
        <div className="flex items-center gap-2 lg:gap-3">
          <button onClick={() => navigate("/admin")} className="touch-target">
            <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5 text-gray-600" />
          </button>
          <h1 className="text-base lg:text-lg font-bold text-gray-800">Productos</h1>
        </div>
      </header>

      <div className="lg:flex-1 lg:overflow-hidden p-2 lg:p-4">
        <div className="lg:h-full lg:flex lg:flex-col max-w-6xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-2 mb-3 lg:mb-4 lg:shrink-0">
            <button
              onClick={() => setActiveTab("ranking")}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-xs ${
                activeTab === "ranking"
                  ? "bg-[#2E7D32] text-white shadow-sm shadow-[#2E7D32]/20"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              Más vendidos
            </button>
            <button
              onClick={() => setActiveTab("all")}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-xs ${
                activeTab === "all"
                  ? "bg-[#2E7D32] text-white shadow-sm shadow-[#2E7D32]/20"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              Todos los productos
            </button>
          </div>

          {activeTab === "ranking" && (
            <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col gap-2 lg:gap-3">
              {topProductsQuery.isLoading ? (
                <div className="text-center py-10 text-gray-500 text-sm">Cargando productos top...</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 lg:gap-4 lg:shrink-0">
                    <div className="bg-white rounded-xl card-shadow p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                      <Package className="w-4 h-4 lg:w-5 lg:h-5 text-[#2E7D32] mb-1 lg:mb-2 mx-auto lg:mx-0" />
                      <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{totalProducts}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 font-medium leading-tight">Prods. top</p>
                    </div>
                    <div className="bg-white rounded-xl card-shadow p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                      <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-[#2E7D32] mb-1 lg:mb-2 mx-auto lg:mx-0" />
                      <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">{totalSold.toLocaleString()}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 font-medium leading-tight">U. vendidas</p>
                    </div>
                    <div className="bg-white rounded-xl card-shadow p-2.5 sm:p-3 lg:p-5 text-center lg:text-left">
                      <DollarSign className="w-4 h-4 lg:w-5 lg:h-5 text-[#2E7D32] mb-1 lg:mb-2 mx-auto lg:mx-0" />
                      <p className="text-base sm:text-xl lg:text-2xl font-extrabold text-gray-900 leading-tight">${totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 font-medium leading-tight">Ingresos</p>
                    </div>
                  </div>

              <div className="bg-white lg:bg-transparent lg:rounded-xl lg:card-shadow lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white">
                  <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">#</th>
                      <th className="text-left px-4 py-3 font-medium">Producto</th>
                      <th className="text-left px-4 py-3 font-medium">Comercio</th>
                      <th className="text-left px-4 py-3 font-medium">Categoria</th>
                      <th className="text-left px-4 py-3 font-medium">Vendidos</th>
                      <th className="text-left px-4 py-3 font-medium">Fact.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {topProducts.map((p, i) => (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            i < 3 ? "bg-[#2E7D32] text-white" : "bg-gray-100 text-gray-600"
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800 leading-tight">
                            {p.name}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.commerceName}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{p.category || "-"}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-medium">{Number(p.sold || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 font-medium text-[#2E7D32]">${Number(p.revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden flex flex-col gap-3 pb-4">
                  {topProducts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">Sin datos</div>
                  ) : (
                    topProducts.map((p, i) => (
                      <div key={p.id} className="bg-white rounded-xl card-shadow p-4 flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                            i < 3 ? "bg-[#2E7D32] text-white" : "bg-gray-100 text-gray-600"
                          }`}>
                            {i + 1}
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 leading-tight">{p.name}</p>
                            <p className="text-[10px] text-gray-500">{p.commerceName}</p>
                          </div>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full shrink-0">{p.category || "-"}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100 text-sm">
                          <div>
                            <span className="block text-[10px] text-gray-500">Vendidos</span>
                            <span className="font-medium text-gray-800">{Number(p.sold || 0).toLocaleString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] text-gray-500">Facturación</span>
                            <span className="font-medium text-[#2E7D32]">${Number(p.revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
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
              <div className="bg-white rounded-xl card-shadow p-2 lg:p-4 lg:shrink-0">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-4 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7D32]/30 focus:border-[#2E7D32] transition-colors"
                  />
                </div>
              </div>

              <div className="bg-white lg:bg-transparent lg:rounded-xl lg:card-shadow lg:overflow-hidden lg:flex-1 lg:min-h-0">
                {errorAll ? (
                  <div className="bg-white rounded-xl p-6 text-center">
                    <p className="text-sm font-medium text-red-600 mb-3">{errorAll}</p>
                    <button
                      onClick={loadAllProducts}
                      className="min-h-[40px] px-4 py-2 bg-[#2E7D32] text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1B5E20] transition-colors"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : loadingAll ? (
                  <div className="flex items-center justify-center py-16 bg-white rounded-xl">
                    <div className="w-6 h-6 border-2 border-[#2E7D32] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden lg:block overflow-x-auto lg:h-full lg:overflow-y-auto bg-white">
                      <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 lg:sticky lg:top-0 lg:z-10">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Img</th>
                        <th className="text-left px-4 py-3 font-medium">Nombre</th>
                        <th className="text-left px-4 py-3 font-medium">Comercio</th>
                        <th className="text-left px-4 py-3 font-medium">Categoría</th>
                        <th className="text-left px-4 py-3 font-medium">Precio</th>
                        <th className="text-left px-4 py-3 font-medium">Estado</th>
                        <th className="text-left px-4 py-3 font-medium">Dest.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredProducts.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              {p.image ? (
                                <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800 leading-tight">
                              {p.name}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{p.commerceName || "-"}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{p.category || "-"}</span>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-800">${Number(p.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                p.isAvailable === "yes"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-600"
                              }`}>
                                {p.isAvailable === "yes" ? "Disp." : "No Disp."}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {p.isFeatured === "yes" ? (
                                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              ) : (
                                <Star className="w-4 h-4 text-gray-300" />
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredProducts.length === 0 && !loadingAll && (
                          <tr>
                            <td colSpan={7} className="px-2 lg:px-4 py-8 lg:py-12 text-center text-gray-400 text-xs lg:text-sm">
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
                      <div className="p-4 text-center text-gray-500 text-sm">No se encontraron productos</div>
                    ) : (
                      filteredProducts.map((p) => (
                        <div key={p.id} className="bg-white rounded-xl card-shadow p-4 flex gap-3">
                          <div className="shrink-0">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-14 h-14 rounded-lg object-cover" />
                            ) : (
                              <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center">
                                <Package className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <p className="font-medium text-gray-800 leading-tight truncate">{p.name}</p>
                                <p className="text-[10px] text-gray-500 truncate">{p.commerceName}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-[#2E7D32]">${Number(p.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                p.isAvailable === "yes"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-600"
                              }`}>
                                {p.isAvailable === "yes" ? "Disponible" : "Agotado"}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{p.category || "-"}</span>
                              {p.isFeatured === "yes" && (
                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 ml-auto" />
                              )}
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
    </AdminLayout>
  );
}
