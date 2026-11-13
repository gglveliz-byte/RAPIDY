import { createTRPCReact } from "@trpc/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import superjson from "superjson";
import { invalidateCustomerAuthCache } from "@/lib/customerAuthCache";
import {
  roleForPath,
  clearRoleUser,
  clearSession,
  dispatchLogout,
} from "@/hooks/useSessionSync";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

function handleAuthError() {
  invalidateCustomerAuthCache()
  const role = roleForPath(window.location.pathname)
  if (!role) return

  fetch("/api/trpc/login.logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { scope: role } }),
    credentials: "include",
  }).catch(() => {})

  clearRoleUser(role)
  clearSession(role)
  if (role === "customer") {
    try {
      localStorage.removeItem("cart")
    } catch { /* sin acción */ }
  }
  dispatchLogout(role)
  window.location.href = role === "customer" ? "/customer-login" : "/login"
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 segundos de datos frescos: navegación instantánea sin refetch constante
      gcTime: 1000 * 60 * 10, // 10 minutos en memoria caché
      refetchOnWindowFocus: false, // Elimina recargas continuas agresivas al alternar ventanas o tocar la pantalla
      refetchOnReconnect: true,
      retry(_failureCount, error) {
        if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
          handleAuthError()
          return false
        }
        return false
      },
    },
    mutations: {
      onError(error) {
        if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
          handleAuthError()
        }
      },
    },
  },
});
export { queryClient };

const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
