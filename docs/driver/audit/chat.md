# Auditoría `/driver/chat/:orderId` — Repartidor

**Fecha:** 2026-11-13  
**Alcance:** chat del repartidor, su entrada desde `/driver/order/:id`, contrato tRPC,
SSE, persistencia, autorización, estados de lectura y UX.  
**Modo:** auditoría de solo lectura. No se modificó código, no se ejecutaron
migraciones, no se reiniciaron servidores y no se tocó `localhost:3000`.

## 1. Alcance y archivos

| Tipo | Archivo |
|---|---|
| Ruta y guard | `src/App.tsx:121`; `src/components/SessionGuard.tsx:100-131` |
| Pantalla | `src/pages/driver/DriverChat.tsx` |
| Entrada | `src/pages/driver/DriverOrder.tsx:472`; `src/components/ChatBubble.tsx:20-38` |
| Hook de datos | `src/hooks/useDeliveryData.ts:390-411`; `:612-621` |
| Hook SSE | `src/hooks/useOrderEvents.ts:129-150` |
| Contrato servidor | `server/chat-router.ts`; `server/lib/order-access.ts` |
| SSE servidor | `server/events.ts:27-42,84-125`; `server/boot.ts:123-213` |
| Persistencia | `db/schema.ts:264-276`; `db/schema.ts:45-48` |
| Referencia cliente | `src/pages/customer/Chat.tsx` |
| Estados | `contracts/orderStatus.ts` (solo el tipo `ViewerRole`; las funciones de estado no se usan) |
| Sesión adyacente | `server/login-router.ts:126-138,181-221`; `src/providers/trpc.tsx:41-45` |

No se identificó ningún hallazgo **P0**. La autorización server-side del chat está
cerrada: los tres procedimientos usan `participantQuery` + `assertOrderAccess`, la
identidad se deriva de `ctx` y el SSE valida participación. Los riesgos relevantes
son de estado de lectura, duplicados, caché entre sesiones, integración con el
comercio y acabado UX.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/SSE)

```text
/driver/chat/:orderId
  ├─ SessionGuard role="driver"
  │    └─ login.checkAuth (cookie HttpOnly) → rehidrata driver_user
  ├─ useChatMessages(orderId)
  │    └─ GET chat.getByOrder { orderId, limit: 50 }
  │         └─ participantQuery → assertOrderAccess
  │              ├─ orders + order_items
  │              ├─ driver asignado / customer dueño / comercio con items / admin
  │              └─ chat_messages (últimos 50, orden id asc)
  ├─ useOrderEvents(orderId, utils)
  │    └─ EventSource /api/events/orders/:orderId
  │         └─ canAccessOrder(cookies, orderId) → canal order:{id}
  │              └─ evento nombrado "update" (ping 15 s)
  ├─ useSendChatMessage(orderId)
  │    └─ POST chat.send { orderId, message, as: "driver" }
  │         └─ assertOrderAccess → rate limit 20/min
  │              └─ INSERT chat_messages (senderType/senderId/senderName desde viewer)
  │                   └─ emit order:{id} { type:"chat_message" }
  │                        └─ invalida chat.getByOrder en cliente y driver
  ├─ markAsRead
  │    └─ POST chat.markAsRead { orderId }
  │         └─ UPDATE is_read="yes" WHERE sender_type <> rol del lector
  └─ respaldo: polling 30 s (useChatMessages)
```

Puntos clave del contrato actual:

- `chat.send` **no acepta** `senderType`, `senderId` ni `senderName` desde el
  cliente; los deriva de `assertOrderAccess` (`server/chat-router.ts:71-79`).
- `as` solo se acepta si coincide con el rol que el backend ya resolvió
  (`server/chat-router.ts:38-43`); no permite suplantar.
- El mismo hilo `chat_messages` se comparte entre cliente y driver; ambos abren
  el mismo canal `order:{id}` y ambos invalidan `chat.getByOrder`
  (`server/chat-router.ts:82-87`; `src/hooks/useOrderEvents.ts:137-142`).
- El comercio puede leer/escribir por API (`senderType="commerce"`), pero hoy no
  tiene pantalla ni entrada en el panel.
- El chat no consulta el estado del pedido en ningún punto del servidor
  (`server/chat-router.ts:32`); de `contracts/orderStatus.ts` solo se usa el tipo
  `ViewerRole`, no las funciones de estado.

## 3. Hallazgos

Severidades: **P1** = fallo serio de operación, datos, privacidad o bloqueo de
flujo; **P2** = UX, accesibilidad, consistencia o rendimiento. No hay P0.

| ID | Severidad | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| **DRV-CHAT-01** | P1 | Estado leído / contrato | `server/chat-router.ts:122-131`; `db/schema.ts:271` | `is_read` es un único enum por mensaje. `markAsRead` marca como leído todo mensaje de otro `senderType`, sin distinguir lector. En un hilo cliente + driver + comercio, el primero que abre marca para todos; el comercio que lee también marca lo que el driver no vio. No emite SSE de lectura. | Acuses falsos: el cliente ve doble check aunque solo leyó el comercio; el driver no puede saber quién leyó; se incumple “markAsRead no marque para todos”. | Tabla `chat_reads(order_id, participant_type, participant_id, last_read_message_id)` o flags por rol; calcular `isRead` por viewer en `getByOrder`; emitir `chat_read` a `order:{id}`. |
| **DRV-CHAT-02** | P1 | Estado leído / trigger | `src/pages/driver/DriverChat.tsx:53-57`; `src/hooks/useDeliveryData.ts:393-395` | `markAsRead` se dispara por `messages.length`. El hook pide solo 50; con 50 mensajes, al llegar uno nuevo la lista sigue en 50 y el efecto no corre. Tampoco comprueba visibilidad; una pestaña oculta puede marcar leído al invalidarse. Mismo patrón en `src/pages/customer/Chat.tsx:107-110`. | Mensajes nuevos quedan `is_read="no"` en hilos largos; el remitente ve un solo check; el acuse se pierde hasta remontar la pantalla o cambiar la longitud. | Depender del id del último mensaje (`messages.at(-1)?.id`) o del evento SSE; enviar `lastMessageId`; comprobar `document.visibilityState`. |
| **DRV-CHAT-03** | P1 | Envío / duplicados | `src/pages/driver/DriverChat.tsx:59-73,154-164,172-184`; `server/chat-router.ts:71-80` | `handleSend` no bloquea si `sendChat.isPending`; Enter y quick messages lo llaman igual. El botón se deshabilita, pero el atajo y los chips no. No hay `clientMessageId` ni unique: dos POST crean dos filas. | Mensajes duplicados por doble tap/Enter o reintento tras timeout; el conductor cree que envió una vez. | Lock con ref/estado al inicio de `handleSend`; deshabilitar quick messages; `clientMessageId` + unique `(order_id, sender_type, sender_id, client_message_id)` y `onConflictDoNothing`. |
| **DRV-CHAT-04** | P1 | Privacidad / caché | `src/components/SessionGuard.tsx:44-52`; `src/hooks/useDeliveryData.ts:21-45,390-403`; `src/providers/trpc.tsx:41-45`; `src/pages/driver/DriverProfile.tsx:88-94` | `redirectOut` usa `navigate` (SPA) y no limpia el QueryClient; el logout manual sí (`DriverProfile.tsx:93`). `useChatMessages` cachea por `orderId`, no por viewer, y `DriverChat` ignora `error`, así que sigue mostrando `data` cacheada. Si otro driver inicia sesión en la misma pestaña y abre la URL del pedido anterior dentro de `gcTime` (10 min), ve el hilo anterior. | Fuga de mensajes/PII entre cuentas de driver en dispositivo compartido; el backend luego responde 403, pero la UI no lo muestra. | `queryClient.clear()` en `redirectOut` y en logout de rol; incluir viewer en la query key; no renderizar datos si el error es 403/404. |
| **DRV-CHAT-05** | P1 | Integración comercio | `src/App.tsx:124-129`; `src/components/ChatBubble.tsx:25`; `src/components/CommerceLayout.tsx:61`; `server/chat-router.ts:11-18,82-87`; `docs/commerce/README.md:150` | El backend soporta `senderType="commerce"`, pero no hay ruta, entrada ni pantalla de chat para merchant; `ChatBubble` solo acepta customer/driver. El panel commerce usa `commerce:{id}` y `chat.send` solo emite a `order:{id}`. El documento de comercio ya reconoce que “el panel no lo expone”. | El hilo no es realmente de tres partes; cliente/driver no pueden escribir al comercio; un futuro chat merchant no recibiría SSE sin montar `useOrderEvents` o emitir a `commerce:{id}`. | Decidir producto: si se implementa, añadir entrada en el detalle de pedido merchant, usar `chat.*` con `as:"merchant"` y `useOrderEvents(orderId)` o emitir `chat_message` a `commerce:{id}`. Si no, documentarlo y no prometer chat con comercio. |
| **DRV-CHAT-06** | P1 | Sesión / rol | `server/login-router.ts:126-138,181-188,197-221` | El login merchant/admin limpia cookies driver; el login driver no limpia merchant/admin. `checkAuth` prioriza admin > merchant > driver. Un navegador con cookie merchant que inicia sesión como driver recibe `role:"merchant"` y `SessionGuard role="driver"` lo redirige a `/login`. | Un usuario multi-rol o dispositivo compartido no puede entrar a `/driver/chat`; la cookie driver queda válida pero la UI lo expulsa. | En la rama driver, limpiar admin/merchant antes de `setDriverCookies`, igual que la rama merchant; o hacer `checkAuth` consciente del rol esperado. |
| **DRV-CHAT-07** | P2 | Errores / autorización | `src/pages/driver/DriverChat.tsx:40,144-150`; `src/hooks/useDeliveryData.ts:397-402`; `server/boot.ts:196` | `useChatMessages` devuelve `loading` y `error`, pero `DriverChat` solo usa `data` y `refresh`. Mientras carga, y ante 403/404/red, muestra el mismo vacío y deja el input habilitado. En un pedido ajeno, SSE responde 401 y el header queda en “Reconectando...”. | El driver cree que el chat está vacío, escribe y recibe un toast; no hay reintento ni distinción de “sin permiso” vs “sin mensajes”; un intento de IDOR se percibe como chat vacío. | Spinner solo si no hay datos; panel de error con retry; 403/404 con copy específico e input deshabilitado; opcional cargar `order.getById` para confirmar asignación. |
| **DRV-CHAT-08** | P2 | Identidad / reasignación | `src/pages/driver/DriverChat.tsx:76`; `server/admin/orders-router.ts:335-357`; `server/chat-router.ts:75-77` | `isMine` compara solo `senderType === "driver"`. El admin puede reasignar el pedido; los mensajes del driver anterior siguen con `senderType="driver"`. El nuevo driver los ve alineados a la derecha y sin nombre, como propios. | Atribución incorrecta; el nuevo driver puede creer que escribió instrucciones que no escribió; el cliente ve nombres distintos pero el driver no. | `isMine = msg.senderType === "driver" && msg.senderId === driverSession.id`; para mensajes de otro driver, mostrar `senderName` o “Repartidor anterior”. |
| **DRV-CHAT-09** | P2 | Scroll / UX | `src/pages/driver/DriverChat.tsx:47-51`; `src/hooks/useDeliveryData.ts:395` | El efecto depende de `[messages]` y siempre hace `scrollTop = scrollHeight`. Cada mensaje nuevo, refresco tras envío o invalidación SSE arrastra al fondo, aunque el driver esté leyendo historial. El cliente sí respeta “cerca del final” (`Chat.tsx:94-104`). | No se puede leer historial mientras el pedido está activo; el mensaje nuevo interrumpe. | Copiar la lógica de `previousCountRef` + `nearBottom` del chat cliente; mostrar indicador “nuevo mensaje” si está arriba. |
| **DRV-CHAT-10** | P2 | Envío optimista / borrador | `src/pages/driver/DriverChat.tsx:59-73,75`; `src/pages/customer/Chat.tsx:26-40,77-92,112-153` | El driver no tiene mensaje optimista, estado “enviando/error”, reintento ni borrador por `orderId`. Si falla, solo hay toast y el texto queda; si navega atrás, se pierde. | En red lenta el mensaje no aparece y parece que no se envió; no hay reintento visible; se pierde el borrador. | Reutilizar el patrón de `Chat.tsx` (optimistic, failed/retry, draft `rapidy:chat-draft:${orderId}`) en `DriverChat`. |
| **DRV-CHAT-11** | P2 | Historial / paginación | `src/pages/driver/DriverChat.tsx:75`; `src/hooks/useDeliveryData.ts:390-403`; `server/chat-router.ts:95-112` | El backend soporta `before` y limita 1-100, pero el hook siempre pide 50 y no expone `before`; no hay “cargar más”. Con >50 mensajes, los antiguos desaparecen de la vista. | Se pierden instrucciones antiguas (dirección, referencia, cambio de pedido); no hay forma de recuperarlas en la UI. | Añadir carga hacia arriba con `before: messages[0].id`, preservar scroll; o documentar el límite. |
| **DRV-CHAT-12** | P2 | Sesión / UI | `src/pages/driver/DriverChat.tsx:53-57,61`; `src/hooks/useDeliveryData.ts:612-621` | `handleSend` y `markAsRead` dependen de `driverSession` de `localStorage` (`driver_user`/`qs_driver_user`), no de la cookie. Si falta o está corrupto, el envío retorna en silencio y no se marca leído; el header muestra “C”. La fuente de verdad es la cookie (`SessionGuard.tsx:100-111`). | Sesión válida con UI que no envía; fallo silencioso; inicial equivocada. | Usar el usuario rehidratado por `SessionGuard`/contexto o no bloquear por localStorage; mostrar error si no hay identidad de UI; el backend ya deriva la identidad. |
| **DRV-CHAT-13** | P2 | Visual / header | `src/pages/driver/DriverChat.tsx:86-95,105-126`; `src/pages/customer/Chat.tsx:169-185,219-246` | El header muestra la inicial del propio driver, no la contraparte ni un icono de pedido. “En línea” describe el SSE, pero se lee como presencia del cliente. Separador de fecha, radios de burbuja, tipografía y tamaños no siguen el chat cliente. | Inconsistencia entre roles; el driver puede creer que el cliente está en línea; el chat se ve de otra familia visual. | Icono neutro de pedido/cliente, copy “Mensajes en tiempo real”/“Reconectando…”, reutilizar tokens y radios del chat cliente. |
| **DRV-CHAT-14** | P2 | Accesibilidad | `src/pages/driver/DriverChat.tsx:82-83,93,100,154-164,168-188` | Sin `aria-live` en la lista; botones de volver/enviar solo icono sin `aria-label`; input solo placeholder; chips con `py-1.5`/`text-xs` ≈30 px (<44); `animate-pulse` sin `motion-reduce`. El chat cliente sí tiene `aria-live`, `aria-label` y `motion-reduce` (`Chat.tsx:161-167,180-185,194,309-318,337-344`). | Lector de pantalla no anuncia mensajes; targets pequeños; usuarios con movimiento reducido ven animación. | `aria-live="polite"`, labels, `min-h-11` en chips, `motion-reduce:animate-none`. |
| **DRV-CHAT-15** | P2 | Dark mode | `src/pages/driver/DriverChat.tsx:79-189`; `src/index.css:57-91` | No hay clases `dark:`. El contenedor usa `bg-surface`, que cambia con `.dark`, pero header/input/burbujas/quick bar quedan claros. La ruta driver no monta `ThemeToggle`/`useTheme`, así que en carga limpia el tema oscuro no se inicializa; si `.dark` está activo (SPA desde cliente), el chat queda a medias. | Inconsistencia visual y contraste impredecible si el tema oscuro está activo; el chat cliente sí tiene variantes (`Chat.tsx:159-345`). | Decidir light-only explícito para driver (quitar `bg-surface` y fijar tokens claros) o añadir `dark:` equivalentes al chat cliente. |
| **DRV-CHAT-16** | P2 | Contraste | `src/pages/driver/DriverChat.tsx:120-136`; `src/index.css:41` | Blanco sobre `--brand` #FF6A00 ≈2.87:1; `text-white/80` baja más; `text-brand` sobre blanco ≈2.87:1. WCAG AA pide 4.5:1 para texto normal y 3:1 para texto grande/UI. Afecta burbujas propias, timestamps, nombre del remitente y chips en hover. | Texto difícil de leer, especialmente al sol/móvil; incumple AA. | Usar `brand-strong`/tono más oscuro para fondos con texto blanco, o texto `ink` sobre brand; validar 4.5:1. |
| **DRV-CHAT-17** | P2 | Layout móvil | `src/pages/driver/DriverChat.tsx:79,100,167`; `src/index.css:121-130` | El root usa `min-h-screen` sin `h-[100dvh]`; la lista `flex-1 overflow-y-auto` no tiene `min-h-0`. Con muchos mensajes el contenedor crece y el input queda al final del documento, no fijo al viewport; el teclado móvil puede taparlo. El chat cliente usa `h-screen h-[100dvh]` (`Chat.tsx:159`). | Input fuera de pantalla o scroll de página; experiencia rota en iOS/Android con teclado. | `h-screen h-[100dvh]` + `min-h-0` en la lista + `shrink-0` en header/input; mantener safe-area. |
| **DRV-CHAT-18** | P2 | Copy / PII | `src/pages/driver/DriverChat.tsx:10-15,116-118,147,179`; `db/schema.ts:270` | “Los mensajes están cifrados” sugiere cifrado E2E/en reposo, pero el mensaje se guarda en `chat_messages.message` (`text`) sin cifrado de columna. Mezcla voseo (“Escribí”, “Estoy acá”) con tuteo (“Escribe”); el fallback de remitente no-driver es “Cliente” incluso para `commerce`. | Promesa de seguridad engañosa; inconsistencia de tono; un mensaje de comercio se etiqueta como cliente si `senderName` es null. | Copy neutral (“Envía un mensaje sobre tu pedido”), español consistente, fallback por `senderType` (`customer`/`commerce`/`driver`); no afirmar cifrado si no existe. |
| **DRV-CHAT-19** | P2 | Validación de URL | `src/pages/driver/DriverChat.tsx:36-40,61` | `Number(orderId)` acepta `NaN`, negativos, `1e3`, `0x10`. Con `NaN`/0 la query se deshabilita y el vacío se muestra; con negativo la API responde Zod y el error se ignora; el envío retorna en silencio para `NaN`/0. | URLs inválidas se ven como chat vacío; no hay 404/400 claro; depuración difícil. | Validar `/^\d+$/`, `Number.isInteger` y `>0`; renderizar `NotFound`/error; no montar el chat sin id válido. |
| **DRV-CHAT-20** | P2 | Contrato `as` | `server/chat-router.ts:27-28,38-43`; `server/lib/order-access.ts:68-102` | `as` se valida contra el rol que `resolveOrderViewer` ya eligió con prioridad admin > driver > merchant > customer. No permite “elegir entre roles propios” como dice el comentario: un usuario que es cliente y comercio solo puede enviar como el rol de mayor prioridad; si manda el otro, 403. | Usuarios multi-rol no pueden usar el rol esperado; el contrato documentado no se cumple. No permite suplantación. | Resolver el viewer a partir de `input.as` cuando el usuario tenga participación real en ese rol, o eliminar `as` y documentar la prioridad. |
| **DRV-CHAT-21** | P2 | Notificaciones | `server/events.ts:104-114`; `src/components/ChatBubble.tsx:30-38`; `src/pages/driver/DriverOrder.tsx:472` | El push de `chat_message` solo va al customer y se salta si el emisor es customer; driver y comercio no reciben push. `ChatBubble` no tiene badge/unread. Si el driver está en `DriverOrder`, el SSE invalida chat pero no hay aviso visible. | El driver no se entera de un mensaje del cliente hasta abrir el chat; instrucciones urgentes se pierden. | Emitir a `driver:{id}`/`commerce:{id}` o añadir contador no leído; push con deep link; excluir al emisor. |
| **DRV-CHAT-22** | P2 | Performance | `src/hooks/useOrderEvents.ts:137-142`; `server/lib/order-access.ts:112-119`; `db/schema.ts:273-276`; `src/hooks/useDeliveryData.ts:79-98` | Cada evento del canal `order:{id}` (incluido `chat_message`) invalida `order.getById` y `chat.getByOrder`; en `DriverOrder` eso refresca el pedido completo por cada mensaje. `assertOrderAccess` carga todos los items incluso para driver/customer. `getByOrder` ordena por `id` pero el índice es `(order_id, created_at)`; no hay índice `(order_id, id)`. `trpcMutate` no tiene timeout/abort. | Queries y payload innecesarios; chat lento en pedidos grandes; un fetch colgado deja el envío pendiente. | Invalidar solo según `data.type`; resolver viewer con query dirigida; índice `(order_id, id)` y proyección; `AbortController`/timeout. |
| **DRV-CHAT-23** | P2 | Ciclo de vida | `src/pages/driver/DriverOrder.tsx:472`; `server/chat-router.ts:32` | No hay comprobación de estado en `chat.*`: se puede leer/escribir por URL en `delivered`/`cancelled`. El FAB de `DriverOrder` se muestra para todo `!delivered`, incluido `cancelled` y pedidos aún no asignados; en no asignado el chat responde 403. | Chat en pedidos cerrados; FAB que lleva a un chat sin permiso; falta de política de cierre. | Definir política (p. ej. solo lectura tras terminal), ocultar FAB si `!isAssigned` o terminal, y aplicarla en servidor si se decide bloquear. |
| **DRV-CHAT-24** | P2 | Multi-comercio | `db/schema.ts:264-276`; `server/lib/order-access.ts:76-94`; `server/chat-router.ts:73-78` | `chat_messages` no tiene `commerce_id`; para merchant, `senderId` es el user ID y `senderName` es `merchant.name`, no el nombre del local. Cualquier merchant con items en el pedido accede a todo el hilo. En multi-comercio no se puede atribuir un mensaje a una tienda ni dirigirlo a una. | El driver ve un nombre personal en vez del local; merchants ven mensajes de otros merchants; no hay canal por comercio. | Añadir `commerce_id` nullable para mensajes de comercio, validar ownership en `chat.send`, usar `commerce.name`; decidir visibilidad por comercio. Requiere migración revisada. |

## 4. Integración con Cliente y Negocio

### Cliente

- **Mismo hilo:** sí. Cliente y driver leen y escriben la misma tabla
  `chat_messages` por `order_id` (`db/schema.ts:264-276`) y ambos abren el mismo
  canal `order:{id}` (`server/chat-router.ts:82-87`;
  `src/hooks/useOrderEvents.ts:137-142`). Un mensaje enviado por uno aparece en
  el otro por SSE o por polling de 30 s.
- **Identidad:** el backend deriva `senderType`, `senderId` y `senderName` de
  `assertOrderAccess`; no acepta esos campos del cliente. `as` no permite
  suplantación: un driver no puede enviar como customer ni como commerce
  (`server/chat-router.ts:38-49,71-79`).
- **Acuses:** el modelo global `is_read` no distingue lector. En un hilo de tres
  roles, el primer lector marca para todos (`server/chat-router.ts:122-131`).
  Además `markAsRead` no emite SSE, así que el acuse del driver no actualiza en
  vivo el doble check del cliente; como máximo llega por el polling de 30 s.
- **PII:** el hilo contiene nombre del cliente, nombre del driver y texto libre
  (dirección, teléfono, referencias). No hay cifrado de columna ni retención
  definida. El copy “Los mensajes están cifrados” no se corresponde con
  `chat_messages.message: text` (`db/schema.ts:270`).
- **XSS:** React interpola el texto y `senderName` como texto; no hay
  `dangerouslySetInnerHTML` en el chat. `whitespace-pre-wrap break-words` evita
  desbordes (`src/pages/driver/DriverChat.tsx:124`). No se encontró XSS.

### Negocio

- **API:** `chat.send` acepta `as:"merchant"` y `senderTypeForViewer("merchant")`
  devuelve `"commerce"` (`server/chat-router.ts:11-18`). Un merchant con items
  en el pedido puede leer y escribir por API (`server/lib/order-access.ts:76-94`).
- **UI:** no existe ruta, entrada ni pantalla de chat para merchant
  (`src/App.tsx:124-129`; `src/components/ChatBubble.tsx:25`). El documento
  `docs/commerce/README.md:150` ya lo describe como “API; el panel no lo expone”.
  En la práctica el hilo es cliente ↔ driver, no de tres partes.
- **SSE:** el panel commerce monta `useCommerceEvents` (`commerce:{id}`) en
  `src/components/CommerceLayout.tsx:61`, no `useOrderEvents`. `chat.send` solo
  emite a `order:{id}` (`server/chat-router.ts:82-87`). Si se añadiera una UI
  merchant sin cambiar el bus, no recibiría mensajes en tiempo real.
- **Push:** `events.ts` solo notifica al customer; no hay push de chat para
  driver ni merchant (`server/events.ts:104-114`). El driver tiene
  `registerDeviceToken` (`server/driver-router.ts:368-375`), pero el evento de
  chat no se usa para él.
- **Multi-comercio:** no hay `commerce_id` en `chat_messages`; todos los
  merchants participantes ven todo el hilo y no se puede atribuir el mensaje a
  una tienda. Es una limitación de modelo, no solo de UI
  (`db/schema.ts:264-276`; `server/lib/order-access.ts:76-94`).

### Integración recomendada (sin implementar)

1. Decidir el contrato: chat de dos partes (cliente ↔ driver) o de tres partes
   (cliente ↔ driver ↔ comercio). Si es de tres, el panel commerce necesita
   entrada, `useOrderEvents(orderId)` o emisión a `commerce:{id}`.
2. Separar el estado leído por participante; el `is_read` global no escala a
   tres roles.
3. Añadir atribución por comercio (`commerce_id` + nombre del local) si el
   pedido es multi-comercio.
4. Notificar al driver y al comercio de los mensajes nuevos; hoy solo el
   cliente recibe push.
5. Definir qué pasa en `delivered`/`cancelled`: chat abierto, solo lectura o
   cerrado. Hoy la URL directa sigue funcionando.

## 5. Lo que funciona y no se debe romper

- **Autorización cerrada:** `chat.send`, `chat.getByOrder` y `chat.markAsRead`
  usan `participantQuery` + `assertOrderAccess`
  (`server/chat-router.ts:22,91,115`; `server/lib/order-access.ts:107-129`).
  Sin cookie → 401; pedido ajeno → 403; pedido inexistente → 404.
- **Identidad derivada del backend:** no se aceptan `senderType`, `senderId` ni
  `senderName` del cliente. `as` solo valida el rol ya resuelto y el admin es
  solo lectura (`server/chat-router.ts:28,35-43,71-79`). Esto evita la
  suplantación que tenía el chat antes de la corrección.
- **Participación real:** cliente dueño, driver asignado, comercio con items o
  admin (`server/lib/order-access.ts:63-105`). Un driver reasignado pierde el
  acceso al pedido anterior.
- **Rate limit:** máximo 20 mensajes/minuto por remitente y pedido
  (`server/chat-router.ts:51-69`). El mensaje se recorta y se limita a 2000
  caracteres (`:26`).
- **Paginación:** `getByOrder` acepta `limit` 1-100 y cursor `before`
  (`server/chat-router.ts:95-112`). El frontend usa 50; el backend está listo
  para “cargar más”.
- **SSE autenticado:** `/api/events/orders/:orderId` valida cookie y
  participación antes de abrir el stream (`server/boot.ts:123-166,192-213`).
  Usa el evento nombrado `update`, no `onmessage`, y ping cada 15 s
  (`server/boot.ts:206`; `src/hooks/useOrderEvents.ts:59-73`).
- **Matiz de sesión SSE:** `resolveSseIdentities` valida el JWT y la
  participación, pero no revalida `deletedAt` ni `sessionVersion` como
  `createContext` (`server/boot.ts:95-118`; `server/context.ts:56-65`). El
  evento `chat_message` no lleva el texto, solo `messageId` y `senderType`
  (`server/chat-router.ts:82-87`), así que el riesgo residual es de metadata y
  no de contenido; el contenido se lee por tRPC, que sí revalida la sesión.
- **Mismo canal para cliente y driver:** `chat.send` emite a `order:{id}` y
  `useOrderEvents` invalida `chat.getByOrder` en ambos
  (`server/chat-router.ts:82-87`; `src/hooks/useOrderEvents.ts:137-142`).
- **Polling de respaldo:** 30 s, no 4-5 s (`src/hooks/useDeliveryData.ts:395`).
- **XSS:** React escapa `message` y `senderName`; no hay HTML crudo en el chat.
  Mantener `whitespace-pre-wrap break-words` y no introducir
  `dangerouslySetInnerHTML`.
- **Safe-area y targets:** header con `pt-safe` e input con
  `env(safe-area-inset-bottom)` (`src/pages/driver/DriverChat.tsx:81,167`);
  volver y enviar son de 44 px (`touch-target` y `w-11 h-11`); el input usa
  16 px en móvil para evitar zoom (`src/index.css:133-137`).
- **Un solo QueryClient:** `TRPCProvider` y `QueryProvider` comparten la misma
  instancia (`src/providers/trpc.tsx:41-45,82-90`;
  `src/providers/QueryProvider.tsx:10-12`). No crear una segunda caché.
- **Estados y errores del servidor:** mensajes de rate limit y permisos son
  claros; no se filtra `paymentReceipt` ni `fcmToken` en las respuestas de chat.

## 6. Evidencia y verificación

**Naturaleza de la evidencia:** auditoría estática de solo lectura. Se revisaron
los archivos citados y se hicieron búsquedas de productores/consumidores de
`chat.*`. No se ejecutaron tests, `tsc`, build, E2E ni migraciones; no se
reinició el servidor. `git status --short` estaba limpio antes de crear este
documento; esta auditoría solo creó `docs/driver/audit/chat.md`. Puede haber
otros documentos de auditorías paralelas en `docs/driver/audit/`; no se tocaron.

### Verificado por lectura de código

| Prueba | Resultado | Evidencia |
|---|---|---|
| `chat.getByOrder` sin cookie | 401 por `participantQuery` | `server/middleware.ts:64-79`; `server/chat-router.ts:91` |
| `chat.getByOrder` con driver no asignado | 403 por `assertOrderAccess` | `server/lib/order-access.ts:107-129` |
| `chat.send` con `senderType`/`senderId`/`senderName` del cliente | No existen en el input; se ignoran | `server/chat-router.ts:24-29` |
| `chat.send` con `as:"customer"` desde un driver | 403; no hay suplantación | `server/chat-router.ts:38-43` |
| `chat.send` desde admin | 403; admin solo lectura | `server/chat-router.ts:35-37` |
| `chat.markAsRead` desde admin | No-op, no marca | `server/chat-router.ts:119` |
| Rate limit 21.º mensaje/minuto | `TOO_MANY_REQUESTS` | `server/chat-router.ts:51-69` |
| SSE de pedido sin cookie | 401 antes de `streamSSE` | `server/boot.ts:192-196` |
| SSE de pedido con driver ajeno | 401 por `canAccessOrder` | `server/boot.ts:123-166` |
| XSS en `message` o `senderName` | React escapa; no hay HTML crudo | `src/pages/driver/DriverChat.tsx:124` |
| Mismo hilo cliente/driver | Misma tabla y mismo canal | `db/schema.ts:264-276`; `server/chat-router.ts:82-87` |
| SSE invalida el chat | Sí, por `queryClient.invalidateQueries` | `src/hooks/useOrderEvents.ts:137-142` |

### No verificado en runtime

- El caso de 50 mensajes + mensaje nuevo: se infiere del `limit: 50` y de la
  dependencia `messages.length`; no se creó un hilo real de 51 mensajes.
- La fuga de caché entre drivers: se infiere de `redirectOut` sin
  `queryClient.clear()` y de `gcTime` de 10 min; no se probó con dos sesiones.
- Dark mode, contraste y teclado móvil: se revisaron clases y tokens; no se
  midió con navegador ni herramienta de contraste.
- Push al driver/comercio: se revisó `events.ts`; no se probó entrega FCM.
- Envío de comercio por API: el camino existe; no se ejecutó con una cookie
  merchant real.
- Lector de pantalla y foco: no se probó con NVDA/VoiceOver.

### Reproducción sugerida (no ejecutada)

1. Dos sesiones (cliente y driver) en el mismo pedido; verificar que ambos ven
   el mensaje por SSE y que el polling de 30 s es solo respaldo.
2. Enviar 51 mensajes y comprobar si el mensaje 51 se marca leído.
3. Doble tap en un quick message y Enter repetido con red lenta; contar filas.
4. Reasignar el pedido a otro driver y abrir el chat; verificar la atribución.
5. Abrir `/driver/chat/:id` con un pedido ajeno, inexistente y con id inválido.
6. Cerrar sesión en otra pestaña e iniciar con otro driver; abrir la URL
   anterior y comprobar si aparece caché.
7. Probar teclado móvil, dark mode, zoom 200 % y lector de pantalla.
8. Pedido multi-comercio: verificar quién ve qué y cómo se etiqueta cada
   mensaje de comercio.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Archivo:línea | Resumen |
|---|---|---|---|---|
| 1 | **DRV-CHAT-01** | P1 | `server/chat-router.ts:122-131`; `db/schema.ts:271` | `is_read` global: el primer rol que lee marca para todos; los acuses de tres partes son falsos y no hay SSE de lectura. |
| 2 | **DRV-CHAT-02** | P1 | `src/pages/driver/DriverChat.tsx:53-57`; `src/hooks/useDeliveryData.ts:393-395` | `markAsRead` depende de `messages.length`; con el tope de 50 no se dispara para mensajes nuevos y tampoco comprueba visibilidad. |
| 3 | **DRV-CHAT-03** | P1 | `src/pages/driver/DriverChat.tsx:59-73,154-164,172-184`; `server/chat-router.ts:71-80` | Enter y quick messages ignoran `isPending`; no hay `clientMessageId` ni unique, así que el doble tap o el reintento duplican filas. |
| 4 | **DRV-CHAT-04** | P1 | `src/components/SessionGuard.tsx:44-52`; `src/hooks/useDeliveryData.ts:21-45,390-403` | El redirect SPA no limpia el QueryClient; un segundo driver en la misma pestaña puede ver el hilo cacheado del anterior si abre la misma URL. |
| 5 | **DRV-CHAT-05** | P1 | `src/App.tsx:124-129`; `src/components/ChatBubble.tsx:25`; `docs/commerce/README.md:150` | El comercio puede leer/escribir por API pero no tiene UI ni entrada; el panel usa `commerce:{id}` y el chat solo emite a `order:{id}`. |

**P1 adicional fuera del top 5:** **DRV-CHAT-06** (`server/login-router.ts:126-138,181-221`):
el login driver no limpia cookies merchant/admin y `checkAuth` prioriza merchant;
un usuario multi-rol puede quedar expulsado de `/driver/chat`.

**Riesgos de integración para el consolidado:**

- El chat no es de tres partes en la práctica: falta la superficie merchant y el
  SSE de comercio.
- El estado leído global impide acuses correctos en pedidos con cliente, driver
  y comercio.
- En multi-comercio no hay atribución por tienda; todos los merchants ven todo
  el hilo y el driver ve el nombre del usuario merchant, no el local.
- El driver no recibe push ni badge de mensajes nuevos; solo se entera si tiene
  el chat abierto.
- No hay política de chat para pedidos `delivered`/`cancelled`; la URL directa
  sigue funcionando y el FAB aparece en pedidos cancelados o no asignados.
- La caché de chat no está separada por viewer y sobrevive al redirect de rol;
  es un riesgo de PII en dispositivos compartidos.

**P0:** ninguno. La autorización del backend y la derivación de identidad están
correctas y no deben relajarse para corregir los hallazgos anteriores.