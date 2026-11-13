# `/order/:id` — Seguimiento del pedido

**Archivo de página:** `src/pages/customer/OrderTracking.tsx`  
**Ruta:** `/order/:id`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Mostrar estado, timeline, mapa, repartidor, productos, totales y acciones del pedido en tiempo real, sin exponer pedidos de otros clientes.

## Flujo end-to-end

```text
/order/:id
  ├─ SessionGuard
  ├─ useOrder(id) → order.getById (participantQuery)
  ├─ useOrderEvents(id) → SSE /api/events/orders/:id
  ├─ SSE /api/events/driver/:driverId (solo si hay driver)
  ├─ useGeocode(deliveryAddress)
  ├─ OrderTrackingMap
  ├─ OrderTrackingTimeline
  ├─ OrderTrackingDetails
  └─ ChatBubble → /chat/:id
```

## Autorización

`order.getById` usa `participantQuery` + `assertOrderAccess`:

- Cliente dueño.
- Driver asignado.
- Comercio con ítems en el pedido.
- Admin.

Cualquier otro caso: **403**. Sin sesión: **401**.

La respuesta omite `paymentReceipt` y oculta teléfono/GPS del driver en estados terminales.

## Estados

Contrato único en `contracts/orderStatus.ts`:

`pending_payment`, `payment_rejected`, `received`, `accepted`, `preparing`, `ready_for_pickup`, `driver_assigned`, `picked_up`, `on_the_way`, `delivered`, `cancelled`.

- Timeline de 6 pasos para el cliente.
- Badge y descripción desde el contrato compartido.
- `payment_rejected` muestra banner para re-subir comprobante.
- `cancelled` muestra motivo.
- No hay auto-redirect al home tras `delivered`; el cliente decide cuándo salir.

## Acciones

- **Cancelar pedido:** visible en `pending_payment`, `received`, `accepted`; llama `order.updateStatus` con motivo.
- **Re-subir comprobante:** `order.updatePaymentReceipt`, solo en `pending_payment`/`payment_rejected`, con validación de archivo.
- **Abrir chat:** `ChatBubble`.

## Tiempo real y mapa

- SSE primario + polling de respaldo cada 30 s (antes 4 s).
- Listener correcto: `addEventListener("update")`.
- Reconexión con backoff.
- Mapa con OpenStreetMap (sin API key), atribución, escape de HTML y diffs de marcadores.
- `fitBounds` solo inicial; el botón de seguir centra en el driver.
- Geocodificación con `useGeocode` (TanStack Query + caché de sesión + abort).
- ETA aproximada por haversine; se muestra con `≈`.

## Contratos y tablas

| Procedimiento | Uso |
|---|---|
| `order.getById` | Pedido, ítems, historial, driver, comercios |
| `order.updateStatus` | Cancelación del cliente |
| `order.updatePaymentReceipt` | Re-subir comprobante |
| `chat.getByOrder` | Chat del pedido |

Tablas: `orders`, `order_items`, `order_status_history`, `order_commerce_status`, `drivers`, `commerces`.
