import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import superjson from "superjson";
import { useState, useEffect } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { invalidateCustomerAuthCache } from "@/lib/customerAuthCache";

const API_URL = "/api/trpc";

function isAuthError(data: any): boolean {
  return data?.error?.json?.code === "UNAUTHORIZED"
}

function handleAuthError() {
  invalidateCustomerAuthCache()
  if (window.location.pathname === "/login" || window.location.pathname === "/customer-login") return
  fetch("/api/trpc/login.logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    credentials: "include",
  }).catch(() => {})
  try {
    localStorage.removeItem("qs_session")
    localStorage.removeItem("customer_session")
    localStorage.removeItem("merchant_user")
    localStorage.removeItem("driver_user")
    localStorage.removeItem("cart")
  } catch { /* sin acción */ }
  window.dispatchEvent(new Event("rapidy:logout"))
  const path = window.location.pathname;
  const isBackoffice = path.startsWith("/admin") || 
                       path.startsWith("/driver") || 
                       path === "/commerce" || 
                       path.startsWith("/commerce/orders") || 
                       path.startsWith("/commerce/products") || 
                       path.startsWith("/commerce/stats") || 
                       path.startsWith("/commerce/profile");
  window.location.href = isBackoffice ? "/login" : "/customer-login"
}

function extractTrpcError(data: any, status: number): Error {
  const errorJson = data?.error?.json;
  const message =
    errorJson?.message ||
    data?.error?.message ||
    (status ? `HTTP ${status}` : "Error de conexión");
  const error = new Error(message) as Error & { code?: string; data?: unknown };
  error.code = errorJson?.code;
  error.data = errorJson?.data;
  return error;
}

export async function trpcCall<T>(path: string, input?: Record<string, unknown>): Promise<T> {
  const serialized = input ? superjson.serialize(input) : superjson.serialize({});
  const url = `${API_URL}/${path}?input=${encodeURIComponent(JSON.stringify(serialized))}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  const text = await res.text();
  let data: any
  try { data = JSON.parse(text) } catch { data = null }
  if (isAuthError(data)) {
    handleAuthError()
    throw new Error("Sesión expirada")
  }
  if (!res.ok) {
    throw extractTrpcError(data, res.status);
  }
  return superjson.deserialize(data?.result?.data);
}

export async function trpcMutate<T>(path: string, input: Record<string, unknown>): Promise<T> {
  const serialized = superjson.serialize(input);
  const res = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serialized),
    credentials: "include",
  });
  const text = await res.text();
  let data: any
  try { data = JSON.parse(text) } catch { data = null }
  if (isAuthError(data)) {
    handleAuthError()
    throw new Error("Sesión expirada")
  }
  if (!res.ok) {
    throw extractTrpcError(data, res.status);
  }
  return superjson.deserialize(data?.result?.data);
}

// ========== CATEGORIES ==========
export function useCategories() {
  const query = useQuery({
    queryKey: ["category.list"],
    queryFn: () => trpcCall<Array<{ id: number; name: string; icon: string; color: string }>>("category.list"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

// ========== COMMERCES ==========
export function useCommerces() {
  const query = useQuery({
    queryKey: ["commerce.list"],
    queryFn: () => trpcCall<any[]>("commerce.list"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useCommerce(id: number) {
  const query = useQuery({
    queryKey: ["commerce.getById", id],
    queryFn: () => trpcCall<any>("commerce.getById", { id }),
    enabled: Boolean(id),
  });
  return { data: query.data ?? null, loading: query.isLoading };
}

export function useMerchantCommerceId() {
  const storedUser = localStorage.getItem("merchant_user");
  const merchantUser = storedUser ? JSON.parse(storedUser) : null;
  const cachedId: number | null =
    typeof merchantUser?.commerceId === "number" && merchantUser.commerceId > 0
      ? merchantUser.commerceId
      : null;
  const [commerceId, setCommerceId] = useState<number | null>(cachedId);

  // Primary lookup: ask the server which commerce belongs to this merchant (by merchantUserId)
  const meQuery = useQuery({
    queryKey: ["commerce.me"],
    queryFn: () => trpcCall<any>("commerce.me"),
    enabled: !commerceId && Boolean(merchantUser),
  });

  // Fallback: name-search (keeps legacy commerces that don't yet have merchantUserId set)
  const searchQuery = useQuery({
    queryKey: ["commerce.search", merchantUser?.name],
    queryFn: () => trpcCall<any[]>("commerce.search", { query: merchantUser?.name || "" }),
    enabled: !commerceId && !meQuery.data && Boolean(merchantUser?.name),
  });

  useEffect(() => {
    if (commerceId) return;
    const fromMe = meQuery.data;
    if (fromMe?.id) {
      setCommerceId(fromMe.id);
      if (merchantUser) {
        const updatedUser = { ...merchantUser, commerceId: fromMe.id };
        localStorage.setItem("merchant_user", JSON.stringify(updatedUser));
      }
      return;
    }
    const results = searchQuery.data ?? [];
    if (results.length > 0) {
      const id = results[0].id;
      setCommerceId(id);
      if (merchantUser) {
        const updatedUser = { ...merchantUser, commerceId: id };
        localStorage.setItem("merchant_user", JSON.stringify(updatedUser));
      }
    }
  }, [meQuery.data, searchQuery.data, commerceId, merchantUser]);

  return {
    commerceId,
    loading: meQuery.isLoading || searchQuery.isLoading,
  };
}

// ========== PRODUCTS ==========
export function useFeaturedProducts() {
  const query = useQuery({
    queryKey: ["product.getFeatured"],
    queryFn: () => trpcCall<any[]>("product.getFeatured"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useCatalogProducts() {
  const query = useQuery({
    queryKey: ["product.list"],
    queryFn: () => trpcCall<any[]>("product.list"),
    staleTime: 60_000,
  });
  return { data: query.data ?? [], loading: query.isLoading, error: query.error as Error | null };
}

export function useProductSearch(searchTerm: string) {
  const debouncedTerm = useDebouncedValue(searchTerm, 300);
  const term = debouncedTerm.trim();
  const query = useQuery({
    queryKey: ["product.search", term],
    queryFn: () => trpcCall<any[]>("product.search", { query: term }),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
  return { data: query.data ?? [], loading: query.isFetching, error: query.error as Error | null };
}

export function useTopOrderedProducts() {
  const query = useQuery({
    queryKey: ["product.getTopOrdered"],
    queryFn: () => trpcCall<any[]>("product.getTopOrdered"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useProductsByCommerce(commerceId: number) {
  const query = useQuery({
    queryKey: ["product.getByCommerce", commerceId],
    queryFn: () => trpcCall<any[]>("product.getByCommerce", { commerceId }),
    enabled: Boolean(commerceId),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useCreateProduct(commerceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => {
      if (!commerceId || commerceId < 1) {
        return Promise.reject(new Error("Sin comercio asignado"));
      }
      return trpcMutate<any>("product.create", { commerceId, ...input });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product.getByCommerce", commerceId] });
      queryClient.invalidateQueries({ queryKey: ["product.getFeatured"] });
    },
  });
}

export function useUpdateProduct(commerceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => {
      if (!commerceId || commerceId < 1) {
        return Promise.reject(new Error("Sin comercio asignado"));
      }
      return trpcMutate<any>("product.update", input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product.getByCommerce", commerceId] });
      queryClient.invalidateQueries({ queryKey: ["product.getFeatured"] });
    },
  });
}

export function useDeleteProduct(commerceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => {
      if (!commerceId || commerceId < 1) {
        return Promise.reject(new Error("Sin comercio asignado"));
      }
      return trpcMutate<any>("product.delete", input);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["product.getByCommerce", commerceId] }),
  });
}

// ========== ORDERS ==========
export function useOrder(id: number) {
  const query = useQuery({
    queryKey: ["order.getById", id],
    queryFn: () => trpcCall<any>("order.getById", { id }),
    enabled: Boolean(id),
    // SSE es la fuente primaria; este polling es solo un fallback lento.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (status === "delivered" || status === "cancelled") {
        return false;
      }
      return 30_000;
    },
    refetchIntervalInBackground: false,
    retry: 1,
  });
  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
    isError: query.isError,
    refresh: query.refetch,
  };
}

export function useCustomerOrders(customerId: number) {
  const query = useQuery({
    queryKey: ["order.getByCustomer", customerId],
    queryFn: () => trpcCall<any[]>("order.getByCustomer", { limit: 20 }),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });
  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refresh: query.refetch,
  };
}

export function useCommerceOrders(commerceId: number) {
  const query = useQuery({
    queryKey: ["order.getCommerceOrders", commerceId],
    queryFn: () => trpcCall<any[]>("order.getCommerceOrders", { commerceId }),
    enabled: Boolean(commerceId),
    refetchInterval: 30_000,
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("order.create", input),
    onSuccess: (result: any) => {
      if (result?.order?.customerId) {
        queryClient.invalidateQueries({ queryKey: ["order.getByCustomer", result.order.customerId] });
      }
      if (result?.order?.id) {
        queryClient.invalidateQueries({ queryKey: ["order.getById", result.order.id] });
      }
    },
  });
}

export function useOrderQuote(items: Array<{ productId: number; quantity: number }>) {
  const payload = items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));
  const query = useQuery({
    queryKey: ["order.quote", JSON.stringify(payload)],
    queryFn: () => trpcCall<any>("order.quote", { items: payload }),
    enabled: payload.length > 0,
    staleTime: 15_000,
  });
  return {
    data: query.data ?? null,
    loading: query.isFetching,
    error: query.error as Error | null,
  };
}

export function useUpdateOrderStatus(commerceId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("order.updateStatus", input),
    onSuccess: (result: any) => {
      if (commerceId) queryClient.invalidateQueries({ queryKey: ["order.getCommerceOrders", commerceId] });
      if (result?.id) queryClient.invalidateQueries({ queryKey: ["order.getById", result.id] });
    },
  });
}

export function useUpdatePaymentReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: number; receipt: string }) => trpcMutate<any>("order.updatePaymentReceipt", input),
    onSuccess: (_result: any, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["order.getById", variables.orderId] });
    },
  });
}

export function useMarkCommerceReady(commerceId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId: number; commerceId: number }) => trpcMutate<any>("commerce.markReady", input),
    onSuccess: (_result: any, input) => {
      if (commerceId) queryClient.invalidateQueries({ queryKey: ["order.getCommerceOrders", commerceId] });
      if (input.orderId) queryClient.invalidateQueries({ queryKey: ["order.getById", input.orderId] });
    },
  });
}

// ========== CHAT ==========
export function useChatMessages(orderId: number) {
  const query = useQuery({
    queryKey: ["chat.getByOrder", orderId],
    queryFn: () => trpcCall<any[]>("chat.getByOrder", { orderId, limit: 50 }),
    enabled: Boolean(orderId),
    refetchInterval: 30_000,
  });
  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error as Error | null,
    refresh: query.refetch,
  };
}

export function useSendChatMessage(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("chat.send", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat.getByOrder", orderId] }),
  });
}

// ========== CUSTOMER ==========
export function registerCustomer(input: any): Promise<any> {
  return trpcMutate<any>("customer.register", input);
}

export function useUpdateCustomerProfile() {
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("customer.update", input),
  });
}

// ========== ADMIN ==========
export function useAdminDashboard() {
  const query = useQuery({
    queryKey: ["admin.dashboard"],
    queryFn: () => trpcCall<any>("admin.dashboard"),
  });
  return { data: query.data ?? null, loading: query.isLoading };
}

export function useAdminSales(period: string) {
  const query = useQuery({
    queryKey: ["admin.salesByPeriod", period],
    queryFn: () => trpcCall<any[]>("admin.salesByPeriod", { period }),
  });
  return query.data ?? [];
}

export function useAdminTopCommerces(limit = 10) {
  const query = useQuery({
    queryKey: ["admin.topCommerces", limit],
    queryFn: () => trpcCall<any[]>("admin.topCommerces", { limit }),
  });
  return query.data ?? [];
}

export function useAdminTopProducts(limit = 10) {
  const query = useQuery({
    queryKey: ["admin.topProducts", limit],
    queryFn: () => trpcCall<any[]>("admin.topProducts", { limit }),
  });
  return query.data ?? [];
}

export function useAdminCategoryRanking() {
  const query = useQuery({
    queryKey: ["admin.categoryRanking"],
    queryFn: () => trpcCall<any[]>("admin.categoryRanking"),
  });
  return query.data ?? [];
}

export function useAllCommerces() {
  const query = useQuery({
    queryKey: ["admin.listCommerces"],
    queryFn: () => trpcCall<any[]>("admin.listCommerces"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function createDriver(input: any): Promise<any> {
  return trpcMutate<any>("admin.createDriver", input);
}

export function updateDriver(input: any): Promise<any> {
  return trpcMutate<any>("admin.updateDriver", input);
}

export function createMerchant(input: any): Promise<any> {
  return trpcMutate<any>("admin.createMerchant", input);
}

export function updateCommerce(input: any): Promise<any> {
  return trpcMutate<any>("admin.updateCommerce", input);
}

// ========== DRIVERS ==========
export function useDrivers() {
  const query = useQuery({
    queryKey: ["driver.list"],
    queryFn: () => trpcCall<any[]>("driver.list"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

// ========== SETTINGS ==========
export function useSettings() {
  const query = useQuery({
    queryKey: ["admin.settings"],
    queryFn: () => trpcCall<any[]>("admin.settings"),
  });
  return query.data ?? [];
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("admin.updateSetting", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin.settings"] }),
  });
}

export function useGetAdminReports() {
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("admin.getReports", input),
  });
}

export function usePublicSettings() {
  const query = useQuery({
    queryKey: ["settings.getPublic"],
    queryFn: () => trpcCall<Record<string, string>>("settings.getPublic"),
  });
  return query.data ?? {};
}

export function useCommerceStats(commerceId: number) {
  const query = useQuery({
    queryKey: ["commerce.getStats", commerceId],
    queryFn: () => trpcCall<any>("commerce.getStats", { id: commerceId }),
    enabled: Boolean(commerceId),
  });
  return { data: query.data ?? null, loading: query.isLoading };
}

export function useUpdateCommerceProfile(commerceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("commerce.update", { id: commerceId, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce.getById", commerceId] });
      queryClient.invalidateQueries({ queryKey: ["commerce.getStats", commerceId] });
    },
  });
}

export function useToggleCommerceStatus(commerceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => trpcMutate<any>("commerce.toggleStatus", { id: commerceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commerce.getById", commerceId] });
      queryClient.invalidateQueries({ queryKey: ["commerce.getStats", commerceId] });
    },
  });
}

// ========== ADMIN ORDERS ==========
export function useAdminOrders() {
  const query = useQuery({
    queryKey: ["admin.orders"],
    queryFn: () => trpcCall<any[]>("admin.orders"),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useAdminOrderDetail(orderId: number) {
  const query = useQuery({
    queryKey: ["admin.orderDetail", orderId],
    queryFn: () => trpcCall<any>("admin.orderDetail", { id: orderId }),
    enabled: Boolean(orderId),
  });
  return { data: query.data ?? null, loading: query.isLoading };
}

export function useAdminUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("admin.updateOrderStatus", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin.orders"] });
    },
  });
}

export function useAdminAssignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => trpcMutate<any>("admin.assignDriver", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin.orders"] });
    },
  });
}

// ========== DRIVER ==========
export function useDriverSession() {
  const [driverUser, setDriverUser] = useState<any>(null);
  useEffect(() => {
    const session = localStorage.getItem("driver_user") || localStorage.getItem("qs_driver_user");
    if (session) {
      try { setDriverUser(JSON.parse(session)); } catch { /* empty */ }
    }
  }, []);
  return driverUser;
}

export function useDriverOrders(driverId: number) {
  const query = useQuery({
    queryKey: ["driver.getActiveOrders", driverId],
    queryFn: () => trpcCall<any[]>("driver.getActiveOrders", { id: driverId }),
    enabled: Boolean(driverId),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useDriverAcceptOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { driverId: number; orderId: number }) => trpcMutate<any>("driver.acceptOrder", input),
    onSuccess: (_: any, input: any) => {
      queryClient.invalidateQueries({ queryKey: ["driver.getActiveOrders", input.driverId] });
    },
  });
}

export function useDriverUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; status: string; notes?: string }) => trpcMutate<any>("order.updateStatus", input),
    onSuccess: (_: any, input: any) => {
      queryClient.invalidateQueries({ queryKey: ["order.getById", input.id] });
    },
  });
}

export function useDriverUpdateLocation() {
  return useMutation({
    mutationFn: (input: { id: number; lat: string; lng: string }) => trpcMutate<any>("driver.updateLocation", input),
  });
}

export function useDriverEarnings(driverId: number) {
  const query = useQuery({
    queryKey: ["driver.getEarnings", driverId],
    queryFn: () => trpcCall<any[]>("driver.getEarnings", { id: driverId }),
    enabled: Boolean(driverId),
  });
  return { data: query.data ?? [], loading: query.isLoading };
}

export function useDriverProfile(driverId: number) {
  const query = useQuery({
    queryKey: ["driver.getProfile", driverId],
    queryFn: () => trpcCall<any>("driver.getProfile", { id: driverId }),
    enabled: Boolean(driverId),
  });
  return { data: query.data ?? null, loading: query.isLoading };
}

export function useCheckAuth() {
  const query = useQuery({
    queryKey: ["customer.checkAuth"],
    queryFn: () => trpcCall<any>("customer.checkAuth"),
    retry: false,
  });
  return { data: query.data ?? null, loading: query.isLoading };
}