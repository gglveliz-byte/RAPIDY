# Auditoría consolidada del Negocio — Rapidy

**Fecha:** 2026-11-13  
**Alcance:** `/login`, `/commerce`, `/commerce/orders`, `/commerce/products`,
`/commerce/stats`, `/commerce/profile`, sus hooks, procedimientos tRPC, SSE,
cookies, tablas e integración con el flujo Cliente.

> **Este documento es un consolidado de auditoría, no un backlog.**
> Reúne los 6 reportes, elimina duplicados y define el orden de corrección.
> No se modificó código durante la auditoría.

## 1. Fuentes

| Ruta | Reporte | Hallazgos |
|---|---|---|
| `/login` | [`login.md`](./login.md) | 26 (1 P0, 11 P1, 14 P2) |
| `/commerce` | [`dashboard.md`](./dashboard.md) | 27 (1 P0, 12 P1, 15 P2) |
| `/commerce/orders` | [`orders.md`](./orders.md) | 23 (2 P0, 8 P1, 13 P2) |
| `/commerce/products` | [`products.md`](./products.md) | 21 (1 P0, 6 P1, 14 P2) |
| `/commerce/stats` | [`stats.md`](./stats.md) | 18 (1 P0, 8 P1, 9 P2) |
| `/commerce/profile` | [`profile.md`](./profile.md) | 25 (1 P0, 13 P1, 11 P2) |
| **Total bruto** | | **140** |

Al consolidar se eliminan duplicados entre rutas. El resultado son **33 problemas
únicos**: **6 P0**, **16 P1** y **11 P2**.

## 2. Resumen ejecutivo

El negocio **sí tenía errores propios**, y algunos son más graves que los del
cliente porque tocan dinero, estados de pedido y sesión:

1. **La sesión del negocio se cae al recargar o navegar.** El provider global de
   cliente borra/reescribe `qs_session`; el guard merchant lo exige y termina
   expulsando al usuario aunque la cookie HttpOnly siga válida.
2. **El logout del negocio cierra la sesión del cliente** y puede vaciar su
   carrito, porque `login.logout` limpia cookies de los cuatro roles y el 401
   global hace lo mismo.
3. **`markReady` puede revivir pedidos cancelados, entregados o con pago
   rechazado**, alterando la máquina de estados y las ventas.
4. **Un pedido con pago rechazado aparece como “En Preparación”** y permite
   marcarse “Listo”: el comercio puede preparar y despachar un pedido impago.
5. **Un comercio suspendido puede reactivarse solo** enviando
   `commerce.update({ status: "active" })`.
6. **Los precios de producto no se validan en servidor**: negativos, cero, `NaN`
   o exponenciales llegan al quote, a la comisión y a las estadísticas.
7. **Las métricas no son confiables**: N+1, gráfico histórico disfrazado de “7
   días”, comisión recalculada con la tasa actual y `topProducts` roto.
8. **El catálogo puede corromperse desde la UI**: `ProductModal` conserva el
   producto anterior y puede sobrescribir otro.
9. **La vitrina pública permite abrir comercios suspendidos/cerrados** por URL
   directa y agregar productos que el checkout rechazará.
10. **No hay rate limit en el login** y el `.env.example` publica credenciales
    admin de ejemplo.

## 3. Problemas consolidados

### 3.1 P0 — bloqueantes

| ID | Problema | Fuentes | Archivos clave | Corrección |
|---|---|---|---|---|
| **C-01** | Colisión de sesión multi-rol: `CustomerSessionProvider` borra/reescribe `qs_session`; el guard merchant exige ese marcador y expulsa al negocio tras reload, pestaña nueva o navegación. | LOG-01, LOG-07, LOG-09, LOG-10, LOG-12, LOG-25; DASH-03; PROF-05, PROF-06; ORD-19; PROD-04; STAT-17 | `src/hooks/useCustomerSession.tsx:79-99`; `src/components/SessionGuard.tsx:15-22,76-80`; `src/hooks/useDeliveryData.ts:121-164`; `src/hooks/useSessionSync.ts:27-42` | Cookie como fuente de verdad para todos los roles. Provider customer no toca la sesión profesional. Guard cookie-first + rehidratación. Eliminar fallback por nombre y validar `commerceId` contra `commerce.me`. |
| **C-02** | Logout/401 global cierra la sesión del cliente y del negocio. `login.logout` limpia cookies de admin, driver, merchant y customer; `handleAuthError` lo invoca ante cualquier 401. | LOG-02, LOG-23; PROF-02, PROF-03; DASH-13 | `server/login-router.ts:125-131`; `src/hooks/useDeliveryData.ts:13-29`; `src/providers/trpc.tsx:12-28`; `src/components/CommerceLayout.tsx:68-77`; `src/pages/commerce/Profile.tsx:209-214` | Logout role-scoped (`scope` explícito). El 401 limpia solo el rol de la superficie. Limpiar React Query y tokens push. No despachar `rapidy:logout` desde el guard merchant. |
| **C-06** | `markReady` no valida el estado global: puede devolver a `ready_for_pickup` un pedido `cancelled`, `delivered` o `payment_rejected`. | ORD-01; STAT-01; F-01 | `server/commerce-router.ts:218-283`; `server/order-router.ts:219-276,704-709` | Un único servicio `markCommerceReady`; bloquear fila; permitir solo `received`/`accepted`/`preparing`; rechazar terminales y pago rechazado; idempotente y sin eventos si no cambia. |
| **C-07** | Pedidos con pago rechazado se listan como preparación y permiten “Listo”; las transferencias pendientes son invisibles. | ORD-02, ORD-03; DASH-09; F-12 | `server/order-router.ts:324-386,735,764`; `src/pages/commerce/Orders.tsx:80`; `CommerceOrderCard.tsx:225-244` | Incluir estado de pago en la proyección; bloquear acciones si `pending_payment`/`payment_rejected`; mostrar “Pago pendiente/rechazado”. Decidir y documentar visibilidad de transferencias. |
| **C-12** | Auto-reactivación: `commerce.update` acepta `status` y lo escribe sin rol admin. Un comercio suspendido/inactivo vuelve a `active`. | DASH-15; PROF-01; F-02 | `server/commerce-router.ts:86-126` (`:99,:116-122`) | Quitar `status` del input merchant. Solo admin cambia estado. `toggleStatus` solo opera `isOpen` y rechaza comercios no activos. |
| **C-15** | Precio de producto sin validación server-side: acepta negativos, cero, `NaN`, exponenciales y fuera de rango. Contamina quote, comisión y stats. | PROD-01; F-03 | `server/product-router.ts:153-240`; `server/order-router.ts:145-146`; `src/components/commerce/ProductModal.tsx:157-166` | Zod decimal positivo, máximo acorde a `numeric(10,2)`, sin exponenciales. Defensa en `quote/create`. Error inline en modal. |

### 3.2 P1 — operación, datos y seguridad

| ID | Problema | Fuentes | Archivos clave | Corrección |
|---|---|---|---|---|
| **C-03** | Login sin rate limit, bloqueo, backoff ni auditoría; enumeración por timing de `bcrypt`. | LOG-03; F-09 | `server/login-router.ts:29-102` | Rate limit por IP+email, backoff, hash dummy para emails inexistentes, longitudes máximas, registro de fallos. |
| **C-04** | `.env.example` publica `APP_SECRET` y credenciales admin débiles; `REQUISITOS.md` publica credenciales; `login.seedAdmin` es público. | LOG-04, LOG-05 | `.env.example:3,10-11`; `REQUISITOS.md:179`; `server/login-router.ts:104-107`; `src/pages/Login.tsx:192` | Quitar secretos/credenciales útiles, rechazar placeholders en producción, eliminar `seedAdmin` público, placeholder genérico. |
| **C-05** | `login.login` limpia cookies profesionales antes de validar credenciales; un typo cierra la sesión. `/login` no redirige a sesión activa. | LOG-06 | `server/login-router.ts:38-40`; `src/pages/Login.tsx` | Validar primero; emitir cookie solo tras éxito; no tocar cookies en fallo; redirigir `/login` si ya hay sesión. |
| **C-08** | Todo pedido nace `order_commerce_status = "preparing"`; “Recibidos” nunca cuenta y no se puede aceptar/rechazar. Estados globales y por comercio divergen. | ORD-04, ORD-05, ORD-14, ORD-15; DASH-04, DASH-08; F-04, F-05 | `server/order-router.ts:369-376,764`; `db/schema.ts:34-38,247`; `Orders.tsx:48-55,80,93-116`; `CommerceOrderCard.tsx:34-42`; `Dashboard.tsx:45-56,99`; `CommerceLayout.tsx:51-54` | Añadir `received`/`accepted` al enum por comercio o derivar de `orders.status` hasta aceptación; una sola función de estado visible; usar `ORDER_STATUS_META`; tabs/conteos/badges desde la misma fuente. |
| **C-09** | Multi-comercio: cualquier merchant participante puede cambiar el estado global o cancelar todo; `updateStatus` permite `ready_for_pickup` sin sincronizar estados por comercio. | ORD-07 | `server/lib/order-access.ts:76-93`; `contracts/orderStatus.ts:196-214`; `server/order-router.ts:561-702` | Separar acciones por comercio de acciones globales. Merchant solo acepta/prepara/cancela su parte; `ready_for_pickup` global solo con `allReady`; bloquear fila. |
| **C-10** | El canal `commerce:` no emite cancelaciones del cliente/admin, asignación, retiro ni entrega; Dashboard/Stats no escuchan SSE. | ORD-06; DASH-10; PROF-08; STAT-08; PROD-10; F-17 | `server/order-router.ts:681-699`; `server/admin/orders-router.ts:287-300`; `server/driver-router.ts:349-354`; `src/hooks/useOrderEvents.ts:152-169`; `src/pages/customer/CommerceDetail.tsx:85-86` | Emitir evento ligero a cada `commerce:{id}` en toda transición; invalidar pedidos, productos, stats y comercio; cliente usa `products:global`, no canal merchant. |
| **C-11** | `getCommerceOrders` carga toda la tabla `customers`, todos los items históricos y todos los pedidos sin orden, límite ni paginación; devuelve PII y metadata innecesaria. | ORD-08, ORD-11, ORD-12; DASH-11, DASH-24; F-06 | `server/order-router.ts:711-769` | Filtrar customers por `inArray`; proyección explícita; `ORDER BY created_at DESC`; paginación; endpoint ligero de conteo para el badge. |
| **C-13** | Dashboard y vitrina ignoran `commerce.status`: un comercio `pending`/`suspended` se ve “Abierto” y puede abrirse por URL directa con productos. | DASH-04, DASH-26; PROF-15, PROF-21; PROD-06; F-15 | `Dashboard.tsx:96,130-147`; `server/commerce-router.ts:44-60`; `server/product-router.ts:64-75`; `CommerceDetail.tsx:147-162,312-319` | Banner por `status + isOpen`; `getById`/`getByCommerce` filtran `active` para no-owner; detalle cliente deshabilita agregar si cerrado. |
| **C-14** | Stats no confiables: N+1, “7 días” histórico, agrupación por `createdAt`/TZ, `topProducts` sin `id`, catálogo activo incluye pausados, comisión recalculada con tasa actual, etiquetas incorrectas, sin SSE. | STAT-02…STAT-18; DASH-05, DASH-06, DASH-12, DASH-27; F-11, F-18 | `server/commerce-router.ts:146-216`; `Stats.tsx`; `Dashboard.tsx:103-123,209-271`; `server/order-router.ts:336` | Una consulta agregada; ventana real de 7 días por fecha de entrega; `productId/sales/revenue/unitPrice`; `availableProducts`; comisión snapshot por comercio; formato monetario único; invalidación/SSE. |
| **C-16** | `ProductModal` conserva el producto anterior: primera edición vacía y ediciones cruzadas que sobrescriben otro producto. | PROD-02; F-07 | `ProductModal.tsx:74-86`; `Products.tsx:383-392` | `key={editing?.id ?? "new"}` o reset con `useEffect`; resetear `activeImageTab`; prueba crear→editar A→editar B. |
| **C-17** | Imágenes base64 sin límite de tamaño/MIME real, guardadas en `text` y devueltas completas en listados. | PROD-03; PROF-09; F-10 | `ProductModal.tsx:55-62,94-104`; `Profile.tsx:176-190`; `server/product-router.ts:160,200`; `server/commerce-router.ts:95-96`; `db/schema.ts:123-124,156`; `server/boot.ts:41` | Validar MIME/tamaño cliente y servidor; comprimir/redimensionar; límite por campo; proyección sin imagen completa en listados. |
| **C-18** | Catálogo sin errores visibles: fallo de carga se muestra como catálogo vacío; toggle sin pending/feedback; borrado con FK devuelve 500 porque revisa `err.code` en vez de `err.cause.code`. | PROD-05, PROD-08, PROD-09, PROD-17, PROD-18 | `useDeliveryData.ts:210-217`; `Products.tsx`; `product-router.ts:258-267` | Exponer `error/refetch`; error distinto del vacío; pending por fila; `err.cause?.code`; toast/errores inline; guard de reentrada. |
| **C-19** | Perfil: borra `commerces.email` en cada guardado, inyecta Quito por defecto y lo persiste, no valida campos, toggle no atómico, cambios se pierden al refetch, Nominatim duplicado. | PROF-10…PROF-14, PROF-22, PROF-23 | `Profile.tsx:82-86,126-190,209-214`; `server/commerce-router.ts:90-103`; `useGeocode.ts` | No enviar `email`; no inyectar lat/lng por defecto; validación Zod y longitudes; toggle atómico; separar dirty state; reutilizar `useGeocode` con abort/caché. |
| **C-20** | Identidad del comercio desde `merchant_user.name/email`; nombre del local no se actualiza tras renombrar; email read-only no es el real. | DASH-01; PROF-24; LOG-14 | `Dashboard.tsx:76-82`; `CommerceLayout.tsx:56-66`; `Profile.tsx:82-84`; `login-router.ts:57` | Usar `commerce.me`/`useCommerce` como fuente de nombre; email desde `checkAuth`; normalizar email en login/admin. |
| **C-21** | Carrito conserva precio/unidad viejos; quote cobra los nuevos; cambio `unit`↔`kg` reinterpreta la cantidad. | PROD-07 | `Cart.tsx:67-73,315-332`; `order-router.ts:145-146,348-357`; `Products.tsx:99-114` | Renderizar líneas desde `quote.data.lines` o refrescar snapshot; avisar cambio de precio/unidad; confirmar cambio de unidad. |
| **C-28** | Política de tokens inconsistente y sin revocación: merchant 24 h/7 d vs customer 15 min/365 d; refresh robado válido tras logout. | LOG-11, LOG-22 | `server/merchant-auth.ts:9-10`; `server/customer-auth.ts:9-10`; `server/admin-auth.ts:9`; `src/App.tsx:66-79` | Alinear/ documentar TTL; `sessionVersion` merchant; validar `setMerchantCookie`; refresh coordinado por pestaña. |

### 3.3 P2 — UX, accesibilidad, consistencia y rendimiento

| ID | Problema | Fuentes | Corrección |
|---|---|---|---|
| **C-22** | Inconsistencias visuales: clases Tailwind inexistentes (`w-8.5`, `h-9.5`, `w-18`, `p-4.5`, `h-13`), hardcodes de marca, contraste bajo, targets <44 px, modales sin semántica/focus trap, switches `<div>`. | LOG-17…LOG-20; DASH-19, DASH-22, DASH-23; PROF-17…PROF-19, PROF-25; PROD-11…PROD-14, PROD-20; ORD-17; STAT-15 | Usar escala válida/tokens; targets ≥44 px; `role=dialog`, labels, focus trap, Escape, scroll lock; switches `<button role=switch>`; contraste AA; `motion-reduce`. |
| **C-23** | Errores/loading/vacío confundidos: fallos de red/403 se muestran como “sin datos”; falta retry; flash de estado cerrado/vacío. | DASH-16, DASH-17; ORD-09; PROD-05; STAT-11, STAT-12; PROF-07, PROF-20 | Exponer `error/isError/refetch`; skeletons; empty state solo con éxito; errores inline/toast; no borrar sesión por fallo de red. |
| **C-24** | `/commerce/foo` cae en `/commerce/:id` (guard cliente) y expulsa al merchant borrando su sesión. | DASH-14; F-13 | Catch-all `commerce/*` o restringir `:id` a numérico; mover vitrina a `/store/:id` si hace falta. |
| **C-25** | Login: validación de contraseña vacía, errores genéricos, sin timeout, `localStorage` dentro del try de auth. | LOG-16 | Validar cliente; mapear errores; `AbortController`; separar persistencia local. |
| **C-26** | Multi-comercio: login y `commerce.me` toman `rows[0]`; no hay selección de sucursal. | LOG-13 | Definir contrato: unicidad o selector determinista; invalidar caché al reasignar. |
| **C-27** | Logout no revoca token FCM del merchant; dispositivo sigue recibiendo pedidos. | LOG-26 | `commerce.unregisterDeviceToken` + limpiar en logout; tokens por dispositivo. |
| **C-29** | Búsqueda de pedidos no normaliza `#` ni teléfonos locales. | ORD-16 | Normalizar consulta, id numérico y sufijo telefónico. |
| **C-30** | “Rechazar” cancela sin confirmación ni motivo; no muestra `cancellationReason/cancelledBy`. | ORD-10, ORD-22 | Modal con motivo; enviar `cancellationReason`; mostrar en tarjeta. |
| **C-31** | Dos endpoints `markReady` con distinto error/evento; `order.updateStatus` no acepta `payment_rejected`. | ORD-13, ORD-23; F-19 | Un servicio canónico; compartir `ORDER_STATUSES` y `canTransition`. |
| **C-32** | Admin puede forzar transiciones sin `canTransition`, contaminando métricas. | STAT-03 (nota), ORD-23 | Reutilizar contrato también en admin o documentar excepciones. |
| **C-33** | Sin tests de negocio: no hay unitarios de precio/modal/ownership ni E2E merchant. | Todos; F-20 | Añadir tests de contrato y smoke E2E merchant; matriz de sesión multi-rol. |

## 4. Duplicados entre reportes

| Tema | IDs que lo reportan |
|---|---|
| Sesión / `qs_session` / `commerceId` | LOG-01, LOG-07, LOG-08, LOG-09, LOG-10, LOG-12, LOG-25; DASH-03; PROF-05, PROF-06; ORD-19; PROD-04; STAT-17 |
| Logout / 401 global | LOG-02, LOG-23; PROF-02, PROF-03; DASH-13 |
| `markReady` revive terminales | ORD-01; STAT-01; F-01 |
| Auto-reactivación | DASH-15; PROF-01; F-02 |
| Pedidos nacen `preparing` / estados | ORD-04, ORD-05, ORD-14, ORD-15; DASH-04, DASH-08; F-04, F-05 |
| Transferencias / pago rechazado | ORD-02, ORD-03; DASH-09; F-12 |
| `getCommerceOrders` pesado/PII | ORD-08, ORD-11, ORD-12; DASH-11, DASH-24; F-06 |
| Stats / comisión / topProducts | DASH-05, DASH-06, DASH-12, DASH-27; STAT-02…STAT-18; F-11, F-18 |
| Imágenes | PROD-03; PROF-09; DASH-21; F-10 |
| Vitrina pública / status | DASH-26; PROF-15, PROF-21; PROD-06; F-15 |
| SSE | ORD-06; DASH-10; PROF-08; STAT-08; PROD-10; F-17 |
| Tailwind / visual | LOG-20; DASH-19; PROF-17, PROF-18; PROD-13 |

## 5. Integración con el flujo Cliente

| Problema | Efecto en el cliente | Corrección obligatoria |
|---|---|---|
| Sesión compartida `qs_session` | Un login/logout de un rol expulsa al otro; el carrito puede vaciarse por un evento ajeno | C-01, C-02 |
| `markReady` revive terminales | El cliente ve “Listo”/“En camino” en un pedido cancelado o entregado | C-06 |
| Pago rechazado accionable | El comercio prepara un pedido impago; el cliente espera un pedido que no debería avanzar | C-07 |
| Transferencias invisibles | El cliente paga y el comercio nunca ve el pedido hasta que un admin lo aprueba | C-07 |
| Estados divergentes | Cliente ve `received/accepted/driver_assigned`; comercio ve `preparing/ready` | C-08 |
| Multi-comercio | Un comercio marca listo/cancela todo antes que los demás | C-09 |
| SSE incompleto | Cliente y comercio ven datos viejos; `CommerceDetail` recibe 401 en bucle | C-10 |
| Vitrina sin status | Cliente abre comercio suspendido/cerrado y agrega productos que el quote rechazará | C-13 |
| Carrito vs quote | Cliente ve un total y paga otro; cambio de unidad reinterpreta la cantidad | C-21 |
| Logout cruzado | El cliente pierde sesión/carrito cuando el negocio cierra sesión | C-02 |
| Comisión histórica | La liquidación del comercio cambia retroactivamente; afecta confianza y reportes | C-14 |
| Imágenes enormes | Home/Search/detalle descargan base64 pesados; experiencia móvil degradada | C-17 |

## 6. Plan de corrección

### Fase 1 — P0 (primero, sin excepción)

1. **C-01** Sesión cookie-first y aislamiento de roles.
2. **C-02** Logout/401 role-scoped y limpieza de caché.
3. **C-06** Estado seguro de `markReady`.
4. **C-07** Pago rechazado/pendiente no accionable.
5. **C-12** Quitar `status` del update merchant.
6. **C-15** Validación de precios.
7. **C-03/C-04** Rate limit de login, secretos y `seedAdmin`.

### Fase 2 — P1 de operación y datos

1. **C-08** Estado por comercio (`received/accepted`) y mapas únicos.
2. **C-09** Permisos multi-comercio.
3. **C-11** `getCommerceOrders` con proyección, orden, filtro y paginación.
4. **C-10** SSE completo para comercio y cliente.
5. **C-14** Stats: agregación única, 7 días reales, comisión snapshot, `topProducts`.
6. **C-16/C-17** Modal de producto e imágenes.
7. **C-19/C-20** Perfil, email, coordenadas y nombre.
8. **C-21** Carrito desde quote.
9. **C-13** Vitrina pública y estados.
10. **C-18/C-23** Errores y feedback.
11. **C-05/C-28** Login, refresh y revocación.

### Fase 3 — P2 de acabado

- C-22 visual/accesibilidad.
- C-24 routing.
- C-25 login UX.
- C-26 multi-sucursal.
- C-27 push.
- C-29 búsqueda.
- C-30 cancelación con motivo.
- C-31/C-32 contrato único.
- C-33 tests.

## 7. Cambios de base de datos previstos

> Requieren migración revisada y aplicada; no ejecutar sin confirmar el SQL.

| Cambio | Motivo | Riesgo |
|---|---|---|
| `order_commerce_status_enum` + `received`, `accepted` | Estado real por comercio y tab “Recibidos” | Bajo; enum additive |
| `orders.delivered_at timestamptz` | Métricas por fecha de entrega real | Bajo; nullable |
| `order_commerce_status.commission_amount numeric(10,2)` | Comisión histórica por comercio | Bajo; nullable + backfill |
| Índice `order_items(commerce_id, order_id)` | Agregación y consulta por comercio | Bajo |
| `users.session_version integer default 0` | Revocación de sesión merchant | Medio; tokens deben incluir versión |

## 8. Verificación obligatoria

```bash
npx tsc -b --force
npm test
npm run lint
npm run build
npm run db:generate
npm run db:migrate
node scripts/e2e-smoke.mjs
node scripts/admin-smoke.mjs
npx tsx scripts/redirect-smoke.ts
```

### Nuevas pruebas necesarias

- E2E merchant: login → dashboard → pedido → aceptar/preparar/listo → stats →
  producto → perfil → logout.
- Matriz de sesión: merchant+merchant, merchant+customer, customer+merchant,
  merchant+admin; reload y pestaña nueva.
- Seguridad: precio negativo/cero/NaN; `status` ignorado; `markReady` sobre
  `cancelled`/`delivered`/`payment_rejected`; 401/403 por rol; SSE sin cookie.
- Integración: pedido cash/transfer/rechazado; multi-comercio; carrito con precio
  cambiado; comercio cerrado/suspendido; evento de producto en Home/Search.
- Regresión cliente: `scripts/e2e-smoke.mjs` 10/10 y `redirect-smoke`.

## 9. Lo que no se debe romper

- Ownership server-side en `commerce.*`, `product.*` y `order.getCommerceOrders`.
- `paymentReceipt` fuera de las respuestas del negocio y del cliente.
- Filtros públicos de catálogo (`active`, `open`, `isAvailable`).
- Quote/create autoritativos y snapshot de `order_items`.
- Transiciones de `contracts/orderStatus.ts`.
- SSE autenticado y evento nombrado `update`.
- Cookies HttpOnly, `SameSite=Lax` en localhost y `Secure` fuera.
- Un solo `QueryClient`; no crear otro.
- Leaflet solo en chunks lazy.
- Polling de 30 s como respaldo, no 4–5 s.
- `order_items.commerce_id` como frontera multi-comercio.
- Comisión y estado solo editables por admin.

## 10. Estado de corrección (2026-11-13)

Los P0 y P1 se corrigieron y verificaron. Evidencia completa en
[`../VERIFICATION.md`](../VERIFICATION.md).

| Problema | Estado | Evidencia |
|---|---|---|
| C-01 sesión multi-rol / `qs_session` | Corregido | `SessionGuard` cookie-first; `useCustomerSession` no toca sesión profesional; E2E reload |
| C-02 logout/401 global | Corregido | `login.logout { scope }`; 401 role-scoped; E2E logout merchant no borra cookies customer |
| C-03 rate limit login | Corregido | 8 fallos/10 min + bloqueo 15 min; hash dummy; `login.seedAdmin` eliminado |
| C-06 `markReady` revive terminales | Corregido | `server/lib/order-ready.ts`; E2E rechaza `cancelled`/`payment_rejected` |
| C-07 pago rechazado/pendiente | Corregido | proyección por comercio + tarjeta bloquea acciones |
| C-08 estados por comercio | Corregido | enum `received`/`accepted`; backfill; tabs y badge únicos |
| C-09 multi-comercio | Corregido | merchant path solo sobre sus items; cancelación multi-comercio bloqueada |
| C-10 SSE incompleto | Corregido | layout SSE; eventos a `commerce:` en cancelación/admin/retiro |
| C-11 `getCommerceOrders` pesado/PII | Corregido | límite, orden, customers filtrados, proyección explícita |
| C-12 auto-reactivación | Corregido | `status` fuera de `commerce.update`; E2E status sigue `active` |
| C-13 vitrina sin status | Corregido | `getById`/`getByCommerce` filtran `active`; cerrar deshabilita agregar |
| C-14 stats/comisión | Corregido | consulta única, 7 días reales, `delivered_at`, snapshot por comercio |
| C-15 precios | Corregido | Zod positivo/máximo; E2E -5 y 0 rechazados |
| C-16 ProductModal | Corregido | reset por apertura + `key` lógica |
| C-17 imágenes | Corregido | compresión cliente + límite servidor |
| C-18 errores catálogo | Corregido | `error/refetch`, error inline, FK `err.cause.code` |
| C-19 perfil | Corregido | email no se envía, coordenadas opcionales, toggle atómico |
| C-20 identidad/nombre | Corregido | layout y dashboard usan `commerce.me` |
| C-21 carrito vs quote | Corregido | líneas desde `quote.data.lines` + aviso de cambio |
| C-24 routing `/commerce/foo` | Corregido | vitrina en `/store/:id`; legacy redirect; E2E no expulsa |
| C-30 rechazo con motivo | Corregido | modal de confirmación + `cancellationReason` |
| C-33 E2E negocio | Corregido | `scripts/e2e-commerce-smoke.mjs` 20/20 |

El flujo actual queda cerrado y verificado. El comportamiento vigente de
multi-sucursal, TTL de tokens y acabado visual está documentado en `README.md`,
`FILE_MAP.md` y `VERIFICATION.md` como estado actual del sistema, no como una
lista de tareas.
