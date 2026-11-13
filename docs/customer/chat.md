# `/chat/:orderId` — Chat del pedido

**Archivo de página:** `src/pages/customer/Chat.tsx`  
**Ruta:** `/chat/:orderId`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Permitir mensajería del pedido entre cliente, repartidor y comercio, con SSE, envío optimista y autorización por participación.

## Flujo end-to-end

```text
/chat/:orderId
  ├─ useChatMessages(orderId) → chat.getByOrder (participantQuery)
  ├─ useOrderEvents(orderId) → SSE /api/events/orders/:id
  ├─ useSendChatMessage → chat.send
  └─ markAsRead → chat.markAsRead
```

## Autorización y contrato

- Los tres procedimientos usan `participantQuery` + `assertOrderAccess`.
- El backend deriva `senderType`, `senderId` y `senderName`; el cliente no puede suplantar.
- `as` opcional permite elegir entre roles propios.
- `markAsRead` deriva el lector del rol autenticado.
- Rate limit: máximo 20 mensajes/minuto por remitente.
- `getByOrder` pagina de 1 a 100; el frontend pide 50.

## Tiempo real y UX

- SSE primario; polling de respaldo cada 30 s.
- Envío optimista con estados “enviando”, “enviado” y “error/reintentar”.
- Borrador persistente por `orderId`.
- Scroll solo si el usuario está cerca del final.
- Enter envía; Shift+Enter no; composición IME respetada.
- `markAsRead` se ejecuta al recibir mensajes.
- Spinner solo si no hay mensajes (incluidos optimistas).
- Input con safe-area inferior.

## Estados

- Loading inicial.
- Error con retry.
- Vacío: “Envía un mensaje sobre tu pedido”.
- Header muestra “Mensajes en tiempo real” o “Reconectando…” según SSE.

## Contratos y tablas

| Procedimiento | Uso |
|---|---|
| `chat.getByOrder` | Últimos mensajes del pedido |
| `chat.send` | Enviar mensaje |
| `chat.markAsRead` | Marcar leídos los del otro rol |

Tabla: `chat_messages` (`order_id`, `sender_type`, `sender_id`, `sender_name`, `message`, `is_read`, `created_at`), índice `(order_id, created_at)`.
