# `/profile` — Perfil del cliente

**Archivo de página:** `src/pages/customer/Profile.tsx`  
**Ruta:** `/profile`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Mostrar datos del cliente, editar dirección, ver pedidos recientes, abrir el historial completo, gestionar sesión y acceder al marco legal/baja de cuenta.

## Flujo end-to-end

```text
/profile
  ├─ useCustomerSession → customer + login/logout
  ├─ useCustomerOrders → order.getByCustomer (20)
  ├─ useUpdateCustomerProfile → customer.update
  ├─ ProfileOrdersModal
  ├─ logout → customer.logout
  └─ enlaces legales / baja de cuenta
```

## Datos y contratos

| Dato | Hook | Procedimiento |
|---|---|---|
| Cliente | `useCustomerSession` | `customer.checkAuth` / cookies |
| Pedidos | `useCustomerOrders` | `order.getByCustomer` |
| Editar dirección | `useUpdateCustomerProfile` | `customer.update` |
| Logout | `useCustomerSession.logout` | `customer.logout` |
| Historial modal | `ProfileOrdersModal` | Usa la misma lista |

`order.getByCustomer` es `customerQuery`, fuerza el `customerId` del contexto y **no devuelve `paymentReceipt`**. Los estados usan el contrato compartido en español.

## Sesión

- La sesión se hidrata desde `customer_session`.
- La cookie HttpOnly es la fuente de verdad; `SessionGuard` la verifica.
- Logout limpia:
  - `customer_session`
  - `qs_session`
  - `merchant_user` / `driver_user`
  - carrito
  - caché de React Query
  - evento `rapidy:logout`
- Refresh token de 365 días deslizantes.
- Si el cliente entra a `/`, `/register` o `/customer-login` con sesión, se redirige a `/home`.

## Historial

- Preview de los últimos 2 pedidos.
- “Ver todos” abre `ProfileOrdersModal`.
- Búsqueda por número/producto y filtros “Todos / Entregados / En proceso”.
- Modal con `role="dialog"`, Escape, bloqueo de scroll y cierre accesible.
- Estados en español desde `contracts/orderStatus.ts`.
- Fechas con `toLocaleString`.

## Baja de cuenta

- Enlace a `/eliminar-cuenta`.
- La página pública crea una solicitud real en `account_deletion_requests` con ticket.
- Existe además `customer.deleteAccount` autenticado para anonimización inmediata (PII, teléfono, `sessionVersion`).
