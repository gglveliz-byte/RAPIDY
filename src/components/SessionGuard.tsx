import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { useNavigate } from "react-router"
import {
  useSessionSync,
  setSession,
  setRoleUser,
  clearRoleUser,
  clearSession,
  dispatchLogout,
  type AppRole,
} from "@/hooks/useSessionSync"
import { useCustomerSession } from "@/hooks/useCustomerSession"
import { checkCustomerAuth } from "@/lib/customerAuthCache"
import { trpcCall } from "@/hooks/useDeliveryData"
import { queryClient } from "@/providers/trpc"
import { usePushNotifications } from "@/hooks/usePushNotifications"
import { Loader2, RefreshCw } from "lucide-react"

type GuardRole = AppRole

interface CheckAuthResult {
  authenticated: boolean
  role: string | null
  user?: { id: number; name?: string; email?: string; phone?: string; role?: string } | null
}

export default function SessionGuard({ role, children }: { role: GuardRole; children: ReactNode }) {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useCustomerSession()
  const [checking, setChecking] = useState(() => {
    if (role === "customer") {
      const hasStoredCustomer =
        typeof window !== "undefined" && Boolean(localStorage.getItem("customer_session"))
      return !(isAuthenticated && hasStoredCustomer)
    }
    return true
  })
  const [verifyError, setVerifyError] = useState<Error | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const redirected = useRef(false)

  // Registrar notificaciones push nativas si el usuario está autenticado
  usePushNotifications(role, !checking && !verifyError)

  const redirectOut = useCallback(() => {
    if (redirected.current) return
    redirected.current = true
    clearRoleUser(role)
    clearSession(role)
    queryClient.clear()
    dispatchLogout(role)
    if (role === "customer") navigate("/customer-login", { replace: true })
    else navigate("/login", { replace: true })
  }, [role, navigate])

  const handleSessionChange = useCallback(
    (session: { role: AppRole } | null) => {
      if (!session) {
        redirectOut()
        return
      }
      // Misma sesión en otra pestaña: revalidar cookie y rehidratar usuario.
      setVerifyError(null)
      setChecking(true)
      setRetryNonce((value) => value + 1)
    },
    [redirectOut],
  )

  useSessionSync(role, handleSessionChange)

  useEffect(() => {
    if (role === "customer") {
      let cancelled = false
      if (isAuthenticated && localStorage.getItem("customer_session")) {
        setChecking(false)
      }

      checkCustomerAuth()
        .then((customer) => {
          if (cancelled) return
          if (customer) {
            login(customer)
            setVerifyError(null)
            setChecking(false)
          } else {
            redirectOut()
          }
        })
        .catch((error: Error) => {
          if (cancelled) return
          // Un fallo de red no debe borrar la sesión ni el carrito.
          setVerifyError(error)
          setChecking(false)
        })

      return () => {
        cancelled = true
      }
    }

    // Para admin, merchant y driver la cookie HttpOnly es la fuente de verdad.
    // No se exige qs_session ni ninguna clave de localStorage.
    let cancelled = false
    const verify = async () => {
      try {
        const result = await trpcCall<CheckAuthResult>("login.checkAuth")
        if (cancelled) return
        if (result.authenticated && result.role === role && result.user) {
          setRoleUser(role, result.user)
          setSession(role, result.user.id)
          setVerifyError(null)
          setChecking(false)
        } else {
          redirectOut()
        }
      } catch (error) {
        if (cancelled) return
        const code = (error as { code?: string; data?: { code?: string } })?.code
          ?? (error as { data?: { code?: string } })?.data?.code
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
          redirectOut()
          return
        }
        setVerifyError(error as Error)
        setChecking(false)
      }
    }
    verify()
    return () => {
      cancelled = true
    }
  }, [role, isAuthenticated, login, redirectOut, retryNonce])

  useEffect(() => {
    if (role === "customer" && isAuthenticated) setChecking(false)
  }, [role, isAuthenticated])

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7FA] px-6">
        <div className="w-full max-w-sm bg-white rounded-3xl border border-zinc-200/80 shadow-sm p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <RefreshCw className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-extrabold text-zinc-900">No pudimos verificar tu sesión</h2>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Revisa tu conexión e inténtalo de nuevo. Tu sesión no se cerró.
          </p>
          <button
            type="button"
            onClick={() => {
              setVerifyError(null)
              setChecking(true)
              setRetryNonce((value) => value + 1)
            }}
            className="mt-4 w-full h-11 rounded-2xl bg-[#FF6A00] hover:bg-[#e65f00] text-white text-xs font-bold transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
      </div>
    )
  }

  return <>{children}</>
}