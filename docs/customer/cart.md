# `/cart` — Carrito y checkout

**Archivo de página:** `src/pages/customer/Cart.tsx`  
**Rutas:** `/cart`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Agrupar productos por comercio, calcular un total autoritativo, validar mínimos/disponibilidad, elegir dirección y método de pago, y crear el pedido de forma idempotente.

## Flujo end-to-end

```text
Carrito local (useCart)
  └─ /cart
      ├─ order.quote  ← servidor calcula subtotal, envío, comisión, total e issues
      ├─ CartAddressModal
      │   ├─ dirección guardada / manual / GPS
      │   ├─ efectivo o transferencia
      │   └─ comprobante (imagen ≤ 5 MB)
      └─ order.create (idempotencyKey + validación server-side)
          └─ /order/:id
```

## Carrito local (`src/hooks/useCart.tsx`)

- Persistencia en `localStorage` con TTL de 7 días.
- `JSON.parse` protegido con `try/catch`; formato viejo soportado.
- Sincronización entre pestañas con evento `storage`.
- Se limpia en logout (`rapidy:logout`).
- Máximo 50 líneas y cantidades entre 0 y 999.
- El carrito se limpia al confirmar el pedido.

## Cálculo autoritativo

`order.quote` (`customerQuery`) devuelve:

- `subtotal`, `deliveryFee`, `commission`, `total`, `minOrder`, `issues`.
- Valida producto existente, `isAvailable`, comercio `active`/`open`, mínimo por comercio y mínimo global.
- El frontend muestra `issues` y deshabilita el checkout si hay bloqueos.

`order.create` vuelve a calcular todo en servidor:

- Ignora precios, fees, comisión y `customerId` enviados por el cliente.
- Deriva el comercio desde el producto.
- Crea la orden y sus ítems en una transacción.
- `idempotencyKey` único: un reintento devuelve la misma orden.
- Estado inicial: `received` (efectivo) o `pending_payment` (transferencia).
- Comprobante validado por MIME/tamaño y estado permitido.

## UI / accesibilidad

- CTA sticky con total del quote.
- Modal `role="dialog"`, `aria-modal`, Escape, bloqueo de scroll y cierre deshabilitado mientras procesa.
- Errores inline (`role="alert"`), no solo `console.error`.
- Fallback de datos bancarios eliminado: si no hay `bank_transfer_info`, se avisa.
- Safe-area en CTA e input.
- Éxito: pantalla “Pedido confirmado” con “Seguir pedido”.

## Contratos y tablas

| Procedimiento | Uso |
|---|---|
| `order.quote` | Totales y validaciones previas |
| `order.create` | Crear orden idempotente |
| `settings.getPublic` | `delivery_fee`, `min_order_amount`, `bank_transfer_info` |
| `commerce.list` | Detectar comercios cerrados |
| `customer.update` | Guardar dirección si aplica |

Tablas: `orders`, `order_items`, `order_status_history`, `order_commerce_status`, `products`, `commerces`, `app_settings`.
