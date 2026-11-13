> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de `/cart` y checkout — Rapidy (DeliveryCity)

- **Repo:** `C:\Users\HP\OneDrive\Desktop\Rapidy`
- **Commit base:** `3f673c6` (`master`, 2026-11-13); la revisión comenzó sobre `fd11626`. El commit `3f673c6` solo sincronizó saltos de línea en tres componentes de OrderTracking, sin cambios de lógica en el checkout.
- **Fecha de auditoría:** 2026-11-13
- **Alcance:** ruta `/cart`, modal de dirección/checkout, carrito global, creación de pedido en tRPC, esquema de BD y pantalla de seguimiento inmediata (`/order/:id`).
- **Método:** revisión estática archivo por archivo, lectura de contratos tRPC/Drizzle y verificación de clases Tailwind con un build temporal en `%TEMP%` (no se tocó código fuente). No se ejecutaron pagos reales ni pruebas E2E contra la BD.
- **Regla respetada:** no se modificó ningún archivo de `src/`, `server/` ni `db/`; este informe es el único artefacto escrito.

> **Leyenda de severidad**
> **P0** = bloqueante de lanzamiento: pérdida de dinero, brecha de datos o escritura no autenticada.
> **P1** = alto: regla de negocio rota, pedido duplicado, precio incorrecto, accesibilidad crítica o CTA principal inutilizable.
> **P2** = medio: UX/estado inconsistente, deuda que puede escalar, performance relevante.
> **P3** = bajo: pulido visual, consistencia, casos raros.

---

## 1. Resumen ejecutivo

1. **P0 — Dinero:** el `deliveryFee` y la `commission` los envía el cliente y el backend los guarda tal cual (`server/order-router.ts:25,64,71-72`). Con una llamada autenticada se puede crear un pedido con envío `0`, envío negativo o comisión `0`; `orders.total` deja de ser confiable.
2. **P0 — Dinero:** la comisión se calcula en el navegador con `settings.commission_rate`, una clave que `settings.getPublic` **nunca devuelve** (`src/pages/customer/Cart.tsx:71-72` vs `server/settings-router.ts:5-12`). Siempre cae al fallback 8 %, y además es manipulable.
3. **P0 — Privacidad/seguridad (adyacente al checkout):** `order.getById`, `order.getByCustomer`, `customer.list` y `getAvailableForDriver` son `publicQuery`; exponen dirección, teléfono, notas y comprobantes por enumeración de IDs (`server/order-router.ts:125-185,198-238`, `server/customer-router.ts:85-92,111-114`). `order.updateStatus` también es público (`server/order-router.ts:240-330`).
4. **P1 — Stock/estado:** no existe columna de stock ni reserva; el servidor no valida `products.isAvailable`, `commerces.isOpen/status` ni `minOrder`. La UI solo bloquea comercios cerrados y lo hace con una caché de 5 minutos (`server/order-router.ts:46-62`, `db/schema.ts:140-153`, `src/pages/customer/Cart.tsx:77-80`).
5. **P1 — Duplicados/pérdida:** no hay `idempotencyKey` ni índice único; un timeout después del commit y un reintento crean un segundo pedido. El error de `order.create` solo se escribe en consola y el carrito no se limpia (`src/pages/customer/Cart.tsx:135-158`).
6. **P1 — Precio congelado vs actual:** la UI muestra el precio guardado en `localStorage`; el servidor cobra el precio actual de `products` sin comparar ni avisar (`src/hooks/useCart.tsx:87`, `server/order-router.ts:51-60`). El cliente puede pagar un total distinto al que aprobó.
7. **P1 — Persistencia/privacidad del carrito:** `JSON.parse` sin `try/catch`, sin TTL, sin sincronización entre pestañas y sin scope por usuario. El carrito sobrevive al logout y otro cliente del mismo dispositivo lo hereda (`src/hooks/useCart.tsx:28-31,81-84`).
8. **P1 — UI del CTA:** el botón principal del modal usa `h-13`, clase que Tailwind 3 no genera (verificado con build); queda de ~20–24 px de alto. En iPhone con safe-area, la bottom nav (`z-50`) tapa ~18 px del botón de checkout (`z-40`, `bottom-[74px]`) (`CartAddressModal.tsx:407`, `Cart.tsx:373`, `index.css:140-142`).

---

## 2. Mapa end-to-end y diagrama

### 2.1 Flujo real (tal como está implementado)

```
[Home / Search / CommerceDetail]
   addItem({ productId, commerceId, name, price:string, quantity?, image, commerceName, unitType? })
   │  · Home/Search NO envían unitType (los kg pierden semántica)
   │  · No se valida comercio abierto ni isAvailable
   ▼
[CartProvider · src/hooks/useCart.tsx]
   setItems(prev => ...)  +  localStorage.setItem("cart", JSON.stringify(newItems))
   │  · clave global "cart", sin TTL, sin listener "storage", sin scope de cliente
   ▼
[/cart · SessionGuard role="customer"]
   hidrata items desde localStorage
   ├─ grouped = getItemsByCommerce()           (snapshot de commerceName)
   ├─ subtotal = Σ parseFloat(item.price)*qty  (float, cliente)
   ├─ invalidItems = commerce.list (cache 5 min) y commerce.isOpen !== "open"
   └─ total = (subtotal + deliveryFee).toFixed(2)
   ▼
[CartAddressModal]  (estado local: addressMode, customAddress, currentAddress, receipt)
   profile.address  |  custom  |  GPS → Nominatim → string
   cash  |  transfer (+ base64 obligatorio solo en UI)
   ▼
confirmOrder() → trpcMutate POST /api/trpc/order.create
   input exacto:
   {
     customerId, items:[{productId, commerceId, quantity}],
     deliveryAddress, customerPhone, paymentMethod,
     paymentReceipt?, deliveryFee: string, commission: string
   }
   ▼
[customerQuery: cookie quickgo_token / refresh_token]
   if (input.customerId !== ctx.customer.id) throw
   ▼
for each item:
   SELECT * FROM products WHERE id = productId      ← N+1, sin isAvailable
   subtotal += parseFloat(product.price) * quantity ← precio ACTUAL del servidor
total = subtotal + parseFloat(input.deliveryFee)     ← fee del CLIENTE
   ▼
BEGIN
  INSERT orders (status received|pending_payment, subtotal, deliveryFee, commission, total, ...)
  INSERT order_items ×N   (productName, unitPrice y total snapshot)
  INSERT order_status_history
  INSERT order_commerce_status ×M  (M = commerceIds enviados por el cliente)
COMMIT
   ▼
SSE commerce:{id} / admin:dashboard
   ▼
{ success: true, order }
   ▼
setOrderPlaced(true) + clearCart()
   ▼
Pantalla de éxito local (NO redirige automáticamente)
   └─ botón manual → /order/:id
```

### 2.2 Fases, confianza y puntos de fallo

| Fase | Dónde vive | Fuente de verdad | Punto de fallo principal |
|---|---|---|---|
| Agregar ítem | Home/Search/CommerceDetail | Cliente | No valida estado del comercio/producto; Home/Search pierden `unitType` |
| Persistir carrito | `useCart` + `localStorage["cart"]` | Cliente | JSON corrupto, sin TTL, sin sync, sin scope de usuario |
| Agrupar/totalizar | `Cart.tsx` + `useCart` | Cliente | Precio snapshot, float, comisión inventada |
| Validar comercio | `useCommerces` (cache 5 min) | Servidor (cacheado) | Carrera con la carga; servidor no revalida al crear |
| Dirección | Modal + Nominatim | Cliente | Sin zona/geofence, sin coordenadas persistidas, sin libreta |
| Pago | Modal | Cliente | Transferencia sin comprobante permitida por API |
| Crear pedido | `order.create` | Servidor | Fee/comisión del cliente; sin stock/estado/mínimo; sin idempotencia |
| Persistir pedido | Transacción Drizzle | Servidor | Precios leídos fuera de la transacción; `commerceId` no derivado del producto |
| Confirmar | `Cart.tsx` | Cliente | Error solo en consola; sin redirect; estado de éxito volátil |
| Seguimiento | `/order/:id` + `order.getById` | Servidor | `publicQuery`: PII enumerable; totales inconsistentes |

### 2.3 Contrato real de `order.create` (resumen)

```ts
// server/order-router.ts:9-28
{
  customerId: number;                 // debe coincidir con ctx.customer.id
  items: Array<{
    productId: number;
    commerceId: number;               // viene del cliente, no se contrasta con el producto
    quantity: number;                 // positive(), sin máximo ni decimales restringidos
  }>;                                 // sin .min(1)
  deliveryAddress: string;            // sin min(), acepta ""
  customerPhone: string;              // sin min(), no se toma de ctx.customer
  paymentMethod: "cash" | "transfer";
  paymentReceipt?: string;            // no obligatorio aunque sea transfer
  notes?: string;                     // la UI nunca lo envía
  deliveryFee: string;                // default "2.50"; el servidor lo usa tal cual
  commission: string;                 // default "0.00"; el servidor lo usa tal cual
}
// salida: { success: true, order: OrderRow }  (OrderRow incluye paymentReceipt y PII)
```

---

## 3. Inventario de archivos

| Archivo | Rol en el flujo | Líneas clave |
|---|---|---|
| `src/pages/customer/Cart.tsx` | Pantalla, totales, estado de checkout, mutación | 52-80, 103-159, 161-209, 243-319, 352-417 |
| `src/pages/customer/components/CartAddressModal.tsx` | Bottom sheet de dirección, pago, resumen y CTA | 99-120, 123-154, 157-250, 252-367, 370-412 |
| `src/hooks/useCart.tsx` | Estado global, persistencia, agrupación, subtotal | 3-12, 27-98 |
| `src/components/CommerceCartBar.tsx` | Barra “Ir a pagar” por comercio | 32-84 |
| `src/components/CustomerBottomNav.tsx` | Nav inferior + badge de carrito | 35-107 |
| `src/components/SessionGuard.tsx` | Protección de ruta y redirect de sesión | 11-95 |
| `src/components/PageTransition.tsx` | Animación de ruta | 19-56 |
| `src/hooks/useDeliveryData.ts` | Fetch tRPC custom, hooks de pedido/settings | 33-72, 84-99, 224-273, 434-440 |
| `src/hooks/useSessionSync.ts` | Sync de `qs_session` entre pestañas | 3-42 |
| `src/hooks/useCustomerSession.tsx` | Hidratación y refresh de cliente | 37-120 |
| `src/lib/locationUtils.ts` | Reverse geocoding Nominatim | 1-13 |
| `src/lib/imageUtils.ts` | Fallbacks de imagen | 1-10 |
| `src/pages/customer/Home.tsx` | Add-to-cart desde cards destacadas | 212-250, 252-345 |
| `src/pages/customer/Search.tsx` | Add-to-cart desde búsqueda | 212-258 |
| `src/pages/customer/CommerceDetail.tsx` | Add-to-cart, kg/importe, minOrder | 97-137, 236-241, 290-318, 440-444 |
| `src/pages/customer/OrderTracking.tsx` | Destino del checkout | 49-120, 160-180 |
| `src/pages/customer/components/OrderTrackingDetails.tsx` | Desglose mostrado al cliente | 60-90, 94-120 |
| `server/order-router.ts` | Creación, consulta y estados del pedido | 8-123, 125-185, 198-238, 240-330, 447-478 |
| `server/product-router.ts` | Productos y disponibilidad | 23-28, 99-106, 108-227 |
| `server/commerce-router.ts` | Comercios, `isOpen`, `minOrder`, stats | 9-47, 49-107, 109-178 |
| `server/customer-router.ts` | Auth, perfil y consultas | 33-92, 93-114 |
| `server/settings-router.ts` | Whitelist de settings públicos | 5-25 |
| `server/middleware.ts` | `customerQuery` y auth | 12-23, 64-67 |
| `server/context.ts` | Cookies y contexto de auth | 33-57, 145-156 |
| `db/schema.ts` | Tablas y constraints | 66-74, 113-153, 159-194, 211-217, 245-250 |
| `src/index.css` | Tokens, safe-area, mobile shell | 7-12, 19-49, 109-145, 210-212 |
| `tailwind.config.js` | Tokens de radio/sombra | 4-61, 76-83 |
| `src/App.tsx` | Rutas y providers | 12, 59-65, 95-101, 145-153 |
| `src/main.tsx` | Providers globales | 11-22 |
| `src/providers/QueryProvider.tsx` | QueryClient de la app | 5-18 |
| `src/providers/trpc.tsx` | QueryClient/tRPC alterno | 24-47, 49-72 |
| `public/sw.js` | Service worker y offline | 16-56 |
| `index.html` | Viewport, tema, SW | 5-17, 38-45 |

> **No existe** tabla `addresses` ni campo de stock en `db/schema.ts` (el archivo termina en la línea 250). La única dirección es `customers.address` (`db/schema.ts:66-74`).

---

## 4. Hallazgos

### 4.1 Tabla P0 / P1 (dinero, stock, duplicados, pérdida y bloqueantes)

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| C-01 | **P0** | Dinero | `server/order-router.ts:25,64,71` · `src/pages/customer/Cart.tsx:146` | `deliveryFee` llega como string del cliente y se usa directamente para `orders.total`; no se lee de `app_settings`, no se valida rango ni decimal. | Envío `0`, negativo o `"abc"` (→ `NaN`/500) manipula el total y `driverEarnings` (que se calcula sobre `order.deliveryFee`, `order-router.ts:270-283`); reportes y liquidaciones incorrectos. | Calcular el fee en el servidor desde settings/zona; eliminar `deliveryFee` del input; Zod `z.number().nonnegative()` si se conserva. |
| C-02 | **P0** | Dinero | `src/pages/customer/Cart.tsx:71-72,147` · `server/settings-router.ts:5-12` · `server/order-router.ts:26,72` | La comisión se calcula en el cliente con `settings.commission_rate`, clave que `getPublic` no expone (siempre fallback 8 %), y se persiste el valor enviado. | Comisión falsificable a `0` o incorrecta; `orders.commission` y el reporte de comisiones (`server/admin/settings-router.ts:304`) no son confiables. | Calcular por ítem/comercio en el servidor usando `commerces.commissionRate`; no aceptar comisión del cliente. |
| C-03 | **P0** | Privacidad | `server/order-router.ts:125-185,198-238` · `server/customer-router.ts:85-92,111-114` | `order.getById`, `order.getByCustomer`, `getAvailableForDriver`, `customer.getById` y `customer.list` son `publicQuery`; `SELECT *` incluye `deliveryAddress`, `customerPhone`, `notes` y `paymentReceipt`. | Cualquiera enumera IDs y extrae PII, direcciones, teléfonos y comprobantes bancarios. | Convertir a `customerQuery`/`adminQuery`/`driverQuery` con ownership; proyectar solo campos necesarios; no devolver `paymentReceipt`; rate limiting. |
| C-04 | **P0** | Seguridad | `server/order-router.ts:240-330` · `server/commerce-router.ts:180-193` | `order.updateStatus` es `publicQuery`; acepta cualquier `id`, `status` y `driverId` sin auth ni ownership. Además, `commerce.markReady` (merchantQuery) no verifica que el comercio pertenezca al merchant. | Cualquiera marca pedidos como entregados, asigna drivers o dispara `driverEarnings`; un merchant marca listo el pedido de otro comercio. Fraude operativo y contable. | Middleware por rol, máquina de estados permitida y verificación de ownership del pedido/comercio. |
| C-05 | **P1** | Stock/estado | `server/order-router.ts:46-62` · `db/schema.ts:140-153` · `src/pages/customer/Cart.tsx:77-80` | El servidor solo comprueba que el producto exista. No valida `products.isAvailable`, `commerces.isOpen`, `commerces.status` ni `minOrder`; la UI valida solo `isOpen` y con caché de 5 min. | Se puede ordenar un producto inactivo o de un comercio cerrado; la UI puede dejar pasar la ventana de caché. | Revalidar todo en `order.create`/`quote`; devolver `409` con el motivo; refrescar estados al abrir el modal. |
| C-06 | **P1** | Stock | `db/schema.ts:140-153` · `server/order-router.ts:66-111` | No existe columna/ tabla de stock ni decremento/reserva; no hay control de unidades disponibles. | Overselling ilimitado; dos clientes compran el último ítem; el comercio cancela y se pierde confianza. | Añadir `stock`/`inventory`; decremento atómico `UPDATE ... WHERE stock >= qty RETURNING`; reserva con TTL y liberación. |
| C-07 | **P1** | Dinero/negocio | `db/schema.ts:123` · `server/settings-router.ts:9` · `src/pages/customer/CommerceDetail.tsx:236-241` | `commerces.minOrder` y `settings.min_order_amount` se guardan y muestran, pero nunca se validan en carrito ni servidor. | Pedidos por debajo del mínimo; se muestra “Pedido mínimo $5” y se permite pagar $1. | Validar mínimo por comercio y global en el servidor; mostrar “faltan $X” y deshabilitar el CTA con motivo. |
| C-08 | **P1** | Duplicados | `server/order-router.ts:66-111` · `src/pages/customer/Cart.tsx:135-153` | No hay `idempotencyKey`, constraint único ni detección de doble submit; la única protección es `loading` en React. | Timeout tras commit + reintento manual, doble pestaña o doble dispositivo crean pedidos duplicados; el usuario paga dos veces. | `idempotencyKey` UUID por intento + índice único; `order.create` devuelve el pedido existente si la clave se repite; botón con `ref`/`disabled`. |
| C-09 | **P1** | Dinero | `src/hooks/useCart.tsx:7,87` · `src/pages/customer/Cart.tsx:280` · `server/order-router.ts:51-60` | La UI totaliza con el `price` snapshot de `localStorage`; el servidor cobra el `products.price` actual. No hay `expectedTotal` ni quote. | El usuario aprueba un total y se le cobra otro si el comercio cambió el precio; no hay aviso ni cancelación. | `order.quote` server-side con `quoteId`/`priceVersion`; `order.create` con `expectedTotal`; `409 price_changed` y confirmación explícita. |
| C-10 | **P1** | Contrato | `server/order-router.ts:44,55-56,86-87,102-108` | `commerceId` lo envía el cliente y se guarda sin compararlo con `products.commerceId`; `orderCommerceStatus` se crea con los IDs enviados. | Un pedido puede atribuir ítems a otro comercio; el comercio víctima ve productos que no vendió; liquidaciones cruzadas. | Derivar `commerceId` del producto leído; ignorar el del cliente; validar que todos los ítems del comercio existan. |
| C-11 | **P1** | Contrato | `server/order-router.ts:13-27` | Zod no exige `items.min(1)`, dirección/teléfono no vacíos, comprobante para transferencia, límite de cantidad ni unicidad de `productId`; acepta `5e-324`. | Pedido vacío con solo envío, direcciones vacías, transferencia sin comprobante, líneas duplicadas o cantidades absurdas. | Schema estricto: `.min(1).max(50)`, `trim().min(5)`, `superRefine` receipt, `quantity` con escala y máximo, `refine` de IDs únicos. |
| C-12 | **P1** | UX/error | `src/pages/customer/Cart.tsx:154-156` · `src/hooks/useDeliveryData.ts:68-70` | `confirmOrder` cierra el modal, hace `await` y en `catch` solo `console.error`; no hay toast, banner ni retry. Los errores de negocio se lanzan como `Error` genérico → HTTP 500. | El usuario ve el carrito de nuevo sin explicación; reintenta y puede duplicar; errores de producto/comercio son indescifrables. | Estado de error visible con código/mensaje; mantener el modal abierto; `TRPCError` con `BAD_REQUEST/CONFLICT/NOT_FOUND`; retry idempotente. |
| C-13 | **P1** | Pérdida | `src/hooks/useCart.tsx:28-31` | `JSON.parse(localStorage.getItem("cart"))` sin `try/catch` ni validación de forma; si el valor es `{`, `null` o un objeto, el render inicial lanza. | Pantalla en blanco / app inutilizable hasta limpiar el almacenamiento; pérdida del carrito. | `try/catch` + schema (`z.array(CartItemSchema)`) + fallback `[]`; versión de carrito y migración. |
| C-14 | **P1** | Privacidad | `src/hooks/useCart.tsx:28-31,81-84` · `src/pages/customer/Cart.tsx:152` · `src/pages/customer/Profile.tsx:136-139` | El carrito vive en `localStorage["cart"]` global y solo se limpia tras una orden exitosa; logout no lo toca y `CartProvider` está fuera de `CustomerSessionProvider`. | En un dispositivo compartido, el siguiente cliente ve y puede pedir los ítems del anterior. | Clave por `customerId` (o carrito server-side), limpiar en logout/cambio de usuario; no reutilizar estado entre sesiones. |
| C-15 | **P1** | UI | `src/pages/customer/components/CartAddressModal.tsx:407` · `tailwind.config.js:5-82` | `h-13` no existe en Tailwind 3 (verificado: el build no genera `.h-13`); el CTA no tiene altura ni padding vertical y queda de ~20–24 px. | El botón principal de confirmar pedido es casi una línea de texto; difícil de tocar y visualmente roto. | `h-12`/`h-14`/`min-h-12` + `py-3`; revisar los demás `h-13` del repo (`PhoneInput`, `Login`, `CommerceLayout`). |
| C-16 | **P1** | UI/safe-area | `src/pages/customer/Cart.tsx:373` · `src/index.css:140-142` · `src/components/CustomerBottomNav.tsx:41` | El checkout usa `bottom-[74px]` fijo y `z-40`; la nav usa `bottom-safe-nav` (hasta 34 px) y `z-50`. Con inset 34, la nav sube a ~92 px y tapa ~18 px del botón (74–92). | En iPhone/Android con gesto inferior, parte del CTA queda cubierta por la nav; toque fallido. | Layout en columna (`checkout` + `nav` en un mismo contenedor) o `bottom: calc(env(safe-area-inset-bottom) + navHeight + gap)`; z-index coherente. |
| C-17 | **P1** | Accesibilidad | `src/pages/customer/components/CartAddressModal.tsx:123-128,144-150` | El modal es un `div` sin `role="dialog"`, `aria-modal`, `aria-labelledby`, sin focus trap, sin `Escape`, sin retorno de foco y con el fondo tabulable. | Lectores de pantalla no anuncian el checkout; el teclado escapa al contenido de atrás; usuarios de teclado no pueden cerrar/operar con seguridad. | Usar `@radix-ui/react-dialog` (ya instalado) o implementar role/aria, focus trap, Escape, `overflow:hidden` y retorno de foco. |
| C-18 | **P1** | Dinero/totales | `src/pages/customer/components/OrderTrackingDetails.tsx:76-90` · `server/order-router.ts:64,72` | El seguimiento muestra `order.commission` como “Tarifa de servicio”, pero `orders.total` **no incluye** la comisión (`total = subtotal + deliveryFee`). El desglose visible no suma el total. | El cliente cree que se le cobró una tarifa que no está en el total; contradicción entre `/cart`, `/order/:id` y administración; desconfianza. | No mostrar la comisión interna al cliente o incluirla explícitamente en el total y en el contrato; una sola fuente de cálculo. |
| C-18B | **P1** | Dinero/operación | `src/pages/customer/components/CartAddressModal.tsx:111-113` · `db/seed.ts:225-231` | Si falta `settings.bank_transfer_info` (el seed no lo inserta), el modal usa una cuenta bancaria hardcodeada: “Banco Pichincha • Cta. Corriente: 2100894567 • Titular: Rapidy Express S.A.”. | Un cliente puede transferir a una cuenta no verificada o equivocada; riesgo de pérdida de dinero y fraude. | Exigir `bank_transfer_info` desde settings; si falta, deshabilitar transferencia y mostrar “no disponible”; nunca hardcodear datos bancarios. |

### 4.2 Tabla P2 / P3 (UX, consistencia, performance, deuda)

| ID | Sev. | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| C-19 | P2 | Flujo | `src/pages/customer/Cart.tsx:149-153,161-188` | No hay redirección automática a `/order/:id`; el éxito es estado local (`orderPlaced`, `orderId`) y se pierde al refrescar. | El usuario queda en una pantalla efímera; al refrescar ve “carrito vacío” y no encuentra el pedido. | `navigate("/order/" + id, { replace: true })` tras el éxito o persistir el último pedido. |
| C-20 | P2 | Carrera/caché | `src/pages/customer/Cart.tsx:68,77-80,376,408-412` · `src/providers/QueryProvider.tsx:10-15` · `src/hooks/useDeliveryData.ts:84-90` | `invalidItems` depende de `commerce.list` con `staleTime` 5 min y `refetchOnWindowFocus:false`; el botón se habilita mientras `loadingCommerces`; `canConfirm` no incluye `invalidItems`. | Un comercio que cerró sigue permitiendo el checkout; si el modal se abrió antes de que cargue la lista, se puede confirmar igual. El servidor tampoco valida. | Revalidar en servidor; `refetch` al abrir el modal; incluir `invalidItems` en `canConfirm`; bloquear mientras carga. |
| C-21 | P2 | Zona/geo | `src/lib/locationUtils.ts:1-13` · `db/schema.ts:159-178` · `db/schema.ts:130-131` · `src/pages/customer/Cart.tsx:88-101` | No hay geofence ni radio; el GPS se convierte a un string y se descartan lat/lng; `orders` no guarda coordenadas; el fee es plano para multi-comercio. Si se deniega el GPS, el `catch` está vacío y no hay feedback. | Pedidos fuera de zona, direcciones ambiguas y re-geocodificación posterior en tracking; costo de envío irreal; el usuario no entiende por qué no pasa nada. | Guardar `deliveryLat/Lng`, validar radio por comercio/zona, fee por distancia/comercio; mostrar error/reintento de GPS. |
| C-22 | P2 | Direcciones | `db/schema.ts:66-74` · `src/pages/customer/components/CartAddressModal.tsx:101-106` | No existe tabla `addresses` ni libreta; solo `customers.address`. El modal ofrece perfil/custom/GPS sin IDs ni persistencia de la nueva dirección. | El cliente no puede guardar varias direcciones; la dirección “custom” se reescribe cada vez. | Tabla `addresses` con ownership, `addressId` en orders y CRUD desde el modal/perfil. |
| C-23 | P2 | Contrato/privacidad | `src/pages/customer/Cart.tsx:143` · `src/pages/customer/components/CartAddressModal.tsx:246-249` · `server/order-router.ts:21,77` | `customerPhone` y `deliveryAddress` se envían desde el cliente; el servidor no toma el teléfono de `ctx.customer.phone` ni valida ownership de la dirección. | Teléfono obsoleto (localStorage) o falsificado; dirección no verificada. | Derivar teléfono del customer autenticado; validar addressId/ownership o texto con límites. |
| C-24 | P2 | Feature | `server/order-router.ts:24,78` · `src/pages/customer/Cart.tsx` | La API acepta `notes`, pero el carrito/modal no tienen campo de notas ni instrucciones de entrega. | El cliente no puede indicar “dejar en portería”, “sin cebolla”, etc. | Añadir textarea con límite (p. ej. 500) y enviarlo. |
| C-25 | P2 | Perf/privacidad | `src/pages/customer/Cart.tsx:111-119,319-345` · `server/order-router.ts:23,75` · `server/boot.ts:34` · `src/hooks/useDeliveryData.ts:229-235` | El comprobante se lee como base64 sin compresión, sin validar MIME real ni tamaño; se guarda en `orders.payment_receipt` (text), el body limit es 50 MB y `order.getById` la devuelve en cada poll de 4 s. Además, el archivo y la dirección custom viven solo en estado React: un refresh pierde el comprobante y obliga a re-subirlo. | Fotos de 10–20 MB en memoria/red/BD; el tracking las re-descarga cada 4 s; lentitud en 3G; abuso de almacenamiento; EXIF con ubicación; pérdida de progreso al refrescar. | Comprimir a <2 MB, validar magic bytes, object storage con URL firmada, no devolver el receipt en `getById`; persistir borrador. |
| C-26 | P2 | Persistencia | `src/hooks/useCart.tsx` | El carrito no expira ni se revalida; puede quedar meses con precios/availability viejos. | Checkout con datos obsoletos; price drift (C-09) y comercios cerrados. | Timestamp `updatedAt`, TTL configurable, revalidación al abrir `/cart` y quote. |
| C-27 | P2 | Sync | `src/hooks/useCart.tsx` | No hay listener de `storage` ni `BroadcastChannel`; dos pestañas mantienen estados divergentes. | Una pestaña limpia el carrito y la otra sigue mostrando ítems; pueden crearse dos pedidos. | Escuchar `storage` y `BroadcastChannel`; reconciliar con `updatedAt`/versión. |
| C-28 | P2 | UI/estado | `src/pages/customer/Cart.tsx:70-73` · `src/hooks/useDeliveryData.ts:434-440` | `usePublicSettings` devuelve `{}` mientras carga y no expone error; el carrito muestra el fallback $2.50 y luego cambia al fee real. | Flash de total incorrecto y layout shift; si la query falla, queda $2.50 para siempre. | `isLoading`/`isError` explícitos; skeleton y bloquear checkout hasta tener settings; reintento. |
| C-29 | P2 | Dinero/redondeo | `server/order-router.ts:51-64,70-73` · `db/schema.ts:190-192` · `src/hooks/useCart.tsx:87` | Se usan floats; `order_items.total` se redondea por línea y `orders.subtotal` desde la suma sin redondear; `quantity` se guarda con escala 3 pero el total se calcula con la cantidad completa. | `orders.subtotal` puede diferir de `SUM(order_items.total)` por 1+ centavos; auditoría contable inconsistente. | Calcular en centavos enteros o `decimal.js`; redondear cada línea y sumar líneas redondeadas; tests de redondeo. |
| C-30 | P2 | UI/consistencia | `src/components/CommerceCartBar.tsx:37-42` · `src/components/CustomerBottomNav.tsx:81-88` · `src/pages/customer/Cart.tsx:225,264-268,296-298` | Para kg: la barra cuenta 1 por línea, la nav muestra `0.5`, el header dice “0.5 artículos” y el nombre muestra `0.30000000000000004 kg` mientras el control muestra `0.30`. | Tres contadores distintos para el mismo carrito; texto con ruido de float. | Unidad de conteo única (líneas vs unidades), `Intl.NumberFormat` y `toFixed` en todos los displays. |
| C-31 | P2 | Flujo | `src/pages/customer/Home.tsx:230-240,255-256,322-337` · `src/pages/customer/Search.tsx:240-247` | `addItem` desde Home/Search no envía `unitType` (kg se trata como unidad) y no valida comercio abierto; `CommerceCard` filtra `isFeatured` pero no `isAvailable`. | Productos por kg se agregan como 1 unidad; productos inactivos/de comercios cerrados entran al carrito. | Centralizar `addItem` en un helper que valide y normalice; pasar `unitType` siempre; filtrar `isAvailable`. |
| C-32 | P2 | Perf | `src/pages/customer/Cart.tsx:257-259` · `src/lib/imageUtils.ts:7-10` | Los thumbnails usan `background-image` con la URL original (600 px+) y no usan `safeImage`; `null` genera `url(null)`. | Descarga innecesaria en móvil, sin lazy loading ni fallback; thumbnails en blanco si la URL falla. | `<img loading="lazy" decoding="async">` con URL transformada (64–128 px) y `safeImage`; `srcset`. |
| C-33 | P2 | Offline | `public/sw.js:22-30` · `src/pages/customer/Cart.tsx:154-156` | El SW no cachea HTML/navegación; no hay detección de offline ni banner; el checkout falla y solo va a consola. | Sin red, el usuario no sabe por qué no avanza; al recargar no hay app shell. | Detección `navigator.onLine`, banner, fallback shell y mensaje de reintento; no permitir confirmar offline. |
| C-34 | P2 | UI/modal | `src/pages/customer/components/CartAddressModal.tsx:403,123-128,125` | El footer del modal no tiene `pb-safe`; el body de la página no se bloquea; el backdrop cierra el modal incluso con `loading`. | En iPhone el CTA queda bajo el home indicator; el fondo hace scroll; se pierde el progreso visual. | `pb-[calc(1rem+env(safe-area-inset-bottom))]`, `document.body.style.overflow="hidden"`, deshabilitar cierre durante loading. |
| C-35 | P2 | Accesibilidad | `src/pages/customer/Cart.tsx:270-311` · `src/pages/customer/components/CartAddressModal.tsx:146` · `src/index.css:210-212` | Botones +/- de 28 px, trash ~24 px, cerrar 32 px; labels de 10–11 px; los selectores de pago/dirección no usan `aria-pressed`/radio. | Áreas táctiles por debajo de 44 px y texto difícil de leer; estado de selección no anunciado. | Mínimo 44×44, labels ≥12 px, `role="radiogroup"`/`aria-checked` o `aria-pressed`. |
| C-36 | P2 | Accesibilidad/color | `src/pages/customer/Cart.tsx:279,367,377` · `src/pages/customer/components/CartAddressModal.tsx:167,407` · `index.html:5` | Blanco sobre `#FF6A00` ≈ **2.87:1**; `zinc-400` sobre blanco/`#F7F7FA` ≈ **2.4–2.6:1**; `user-scalable=no` impide zoom. | Falla WCAG AA (incluso texto grande en naranja) y usuarios con baja visión no pueden ampliar. | Oscurecer el naranja para texto/botones o usar texto oscuro; subir contraste; permitir zoom (`maximum-scale=5`). |
| C-37 | P2 | Design system | `src/index.css:27` · `tailwind.config.js:52-61` · `src/pages/customer/Cart.tsx` | La UI usa `#FF6A00`/`#0E0E12` hardcodeados; el token `--primary` es verde (hue 122). El radio está invertido: `rounded-xl` = 24 px, `rounded-2xl` = 16 px, `rounded-lg` = 20 px; `shadow-2xs` no existe (verificado). | Componentes shadcn futuros saldrán verdes; jerarquía de radios incoherente; sombras muertas. | Tokens `--brand`, `--brand-dark`, escala de radios monótona y eliminar clases inválidas. |
| C-38 | P2 | Deuda | `src/main.tsx:14-17` · `src/App.tsx:147` · `src/providers/trpc.tsx:24-69` · `src/hooks/useCustomerSession.tsx:37,113-120` · `src/App.tsx:67-77` | Hay dos `QueryClient` (tRPC y app), cuatro claves de sesión (`qs_session`, `customer_session`, `merchant_user`, `driver_user`) y dos timers de refresh (9 y 10 min). | Cachés duplicadas, invalidaciones que pueden ir al cliente equivocado, sesión obsoleta y trabajo duplicado. | Un solo `QueryClient` y un solo store de sesión; un refresh centralizado. |
| C-39 | P2 | Perf backend | `server/order-router.ts:46-62,129-142,418-431` | `order.create` hace `SELECT` por ítem (N+1); `getById` ejecuta 5–6 queries; `getCommerceOrders` consulta orden/cliente por cada pedido. | Latencia alta con carritos grandes y polling de tracking cada 4 s; carga de BD innecesaria. | `inArray` para productos, joins y agregaciones; límites de ítems; cache de comercio. |
| C-40 | P2 | Reportes | `server/admin/settings-router.ts:285-303` · `server/admin/dashboard-router.ts:173-179` | La comisión de un pedido multi-comercio se atribuye al **primer** comercio en el reporte; el dashboard recalcula por comercio, mientras `orders.commission` es un solo valor. | Reportes de comisiones y liquidaciones inconsistentes en pedidos multi-comercio. | Guardar comisión por `order_item`/comercio; reportar por esa tabla; una sola fórmula. |
| C-41 | P3 | Motion | `src/pages/customer/components/CartAddressModal.tsx:123,128` · `src/components/CommerceCartBar.tsx:48-52` | Animaciones `animate-in` y framer-motion sin `prefers-reduced-motion`. | Usuarios con sensibilidad al movimiento no pueden desactivarlas. | `motion-reduce:animate-none` y `useReducedMotion`. |
| C-42 | P3 | Robustez | `src/pages/customer/components/CartAddressModal.tsx:115-120,111-119` | `navigator.clipboard.writeText` sin `.catch`; `setTimeout` sin cleanup; dos `FileReader` pueden resolver fuera de orden. | Copy falla silenciosamente; estado en componente desmontado; previsualización del archivo equivocado. | `try/catch`, cleanup del timeout, token/última selección. |
| C-43 | P3 | UI | `src/components/CommerceCartBar.tsx:44-47` | El `return null` ocurre antes de `AnimatePresence`; la animación de salida nunca se ejecuta. | La barra desaparece de golpe. | Mantener el componente montado y animar con `AnimatePresence` fuera del condicional. |
| C-44 | P3 | UX | `src/pages/customer/Cart.tsx:62` · `src/pages/customer/components/CartAddressModal.tsx:101-108` | `addressMode` inicia en `"profile"` aunque no haya dirección guardada; solo se muestra un warning. | El usuario ve el CTA deshabilitado sin una acción clara; parece roto. | Si no hay `customer.address`, iniciar en `"custom"` y enfocar el input. |
| C-45 | P3 | Layout | `src/pages/customer/Cart.tsx:214,231` | El header usa `pt-safe` y el contenido suma `env(safe-area-inset-top) + 62px` sin descontar la altura real del header; en notch queda un gap extra. | Espacio muerto arriba; no rompe, pero desalinea el diseño. | Calcular la altura real del header o usar un spacer en flujo. |
| C-46 | P3 | Feedback | `src/pages/customer/Home.tsx:230-240` · `src/pages/customer/Search.tsx:240-247` | Agregar al carrito no muestra toast/confirmación; solo cambia el badge de la nav. | El usuario puede no saber si el ítem se agregó, sobre todo si está scrolleado. | Toast con “Agregado” + acción “Ver carrito”. |
| C-47 | P3 | Feature | `db/schema.ts:159-178` | No hay cupones, descuentos ni impuesto separado; la política legal dice que el precio incluye IVA (`TermsAndConditions.tsx:114`). | No se pueden aplicar promociones; el desglose no muestra impuesto. | Documentar “IVA incluido” o modelar `discount`/`tax` si el negocio lo requiere. |
| C-48 | P3 | Contrato | `server/product-router.ts:119` · `db/seed.ts:210` · `src/hooks/useCart.tsx` | `product.create` solo acepta `unit`/`kg`, pero el seed usa `"caja"`; el carrito solo trata `"kg"` como especial. | Productos legados con `"caja"` se comportan como unidad; inconsistencia de catálogo. | Enum compartido o normalización a `unit/kg` con `unitLabel`. |
| C-49 | P3 | Formato | `src/pages/customer/Cart.tsx:225,296-298` | `$` + `.toFixed(2)` manual; “0.5 artículos” y cantidades con float sin `Intl`. | Formato inconsistente entre pantallas y monedas; pluralización incorrecta. | `Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"})` y helper de plural. |
| C-50 | P3 | UX | `src/index.css:6-12` · `src/pages/customer/Cart.tsx:212` · `CartAddressModal.tsx:123` | `select-none` global impide copiar dirección, teléfono y datos bancarios; el modal también lo hereda. | Fricción para compartir dirección o pegar datos; accesibilidad. | Aplicar `select-none` solo a controles, no al texto de contenido. |
| C-51 | P3 | Consistencia | `src/pages/customer/Cart.tsx:214,373` · `src/components/CustomerBottomNav.tsx:41-42` | Header `max-w-[480px]`, nav/checkout `max-w-[440px]`; el contenido no comparte el mismo eje. | Desalineación visible en tablets/desktop. | Un solo ancho (`--app-max`) para header, contenido y barras. |

### 4.3 Controles que sí están bien (para no perderlos en la corrección)

- La creación de pedido valida que `input.customerId === ctx.customer.id` (`server/order-router.ts:30-32`); no se puede crear un pedido a nombre de otro cliente.
- La escritura del pedido es atómica: `orders`, `order_items`, `order_status_history` y `order_commerce_status` están dentro de `db.transaction` (`server/order-router.ts:66-111`).
- Se guarda snapshot de `productName`, `unitPrice` y `total` en `order_items` (`server/order-router.ts:54-61`); el historial no cambia si el producto se renombra.
- `order.updatePaymentReceipt` sí verifica ownership (`server/order-router.ts:451-453`).
- Los botones icónicos del carrito tienen `aria-label` (`Cart.tsx:218,273,291,308`).
- El body del modal usa `overflow-y-auto`, `overscroll-contain` y `min-h-0` (`CartAddressModal.tsx:154`); el scroll interno está bien contenido.
- El modal limita su altura a `92dvh` y usa un footer sticky (`CartAddressModal.tsx:128,403`), buena base para el fix de safe-area.
- Las pantallas de éxito/vacío reservan espacio para la nav con `pb-safe-nav` (`Cart.tsx:163,192`).
- La transición de ruta es corta (120 ms) y no bloquea la interacción (`PageTransition.tsx:34-37`).
- `order_items` tiene `onDelete: "cascade"` respecto a `orders` (`db/schema.ts:186`), evitando huérfanos al borrar un pedido de prueba.
- Los estados iniciales son coherentes: `cash` → `received`, `transfer` → `pending_payment` (`server/order-router.ts:69,95-99`).

**Lo que no se encontró:** no hay stale closures en `useCart` (los setters usan updater funcional, `useCart.tsx:35-48,70-76`), las keys de las listas son únicas (`commerceId` para grupos y `productId` para ítems, `Cart.tsx:245,255`) y la transacción de escritura del pedido es atómica. Los problemas principales son de contrato/validación y de estado cliente, no de closures.

---

## 5. Inconsistencias visuales

1. **El CTA principal está roto:** `h-13` no existe en Tailwind 3; el build temporal confirma que no se genera `.h-13`. El botón “Confirmar y pedir ahora” queda con altura de línea (~20–24 px), sin padding vertical, dentro de un footer blanco de 16 px. Es el defecto visual más grave del checkout (`CartAddressModal.tsx:407`).
2. **Safe-area vs bottom nav:** en dispositivos con home indicator, la nav flotante se eleva 34 px y el checkout se queda a 74 px; se solapan ~18 px. El CTA queda parcialmente tapado (`Cart.tsx:373`, `index.css:140-142`).
3. **Radios invertidos:** `rounded-xl` (24 px) es más grande que `rounded-2xl` (16 px) y que `rounded-3xl` (24 px); `rounded-lg` (20 px) queda entre medias. Los íconos de 32 px con `rounded-xl` parecen casi círculos dentro de cards de 16 px. La escala se define en `tailwind.config.js:52-58` con `--radius: 1.25rem`.
4. **Tres tonos oscuros:** `#0A0A0D` (LoadingFallback, `App.tsx:61`), `#0E0E12` (header/nav, `Cart.tsx:214`, `CustomerBottomNav.tsx:41`) y `#121212` (`index.css:7`, `index.html:2`). No hay un token único de “Dark Velvet”.
5. **Naranja vs tokens verdes:** `index.css:27` define `--primary: 122 39% 33%` (verde), pero todo el checkout hardcodea `#FF6A00`. Cualquier componente shadcn que use `bg-primary` saldrá verde.
6. **Contraste:** blanco sobre `#FF6A00` ≈ 2.87:1; `text-zinc-400` sobre blanco/`#F7F7FA` ≈ 2.4–2.6:1; `text-[11px]` y `text-[10px]` agravan la legibilidad. Los precios naranjas sobre blanco también quedan en ~2.9:1. WCAG AA exige 4.5:1 (3:1 para texto grande) y el naranja no llega ni a 3:1.
7. **Jerarquía tipográfica:** “Mi Carrito” es `text-sm` (14 px), mientras el estado vacío usa `text-xl` (20 px). El título de la pantalla principal es más pequeño que el de un estado secundario.
8. **Botones de cantidad:** `w-7 h-7` (28 px), trash con `p-1` (~24 px), cerrar modal `w-8 h-8` (32 px). La clase `.touch-target` de 44 px existe en `index.css:210-212` pero no se usa en el carrito.
9. **Duplicación de controles:** el método de pago aparece dos veces (página y modal: `Cart.tsx:321-350` y `CartAddressModal.tsx:252-281`) con el mismo estado. Visualmente es redundante y aumenta la altura del checkout.
10. **Imágenes:** el carrito usa `background-image` sin fallback (`Cart.tsx:257-259`), mientras Home/Search usan `safeImage`. Si `image` es `null`, se genera `url(null)` y el thumb queda gris/blanco.
11. **Modal:** `rounded-t-[32px]` en mobile y `sm:rounded-3xl` (24 px) en desktop; el footer no respeta safe-area; el handle de arrastre no es arrastrable. El overlay `bg-black/75` + `backdrop-blur` está bien, pero no hay transición de salida.
12. **Anchos:** 480 px para el shell/header, 440 px para nav/checkout, 500 px para el modal. En 430 px se ve bien; en tablets/desktop los ejes no coinciden.
13. **Spacing:** se mezclan `p-3.5`, `p-4`, `p-5`, `gap-2`, `gap-2.5` y alturas `h-11`/`h-12`; no hay una escala documentada. En general se ve consistente, pero el `h-13` roto rompe la serie.
14. **Iconografía:** Lucide es consistente (14/16/20/24 px), aunque conviven `stroke-[2.2]`, `stroke-[2.5]` y `stroke-[1.5]`; no es un bug, es falta de token.
15. **Truncado/overflow:** los nombres de ítem usan `truncate` (`Cart.tsx:262`), pero los nombres de comercio del grupo no (`Cart.tsx:249`); en 320 px pueden ocupar dos líneas. No se detectó scroll horizontal en el carrito; el modal sí puede desbordar con una cuenta bancaria sin espacios (`whitespace-pre-wrap` sin `break-words`).

---

## 6. Fluidez y performance

### 6.1 Waterfall actual

- `/cart` se importa **eager** en `App.tsx:12` (bueno para TTI de la ruta), pero arrastra `CartAddressModal` en el mismo chunk (import estático en `Cart.tsx:47`), aunque el modal solo se necesita al pulsar checkout.
- Al montar `/cart` se disparan en paralelo `settings.getPublic` y `commerce.list` (`Cart.tsx:67-68`). El carrito se hidrata de `localStorage` de forma síncrona, así que el primer paint es inmediato; el fee y la validez del comercio llegan después.
- Al confirmar: `order.create` hace N+1 `SELECT` de productos y luego una transacción con N inserts de ítems. Para un carrito de 10 ítems son ~20 round-trips.
- El comprobante de transferencia se envía como base64 dentro del JSON; una foto de 5 MB se convierte en ~6.7 MB de body, con `bodyLimit` de 50 MB (`server/boot.ts:34`).
- `/order/:id` hace polling cada 4 s (`useDeliveryData.ts:229-235`) y `getById` ejecuta 5–6 queries; el SSE duplica la actualización.
- El SW no cachea navegación/HTML (`sw.js:22-30`); offline solo funciona si la app ya está cargada.

### 6.2 Quick wins (alto ROI, bajo esfuerzo)

| Acción | Impacto | Esfuerzo | Evidencia |
|---|---|---|---|
| Validar fee/comisión/estado/mínimo/stock en `order.create` y eliminar esos campos del input | Elimina la manipulación y la mayoría de los P0/P1 de dinero | M | `order-router.ts:25-27,64-72` |
| Añadir `idempotencyKey` + índice único | Evita duplicados por timeout/doble pestaña | S–M | `order-router.ts:66-111` |
| `order.quote` + `expectedTotal` + `409 price_changed` | Evita cobrar un total distinto al mostrado | M | `Cart.tsx:70-73`, `order-router.ts:51-64` |
| `try/catch` + schema en la hidratación del carrito | Evita pantalla blanca por localStorage corrupto | S | `useCart.tsx:28-31` |
| `h-12`/`min-h-12` + `pb-safe` + layout del checkout sobre la nav | Arregla el CTA y el safe-area | S | `CartAddressModal.tsx:407`, `Cart.tsx:373` |
| Banner/toast de error y retry | Deja de fallar en silencio | S | `Cart.tsx:154-156` |
| `safeImage` + `<img loading="lazy">` con thumbnails | Menos bytes y fallback visual | S | `Cart.tsx:257-259` |
| Revalidar `commerce.list` al abrir modal y bloquear mientras carga | Evita ordenar en comercio cerrado por caché | S | `Cart.tsx:68,77-80` |
| Radix Dialog o focus trap + Escape | Accesibilidad del checkout | M | `CartAddressModal.tsx:123-128` |
| Unificar un solo `QueryClient`/sesión | Menos deuda y estados raros | M | `main.tsx:14-17`, `App.tsx:147` |
| Lazy-load de `CartAddressModal` | Menos JS inicial en `/cart` | S | `Cart.tsx:47` |
| `inArray` para productos + límite de ítems | Menos latencia y DoS | M | `order-router.ts:46-62` |

### 6.3 Profundo

- **Motor de precios server-side** con quote firmado (productos, fee por zona/comercio, comisión por comercio, mínimos, descuentos e impuestos) y versionado de precios.
- **Inventario transaccional** con reservas TTL y liberación por cancelación.
- **Zona/geofence** con coordenadas persistidas y fee por distancia; mapa de confirmación de pin.
- **Carrito server-side** (o local + reconciliación) con sync multi-dispositivo/pestaña y TTL.
- **Idempotencia y outbox** para que SSE/notificaciones no se pierdan si falla el proceso después del commit.
- **Observabilidad**: errores estructurados, Sentry, métricas de `order.create` (latencia, 409, duplicados) y tests de contrato.
- **Formato monetario** en centavos enteros o `decimal.js`; nada de floats para dinero.
- **Imágenes**: pipeline de thumbnails (CDN/transform), `srcset`, AVIF/WebP y lazy loading.
- **Accesibilidad**: auditoría WCAG 2.2 AA, focus trap, contraste, zoom, reduced motion y pruebas con TalkBack/VoiceOver.

---

## 7. Duplicados y deuda técnica

1. **No hay carrito server-side:** la única fuente es `localStorage`; el servidor no conoce el carrito hasta `order.create`. No existe reconciliación entre el snapshot local y `products/orders`; es la raíz de C-09/C-26/C-27.
2. **Cálculo de totales repetido:** `useCart.tsx:86-87` (subtotal), `Cart.tsx:70-73` (fee/comisión/total), `CartAddressModal.tsx:370-384` (render del mismo total), `OrderTrackingDetails.tsx:60-90` (otra vez, con comisión) y `order-router.ts:35-64` (servidor). No hay una función compartida ni un contrato de “quote”.
3. **Fee/comisión por defecto en cinco sitios:** `"2.50"` en `Cart.tsx:70`, `order-router.ts:25`, `db/seed.ts:228`, `src/pages/admin/Settings.tsx:28,44` y `OrderTrackingDetails`; `8.00` en `Cart.tsx:71` y `seed.ts:229`. Un cambio de negocio exige tocar varios archivos.
4. **Dos fuentes de comisión:** `orders.commission` (enviada por el cliente) vs. cálculo por `commerces.commissionRate` en `admin/dashboard-router.ts:173-179`; el reporte de `admin/settings-router.ts:285-303` usa la primera y atribuye multi-comercio al primer comercio. 
5. **Dos selectores de pago:** `Cart.tsx:321-350` y `CartAddressModal.tsx:252-281`; mismo estado, dos renderizados.
6. **Dos resolvedores de dirección:** `Cart.tsx:82-86` (`getDeliveryAddress`) y `CartAddressModal.tsx:101-106` (`resolvedAddress`). Hoy coinciden; cualquier cambio en uno rompe el `canConfirm`.
7. **Dos QueryClients:** `TRPCProvider` crea uno (`trpc.tsx:24-69`) y `QueryProvider` crea otro (`QueryProvider.tsx:5-18`, montado en `App.tsx:147`). Los hooks de `useDeliveryData` usan el segundo; los `trpc.useUtils()` usan el primero. `useOrderEvents` invalida ambos a mano (`useOrderEvents.ts:120-123`), lo que evidencia el parche.
8. **Cuatro claves de sesión y dos refresh:** `qs_session` (`useSessionSync.ts:3`), `customer_session` (`useCustomerSession.tsx:37`) y `merchant_user`/`driver_user`; refresh cada 10 min (`useCustomerSession.tsx:113-120`) y cada 9 min (`App.tsx:67-77`). `handleAuthError` borra `qs_session` pero no `customer_session` (`useDeliveryData.ts:19-21`), dejando PII obsoleta.
9. **Tres tratamientos de la comisión:** no se muestra en `/cart`, se muestra como “Tarifa de servicio” en `/order/:id` (`OrderTrackingDetails.tsx:76-83`) y se usa internamente en admin. No hay una definición única de si la comisión la paga el cliente o el comercio.
10. **`safeImage` inconsistente:** Home/Search/CommerceDetail lo usan; Cart no (`Cart.tsx:257-259`).
11. **Clases inválidas repetidas:** `h-13` también aparece en `PhoneInput.tsx:124,174`, `Login.tsx:193,217,232` y `CommerceLayout.tsx:162`; `shadow-2xs` en el modal. No hay lint de clases Tailwind.
12. **Sin tests:** `package.json:14` define `vitest`, pero no hay archivos `*.test.*`/`*.spec.*` en el repo. `order.create`, los totales y la hidratación del carrito no tienen cobertura.
13. **`addresses` no existe:** el requerimiento de “direcciones” se resolvió con un solo `customers.address`; no hay entidad, ownership ni CRUD.
14. **Estados stringly-typed:** el enum de `orders.status` está en `db/schema.ts:18-30`, pero `orderStatusHistory.status` es `varchar` (`db/schema.ts:204`) y los estados se repiten como strings en varios routers/UI.

---

## 8. Plan de verificación reproducible

> **Precondición:** usuario cliente autenticado con cookie `quickgo_token`/`refresh_token`, al menos un comercio activo con productos y un producto `kg`. Para las pruebas de API, usar DevTools → Network → “Copy as fetch” sobre una request real de `order.create` y modificar el body; el servidor no tiene CSRF token, pero sí exige la cookie de cliente.

### 8.1 Fase 0 — Verificación estática

1. Confirmar que `h-13`, `shadow-2xs` y `border-3` no se generan:
   ```powershell
   npx tailwindcss -i src/index.css -o $env:TEMP\audit.css `
     --content "src/pages/customer/Cart.tsx,src/pages/customer/components/CartAddressModal.tsx"
   Select-String -Path $env:TEMP\audit.css -Pattern "\.h-13|shadow-2xs|\.border-3"
   ```
   Resultado esperado actual: **sin coincidencias** (bug confirmado).
2. Verificar que `settings.getPublic` no devuelve `commission_rate` (`server/settings-router.ts:5-12`).
3. Verificar que no existe tabla `addresses` ni columna `stock` (`db/schema.ts`).

### 8.2 Fase 1 — Matriz UI (320 / 375 / 390 / 430 px + iPhone con notch)

| ID | Caso | Pasos | Resultado esperado | Resultado actual probable |
|---|---|---|---|---|
| V-01 | Persistencia | Agregar 2 ítems, recargar `/cart` | Carrito intacto | Pasa (localStorage) |
| V-02 | JSON corrupto | `localStorage.setItem("cart","{")`, recargar | Carrito vacío + aviso | **Crash / pantalla blanca** (C-13) |
| V-03 | Dos pestañas | Abrir `/cart` en 2 pestañas, borrar un ítem en A | B se actualiza | **No se sincroniza** (C-27) |
| V-04 | Cambio de cliente | Cliente A agrega, logout, login cliente B | Carrito vacío | **Carrito de A visible** (C-14) |
| V-05 | Kg desde Home | Agregar producto `unitType=kg` desde card de Home | Se pide peso o se muestra kg | **Se agrega como 1 unidad** (C-31) |
| V-06 | Kg 0.3 | Agregar 0.1 + 0.2 kg | “0.30 kg” en todos lados | **“0.30000000000000004 kg” en el nombre** (C-30) |
| V-07 | Vaciar | Eliminar el último ítem | Estado vacío + nav | Pasa |
| V-08 | Comercio cerrado | Cerrar comercio desde admin, abrir `/cart` antes de 5 min | Bloqueo inmediato | **Permite u obtiene caché vieja** (C-05/C-20) |
| V-09 | Producto inactivo | Marcar `isAvailable=no` con el ítem en carrito | Bloqueo + opción de quitar | **Permite confirmar** (C-05) |
| V-10 | Precio cambiado | Cambiar precio en admin tras agregar | Aviso y nuevo total | **Cobra el nuevo sin avisar** (C-09) |
| V-11 | Mínimo | Carrito de $1 con mínimo $5 | CTA bloqueado + “faltan $4” | **Permite** (C-07) |
| V-12 | Multi-comercio | Agregar de 2 comercios | Agrupación correcta y fee claro | Pasa visualmente; fee único (C-21) |
| V-13 | Modal teclado | Abrir modal, tabular y Escape | Foco atrapado; Escape cierra | **Foco escapa; Escape no cierra** (C-17) |
| V-14 | Transferencia sin foto | Elegir transferencia | CTA deshabilitado con motivo | Pasa en UI; **API lo permite** (C-11) |
| V-15 | Archivo enorme | Subir JPG de 15 MB | Compresión/límite | **Se envía base64 completo** (C-25) |
| V-16 | Doble intención | Confirmar, simular timeout, reintentar | Un solo pedido | **Dos pedidos** (C-08) |
| V-17 | Settings lento | Throttle 3G, abrir `/cart` | Sin flash de fee | **$2.50 → fee real** (C-28) |
| V-18 | Sesión expirada | Borrar cookie, confirmar | Redirect + carrito conservado | Redirect; carrito conservado; error solo consola (C-12) |
| V-19 | Éxito + refresh | Confirmar, refrescar | Pedido visible | **Carrito vacío, sin link al pedido** (C-19) |
| V-20 | Notch | iPhone 14/15, `/cart` | CTA completo | **Nav tapa parte del CTA** (C-16) |
| V-21 | Teclado en dirección | Enfocar “otra dirección” | Input y CTA visibles | **Hipótesis:** footer bajo el teclado (C-34) |
| V-22 | Lector de pantalla | VoiceOver/TalkBack en modal | “Diálogo, confirmar pedido…” | **No anuncia; fondo enfocable** (C-17) |
| V-23 | Contraste | Medir CTA/labels | ≥4.5:1 | **2.87:1 / 2.4–2.6:1** (C-36) |
| V-24 | 320 px | Revisar overflow horizontal | Sin scroll horizontal | Pasa en general; CTA del modal roto (C-15) |

### 8.3 Fase 2 — API / contrato (modificar body y observar BD)

| ID | Caso | Body a modificar | Esperado | Actual probable |
|---|---|---|---|---|
| A-01 | Envío gratis | `deliveryFee: "0.00"` | Rechazo o fee del servidor | **Pedido con envío 0** (C-01) |
| A-02 | Envío negativo | `deliveryFee: "-10.00"` | 400 | **Total menor** (C-01) |
| A-03 | Fee no numérico | `deliveryFee: "abc"` | 400 | **500 / NaN** (C-01) |
| A-04 | Comisión 0 | `commission: "0.00"` | Comisión del servidor | **Se guarda 0** (C-02) |
| A-05 | Carrito vacío | `items: []` | 400 | **Pedido solo con envío** (C-11) |
| A-06 | Dirección vacía | `deliveryAddress: ""` | 400 | **Se guarda vacía** (C-11) |
| A-07 | Teléfono vacío | `customerPhone: ""` | 400 | **Se guarda vacío** (C-11) |
| A-08 | Transfer sin recibo | `paymentMethod:"transfer"` sin `paymentReceipt` | 400 | **pending_payment** (C-11) |
| A-09 | Comercio ajeno | `items[0].commerceId` de otro comercio | 400 | **Se atribuye mal** (C-10) |
| A-10 | Producto inactivo | Producto con `isAvailable=no` | 409 | **Se acepta** (C-05) |
| A-11 | Comercio cerrado | `isOpen=closed` | 409 | **Se acepta** (C-05) |
| A-12 | Cantidad ínfima | `quantity: 5e-324` | 400 | **Ítem gratis** (C-11) |
| A-13 | Cantidad gigante | `quantity: 1e9` | 400 | **Se acepta** (C-11) |
| A-14 | Duplicado exacto | Repetir el POST 2 veces | Un pedido | **Dos pedidos** (C-08) |
| A-15 | PII sin auth | GET `order.getById?id=1` sin cookie | 401 | **200 con dirección/teléfono** (C-03) |
| A-16 | Lista de clientes | GET `customer.list` sin cookie | 401 | **200 con PII** (C-03) |
| A-17 | Cambio de estado | POST `order.updateStatus` sin cookie | 401 | **200** (C-04) |

### 8.4 Fase 3 — Verificación en BD

```sql
-- 1) Cabecera y coherencia de totales
SELECT id, customer_id, status, subtotal, delivery_fee, commission, total,
       delivery_address, customer_phone, notes, payment_method
FROM orders
WHERE id = $1;

-- 2) Ítems y snapshot
SELECT product_id, commerce_id, product_name, quantity, unit_price, total
FROM order_items
WHERE order_id = $1
ORDER BY id;

-- 3) ¿El subtotal coincide con la suma de líneas?
SELECT o.id, o.subtotal, SUM(oi.total) AS items_sum,
       (o.subtotal - SUM(oi.total)) AS diff
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
HAVING o.subtotal <> SUM(oi.total);

-- 4) Historial y estados por comercio
SELECT status, notes, created_at FROM order_status_history WHERE order_id = $1 ORDER BY id;
SELECT commerce_id, status FROM order_commerce_status WHERE order_id = $1;

-- 5) Posibles duplicados (mismo cliente, total y minuto)
SELECT customer_id, total, date_trunc('minute', created_at) AS minute, COUNT(*)
FROM orders
GROUP BY 1,2,3
HAVING COUNT(*) > 1;

-- 6) Comisión vs. tasa real del comercio
SELECT oi.commerce_id, SUM(oi.total) AS base,
       c.commission_rate,
       ROUND(SUM(oi.total) * c.commission_rate / 100, 2) AS expected
FROM order_items oi
JOIN commerces c ON c.id = oi.commerce_id
WHERE oi.order_id = $1
GROUP BY oi.commerce_id, c.commission_rate;
```

### 8.5 Criterios de aceptación para cerrar el checkout

- [ ] `order.create` no acepta `deliveryFee`, `commission`, `customerPhone` ni `commerceId` del cliente; todos se derivan en servidor.
- [ ] Un pedido con ítems inactivos, comercio cerrado, cantidad inválida, dirección vacía o transferencia sin recibo devuelve `400/409` con mensaje accionable.
- [ ] `orders.subtotal = SUM(order_items.total)` y `orders.total = subtotal + fee` en todos los casos, incluidos kg y multi-comercio.
- [ ] Doble POST con la misma `idempotencyKey` devuelve el mismo `order.id` y no crea filas nuevas.
- [ ] El CTA mide ≥44 px, es visible por encima de la nav en notch y el modal atrapa el foco/Escape.
- [ ] `localStorage` corrupto, logout, dos pestañas y recarga no pierden ni filtran el carrito.
- [ ] `order.getById`/`getByCustomer` exigen ownership; `customer.list` y `order.updateStatus` ya no son públicos.
- [ ] Error de red/servidor visible con retry; el modal no se cierra antes de conocer el resultado.
- [ ] Tests automáticos de `order.create` (éxito, mínimo, stock, precio cambiado, duplicado, transferencia) y de `useCart` (hidratación, corrupción, sync).

---

## 9. Anexo A — Contratos API relevantes

| Procedimiento | Auth actual | Input | Output | Efectos / notas |
|---|---|---|---|---|
| `settings.getPublic` | Público | — | `Record<string,string>` con `app_name`, `support_phone`, `delivery_fee`, `min_order_amount`, `bank_transfer_info`, `operating_hours` | No incluye `commission_rate`; el carrito lo asume 8 %. |
| `commerce.list` | Público | — | Comercios con `status="active"` | Incluye `isOpen`, `minOrder`, `lat/lng`; el carrito solo usa `isOpen`. |
| `product.getByCommerce` | Público | `{commerceId}` | Productos (incluye `isAvailable="no"`) | El filtro de disponibilidad es client-side en CommerceDetail. |
| `order.create` | `customerQuery` | Ver §2.3 | `{success, order}` | Fee/comisión del cliente; sin stock/estado/mínimo/idempotencia. |
| `order.getById` | **Público** | `{id}` | Orden + items + historial + driver + comercios + `paymentReceipt` | **PII enumerable**; usado por `/order/:id`. |
| `order.getByCustomer` | **Público** | `{customerId}` | Órdenes + items | **PII enumerable**. |
| `order.getAvailableForDriver` | **Público** | — | Pedidos `ready_for_pickup` con teléfono/dirección | **PII enumerable**. |
| `order.updateStatus` | **Público** | `{id, status, driverId?, notes?}` | Orden actualizada | **Escritura no autenticada**; puede generar earnings. |
| `order.updatePaymentReceipt` | `customerQuery` | `{orderId, receipt}` | Orden actualizada | Verifica ownership (`order-router.ts:451-453`); correcto. |
| `customer.checkAuth` | Público | — | `{customer}` o `null` | Base de la hidratación de sesión. |
| `customer.update` | `customerQuery` | `{firstName?, lastName?, phone?, address?}` | Cliente actualizado | Usa `ctx.customer.id`; correcto. |
| `customer.getById` | **Público** | `{id}` | Cliente completo (incluye `fcmToken`) | **PII**. |
| `customer.list` | **Público** | — | Todos los clientes | **PII masiva**. |
| `commerce.markReady` | `merchantQuery` | `{orderId, commerceId}` | `{allReady}` | No verifica que el comercio pertenezca al merchant; mismo problema de ownership que C-04. |

### Contrato recomendado (resumen)

```ts
// order.quote
{ items: [{ productId, quantity }], addressId | { lat, lng, text } }
→ { quoteId, expiresAt, subtotalCents, deliveryFeeCents, commissionCents,
    totalCents, priceVersion, warnings: ["min_order","store_closed","price_changed"] }

// order.create
{ quoteId, idempotencyKey, addressId, paymentMethod, receipt?, notes? }
→ { orderId, status, totalCents }
// El servidor deriva customerId/phone/fee/commission y revalida stock/estado/mínimo/zona.
```

---

## 10. Anexo B — Esquema de cálculo actual

### Cliente (`src/hooks/useCart.tsx:86-87`, `src/pages/customer/Cart.tsx:70-73`)

```ts
subtotal   = Σ ( parseFloat(item.price) * item.quantity )          // float, precio snapshot
deliveryFee = parseFloat(settings.delivery_fee || "2.50")           // settings no cargados → 2.50
commissionRate = parseFloat(settings.commission_rate || "8.00")     // getPublic no la devuelve → 8.00
commission = ((subtotal * commissionRate) / 100).toFixed(2)         // string
total      = (subtotal + deliveryFee).toFixed(2)                    // string
```

### Servidor (`server/order-router.ts:35-64,70-73`)

```ts
subtotal = 0
for (item of input.items) {
  product   = SELECT * FROM products WHERE id = item.productId   // N+1, sin estado
  unitPrice = parseFloat(product.price)                          // precio actual
  subtotal += unitPrice * item.quantity                          // float
}
total = subtotal + parseFloat(input.deliveryFee)                 // fee del cliente
INSERT orders {
  subtotal: subtotal.toFixed(2),
  deliveryFee: input.deliveryFee,                                // string del cliente
  commission: input.commission,                                  // string del cliente
  total: total.toFixed(2)
}
```

### Esquema de datos involucrado

| Tabla | Campos relevantes | Observación |
|---|---|---|
| `customers` | `firstName`, `lastName`, `phone`, `address` | Una sola dirección; `phone` único. |
| `commerces` | `minOrder numeric(10,2)`, `isOpen enum`, `status enum`, `commissionRate numeric(5,2)`, `lat/lng numeric` | `minOrder`, `commissionRate` y `lat/lng` no se usan en el checkout. |
| `products` | `price numeric(10,2)`, `unitType varchar`, `isAvailable enum` | **No hay `stock`**; `unitType` del seed incluye `"caja"`. |
| `orders` | `subtotal`, `deliveryFee`, `commission`, `total` (numeric 10,2), `deliveryAddress text`, `customerPhone varchar(20)`, `notes text`, `paymentReceipt text` | Sin `deliveryLat/Lng`, sin `idempotencyKey`, sin `discount`, sin `tax`, sin `quoteId`. |
| `order_items` | `productId`, `commerceId`, `productName`, `quantity numeric(10,3)`, `unitPrice numeric(10,2)`, `total numeric(10,2)` | Snapshot correcto de nombre/precio; `commerceId` no se contrasta con el producto. |
| `order_commerce_status` | `orderId`, `commerceId`, `status enum` | Sin unique `(orderId, commerceId)`. |
| `order_status_history` | `status varchar(50)`, `notes` | Estado stringly-typed, no enum. |
| `app_settings` | `delivery_fee`, `min_order_amount`, `commission_rate` | `commission_rate` **no** está en la whitelist pública. |
| `addresses` | — | **No existe.** |

---

## 11. Hipótesis y límites de la auditoría

- **No reproducido en dispositivo físico:** el solapamiento CTA/nav en notch se deduce de CSS (`bottom-[74px]`, `bottom-safe-nav`, `z-50` vs `z-40`) y de la altura de la nav (`min-h-[46px]` + `py-1.5`). Requiere confirmación en iPhone 14/15 y Android con gesto.
- **No reproducido el doble submit de UI:** React 18/19 suele vaciar el estado discreto antes del segundo clic y el modal se desmonta; el riesgo principal es el reintento tras timeout o dos pestañas. La ausencia de idempotencia es real y verificable por API.
- **Teclado iOS:** `92dvh` + footer sticky puede quedar tapado por el teclado; no se probó en Safari iOS. Se marca como hipótesis en V-21.
- **Contraste:** valores calculados con la fórmula WCAG sobre sRGB; no se usó un medidor de pantalla.
- **CSRF:** la cookie de refresh usa `SameSite=None` (`server/lib/cookies.ts:14`), pero tRPC espera JSON y no hay CORS permisivo; el riesgo práctico parece bajo. No se probó un ataque cross-site. Se deja fuera de la tabla para no inflar severidad sin evidencia.
- **`PageTransition`:** el `motion.div` con `y:4` puede crear un containing block temporal para `position: fixed` durante 120 ms. No se verificó en navegador; probablemente framer-motion deja `transform: none` al terminar. Se menciona solo como riesgo de pulido.
- **Volumen:** no se ejecutaron cargas con miles de ítems; el N+1 y el body de 50 MB son riesgos estáticos, no medidos.

---

**Fin del informe.** Cualquier corrección de los hallazgos C-01 a C-18 debe priorizarse antes de un lanzamiento con dinero real; C-03/C-04 son independientes del checkout y deben tratarse como incidente de seguridad.
