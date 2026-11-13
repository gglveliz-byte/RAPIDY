> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de la ruta `/profile` — Rapidy (Customer Profile)

- **Fecha:** 13/11/2026
- **Repo:** `C:\Users\HP\OneDrive\Desktop\Rapidy`
- **Commit auditado:** `3f673c6` (`chore: sincronizacion completa de componentes de OrderTracking`)
- **Alcance:** únicamente la ruta `/profile`, su guard, sesión, historial, direcciones, logout, eliminación de cuenta, legales y PWA. Se leyeron también los contratos de login/registro y los endpoints de pedidos que consume la ruta.
- **Método:** lectura estática completa de los archivos nucleares y referenciados + verificación HTTP contra el servidor local en `http://localhost:3000` sin cookies. No se modificó código fuente; el único artefacto escrito es este informe.
- **Límites:** no se probó en dispositivo físico ni con usuarios reales; las marcas **hipótesis** indican lo que no pudo verificarse en runtime. No se hizo prueba de carga.

---

## 1. Resumen ejecutivo

- **P0 — Account takeover con solo el teléfono:** `customer.login` y `customer.register` autentican sin OTP ni contraseña. Si el teléfono ya existe, el registro devuelve y autentica esa misma cuenta (`server/customer-router.ts:20-31,33-56`; `CustomerLogin.tsx:43-59`; `Register.tsx:69-85`). No hay rate limiting.
- **P0 — IDOR confirmado en pedidos:** `order.getById` y `order.getByCustomer` son `publicQuery` sin ownership. Sin cookies se obtuvo un pedido con `deliveryAddress`, `customerPhone`, `paymentReceipt`, ítems e historial (`server/order-router.ts:125-185`). Verificado en runtime.
- **P0 — Enumeración de clientes:** `customer.list` y `customer.getById` son públicos. Sin cookies, `customer.list` devolvió 2 filas con `id, firstName, lastName, phone, address, createdAt, fcmToken` (`server/customer-router.ts:85-114`).
- **P0 — Eliminación de cuenta simulada:** el formulario solo guarda la solicitud en `localStorage` y espera 500 ms; no llama a ningún endpoint, no borra ni anonimiza, no revoca la sesión y no existe backend de borrado (`src/pages/legal/DeleteAccount.tsx:17-31`). Es una promesa legal/compliance falsa (Google Play Data Safety, Ley 25.326/LOPDP).
- **P0 — Mutación pública de pedidos:** cualquier persona puede cambiar el estado de cualquier pedido, asignar driver y generar earnings (`server/order-router.ts:240-330`).
- **P1 — Logout y sesión incompletos:** el logout solo elimina `customer_session`; quedan `qs_session`, el carrito, la caché de React Query, el `fcmToken` y el refresh token de 10 años. `checkAuth`/refresh no invalidan la sesión local cuando el servidor devuelve `null` (`useCustomerSession.tsx:59-93`; `SessionGuard.tsx:14-60`).
- **P1 — Historial caro y con PII:** `order.getByCustomer` no pagina y devuelve la fila completa, incluido el comprobante en base64. Medición local: **2.534,4 KB para 5 pedidos**, con un recibo de 2.591.923 caracteres (`server/order-router.ts:176-185`). No hay índice en `orders.customer_id`.
- **P2/P3 — Deuda de UX/A11y/visual:** estados de pedido duplicados y parcialmente en inglés, modal sin focus trap/Escape, targets táctiles <44 px, contraste bajo, `font-black` 900 no cargado, PWA de instalación ausente, y dos implementaciones distintas de logout/refresh.

**Veredicto:** la pantalla es visualmente sólida y arranca rápido por la hidratación desde `localStorage`, pero **no está lista para producción** por los P0 de autenticación, IDOR, borrado de cuenta y mutaciones públicas.

**Conteo:** 37 hallazgos — 5 P0, 9 P1, 18 P2 y 5 P3.

### Lo que funciona bien

- Hidratación inmediata del perfil desde `localStorage` (`useCustomerSession.tsx:49-56`).
- Guard de cliente con estado de carga y redirección para sesiones sin marcador (`SessionGuard.tsx:27-35,87-95`).
- Cookies de acceso `HttpOnly`, `Secure` fuera de localhost y refresco automático en contexto (`customer-auth.ts:65-87`; `context.ts:33-57`).
- Jerarquía z-index coherente en perfil: header `z-40`, bottom nav `z-50`, modal `z-[120]`; el nav se oculta con el modal abierto (`Profile.tsx:375`).
- Rutas legales existentes y enlazadas: `/legal`, `/boton-de-arrepentimiento`, `/eliminar-cuenta` (`App.tsx:128-138`; `Profile.tsx:325-363`).
- Sin imágenes de producto en el historial: el perfil no carga imágenes innecesarias.

---

## 2. Mapa end-to-end

### 2.1 Entrada y guard

1. El usuario entra por `CustomerBottomNav` (`src/components/CustomerBottomNav.tsx:94-105`) o por el header del Home (`HomeHeader.tsx:73-75`), que navegan a `/profile`.
2. `App.tsx:101` monta `<SessionGuard role="customer"><PageTransition><CustomerProfile /></PageTransition></SessionGuard>`.
3. `SessionGuard` calcula `checking` leyendo `qs_session` y `customer_session` (`SessionGuard.tsx:14-21`):
   - si no existe `qs_session` o el rol no es `customer` → `redirectOut()` a `/customer-login` (`SessionGuard.tsx:27-35,45-50`);
   - si existe `customer_session` e `isAuthenticated`, deja pasar sin verificar contra el backend (`SessionGuard.tsx:52-55,83-85`);
   - si existe `qs_session` pero no `customer_session`, espera 600 ms y deja renderizar el fallback interno de Profile, **sin redirigir** (`SessionGuard.tsx:57-60`; `Profile.tsx:78-98`).
4. `CustomerSessionProvider` hidrata `customer` desde `customer_session` en el primer render (`useCustomerSession.tsx:49-56`) y, en paralelo, llama `customer.checkAuth` con cookies (`useCustomerSession.tsx:59-74`).
5. `CustomerProfile` calcula `customerId = customer?.id ?? 0` y consulta `order.getByCustomer` con ese ID (`Profile.tsx:74-76`; `useDeliveryData.ts:241-248`). La consulta empieza en paralelo con `checkAuth`; no hay waterfall en la carga inicial del perfil.
6. Render: header fijo, tarjeta de dirección, preview de hasta 2 pedidos, historial completo en modal, legales y bottom nav.

### 2.2 Diagrama ASCII

```text
[Cliente]
  │ tap "Perfil" (bottom nav / HomeHeader)
  ▼
GET /profile  ── App.tsx:101
  │
  ├─ SessionGuard role="customer"  ── SessionGuard.tsx
  │    ├─ getSession() → qs_session (localStorage)
  │    ├─ localStorage.customer_session
  │    ├─ falta qs_session/rol ──────────────► /customer-login (replace)
  │    └─ hay customer_session ──► checking=false (NO valida backend)
  │
  ▼
[CustomerProfile]  ── Profile.tsx
  │
  ├─ useCustomerSession()
  │    ├─ customer = JSON.parse(customer_session)   ← 0 ms, PII local
  │    └─ useEffect → GET /api/trpc/customer.checkAuth (cookie)
  │         ├─ customer != null → setCustomer + localStorage
  │         └─ customer == null → NO limpia, NO redirige   ⚠
  │
  ├─ useCustomerOrders(customer.id)
  │    └─ GET /api/trpc/order.getByCustomer?input={"json":{"customerId":N}}
  │         └─ publicQuery, sin ownership, fila completa + receipt   ⚠
  │
  ▼
Render
  ├─ Header Dark Velvet: nombre, teléfono, botón "Salir"
  ├─ Card dirección (una sola, texto libre)
  ├─ Preview 2 pedidos → /order/:id
  │    └─ GET /api/trpc/order.getById?input={"json":{"id":N}}  ← público ⚠
  ├─ Modal "Historial de pedidos" (filtro/búsqueda 100% cliente)
  ├─ Legales → /legal, /boton-de-arrepentimiento, /eliminar-cuenta
  ├─ Eliminar cuenta → localStorage "qs_deletion_requests"     ⚠ NO API
  └─ PWA → sin acción (componente existe pero no está montado)  ⚠
```

### 2.3 Flujo de sesión/cookies

```text
customer.login / customer.register
  └─ Set-Cookie:
       quickgo_token  = access JWT  (15 min, HttpOnly, Secure, SameSite=None/Lax local)
       refresh_token  = refresh JWT (10 años, HttpOnly, Secure, SameSite=None)
  └─ Cliente guarda customer_session en localStorage + qs_session {role:"customer", ts}
  └─ En cada request, context.ts verifica access; si expiró usa refresh y reemite cookies.

logout del perfil
  ├─ localStorage.removeItem("customer_session")     ✅
  ├─ POST customer.logout → borra quickgo_token/refresh_token  ✅
  ├─ NO borra qs_session / cart / React Query / fcmToken        ⚠
  ├─ NO revoca el refresh token (JWT stateless, 10 años)        ⚠
  └─ navigate("/customer-login") sin replace                    ⚠
```

### 2.4 Acciones de la pantalla

| Acción | Disparador UI | Handler | Efecto local | API exacta | Resultado actual |
|---|---|---|---|---|---|
| Entrar al perfil | Bottom nav / HomeHeader | router | — | — | Guard + render |
| Cargar perfil | Montaje | `useCustomerSession` | Hidrata `customer_session` | `customer.checkAuth` (GET, cookie) | Perfil inmediato; si server null no limpia |
| Editar dirección | Lápiz (`Profile.tsx:186-192`) | `startEditing` | `editAddress = customer.address` | — | Editor inline |
| GPS | `Profile.tsx:208-216` | `handleGetLocation` | Nominatim → `editAddress` | `GET nominatim.openstreetmap.org` | Fallback a coordenadas; error silencioso |
| Guardar dirección | `Profile.tsx:218-225` | `saveAddress` | `login({...customer,address})` | `customer.update` POST `{address}` | Sin feedback de error; ignora respuesta |
| Ver pedido | Card (`Profile.tsx:274-277`) | `navigate` | — | `order.getById` GET `{id}` | Público, sin ownership |
| Ver todos | `Profile.tsx:249-257,306-314` | `setShowAllOrdersModal` | Filtro/búsqueda local | — | Modal; estado persiste al cerrar |
| Repetir pedido | — | — | — | — | **No implementado** |
| Logout | `Profile.tsx:167-174` | `handleLogout` | Borra `customer_session` | `customer.logout` POST | Parcial; ver F-06 |
| Legales | `Profile.tsx:325-363` | `navigate` | — | — | Rutas existen; back con `navigate(-1)` |
| Eliminar cuenta | `Profile.tsx:351-362` | `navigate("/eliminar-cuenta")` | — | **Ninguna** | Solicitud fake en localStorage |
| Instalar PWA | — | — | — | — | **No hay acción ni banner montado** |

---

## 3. Inventario de archivos

| Archivo | Rol en `/profile` | Líneas | Observación |
|---|---|---:|---|
| `src/pages/customer/Profile.tsx` | Pantalla principal | 378 | Header, dirección, preview, legales, logout |
| `src/pages/customer/components/ProfileOrdersModal.tsx` | Historial completo | 347 | Bottom sheet, búsqueda, filtros, estados |
| `src/hooks/useCustomerSession.tsx` | Contexto de sesión de cliente | 133 | Hidratación localStorage, checkAuth, refresh, logout |
| `src/hooks/useSessionSync.ts` | Marcador `qs_session` | 42 | get/set/clear + evento `storage` |
| `src/hooks/useAuth.ts` | Auth legacy de socios | 49 | No usado por el árbol de App; dead code |
| `src/hooks/useDeliveryData.ts` | Cliente HTTP tRPC + hooks | 583 | `trpcCall`/`trpcMutate`, `useCustomerOrders`, update |
| `src/hooks/useCart.tsx` | Carrito global | 113 | Persistencia localStorage; no se limpia en logout |
| `src/hooks/usePWAInstall.ts` | Stub PWA | 5 | Retorna no-op; dead code |
| `src/components/CustomerBottomNav.tsx` | Navegación inferior | 108 | Nav flotante, badge de carrito |
| `src/components/PWAInstallBanner.tsx` | Banner de instalación | 97 | **No está montado en ningún árbol** |
| `src/components/PageTransition.tsx` | Transición de ruta | 57 | Errores de typecheck (17, 51) |
| `src/components/SessionGuard.tsx` | Guard de rol | 96 | Cliente confía en localStorage |
| `src/pages/customer/CustomerLogin.tsx` | Login cliente | 180 | Teléfono sin OTP |
| `src/pages/customer/Register.tsx` | Registro cliente | 276 | Si el teléfono existe, autentica esa cuenta |
| `src/pages/legal/DeleteAccount.tsx` | Baja de cuenta | 189 | Simulada en localStorage |
| `src/pages/legal/LegalHub.tsx` | Centro legal | 168 | Diseño verde legado; `navigate(-1)` |
| `server/customer-router.ts` | Router de clientes | 124 | login/register/update/checkAuth/list públicos en exceso |
| `server/login-router.ts` | Login de socios + refresh global | 184 | `login.logout` limpia todas las cookies |
| `server/order-router.ts` | Router de pedidos | 484 | `getById`/`getByCustomer`/`updateStatus` públicos |
| `server/customer-auth.ts` | JWT/cookies de cliente | 92 | Access 15 min, refresh 10 años, sin revocación |
| `server/middleware.ts` | Middlewares tRPC | 67 | `customerQuery` correcto; mal aplicado en pedidos |
| `server/events.ts` | SSE + push | 107 | Notificaciones al `fcmToken` persistido |
| `server/context.ts` | Contexto por request | 156 | Auto-refresh de access; catch global silencioso |
| `server/boot.ts` | Hono + SSE + tRPC | 227 | SSE de pedidos/driver/commerce sin auth |
| `db/schema.ts` | Esquema Drizzle | 240+ | Sin tabla `addresses`, sin email, sin soft delete |
| `src/App.tsx` | Rutas/providers | 154 | Profile eager; eliminar-cuenta pública |
| `src/index.css` | Tokens/global CSS | 281 | `select-none` global; primary verde; safe areas |
| `tailwind.config.js` | Tema Tailwind | 84 | Radios `xl=24px` > `2xl=16px` |
| `src/providers/trpc.tsx` | Cliente tRPC | 72 | Segundo QueryClient con otra config |
| `src/providers/QueryProvider.tsx` | QueryClient de App | 27 | staleTime 5 min; sin refetch on focus |
| `src/main.tsx` | Composición de providers | 23 | CartProvider + CustomerSessionProvider |
| `index.html` | Shell/PWA | 47 | Outfit 300-700; manifiesto; SW |
| `public/sw.js` | Service worker | ~50 | No cachea API ni navegación; offline = error |

---

## 4. Hallazgos

> Prioridad: **P0** = bloqueante de producción/seguridad crítica; **P1** = alto; **P2** = medio; **P3** = bajo. Las referencias son `archivo:línea`.

### 4.1 P0 — Críticos

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| F-01 | P0 | Seguridad/Auth | `src/pages/customer/CustomerLogin.tsx:43-59`; `Register.tsx:69-85`; `server/customer-router.ts:20-31,33-56` | Login y registro se autentican solo con teléfono. `register` devuelve y autentica la cuenta existente si el teléfono coincide; no hay OTP, contraseña ni rate limit. | Account takeover con solo conocer el teléfono; acceso a dirección, historial y comprobantes; enumeración de cuentas. | OTP SMS + rate limit + bloqueo; `register` debe responder 409 si existe; nunca autenticar por conocimiento del teléfono; alertas de login. |
| F-02 | P0 | IDOR/Privacidad | `server/order-router.ts:125-174,176-185` | `order.getById` y `order.getByCustomer` son `publicQuery`; no comparan `order.customerId` con `ctx.customer.id`. | Cualquiera con un ID lee pedidos ajenos: dirección, teléfono, comprobante base64, ítems, historial y datos del driver. **Verificado sin cookies.** | `customerQuery` + ownership; proyección mínima; token de tracking firmado si se necesita invitado; rate limit. |
| F-03 | P0 | Privacidad | `server/customer-router.ts:85-114` | `customer.getById` y `customer.list` son públicos; `list` devuelve todos los clientes y `checkAuth` devuelve la fila completa con `fcmToken`. No tienen consumidores en `src/`: son superficie de ataque pura. | Enumeración y exfiltración masiva de PII. **Verificado sin cookies: 2 filas, keys `id,firstName,lastName,phone,address,createdAt,fcmToken`.** | Eliminar `list`/`getById`; exponer `customer.me` autenticado con proyección; `list` solo `adminQuery`; no devolver `fcmToken`. |
| F-04 | P0 | Privacidad/Compliance | `src/pages/legal/DeleteAccount.tsx:17-31,75-91`; `server/customer-router.ts` (sin endpoint); `db/schema.ts:66-74,161` | El formulario público (sin verificación de identidad) solo hace `setTimeout(500)` y agrega nombre/teléfono/motivo a `qs_deletion_requests` en localStorage. No existe endpoint de borrado ni anonimización. La sesión sigue activa y el botón final vuelve a `/home`. | El usuario cree que sus datos se eliminarán; no se borra nada; promesa de 48 h incumplida; PII persistente en el dispositivo; riesgo legal/Google Play. | Endpoint autenticado de solicitud + verificación; soft delete/anonymization; revocar tokens y `fcmToken`; job y estado consultable; no guardar PII local. |
| F-05 | P0 | Seguridad/Backend | `server/order-router.ts:240-330` | `order.updateStatus` es `publicQuery`; acepta `id`, `status` y `driverId` de cualquiera, y al marcar `delivered` inserta earnings. | Cualquiera puede cancelar/entregar pedidos ajenos, asignar drivers y duplicar earnings; corrupción operativa y financiera. | Separar transiciones por rol (`merchantQuery`/`driverQuery`/`adminQuery`) con ownership, state machine e idempotencia; auditoría. |

### 4.2 P1 — Altos

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| F-06 | P1 | Sesión/Privacidad | `src/hooks/useCustomerSession.tsx:83-93`; `Profile.tsx:136-139`; `SessionGuard.tsx:27-35`; `useCart.tsx:27-31` | Logout borra solo `customer_session` y llama `customer.logout` (cookies). No borra `qs_session`, carrito, caché de React Query ni `fcmToken`; no revoca el refresh. `handleLogout` navega sin `replace` y sin esperar. | Dispositivo compartido: carrito y PII en caché; el guard no redirige al volver atrás; notificaciones del usuario anterior; sesión server-side sigue viva. | Logout local-first: `clearSession()`, `setCustomer(null)`, `queryClient.clear()`, `clearCart()`, `navigate(...,{replace:true})`; server revoca refresh y limpia `fcmToken`. |
| F-07 | P1 | Sesión | `src/hooks/useCustomerSession.tsx:59-74,95-111`; `SessionGuard.tsx:14-21,52-60`; `useSessionSync.ts:10-17` | Si `checkAuth` devuelve `customer:null` o el refresh falla, no se limpia la sesión local. El guard de cliente confía en `customer_session`/`qs_session` y no valida backend. El `ts` de `qs_session` nunca se usa. | Una sesión expirada o revocada sigue mostrando nombre, teléfono y dirección desde localStorage; no hay redirect ni aviso. | Fuente única server (`customer.me`); si `null` → logout local + redirect; TTL/validación; guard con verificación en background y fallback. |
| F-08 | P1 | Seguridad | `server/customer-auth.ts:9-10,15,43-52,89-92` | Refresh JWT de 10 años, stateless; `jti` se genera pero no se persiste; no hay rotación; logout/delete no revocan. | Un token robado vale 10 años; no existe logout global; incumple la expectativa de "cerrar sesión". | Refresh rotation + tabla/almacén de `jti`/familia/versión; revocación en logout/delete; expiración razonable (30-90 días); detección de reuse. |
| F-09 | P1 | Performance/Privacidad | `server/order-router.ts:176-185`; `useDeliveryData.ts:241-248`; `db/schema.ts:159-178` | `getByCustomer` devuelve todas las filas completas (incluye `paymentReceipt` base64), sin `limit`/`offset`; no hay índice declarado en `orders.customer_id` ni en `order_items.order_id`. | **Medido: 2.534,4 KB para 5 pedidos**, recibo máximo 2.591.923 chars; descarga lenta, consumo de datos y exposición de comprobantes. Riesgo de full scan al crecer. | `SELECT` mínimo (id, status, total, createdAt), excluir receipt, paginación cursor/limit, índice `(customer_id, created_at DESC)` y `(order_id)`; endpoint detail para el comprobante. |
| F-10 | P1 | Privacidad | `server/customer-auth.ts:89-92`; `usePushNotifications.ts:50-61`; `server/events.ts:69-87` | Logout no limpia `fcmToken`; el flujo de baja tampoco lo contempla. El token queda asociado al cliente y el servidor sigue enviando push de sus pedidos. | En un dispositivo compartido, el siguiente usuario recibe notificaciones del anterior; fuga de estado de pedidos. | `customer.clearDeviceToken` en logout/delete/cambio de cuenta; asociar token a sesión/dispositivo; invalidar en el servidor. |
| F-11 | P1 | Contrato/Datos | `server/customer-router.ts:20-27,37-53,93-106`; `db/schema.ts:70` | Teléfono sin normalizar (unique por string); login fuzzy por últimos 8 dígitos con `result[0]`; update acepta `""` y duplicados; unique violation se convierte en 500. | Duplicados por formato, login a la cuenta equivocada si hay colisión de sufijo, cuentas irrecuperables y errores 500. | Normalizar a E.164, unique canónico, login exacto, eliminar fuzzy ambiguo (o requerir país), validar min/max y mapear duplicados a 409. |
| F-12 | P1 | Seguridad | `server/boot.ts:72-127` | SSE `/api/events/orders/:id`, `/api/events/driver/:id` y `/api/events/commerce/:id` no tienen auth ni ownership. | Cualquiera con un ID recibe estado y coordenadas en vivo; permite seguir pedidos/drivers de terceros. | Sesión + ownership, o token firmado de tracking por pedido; rate limit; no exponer IDs de driver. |
| F-13 | P1 | Privacidad | `src/hooks/useCustomerSession.tsx:49-56,70,103-106`; `server/customer-router.ts:58-61`; `server/boot.ts:28` | `customer_session` guarda nombre, teléfono y dirección en localStorage. `checkAuth` devuelve la fila completa (incluido `fcmToken`) y el cliente la escribe entera. La CSP permite `'unsafe-inline'`. | XSS o dispositivo compartido expone PII; `fcmToken` en cliente; sin TTL local. | Guardar solo `id`/mínimo; `customer.me` con proyección; TTL; no `fcmToken`; evaluar cifrado/IndexedDB. |
| F-14 | P1 | Sesión/Privacidad | `src/pages/customer/CustomerLogin.tsx:43-59`; `Register.tsx:69-85`; `useCart.tsx:27-31`; `providers/QueryProvider.tsx:6-19` | Se puede iniciar otra cuenta sin logout previo y sin limpiar carrito, caché ni `qs_session`; el registro con teléfono existente devuelve esa cuenta. | Cambio de usuario en el mismo dispositivo conserva carrito y datos en caché; confusión y fuga entre cuentas. | Si hay sesión, exigir logout/clear o flujo "cambiar cuenta"; limpiar carrito y queries; invalidar todo. |

### 4.3 P2 — Medios

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| F-15 | P2 | Funcional/Contrato | `Profile.tsx:114-134`; `customer-router.ts:93-109`; `db/schema.ts:66-74` | Solo se edita dirección. No hay UI para nombre/teléfono ni email; `customers` no tiene email, `deletedAt` ni `updatedAt`; no existe tabla `addresses`; una sola dirección de texto, sin default/múltiples. | Perfil incompleto; no se puede corregir el teléfono (que es la credencial de login); no se gestionan direcciones. | Añadir edición de nombre/teléfono; tabla `addresses` con label, default, coords y CRUD; selector en checkout; `customer.me`. |
| F-16 | P2 | Funcional | `Profile.tsx:271-304`; `ProfileOrdersModal.tsx:271-337` | No existe "Repetir pedido"; el modal solo permite "Ver detalle". No hay endpoint de reorder. | Recompra manual; pérdida de retención y fricción. | Botón "Repetir": leer `order.items`, validar producto/precio/disponibilidad y reemplazar/mergear carrito con confirmación. |
| F-17 | P2 | Bug/UX | `Profile.tsx:100-112,124-133` | `catch {}` en GPS y guardado; guardar vacío retorna sin mensaje; geolocalización no soportada retorna en silencio. | El usuario no sabe si guardó; reintenta; dirección vieja persiste. | Estado de error + toast/inline; validación visible; reintento; deshabilitar guardar si está vacío. |
| F-18 | P2 | Bug/UX | `Profile.tsx:260-268`; `useDeliveryData.ts:241-248` | Los hooks devuelven solo `data/loading`; un error de query se renderiza como "No tienes pedidos aún". No hay `isError`, retry ni estado offline. | El historial parece vacío ante un fallo de red; soporte innecesario; pérdida de confianza. | Exponer `isError/refetch`; distinguir vacío/error/offline; botón reintentar; banner de conectividad. |
| F-19 | P2 | UX/Deuda | `Profile.tsx:55-63`; `ProfileOrdersModal.tsx:64-113`; `OrderTracking.tsx:40-47`; `db/schema.ts:18-30` | Dos mapas divergentes. La DB tiene `accepted`, `ready_for_pickup`, `driver_assigned`, `on_the_way`, `payment_rejected`; el perfil/modal los muestran crudos en inglés. `in_transit` y `confirmed` no existen en el enum. | Estados confusos justo en la acción principal (historial); inconsistencia entre preview, modal y tracking. | Módulo único `orderStatus.ts` tipado contra el enum, labels ES y tests; usar en todas las vistas. |
| F-20 | P2 | Performance/UX | `providers/QueryProvider.tsx:11-15`; `useDeliveryData.ts:241-248` | `staleTime` global de 5 min y `refetchOnWindowFocus:false`; el historial no define `staleTime` ni refetch; no hay SSE en `/profile`. | Estado/total desactualizado hasta 5 min al volver de otra pantalla. | `staleTime` corto para pedidos activos, `refetchOnMount/focus` selectivo, invalidación por SSE. |
| F-21 | P2 | A11y | `ProfileOrdersModal.tsx:155-160,182-188,195-201,271-277` | No hay `role="dialog"`, `aria-modal`, focus trap, Escape ni scroll lock. Las tarjetas de pedido son `div onClick` sin `tabIndex`/rol; el buscador no tiene label. | Usuarios de teclado/lector no pueden abrir pedidos ni cerrar; el fondo scrollea; el foco se pierde. | Usar Radix Dialog (ya instalado), `Dialog.Title`, focus trap, Escape, scroll lock, botones y labels; devolver foco al trigger. |
| F-22 | P2 | A11y | `Profile.tsx:167-174,186-192,208-232`; `ProfileOrdersModal.tsx:182-188` | Targets <44 px: "Salir" ~30 px, lápiz 28 px, GPS/Guardar/Cancelar 32 px, cerrar modal 32 px. | Dificultad táctil y errores en móvil. | `min-h-11 min-w-11` (44 px) y separación mínima. |
| F-23 | P2 | A11y/Visual | `Profile.tsx:57-62,182,246,254,299`; `ProfileOrdersModal.tsx:218-248,286-295`; `index.html:17` | Naranja `#FF6A00` sobre blanco ≈2,9:1 en textos de 10-12 px; `zinc-400` a 10 px ≈2,6:1. `font-black` (900) se usa mucho, pero Outfit solo carga 300-700. | Baja legibilidad; incumple AA en texto normal; faux bold. | Tokens con contraste AA; tamaños ≥12-14 px; cargar 900 o usar `font-bold` 700. |
| F-24 | P2 | A11y | `PageTransition.tsx:19-37`; `ProfileOrdersModal.tsx:155-160`; `CustomerBottomNav.tsx:44-105` | No se respeta `prefers-reduced-motion`; hay `animate-in`, `pulse`, `ping`, `bounce` y `whileTap` sin alternativa. | Molestias/vértigo; incumple la preferencia del usuario. | `useReducedMotion`/`motion-reduce`; desactivar transform/loops. |
| F-25 | P2 | Funcional/Deuda | `PWAInstallBanner.tsx:5-97`; `usePWAInstall.ts:1-5`; `Profile.tsx`; `App.tsx` | No hay acción "Instalar PWA" en `/profile`; `PWAInstallBanner` no se monta en ningún árbol; `usePWAInstall` es un stub. Si se montara, `bottom-20 z-50` se superpone al contenido inferior y comparte `z-50` con el bottom nav. | Feature ausente; código muerto; la instalación queda a merced del navegador. | Montar banner global o botón en perfil con `beforeinstallprompt` real; coordinar `z-index`/bottom; test de instalación. |
| F-26 | P2 | Bug/Contrato | `Profile.tsx:128-129`; `useCustomerSession.tsx:59-74` | `saveAddress` ignora la respuesta de `customer.update` y hace `login({...customer,address})` con el snapshot local; `checkAuth` solo corre al montar. | Perfil desactualizado; puede reintroducir nombre/teléfono viejos en UI/localStorage; cambios desde otro dispositivo no se ven. | Usar el `updated` de la mutación; `customer.me` + invalidación; refresh on focus; no spread stale. |
| F-27 | P2 | Layout/Safe area | `Profile.tsx:147,178`; `index.css:128-145`; `ProfileOrdersModal.tsx:160,254` | El header usa `pt-safe` y altura variable, pero el contenido usa 68 px fijos: ~6 px de hueco sin notch y ~22 px con notch. El modal no tiene `safe-area-inset-bottom`. | Desalineación visual en iPhone/Android; el último card del modal queda cerca del home indicator. | CSS var de altura del header o layout sticky; `pb-[env(safe-area-inset-bottom)]` en el modal. |
| F-28 | P2 | Localización | `Profile.tsx:291-299`; `ProfileOrdersModal.tsx:293-330`; `db/schema.ts:159-178` | `$` hardcodeado; `parseFloat` sin moneda; `toLocaleDateString` con hora y sin TZ; `timestamp` sin zona horaria en la DB. | Ambigüedad ARS/USD; offset si el servidor no está en UTC; fechas inconsistentes entre preview y modal. | `currency` en orders/settings; `Intl.NumberFormat`; `timestamp with time zone` o ISO; un solo formateador. |
| F-29 | P2 | Visual/Deuda | `index.css:27-40`; `tailwind.config.js:52-58`; `Profile.tsx:147-375`; `LegalHub.tsx:72`; `DeleteAccount.tsx:36` | Tokens `--primary` verdes y radios `xl=24 px` > `2xl=16 px`; legales en verde `#2E7D32` vs naranja; múltiples hardcodes/sombras. | Marca inconsistente; jerarquía de radios impredecible; difícil tematizar. | Tokens Rapidy (orange/dark/surface) y escala de radios coherente; unificar legales. |
| F-30 | P2 | Robustez | `useCart.tsx:28-31`; `useSessionSync.ts:27-36` | `JSON.parse` sin try/catch en el carrito (boot) y en el evento `storage`. | Un localStorage corrupto produce white screen o rompe la sincronización entre pestañas. | Parse seguro + validación de schema + fallback/limpieza. |
| F-31 | P2 | UX | `Profile.tsx:78-97` | El estado no autenticado solo ofrece "Crear cuenta" (`navigate("/register")`), aunque el copy dice "Registrate o ingresa". | Los usuarios existentes no tienen CTA directa a login; fricción. | Añadir "Iniciar sesión" a `/customer-login`; CTA primaria/secundaria. |
| F-32 | P2 | A11y | `index.html:5` | El viewport declara `maximum-scale=1.0, user-scalable=no`, bloqueando el pinch-zoom en los navegadores que lo respetan. | Usuarios con baja visión no pueden ampliar texto/controles; incumple WCAG 1.4.4. | `width=device-width, initial-scale=1, viewport-fit=cover` sin `maximum-scale`/`user-scalable=no`. |

### 4.4 P3 — Bajos

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| F-33 | P3 | UX/Navegación | `LegalHub.tsx:74`; `DeleteAccount.tsx:38` | "Volver" usa `navigate(-1)` sin fallback. En deep link o pestaña nueva no hay historial. | El botón no hace nada o sale de la app. | `navigate("/profile")` o `/legal` si `history.length <= 1`. |
| F-34 | P3 | UX | `ProfileOrdersModal.tsx:121-122,152,192-250`; `Profile.tsx:249-314` | `searchQuery`/`statusFilter` persisten al cerrar y reabrir (el componente no se desmonta). Hay dos CTAs "Ver todos" y "Ver los N anteriores"; el conteo incluye todos, no los anteriores. | Reapertura muestra un filtro viejo/vacío; ruido visual; conteo engañoso. | Reset al cerrar o desmontar; un solo CTA; contar `orders.length - 2`. |
| F-35 | P3 | A11y | `CustomerBottomNav.tsx:40-105`; `Profile.tsx:145`; `index.css:6-12` | `nav` sin `aria-label`; ítems sin `aria-current`; `select-none` global impide seleccionar dirección/ID. | Menor accesibilidad y copia de datos. | `aria-label`, `aria-current`; quitar `select-none` o limitarlo a controles. |
| F-36 | P3 | Deuda/Build | `App.tsx:13`; `useAuth.ts`; `useDeliveryData.ts:576-583`; `providers/trpc.tsx:24-47`; `QueryProvider.tsx`; `PageTransition.tsx:17,51` | `Profile` es eager; `useAuth`/`AuthLayout` no están ruteados; `useCheckAuth`/`setSession`/`usePWAInstall` muertos; hay dos `QueryClient` con config distinta (30 s vs 5 min) y dos refresh (9 y 10 min). `npm run check` y `npm test` fallan. | Ruido de bundle/CI; cachés divergentes; mantenimiento. | Lazy/prefetch; borrar dead code; un solo `QueryClient`; un solo refresh; corregir tipos; agregar tests. |
| F-37 | P3 | Seguridad (hipótesis) | `server/customer-auth.ts:79-85`; `server/boot.ts:25-32` | `refresh_token` usa `SameSite=None`; no se valida `Origin` ni hay CSRF token en mutaciones. No se observó CORS habilitado. **Hipótesis:** el riesgo se materializa si se agrega CORS o se aceptan formularios cross-site. | Potencial CSRF sobre mutaciones con cookie. | Validar `Origin` en mutaciones; `SameSite=Lax` si es same-origin; CSRF token; allowlist CORS. |

### 4.5 Estados UI

| Estado | Evidencia | Actual | Acción |
|---|---|---|---|
| Inicial/loading | `Profile.tsx:260-263`; `useCustomerSession.tsx:49-56` | Perfil instantáneo desde localStorage; skeleton de una barra para pedidos | Mantener; skeleton con la altura real de la card para evitar CLS |
| Vacío | `Profile.tsx:264-268` | Card "No tienes pedidos aún" sin CTA | Añadir "Explorar comercios" |
| Error de red | `useDeliveryData.ts:241-248` | Se muestra como vacío | `isError` + retry (F-18) |
| Offline | `public/sw.js:14-22` | Navegación/API no cacheadas; error del navegador o vacío | Página offline + banner + retry |
| Sesión expirada | `useCustomerSession.tsx:59-74`; `SessionGuard.tsx:52-60` | Perfil cacheado completo, sin redirect | Logout local + redirect (F-07) |
| No autenticado | `Profile.tsx:78-97` | Solo "Crear cuenta" | Añadir "Iniciar sesión" (F-31) |
| Editando dirección | `Profile.tsx:196-234` | Textarea inline; errores silenciosos; sin label | Label/aria, error inline, targets 44 px |
| Historial/modal | `ProfileOrdersModal.tsx:155-160` | Bottom sheet sin focus trap/Escape/scroll lock | Radix Dialog + a11y (F-21) |
| 320-430 px | `index.css:109-118`; `CustomerBottomNav.tsx:47` | Sin scroll horizontal; targets y contraste débiles | F-22/F-23; probar 320/375/390/430 |
| Teclado | `Profile.tsx:200-232`; `CustomerBottomNav.tsx:41` | Bottom nav fijo puede tapar Guardar/Cancelar | **Hipótesis**; probar iOS/Android y usar `visualViewport` o sticky footer |
| Layout shift | `Profile.tsx:178,260-263` | Header/contenido con offset fijo; skeleton de altura distinta | Tokenizar altura y skeleton (F-27) |

### 4.6 Checklist de accesibilidad

| Criterio | Estado | Evidencia |
|---|---|---|
| Labels en inputs | ❌ | Textarea de dirección y buscador del modal sin label (`Profile.tsx:200-206`; `ProfileOrdersModal.tsx:195-201`) |
| Operable por teclado | ❌ | Cards de pedido son `div onClick` (`ProfileOrdersModal.tsx:271-277`) |
| Focus trap / Escape / scroll lock | ❌ | Sin `role="dialog"` ni manejo de foco (`ProfileOrdersModal.tsx:155-160`) |
| Contraste AA | ❌ | `#FF6A00`/blanco ≈2,9:1; `zinc-400` 10 px ≈2,6:1 (F-23) |
| Targets ≥44 px | ❌ | Salir ~30, lápiz 28, guardar/cerrar 32 (F-22) |
| Reduced motion | ❌ | Sin `prefers-reduced-motion` (F-24) |
| Zoom permitido | ❌ | `user-scalable=no` declarado (`index.html:5`, F-32) |
| `aria-current` en nav | ❌ | `CustomerBottomNav.tsx:40-105` |
| Estado no solo por color | ✅ | Badges incluyen texto |
| Idioma declarado | ✅ | `<html lang="es">` (`index.html:2`) |
| Anuncio de errores | ❌ | Catches vacíos / sin `role="alert"` (F-17) |

### 4.7 Checklist de seguridad/privacidad

| Control | Estado | Evidencia |
|---|---|---|
| Autenticación real (OTP/password) | ❌ | Solo teléfono (F-01) |
| Ownership en lecturas | ❌ | Order/customer públicos (F-02/F-03) |
| Ownership en mutaciones | ❌ | `updateStatus` público (F-05) |
| Cookies HttpOnly/Secure | ✅ | `customer-auth.ts:65-87` |
| Refresh revocable/rotativo | ❌ | 10 años stateless (F-08) |
| Logout completo | ❌ | F-06 |
| Minimización de PII | ❌ | Fila completa en localStorage (F-13) |
| Borrado/anonimización | ❌ | Flujo fake (F-04) |
| Rate limiting | ❌ | Sin evidencia en `server/` |
| CSRF/Origin | ⚠️ | `SameSite=None`; hipótesis F-37 |
| PII en logs | ⚠️ | No observada; revisar errores DB (9.4) |

---

## 5. Inconsistencias visuales

1. **Dos sistemas de marca:** el tema global define `--primary` verde (`index.css:27,39`) y las páginas legales usan `#2E7D32` (`LegalHub.tsx:72`; `DeleteAccount.tsx:36`), mientras el perfil usa naranja `#FF6A00` y Dark Velvet `#0E0E12` hardcodeados (`Profile.tsx:147,149,169,221,299`). No hay token `brand`/`flame`.
2. **Escala de radios incoherente:** `tailwind.config.js:52-58` redefine `xl = var(--radius)+4px` (24 px) y `lg = 20 px`, pero `2xl` queda en 16 px y `3xl` en 24 px. Resultado: `rounded-xl` (24) es más grande que `rounded-2xl` (16) y empata con `rounded-3xl` (24). El perfil mezcla `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[32px]` y `rounded-full` (`Profile.tsx:149,180,188,204,221,277`; `ProfileOrdersModal.tsx:160`).
3. **Tipografía:** `index.html:17` carga Outfit 300-700, pero el perfil abusa de `font-black` (900) (`Profile.tsx:84,154,169,221,246`; `ProfileOrdersModal.tsx:173,282,293`). El navegador sintetiza el peso o cae a 700; el resultado no es el diseño previsto.
4. **Contraste:** `#FF6A00` sobre blanco ≈2,9:1 y sobre `#F7F7FA` ≈2,7:1; se usa en textos de 10-14 px (`Profile.tsx:252,299`; `ProfileOrdersModal.tsx:230,293,334`). `text-zinc-400` a 10 px sobre blanco ≈2,6:1 (`Profile.tsx:182,321`). No cumple AA para texto normal.
5. **Tamaños diminutos:** labels de 10-11 px, badges de 10 px, tabs de 12 px, footer legal de 11 px. En 320-430 px se leen, pero son frágiles con zoom o baja visión.
6. **Sombras múltiples:** `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-xl`, `shadow-[0_4px_16px...]`, `shadow-[0_2px_12px...]`, `shadow-2xl` conviven en la misma pantalla (`Profile.tsx:180,265,277`; `ProfileOrdersModal.tsx:160,277`).
7. **Header vs contenido:** el header es fijo con `pt-safe` y el contenido usa `68px` fijos (`Profile.tsx:147,178`). En iOS con notch queda un hueco de ~22 px; en Android sin notch, ~6 px. La altura no está tokenizada.
8. **Modal:** `min-h-[50dvh]` (`ProfileOrdersModal.tsx:160`) deja mucho espacio vacío cuando hay 1 pedido o cuando el filtro no devuelve resultados; el bottom sheet no respeta `safe-area-inset-bottom`.
9. **Avatar/fallback:** no hay avatar de usuario ni upload; el header usa un icono `User` en un cuadrado `rounded-2xl` (`Profile.tsx:149-151`). El fallback es estable, pero no diferencia usuarios ni permite personalización.
10. **Jerarquía de secciones:** "Dirección de entrega" y "Información y Marco Legal" usan labels uppercase de 11 px, mientras "Historial de pedidos" es un título de 16 px (`Profile.tsx:182,246,321`). La sección principal queda visualmente menos jerarquizada que la secundaria.
11. **Bottom nav / PWA:** el nav usa `z-50` y `bottom-safe-nav` (`CustomerBottomNav.tsx:41`); el banner PWA (no montado) usaría `bottom-20 z-50` (`PWAInstallBanner.tsx:59`), con riesgo de tapar contenido inferior si se activa. **No se observa un banner repetido porque el componente no está montado.**
12. **Legal:** las páginas legales mantienen el diseño QuickGo verde, tipografía y cards distintas al resto del customer app; el hub y la baja parecen otra aplicación.
13. **Truncado/teclado:** el nombre usa `truncate` dentro de un flex sin `min-w-0` en el propio `span` (`Profile.tsx:153-156`); verificar con nombres de 60+ caracteres. El textarea de dirección y los botones Guardar/Cancelar pueden quedar tapados por el bottom nav fijo al abrir el teclado en pantallas pequeñas (**hipótesis**, probar iOS/Android).
14. **Cards/badges/iconografía:** las cards comparten radio de 16 px pero no una misma sombra; los badges de estado son consistentes en forma/tamaño, aunque el color depende de un mapa divergente; los iconos lucide son consistentes (3-5 px de trazo). La deuda está en el mapeo de estados, no en el set de iconos.
15. **Scroll horizontal:** a 320 px el body no desborda y los tabs del modal usan `overflow-x-auto` correctamente (`ProfileOrdersModal.tsx:215`). El riesgo es un nombre/estado largo sin `min-w-0`/truncado, no el layout general.
16. **Espaciado:** `px-4`, `space-y-4`, cards `p-3.5/p-4` y header `pb-2.5` son consistentes a nivel macro, pero no hay tokens de spacing/sombra; el offset fijo del header rompe la relación con el contenido (F-27).

---

## 6. Fluidez y performance

### 6.1 Diagnóstico

- **Carga inicial del perfil:** buena. `customer_session` hidrata en el primer render y evita pantalla en blanco; `checkAuth` y `order.getByCustomer` salen en paralelo (`useCustomerSession.tsx:49-74`; `Profile.tsx:75`). No hay waterfall en `/profile`.
- **Historial:** el problema no es el render sino el contrato. `getByCustomer` devuelve filas completas, incluido el comprobante base64, sin límite. Medición local: **2.534,4 KB / 5 pedidos**. En 3G esto es varios segundos y consumo de datos; con 100 pedidos es inviable.
- **Detalle de pedido:** `order.getById` hace 5-6 consultas secuenciales (orden, ítems, historial, estados por comercio, driver, comercios) (`order-router.ts:129-173`). Se puede paralelizar con `Promise.all`.
- **Índices:** no hay índices declarados en `orders.customer_id`, `orders.created_at` ni `order_items.order_id` (`db/schema.ts:159-194`). El historial puede hacer full scan al crecer.
- **Caché:** `staleTime` 5 min y sin refetch on focus (`QueryProvider.tsx:11-15`); el historial puede quedar viejo. El detalle sí tiene `refetchInterval` de 4 s mientras el pedido está activo (`useDeliveryData.ts:224-238`), pero el perfil no.
- **Modal:** renderiza todos los pedidos en DOM, sin virtualización; el filtrado es `useMemo` y O(n), aceptable hasta cientos, no para miles (`ProfileOrdersModal.tsx:125-150,266-341`).
- **Fechas:** se crea un `Intl` implícito por cada `toLocaleDateString` en cada fila y render (`Profile.tsx:291`; `ProfileOrdersModal.tsx:324`). Con 100+ filas es un quick win.
- **CLS:** el skeleton del historial es un bloque de 56 px (`Profile.tsx:260-263`) y luego aparecen cards de altura variable; hay un pequeño shift. La dirección y el nombre no shiftean porque vienen de localStorage.
- **Offline:** el service worker no cachea navegación ni API (`public/sw.js:14-22`); `/profile` offline muestra error del navegador. `refetchOnReconnect` sí está activo (`QueryProvider.tsx:14`), pero no hay UI de offline.

### 6.2 Quick wins

| Quick win | Impacto | Esfuerzo |
|---|---|---|
| Proyección mínima en `getByCustomer` (sin `paymentReceipt`) + `limit`/cursor | Reduce 2,5 MB a KB; elimina PII innecesaria | Bajo |
| Índice `(customer_id, created_at DESC)` y `(order_id)` | Evita full scan | Bajo |
| `Promise.all` en `order.getById` | Menos latencia en "Ver pedido" | Bajo |
| Formateador único de fecha/moneda (`Intl`) a nivel módulo | Menos CPU y consistencia | Bajo |
| Reset del modal al cerrar / montarlo solo al abrir | Evita estado viejo y baja JS inicial | Bajo |
| Prefetch de `order.getByCustomer` al tocar el tab Perfil | Historial instantáneo | Bajo |
| `isError`/`refetch` + estado offline | Evita "No tienes pedidos" falso | Bajo |
| Limpiar carrito/caché/`qs_session` en logout | Privacidad y coherencia | Bajo |
| `customer.me` con proyección y sin `fcmToken` | Menos PII local | Medio |

### 6.3 Profundo

- Autenticación real (OTP) + sesiones revocables/rotativas + rate limiting.
- Capa de ownership reutilizable para pedidos, clientes, SSE y comprobantes.
- Tabla `addresses` con default/múltiples y migración del campo `customers.address`.
- Pipeline de eliminación de cuenta: soft delete, anonimización, retención fiscal, revocación de tokens y job asíncrono.
- Paginación/virtualización del historial y separación del comprobante en endpoint aparte.
- Unificar el design system (tokens, radios, tipografía, legales) y el estado de pedidos.

---

## 7. Duplicados y deuda técnica

| Elemento duplicado | Ubicaciones | Riesgo |
|---|---|---|
| Traducción/estado de pedido | `Profile.tsx:55-63`; `ProfileOrdersModal.tsx:64-113`; `OrderTracking.tsx:40-47`; `Commerce/Orders.tsx:96`; `Admin/Orders.tsx:41`; `DriverHistory.tsx:17` | Divergencia y estados en inglés; un cambio exige tocar 6 archivos |
| Formato de moneda/fecha | `Profile.tsx:291-299`; `ProfileOrdersModal.tsx:293-330`; `OrderTrackingDetails.tsx:54-88`; `Cart.tsx:280,359-367` | Distintos decimales/fechas/moneda |
| Card de pedido | Preview en `Profile.tsx:271-304`; card del modal `ProfileOrdersModal.tsx:271-341` | Dos layouts y dos navegaciones que pueden divergir |
| Logout/sesión | `useCustomerSession.logout`; `useDeliveryData.handleAuthError:11-31`; `providers/trpc.handleAuthError:10-22`; `AdminLayout.tsx:23`; `CommerceLayout.tsx:49`; `DriverProfile.tsx:89`; `Dashboard.tsx:95` | Unos limpian `customer_session`, otros no; redirects distintos (`/login` vs `/customer-login`) |
| Refresh | `App.tsx:67-79` cada 9 min; `useCustomerSession.tsx:114-120` cada 10 min | Dos intervalos y cookies reemitidas sin coordinación |
| QueryClient | `providers/trpc.tsx:24-47` (30 s/10 min) y `QueryProvider.tsx:6-19` (5 min/30 min) | Configuraciones divergentes; riesgo de caché duplicada |
| Bottom nav | Repetido en Home, Search, Cart, Profile, CommerceDetail | Cambios de navegación en 5 lugares |
| Bottom sheet | `ProfileOrdersModal` y `CartAddressModal` (overlay, handle, close, max-height) | Correcciones de accesibilidad duplicadas |
| PWA | `PWAInstallBanner.tsx` + `usePWAInstall.ts` + registro de SW en `index.html:41-45` | Banner y hook muertos; instalación sin UI |
| Auth legacy | `useAuth.ts` + `AuthLayout.tsx` + `AuthLayoutSkeleton.tsx` | No están ruteados; dead code |
| Legal layout | `LegalHub.tsx` y `DeleteAccount.tsx` (header verde, back, cards) | Dos copias del mismo layout legado |
| Estados muertos | `in_transit`, `in_preparation`, `confirmed` en `Profile.tsx:58-62`; `confirmed` en modal | Ramas que nunca se ejecutan con el enum actual |

**Build/tests:** `npm run check` falla (entre otros, `PageTransition.tsx:17,51` y `DeleteAccount.tsx:3`); `npm test` sale con "No test files found" (código 1); ESLint marca empty catches en `Profile.tsx:109,131`, `useCustomerSession.tsx:80,91,109` y `no-explicit-any` en `Profile.tsx:271`.

---

## 8. Plan de verificación reproducible

> Usar dos clientes de prueba A y B con teléfonos distintos. No registrar PII real. Ejecutar `npm run dev` y abrir `http://localhost:3000` en 390×844; repetir en 320, 375 y 430 px.

### 8.1 Happy path

1. Limpiar storage; registrar A con teléfono único y dirección.
2. Verificar en Network: `customer.register` 200, `Set-Cookie` de `quickgo_token` y `refresh_token`; `customer.checkAuth` 200; `order.getByCustomer` 200.
3. Ir a `/profile`: debe renderizar sin spinner (hidratación local) y mostrar nombre, teléfono y dirección.
4. Editar dirección → `customer.update` 200; recargar y verificar persistencia; volver a Home y comprobar que `HomeHeader` muestra la nueva dirección.
5. Crear 3+ pedidos; verificar preview de 2, contador "Ver todos (N)" y modal.
6. Abrir `/legal`, `/boton-de-arrepentimiento`, `/eliminar-cuenta` desde el perfil.

**Resultado esperado:** todo lo anterior funciona; los P0/P1 de esta auditoría no se ven en el happy path.

### 8.2 Logout (crítico)

1. Con A logueado, agregar un ítem al carrito.
2. Anotar en DevTools → Application → Local Storage: `customer_session`, `qs_session`, `cart`, `pwa_dismissed`.
3. Click "Salir".
4. Verificar:
   - `customer_session` se elimina.
   - `qs_session` **sigue presente** (bug F-06).
   - `cart` **sigue presente** (bug F-06).
   - La caché de React Query conserva `order.getByCustomer` (bug F-06).
   - `POST /api/trpc/customer.logout` 200 y cookies `quickgo_token`/`refresh_token` eliminadas.
5. Navegar atrás a `/profile`: se observa spinner de 600 ms y luego el fallback "Inicia sesión" en vez de redirect a `/customer-login` (bug F-06/F-07).
6. Esperar 9-10 min con la pestaña abierta: `login.refresh` y `customer.refresh` siguen ejecutándose por `qs_session` y por el intervalo del provider (F-36).

**Esperado correcto:** logout local inmediato, `qs_session` y carrito borrados, caché limpiada, `navigate(...,{replace:true})`, cookies y refresh revocados, sin intervalos residuales.

### 8.3 Sesión expirada/revocada

1. Con A logueado, borrar las cookies `quickgo_token` y `refresh_token` en DevTools (Application → Cookies).
2. Recargar `/profile`.
3. Actual: `customer.checkAuth` responde `{customer:null}` pero la UI sigue mostrando el perfil completo desde `localStorage` (F-07).
4. Esperado: logout local + redirect a `/customer-login` y limpieza de PII.

### 8.4 Cambio de usuario en el mismo dispositivo

1. Con A logueado y carrito con ítems, abrir directamente `/customer-login`.
2. Iniciar sesión como B.
3. Actual: el carrito de A sigue; la caché de queries de A sigue en memoria; `qs_session` se sobrescribe (F-14).
4. Repetir con registro: registrar el teléfono de A con otro nombre desde incógnito. Actual: devuelve la sesión de A (F-01). Esperado: 409 "teléfono ya registrado".
5. Verificar que no se puede acceder a datos de A desde la sesión de B (hoy sí por F-02/F-03).

### 8.5 IDOR (sin cookies)

Ejecutar sin cookies desde una terminal:

```bash
curl -i "http://localhost:3000/api/trpc/customer.list"
curl -i "http://localhost:3000/api/trpc/order.getByCustomer?input=%7B%22json%22%3A%7B%22customerId%22%3A1%7D%7D"
curl -i "http://localhost:3000/api/trpc/order.getById?input=%7B%22json%22%3A%7B%22id%22%3A1%7D%7D"
curl -N "http://localhost:3000/api/events/orders/1"
```

**Actual:** 200 con PII en los tres primeros; stream SSE en el cuarto. **Esperado:** 401/403 salvo token de tracking firmado y limitado.

Verificar también que `customer.list` expone `fcmToken` y que `paymentReceipt` viaja en el listado.

### 8.6 Eliminar cuenta

1. Ir a `/eliminar-cuenta`; completar nombre, teléfono y check.
2. En Network: **no debe aparecer ninguna request de baja** (actualmente no hay).
3. En Application → Local Storage: aparece `qs_deletion_requests` con nombre, teléfono y motivo (F-04).
4. Recargar `/profile`: la sesión sigue activa y el perfil se muestra.
5. En DB: `select id, phone, address from customers where phone = '<phone>';` → la fila sigue.
6. Esperado: request autenticada, estado "pendiente", revocación de tokens, anonimización y retención fiscal de pedidos.

### 8.7 Historial, estados y modal

1. Crear pedidos en todos los estados del enum (`received`, `accepted`, `preparing`, `ready_for_pickup`, `driver_assigned`, `picked_up`, `on_the_way`, `delivered`, `cancelled`, `payment_rejected`, `pending_payment`).
2. Abrir el modal y verificar labels: actualmente varios aparecen en inglés crudo (F-19).
3. Buscar por `#id` y por nombre de producto; probar filtros "Todos/Entregados/En proceso".
4. Cerrar, reabrir y verificar que búsqueda/filtro persisten (F-34).
5. Intentar operar el modal solo con teclado: Tab no enfoca las cards, Escape no cierra, el fondo scrollea (F-21).
6. Medir en Network el tamaño de `order.getByCustomer` con 1, 10 y 50 pedidos; comparar con el límite propuesto (F-09).

### 8.8 PWA, a11y y performance

1. Chrome → Application → Manifest: verificar instalabilidad; no hay banner ni botón en `/profile` (F-25).
2. Lighthouse mobile + axe DevTools en `/profile`: contraste, labels, targets, focus, reduced motion.
3. Emular `prefers-reduced-motion: reduce` y verificar que no haya animaciones (F-24).
4. 3G throttling + cache disabled: medir TTI y peso; el historial debe ser el principal costo (F-09).
5. `EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = <id> ORDER BY created_at DESC;` antes/después del índice propuesto.

### 8.9 Checks estáticos

```bash
npm run check   # actualmente falla
npm test        # actualmente "No test files found"
npx eslint src/pages/customer/Profile.tsx src/pages/customer/components/ProfileOrdersModal.tsx src/hooks/useCustomerSession.tsx
```

---

## 9. Anexo — Contratos API y tablas

### 9.1 Contratos exactos usados por `/profile`

> `trpcCall` usa `GET /api/trpc/<proc>?input=<superjson>`; `trpcMutate` usa `POST` con body superjson y `credentials: "include"` (`useDeliveryData.ts:33-72`).

| Procedimiento | Tipo | Input | Auth/ownership | Devuelve | Uso en `/profile` |
|---|---|---|---|---|---|
| `customer.checkAuth` | query | `{}` | Público; usa cookie de contexto | `{ customer: Customer o null }` — fila completa, incluye `fcmToken` | Hidratación/verificación en segundo plano |
| `customer.login` | mutation | `{ phone: string }` | Público | `{ success, customer }` + cookies | Entrada desde `/customer-login` |
| `customer.register` | mutation | `{ firstName, lastName, phone, address }` (min 1/1/6/1) | Público | `{ success, customer }`; si el teléfono existe, devuelve esa cuenta | Registro |
| `customer.update` | mutation | `{ firstName?, lastName?, phone?, address? }` (strings sin min/max) | `customerQuery` | Fila completa del cliente | Guardar dirección |
| `customer.logout` | mutation | `{}` | Público | `{ success: true }` + borra cookies de cliente | Salir |
| `customer.refresh` | mutation | `{}` | Público; lee `refresh_token` | `{ success, customer }` (proyección segura) | Refresh cada 10 min |
| `order.getByCustomer` | query | `{ customerId: number }` | **Público, sin ownership** | Array de órdenes completas + `items` | Historial del perfil |
| `order.getById` | query | `{ id: number }` | **Público, sin ownership** | Orden completa + `items`, `history`, `driver`, `commerces`, `commerceStatuses` | "Ver pedido" |
| `order.updateStatus` | mutation | `{ id, status enum, driverId?, notes? }` | **Público** | Orden actualizada | No se usa desde Profile, pero afecta el estado del historial |
| `customer.registerDeviceToken` | mutation | `{ token: string }` | `customerQuery` | `{ success }` | Push nativo (SessionGuard) |
| `login.logout` | mutation | `{}` | Público | Limpia cookies de admin/driver/merchant/customer | Usado por `handleAuthError` en 401 |
| **Borrado de cuenta** | — | — | — | **No existe** | `/eliminar-cuenta` solo localStorage |

### 9.2 Tablas relevantes

| Tabla | Columnas clave | Observaciones |
|---|---|---|
| `customers` | `id`, `firstName`, `lastName`, `phone UNIQUE`, `address TEXT`, `createdAt`, `fcmToken` | Sin email, sin `deletedAt`, sin `updatedAt`; una sola dirección de texto (`db/schema.ts:66-74`). |
| `orders` | `customerId FK`, `status enum`, `subtotal`, `deliveryFee`, `commission`, `total`, `paymentReceipt TEXT`, `deliveryAddress`, `customerPhone`, timestamps | `customerId` sin `onDelete`; sin `currency`; `paymentReceipt` puede ser base64 grande; sin índices (`db/schema.ts:159-178`). |
| `order_items` | `orderId FK CASCADE`, `productId FK`, `commerceId`, `productName`, `quantity`, `unitPrice`, `total` | Snapshot de nombre/precio; `orderId` sin índice (`db/schema.ts:184-194`). |
| `order_status_history` | `orderId FK CASCADE`, `status`, `notes`, `createdAt` | Historial; sin índice explícito (`db/schema.ts:202-208`). |
| `order_commerce_status` | `orderId`, `commerceId`, `status`, `updatedAt` | Estado por comercio (`db/schema.ts:211-217`). |
| `addresses` | — | **No existe**; no hay múltiples direcciones ni default. |
| `refresh_tokens` / `deletion_requests` | — | **No existen**; no hay revocación ni workflow de baja. |

### 9.3 Evidencia runtime (sin cookies)

Verificado el 13/11/2026 contra el servidor local `:3000`, sin enviar cookies:

```text
GET /api/trpc/customer.list
  → 200; 2 filas; keys: id, firstName, lastName, phone, address, createdAt, fcmToken

GET /api/trpc/order.getByCustomer?input={"json":{"customerId":1}}
  → 200; 5 pedidos; 2.534,4 KB; keys: ...deliveryAddress, customerPhone, paymentReceipt...
  → comprobante máximo: 2.591.923 caracteres

GET /api/trpc/order.getById?input={"json":{"id":1}}
  → 200; deliveryAddress presente, customerPhone presente; keys: items, history, driver, commerces...
```

No se imprimieron valores personales. Los IDs son de la base local de prueba.

### 9.4 Logs y PII

- No se encontraron logs explícitos de payloads con PII. `server/boot.ts:199-211` registra método/path y errores tRPC; `Register.tsx:87` registra el error, no el formulario.
- **Hipótesis:** errores de Postgres/Drizzle podrían incluir valores de parámetros en el log del servidor (`server/boot.ts:208-210`). No se verificó con un fallo provocado; revisar la política de logging antes de producción.

### 9.5 Criterio de cierre sugerido

- **No desplegar** hasta resolver F-01 a F-05.
- Antes de un beta cerrado: F-06 a F-14, F-21, F-22 y F-09.
- Antes de GA: F-15 a F-32 y pruebas E2E de logout, cambio de usuario, IDOR y eliminación de cuenta.