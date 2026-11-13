# Auditoría consolidada Rapidy — 6 rutas críticas

> **Este documento no es una lista de tareas.** Registra correcciones ya realizadas y verificadas.
> No implementes funcionalidades nuevas ni cambios de alcance sin pedido explícito.
> Estado actual del flujo: [`docs/customer/README.md`](../customer/README.md).

**Fecha:** 2026-11-13  
**Alcance:** `/home`, `/search`, `/cart`, `/order/:id`, `/chat/:orderId`, `/profile`.  
**Reportes individuales (evidencia línea a línea):**

- `docs/audit/home.md`
- `docs/audit/search.md`
- `docs/audit/cart.md`
- `docs/audit/order.md`
- `docs/audit/chat.md`
- `docs/audit/profile.md`

---

## 1. Resumen ejecutivo

La app tenía **fallos críticos de autorización** (IDOR, mutaciones públicas, chat y SSE sin autenticar), **manipulación de precios** en el checkout, **account takeover** por login solo con teléfono y **baja de cuenta simulada** en `localStorage`. También había bugs funcionales claros: la búsqueda de productos de `/home` no se renderizaba, `/search` solo buscaba 8 productos destacados, el SSE del driver nunca recibía eventos, el mapa usaba tiles que exigen API key y el historial de `/profile` mostraba estados en inglés.

**Estado actual:**

- `tsc -b` compila **sin errores**.
- `npm test`: **9/9 tests** pasan.
- `npm run build`: **OK**.
- `npm run lint`: **0 errores**, 363 warnings históricos (reglas degradadas a warning).
- E2E real con Chromium: **10/10 PASS** (`scripts/e2e-smoke.mjs`).
- Migración aplicada y baselineada; `db:generate` reporta “No schema changes”.
- Lint: 0 errores; quedan warnings de `any`/efectos en pantallas heredadas.

---

## 2. P0 corregidos

| # | Hallazgo | Corrección | Evidencia |
|---|---|---|---|
| 1 | `order.getById`, `getByCustomer`, `list` públicos (IDOR + PII + comprobantes) | Todos exigen sesión; `getById` valida participación (cliente dueño, driver asignado, comercio con ítems o admin). `getByCustomer` fuerza `ctx.customer.id`; `list` es `adminQuery`. Proyección sin `paymentReceipt`. | `server/order-router.ts`, `server/lib/order-access.ts`; prueba: otro cliente → **403**, anónimo → **401** |
| 2 | `order.updateStatus` público (cancelar/entregar/asignar) | `participantQuery` + matriz de transiciones por rol + ownership + idempotencia + `driverId` derivado del contexto. | `contracts/orderStatus.ts`, `server/order-router.ts`; prueba: cliente intentando `delivered` → **412** |
| 3 | SSE de pedido/driver/comercio sin auth | Resolución de cookies y autorización por canal; solo dueño/asignado/merchant/admin. | `server/boot.ts`; prueba: sin cookie → **401**, dueño → **200** |
| 4 | `chat.send/getByOrder/markAsRead` públicos y suplantables | `participantQuery`; `senderType/senderId/senderName` derivados del backend; validación de participación; rate limit. | `server/chat-router.ts`; prueba: cliente intentando enviar como driver → **403** |
| 5 | `customer.list/getById` públicos con `fcmToken` | `adminQuery` + proyección segura. | `server/customer-router.ts`; prueba: cliente → **401** |
| 6 | Login solo teléfono + registro autenticaba cuentas existentes | OTP por WhatsApp (NeuroChat) con código de 6 dígitos, expiración, 3 intentos, rate limit por teléfono/IP y token de registro de 10 min. `register` exige token verificado y rechaza teléfonos existentes. | `server/lib/otp.ts`, `server/customer-router.ts`, `CustomerLogin.tsx`, `Register.tsx` |
| 7 | `driver.list/getById/...` y `getAvailableForDriver` públicos | `adminQuery`/`driverQuery`; `driverId` desde el contexto. | `server/driver-router.ts`, `server/order-router.ts` |
| 8 | `product.update/delete` sin ownership (merchant edita productos ajenos) | `assertCommerceOwnership` en create/update/delete. | `server/product-router.ts` |
| 9 | Precios/comisión/fees enviados por el cliente | `order.quote` + `order.create` calculan subtotal, delivery fee, comisión y total en servidor; validan producto activo, comercio activo/abierto, mínimo por comercio y mínimo global. | `server/order-router.ts`; prueba: `deliveryFee:0.01`, `commission:0`, `customerId:2` → total real **$23.75**, customer **1** |
| 10 | Sin idempotencia (doble clic/reintento duplicaba pedidos y earnings) | `orders.idempotency_key` único + retorno del pedido existente; earnings con índice único `(order_id,type)` y `onConflictDoNothing`. | `db/schema.ts`, migración `0007`, `server/order-router.ts`; prueba: segundo POST → mismo pedido, `idempotent:true` |
| 11 | Baja de cuenta simulada | `customer.requestDeletion` persiste ticket en DB; `customer.deleteAccount` anonimiza PII, libera teléfono, revoca sesiones (`session_version`) y limpia cookies. | `server/customer-router.ts`, `DeleteAccount.tsx`; prueba: cliente creado → anonimizado `del_3_*`, `deleted_at` seteado |
| 12 | Comprobantes base64 sin límite | Validación MIME/tamaño (5 MB), estado permitido (`pending_payment`/`payment_rejected`) y ownership. | `server/order-router.ts`, `Cart.tsx`, `OrderTracking.tsx` |
| 13 | XSS en popups del mapa | Escape HTML de nombres/direcciones + `textContent`-safe en popups. | `OrderTrackingMap.tsx` |

---

## 3. P1/P2 funcionales corregidos

- **`/home`:** la sección de productos filtrados ya se renderiza al buscar; búsqueda server-side con debounce; categorías filtran productos por `commerceCategoryId`; se eliminó el N+1 de una query por tarjeta de comercio usando el catálogo cargado.
- **`/search`:** búsqueda real contra `product.search` (no solo 8 destacados), filtros por categoría, URL como fuente de verdad (`q`, `category`), debounce 300 ms, estados de error y productos de comercios cerrados marcados/no agregables.
- **`/cart`:** `order.quote` autoritativo, mínimo de compra visible, CTA deshabilitado con issues, errores inline en el modal (no solo `console.error`), idempotencia, validación de comprobante, fallback bancario eliminado, modal con `role="dialog"`, Escape y bloqueo de scroll.
- **`/order`:** listener SSE corregido (`addEventListener("update")`), reconexión con backoff, posición inicial del driver, ETA con `≈`, timeline basada en el contrato único de 11 estados, sin auto-redirect de pedidos entregados, mapa OSM con atribución, diff de marcadores sin parpadeo, `fitBounds` solo inicial, limpieza de refs/rAF, cancelación de pedido por el cliente.
- **`/chat`:** SSE real (no polling 5 s), envío optimista con estados enviando/error/reintentar, borrador persistente, scroll condicional, `markAsRead` derivado del backend, spinner corregido para mensajes optimistas, rate limit y paginación backend.
- **`/profile`:** logout limpia `qs_session`, `customer_session`, carrito y caché de React Query; historial sin comprobantes, labels compartidos en español, error/retry, y baja real de cuenta.
- **Sesión global:** un solo `QueryClient` (se eliminó el doble provider), refresh de 30 días con `session_version`, guard que verifica contra backend, limpieza de PII local.
- **Visual:** tokens `brand`, `surface`, `ink`, radios/primary orange; viewport permite zoom; fuente Outfit 800/900; `image.png` de **1,79 MB → 70,7 KB**; `DriverChat` alineado a Dark Velvet/Flame Orange; safe-area y targets principales ≥44 px.
- **Push:** filtrado de `location_update`, mensajes propios y deduplicación por pedido/estado.
- **DB:** índices en FKs/estados/fechas, unique de earnings, unique de `order_commerce_status`, `orders.idempotency_key`.

---

## 4. Verificación ejecutada

```bash
npx tsc -b --force          # OK, 0 errores
npm test                    # 2 archivos, 9 tests OK
npm run build               # OK
npm run db:generate         # No schema changes
npm run db:migrate          # OK (historial baselineado)
node scripts/e2e-smoke.mjs  # 10/10 PASS
node scripts/admin-smoke.mjs# admin login 200, driver.list admin 200, anon 401
```

Pruebas de seguridad puntuales:

- OTP real de desarrollo: request → verify → cookie → `/home`.
- IDOR: cliente 2 contra pedido de cliente 1 → **403**.
- Anónimo contra `order.getById`/`updateStatus`/SSE/chat → **401**.
- Dueño contra su pedido/SSE/chat → **200**.
- Cliente intentando `chat.send` como driver → **403**.
- Precios manipulados ignorados; total calculado en servidor.
- Doble `order.create` con la misma idempotency key → un solo pedido.
- Baja de cuenta: PII anonimizada y sesión revocada.

Capturas E2E: `test-flow-screenshots/rapidy-audit/01-home.png` … `06-chat.png`.

---

## 5. Configuración OTP (NeuroChat)

En `.env`:

```env
NEUROCHAT_API_KEY=otp_...
NEUROCHAT_OTP_FROM=          # opcional: phone_number_id o número propio
NEUROCHAT_BASE_URL=https://api.neurochat.com.ec/api/v1
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_DEV_FALLBACK=true        # solo desarrollo sin API key
```

La API Key se usa **solo en el backend**. En desarrollo sin key, el código se imprime en consola y se muestra en la UI como “Modo desarrollo”. En producción, sin `NEUROCHAT_API_KEY`, `requestOtp` falla con un error claro.

---

## 6. Alcance cerrado

No hay una lista de tareas abiertas en este documento. Cualquier funcionalidad no descrita
en `docs/customer/` requiere un pedido explícito del usuario. Los reportes
`docs/audit/<ruta>.md` son históricos y no deben interpretarse como tareas a
implementar.