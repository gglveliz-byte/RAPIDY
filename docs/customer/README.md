# Documentación real del flujo Cliente — Rapidy

**Última actualización:** 2026-11-13  
**Alcance:** estado actual verificado de las 6 rutas críticas del cliente.

> Esto no es un reporte de hallazgos. Es la documentación de cómo funciona hoy
> el flujo corregido, qué contratos usa, qué está verificado y qué está fuera de alcance.

> **Regla de alcance:** nada de este documento es una lista de tareas.
> No implementes funcionalidades nuevas, refactors grandes ni cambios de modelo
> de datos sin un pedido explícito del usuario. Si algo no está documentado aquí,
> pregunta antes de asumir que hay que hacerlo.

## Rutas documentadas

| Ruta | Documento | Pantalla |
|---|---|---|
| `/home` | [`home.md`](./home.md) | Catálogo principal |
| `/search` | [`search.md`](./search.md) | Búsqueda y filtros |
| `/cart` | [`cart.md`](./cart.md) | Carrito y checkout |
| `/order/:id` | [`order.md`](./order.md) | Seguimiento del pedido |
| `/chat/:orderId` | [`chat.md`](./chat.md) | Chat del pedido |
| `/profile` | [`profile.md`](./profile.md) | Perfil e historial |

## Documentación transversal

- [`FILE_MAP.md`](./FILE_MAP.md): mapa archivo por archivo (página, componente, hook, router, tabla).
- [`VERIFICATION.md`](./VERIFICATION.md): comandos, pruebas y evidencia de la última verificación.
- [`../audit/MASTER_TRIAGE.md`](../audit/MASTER_TRIAGE.md): consolidado de correcciones P0/P1.
- [`../audit/home.md`](../audit/home.md), `search.md`, `cart.md`, `order.md`, `chat.md`, `profile.md`: reportes de auditoría originales con `archivo:línea`.

## Arquitectura global del cliente

```text
React 19 + Vite
  └─ SessionGuard (customer)
      ├─ verifica cookie HttpOnly contra customer.checkAuth
      ├─ restaura customer_session + qs_session si la cookie es válida
      └─ redirige a /customer-login solo si el backend no reconoce sesión

UI de ruta
  └─ hooks (useDeliveryData, useCart, useOrderEvents, useGeocode, etc.)
      └─ tRPC (httpLink + superjson)
          └─ Hono + Drizzle
              └─ PostgreSQL

Tiempo real: SSE /api/events/orders/:id y /api/events/driver/:id
Auth cliente: OTP WhatsApp (NeuroChat) → cookies HttpOnly
```

## Sesión del cliente

- **Access token:** 15 minutos, cookie `quickgo_token` HttpOnly.
- **Refresh token:** 365 días deslizantes, cookie `refresh_token` HttpOnly.
- **Renovación:** cada 10 minutos con la app abierta y automáticamente al reabrir si el access expiró.
- **Logout:** limpia cookies, `customer_session`, `qs_session`, carrito y caché de React Query.
- **Fuente de verdad:** la cookie HttpOnly. `localStorage` es solo caché de UI.
- **OTP:** 1 código por login; 1 código por registro. Después no se vuelve a pedir hasta logout o 365 días sin actividad.
- **Sin OTP si:** el cliente ya tiene sesión válida y entra a `/`, `/register` o `/customer-login`; se le redirige a `/home`.

## Contrato único de estados

`contracts/orderStatus.ts` es la fuente compartida para backend y frontend:

- 11 estados: `pending_payment`, `payment_rejected`, `received`, `accepted`, `preparing`,
  `ready_for_pickup`, `driver_assigned`, `picked_up`, `on_the_way`, `delivered`, `cancelled`.
- Labels, colores, paso del stepper, terminalidad y transiciones por rol.
- Evita los 5 mapas de estado duplicados que existían antes.

## Autorización

- `customerQuery`: exige cliente.
- `driverQuery`: exige repartidor.
- `merchantQuery`: exige comercio.
- `adminQuery`: exige admin.
- `participantQuery`: exige cualquier sesión; el router valida participación real
  (cliente dueño, driver asignado, comercio con ítems o admin).

## Variables OTP

```env
NEUROCHAT_API_KEY=otp_...
NEUROCHAT_OTP_FROM=          # opcional; vacío usa línea por defecto/oficial
NEUROCHAT_BASE_URL=https://api.neurochat.com.ec/api/v1
OTP_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_DEV_FALLBACK=false       # en desarrollo puede ser true
```

La API Key nunca se expone al frontend.