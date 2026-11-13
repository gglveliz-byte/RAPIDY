> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de `/chat/:orderId` — Chat cliente ↔ comercio/repartidor

**App:** Rapidy (DeliveryCity)  
**Commit base auditado:** `fd11626`; **HEAD al cerrar:** `3f673c6` (solo cambia `OrderTracking*`, sin impacto en el chat)  
**Fecha:** 2026-11-13  
**Alcance:** ruta de cliente `/chat/:orderId`, su entrada desde `/order/:id`, contraparte driver `/driver/chat/:orderId`, contratos tRPC/SSE, persistencia y UI.  
**Método:** auditoría estática de código y contratos. No se ejecutó la app ni se modificó código fuente. Las afirmaciones no verificables en runtime están marcadas como **hipótesis**.  
**Única escritura realizada:** este archivo.

---

## 1. Resumen ejecutivo

- **P0 — El chat no tiene autorización real.** `chat.send`, `chat.getByOrder` y `chat.markAsRead` son `publicQuery` (`server/chat-router.ts:9`, `:26`, `:37`). Cualquier persona, sin cookie, puede leer y escribir el chat de cualquier pedido conociendo el `orderId`.
- **P0 — Suplantación completa de identidad.** `send` acepta `senderType`, `senderId` y `senderName` desde el cliente (`server/chat-router.ts:12-16`) y los inserta tal cual (`:21`). Un atacante puede escribir como “driver” o “commerce”, o inyectar mensajes con `senderType: "customer"` que el cliente víctima renderiza como propios (`src/pages/customer/Chat.tsx:96`, `:140-159`).
- **P0 — Fuga de conversaciones y PII.** `getByOrder` devuelve todos los mensajes, `senderId` y nombres de cualquier pedido, sin paginación ni comprobación de participación (`server/chat-router.ts:26-35`). Los IDs de pedido son correlativos y los endpoints `order.getById` y `customer.getById` también son públicos, lo que amplifica la fuga (ver CHAT-02).
- **P1 — El chat no usa SSE.** `Chat.tsx` solo consulta cada 5 s (`src/pages/customer/Chat.tsx:61-62`, `src/hooks/useDeliveryData.ts:308-315`). `useOrderEvents` se monta únicamente en `OrderTracking` y `DriverOrder`, no en las pantallas de chat. El SSE de pedido existe, pero el chat no lo escucha.
- **P1 — No existe chat de comercio.** Solo hay UI de cliente y driver; no hay ruta, entrada ni pantalla de chat para merchant (`src/App.tsx:100-116`, `src/components/ChatBubble.tsx:25`). El encabezado promete “Repartidor y soporte en línea” (`Chat.tsx:121-124`), pero “soporte” no es un rol del modelo (`db/schema.ts:38`).
- **P1 — El envío no tiene estado por mensaje, ni optimismo, ni reintento.** El error solo se imprime en consola (`Chat.tsx:90-92`); el botón global se deshabilita, pero Enter y los atajos siguen enviando (`Chat.tsx:209-217`, `:226`, `:232`), lo que permite duplicados.
- **P1 — Los acuses de lectura están rotos en conversaciones activas.** `markAsRead` se ejecuta solo al montar la pantalla (`Chat.tsx:72-76`), no cuando llega un mensaje nuevo, y no emite SSE. El remitente puede ver “enviado” indefinidamente mientras el receptor tiene el chat abierto.
- **P1/P2 — Escala y resistencia pobres.** Historial completo sin paginación ni índice (`chat-router.ts:26-35`, `db/schema.ts:220-229`), polling de lista completa cada 5 s, sin rate limit ni longitud máxima (`chat-router.ts:16`), y un límite global de body de 50 MB (`server/boot.ts:34`).

---

## 2. Alcance, método y límites

Se siguió el flujo completo:

1. Entrada desde `/order/:id` y desde `/driver/order/:id`.
2. Guard de ruta (`SessionGuard role="customer"`).
3. Carga inicial de mensajes.
4. Envío y persistencia.
5. Emisión SSE y notificaciones push.
6. Recepción en la otra parte y render.
7. Estados UI, accesibilidad, rendimiento y seguridad.

**Límites:** no se levantó el servidor ni se crearon pedidos; no se probó en dispositivo iOS/Android real; no se verificó el comportamiento de red del proveedor de despliegue. Cuando una conclusión depende de ello se indica **hipótesis**. Las líneas citadas corresponden al commit `fd11626`.

---

## 3. Mapa end-to-end

### 3.1 Entradas y guard

| Entrada | Evidencia | Comportamiento |
|---|---|---|
| Cliente desde seguimiento | `src/pages/customer/OrderTracking.tsx:250` | Muestra `<ChatBubble orderId={order.id} />` solo si el pedido no está `delivered` ni `cancelled`. |
| Driver desde pedido | `src/pages/driver/DriverOrder.tsx:472` | Muestra `<ChatBubble orderId={Number(id)} role="driver" />` si no está `delivered`; un pedido `cancelled` sigue mostrando el acceso. |
| Ruta cliente | `src/App.tsx:100` | `/chat/:orderId` envuelta en `SessionGuard role="customer"` y `PageTransition`. |
| Ruta driver | `src/App.tsx:108` | `/driver/chat/:orderId` envuelta en `SessionGuard role="driver"`. |
| Comercio | `src/App.tsx:111-116` | No existe ruta de chat; las páginas de comercio no tienen entrada ni UI de mensajes. |
| Guard cliente | `src/components/SessionGuard.tsx:14-21`, `:45-61` | Solo comprueba `qs_session` y `customer_session` en `localStorage`; no consulta al servidor para clientes. Es cosmético frente a la API pública. |
| Verificación de participación | **AUSENTE** | `Chat.tsx` no carga el pedido ni comprueba `order.customerId`; el backend no recibe `ctx` en ningún procedimiento de chat (`server/chat-router.ts:19-23`, `:28-34`, `:39-49`). |

### 3.2 Diagrama de secuencia

```
[Cliente] /chat/:orderId
     |
     |  SessionGuard (localStorage: qs_session + customer_session)
     |  NO valida cookie ni pertenencia del pedido
     v
 Chat.tsx (montaje)
     |
     +--> useChatMessages(Number(orderId))  [queryKey chat.getByOrder, orderId]
     |        |
     |        +-- GET /api/trpc/chat.getByOrder?input={"json":{"orderId":N}}
     |        |        publicQuery  <-- SIN AUTH
     |        |        SELECT * FROM chat_messages WHERE order_id=N ORDER BY created_at
     |        |        <-- TODOS los mensajes, sin límite ni cursor
     |        |
     |        +-- refetchInterval: 5000 ms  <-- "tiempo real" real = polling
     |
     +--> useEffect markAsRead (solo al montar)
     |        POST chat.markAsRead {orderId:N, readerType:"customer"}
     |        UPDATE chat_messages SET is_read='yes'
     |        WHERE order_id=N AND sender_type <> 'customer'
     |        (marca también mensajes de commerce/driver; no emite SSE)
     |
     +--> [otra parte]  DriverChat / Commerce (inexistente)
              |
              +-- DriverChat: mismo useChatMessages, polling 5 s
              +-- DriverChat: markAsRead solo al montar
              +-- Comercio: no hay pantalla ni suscripción
```

Envío:

```
Usuario escribe / toca atajo
     |
     v
handleSend(msg)
  - if (!msg.trim() || !customer) return
  - await sendChat.mutateAsync({
        orderId: Number(orderId),
        senderType: "customer",       <-- identidad declarada por el cliente
        senderId: customer.id,        <-- id declarado por el cliente
        senderName: "Nombre Apellido" <-- nombre declarado por el cliente
        message: msg.trim()
    })
     |
     v
POST /api/trpc/chat.send
     |
     +--> publicQuery  <-- SIN AUTH
     +--> INSERT INTO chat_messages ... RETURNING *
     +--> emit(`order:${orderId}`, {type:"chat_message", orderId})
             |
             +--> SSE listeners del canal order:N
             |      (OrderTracking/DriverOrder; Chat.tsx NO está suscrito)
             |
             +--> handlePushNotification()
                    +--> busca order -> customer
                    +--> FCM al customer, incluso si el emisor es el propio customer
                    +--> NO notifica al driver ni al commerce para chat
     |
     v
onSuccess: invalidate ["chat.getByOrder", N]
handleSend: refresh() manual (segunda carga)
     |
     v
Se vuelve a pedir la lista completa y se reemplaza el array
(no hay append optimista; no hay estado "enviando" por burbuja)
```

Recepción en la otra parte:

```
Cliente A envía
   |
   +--> driver en DriverChat: se entera en el próximo poll (hasta 5 s)
   +--> driver en DriverOrder: recibe SSE de order:N e invalida order/chat
   +--> comercio: no hay cliente de chat; no se entera
   +--> cliente: su propio mensaje aparece tras POST + GET, no por SSE
```

### 3.3 Respuestas rápidas al contrato

| Pregunta | Respuesta verificada | Evidencia |
|---|---|---|
| ¿Hay mutación optimista? | No. `useSendChatMessage` no define `onMutate`; inserta y luego invalida. | `src/hooks/useDeliveryData.ts:318-324` |
| ¿Hay paginación? | No. `getByOrder` recibe solo `orderId` y devuelve todo. | `server/chat-router.ts:26-35` |
| ¿El chat usa SSE? | No. Solo polling de 5 s. | `Chat.tsx:61-62`; `useDeliveryData.ts:313` |
| ¿El SSE está autenticado? | No. El endpoint de pedido no comprueba cookie; el de admin sí lo hace. | `server/boot.ts:72-89` vs `:130-147` |
| ¿Se valida pertenencia al pedido? | No, en ningún procedimiento. | `server/chat-router.ts:19-49` |
| ¿Se valida el estado del pedido? | No; se puede escribir en pedidos entregados/cancelados. | `server/chat-router.ts:19-23` |
| ¿Hay rate limit? | No se encontró en el código del servidor. | `server/boot.ts:25-34`; `server/chat-router.ts` |
| ¿Hay límite de longitud? | No para `message`; `senderName` está limitado solo por la columna `varchar(200)`. | `server/chat-router.ts:16`; `db/schema.ts:225-226` |
| ¿Hay XSS? | No se encontró: React interpola texto escapado; no hay `dangerouslySetInnerHTML` en el chat. | `Chat.tsx:161-163` |
| ¿Hay adjuntos, edición o borrado? | No. Solo texto; no hay procedimientos ni columnas para ello. | `server/chat-router.ts:8-52`; `db/schema.ts:220-229` |
| ¿Se cierra el chat al terminar el pedido? | Solo se oculta el FAB; la URL directa y el POST siguen funcionando. | `OrderTracking.tsx:250`; `Chat.tsx:61`; `chat-router.ts:19-23` |
| ¿Hay badge de no leídos? | No. El FAB tiene un punto verde permanente sin relación con mensajes. | `ChatBubble.tsx:37` |

**Persistencia, transacciones y N+1:** `chat.send` hace un único `INSERT ... RETURNING` (`chat-router.ts:21`); no hay una transacción que abarque insert + emisión. El `emit` ocurre después del insert (`:22`), por lo que un fallo del bus no revierte el mensaje: el polling lo recupera. `chat.getByOrder` es una sola consulta, sin N+1. El push asociado a cada mensaje sí consulta `orders` y `customers` por evento (`events.ts:69-89`), un coste fijo de 2 consultas por mensaje emitido (más las ramas de commerce/driver cuando aplican).

---

## 4. Inventario de archivos

| Archivo | Rol en el flujo | Observaciones |
|---|---|---|
| `src/pages/customer/Chat.tsx` | Pantalla cliente, polling, envío, render, markAsRead | 241 líneas; no usa SSE; no usa `loading`; no valida pedido. |
| `src/pages/driver/DriverChat.tsx` | Contraparte driver | Duplica lógica; paleta WhatsApp; layout distinto; sin safe areas. |
| `src/components/ChatBubble.tsx` | FAB de entrada al chat, no burbuja de mensaje | `role` solo customer/driver; punto verde estático. |
| `src/hooks/useDeliveryData.ts` | `useChatMessages`, `useSendChatMessage`, wrappers tRPC | Polling 5 s; mutación sin optimismo; cache del QueryClient interno. |
| `src/hooks/useOrderEvents.ts` | SSE reutilizable e invalidaciones | No se usa en Chat; reconexión limitada; invalida dos caches. |
| `src/hooks/useSessionSync.ts` | Sincronización de sesión entre pestañas | `JSON.parse` sin try/catch en el handler. |
| `src/hooks/usePushNotifications.ts` | Registro FCM y listeners nativos | Listener de token después de `register()`; acción de notificación sin navegación. |
| `src/components/SessionGuard.tsx` | Guard de rol | Para customer confía en localStorage; no valida cookie. |
| `src/components/CustomerBottomNav.tsx` | Navegación cliente | No se renderiza en Chat; útil para descartar solapamiento de bottom nav. |
| `src/components/PageTransition.tsx` | Transición de ruta | Añade `min-h-screen` alrededor de un hijo `h-[100dvh]`. |
| `src/App.tsx` | Rutas y providers | Rutas de chat en `:100` y `:108`; no hay ruta merchant. |
| `src/index.css` | Safe areas, tipografía, select-none | `.pb-safe`/`.pt-safe`; `body select-none`; clases de chat sin uso. |
| `tailwind.config.js` | Tokens, radios, sombras | `--primary` verde; `xs` de radio = 14 px; no existe `shadow-2xs`. |
| `src/providers/QueryProvider.tsx` | QueryClient interno | `staleTime` 5 min, `retry` 1, sin `refetchOnWindowFocus`. |
| `src/providers/trpc.tsx` | QueryClient externo y cliente tRPC | Crea un segundo QueryClient; `handleAuthError` distinto. |
| `src/main.tsx` | Providers globales | TRPCProvider > CartProvider > CustomerSessionProvider > App. |
| `src/pages/customer/OrderTracking.tsx` | Entrada al chat y SSE de pedido | FAB solo si no entregado/cancelado; usa `useOrderEvents`. |
| `src/pages/driver/DriverOrder.tsx` | Entrada al chat driver y SSE | FAB si no entregado; usa `useOrderEvents`. |
| `server/chat-router.ts` | Contrato de chat | `send`, `getByOrder`, `markAsRead`, todos `publicQuery`. |
| `server/order-router.ts` | Pedido y estados | `getById` público; `updateStatus` público; emite eventos de pedido. |
| `server/events.ts` | Bus SSE y push | Bus en memoria; push de order solo al customer. |
| `server/boot.ts` | Endpoints SSE | Order/commerce/driver sin auth; admin sí valida. |
| `server/middleware.ts` | Procedimientos autenticados | Existen `customerQuery`, `driverQuery`, `merchantQuery`, no se usan en chat. |
| `server/context.ts` | Contexto de auth | Resuelve customer/driver/merchant desde cookies. |
| `server/customer-router.ts` | Auth/PII de clientes | `getById`/`list` públicos; `checkAuth`. |
| `server/driver-router.ts` | Auth/estado de drivers | Emite `location_update` al canal driver. |
| `server/commerce-router.ts` | Comercio | No hay procedimientos de chat. |
| `db/schema.ts` | Tablas | `chat_messages` sin índices ni restricciones de participación. |
| `db/migrations/0000_dear_shooting_star.sql` | DDL de chat | Tabla `chat_messages` sin índices. |
| `api/vercel.ts` | Adaptador serverless | El bus en memoria no cruza instancias (hipótesis de despliegue). |

---

## 5. Hallazgos

### 5.1 Tabla de hallazgos

| ID | Severidad | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| **CHAT-01** | **P0** | Autorización / IDOR | `server/chat-router.ts:9-24` | `send` es `publicQuery` y confía en `senderType`, `senderId` y `senderName` enviados por el cliente. | Cualquiera puede escribir en cualquier pedido, suplantar driver/commerce o inyectar mensajes que el cliente ve como propios. | Usar `customerQuery`/`driverQuery`/`merchantQuery`, derivar identidad de `ctx`, verificar que el pedido pertenece al cliente, está asignado al driver o contiene items del comercio; validar estado activo. |
| **CHAT-02** | **P0** | Privacidad / IDOR | `server/chat-router.ts:26-35` | `getByOrder` es público y devuelve todos los mensajes y `senderId` de cualquier `orderId`, sin paginación. | Lectura de conversaciones ajenas, instrucciones de entrega, teléfonos y nombres; enumeración por ID secuencial. | Igual que CHAT-01 más `limit`/cursor, proyección mínima de columnas y verificación de participación. |
| **CHAT-03** | P1 | Autorización / SSE | `server/boot.ts:72-89` | El stream `/api/events/orders/:orderId` no valida cookie ni pertenencia; el stream admin sí lo hace en `:130-147`. | Cualquiera puede observar actividad de cualquier pedido y abrir conexiones sin límite. El mismo patrón en `/api/events/driver/:driverId` (`:110-127`) expone ubicación en vivo (P0 fuera del alcance de `/chat`). | Autenticar antes de `streamSSE`, verificar participación y aplicar límite de conexiones. |
| **CHAT-04** | P1 | Abuso / DoS | `server/chat-router.ts:16`; `server/boot.ts:34` | `message` solo tiene `.min(1)`, sin `.trim()` ni máximo; el body global admite 50 MB. | Spam, mensajes gigantes que se descargan en cada poll, crecimiento de DB y freeze del cliente. | `.trim().min(1).max(2000)`, rate limit por usuario/pedido, límite de body específico y moderación. |
| **CHAT-05** | P1 | Tiempo real | `src/pages/customer/Chat.tsx:61-62`; `src/hooks/useDeliveryData.ts:308-315` | El chat no monta `useOrderEvents`; solo hace polling cada 5 s. | Hasta 5 s de latencia, “en línea” engañoso, más carga que SSE. | Montar un hook SSE específico del chat con fallback de polling lento y un solo QueryClient. |
| **CHAT-06** | P1 | Producto / contrato | `src/App.tsx:100-116`; `src/components/ChatBubble.tsx:25` | No existe ruta, entrada ni pantalla de chat para comercio; el API acepta `senderType: "commerce"` pero nadie lo usa. | El cliente no puede chatear realmente con el comercio; el encabezado promete soporte inexistente. | Añadir ruta/entrada merchant, guard y verificación de que el pedido contiene items del comercio, o corregir el copy y el contrato. |
| **CHAT-07** | P1 | UX / errores | `src/pages/customer/Chat.tsx:78-93`; `src/pages/driver/DriverChat.tsx:53-68` | El `catch` solo hace `console.error`; no hay toast, estado de error, reintento ni outbox. | El usuario cree que envió, reintenta y duplica; en offline pierde el mensaje. | Estado por mensaje (`sending`, `sent`, `failed`), reintento y persistencia de borrador/outbox. |
| **CHAT-08** | P1 | Duplicados / idempotencia | `src/pages/customer/Chat.tsx:209-217`, `:226`, `:232` | `isPending` solo deshabilita el botón de enviar; Enter y los atajos siguen llamando `handleSend`; no hay `clientNonce` ni dedupe. | Doble POST y burbujas duplicadas; un reintento tras respuesta perdida inserta otra fila. | Guardar `if (isPending) return`, deshabilitar atajos y añadir idempotency key única por mensaje con constraint. |
| **CHAT-09** | P1 | Estado leído | `src/pages/customer/Chat.tsx:72-76`; `src/pages/driver/DriverChat.tsx:47-51`; `server/chat-router.ts:37-50` | `markAsRead` se ejecuta solo al montar, no al recibir mensajes nuevos; no emite SSE, actualiza un `isRead` global y es público, sin verificar lector ni pedido. | El remitente ve “enviado” aunque el receptor esté mirando el chat; cualquiera puede falsificar acuses; no hay lectura por participante. | Marcar al recibir si la pestaña está visible, autenticar y verificar participación, emitir evento `read`; tabla de lecturas por participante. |
| **CHAT-10** | P1 | Estados UI | `src/hooks/useDeliveryData.ts:308-315`; `Chat.tsx:194-204` | `loading` se devuelve pero no se usa; `data ?? []` convierte error en lista vacía; no hay skeleton ni retry. | Falso “no hay mensajes” durante carga/error; layout shift; usuario sin salida. | Ramas `isLoading`, `isError`, skeleton y botón de reintento; no mostrar vacío hasta resolver. |
| **CHAT-11** | P1 | Rendimiento / datos | `server/chat-router.ts:26-35`; `db/schema.ts:220-229` | Historial completo sin `limit` ni cursor; no hay índice en `order_id`/`created_at`; se descarga todo cada 5 s. | Payload y tiempo de render crecen sin límite; scans de tabla; TTI degradado. | Paginación por cursor `(created_at, id)`, `LIMIT 50`, índice `(order_id, id)` y proyección de columnas. |
| **CHAT-12** | P1 | Push | `server/chat-router.ts:22`; `server/events.ts:68-89` | `chat.send` emite al canal `order:N`; el push de order siempre va al customer, incluso si el emisor es el customer, y no hay push al driver ni commerce. | Notificación al propio remitente y driver que nunca se entera de un mensaje nuevo; copy genérico. | Saltar el push al emisor, emitir al canal del destinatario y añadir título/body/deep link específicos de chat. |
| **CHAT-13** | P2 | Ciclo de vida | `Chat.tsx:61`; `OrderTracking.tsx:250`; `DriverOrder.tsx:472`; `chat-router.ts:19-23` | El servidor no comprueba estado del pedido; la URL directa sigue accesible tras `delivered`/`cancelled`. | Chat post-entrega/cancelación, acoso y retención indefinida; el driver ve el FAB en cancelados. | Cargar el pedido, mostrar estado cerrado y rechazar escrituras en estados terminales. |
| **CHAT-14** | P2 | Pérdida de borrador | `Chat.tsx:81-88`, `:209-213`; `DriverChat.tsx:56-63` | `setText("")` ocurre después del `await` y también al enviar un atajo, borrando lo que el usuario escribió mientras esperaba. | Pérdida silenciosa de texto; el atajo borra el borrador. | Limpiar solo el texto enviado y preservar cambios posteriores; no tocar el input al usar atajos. |
| **CHAT-15** | P2 | Scroll | `Chat.tsx:66-70`, `:129` | Cada cambio de `messages` hace `scrollTop = scrollHeight`, sin detectar si el usuario está leyendo arriba; no hay píldora de “nuevos mensajes”. | El historial salta al fondo con cada mensaje/poll y es imposible leer mensajes anteriores. | Detectar cercanía al fondo, preservar posición y mostrar botón/píldora de nuevos mensajes. |
| **CHAT-16** | P2 | No leídos / badge | `src/components/ChatBubble.tsx:31-38` | El FAB muestra un punto verde `animate-pulse` permanente; no hay contador ni último leído. | Falsa sensación de “en línea”/“no leído”; el usuario no sabe si hay mensajes nuevos. | Contador de no leídos por pedido y estado leído persistido; punto solo si hay no leídos. |
| **CHAT-17** | P2 | Presencia / identidad | `Chat.tsx:121-124`; `DriverChat.tsx:80-90` | “Repartidor y soporte en línea” y “En línea” están hardcodeados; DriverChat muestra el inicial del propio driver, no del interlocutor. | Confianza falsa; el usuario no sabe con quién habla ni si está disponible. | Cargar pedido/driver, mostrar nombre, rol, estado real y última actividad. |
| **CHAT-18** | P2 | Layout / móvil | `DriverChat.tsx:74`, `:95`, `:162`; `index.css:128-145` | `min-h-screen` sin altura fija ni `min-h-0`; no usa `pt-safe`/`pb-safe`. La lista crece y el input queda debajo del fold; notch/home indicator sin protección. | Input inaccesible sin scrollear; solapamiento con status bar/gesture bar en iOS/Android. | `h-[100dvh]` + `flex-1 min-h-0` + `pt-safe`/`pb-safe`, como el chat cliente. |
| **CHAT-19** | P2 | Privacidad / confianza | `DriverChat.tsx:139-145` | El estado vacío afirma “Los mensajes están cifrados”; no hay cifrado E2E ni de aplicación, el texto se guarda plano. | Afirmación engañosa y riesgo legal/reputacional. | Eliminar la frase o implementar cifrado real y documentarlo. |
| **CHAT-20** | P2 | Validación | `server/chat-router.ts:16`; `Chat.tsx:79`; `db/schema.ts:226` | El cliente hace `trim`, pero el servidor acepta `"   "`, saltos de línea y tamaños enormes. | Spam visual, mensajes vacíos, freezes y payloads gigantes. | `.trim().min(1).max(...)` en Zod; normalizar y limitar líneas. |
| **CHAT-21** | P2 | Arquitectura / caché | `src/providers/trpc.tsx:24-47`, `:64-71`; `src/providers/QueryProvider.tsx:5-19`; `useOrderEvents.ts:120-124` | Hay dos `QueryClient` anidados; `useChatMessages` vive en el interno y `trpc.useUtils()` en el externo. El `utils.chat` del hook apunta al cache externo; solo la invalidación explícita del `queryClient` interno refresca la lista. | Invalidaciones que no llegan, doble fetch y caché dividida; añadir SSE con solo `utils.chat` no funcionaría. | Un solo QueryClient compartido; eliminar la doble invalidación. |
| **CHAT-22** | P2 | SSE / reconexión | `useOrderEvents.ts:5-7`, `:24-38`, `:74-95`; `server/events.ts:9`; `api/vercel.ts:1-4` | Se rinde tras 10 fallos, no hay `Last-Event-ID` ni replay, y el bus es memoria del proceso. | Tras una caída larga el stream queda muerto hasta remontar; en serverless/multinstancia los eventos no cruzan procesos (hipótesis de despliegue). | Backoff con estado visible, `Last-Event-ID`, replay o volver a polling; pub/sub externo (Redis) si hay varias instancias. |
| **CHAT-23** | P2 | Sesión / guard | `SessionGuard.tsx:14-21`, `:45-61`; `App.tsx:100` | El guard customer confía en `localStorage`; no valida cookie ni pertenencia al pedido. | Bypass trivial del guard; sesión válida sin `qs_session` redirige; sesión inválida con storage forjado entra. | Verificar `customer.checkAuth` y cargar el pedido antes de renderizar; el servidor debe ser la fuente de verdad. |
| **CHAT-24** | P2 | UX / selección | `Chat.tsx:99`; `src/index.css:6-12` | `select-none` en el contenedor raíz y `-webkit-touch-callout: none` impiden seleccionar/copiar mensajes y el número de pedido. | No se puede copiar una dirección o un teléfono; mala experiencia. | Permitir selección dentro de las burbujas; mantener `select-none` solo en chrome de UI. |
| **CHAT-25** | P2 | Accesibilidad | `Chat.tsx:102-108`, `:129`, `:208-217`, `:222-229` | El input no tiene `<label>`/`aria-label`; la lista no es `role="log"` ni `aria-live`; el back mide 36 px y los atajos ~28 px. | Lectores de pantalla no anuncian mensajes; controles difíciles de tocar. | `aria-label`, `role="log"`, `aria-live="polite"`, `time`, targets de 44 px y foco visible. |
| **CHAT-26** | P2 | Contraste / tipografía | `Chat.tsx:149-151`, `:166-184`; `index.html:5` | Texto blanco sobre naranja ≈2.9:1; timestamps blanco/80 ≈2.3:1; nombre naranja sobre `#F7F7FA` ≈2.7:1; mensajes de 12 px; viewport con `user-scalable=no`. | Baja legibilidad y incumplimiento WCAG AA; usuarios no pueden hacer zoom. | Usar texto oscuro o fondo más claro, 14-16 px y permitir zoom. |
| **CHAT-27** | P2 | Validación de ruta | `Chat.tsx:58-62`, `:117` | `Number(orderId)` puede ser `NaN` o un pedido inexistente; se muestra “Chat del Pedido #NaN” y un vacío, y el envío falla por FK sin mensaje. | Pantalla rota/confusa; errores 500 silenciosos. | Validar entero positivo, cargar pedido, mostrar 404/RO e impedir envío si no existe. |
| **CHAT-28** | P2 | Rendimiento de render | `Chat.tsx:39-55`, `:95`, `:139-190` | `groupMessagesByDate`, `isMine` y `toLocaleTimeString` se recalculan en cada render, incluido cada keystroke; no hay memoización ni virtualización. | Lag al escribir con historiales largos y en dispositivos de gama baja. | `useMemo` para grupos/formatters, `React.memo` por burbuja y virtualización si supera ~100 mensajes. |
| **CHAT-29** | P2 | Layout / teclado | `Chat.tsx:99`; `PageTransition.tsx:52`; `index.css:109-118` | El wrapper añade `min-h-screen` (100vh) alrededor de un hijo `h-[100dvh]`; hay `h-screen` y `h-[100dvh]` duplicados. No hay `visualViewport` ni plugin de teclado. | En iOS/Android el teclado puede tapar el input o generar scroll de página; diferencia 100vh/100dvh (hipótesis a verificar en dispositivo). | Un solo `h-dvh`, eliminar `min-h-screen` del wrapper para esta ruta y ajustar con `visualViewport`/`Keyboard` de Capacitor. |
| **CHAT-30** | P2 | Privacidad / caché | `src/hooks/useCustomerSession.tsx:83-93` | `logout` no limpia el `QueryClient`; la caché de chat (gcTime 30 min en el interno) sobrevive al cambio de cuenta. | En un dispositivo compartido, el siguiente usuario puede ver mensajes cacheados de la sesión anterior. | `queryClient.clear()` en logout y en `handleAuthError`. |
| **CHAT-31** | P2 | Red / timeout | `useDeliveryData.ts:36-39`, `:55-60` | `fetch` no tiene `AbortController` ni timeout; un envío colgado deja `isPending` y el botón bloqueado. | El chat queda inutilizable sin forma de cancelar/reintentar. | Timeout con `AbortSignal` y estado de error/reintento. |
| **CHAT-32** | P3 | Producto | `server/chat-router.ts:8-52`; `Chat.tsx:222-229` | No hay adjuntos, imágenes, edición ni borrado; solo texto. | No se puede enviar foto de dirección/comprobante ni corregir un mensaje. | Añadir tipo de mensaje y adjuntos con validación si el producto lo requiere; o documentar la limitación. |
| **CHAT-33** | P3 | Contrato / datos | `server/chat-router.ts:34`, `:15`; `db/schema.ts:225` | Orden solo por `createdAt` (empates no deterministas); `senderName` sin máximo en Zod pero `varchar(200)` en DB. | Orden inestable y error 500 con nombres largos. | `orderBy(createdAt, id)` y `.max(200)` en `senderName`. |
| **CHAT-34** | P3 | Deuda visual | `Chat.tsx:134`, `:147`, `:208`, `:213`; `tailwind.config.js:52-61`; `index.css:231-272`; `DriverChat.tsx:109` | `shadow-2xs`/`backdrop-blur-xs` no están definidos; `items-end` y `order-1` son no-ops; `rounded-tr-xs` vale 14 px por el token, no una cola pequeña; CSS de chat sin uso. | Pulido inconsistente y confusión de mantenimiento. | Definir tokens reales, eliminar clases muertas y unificar burbujas. |
| **CHAT-35** | P3 | Rendimiento | `Chat.tsx:89`; `useDeliveryData.ts:318-324` | Tras enviar se llama `refresh()` además de la invalidación de `onSuccess`. | Dos GET redundantes por mensaje. | Eliminar `refresh()` y confiar en la invalidación, o viceversa. |
| **CHAT-36** | P3 | Testing | Repo | No se encontraron tests de chat ni de contrato SSE. | Regresiones de autorización, duplicados y estados pasan desapercibidas. | Tests de integración tRPC (auth/IDOR, duplicados) y E2E de dos sesiones. |

### 5.2 Detalle de hallazgos críticos

#### CHAT-01 — Escritura anónima y suplantación (P0)

`send` es `publicQuery` y el handler no recibe `ctx` (`server/chat-router.ts:9-23`). El input permite elegir el emisor:

```ts
z.object({
  orderId: z.number(),
  senderType: z.enum(["customer", "commerce", "driver"]),
  senderId: z.number(),
  senderName: z.string(),
  message: z.string().min(1),
})
```

Luego inserta `input` completo (`:21`). Consecuencias concretas:

1. **Escribir como driver/commerce:** un atacante puede enviar un mensaje con `senderType: "driver"` y `senderName: "Rapidy Soporte"`; el cliente lo muestra como mensaje entrante con ese nombre (`Chat.tsx:148-152`).
2. **Inyectar mensajes que parecen del propio cliente:** si envía `senderType: "customer"`, `isMine` devuelve `true` (`Chat.tsx:96`) y la burbuja se renderiza alineada a la derecha como si la víctima lo hubiera escrito. Sirve para fraudes del tipo “yo ya pagué” o “cancela el pedido”.
3. **Escribir en pedidos ajenos:** no se comprueba `order.customerId`, `order.driverId` ni que el comercio tenga items en el pedido.

Reproducción mínima sin cookies:

```powershell
$payload = '{"json":{"orderId":1,"senderType":"driver","senderId":999,"senderName":"Rapidy Soporte","message":"Prueba de escritura anónima"}}'
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/trpc/chat.send' -ContentType 'application/json' -Body $payload
```

Si responde con la fila insertada, el P0 está confirmado.

Fix mínimo: procedimiento autenticado + identidad desde `ctx` + verificación de participación. Para cliente, `ctx.customer.id === order.customerId`; para driver, `ctx.driver.id === order.driverId`; para comercio, que exista `order_items` con `commerceId` del merchant autenticado.

#### CHAT-02 — Lectura anónima de conversaciones (P0)

`getByOrder` es `publicQuery` y devuelve `select()` completo (`server/chat-router.ts:26-35`), incluyendo `senderId`, `senderName`, `message` e `isRead`. No hay `limit`. La única validación es que `orderId` sea número.

Agravantes verificados:

- `order.getById` es público y devuelve `deliveryAddress`, `customerPhone`, items, historial y datos del driver (`server/order-router.ts:125-173`).
- `customer.getById` es público y devuelve la fila completa del cliente, incluido `fcmToken` (`server/customer-router.ts:85-90`; `db/schema.ts:66-74`).
- `customer.list` también es público (`server/customer-router.ts:111-114`).
- Los `orderId` son seriales correlativos (`db/schema.ts:160`), por lo que la enumeración es trivial.

Por tanto, un `senderId` obtenido del chat se puede resolver contra esos endpoints para obtener nombre, teléfono, dirección y token FCM. Aunque el alcance sea `/chat`, esto convierte una fuga de mensajes en una fuga de PII y de tokens de notificación.

#### CHAT-03 — SSE sin autorización (P1)

`/api/events/orders/:orderId` crea el stream sin mirar cookies (`server/boot.ts:72-89`). El endpoint de admin, en cambio, valida `quickgo_admin` y refresh antes de abrir (`:130-147`), lo que demuestra que el patrón de protección existe pero no se aplicó a pedidos.

Impacto directo en chat: un tercero puede suscribirse al `orderId` de la víctima y recibir `{type:"chat_message", orderId}` cada vez que alguien escribe, además de eventos de estado. No recibe el cuerpo del mensaje, pero sí actividad y timing. El mismo archivo deja sin auth `/api/events/driver/:driverId` (`:110-127`); ese canal transporta `location_update` (`server/driver-router.ts:92`), por lo que expone ubicación en vivo de cualquier driver por ID.

#### CHAT-05 — El “tiempo real” del chat es polling (P1)

Evidencia:

- `Chat.tsx` solo importa `useChatMessages`, `useSendChatMessage`, `trpcMutate` (`:29-30`); no importa `useOrderEvents`.
- `useChatMessages` define `refetchInterval: 5000` (`useDeliveryData.ts:313`).
- `useOrderEvents` solo se invoca en `OrderTracking.tsx:54` y `DriverOrder.tsx:64`. Búsqueda global: no hay otra invocación.
- El SSE de chat se emite en `chat-router.ts:22`, pero el canal `order:N` no tiene suscriptor en la pantalla de chat.

Consecuencia: el cliente y el driver ven mensajes nuevos con hasta 5 s de retraso; el segundo poll puede coincidir con el POST y provocar GET redundantes. El encabezado “Repartidor y soporte en línea” y el punto verde del FAB sugieren inmediatez/presencia que no existen.

#### CHAT-06 — No hay chat de comercio (P1)

- `ChatBubble` solo acepta `"customer" | "driver"` (`ChatBubble.tsx:25`) y construye `/chat` o `/driver/chat` (`:28`).
- `App.tsx` solo define rutas de chat para customer (`:100`) y driver (`:108`); las rutas de comercio (`:111-116`) no incluyen chat.
- No hay ninguna coincidencia de `chat` en `src/pages/commerce` (búsqueda realizada).
- El backend acepta `senderType: "commerce"` (`chat-router.ts:13`), pero no hay cliente que lo use; los mensajes de comercio nunca se producen desde la app.

El chat es un hilo único por pedido. En pedidos multi-comercio, no hay forma de dirigirse a un comercio concreto ni de que cada comercio vea solo su parte. El copy “soporte” (`Chat.tsx:123`) tampoco corresponde a un rol real: el enum solo tiene customer/commerce/driver (`db/schema.ts:38`).

#### CHAT-07 y CHAT-08 — Envío sin estado y con doble submit (P1)

No hay mutación optimista: `useSendChatMessage` no tiene `onMutate` y solo invalida al terminar (`useDeliveryData.ts:318-324`). El flujo es POST → INSERT → GET completo. Mientras tanto:

- El botón de enviar se deshabilita (`Chat.tsx:232`), pero el input sigue activo y `onKeyDown` llama `handleSend(text)` sin comprobar `isPending` (`:226`).
- Los atajos llaman `handleSend(qm)` directamente y no están deshabilitados (`:209-217`).
- No hay `clientNonce` ni constraint de deduplicación; dos POST idénticos crean dos filas (`chat-router.ts:21`).

Duplicados posibles:

1. Doble Enter rápido.
2. Doble clic/tap en un atajo.
3. Envío exitoso con respuesta perdida: el cliente no ve la burbuja, el usuario reintenta y se inserta otra fila.
4. Futuro optimista + SSE sin dedupe: hoy no ocurre porque no hay optimismo, pero el diseño no está preparado.

#### CHAT-09 — Acuses de lectura incompletos (P1)

`markAsRead` se ejecuta en un efecto con dependencias `[orderId, customer]` (`Chat.tsx:72-76`), no `messages`. Si el chat está abierto y llega un mensaje nuevo por polling, el efecto no se vuelve a ejecutar y el mensaje queda `is_read = "no"` hasta que el usuario salga y vuelva a entrar. Lo mismo en driver (`DriverChat.tsx:47-51`).

Además, `markAsRead` es `publicQuery` (`chat-router.ts:37-50`), no verifica que el llamante sea participante ni que el pedido exista, actualiza todas las filas cuyo `senderType` sea distinto del lector (`:41-49`), sin distinguir lector concreto, y no emite SSE. En un hilo con customer + driver + commerce, el primer lector marca el mensaje como leído para todos; no hay estado “entregado” vs “leído” ni `readAt`.

#### CHAT-11 — Historial sin paginación ni índice (P1)

`getByOrder` no acepta `limit`, `cursor` ni `before` (`chat-router.ts:27`); hace `select()` de todas las columnas y ordena por `createdAt` (`:30-34`). La tabla no tiene índices (`db/schema.ts:220-229`; migración `0000_dear_shooting_star.sql:29-38`; grep de `CREATE INDEX` sin resultados).

Con 5 s de polling, un pedido con 5.000 mensajes descarga 5.000 filas cada 5 s y las renderiza todas. `markAsRead` también actualiza todas las filas del pedido sin filtrar `is_read = 'no'`. El coste crece de forma lineal con el historial y afecta a todos los clientes de ese pedido.

#### CHAT-22 — Fugas y reconexión SSE (P2)

- En `useOrderEvents`, el cleanup del hook cierra el `EventSource` (`useOrderEvents.ts:127`), lo cual es correcto. Pero si `connect()` se difiere porque la pestaña está oculta, añade un listener `visibilitychange` (`:30-37`) que `close()` no remueve (`:100-108`); si el componente se desmonta mientras la pestaña sigue oculta, el listener y su closure permanecen hasta el próximo cambio de visibilidad. Es una fuga pequeña, pero real.
- `OrderTracking` abre un `EventSource` propio para la ubicación del driver (`OrderTracking.tsx:100-120`). En `onerror` hace `eventSource.close()` y **no** reconecta; un solo fallo deja la ubicación congelada hasta remontar la pantalla.
- No hay `Last-Event-ID`, `id:` por evento ni replay (`server/boot.ts:42-49`); los eventos son solo invalidaciones, así que un evento perdido se recupera por el siguiente poll (si existe) o no se recupera. El bus en memoria (`server/events.ts:9`) no cruza procesos en serverless/multinstancia (hipótesis de despliegue).

### 5.3 Matriz de estados UI

| Estado | Implementación actual | Evidencia | Resultado |
|---|---|---|---|
| **Loading** | `loading` se devuelve pero no se usa; el vacío se pinta de inmediato. | `useDeliveryData.ts:315`; `Chat.tsx:61`, `:194-204` | Falso “sin mensajes” y layout shift al llegar la lista. No hay skeleton. |
| **Error de carga** | `data ?? []` convierte el error en `[]`; no hay rama `isError`. | `useDeliveryData.ts:315`; `Chat.tsx:194` | El usuario ve el estado vacío y el input; no hay reintento ni explicación. |
| **Vacío** | Estado diseñado con icono y copy. | `Chat.tsx:194-204` | Correcto visualmente, pero se confunde con loading/error. |
| **Offline** | No hay detección ni banner; `retry: 1` global. | `QueryProvider.tsx:15`; `Chat.tsx:90-92` | El envío falla en consola; el polling se detiene o falla; no hay outbox. |
| **Sesión expirada** | El guard customer solo mira localStorage; los procedimientos de chat son públicos. | `SessionGuard.tsx:14-21`, `:45-61`; `chat-router.ts:9`, `:26`, `:37` | Una cookie expirada no produce 401: el chat sigue leyendo/escribiendo. Si falta `qs_session`, redirige aunque la cookie sea válida. |
| **Enviando** | Solo `sendChat.isPending` deshabilita el botón; no hay estado por burbuja. | `Chat.tsx:232` | No se distingue “enviando” de “enviado”; Enter/atajos siguen enviando. |
| **Enviado** | Check simple cuando `isRead !== "yes"`. | `Chat.tsx:176-182` | Visible solo después del POST + GET. |
| **Leído** | Doble check si el `isRead` global es `"yes"`. | `Chat.tsx:178-179`; `chat-router.ts:43` | Puede quedar en un check aunque el receptor esté en el chat; no es por participante. |
| **Error de envío** | `console.error(err)`; sin toast ni burbuja fallida. | `Chat.tsx:90-92` | El mensaje puede perderse o duplicarse al reintentar. |
| **Reintentar** | No existe. | — | Sin salida salvo volver a escribir. |
| **Pedido cerrado** | No hay estado; el servidor no valida `delivered`/`cancelled`. | `chat-router.ts:19-23`; `Chat.tsx:61` | El chat sigue escribible por URL directa. |
| **Skeletons** | No hay. | — | Layout shift. |
| **Safe area iOS** | Cliente usa `pt-safe`/`pb-safe`; driver no. | `Chat.tsx:101`, `:221`; `DriverChat.tsx:74`, `:162`; `index.css:128-145` | Cliente correcto; driver expuesto a notch/home indicator. |
| **Auto-scroll** | Fuerza `scrollTop = scrollHeight` en cada cambio. | `Chat.tsx:66-70` | Salta al fondo aunque el usuario esté leyendo historial. |
| **Scroll al cargar historial** | No hay paginación ni carga hacia arriba. | `chat-router.ts:26-35` | Todo se renderiza de una vez; no se preserva posición. |
| **“Nuevos mensajes”** | No hay píldora, divisor ni botón. | — | El usuario no sabe que llegó algo si está arriba. |
| **320–430 px** | Cliente aceptable; driver con layout no fijado. | `Chat.tsx:147`; `DriverChat.tsx:74`, `:95` | Sin scroll horizontal en el caso normal; nombres largos pueden desbordar. |
| **Teclado** | No hay `visualViewport` ni plugin de teclado; `100dvh` + wrapper `min-h-screen`. | `Chat.tsx:99`; `PageTransition.tsx:52` | Riesgo de input tapado en iOS/Android (hipótesis a verificar en device). |

---

## 6. Inconsistencias visuales

### 6.1 Paletas y tokens

| Elemento | Cliente | Driver | Token/esperado | Evidencia |
|---|---|---|---|---|
| Cabecera | `#0E0E12` | `#075E54` (verde WhatsApp) | Dark Velvet `#0A0A0D`/`#0E0E12` | `Chat.tsx:101`; `DriverChat.tsx:76` |
| Fondo mensajes | `#F7F7FA` | `#ECE5DD` | Fondo luminoso Rapidy | `Chat.tsx:129`; `DriverChat.tsx:95` |
| Burbuja propia | Gradiente `#FF5E00`→`#FF6A00` | `#DCF8C6` | Flame Orange | `Chat.tsx:157`; `DriverChat.tsx:116` |
| Burbuja ajena | Blanca con borde zinc | Blanca con sombra | Blanco nítido | `Chat.tsx:158`; `DriverChat.tsx:117` |
| Cabecera/avatar | Icono Bike + Sparkles | Inicial del propio driver | Identidad del interlocutor | `Chat.tsx:110-119`; `DriverChat.tsx:80-84` |
| Acento | `#FF6A00` hardcodeado | `#2E7D32`/`#075E54` | `--primary` es verde (`122 39% 33%`) | `index.css:27`, `:39`; `Chat.tsx:233` |
| Estado vacío | Icono naranja + copy de repartidor | Texto “cifrados” | Copy neutral y veraz | `Chat.tsx:194-204`; `DriverChat.tsx:139-145` |
| FAB | Naranja, punto verde pulsante | Igual | Sin badge falso | `ChatBubble.tsx:31-38` |

Los hardcodes de marca están dispersos: `#FF6A00` en `Chat.tsx:110`, `:119`, `:149`, `:157`, `:196`, `:213`, `:228`, `:233`; `#FF5E00` en `:157`; `#0E0E12` en `:101`; `#F7F7FA` en `:99`, `:129`; `#075E54` en `DriverChat.tsx:76`, `:174`; `#ECE5DD` en `:95`; `#DCF8C6` en `:116`; `#2E7D32` en `DriverChat.tsx` y en el tema. No hay un token `brand`/`flame` en `tailwind.config.js`.

### 6.2 Radios, sombras y clases muertas

- `tailwind.config.js:52-58` redefine `xs` como `calc(var(--radius) - 6px)` = 14 px. Por eso `rounded-tr-xs` (`Chat.tsx:157`) no produce una cola pequeña: queda casi igual que `rounded-2xl` (16 px). El efecto de cola se pierde.
- `items-end` en `Chat.tsx:147` está en un `div` de bloque, no en un flex/grid; no hace nada. Igual `order-1` en ambas ramas de `DriverChat.tsx:109`.
- `shadow-2xs` (`Chat.tsx:134`, `:213`) no está definido en `tailwind.config.js:59-61` (solo `xs`); probablemente no genera sombra. `backdrop-blur-xs` (`Chat.tsx:208`) tampoco es una utilidad por defecto de Tailwind 3.4; verificar en el CSS compilado.
- `index.css:231-272` define `.chat-bg`, `.chat-bubble-mine` y `.chat-bubble-other`, pero no se usan en ninguna pantalla (búsqueda global solo devuelve las definiciones). DriverChat usa estilos inline equivalentes.
- `ChatBubble.tsx` no es una burbuja de mensaje: es un FAB. El nombre induce a error y el archivo no contiene el render de mensajes.

### 6.3 Tipografía, contraste y táctil

- Los mensajes móviles usan `text-xs` (12 px) (`Chat.tsx:161`); el nombre del emisor y los timestamps usan 10 px (`:149`, `:166-174`). Para lectura de conversaciones es pequeño.
- Contraste aproximado: blanco sobre `#FF6A00` ≈ **2.9:1**; blanco al 80% sobre naranja ≈ **2.3:1**; `#FF6A00` sobre `#F7F7FA` ≈ **2.7:1**. Todos por debajo de 4.5:1 para texto normal. El texto de las burbujas propias y los timestamps es el más afectado.
- El botón volver del cliente mide `w-9 h-9` = 36 px (`Chat.tsx:104`), por debajo de 44 px. Los atajos tienen `py-1.5` + `text-xs`, aproximadamente 28 px de alto (`:213`). El botón enviar sí es 44 px (`:233`).
- `index.html:5` fija `maximum-scale=1.0, user-scalable=no`, lo que impide zoom y agrava el texto pequeño.
- `Chat.tsx:99` aplica `select-none` al contenedor raíz; `index.css:6-12` también bloquea selección en `body`. No se pueden copiar direcciones, teléfonos ni el número de pedido.

### 6.4 Layout, safe areas y 320–430 px

- Cliente: `h-screen h-[100dvh]` + `pt-safe`/`pb-safe` (`Chat.tsx:99`, `:101`, `:221`). Bien encaminado, pero el wrapper `PageTransition` añade `min-h-screen` (`PageTransition.tsx:52`) y puede crear una página más alta que el viewport.
- Driver: `min-h-screen` sin `h-[100dvh]`, sin `min-h-0` en la lista y sin safe areas (`DriverChat.tsx:74`, `:95`, `:162`). En un chat con muchos mensajes el contenedor crece y el input queda al final del documento, no fijo al viewport.
- 320–430 px: el cliente aguanta reasonably bien; el título trunca (`Chat.tsx:116-118`), las burbujas usan `max-w-[80%]` y `break-words` (`:147`, `:161`). El nombre del emisor no tiene truncado ni `break-words`; un `senderName` de 200 caracteres sin espacios puede desbordar. Los chips de atajos hacen scroll horizontal intencional (`:208`), correcto.
- El FAB está en `bottom-6 right-4` sin `safe-area` (`ChatBubble.tsx:33`); en iPhone puede quedar sobre el home indicator y tapar contenido/acciones del tracking.
- No hay bottom nav en Chat (correcto), por lo que el input no compite con `CustomerBottomNav`; el riesgo es el teclado y el wrapper.

---

## 7. Fluidez y performance

### 7.1 Quick wins (bajo esfuerzo, alto impacto)

| Acción | Evidencia | Efecto |
|---|---|---|
| Montar SSE en Chat y bajar polling a 30 s como fallback | `Chat.tsx:61-62`; `useOrderEvents.ts:112-129` | Latencia casi inmediata y menos GET. |
| Un solo `QueryClient` | `providers/trpc.tsx:24-47`; `QueryProvider.tsx:5-19` | Elimina doble caché, dobles invalidaciones y fetches duplicados. |
| `limit 50` + cursor + índice `(order_id, id)` | `chat-router.ts:26-35`; `schema.ts:220-229` | Payload acotado y query indexada. |
| `useMemo` para grupos/formatters y `memo` por burbuja | `Chat.tsx:39-55`, `:95`, `:139-190` | Menos trabajo por keystroke y por poll. |
| Eliminar `refresh()` tras enviar | `Chat.tsx:89`; `useDeliveryData.ts:322` | Un GET menos por mensaje. |
| Limpiar draft antes/durante el envío sin pisar texto nuevo | `Chat.tsx:81-88` | Evita pérdida de borrador. |
| `trim`/`max` y rate limit en servidor | `chat-router.ts:16`; `boot.ts:34` | Evita spam y payloads gigantes. |
| Prefetch del chunk de Chat al abrir el FAB | `App.tsx:21`; `ChatBubble.tsx:31` | Menos espera al entrar. |
| `queryClient.clear()` en logout | `useCustomerSession.tsx:83-93` | Evita fuga entre cuentas. |

### 7.2 Profundo

1. **SSE autenticado y con replay:** token/cookie + verificación de participación, `id:` por evento, `Last-Event-ID`, replay desde DB o vuelta a polling; pub/sub Redis si hay más de una instancia (`server/events.ts:9`).
2. **Virtualización del historial:** `@tanstack/react-virtual` o similar; burbujas memoizadas; carga de páginas anteriores al hacer scroll hacia arriba.
3. **Outbox/idempotencia:** `clientNonce` único, estado local por mensaje, reintento exponencial, dedupe en DB. Esto resuelve duplicados y offline de forma estructural.
4. **Modelo de lectura por participante:** tabla `chat_reads (order_id, participant_type, participant_id, last_read_message_id)` en lugar de un `is_read` global; evento SSE de lectura.
5. **Push correcto:** emitir a los canales del destinatario, excluir al emisor, deep link a `/chat/:orderId` y manejo de `pushNotificationActionPerformed` (`usePushNotifications.ts:81-83`).
6. **Chat de comercio:** ruta merchant, guard, lista de conversaciones por pedido y verificación de que el pedido contiene items del comercio.
7. **Observabilidad:** métricas de polling, latencia de entrega, tasa de error de envío, conexiones SSE activas y tamaño de payload.

### 7.3 TTI y carga inicial

- La ruta Chat es lazy (`App.tsx:21`), con `LoadingFallback` global negro (`App.tsx:59-65`); en 3G se percibe una pantalla completa antes del chat. El chunk es pequeño, pero no hay prefetch.
- `useChatMessages` no usa `placeholderData` ni cache de una pantalla previa; el primer render muestra el estado vacío hasta que llega el GET (`Chat.tsx:194-204`). Es un layout shift visible.
- El polling descarga la lista completa; no hay compresión/ETag a nivel de aplicación ni proyección de columnas.
- `ReactQueryDevtools` se importa y renderiza siempre (`QueryProvider.tsx:24`), aunque en producción se oculta por CSS en móvil (`index.css:274-280`); conviene eliminarlo del bundle de producción.

### 7.4 Revisión de hooks y concurrencia

- **Stale closures:** `handleSend` se recrea en cada render y captura el `text` actual; no se encontró un stale closure en el envío. `useSendChatMessage` captura `orderId` al montar, pero la ruta se remonta porque `Routes` usa `key={location.pathname}` (`App.tsx:90`); si se elimina esa key, la invalidación puede apuntar al pedido anterior.
- **Cleanup:** el `EventSource` de `useOrderEvents` se cierra en el cleanup (`useOrderEvents.ts:127`); la excepción es el listener de visibilidad descrito en CHAT-22. El polling de React Query se cancela solo al desmontar.
- **Dependencias de hooks:** `useOrderEvents` depende de `utils` y `queryClient` (`useOrderEvents.ts:128`); si `trpc.useUtils()` no fuera referencialmente estable, el SSE se reabriría en cada render. En tRPC v11 suele ser estable (hipótesis a confirmar con React DevTools). `useDriverEvents` incluye `onNewOrder` en las dependencias (`:173`), por lo que un callback inline del padre también reabriría el stream; no afecta a Chat, pero es deuda del mismo módulo SSE.
- **setState tras unmount:** `handleSend` hace `setText("")` y `refresh()` después del `await` (`Chat.tsx:88-89`) sin comprobar si el componente sigue montado. En React 19 no genera warning, pero es trabajo desperdiciado; no afecta a una instancia nueva porque el estado pertenece a la instancia desmontada.
- **Catch vacíos:** `markAsRead(...).catch(() => {})` (`Chat.tsx:74`; `DriverChat.tsx:49`) y varios `.catch(() => {})` de logout ocultan fallos. En el envío sí hay catch, pero solo logs (`Chat.tsx:90-92`).
- **Keys:** `msg.id` y `group.date` son estables; no se detectaron keys duplicadas en el caso normal.
- **Carrera historial vs SSE:** no aplica hoy porque el chat no usa SSE. Si se añade, el patrón actual de invalidación reemplaza la lista completa, no hace append, por lo que no duplicaría; el riesgo real es el doble POST de CHAT-08 y la falta de `clientNonce`.
- **Eventos SSE duplicados:** un evento repetido no duplica burbujas porque el handler invalida y la lista se reemplaza; sí provoca un refetch extra. No hay dedupe por `event.id`, porque no existe `id:` en el stream.

---

## 8. Duplicados y deuda técnica

1. **`groupMessagesByDate` duplicada literalmente** en `Chat.tsx:39-55` y `DriverChat.tsx:14-30`. Debería vivir en un util compartido y testearse con zonas horarias.
2. **Atajos rápidos duplicados** con listas distintas (`Chat.tsx:32-37`, `DriverChat.tsx:7-12`); no hay componente `QuickReplies`.
3. **Render de mensajes duplicado y divergente:** mismas reglas de `isMine`, fecha y check, pero markup, colores, radios y tamaños distintos (`Chat.tsx:139-190` vs `DriverChat.tsx:104-136`). Un `MessageBubble` compartido eliminaría la divergencia visual.
4. **`ChatBubble` mal nombrado:** es un FAB, no una burbuja (`ChatBubble.tsx:20-39`). El nombre colisiona conceptualmente con el render de mensajes.
5. **CSS de chat muerto:** `.chat-bg`, `.chat-bubble-mine`, `.chat-bubble-other` (`index.css:231-272`) no se usan.
6. **Dos QueryClient:** `providers/trpc.tsx:24-47` y `providers/QueryProvider.tsx:5-19`, montados en cascada (`main.tsx:14-18`, `App.tsx:147-152`). `useOrderEvents` compensa con doble invalidación (`useOrderEvents.ts:120-124`), lo que oculta el problema.
7. **Cinco hooks SSE** con el mismo wrapper y lógica de invalidación (`useOrderEvents.ts:112-207`); el de chat existe pero no se usa en las pantallas de chat.
8. **Formateo de fecha/hora inline duplicado:** `Chat.tsx:42-46`, `:171-174` y `DriverChat.tsx:17-21`, `:122-125`; no hay `Intl.DateTimeFormat` cacheado ni util compartido.
9. **`loading` devuelto y no usado** (`useDeliveryData.ts:315`; `Chat.tsx:61`).
10. **Tipos `any`** en mensajes, `handleSend`, `isMine` y `groupMessagesByDate`; existe `ChatMessage` en `db/schema.ts:231` pero no se comparte al frontend.
11. **Sin tests** de chat, SSE o autorización (búsqueda de `*.test.*`/`*.spec.*` sin resultados).

---

## 9. Accesibilidad

| Criterio | Estado | Evidencia |
|---|---|---|
| Nombre accesible del input | ❌ Solo placeholder | `Chat.tsx:222-228` |
| Región viva para mensajes nuevos | ❌ Sin `role="log"`/`aria-live` | `Chat.tsx:129` |
| Anuncio de errores de envío | ❌ Solo consola | `Chat.tsx:90-92` |
| Etiqueta de botón volver cliente | ✅ `aria-label="Volver"` | `Chat.tsx:105` |
| Etiqueta de botón enviar cliente | ✅ `aria-label="Enviar mensaje"` | `Chat.tsx:234` |
| Etiqueta de botón volver/enviar driver | ❌ Solo icono | `DriverChat.tsx:77-79`, `:171-177` |
| Foco visible | ⚠️ Sin estilos explícitos; depende del navegador | `Chat.tsx:102-108` |
| Objetivos táctiles ≥44 px | ⚠️ Enviar/FAB sí; volver 36 px y atajos ~28 px | `Chat.tsx:104`, `:213` |
| Contraste AA | ❌ 2.3–2.9:1 en burbujas propias/timestamps/nombres | `Chat.tsx:149-184` |
| Zoom | ❌ `user-scalable=no` | `index.html:5` |
| Movimiento reducido | ❌ `animate-pulse` y transiciones sin `motion-reduce` | `Chat.tsx:122`; `ChatBubble.tsx:37`; `PageTransition.tsx:46-52` |
| Lectura de acuses | ❌ Iconos sin texto alternativo | `Chat.tsx:176-184` |
| Teclado | ⚠️ Enter envía; no hay Shift+Enter ni multilínea; sin `isComposing` | `Chat.tsx:222-229` |
| Copiar texto | ❌ `select-none` global | `Chat.tsx:99`; `index.css:6-12` |

---

## 10. Seguridad y privacidad

- **IDOR de lectura/escritura:** CHAT-01 y CHAT-02. Es el riesgo principal; no se mitiga con el guard de React porque la API es pública.
- **Suplantación:** el servidor no deriva identidad de la sesión; `senderName` se muestra sin verificación. Un nombre como “RAPIDY SOPORTE” se renderiza en mayúsculas naranjas (`Chat.tsx:149-151`) y parece oficial.
- **PII:** los mensajes pueden contener direcciones, teléfonos y códigos de acceso; `getByOrder` los expone. `senderId` permite resolver `customer.getById`/`list` públicos, que devuelven la fila completa incluido `fcmToken`.
- **SSE:** sin auth y sin token; cualquiera puede abrir conexiones al canal de pedido o driver. No hay límite de conexiones. El endpoint admin demuestra que se puede validar antes del stream.
- **Rate limit / abuso:** no hay límite por usuario, pedido ni IP en el código del servidor; el body global es de 50 MB (`boot.ts:34`). Un atacante puede llenar `chat_messages` y degradar el chat de todos.
- **XSS:** **no se encontró**. React interpola `msg.message` y `msg.senderName` como texto (`Chat.tsx:150`, `:161-163`); no hay `dangerouslySetInnerHTML` en el chat. No hay render de HTML ni de markdown.
- **SQL injection:** Drizzle parametriza las consultas; no se observó concatenación de SQL con la entrada del chat.
- **CSRF:** las cookies usan `SameSite=None` en producción (`server/lib/cookies.ts:14`; `customer-auth.ts:79-85`), pero los endpoints tRPC esperan JSON y no se observó CORS permisivo. El riesgo es menor, aunque el modelo de sesión es débil y el chat público lo hace irrelevante.
- **Cifrado:** no hay cifrado de aplicación; la frase “Los mensajes están cifrados” del DriverChat es falsa (`DriverChat.tsx:142`).
- **Retención:** no hay borrado, anonimización ni política visible; los mensajes persisten hasta que se borra el pedido (FK cascade, `schema.ts:222`).

---

## 11. Plan de verificación reproducible

> Requisitos: app en `http://localhost:3000` (`npm run dev`), dos navegadores/perfiles (cliente y driver), acceso a PostgreSQL (`DATABASE_URL`), y al menos un pedido existente. Los comandos usan PowerShell; en Linux/macOS adaptar `Invoke-RestMethod` por `curl`.

### 11.1 Autorización e IDOR (P0) — 10 minutos

1. Obtener un `orderId` real de otro cliente:
   ```sql
   SELECT id, customer_id, status FROM orders ORDER BY id DESC LIMIT 5;
   ```
2. Sin cookies (incógnito o `curl.exe`), leer el chat:
   ```powershell
   $input = [System.Uri]::EscapeDataString('{"json":{"orderId":1}}')
   Invoke-RestMethod -Uri "http://localhost:3000/api/trpc/chat.getByOrder?input=$input"
   ```
   **Esperado inseguro:** 200 con mensajes. **Esperado seguro:** 401/403.
3. Escribir como driver falso:
   ```powershell
   $payload = '{"json":{"orderId":1,"senderType":"driver","senderId":999,"senderName":"Rapidy Soporte","message":"Prueba IDOR"}}'
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/trpc/chat.send' -ContentType 'application/json' -Body $payload
   ```
   Verificar la fila en DB:
   ```sql
   SELECT id, order_id, sender_type, sender_id, sender_name, message
   FROM chat_messages WHERE order_id = 1 ORDER BY id DESC LIMIT 3;
   ```
4. Inyectar un mensaje con `senderType: "customer"` y comprobar que en `/chat/1` aparece alineado a la derecha como propio.
5. Probar `markAsRead` sin cookie:
   ```powershell
   Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/trpc/chat.markAsRead' -ContentType 'application/json' -Body '{"json":{"orderId":1,"readerType":"customer"}}'
   ```
6. Abrir SSE sin cookie:
   ```powershell
   curl.exe -N "http://localhost:3000/api/events/orders/1"
   ```
   En otra terminal, enviar un mensaje y comprobar que el stream recibe `{"type":"chat_message","orderId":1}`.
7. Confirmar la cadena de PII:
   ```
   GET /api/trpc/order.getById?input={"json":{"id":1}}
   GET /api/trpc/customer.getById?input={"json":{"id":<senderId>}}
   ```
8. Repetir con un driver autenticado y un pedido no asignado; el resultado debe ser 403 tras el fix.

### 11.2 Dos sesiones simultáneas y tiempo real (P1)

1. Sesión A: cliente en `/chat/:id`. Sesión B: driver en `/driver/chat/:id`.
2. Abrir DevTools → Network → filtro `events`. Confirmar que **no** hay request `/api/events/orders/:id` en la pantalla de chat; solo en `/order/:id` o `/driver/order/:id`.
3. Enviar desde A y medir cuánto tarda en aparecer en B. Esperado actual: 0–5 s por polling; esperado con fix: <500 ms por SSE.
4. Enviar dos mensajes seguidos desde A mientras B está en el chat. Verificar que B recibe ambos sin duplicados.
5. Dejar B en el chat, enviar desde A, y comprobar el check de A: debe seguir en un check hasta que B vuelva a montar el chat (bug CHAT-09).
6. Enviar desde A con la pestaña B en background; al volver, verificar que el polling se reanuda y que `refetchOnWindowFocus: false` no fuerza una carga inmediata (`QueryProvider.tsx:13`).

### 11.3 Offline, reconexión y eventos perdidos

1. En A, DevTools → Network → Offline. Enviar un mensaje: no hay toast ni burbuja fallida; el texto queda en el input (si el fetch falla) y la consola muestra error. Repetir al volver online para comprobar duplicados por reintento.
2. En `/order/:id`, cortar la red 10 s y volver. Verificar reconexión del SSE de pedido y que la ubicación/estado se recupera.
3. Forzar >10 fallos (bloquear `/api/events/*` o detener el server 2–3 min). Confirmar que `useOrderEvents` deja de reconectar (`useOrderEvents.ts:26-28`, `:83-87`) y que no hay indicador de “sin conexión”.
4. En despliegue con dos instancias (o Vercel), abrir SSE en una instancia y emitir desde otra; verificar que el evento no llega (hipótesis de bus en memoria, `events.ts:9`).
5. En `/chat`, verificar que el polling sigue funcionando aunque SSE no exista; no debe haber mensajes duplicados ni huecos.

### 11.4 Duplicados y borrador

1. Escribir “hola”, mantener Enter pulsado o pulsarlo dos veces rápido; contar filas en DB. Esperado actual: 2 filas.
2. Escribir un borrador largo, tocar un atajo; confirmar que el borrador se borra (`Chat.tsx:88`).
3. Simular latencia de 3 s (DevTools → Network → Slow 3G), enviar “hola”, escribir “segundo texto” antes de la respuesta y confirmar que el segundo texto desaparece.
4. Hacer doble tap en un atajo y verificar duplicados. Repetir con el botón enviar: debe estar deshabilitado tras el primer tap.

### 11.5 Estados UI, responsive y teclado

1. DevTools responsive en 320, 360, 390, 430 px. Verificar: sin scroll horizontal, burbujas dentro del ancho, chips con scroll, título truncado, FAB dentro del viewport.
2. Abrir el teclado en iOS/Android real (o emulador con teclado). Verificar que el input queda visible y que el último mensaje no queda tapado; probar con safe areas (notch/home indicator).
3. Confirmar que el driver puede llegar al input con 50+ mensajes sin scrollear toda la página (`DriverChat.tsx:74`, `:95`).
4. Probar selección/copia de un mensaje; confirmar que `select-none` lo impide.
5. Probar VoiceOver/TalkBack: el input debe tener nombre; los mensajes nuevos deben anunciarse; los checks deben tener alternativa textual.
6. Probar `prefers-reduced-motion`: el punto verde y las transiciones deben detenerse o reducirse.
7. Revisar contraste con axe/Lighthouse; verificar los ratios de CHAT-26.

### 11.6 Escala y DB

1. Insertar 500 y 5.000 mensajes de prueba para un pedido.
2. Medir: tiempo de primera carga, tamaño de respuesta, tiempo de render, lag al escribir, memoria.
3. Ejecutar:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM chat_messages WHERE order_id = 1 ORDER BY created_at;
   ```
   Confirmar Seq Scan/Sort si no hay índice.
4. Verificar índices:
   ```sql
   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'chat_messages';
   ```
5. Enviar un mensaje de 1 MB y uno de solo espacios; confirmar que el servidor los acepta (bug CHAT-04/CHAT-20).
6. Enviar `senderName` de 201+ caracteres; confirmar error 500 por `varchar(200)`.

### 11.7 Ciclo de vida y caché

1. Entregar/cancelar un pedido; abrir `/chat/:id` por URL directa y enviar. Confirmar que se acepta (bug CHAT-13).
2. En el driver, abrir un pedido cancelado y comprobar que el FAB sigue visible (`DriverOrder.tsx:472`).
3. Iniciar sesión como cliente A, abrir chat, cerrar sesión, iniciar como cliente B y abrir la misma URL. Confirmar si se ven mensajes cacheados antes del GET (bug CHAT-30).
4. Verificar que `markAsRead` no se ejecuta al recibir un mensaje nuevo con el chat abierto (CHAT-09).

### 11.8 Push (nativo)

1. En dispositivo Android con FCM, enviar un mensaje desde el cliente y confirmar que **no** llega notificación al propio cliente (bug actual: sí llega).
2. Enviar desde el cliente y confirmar que el driver **no** recibe push (bug actual).
3. Tocar una notificación de chat y confirmar que no navega a `/chat/:id` (`usePushNotifications.ts:81-83`).
4. Verificar el registro de token: el listener `registration` se añade después de `register()` (`usePushNotifications.ts:47-50`), por lo que el token puede perderse en el primer registro (hipótesis a confirmar en device).

---

## 12. Anexos

### A. Contratos tRPC

Envelope usado por los wrappers: `superjson.serialize(input)` → `{ "json": ... }`; las queries se envían por GET con `?input=...` (`useDeliveryData.ts:33-51`) y las mutaciones por POST (`:53-72`).

| Procedimiento | Tipo | Auth actual | Input | Salida | Efectos |
|---|---|---|---|---|---|
| `chat.send` | mutation | **Ninguna** (`publicQuery`) | `{ orderId: number, senderType: "customer"\|"commerce"\|"driver", senderId: number, senderName: string, message: string(min 1) }` | Fila `chat_messages` insertada | INSERT + `emit("order:N", {type:"chat_message"})` + push al customer |
| `chat.getByOrder` | query | **Ninguna** | `{ orderId: number }` | `ChatMessage[]` completo, `ORDER BY created_at ASC` | SELECT sin límite |
| `chat.markAsRead` | mutation | **Ninguna** | `{ orderId: number, readerType: "customer"\|"commerce"\|"driver" }` | `{ success: true }` | UPDATE `is_read='yes'` para todo remitente distinto del lector; sin event |
| `order.getById` | query | **Ninguna** | `{ id: number }` | Pedido + items + historial + driver + commerces | Contexto de pedido; expone PII |
| `customer.getById` | query | **Ninguna** | `{ id: number }` | Fila completa de `customers` | Incluye `fcmToken` |
| `customer.list` | query | **Ninguna** | — | Todas las filas de `customers` | PII masiva |

**Contrato SSE de pedido**

| Campo | Valor |
|---|---|
| URL | `GET /api/events/orders/:orderId` |
| Auth | Ninguna (`server/boot.ts:72-89`) |
| Content-Type | `text/event-stream` |
| Evento | `event: update` |
| Payload | JSON: `{type:"chat_message",orderId}` o `{type:"status_update",status,...}` o `{type:"commerce_ready",...}`; `{type:"ping"}` cada 15 s |
| Replay | No hay `id:` ni `Last-Event-ID` |
| Reconexión | Manual en `useOrderEvents.ts:74-95`; máximo 10 intentos; backoff 1.5 s × 2^n + jitter, tope 30 s |
| Limpieza | `stream.onAbort` + señal; `connection.close()` en cleanup del hook (`useOrderEvents.ts:127`) |
| Suscriptores actuales | `OrderTracking.tsx:54`, `DriverOrder.tsx:64`; **ninguno en Chat/DriverChat** |

### B. Tabla `chat_messages`

| Columna | Tipo | Restricciones | Evidencia |
|---|---|---|---|
| `id` | serial | PK | `db/schema.ts:221` |
| `order_id` | bigint | NOT NULL, FK `orders.id` ON DELETE CASCADE | `:222`; migración `0002:2` |
| `sender_type` | enum `sender_type` | NOT NULL; valores customer/commerce/driver | `:223`, `:38` |
| `sender_id` | bigint | NOT NULL; **sin FK** | `:224` |
| `sender_name` | varchar(200) | NULL | `:225` |
| `message` | text | NOT NULL | `:226` |
| `is_read` | enum `read_status` | NOT NULL default `no`; yes/no | `:227`, `:41` |
| `created_at` | timestamp | NOT NULL default now() | `:228` |
| Índices | — | **Ninguno** | `:220-229`; migración `0000:29-38`; grep sin `CREATE INDEX` |

### C. Matriz de canales y destinatarios

| Evento | Canal | Quién lo emite | Quién lo escucha | Push |
|---|---|---|---|---|
| `chat_message` | `order:N` | `chat.send` (`chat-router.ts:22`) | OrderTracking/DriverOrder (no Chat) | Customer, incluso si el emisor es el customer (`events.ts:68-89`) |
| `status_update` | `order:N` | order/driver/admin routers | OrderTracking/DriverOrder | Customer con copy de estado (`events.ts:78-80`) |
| `commerce_ready` | `order:N` y `commerce:C` | `order.markCommerceReady` (`order-router.ts:390-391`) | OrderTracking y comercio | Customer con copy “Pedido Listo” |
| `new_order` | `commerce:C` | `order.create`/`updateStatus` | CommerceOrders | Merchant (`events.ts:31-48`) |
| `new_available` | `driver:D` | `order.updateStatus`/`markCommerceReady` | DriverHome | Driver (`events.ts:51-66`) |
| `location_update` | `driver:D` | `driver.updateLocation` (`driver-router.ts:92`) | OrderTracking (stream directo) | Ninguno |
| `chat_message` al driver | — | **No se emite** | — | **No hay push** |
| `chat_message` al commerce | — | **No se emite** | — | **No hay push** |

### D. Estados del mensaje en UI

| Estado | ¿Existe? | Evidencia | Comentario |
|---|---|---|---|
| Borrador | ✅ | `Chat.tsx:63`, `:224` | Se pierde al navegar; se borra al enviar un atajo o al llegar la respuesta. |
| Enviando | ⚠️ Solo botón global | `Chat.tsx:232` | No hay burbuja “enviando” ni estado por mensaje. |
| Enviado | ✅ | `Chat.tsx:178-182` | Un check cuando `isRead !== "yes"`. |
| Leído | ⚠️ Global | `Chat.tsx:178-179`; `chat-router.ts:43` | Doble check si cualquier lector marcó el hilo; no es por participante. |
| Error | ❌ | `Chat.tsx:90-92` | Solo consola; no hay burbuja fallida ni reintento. |
| Reintentar | ❌ | — | No existe. |
| Optimista | ❌ | `useDeliveryData.ts:318-324` | El mensaje aparece tras POST + GET. |
| Cerrado | ❌ | `chat-router.ts:19-23` | No se valida el estado del pedido. |

### E. Severidad

| Nivel | Criterio |
|---|---|
| **P0** | Compromiso de datos/acciones entre usuarios, bypass de autorización o función principal inutilizable para todos. |
| **P1** | Falla grave de seguridad, pérdida/duplicación de mensajes, tiempo real inexistente o bloqueo de una parte del flujo. |
| **P2** | Bug relevante de UX, accesibilidad, rendimiento o estado que afecta a muchos usuarios pero tiene workaround. |
| **P3** | Pulido, deuda técnica, inconsistencia visual menor o caso límite. |

---

## 13. Conclusión

El flujo de chat funciona en el “happy path” de dos usuarios con el pedido correcto, pero no cumple el contrato de seguridad ni el de tiempo real que la UI promete. Los dos P0 son explotables sin autenticación y no requieren más que un `orderId`: lectura de conversaciones ajenas y escritura suplantando a cualquier participante. Antes de añadir funciones (adjuntos, comercio, badges), hay que cerrar la autorización, derivar la identidad del servidor, añadir paginación/índices y conectar el SSE que ya existe a la pantalla de chat. La deuda de duplicación cliente/driver y la doble caché de React Query explican por qué estas divergencias aparecen y se repiten.