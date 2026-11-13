import { useEffect, useCallback } from "react"

export type AppRole = "customer" | "admin" | "merchant" | "driver"

const SESSION_KEY = "qs_session"

/**
 * Cada rol guarda su propia caché de UI en una clave distinta.
 * La fuente de verdad sigue siendo la cookie HttpOnly; estas claves solo
 * permiten hidratar la UI y reaccionar a logout entre pestañas.
 */
export const ROLE_STORAGE_KEYS: Record<AppRole, string> = {
  customer: "customer_session",
  merchant: "merchant_user",
  driver: "driver_user",
  admin: "admin_user",
}

export interface SessionInfo {
  role: AppRole
  ts: number
  userId?: number
}

export function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getSession(): SessionInfo | null {
  const parsed = safeParse<SessionInfo>(localStorage.getItem(SESSION_KEY))
  if (!parsed || !parsed.role) return null
  return parsed
}

export function setSession(role: AppRole, userId?: number) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ role, ts: Date.now(), userId } satisfies SessionInfo),
    )
  } catch {
    /* localStorage no disponible */
  }
}

/**
 * Limpia el marcador global solo si pertenece al rol indicado.
 * Sin rol, limpia el marcador completo (solo para logoutAll explícito).
 */
export function clearSession(role?: AppRole) {
  try {
    if (!role) {
      localStorage.removeItem(SESSION_KEY)
      return
    }
    const current = getSession()
    if (!current || current.role === role) {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
    /* localStorage no disponible */
  }
}

export function getRoleUser<T = Record<string, unknown>>(role: AppRole): T | null {
  return safeParse<T>(localStorage.getItem(ROLE_STORAGE_KEYS[role]))
}

export function setRoleUser(role: AppRole, user: unknown) {
  try {
    localStorage.setItem(ROLE_STORAGE_KEYS[role], JSON.stringify(user))
  } catch {
    /* localStorage no disponible */
  }
}

export function clearRoleUser(role: AppRole) {
  try {
    localStorage.removeItem(ROLE_STORAGE_KEYS[role])
  } catch {
    /* localStorage no disponible */
  }
}

export function dispatchLogout(role: AppRole) {
  window.dispatchEvent(new CustomEvent("rapidy:logout", { detail: { role } }))
}

export function roleForPath(path: string): AppRole | null {
  if (
    path === "/commerce" ||
    path.startsWith("/commerce/orders") ||
    path.startsWith("/commerce/products") ||
    path.startsWith("/commerce/stats") ||
    path.startsWith("/commerce/profile")
  ) {
    return "merchant"
  }
  // La vitrina /commerce/:id es una ruta de cliente, no del panel.
  if (/^\/commerce\/\d+$/.test(path)) return "customer"
  if (path === "/admin" || path.startsWith("/admin/")) return "admin"
  if (path === "/driver" || path.startsWith("/driver/")) return "driver"
  if (path === "/login") return null
  return "customer"
}

/**
 * Sincroniza una pestaña con los cambios de su propio rol.
 * No reacciona a cambios de otros roles, para que un login/logout de cliente
 * no expulse a un merchant (y viceversa).
 */
export function useSessionSync(
  role: AppRole,
  onChange: (session: SessionInfo | null) => void,
) {
  const handleStorage = useCallback(
    (event: StorageEvent) => {
      if (event.key !== ROLE_STORAGE_KEYS[role]) return
      onChange(event.newValue ? { role, ts: Date.now() } : null)
    },
    [role, onChange],
  )

  const handleLogout = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<{ role?: AppRole }>).detail
      if (detail?.role && detail.role !== role) return
      onChange(null)
    },
    [role, onChange],
  )

  useEffect(() => {
    window.addEventListener("storage", handleStorage)
    window.addEventListener("rapidy:logout", handleLogout)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("rapidy:logout", handleLogout)
    }
  }, [handleStorage, handleLogout])
}