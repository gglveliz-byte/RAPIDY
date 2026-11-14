# Cliente — E2E de producción

**Estado:** implementado. Journey navegador verificado **35/35 PASS** en local
con el resto del flujo real; el paso OTP se validó con un código de desarrollo
inyectado porque el servidor local tiene NeuroChat real y no expone `devCode`.
La corrida de aceptación contra staging/producción debe usar `E2E_OTP_CODE` o la
entrada interactiva.
**Script:** `scripts/production-customer-smoke.mjs`  
**Alcance:** login OTP, home, búsqueda, tienda, carrito, quote, checkout,
creación de pedido, tracking, chat, cancelación, perfil y logout, con navegador
Chromium real. No reinicia `localhost:3000`, no ejecuta migraciones ni cambia
código compartido.

## Qué valida

| Bloque | Comprobaciones |
|---|---|
| Login OTP | Error inline con teléfono vacío; `customer.requestOtp`; `customer.verifyOtp`; cliente existente y mismo `id` que `DATABASE_URL`; entrada a `/home`. |
| Sesión | Cookies `quickgo_token` y `refresh_token` HttpOnly y `SameSite=Lax`; access ~15 min; refresh ~365 días; `Secure` si la URL es HTTPS; ningún JWT en `localStorage`; reload conserva sesión; `/` y `/customer-login` redirigen a `/home`. |
| Home | Catálogo y buscador visibles; búsqueda por nombre de producto navega a `/search?q=...`. |
| Búsqueda y tienda | Tarjeta exacta “producto de comercio”; apertura de `/store/:id`; producto visible; mínimo del comercio mostrado cuando existe. |
| Carrito | Producto y cantidad en `localStorage`; alerta de mínimo; CTA deshabilitado; incrementos de cantidad; desaparición del bloqueo. |
| Quote | `order.quote` del servidor: subtotal, envío, total, comisión y `minOrder`; `subtotal + deliveryFee = total`; sin `issues`; totales del DOM coinciden. |
| Checkout | Dirección manual vacía bloquea; transferencia sin comprobante bloquea; datos bancarios o advertencia visible; efectivo habilita; resumen del modal coincide con el quote. |
| Creación | El body de `order.create` no envía `subtotal`, `deliveryFee`, `commission`, `total` ni `customerId`; estado inicial `received`; totales server-side; reintento con la misma `idempotencyKey` devuelve el mismo pedido; carrito local se limpia. |
| Tracking | `Pedido #id`, estado “Pedido recibido”, “Paso 1 de 6”, progreso, producto, dirección y total; indicador SSE “En vivo”. |
| Chat | `chat.send` deriva `senderType=customer` y `senderId` del servidor; `orderId` correcto; el mensaje persiste tras reload; indicador SSE “Mensajes en tiempo real”. |
| Cancelación | Prompt visible; `order.updateStatus` responde `cancelled` con el motivo; UI muestra “Cancelado”, “Motivo: …” y oculta el botón. |
| Perfil y logout | Perfil e historial cargan con el cliente autenticado; logout responde 200; cookies de cliente se limpian; `/home` vuelve a exigir `/customer-login`. |
| Higiene | 0 `pageerror`/errores de consola críticos; 0 respuestas API 5xx y 0 401/403 inesperados durante la sesión; limpieza final verificada. |

Los errores de consola de `favicon`, `manifest`, `EventSource`/`/api/events/`,
`ResizeObserver` y `net::ERR_ABORTED` se consideran ruido de navegación. Los SSE
se validan aparte por su indicador visible de conexión.

## Requisitos

1. Servidor de la app levantado y accesible en `E2E_BASE_URL` (por defecto
   `http://localhost:3000`). **No reiniciarlo desde este script.**
2. `DATABASE_URL` apuntando **a la misma base** que usa ese servidor. El script
   lee cliente, configuración, comercio y producto; escribe únicamente el pedido
   temporal, su chat y los OTP del teléfono de prueba. Si el `id` del cliente
   autenticado no coincide con la base, aborta antes de crear el pedido.
3. Un cliente **existente** en `customers`, no borrado, con celular de Ecuador
   (`+593...`). No se registra un cliente nuevo. Usa un número **exclusivo de
   pruebas**: el script borra sus OTP previos para evitar el rate limit de 45 s.
4. Al menos un comercio `active` + `open`, con un producto `is_available=yes`,
   `admin_paused=false`, `unit_type=unit`, precio positivo y precio menor al
   mínimo aplicable. El script elige automáticamente un producto que falla el
   mínimo con 1 unidad y lo supera con `<= E2E_MAX_QTY` unidades (12 por defecto),
   o usa `E2E_PRODUCT_ID`.
5. `app_settings.delivery_fee` y `app_settings.min_order_amount` válidos. La
   comisión se compara con `commerces.commission_rate`.
6. Dependencias: `dotenv`, `pg`, `playwright-core` y Chromium/Chrome. Si falta
   `playwright-core`, instalarlo con `npm i -D playwright-core` (implica tocar
   `package.json`, archivo no asignado a este frente). `CHROME_PATH` permite
   apuntar a un ejecutable concreto.
7. Para host remoto, autorización explícita:
   `E2E_CUSTOMER_ALLOW_WRITES=1`. Sin ella el script no escribe nada.
8. Coordinar la ventana de prueba: el pedido aparece durante segundos en los
   paneles de comercio/admin. Se cancela y elimina al final. No ejecutar en
   paralelo con otras suites que usen el mismo cliente/producto.

## Variables

| Variable | Default | Uso |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | URL del servidor. |
| `E2E_CUSTOMER_PHONE` | `+593 99 123 4567` | Cliente de prueba existente (Ecuador). |
| `E2E_CUSTOMER_ALLOW_WRITES` | vacío | Obligatorio `=1` en host remoto. |
| `E2E_OTP_CODE` | vacío | Código del OTP solicitado **en esta corrida**. |
| `E2E_PRODUCT_ID` | auto | Fuerza un producto unitario elegible. |
| `E2E_DELIVERY_ADDRESS` | Av. Amazonas y Naciones Unidas, Quito | Base de la dirección; se le añade una firma única por corrida. |
| `E2E_MAX_QTY` | `12` | Máximo de unidades usadas para superar el mínimo. |
| `E2E_HEADED` | vacío | `=1` muestra el navegador. |
| `E2E_IGNORE_HTTPS_ERRORS` | vacío | `=1` acepta certificados no confiables. |
| `E2E_CUSTOMER_SCREENSHOTS` | vacío | `=1` guarda capturas en `test-flow-screenshots/customer-production/`. |
| `CHROME_PATH` | autodetectado | Ejecutable de Chrome/Chromium. |
| `DATABASE_URL` | — | Obligatoria; misma base que el servidor. |

### OTP en producción

Prioridad del script:

1. `E2E_OTP_CODE`.
2. `devCode` de la respuesta (solo `NODE_ENV=development/test` + fallback local).
3. Texto “tu código es …” de la UI (solo desarrollo).
4. Pregunta interactiva por consola si `stdin` es TTY.
5. Error accionable.

Como el OTP se genera al ejecutar, `E2E_OTP_CODE` debe ser el código del WhatsApp
de esa misma corrida. En una terminal interactiva se puede omitir y escribir el
código cuando el script lo pida. En CI no interactivo es obligatorio. El script
nunca imprime el código.

## Ejecución local

```powershell
$env:E2E_BASE_URL="http://localhost:3000"
$env:E2E_CUSTOMER_PHONE="+593 99 123 4567"
node scripts/production-customer-smoke.mjs
```

Con fallback de desarrollo (`NODE_ENV=development` y `OTP_DEV_FALLBACK=true`) el
código se toma solo. Si el servidor local usa NeuroChat real, ejecutar en una
terminal interactiva y escribir el código recibido, o definir `E2E_OTP_CODE`.

## Ejecución contra staging/producción

```powershell
$env:E2E_BASE_URL="https://rapidy.example"
$env:E2E_CUSTOMER_PHONE="+593 99 123 4567"
$env:E2E_CUSTOMER_ALLOW_WRITES="1"
$env:DATABASE_URL="postgresql://..."
$env:E2E_OTP_CODE="123456"   # o omitir y usar terminal interactiva
node scripts/production-customer-smoke.mjs
```

No adjuntar `DATABASE_URL`, cookies, tokens ni OTP a la evidencia. El script
imprime `SETUP`, `ADDRESS`, `ORDER`, una línea `PASS`/`FAIL` por comprobación,
`LIMPIEZA` y `RESULT`.

## Limpieza

Corre en `finally`, incluso si una comprobación falla:

1. Identifica el pedido por el `id` capturado de `order.create` y, como red de
   seguridad, por la dirección única `E2E Rapidy <run> - ...`.
2. Solo borra pedidos del cliente de prueba, creados después del inicio de la
   corrida y **sin driver asignado**. El `delete` arrastra items, historial,
   estados por comercio y chat.
3. Borra los OTP del teléfono de prueba creados durante la corrida.
4. Verifica leftovers y reporta
   `LIMPIEZA orders=0 chat=0 items=0 history=0 otp=0 deleted=… deleted_otp=…`.

No se modifican clientes, productos, comercios, settings, wallets ni pedidos
reales. Si un driver llegara a tomar el pedido, la limpieza se niega a borrarlo y
falla: revisar `ORDER`/`ADDRESS` y resolver manualmente. Si el proceso muere con
`SIGKILL` antes del `finally`, usar el `ORDER id` impreso para la limpieza
manual; no borrar por rango de fechas ni por aproximación.

## Criterio de aceptación

Se aprueba solo si:

- `RESULT 35/35 PASS` (o `n/n`, si se omite la comprobación de mínimo propio del
  comercio) y exit code `0`.
- `LIMPIEZA orders=0 chat=0 items=0 history=0 otp=0`.
- No hay `FAIL` en login/sesión, quote/totales, creación, tracking, chat,
  cancelación ni limpieza.
- El servidor no se reinició ni se aplicaron migraciones durante la prueba.
- Se guarda como evidencia la salida completa, `SETUP`/`ORDER`/`ADDRESS`, commit,
  fecha y capturas si `E2E_CUSTOMER_SCREENSHOTS=1`. Redactar datos personales,
  OTP, cookies y `DATABASE_URL`.

## Fuera de alcance

- Transferencia exitosa con subida real de comprobante y `payment_rejected` con
  reenvío (solo se valida el bloqueo/aviso).
- Ciclo de entrega (comercio/repartidor/admin), mapa con tiles reales,
  geolocalización GPS, push/FCM, PWA, temas y multi-comercio.
- Registro de clientes nuevos, recuperación de cuenta y baja de cuenta.
- Entrega real del OTP por WhatsApp; el proveedor es externo.
- Carga, concurrencia, multi-instancia y despliegue.

## Si falla

1. Leer el primer `FAIL`; los siguientes pueden ser consecuencia.
2. Confirmar que `E2E_BASE_URL` y `DATABASE_URL` apuntan al mismo entorno.
3. Revisar OTP: número dedicado, rate limit de 45 s, `NODE_ENV` y código de la
   corrida. No reintentar más de una vez sin esperar.
4. Revisar `LIMPIEZA`; si no es cero, usar `ORDER`/`ADDRESS` para la limpieza
   manual. No borrar pedidos reales.
5. Si el fallo es de contrato (totales, estados, identidad de chat, permisos),
   tratar el código como fuente de verdad solo después de revisar
   `docs/customer/` y los tests. No debilitar el script para ocultar una
   regresión ni reiniciar el servidor para “arreglar” la prueba.

## Archivos y notas de alcance

- Creados en este frente: `scripts/production-customer-smoke.mjs` y este
  documento.
- No se editó `docs/production/ENVIRONMENT.md` (archivo compartido) aunque
  conviene añadir allí `E2E_CUSTOMER_PHONE`, `E2E_CUSTOMER_ALLOW_WRITES`,
  `E2E_PRODUCT_ID`, `E2E_DELIVERY_ADDRESS`, `E2E_MAX_QTY` y
  `E2E_CUSTOMER_SCREENSHOTS`.
- El script usa `playwright-core`, que hoy no figura en `package.json`; se
  mantiene la misma dependencia que los smoke tests existentes.