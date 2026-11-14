# Auditoría `/admin/settings` — Administración

**Fecha:** 2026-11-13  
**Ruta auditada:** `/admin/settings` (configuración global, datos bancarios y reportes exportables).  
**Método:** revisión estática de código y documentación. No se modificó código, no se
ejecutaron migraciones, tests ni servidores, y no se consultó la base de datos en
caliente. `localhost:3000` quedó intacto.

## 1. Alcance y archivos

| Capa | Archivo | Qué se revisó |
|---|---|---|
| UI | `src/pages/admin/Settings.tsx` | Formulario, guardado, fechas, PDF/Excel, logout |
| Layout | `src/components/AdminLayout.tsx` | Navegación, marca, logout, responsive |
| Hooks | `src/hooks/useDeliveryData.ts` | `useUpdateSetting`, `useGetAdminReports`, `usePublicSettings`, `useOrderQuote` |
| Router admin | `server/admin/settings-router.ts` | `settings`, `updateSetting`, `updateSettingsBulk`, `getReports` |
| Barrel admin | `server/admin-router.ts` | Montaje y `refresh` |
| Settings públicos | `server/settings-router.ts` | Allowlist de `getPublic` |
| Precios | `server/order-router.ts` | `readPricing`, quote, create, snapshot, `deliveredAt` |
| Stats negocio | `server/commerce-router.ts` | Comisión snapshot, `deliveredAt` |
| Dashboard admin | `server/admin/dashboard-router.ts` | Contraste de ingresos/comisiones |
| Driver | `server/driver-router.ts` | Fuente real de ganancias |
| Esquema | `db/schema.ts` | `app_settings`, `orders`, `order_commerce_status`, `driver_earnings` |
| Auth | `server/middleware.ts`, `server/context.ts`, `server/admin-auth.ts`, `server/login-router.ts` | `adminQuery`, cookies, logout |
| Contrato | `contracts/orderStatus.ts` | Labels de estados |
| Docs | `docs/customer/README.md`, `docs/commerce/README.md`, `docs/driver/README.md`, `docs/commerce/VERIFICATION.md`, `docs/driver/VERIFICATION.md`, `docs/commerce/audit/MASTER_TRIAGE.md` | Contratos e integración |

**Fuera de alcance:** otras rutas admin, salvo lo necesario para comparar reportes;
cambios de esquema, migraciones, correcciones o ejecución de la aplicación. No se
auditó CSV porque **no existe**: la UI implementa PDF y XLSX (`Settings.tsx:81-128`).

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/admin/settings
  └─ App.tsx:137  SessionGuard role="admin"
      └─ AdminLayout
          ├─ trpc.admin.settings.useQuery()  → GET /api/trpc/admin.settings
          │     └─ adminQuery → SELECT * FROM app_settings
          ├─ handleSave → 5 × admin.updateSetting  → POST /api/trpc
          │     └─ adminQuery → SELECT / UPDATE / INSERT app_settings
          │     └─ emit("admin:dashboard", settings_update)
          └─ handleExport → admin.getReports → POST /api/trpc
                └─ adminQuery → orders / orderItems / commerces / drivers / driver_earnings
                └─ jsPDF + autoTable  o  XLSX.writeFile
```

| Paso | Evidencia | Detalle |
|---|---|---|
| 1. Ruta protegida | `src/App.tsx:137`; `src/components/SessionGuard.tsx:102-128` | `SessionGuard` valida `login.checkAuth` contra la cookie HttpOnly y exige rol `admin`. |
| 2. Lectura | `Settings.tsx:35,40-51`; `server/admin/settings-router.ts:29-31` | `admin.settings` devuelve todas las filas de `app_settings`; la UI mapea 5 claves y usa defaults si faltan. |
| 3. Guardado | `Settings.tsx:53-71`; `server/admin/settings-router.ts:35-49` | Cinco mutaciones `updateSetting` en paralelo, cada una con `SELECT` + `UPDATE`/`INSERT`; no se usa `updateSettingsBulk`. |
| 4. Invalidación | `Settings.tsx:63`; `useDeliveryData.ts:507-512` | Se invalida `admin.settings`; también hay una invalidación custom que no coincide con la clave del hook tRPC. |
| 5. Reportes | `Settings.tsx:73-78`; `server/admin/settings-router.ts:83-311` | El tipo es un enum cerrado; las fechas llegan como strings; las consultas se ejecutan por tipo. |
| 6. Exportación | `Settings.tsx:81-128` | PDF con `jsPDF`/`autoTable`; Excel con `XLSX.utils.json_to_sheet`; todo en el hilo principal del navegador. |
| 7. Consumo de settings | `server/order-router.ts:81-92`; `server/settings-router.ts:5-24`; `Cart.tsx:65,72-76,475` | `delivery_fee` y `min_order_amount` alimentan quote/create; `bank_transfer_info` alimenta el modal de transferencia. |

## 3. Hallazgos

**Resumen:** 23 hallazgos: **0 P0, 10 P1 y 13 P2**. No se encontró un P0
reproducible en lectura estática; ADM-SET-01 es P1 con potencial de convertirse
en P0 operativo si se guarda un valor inválido.

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| ADM-SET-01 | P1 | Dinero / validación | `server/admin/settings-router.ts:35-49`; `src/pages/admin/Settings.tsx:221-237`; `server/order-router.ts:81-91` | `updateSetting` acepta cualquier `string` para `delivery_fee` y `min_order_amount`; la UI usa `type="text"`. `readPricing` hace `Number()` sin validar finito, rango, signo ni decimales. | Un typo `2,50` produce `NaN` y puede romper quote/create; un valor vacío se interpreta como 0 (envío gratis y mínimo 0); un negativo reduce el total y la ganancia del driver; un valor enorme desborda `numeric(10,2)`. | Validar con Zod decimal positivo, finito, máximo y 2 decimales; rechazar vacío/coma; validar también al leer y fallar cerrado; tests con `-1`, `0`, `NaN`, `1e9`, `2,50`. |
| ADM-SET-02 | P1 | Dinero / atomicidad / UX | `src/pages/admin/Settings.tsx:53-71`; `server/admin/settings-router.ts:55-80` | El guardado dispara 5 `updateSetting` en `Promise.all`, no una transacción; `updateSettingsBulk` existe pero no se usa. El `catch` solo hace `console.error`. | Un fallo parcial deja el fee nuevo con mínimo/banco viejo; el admin no ve error y puede reintentar; se emiten 5 eventos `settings_update`. | Usar `updateSettingsBulk` en una transacción, un solo evento, error visible y botón deshabilitado durante el guardado. |
| ADM-SET-03 | P1 | Carga / datos destructivos | `src/pages/admin/Settings.tsx:28-34,40-51,165-170`; `server/order-router.ts:89-90`; `db/seed.ts:231` | Solo se maneja `isLoading`. Si la query falla o vuelve vacía, el formulario se pinta con defaults: banco `""` y mínimo `3.00`, mientras el servidor usa `5.00`. | Guardar tras un error puede borrar `bank_transfer_info` y fijar un mínimo distinto al real; el cliente pierde los datos de transferencia. | Exponer `isError`/`refetch`, bloquear Guardar hasta tener datos, no usar defaults destructivos y alinear el fallback con el servidor. |
| ADM-SET-04 | P1 | Seguridad / auditoría | `db/schema.ts:339-344`; `server/admin/settings-router.ts:35-52` | `app_settings` solo guarda `updatedAt`; no hay `updatedBy` ni historial. Los cambios de banco, fee o mínimo no se pueden atribuir. Tampoco hay control de versión: dos admins se pisan. | Un cambio fraudulento de la cuenta bancaria no deja rastro; no se puede reconstruir quién cambió qué ni cuándo. | Registrar actor y valores anterior/nuevo en una tabla de auditoría (requiere migración) o, como mínimo, `updatedBy`; añadir control optimista por `updatedAt`. |
| ADM-SET-05 | P1 | Reportes / rendimiento / PII | `server/admin/settings-router.ts:132-151`; `db/schema.ts:191`; `server/order-router.ts:67-77` | El reporte `orders` hace `select()` de toda la fila, incluido `paymentReceipt` base64 (hasta ~7.5 MB por pedido), y no tiene límite ni paginación. La respuesta proyecta 7 campos, pero el servidor materializa todos los comprobantes. | Con historial grande, la exportación consume memoria/tiempo y puede afectar al servidor; el archivo incluye teléfono y dirección del cliente. | Proyección explícita sin `paymentReceipt`/`idempotencyKey`; límite de rango o filas; exportación por lotes; registrar quién exporta PII. |
| ADM-SET-06 | P1 | Reportes / fechas | `server/admin/settings-router.ts:93-102,108,115,150,306`; `server/order-router.ts:927`; `server/commerce-router.ts:287-292,350-360` | Los reportes filtran por `orders.createdAt`, no por `delivered_at`; `startDate` se parsea como UTC y `endDate` como hora local; el agrupado usa `createdAt::date` con la zona de la DB. | Pedidos de después de las 19:00 en Guayaquil pueden caer en otro día si la DB corre en UTC; un pedido creado antes del rango y entregado dentro no aparece, aunque Stats del comercio sí lo cuenta; conciliación imposible. | Parsear fechas como calendario `America/Guayaquil`, usar `deliveredAt` para entregas/comisiones/earnings, agrupar con `AT TIME ZONE` y rango `[inicio, día siguiente)`. |
| ADM-SET-07 | P1 | Reportes / comisiones | `server/admin/settings-router.ts:273-308`; `db/schema.ts:258`; `server/order-router.ts:513-523`; `server/commerce-router.ts:276,312-322` | `commissions` usa `orders.commission` (total del pedido) y asigna el comercio del primer `orderItem`; `orderItems` se lee sin `ORDER BY`. Ignora `order_commerce_status.commission_amount`. | En multi-comercio la comisión completa se atribuye a un comercio arbitrario; el reporte no coincide con la liquidación por comercio de Stats. | Reportar una fila por comercio desde `commission_amount` (fallback para legacy), filtrar items por pedido/rango y ordenar de forma determinista. |
| ADM-SET-08 | P1 | Reportes / ingresos | `server/admin/settings-router.ts:114,167,177,282`; `server/admin/dashboard-router.ts:44-47`; `server/commerce-router.ts:287-292` | `sales`, `commerces` y `commissions` solo excluyen `cancelled` y `payment_rejected`; incluyen `pending_payment` y pedidos en curso. El dashboard excluye `pending_payment` y Stats solo cuenta `delivered`. | Ingresos y comisiones sobreestimados; una transferencia no aprobada se reporta como venta y comisión. | Definir política por reporte: comisiones/earnings solo `delivered`; ventas excluir `pending_payment` y documentar si incluye en curso; una constante de estados compartida. |
| ADM-SET-09 | P1 | Reportes / ganancias | `server/admin/settings-router.ts:243-253`; `src/pages/admin/Settings.tsx:281-283` | El reporte `earnings` no aplica `startDate`/`endDate`: carga toda la tabla `driver_earnings` ordenada por `date`. La UI promete filtrar por fechas. | El PDF/Excel de “Ganancias” ignora el rango elegido; exporta todo el histórico y puede ser enorme. | Filtrar por `driverEarnings.date`/`createdAt` en TZ Guayaquil, con rango validado y límite; alinear el copy. |
| ADM-SET-10 | P1 | Reportes / liquidación | `server/admin/settings-router.ts:217-225,231-238`; `db/schema.ts:102`; `server/driver-router.ts:56-66` | El reporte `drivers` muestra `drivers.total_earnings`, columna que no se actualiza en el repo; `getProfile` calcula la suma real desde `driver_earnings`. `Entregas` sí se filtra por fecha, pero `Ganancias` es histórica. | El export puede mostrar `0.00` aunque el driver tenga ganancias; admin y driver ven cifras distintas. | Calcular `SUM(driver_earnings.amount)` por driver en la misma consulta; no usar la columna stale; etiquetar período vs histórico. |
| ADM-SET-11 | P2 | Reportes / datos | `server/admin/settings-router.ts:231-237`; `db/schema.ts:101` | `Calif.` usa el fallback `"4.5"` cuando `r.rating` es `null`/0; el default del schema tampoco distingue “sin calificar”. | Evaluaciones ficticias en un reporte oficial; decisiones de incentivo/despido mal fundadas. | Mostrar “Sin calificar” o vacío cuando no hay rating; no usar un default numérico en el export. |
| ADM-SET-12 | P2 | Reportes / Excel | `server/admin/settings-router.ts:125-126,146,194,236,265,304-305`; `src/pages/admin/Settings.tsx:123-127` | Los montos se envían como strings con `toFixed(2)`; `json_to_sheet` los escribe como texto. Los reportes vacíos no llevan headers ni metadata; no hay formato de moneda. | Excel no puede sumar/ordenar montos ni hacer tablas dinámicas; un reporte vacío parece un archivo roto. | Devolver números (o convertir en el cliente), escribir headers aunque no haya filas, añadir hoja de metadatos y formato USD. |
| ADM-SET-13 | P2 | UX / exportación | `src/pages/admin/Settings.tsx:73-132,318-331` | Los botones PDF/Excel no tienen estado pending ni se deshabilitan; el `catch` solo hace `console.error`. Con 0 filas el PDF usa “Sin datos” como header y el Excel queda vacío. PDF/XLSX se generan en el hilo principal. | Doble clic dispara dos exportaciones; no hay rate limit ni control de concurrencia; un fallo no se comunica; un rango grande congela la pestaña. | Estado por reporte, deshabilitar durante la petición, toast de error/vacío, límite de filas y generar fuera del render. |
| ADM-SET-14 | P2 | Reportes / validación | `server/admin/settings-router.ts:83-94` | `startDate`/`endDate` son `z.string().optional()` sin formato; `new Date(...)` puede ser `Invalid Date`. No se valida `start <= end` ni un rango máximo. | Una llamada directa con fecha inválida puede producir 500; un rango invertido devuelve vacío sin explicación; un rango abierto puede cargar toda la tabla. | Validar formato `YYYY-MM-DD`, `start <= end` y máximo de días; devolver `BAD_REQUEST` con mensaje. |
| ADM-SET-15 | P2 | Copy / localización | `src/pages/admin/Settings.tsx:248,258,79,84,115`; `contracts/orderStatus.ts:48`; `server/admin/settings-router.ts:142,188,300` | El formulario habla de CBU/CVU/alias y usa “Banco Galicia” (Argentina), pero la app es Ecuador/USD (seed Banco Pichincha, RUC). El PDF usa “RAPIDY” fijo, el `type` en inglés y “Pagina” sin tilde; estados y pagos se exportan como enums crudos. | Instrucciones bancarias incorrectas para el país; exports con jerga técnica y fechas de archivo en UTC. | Copy Ecuador (cuenta/CCI, banco, titular, RUC); labels desde `ORDER_STATUS_META`; nombre desde `app_name`; fecha de archivo con `guayaquilDateKey`; revisar acentos. |
| ADM-SET-16 | P2 | Configuración / integración | `src/pages/admin/Settings.tsx:45-48,57-58`; `src/components/AdminLayout.tsx:42`; `index.html:9`; `src/pages/legal/LegalHub.tsx:274` | `app_name` y `support_phone` se guardan, pero no los consume ninguna pantalla: el layout, el `title` y el PDF usan “RAPIDY” fijo; soporte usa un email fijo. El grep de `app_name`/`support_phone` solo devuelve seed, allowlist y formulario. | El admin cree cambiar la marca y el teléfono, pero no hay efecto; el soporte no recibe el número configurado. | Consumir `settings.getPublic` en layout/PWA/PDF/legal o retirar los campos; validar teléfono si se usa. |
| ADM-SET-17 | P2 | Integración / checkout | `src/pages/customer/components/CartAddressModal.tsx:296-298,336-344`; `src/pages/customer/Cart.tsx:475` | Si `bank_transfer_info` está vacío, el modal avisa pero no deshabilita la transferencia; además el aviso dice “Contacta al comercio”, aunque el dato es global. El cliente puede enviar comprobante sin cuenta configurada. | Pago a una cuenta inexistente o no verificada; el admin puede vaciar el banco sin bloquear el checkout. | Deshabilitar transferencia cuando no hay datos y rechazar en servidor la creación `transfer` sin bank info; mostrar error de configuración. |
| ADM-SET-18 | P2 | Seguridad / mass assignment | `server/admin/settings-router.ts:35-49,55-80`; `db/schema.ts:341-343` | `key` y `value` son `z.string()` sin allowlist, longitud ni formato; `updateSettingsBulk` acepta un array sin límite. Un admin puede crear claves arbitrarias (p. ej. `commission_rate`) o una key >100 que rompe el INSERT. | Deriva de configuración, claves huérfanas y riesgo futuro si se agregan secretos o lectores; no hay defensa si se compromete la sesión admin. | Allowlist de las 5 claves editables, max lengths, regex de key y límite de items; rechazar desconocidas y usar el bulk. |
| ADM-SET-19 | P2 | Settings públicos / performance | `server/settings-router.ts:5-24`; `server/admin/settings-router.ts:29-31` | `getPublic` hace `SELECT *` de `app_settings` y filtra en JS; `admin.settings` devuelve todas las claves. Hoy la allowlist funciona (`commission_rate` no se expone) y no hay fuga, pero no hay filtro SQL ni caché. | Cada carga de carrito lee toda la tabla; si se agrega una clave sensible, se lee en cada request público y queda a un error de allowlist de distancia. | Filtrar con `inArray(keys)` en SQL y cachear 30-60 s; mantener la allowlist como única fuente y una prueba que verifique que `commission_rate` no sale. |
| ADM-SET-20 | P2 | Accesibilidad / visual | `src/pages/admin/Settings.tsx:189-205,221-237,318-331,159,172-177`; `tailwind.config.js:5-14` | Los `label` no tienen `htmlFor`/`id`; los montos son `type="text"` sin `inputMode` decimal; los botones de reporte usan `min-h-[40px]`; `xs:` no existe en el theme; el banner de éxito no tiene `role="status"` ni `aria-live`. | Formularios difíciles para teclado/lector, teclado numérico móvil ausente, targets <44 px y breakpoint muerto. | Asociar labels, `inputMode="decimal"`, `min-h-[44px]`, eliminar `xs` o definirlo, `aria-live`/`role="status"` y foco visible. |
| ADM-SET-21 | P2 | Estado / caché | `src/hooks/useDeliveryData.ts:501,507-512`; `src/pages/admin/Settings.tsx:35,63` | `useUpdateSetting` invalida `["admin.settings"]`, pero la página usa `trpc.admin.settings.useQuery`, cuya clave es la del hook tRPC. Hoy se compensa con `trpcContext.admin.settings.invalidate()` explícito; si se reutiliza la mutación sin ese paso, la UI queda stale. | Mantenimiento frágil; dos estrategias de caché para el mismo dato. | Unificar en `trpc.useUtils().admin.settings.invalidate()` o usar la misma clave custom; eliminar la invalidación duplicada. |
| ADM-SET-22 | P2 | Integración / checkout | `src/hooks/useDeliveryData.ts:344-349`; `src/pages/customer/Cart.tsx:72-76,181-188`; `server/order-router.ts:437-469` | El quote tiene `staleTime` 15 s y no se revalida al confirmar; si el admin cambia `delivery_fee`/`min_order` mientras el carrito está abierto, la UI muestra el total viejo y `order.create` cobra el nuevo. | El cliente puede ver un total y pagar otro, o recibir un mínimo incumplido al confirmar; se reintroduce el riesgo C-21. | Refetch de quote/settings antes de crear, mostrar el total del servidor y avisar si cambió; emitir `settings_update` a clientes o incluir versión de precios. |
| ADM-SET-23 | P2 | Seguridad / CSRF | `server/lib/cookies.ts:8-16`; `server/boot.ts:328-341` | Fuera de localhost las cookies usan `SameSite=None` y no se encontró validación de `Origin` ni token CSRF. Las mutaciones tRPC usan JSON (preflight), por lo que no se pudo demostrar explotación; queda como defensa en profundidad. | Si se habilita un cliente simple o se relaja CORS, un sitio externo podría intentar mutaciones con la cookie admin. | Validar `Origin`/`Referer` en `/api/trpc` o token CSRF; preferir `SameSite=Lax` si el producto lo permite; documentar la decisión. |

## 4. Integración con Cliente, Negocio y Driver

| Superficie | Contrato esperado | Estado | Evidencia | Riesgo |
|---|---|---|---|---|
| Cliente — quote/checkout | `delivery_fee` y `min_order_amount` deben venir del servidor y reflejarse en quote y create. | **Funciona** en servidor: `buildQuote` lee `app_settings`, aplica mínimo global y por comercio, y `order.create` recalcula. | `server/order-router.ts:81-92,179-204,437-469`; `src/pages/customer/Cart.tsx:67-76` | ADM-SET-01 (valores inválidos) y ADM-SET-22 (quote stale) pueden romper el total mostrado/cobrado. |
| Cliente — transferencia | `bank_transfer_info` debe mostrarse y usarse en el pago por transferencia. | **Funciona** el consumo: `settings.getPublic` incluye la clave y el modal la muestra; se eliminó el fallback hardcodeado. | `server/settings-router.ts:5-12`; `src/pages/customer/Cart.tsx:475`; `CartAddressModal.tsx:336-344` | ADM-SET-17: con banco vacío la transferencia sigue habilitada. |
| Cliente — marca/soporte | `app_name` y `support_phone` deben reflejarse en la app. | **No funciona:** no hay consumidores; layout, `title` y PDF usan “RAPIDY”; soporte usa email fijo. | `Settings.tsx:57-58`; `AdminLayout.tsx:42`; `index.html:9`; `LegalHub.tsx:274` | ADM-SET-16: configuración placebo; el admin no puede cambiar la marca ni el canal de soporte. |
| Negocio — Stats | La comisión histórica debe salir de `order_commerce_status.commission_amount`; ventas entregadas por `deliveredAt`. | **Funciona** en Stats: usa snapshot y `deliveredAt`, con fallback a tasa actual para legacy; las ventas suman `order_items.total` (sin envío). | `server/commerce-router.ts:276,287-292,312-322,350-360` | Los reportes admin no usan ese snapshot ni `deliveredAt` (ADM-SET-06/07), así que negocio y admin no concilian. |
| Driver — ganancias | `driver_earnings` es la fuente de verdad; el fee se calcula server-side. | **Funciona** el cálculo al entregar: `deliveryFee × commissionRate / 100`, con unique por pedido/tipo. | `server/order-router.ts:899-909`; `db/schema.ts:286-297` | Un `delivery_fee` negativo/NaN contamina el earning (ADM-SET-01); el reporte `earnings` ignora fechas (ADM-SET-09) y `drivers` usa total stale (ADM-SET-10). |
| Admin — dashboard vs reportes | Una sola definición de ingresos/comisión. | **No coincide:** dashboard recalcula comisión con la tasa actual sobre `delivered`; reportes usan `orders.commission` e incluyen `pending_payment`/en curso; Stats usa snapshot. | `server/admin/dashboard-router.ts:44-55`; `server/admin/settings-router.ts:111,282`; `server/commerce-router.ts:312-322` | Tres fuentes de comisión y dos políticas de estados; liquidaciones y reportes no cuadran (ADM-SET-07/08). |
| Settings públicos | Solo claves permitidas; sin secretos. | **Funciona:** allowlist de 6 claves; `commission_rate` no se expone. | `server/settings-router.ts:5-24` | ADM-SET-19: lee toda la tabla y no cachea; defensa en profundidad mejorable. |

## 5. Lo que funciona y no se debe romper

- **Autorización real:** `/admin/settings` está bajo `SessionGuard role="admin"` (`App.tsx:137`) y todos los procedimientos usan `adminQuery` (`server/middleware.ts:25-36`). No se encontró acceso anónimo a settings ni reportes.
- **Allowlist pública:** `settings.getPublic` solo devuelve `app_name`, `support_phone`, `delivery_fee`, `min_order_amount`, `bank_transfer_info` y `operating_hours`; `commission_rate` queda fuera (`server/settings-router.ts:5-12`). El hallazgo histórico de `SELECT *` público ya no aplica.
- **Quote autoritativo:** `order.quote` y `order.create` calculan precios, envío, comisión y total en servidor; el cliente no envía montos (`server/order-router.ts:81-92,437-469`). El mínimo global y el mínimo por comercio se validan (`:179-194`).
- **Comisión snapshot:** al crear el pedido se escribe `order_commerce_status.commission_amount` por comercio (`server/order-router.ts:513-523`); Stats la suma (`server/commerce-router.ts:276,312-322`). No volver a recalcular el histórico con la tasa actual.
- **`delivered_at`:** se escribe al pasar a `delivered` (`server/order-router.ts:927`) y Stats agrupa por esa fecha en `America/Guayaquil` (`server/commerce-router.ts:350-360`). No reemplazarlo por `createdAt` en reportes.
- **Datos bancarios sin fallback:** el modal usa `settings.bank_transfer_info` y, si falta, muestra una advertencia en vez de una cuenta hardcodeada (`CartAddressModal.tsx:336-344`).
- **Logout role-scoped:** el logout de admin limpia solo su alcance (`Settings.tsx:134-141`; `server/login-router.ts:241-258`) y no cierra la sesión de cliente/merchant/driver.
- **Reportes admin-only y enum cerrado:** `getReports` usa `adminQuery` y un `z.enum` de 6 tipos (`server/admin/settings-router.ts:83-90`). No se encontró inyección SQL: Drizzle parameteriza y las fechas se convierten a `Date`.
- **Sin XSS/CSV evidente:** `bank_transfer_info` se renderiza como texto en React (`CartAddressModal.tsx:336-339`); no hay CSV y `XLSX` escribe los strings como celdas de texto, no como fórmulas. No se encontró un vector de inyección CSV en el flujo actual.
- **UI base:** la ruta es lazy (`App.tsx:43`), tiene loading, banner de éxito, cards responsive y targets de 44 px en back/save (`Settings.tsx:165-177,180-264,266-273`).

**No romper:** la allowlist pública, el quote/create autoritativo, el mínimo global y por comercio, el snapshot `commission_amount`, `delivered_at`, `adminQuery`, el logout role-scoped y la ausencia de fallback bancario hardcodeado.

## 6. Evidencia y verificación

**Método:** revisión estática de archivos y documentación. **No** se ejecutó la
aplicación, **no** se hicieron llamadas autenticadas, **no** se consultó la base de
datos, **no** se ejecutaron migraciones ni tests y **no** se reinició
`localhost:3000`. El servidor del usuario quedó intacto.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Allowlist pública sin `commission_rate` | PASS (estático) | `server/settings-router.ts:5-12` |
| Autorización admin de settings/reportes | PASS (estático) | `server/middleware.ts:25-36`; `server/admin/settings-router.ts:29,35,83` |
| Quote lee settings y aplica mínimo | PASS (estático) | `server/order-router.ts:81-92,179-204` |
| `order.create` recalcula y no confía en montos del cliente | PASS (estático) | `server/order-router.ts:437-469` |
| Snapshot de comisión por comercio | PASS (estático) | `server/order-router.ts:513-523`; `db/schema.ts:258` |
| `delivered_at` escrito y usado por Stats | PASS (estático) | `server/order-router.ts:927`; `server/commerce-router.ts:350-360` |
| Banco consumido desde settings | PASS con salvedad | `Cart.tsx:475`; `CartAddressModal.tsx:336-344` (no bloquea transferencia vacía) |
| Inyección SQL en reportes | No encontrada | `server/admin/settings-router.ts:83-94` (enum + Drizzle + `Date`) |
| Inyección CSV/PDF/XSS | No encontrada en el flujo actual | No hay CSV; React escapa el banco; `XLSX` escribe strings; `jsPDF` dibuja texto |
| Cobertura de tests de settings/reportes | **No existe** | Solo `contracts/orderStatus.test.ts` y `server/lib/otp.test.ts`; `scripts/admin-smoke.mjs:30-36` prueba `driver.list`, no settings |
| Valores reales de `app_settings` | **No verificado** | No se consultó la DB; los defaults citados son los del código/seed |
| Render real de PDF/Excel y caracteres especiales | **No verificado** | Requiere ejecutar la app y abrir los archivos |
| Zona horaria real de PostgreSQL/servidor | **No verificado** | El código asume parsing JS; la TZ de ejecución puede cambiar el resultado |
| Datos históricos de `driver_earnings.date` | **No verificado** | Puede haber filas legacy en UTC; no se inspeccionó la DB |
| Modo oscuro en `/admin` | Observación | No hay clases `dark:` en `src/pages/admin/` ni en `AdminLayout`; el panel es claro por diseño. No se contó como defecto |

## 7. Resumen para consolidado (top 5)

| ID | Severidad | Archivo:línea | Riesgo en una línea |
|---|---|---|---|
| ADM-SET-01 | P1 | `server/admin/settings-router.ts:35-49`; `server/order-router.ts:81-91` | Fee/mínimo sin validación: un typo puede romper todo el checkout o alterar la ganancia del driver. |
| ADM-SET-07 | P1 | `server/admin/settings-router.ts:273-308` | La comisión multi-comercio se atribuye a un comercio arbitrario e ignora el snapshot por comercio. |
| ADM-SET-06 | P1 | `server/admin/settings-router.ts:93-102`; `server/order-router.ts:927` | Reportes por `createdAt`/UTC ignoran `delivered_at`; no concilian con Stats ni con Guayaquil. |
| ADM-SET-08 | P1 | `server/admin/settings-router.ts:114,167,177,282` | Ingresos y comisiones incluyen `pending_payment` y pedidos en curso; el dashboard y Stats usan otra política. |
| ADM-SET-05 | P1 | `server/admin/settings-router.ts:132-151` | El reporte de pedidos materializa todos los comprobantes base64 sin límite; riesgo de memoria y PII en el export. |

**P1 adicionales:** ADM-SET-02 (guardado no atómico), ADM-SET-03 (defaults
destructivos tras error), ADM-SET-04 (sin auditoría de cambios financieros),
ADM-SET-09 (filtro de fechas ignorado en ganancias) y ADM-SET-10 (ganancias de
driver stale).

**Riesgos de integración para el consolidado:**

- **Dinero:** cualquier valor inválido de `delivery_fee` contamina quote, total del pedido, `driver_earnings`, reportes y liquidaciones; falta validación server-side y fail-closed.
- **Tres comisiones:** dashboard (tasa actual), reportes (`orders.commission`) y Stats (snapshot por comercio) pueden dar cifras distintas; definir una fuente y usarla en los tres.
- **Fechas:** reportes por `createdAt` y TZ de DB vs Stats por `delivered_at` en Guayaquil; los cierres contables no cuadran.
- **Configuración placebo:** `app_name`/`support_phone` no se consumen y el banco puede quedar vacío sin bloquear transferencias; el admin cree que configura algo que la app ignora.
- **Estados:** `pending_payment` se cuenta como ingreso/comisión en reportes, pero no en dashboard/Stats; política explícita pendiente.