import { createTRPCReact } from "@trpc/react-query";
import { httpLink, TRPCClientError } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

function handleAuthError() {
  if (window.location.pathname === "/login" || window.location.pathname === "/customer-login") return
  fetch("/api/trpc/login.logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    credentials: "include",
  }).catch(() => {})
  localStorage.removeItem("qs_session")
  localStorage.removeItem("merchant_user")
  localStorage.removeItem("driver_user")
  window.location.href = "/login"
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
      </QueryClientProvider>
    </trpc.Provider>
  );
}
