import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { getSession, useSessionSync, clearSession } from "@/hooks/useSessionSync"
import { useCustomerSession } from "@/hooks/useCustomerSession"
import { trpcCall } from "@/hooks/useDeliveryData"
import { usePushNotifications } from "@/hooks/usePushNotifications"
import { Loader2 } from "lucide-react"

type GuardRole = "customer" | "admin" | "merchant" | "driver"

export default function SessionGuard({ role, children }: { role: GuardRole; children: ReactNode }) {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useCustomerSession()
  const [checking, setChecking] = useState(() => {
    const session = getSession()
    if (role === "customer") {
      const hasStoredCustomer = typeof window !== "undefined" && Boolean(localStorage.getItem("customer_session"))
      return !(session?.role === "customer" && hasStoredCustomer)
    }
    return true
  })
  const redirected = useRef(false)

  // Registrar notificaciones push nativas si el usuario está autenticado
  usePushNotifications(role, !checking)

  const redirectOut = useCallback(() => {
    if (redirected.current) return
    redirected.current = true
    clearSession()
    localStorage.removeItem("customer_session")
    localStorage.removeItem("merchant_user")
    localStorage.removeItem("driver_user")
    window.dispatchEvent(new Event("rapidy:logout"))
    if (role === "customer") navigate("/customer-login", { replace: true })
    else navigate("/login", { replace: true })
  }, [role, navigate])

  const handleSessionChange = useCallback((session: any) => {
    if (!session || session.role !== role) {
      redirectOut()
    }
  }, [role, redirectOut])

  useSessionSync(handleSessionChange)

  useEffect(() => {
    const session = getSession()
    if (!session || session.role !== role) {
      redirectOut()
      return
    }

    if (role === "customer") {
      let cancelled = false
      if (isAuthenticated && localStorage.getItem("customer_session")) {
        setChecking(false)
      }

      // Verificación real contra el backend: localStorage por sí solo no autentica.
      trpcCall<{ customer: any | null }>("customer.checkAuth")
        .then((result) => {
          if (cancelled) return
          if (result?.customer) {
            login(result.customer)
            setChecking(false)
          } else {
            redirectOut()
          }
        })
        .catch(() => {
          if (!cancelled) redirectOut()
        })

      return () => {
        cancelled = true
      }
    }

    // For non-customer roles: verify with backend
    let cancelled = false
    const verify = async () => {
      try {
        const result = await trpcCall<{ authenticated: boolean; role: string | null }>("login.checkAuth")
        if (cancelled) return
        if (result.authenticated && result.role === role) {
          setChecking(false)
        } else {
          redirectOut()
        }
      } catch {
        if (cancelled) return
        redirectOut()
      }
    }
    verify()
    return () => { cancelled = true }
  }, [role, isAuthenticated, login, redirectOut])

  useEffect(() => {
    if (role === "customer" && isAuthenticated) setChecking(false)
  }, [role, isAuthenticated])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
      </div>
    )
  }

  return <>{children}</>
}
