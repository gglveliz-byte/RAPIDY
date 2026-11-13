---
name: Rapidy Customer Flow Guardian
description: Úsala antes de tocar /home, /search, /cart, /order, /chat, /profile, auth de cliente, sesión, OTP, carrito, checkout, pedidos o chat. Contiene qué documentación leer, qué ya está corregido y qué reglas no se deben romper.
---

# Rapidy Customer Flow Guardian

Esta skill protege el flujo Cliente ya auditado y corregido. Su objetivo es que
cualquier agente o desarrollador entre en contexto rápido, sepa qué documentación
es la vigente y no reintroduzca bugs de seguridad, sesión, precios o rendimiento.

**Todas las rutas de archivos son desde la raíz del repositorio.**

## Cuándo usar esta skill

Úsala si la tarea toca cualquiera de estos temas:

- Rutas `/home`, `/search`, `/cart`, `/order/:id`, `/chat/:orderId`, `/profile`.
- Login/registro de cliente, OTP, cookies, refresh, logout, `SessionGuard`.
- Carrito, checkout, quote, totales, envío, comisión, idempotencia.
- Pedidos: estados, timeline, SSE, mapa, cancelación, comprobantes.
- Chat del pedido, SSE, envío optimista, autorización.
- Historial de pedidos, perfil, baja de cuenta.
- Cambios visuales o de rendimiento en la app Cliente.
- Migraciones o índices de tablas usadas por el flujo Cliente.

## Lectura obligatoria antes de cambiar código

Leer en este orden:

1. `docs/customer/README.md` — arquitectura global, sesión, OTP, autorización.
2. `docs/customer/FILE_MAP.md` — qué hace cada archivo y su estado actual.
3. El documento de la ruta afectada:
   - `docs/customer/home.md`
   - `docs/customer/search.md`
   - `docs/customer/cart.md`
   - `docs/customer/order.md`
   - `docs/customer/chat.md`
   - `docs/customer/profile.md`
4. `docs/customer/VERIFICATION.md` — comandos y evidencia que debe seguir pasando.
5. `docs/audit/MASTER_TRIAGE.md` — qué se corrigió y por qué (contexto histórico).
6. Si el cambio toca estados de pedido: `contracts/orderStatus.ts`.
7. Si toca auth/sesión: `server/customer-auth.ts`, `server/context.ts`,
   `src/hooks/useCustomerSession.tsx`, `src/components/SessionGuard.tsx`.
8. Si toca pedidos/chat: `server/order-router.ts`, `server/chat-router.ts`,
   `server/lib/order-access.ts`, `src/hooks/useOrderEvents.ts`.
9. Si toca checkout: `server/order-router.ts`, `src/pages/customer/Cart.tsx`,
   `src/pages/customer/components/CartAddressModal.tsx`, `src/hooks/useCart.tsx`.

## Mapa de documentación: qué es cada cosa

| Documento | Qué es | ¿Es fuente de verdad? |
|---|---|---|
| `docs/customer/README.md` | Arquitectura y reglas actuales del flujo Cliente | Sí |
| `docs/customer/home.md` … `profile.md` | Estado actual por ruta | Sí |
| `docs/customer/FILE_MAP.md` | Inventario archivo por archivo | Sí |
| `docs/customer/VERIFICATION.md` | Cómo verificar y evidencia | Sí |
| `docs/audit/MASTER_TRIAGE.md` | Consolidado de correcciones P0/P1 | Contexto |
| `docs/audit/<ruta>.md` | Reporte original de hallazgos | Contexto histórico; puede mencionar bugs ya corregidos |
| `docs/LIVE_ARCHITECTURE_LEDGER.md` | Ledger antiguo (tRPC 10, Drizzle 0.39, ARS) | **No**, está marcado como histórico |
| `docs/FULL_FLOW_VERIFICATION_REPORT.md` | Reporte E2E antiguo | **No**, desactualizado |
| `MAPA_DEL_SISTEMA.md`, `ROUTES.md`, `REQUISITOS.md` | Documentación general antigua | Revisar antes de confiar |

## Reglas que NO se deben romper

### Seguridad y autorización

- No volver públicos `order.getById`, `order.updateStatus`, `customer.list`,
  `customer.getById`, `driver.list`, `getAvailableForDriver` ni `chat.*`.
- No aceptar `customerId`, `driverId`, `senderType`, `senderId` o `senderName`
  desde el cliente para decidir identidad. Se derivan de `ctx`.
- Mantener `assertOrderAccess` y `assertCommerceOwnership`.
- Nunca devolver `paymentReceipt`, `fcmToken`, `passwordHash`, GPS/teléfono del
  driver en estados terminales ni PII innecesaria.
- Los comprobantes deben validar MIME/tamaño/estado; no aceptar base64 arbitrario.
- La API Key de NeuroChat es solo del backend; nunca en `VITE_*` ni en el frontend.

### Sesión y OTP

- La cookie HttpOnly es la fuente de verdad. No volver a exigir `qs_session`
  antes de verificar la cookie.
- No usar `SameSite=None` sin `Secure`. En localhost debe ser `Lax`.
- Mantener refresh de 365 días deslizantes y renovación cada 10 min.
- No volver al login solo por teléfono. `customer.login` está deshabilitado.
- `customer.register` exige `registrationToken` verificado por OTP.
- Mantener rate limit de OTP (3/10 min por teléfono, 45 s entre envíos,
  20/h por IP) y máximo 3 intentos.
- `/`, `/register` y `/customer-login` deben redirigir a `/home` si hay sesión.
- El logo RAPIDY del header debe llevar a `/home`, no a la landing pública.

### Dinero, carrito y pedidos

- `order.quote` y `order.create` calculan subtotal, delivery fee, comisión y
  total en el servidor. No confiar en montos del cliente.
- Mantener validación de producto disponible, comercio activo/abierto, mínimo
  por comercio y mínimo global.
- Mantener `idempotencyKey` y el índice único de `orders.idempotency_key`.
- Mantener `driver_earnings` con unique `(order_id, type)` y `onConflictDoNothing`.
- Mantener el carrito con TTL de 7 días, `try/catch`, sync entre pestañas y
  limpieza en logout.
- No cerrar el modal de checkout antes de que `order.create` confirme; mostrar
  error inline y permitir reintentar.

### Estados y tiempo real

- Usar siempre `contracts/orderStatus.ts`; no crear mapas de estados duplicados.
- Mantener el enum de 11 estados y las transiciones por rol.
- SSE usa el evento nombrado `update`; escuchar con `addEventListener("update")`,
  no con `onmessage`.
- Mantener autenticación de los canales SSE y `connected` en la UI.
- Polling es solo respaldo: 30 s, no 4–5 s.
- No reintroducir el auto-redirect de pedidos entregados.

### Rendimiento y visual

- No reintroducir N+1 en Home (`product.getByCommerce` por tarjeta).
- No importar Leaflet globalmente en `main.tsx`; debe quedar en el chunk lazy.
- No crear un segundo `QueryClient`.
- Mantener debounce de búsqueda (300 ms), caché de sesión de geocodificación
  y `fitBounds` solo inicial.
- Usar tokens `brand`, `surface`, `ink`; evitar nuevos hardcodes de marca.
- Mantener safe-area, targets ≥44 px y `prefers-reduced-motion`.
- No desactivar el zoom del viewport.
- Mantener `image.png` optimizado (no volver a subir el original de 1,79 MB).

### Base de datos

- No ejecutar migraciones destructivas sin revisar el SQL y pedir confirmación.
- El proyecto usa `db:push`; el historial de migraciones ya fue baselineado.
- Cambios de esquema: `npm run db:generate`, revisar `db/migrations/*.sql`,
  aplicar, y verificar con `npm run db:generate` (“No schema changes”).
- Mantener índices de FKs, estados, fechas, chat y unique de earnings.

## Verificación obligatoria antes de terminar

```bash
npx tsc -b --force          # 0 errores
npm test                    # 9/9 o más
npm run lint                # 0 errores (warnings históricos permitidos)
npm run build               # OK
npm run db:generate         # No schema changes si no tocaste esquema
```

Si el cambio toca rutas o UI:

```bash
node scripts/e2e-smoke.mjs
npx tsx scripts/redirect-smoke.ts   # sesión/logo/landing/login
```

- Con OTP real configurado, el E2E necesita `E2E_OTP_CODE`.
- Sin API Key, usar `OTP_DEV_FALLBACK=true` para el `devCode`.
- No dar por terminado un cambio de auth/pedido/chat sin probar 401/403 y el
  flujo del dueño.

## Qué hacer si encuentras una discrepancia

1. No “arregles” de memoria: lee el doc de la ruta y el código actual.
2. Si el doc y el código difieren, gana el código **solo después** de verificar
   con tests; actualiza el doc en el mismo cambio.
3. Si el hallazgo ya está en `docs/audit/` pero no en `docs/customer/`, no asumas
   que hay que implementarlo. Puede estar fuera de alcance. Pregunta antes de reabrirlo.
4. Si el cambio afecta una regla de esta skill, actualiza la skill y explica por
   qué en el PR/commit.

## Alcance cerrado

No hay una lista de tareas abiertas en esta skill. El flujo actual está cerrado y
verificado. No implementes funcionalidades nuevas, refactors grandes ni cambios
de modelo de datos sin un pedido explícito del usuario.

Si una tarea no está descrita en `docs/customer/`, pregunta antes de asumir
que hay que implementarla.