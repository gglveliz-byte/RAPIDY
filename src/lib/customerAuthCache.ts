import superjson from "superjson";

export interface CachedCustomer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  createdAt?: string;
}

interface AuthCacheEntry {
  customer: CachedCustomer | null;
  at: number;
}

const TTL_MS = 30_000;
let cached: AuthCacheEntry | null = null;
let inFlight: Promise<CachedCustomer | null> | null = null;

/**
 * Verificación de sesión de cliente compartida.
 * Deduplica llamadas concurrentes (React StrictMode, guard + provider)
 * y evita repetir la petición en navegaciones seguidas.
 */
export async function checkCustomerAuth(force = false): Promise<CachedCustomer | null> {
  const now = Date.now();
  if (!force && cached && now - cached.at < TTL_MS) {
    return cached.customer;
  }
  if (inFlight) return inFlight;

  const serialized = superjson.serialize({});
  inFlight = fetch(
    `/api/trpc/customer.checkAuth?input=${encodeURIComponent(JSON.stringify(serialized))}`,
    { method: "GET", credentials: "include" },
  )
    .then((response) => response.json())
    .then((data) => {
      const deserialized = superjson.deserialize<{ customer: CachedCustomer | null } | undefined>(
        data?.result?.data,
      );
      return deserialized?.customer ?? null;
    })
    .catch(() => cached?.customer ?? null)
    .finally(() => {
      inFlight = null;
    });

  const customer = await inFlight;
  cached = { customer, at: Date.now() };
  return customer;
}

export function invalidateCustomerAuthCache() {
  cached = null;
  inFlight = null;
}

export function primeCustomerAuthCache(customer: CachedCustomer | null) {
  cached = { customer, at: Date.now() };
}