/**
 * @archivo src/hooks/useCustomerSession.tsx
 * @modulo 01-identity-and-auth (Proveedor de Sesión Reactiva de Clientes)
 * @proposito
 *   Gestionar el estado de autenticación y perfil del cliente en el frontend.
 *   Persiste la sesión en localStorage para inicialización inmediata en 0ms
 *   (sin pantallas en blanco ni esperas innecesarias) y sincroniza con el backend
 *   mediante tokens JWT y validación en segundo plano.
 *
 * @resumen_contenido
 *   - `CustomerSessionProvider`: Contexto global de cliente con hidratación instantánea.
 *   - Métodos: `login`, `logout`, `refreshToken`.
 *   - `useCustomerSession`: Hook para consumir la sesión activa.
 *
 * @dependencias_internas
 *   - Ninguna
 *
 * @dependencias_externas
 *   - `react` (`useState`, `useEffect`, `useCallback`, `createContext`, `useContext`)
 *   - `superjson`
 *
 * @tablas_bd_o_redis
 *   - Ninguna (Estado de cliente en React & localStorage)
 */

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export interface CustomerSession {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
}

const CUSTOMER_STORAGE_KEY = "customer_session";

const CustomerSessionContext = createContext<{
  customer: CustomerSession | null;
  login: (customer: CustomerSession) => void;
  logout: () => void;
  isAuthenticated: boolean;
  refreshToken: () => Promise<boolean>;
} | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Hidratación instantánea desde localStorage para carga en 0ms
  const [customer, setCustomer] = useState<CustomerSession | null>(() => {
    try {
      const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const customerRef = useRef<CustomerSession | null>(customer);

  const clearLocalSession = useCallback(() => {
    customerRef.current = null;
    setCustomer(null);
    try {
      localStorage.removeItem(CUSTOMER_STORAGE_KEY);
      localStorage.removeItem("qs_session");
    } catch { /* sin acción */ }
    window.dispatchEvent(new Event("rapidy:logout"));
    queryClient.clear();
  }, [queryClient]);

  // Verificación en segundo plano sin bloquear la UI
  useEffect(() => {
    const serialized = superjson.serialize({});
    fetch(`/api/trpc/customer.checkAuth?input=${encodeURIComponent(JSON.stringify(serialized))}`, {
      method: "GET",
      credentials: "include",
    })
      .then(r => r.json())
      .then((data) => {
        const deserialized = superjson.deserialize<{ customer: CustomerSession | null } | undefined>(data.result?.data);
        if (deserialized?.customer) {
          customerRef.current = deserialized.customer;
          setCustomer(deserialized.customer);
          localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(deserialized.customer));
        } else if (!customerRef.current) {
          // La cookie expiró o fue revocada: no dejar PII local.
          setCustomer(null);
          localStorage.removeItem(CUSTOMER_STORAGE_KEY);
          localStorage.removeItem("qs_session");
        }
      })
      .catch(() => {});
  }, []);

  const login = useCallback((customerData: CustomerSession) => {
    customerRef.current = customerData;
    setCustomer(customerData);
    try {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customerData));
      localStorage.setItem("qs_session", JSON.stringify({ role: "customer", ts: Date.now() }));
    } catch { /* sin acción */ }
  }, []);

  const logout = useCallback(async () => {
    // Limpieza local inmediata: no dejar PII ni carrito visibles durante el request.
    clearLocalSession();
    try {
      await fetch("/api/trpc/customer.logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
    } catch { /* sin acción */ }
  }, [clearLocalSession]);

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch("/api/trpc/customer.refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      const deserialized = superjson.deserialize<{ customer: CustomerSession | null } | undefined>(data.result?.data);
      if (deserialized?.customer) {
        customerRef.current = deserialized.customer;
        setCustomer(deserialized.customer);
        localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(deserialized.customer));
        return true;
      }
      clearLocalSession();
    } catch { /* sin acción */ }
    return false;
  }, [clearLocalSession]);

  // Refresh automático cada 10 minutos (antes de que expire el access token de 15 min)
  useEffect(() => {
    if (!customer) return;
    const interval = setInterval(() => {
      refreshToken().catch(() => {});
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [customer, refreshToken]);

  return (
    <CustomerSessionContext.Provider value={{ customer, login, logout, isAuthenticated: !!customer, refreshToken }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  const ctx = useContext(CustomerSessionContext);
  if (!ctx) throw new Error("useCustomerSession must be used within CustomerSessionProvider");
  return ctx;
}
