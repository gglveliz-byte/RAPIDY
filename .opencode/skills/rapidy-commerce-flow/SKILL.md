---
name: Rapidy Commerce Flow Guardian
description: Úsala antes de tocar /login de negocio, /commerce, /commerce/orders, /commerce/products, /commerce/stats, /commerce/profile, auth merchant, sesión, pedidos multi-comercio, comisión o SSE del negocio. Contiene qué documentación leer, qué está corregido y qué reglas no se deben romper.
---

# Rapidy Commerce Flow Guardian

Esta skill protege el flujo Negocio ya auditado, corregido y verificado. Sirve
para entrar en contexto rápido y no reintroducir bugs de sesión, estados,
dinero, PII o rendimiento.

**Todas las rutas son desde la raíz del repositorio.**

## Cuándo usar esta skill

- Rutas `/login` (merchant), `/commerce`, `/commerce/orders`,
  `/commerce/products`, `/commerce/stats`, `/commerce/profile`.
- Auth merchant, cookies, refresh, logout, `SessionGuard`, `merchant_user`.
- Carrito/checkout cuando toque precios, unidades o comercio.
- Pedidos: estados por comercio, `markReady`, multi-comercio, SSE.
- Comisión, `commerce.getStats`, métricas históricas.
- Catálogo: precios, imágenes, disponibilidad, `product.*`.
- Vitrina cliente `/store/:id` y su integración con el negocio.
- Migraciones o índices de `commerces`, `products`, `orders`,
  `order_items`, `order_commerce_status`.

## Lectura obligatoria antes de cambiar código

1. `docs/commerce/README.md` — arquitectura y reglas actuales.
2. `docs/commerce/FILE_MAP.md` — qué hace cada archivo.
3. `docs/commerce/VERIFICATION.md` — comandos y evidencia que debe seguir pasando.
4. `docs/commerce/audit/MASTER_TRIAGE.md` — hallazgos y estado de corrección.
5. `docs/customer/README.md` — contrato del flujo Cliente.
6. Si toca estados: `contracts/orderStatus.ts`.
7. Si toca sesión: `server/login-router.ts`, `server/merchant-auth.ts`,
   `src/components/SessionGuard.tsx`, `src/hooks/useSessionSync.ts`,
   `src/hooks/useCustomerSession.tsx`.
8. Si toca pedidos: `server/order-router.ts`, `server/commerce-router.ts`,
   `server/lib/order-ready.ts`, `server/lib/order-status-sync.ts`.
9. Si toca catálogo: `server/product-router.ts`,
   `src/components/commerce/ProductModal.tsx`, `src/lib/imageUpload.ts`.
10. Si toca métricas: `server/commerce-router.ts` (`getStats`) y
    `src/pages/commerce/Stats.tsx`.

## Mapa de documentación

| Documento | Qué es | ¿Fuente de verdad? |
|---|---|---|
| `docs/commerce/README.md` | Arquitectura y reglas actuales | Sí |
| `docs/commerce/FILE_MAP.md` | Inventario archivo por archivo | Sí |
| `docs/commerce/VERIFICATION.md` | Comandos y evidencia | Sí |
| `docs/commerce/ROUTES_MAP.md` | Mapa de rutas/procedimientos | Sí, con notas históricas |
| `docs/commerce/audit/MASTER_TRIAGE.md` | Consolidado y estado de corrección | Contexto |
| `docs/commerce/audit/<ruta>.md` | Reporte histórico de auditoría | Contexto; no es backlog |
| `docs/customer/*` | Flujo Cliente | Sí para ese flujo |
| `docs/LIVE_ARCHITECTURE_LEDGER.md` | Ledger antiguo | No; está marcado histórico |

## Reglas que NO se deben romper

### Sesión y autorización

- La cookie HttpOnly es la fuente de verdad para merchant/admin/driver. No
  volver a exigir `qs_session` antes de `login.checkAuth`.
- `useCustomerSession` no debe borrar ni reescribir la sesión profesional.
- `login.logout` debe ser role-scoped. El logout/401 del negocio no puede cerrar
  la sesión del cliente ni vaciar su carrito.
- `login.login` no debe limpiar cookies antes de validar credenciales.
- El rate limit del login (8 fallos/10 min, bloqueo 15 min) y el hash dummy para
  emails inexistentes deben mantenerse.
- `login.seedAdmin` no debe volver a ser un procedimiento público.
- No aceptar `status`, `commissionRate`, `merchantUserId` ni `categoryId` desde
  `commerce.update` del merchant. Solo admin cambia el estado del comercio.
- `useMerchantCommerceId` debe resolver solo por `commerce.me`; no inferir por
  nombre ni confiar en un ID cacheado sin revalidar.
- No exponer `paymentReceipt`, `fcmToken`, `passwordHash` ni PII innecesaria.
- Al hacer logout se debe ejecutar `commerce.unregisterDeviceToken`.

### Pedidos y estados

- `contracts/orderStatus.ts` es la única fuente de estados, labels y
  transiciones. No crear mapas locales.
- Un pedido nuevo debe nacer `received` (cash) o `pending_payment` (transfer),
  también en `order_commerce_status`.
- `markReady` solo puede ejecutarse desde `received`/`accepted`/`preparing`.
  Nunca debe revivir `cancelled`, `delivered` o `payment_rejected`.
- `markReady` debe ser transaccional, idempotente y bloquear la fila del pedido.
- El paso global a `ready_for_pickup` solo ocurre cuando todos los comercios con
  items están listos.
- Un merchant solo puede aceptar/preparar/cancelar su parte. No puede cancelar
  un pedido multi-comercio completo si hay otros comercios.
- Un pedido `payment_rejected` no debe mostrar acciones de preparación.
- El rechazo desde el panel debe pedir motivo y enviar `cancellationReason`.
- No reintroducir el auto-redirect del cliente al entregar.

### Dinero y catálogo

- `order.quote`/`order.create` calculan precios, envío, comisión y total en
  servidor. No confiar en montos del cliente.
- `product.create/update` deben validar precio decimal positivo, máximo y sin
  exponenciales. No aceptar `z.string()` libre.
- La comisión histórica debe salir de `order_commerce_status.commission_amount`;
  no recalcular pedidos nuevos con la tasa actual.
- El carrito debe mostrar precio/unidad de `quote.data.lines`, no solo del
  snapshot local.
- `product.getByCommerce` y `commerce.getById` deben ocultar comercios no
  `active` al público; `/store/:id` deshabilita agregar si el local está cerrado.
- Imágenes: comprimir en cliente y limitar MIME/tamaño en servidor. No volver a
  aceptar base64 arbitrario de 50 MB.
- `ProductModal` debe resetearse al abrir/editar; no reutilizar el producto
  anterior.

### SSE y rendimiento

- El layout del panel monta `useCommerceEvents`; el cliente usa
  `products:global`, no el canal merchant.
- Eventos al canal `commerce:{id}` en toda transición externa (cliente, admin,
  driver) y en `products_update`/`commerce_update`.
- Polling de 30 s solo como respaldo; no bajar a 4–5 s.
- `getCommerceOrders` debe mantener límite, `ORDER BY created_at DESC`,
  proyección explícita y customers filtrados por `inArray`.
- `getStats` debe ser una consulta agregada, sin N+1; ventana real de 7 días y
  zona `America/Guayaquil`.
- No reintroducir N+1 en Home ni un segundo `QueryClient`.
- No importar Leaflet globalmente; solo en chunks lazy.

### Rutas

- La vitrina cliente vive en `/store/:id`.
- `/commerce/:id` solo redirige IDs numéricos legacy; `/commerce/foo` debe
  mostrar `NotFound` sin tocar la sesión del merchant.
- Las rutas estáticas del panel (`/commerce/orders`, `/products`, `/stats`,
  `/profile`) tienen prioridad sobre el dynamic legacy.

## Verificación obligatoria antes de terminar

```bash
npx tsc -b --force
npm test
npm run lint
npm run build
npm run db:generate          # "No schema changes" si no tocaste esquema
node scripts/e2e-commerce-smoke.mjs
node scripts/admin-smoke.mjs
npx tsx scripts/redirect-smoke.ts
```

- E2E negocio debe seguir en 20/20.
- Si tocas sesión, probar reload, pestaña nueva, merchant+merchant y
  merchant+customer.
- Si tocas pedidos, probar cash, transfer, `payment_rejected`, multi-comercio y
  `markReady` sobre `cancelled`/`delivered`.
- Si tocas catálogo, probar precio `-5`, `0`, `NaN`, imagen grande y edición de
  dos productos seguidos.
- Si tocas DB, generar migración, revisar SQL, aplicar y verificar
  `db:generate` sin cambios.

## Qué hacer si encuentras una discrepancia

1. Lee el doc de la ruta y el código actual; no “arregles” de memoria.
2. Si doc y código difieren, gana el código **solo después** de verificar con
   tests; actualiza el doc en el mismo cambio.
3. Si el hallazgo está en `docs/commerce/audit/`, no asumas que es una tarea.
   Revisa `MASTER_TRIAGE.md` y pregunta antes de reabrirlo.
4. Si el cambio afecta una regla de esta skill, actualiza la skill y explica por
   qué en el commit.

## Alcance cerrado

No hay una lista de tareas abiertas en esta skill. El flujo actual está cerrado
y verificado. No implementes funcionalidades nuevas, refactors grandes ni
cambios de modelo de datos sin un pedido explícito del usuario.

Si una tarea no está descrita en `docs/commerce/`, pregunta antes de asumir que
hay que implementarla.