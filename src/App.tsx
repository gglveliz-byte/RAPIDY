import { Routes, Route } from 'react-router'
import { lazy, Suspense, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import SessionGuard from '@/components/SessionGuard'
import { QueryProvider } from '@/providers/QueryProvider'
import { trpcMutate } from '@/hooks/useDeliveryData'
import { getSession } from '@/hooks/useSessionSync'

// Public pages
const Welcome = lazy(() => import('./pages/customer/Welcome'))
const Register = lazy(() => import('./pages/customer/Register'))
const CustomerLogin = lazy(() => import('./pages/customer/CustomerLogin'))
const CustomerHome = lazy(() => import('./pages/customer/Home'))
const CustomerSearch = lazy(() => import('./pages/customer/Search'))
const CommerceDetail = lazy(() => import('./pages/customer/CommerceDetail'))
const Cart = lazy(() => import('./pages/customer/Cart'))
const OrderTracking = lazy(() => import('./pages/customer/OrderTracking'))
const Chat = lazy(() => import('./pages/customer/Chat'))
const CustomerProfile = lazy(() => import('./pages/customer/Profile'))

// Driver app
const DriverHome = lazy(() => import('./pages/driver/DriverHome'))
const DriverOrder = lazy(() => import('./pages/driver/DriverOrder'))
const DriverEarnings = lazy(() => import('./pages/driver/DriverEarnings'))
const DriverProfile = lazy(() => import('./pages/driver/DriverProfile'))
const DriverChat = lazy(() => import('./pages/driver/DriverChat'))
const DriverHistory = lazy(() => import('./pages/driver/DriverHistory'))

// Commerce dashboard
const CommerceDashboard = lazy(() => import('./pages/commerce/Dashboard'))
const CommerceOrders = lazy(() => import('./pages/commerce/Orders'))
const CommerceProducts = lazy(() => import('./pages/commerce/Products'))
const CommerceStats = lazy(() => import('./pages/commerce/Stats'))
const CommerceProfile = lazy(() => import('./pages/commerce/Profile'))

// Admin dashboard
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminCommerces = lazy(() => import('./pages/admin/Commerces'))
const AdminDrivers = lazy(() => import('./pages/admin/Drivers'))
const AdminOrders = lazy(() => import('./pages/admin/Orders'))
const AdminProducts = lazy(() => import('./pages/admin/Products'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))

// Auth & Legal
const Login = lazy(() => import('./pages/Login'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsAndConditions = lazy(() => import('./pages/legal/TermsAndConditions'))
const RefundPolicy = lazy(() => import('./pages/legal/RefundPolicy'))
const RegretButton = lazy(() => import('./pages/legal/RegretButton'))
const ConsumerProtection = lazy(() => import('./pages/legal/ConsumerProtection'))
const DeleteAccount = lazy(() => import('./pages/legal/DeleteAccount'))
const LegalHub = lazy(() => import('./pages/legal/LegalHub'))
const NotFound = lazy(() => import('./pages/NotFound'))



function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-[#2E7D32]" />
    </div>
  )
}

function SessionRefresh() {
  useEffect(() => {
    const interval = setInterval(async () => {
      const session = getSession()
      if (!session) return
      try {
        await trpcMutate("login.refresh", {})
      } catch {}
    }, 9 * 60 * 1000) // each 9 minutes
    return () => clearInterval(interval)
  }, [])
  return null
}

import { useLocation } from 'react-router'
import { AnimatePresence } from 'framer-motion'
import { PageTransition } from '@/components/PageTransition'

function AnimatedRoutes() {
  const location = useLocation()
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Customer App Routes */}
        <Route path="/" element={<PageTransition><Welcome /></PageTransition>} />
        <Route path="/register" element={<PageTransition><Register /></PageTransition>} />
        <Route path="/customer-login" element={<PageTransition><CustomerLogin /></PageTransition>} />
        <Route path="/home" element={<SessionGuard role="customer"><PageTransition><CustomerHome /></PageTransition></SessionGuard>} />
        <Route path="/search" element={<SessionGuard role="customer"><PageTransition><CustomerSearch /></PageTransition></SessionGuard>} />
        <Route path="/commerce/:id" element={<SessionGuard role="customer"><PageTransition><CommerceDetail /></PageTransition></SessionGuard>} />
        <Route path="/cart" element={<SessionGuard role="customer"><PageTransition><Cart /></PageTransition></SessionGuard>} />
        <Route path="/order/:id" element={<SessionGuard role="customer"><PageTransition><OrderTracking /></PageTransition></SessionGuard>} />
        <Route path="/chat/:orderId" element={<SessionGuard role="customer"><PageTransition><Chat /></PageTransition></SessionGuard>} />
        <Route path="/profile" element={<SessionGuard role="customer"><PageTransition><CustomerProfile /></PageTransition></SessionGuard>} />

        {/* Driver App Routes */}
        <Route path="/driver" element={<SessionGuard role="driver"><DriverHome /></SessionGuard>} />
        <Route path="/driver/order/:id" element={<SessionGuard role="driver"><DriverOrder /></SessionGuard>} />
        <Route path="/driver/earnings" element={<SessionGuard role="driver"><DriverEarnings /></SessionGuard>} />
        <Route path="/driver/profile" element={<SessionGuard role="driver"><DriverProfile /></SessionGuard>} />
        <Route path="/driver/chat/:orderId" element={<SessionGuard role="driver"><DriverChat /></SessionGuard>} />
        <Route path="/driver/history" element={<SessionGuard role="driver"><DriverHistory /></SessionGuard>} />

        {/* Commerce Dashboard Routes */}
        <Route path="/commerce" element={<SessionGuard role="merchant"><CommerceDashboard /></SessionGuard>} />
        <Route path="/commerce/orders" element={<SessionGuard role="merchant"><CommerceOrders /></SessionGuard>} />
        <Route path="/commerce/products" element={<SessionGuard role="merchant"><CommerceProducts /></SessionGuard>} />
        <Route path="/commerce/stats" element={<SessionGuard role="merchant"><CommerceStats /></SessionGuard>} />
        <Route path="/commerce/profile" element={<SessionGuard role="merchant"><CommerceProfile /></SessionGuard>} />

        {/* Admin Dashboard Routes */}
        <Route path="/admin" element={<SessionGuard role="admin"><AdminDashboard /></SessionGuard>} />
        <Route path="/admin/commerces" element={<SessionGuard role="admin"><AdminCommerces /></SessionGuard>} />
        <Route path="/admin/drivers" element={<SessionGuard role="admin"><AdminDrivers /></SessionGuard>} />
        <Route path="/admin/orders" element={<SessionGuard role="admin"><AdminOrders /></SessionGuard>} />
        <Route path="/admin/products" element={<SessionGuard role="admin"><AdminProducts /></SessionGuard>} />
        <Route path="/admin/settings" element={<SessionGuard role="admin"><AdminSettings /></SessionGuard>} />

        {/* Auth & Legal */}
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/legal" element={<PageTransition><LegalHub /></PageTransition>} />
        <Route path="/terminos-y-condiciones" element={<PageTransition><TermsAndConditions /></PageTransition>} />
        <Route path="/terminos" element={<PageTransition><TermsAndConditions /></PageTransition>} />
        <Route path="/politica-de-privacidad" element={<PageTransition><PrivacyPolicy /></PageTransition>} />
        <Route path="/privacidad" element={<PageTransition><PrivacyPolicy /></PageTransition>} />
        <Route path="/politica-de-reembolso" element={<PageTransition><RefundPolicy /></PageTransition>} />
        <Route path="/reembolsos" element={<PageTransition><RefundPolicy /></PageTransition>} />
        <Route path="/boton-de-arrepentimiento" element={<PageTransition><RegretButton /></PageTransition>} />
        <Route path="/arrepentimiento" element={<PageTransition><RegretButton /></PageTransition>} />
        <Route path="/defensa-del-consumidor" element={<PageTransition><ConsumerProtection /></PageTransition>} />
        <Route path="/eliminar-cuenta" element={<PageTransition><DeleteAccount /></PageTransition>} />
        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <QueryProvider>
      <Suspense fallback={<LoadingFallback />}>
        <SessionRefresh />
        <AnimatedRoutes />
      </Suspense>
    </QueryProvider>
  )
}
