# Auditoría `/commerce/profile` — Negocio

**Fecha:** 2026-11-13  
**Commit auditado:** `bf81ab6`  
**Ruta:** `/commerce/profile` — Perfil, horarios, ubicación, imágenes y sesión del negocio  
**Rol:** `merchant`  
**Método:** auditoría estática de código, contratos y consultas. No se modificó código, no se ejecutaron migraciones y no se reinició el servidor de desarrollo en `localhost:3000`.  
**Resultado:** 25 hallazgos — 1 P0, 13 P1 y 11 P2.

## 1. Alcance y archivos

Se revisó la ruta de punta a punta: guard de sesión, página, layout compartido, hooks de datos, procedimientos tRPC, autorización, cookies, esquema e integración con el catálogo cliente.

| Capa | Archivos |
|---|---|
| Página | `src/pages/commerce/Profile.tsx` |
| Layout y navegación | `src/components/CommerceLayout.tsx`; `src/App.tsx:116` |
| Guard y sesión | `src/components/SessionGuard.tsx`; `src/hooks/useSessionSync.ts`; `src/providers/trpc.tsx` |
| Hooks de datos | `src/hooks/useDeliveryData.ts` (`useMerchantCommerceId`, `useCommerce`, `useUpdateCommerceProfile`, `useToggleCommerceStatus`) |
| Backend de comercio | `server/commerce-router.ts` (`me`, `getById`, `update`, `toggleStatus`) |
| Auth y contexto | `server/login-router.ts` (`login`, `checkAuth`, `logout`, `refresh`); `server/merchant-auth.ts`; `server/context.ts`; `server/middleware.ts`; `server/lib/cookies.ts` |
| Autorización | `server/lib/order-access.ts` (`assertCommerceOwnership`, `merchantOwnsCommerce`) |
| Imágenes | `src/lib/imageUtils.ts`; `server/boot.ts:41` |
| Geolocalización | `src/pages/commerce/Profile.tsx:61-207`; `src/hooks/useGeocode.ts` (referencia de caché y AbortSignal) |
| Esquema | `db/schema.ts:119-144` (`commerces`) |
| Integración cliente | `server/order-router.ts` (`buildQuote`, `create`); `server/product-router.ts`; `src/pages/customer/Home.tsx`; `src/pages/customer/Search.tsx`; `src/pages/customer/CommerceDetail.tsx`; `src/hooks/useOrderEvents.ts`; `docs/customer/home.md`; `docs/customer/profile.md`; `docs/commerce/ROUTES_MAP.md` |
| Contrato de estados | `contracts/orderStatus.ts` — no aplica a esta ruta: `/commerce/profile` no lee ni escribe estados de pedido |

**Fuera de alcance:** pruebas de carga, inspección de datos productivos, modificaciones de UI/código, migraciones y reinicio del servidor. Tampoco se probó en dispositivo físico ni con usuarios reales; los puntos marcados como no verificados en la sección 6 son inferencias de lectura de código.

## 2. Flujo end-to-end (UI → hook → tRPC → DB/sesión)

```text
/commerce/profile
  ├─ App.tsx:116  SessionGuard role="merchant"
  │    ├─ getSession() lee localStorage.qs_session          SessionGuard.tsx:76-80
  │    ├─ si falta qs_session o el rol no es merchant ──────► /login
  │    └─ login.checkAuth (cookie HttpOnly)                 SessionGuard.tsx:84-98
  │
  ├─ Profile.tsx:82-86
  │    ├─ JSON.parse(localStorage.merchant_user)            ← sin try/catch
  │    ├─ useMerchantCommerceId()                           useDeliveryData.ts:121-170
  │    │    ├─ merchant_user.commerceId (caché)
  │    │    ├─ commerce.me (merchantQuery)                  commerce-router.ts:38-42
  │    │    └─ commerce.search(name) → results[0]           fallback por nombre
  │    └─ useCommerce(commerceId)                            useDeliveryData.ts:112-119
  │         └─ commerce.getById (publicQuery)                commerce-router.ts:44-60
  │              ├─ SELECT columnas públicas del comercio
  │              └─ SELECT todos los productos del comercio (solo si es owner)
  │
  ├─ useEffect de hidratación                              Profile.tsx:126-146
  │    ├─ setForm({...commerce, lat/lng con default Quito})
  │    └─ setTimeout(initMap, 150)                          Leaflet + OSM
  │         ├─ marker draggable                             Profile.tsx:106-112
  │         └─ dragend → Nominatim reverse → address         Profile.tsx:61-72
  │
  ├─ handleSave                                            Profile.tsx:151-165
  │    └─ useUpdateCommerceProfile                         useDeliveryData.ts:529-538
  │         └─ commerce.update { id, ...form }              commerce-router.ts:86-126
  │              ├─ merchantQuery + ownership                middleware.ts:51-62; commerce-router.ts:110-114
  │              ├─ UPDATE commerces                         commerce-router.ts:116-122
  │              └─ invalida getById/getStats → refetch → rehidrata form/mapa
  │
  ├─ handleToggleOpen                                      Profile.tsx:167-174
  │    └─ commerce.toggleStatus { id }                      commerce-router.ts:128-144
  │         ├─ ownership + SELECT isOpen actual
  │         └─ UPDATE isOpen al valor contrario
  │
  ├─ handleLogoFile / handleCoverFile                      Profile.tsx:176-190
  │    └─ FileReader.readAsDataURL → base64 en el form
  │
  └─ handleLogout                                          Profile.tsx:209-214
       ├─ login.logout                                      login-router.ts:125-131
       │    └─ limpia cookies admin, driver, merchant y customer
       ├─ localStorage.removeItem("merchant_user")
       ├─ localStorage.removeItem("qs_session")
       └─ navigate("/login")
```

**Lectura del comercio.** `Profile` no usa `commerce.me`; usa `useCommerce`, que llama al endpoint público `commerce.getById` (`useDeliveryData.ts:112-119`, `commerce-router.ts:44-60`). Ese endpoint devuelve las columnas públicas del comercio y, si el solicitante es owner, **todos** los productos del comercio (`commerce-router.ts:55-58`). El perfil solo necesita los campos del local, por lo que paga un payload de catálogo innecesario (PROF-16).

**Hidratación del formulario.** El `useEffect` convierte los campos de `commerce` al estado local `form` (`Profile.tsx:131-137`). Si `lat` o `lng` vienen vacíos, usa `-0.1807, -78.4678` (Quito) como valores por defecto (`Profile.tsx:128-130`). Después inicializa Leaflet con esos valores y un pin arrastrable (`Profile.tsx:95-119,138`). El mapa se destruye y se vuelve a crear cada vez que cambia la identidad del objeto `commerce` (`Profile.tsx:139-145`).

**Guardado.** `handleSave` no valida campos ni comprueba que el comercio esté cargado: si `commerceId` es nulo retorna en silencio (`Profile.tsx:151-152`); si existe, envía todo el `form` (`Profile.tsx:156`). El backend verifica ownership (`commerce-router.ts:110-114`), actualiza solo las claves definidas (`:116-121`) y emite únicamente `admin:dashboard` (`:124`). Después, React Query invalida `commerce.getById` y `commerce.getStats` (`useDeliveryData.ts:533-536`), lo que provoca un refetch y un nuevo `setForm` que descarta cambios locales no guardados.

**Toggle abrir/cerrar.** El hook invoca `commerce.toggleStatus` (`useDeliveryData.ts:540-549`). El backend lee el `isOpen` actual y escribe el contrario (`commerce-router.ts:140-141`), sin transacción atómica. No emite eventos de catálogo (`:142`). El botón no se deshabilita mientras la mutación está pendiente y el error solo va a `console.error` (`Profile.tsx:167-174,271-282`).

**Logout.** El botón del perfil y el del layout llaman `login.logout`, que limpia cookies de los cuatro roles (`login-router.ts:125-130`), pero el frontend solo elimina `merchant_user` y `qs_session`, sin limpiar React Query, carrito ni emitir `rapidy:logout` (`Profile.tsx:209-214`; `CommerceLayout.tsx:68-77`).

## 3. Hallazgos

| ID | Severidad | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| PROF-01 | P0 | Seguridad / integridad de estado | `server/commerce-router.ts:99,116-121` | `commerce.update` incluye `status` en el input del merchant y lo copia tal cual. No distingue admin; `middleware.ts:51-62` solo exige que exista `ctx.merchant`. | Un comercio `suspended`, `inactive` o `pending` puede enviar `{ status: "active" }` (y `isOpen: "open"`) con su cookie válida y reaparecer en `commerce.list`/`product.list`, que filtran por `status = "active"`. Bypass total de la moderación admin. | Quitar `status` del schema y del whitelist del merchant; solo el router admin puede cambiarlo. Añadir test que verifique que el campo se ignora o devuelve 400. |
| PROF-02 | P1 | Sesión / logout cruzado | `server/login-router.ts:125-130`; `src/pages/commerce/Profile.tsx:209-214` | El logout del negocio llama `login.logout`, que limpia cookies admin, driver, merchant y **customer** (`clearCustomerCookies`). El frontend solo borra `merchant_user` y `qs_session`. | Si el mismo navegador tiene sesión cliente y sesión negocio (posible porque `login.login` limpia admin/driver/merchant pero no customer; `login-router.ts:38-40`), el logout del negocio cierra también la sesión del cliente. `customer_session` y el carrito quedan en localStorage, generando un estado incoherente. Además, el `catch` vacío permite que, si falla la red, las cookies sigan válidas mientras la UI ya navegó a `/login`. `customer.logout` sí es selectivo (`customer-router.ts:347-353`). | Crear un logout de merchant que solo limpie cookies merchant (o aceptar un rol explícito y limpiar solo ese rol); limpiar localStorage de forma simétrica. |
| PROF-03 | P1 | Sesión / caché React Query | `src/pages/commerce/Profile.tsx:209-214`; `src/hooks/useDeliveryData.ts:131-135`; `src/providers/trpc.tsx:36-41` | El logout no limpia React Query ni emite `rapidy:logout`. `commerce.me` usa una queryKey global `["commerce.me"]`, no ligada al usuario. | Datos del comercio anterior quedan en memoria (gcTime 10 min). Tras logout/login de otro merchant, `.me` puede servirse de caché dentro de los 30 s de `staleTime` y persistir el `commerceId` equivocado en localStorage; el carrito tampoco se limpia porque no se emite el evento. Fuga de datos entre cuentas en navegador compartido. | En logout: `queryClient.clear()`, dispatch `rapidy:logout`, limpiar `customer_session`/`cart` según corresponda. Cambiar la key a `["commerce.me", merchant.id]`. |
| PROF-04 | P1 | Robustez / localStorage | `src/pages/commerce/Profile.tsx:82-83`; `src/hooks/useDeliveryData.ts:122-123`; `src/hooks/useSessionSync.ts:31` | `JSON.parse(localStorage.merchant_user)` se ejecuta sin `try/catch` en render y en el hook. `useSessionSync` también parsea `e.newValue` sin protección. | Un valor corrupto, legacy o manipulado lanza una excepción no capturada y deja en blanco `/commerce/profile` y todo el layout que usa `useMerchantCommerceId`. El usuario no puede recuperarse desde la UI. | Helper `safeParse` con validación de forma y `try/catch`; ante error, limpiar la clave y rehidratar desde `login.checkAuth`/`commerce.me`. |
| PROF-05 | P1 | Sesión F-08 | `src/components/SessionGuard.tsx:76-80`; `src/hooks/useDeliveryData.ts:134` | El guard exige `qs_session` para merchant antes de verificar la cookie. `commerce.me` solo se habilita si existe `merchant_user`. Una cookie HttpOnly válida con localStorage vacío redirige a `/login` o deja el perfil sin datos. | La sesión válida no sobrevive a una limpieza de localStorage, a una recarga en otro contexto o a un `merchant_user` ausente. Contradice la regla de que la cookie es la fuente de verdad. | Hidratar rol y usuario desde `login.checkAuth` y el comercio desde `commerce.me`; usar localStorage solo como caché y no redirigir antes de comprobar la cookie. |
| PROF-06 | P1 | Identidad del comercio F-08 | `src/hooks/useDeliveryData.ts:121-164` | Si no hay `commerceId` cacheado, busca por `merchantUser.name` y toma `results[0].id`, escribiéndolo en localStorage sin verificar ownership. Si hay ID cacheado, nunca llama `commerce.me` para revalidarlo. | Puede vincular la UI a un comercio homónimo o ajeno; los guardados fallan con error genérico. Tras reasignación o borrado, el ID cacheado queda obsoleto. Un comercio legacy suspendido no aparece en `commerce.search` (filtra `active`), así que nunca resuelve. | Resolver exclusivamente por `commerce.me`; eliminar el fallback por nombre y validar el ID cacheado contra el backend. Mostrar error explícito si no hay comercio asignado. |
| PROF-07 | P1 | Carga / estados de error | `src/hooks/useDeliveryData.ts:112-118`; `src/pages/commerce/Profile.tsx:85-86,216-224,151-165` | `useCommerce` no expone `error` ni `refetch`; Profile solo corta por `loading` y no usa `loading` de `useMerchantCommerceId`. Si `getById` falla, renderiza un formulario vacío con `ID: #0` y Guardar sigue habilitado, enviando strings vacíos; si `.me` no resuelve, Guardar no hace nada y no explica por qué. | El merchant no distingue un error de red de un perfil vacío. El guardado con `minOrder`/`lat`/`lng` vacíos falla en PostgreSQL, pero solo se muestra un `alert` genérico; si se relajan esos numéricos, el formulario podría sobrescribir nombre, descripción, logo y portada con vacío. | Exponer `error`/`refetch`, bloquear Guardar hasta tener comercio, mostrar estado de error con reintento y validar antes de mutar. |
| PROF-08 | P1 | Integración catálogo / SSE | `server/commerce-router.ts:124,142`; `src/hooks/useOrderEvents.ts:215-227,152-169` | `commerce.update` y `toggleStatus` solo emiten `admin:dashboard`; no emiten `commerces:global` ni `commerce:{id}`. `useCommercesEvents` solo invalida `commerce.list`; `useCommerceEvents` del detalle solo invalida pedidos/productos, no `commerce.getById`. Además `product.list` proyecta `commerceName`, `commerceLogo` y `commerceIsOpen` y no se invalida al cambiar el comercio. | Home, Search y `/commerce/:id` mantienen nombre, logo, portada, dirección, horario, mínimo y estado abierto/cerrado viejos. Una tienda cerrada sigue mostrando productos y permite agregarlos hasta que falle el quote. Los cambios no se ven hasta recargar, hasta que expire el caché o nunca en una pestaña abierta con `refetchOnWindowFocus: false`. | Emitir `commerce_update` a `commerces:global` y `commerce:{id}` en update/toggle. En los handlers invalidar `commerce.list`, `commerce.getById`, `product.list`, `product.search`, `product.getFeatured` y `product.getTopOrdered`. |
| PROF-09 | P1 | Imágenes F-10 | `src/pages/commerce/Profile.tsx:176-190`; `server/commerce-router.ts:95-96`; `db/schema.ts:123-124`; `server/boot.ts:41` | Logo y portada se leen como data URL sin validar MIME, tamaño ni dimensiones; el backend acepta `z.string()` sin límite y guarda en columnas `text`. `commerce.list` devuelve logo y portada de todos los comercios. El body limit global es 50 MB. | Un archivo grande infla la fila y cada carga de Home/Search; en móvil aumenta consumo de datos y tiempo de carga. Un data URL enorme puede congelar el navegador antes de enviarse; no hay cuota de almacenamiento. | Validar tipo y tamaño (por ejemplo ≤300–500 KB), redimensionar/comprimir en canvas antes de base64, imponer límite server-side y evitar devolver imágenes completas en listados que no las necesitan. |
| PROF-10 | P1 | Validación de formulario y API | `src/pages/commerce/Profile.tsx:355,390,400-405`; `server/commerce-router.ts:90-103`; `server/order-router.ts:163` | Nombre, teléfono, mínimo, tiempo y coordenadas son texto libre sin `required`, longitud ni formato. El servidor usa `z.string().optional()` y acepta vacío o cualquier valor; `minOrder` se consume con `Number()` en el quote. | Nombre, teléfono y dirección vacíos pasan y degradan la ficha pública. Más de 200/20/50 caracteres revientan en PostgreSQL con 500. Un `minOrder` no numérico puede fallar o desactivar la comparación (`NaN`), dejando pasar pedidos bajo el mínimo; valores como `Infinity` pueden volver imposible el pedido. Dejar el mínimo vacío envía `''` y PostgreSQL rechaza el UPDATE completo; un comercio legacy con `minOrder NULL` queda sin poder guardar ningún cambio. | Zod con `trim`, mínimos, máximos, regex de teléfono y decimal positivo para `minOrder`; rangos de lat/lng; `maxLength` en inputs y errores inline por campo. |
| PROF-11 | P1 | Ubicación por defecto | `src/pages/commerce/Profile.tsx:128-130` | Si faltan `lat`/`lng`, el formulario se hidrata con Quito (`-0.1807, -78.4678`) y el mapa se centra ahí. Al guardar cualquier otro cambio se persisten esas coordenadas. | El comercio queda mal ubicado. `order.getById` entrega `lat/lng` al tracking (`server/order-router.ts:433-437`) y `OrderTrackingMap` las usa como origen (`src/pages/customer/components/OrderTrackingMap.tsx:216-217,273-275`), por lo que el recorrido se calcula desde un punto falso. | No inyectar coordenadas por defecto en el estado del formulario; usar Quito solo como vista inicial y marcar “sin ubicación”. Exigir confirmación o geocodificación antes de guardar. |
| PROF-12 | P2 | Dirección vs. pin | `src/pages/commerce/Profile.tsx:379,107-112` | Editar la dirección no geocodifica ni mueve el pin. Arrastrar el pin reemplaza la dirección por el `display_name` de Nominatim. No se valida que dirección y coordenadas correspondan. | La dirección textual y las coordenadas pueden divergir; el cliente ve una dirección y el tracking usa otra. Un texto escrito manualmente se pierde al mover el pin. | Geocodificar al salir del campo con debounce y caché (`useGeocode`), mover el pin; al mover el pin, mostrar dirección sugerida editable y confirmar. |
| PROF-13 | P1 | Toggle abrir/cerrar | `src/pages/commerce/Profile.tsx:167-174,271-282`; `server/commerce-router.ts:128-144` | El error del toggle se traga en `console.error`, el botón no se deshabilita ni muestra pending/success. El backend hace SELECT y luego UPDATE, sin operación atómica. | El merchant cree que cerró pero sigue recibiendo pedidos, o cree que abrió y sigue cerrado. Un doble clic puede dejar el estado inesperado por la carrera entre lecturas. | Deshabilitar el botón mientras la mutación está pendiente, mostrar toast/error inline y hacer el toggle atómico con `UPDATE ... SET is_open = CASE ... RETURNING`. |
| PROF-14 | P1 | Pérdida de edición | `src/pages/commerce/Profile.tsx:126-146`; `src/hooks/useDeliveryData.ts:540-549` | El efecto rehidrata `form` y reinicia el mapa cada vez que cambia la identidad de `commerce`. El toggle invalida `commerce.getById`, provocando refetch y reset. | Si el merchant edita nombre, descripción o ubicación y luego abre/cierra la tienda, pierde los cambios sin aviso. El mapa se recentra y parpadea. | Separar datos iniciales de estado “dirty”; no rehidratar campos tocados. Advertir cambios sin guardar e inicializar el mapa una vez por comercio, actualizando el marker sin recrearlo. |
| PROF-15 | P2 | Vitrina pública F-15 | `server/commerce-router.ts:44-60` | `getById` es `publicQuery` y devuelve el comercio y sus productos sin filtrar `status` ni `isOpen`; solo filtra productos por `isAvailable`. `commerce.list` sí filtra `status = "active"`. | Un cliente con la URL directa puede abrir un comercio suspendido o inactivo y ver su catálogo. El checkout lo rechazará después (`order-router.ts:124-131`), pero la vitrina sigue expuesta. | Para no-owner/no-admin, devolver `null`/404 si `status !== "active"`; si se quiere mostrar “cerrado”, limitar a comercios active+closed con copy explícito. Mantener acceso owner/admin. |
| PROF-16 | P2 | Performance del perfil | `src/pages/commerce/Profile.tsx:85-86`; `server/commerce-router.ts:55`; `src/hooks/useDeliveryData.ts:112-118` | El perfil carga el comercio con `commerce.getById` público, que además selecciona **todos** los productos del comercio solo para leer campos del local. No usa `commerce.me`. | Payload y latencia innecesarios, especialmente con catálogo grande o imágenes base64; duplica la consulta que ya hace Productos. Además, `CommerceLayout` monta `useCommerceOrders` en todas las rutas (`CommerceLayout.tsx:48-54`), así que el perfil también descarga pedidos con PII y los refresca cada 30 s solo para el badge. | Usar `commerce.me` con proyección de los campos del perfil, o un query específico que no devuelva productos. |
| PROF-17 | P2 | Visual / Tailwind | `src/pages/commerce/Profile.tsx:233,238,253,309,355`; `tailwind.config.js:5-6`; `package.json:113` | Las clases `w-8.5`, `h-8.5`, `h-9.5`, `w-18`, `h-18`, `w-22`, `p-4.5` no existen en la escala de Tailwind 3.4 y no hay `extend.spacing`; se ignoran. Verificado con `require("tailwindcss/defaultTheme").spacing`. | El botón “Volver” queda en ~16 px y el de guardar en ~16–36 px (targets <44 px). El contenedor del logo no tiene ancho/alto: muestra el icono a 32 px o la imagen a su tamaño intrínseco, pudiendo desbordar y ser recortada por `overflow-x-hidden`. | Usar escala válida (`w-9 h-9`, `h-10`) o valores arbitrarios (`w-[72px] h-[72px]`); extender `spacing` si se quiere conservar la nomenclatura. Verificar 320/360/390/768 px. |
| PROF-18 | P2 | Layout desktop | `src/components/CommerceLayout.tsx:203-207` | El `<main>` combina `pt-28 md:pt-0` con un `style={{ paddingTop: ... }}` inline que siempre gana. En desktop el header está oculto (`md:hidden`) pero el contenido conserva ~104 px de padding superior. | Hueco vertical grande sobre el contenido en escritorio; el `md:pt-0` nunca se aplica. Afecta a todas las rutas del panel, incluida `/commerce/profile`. | Aplicar el padding con clases responsive y usar la variable de safe-area solo en móvil, o calcularlo con `md:pt-0` mediante CSS que no sea sobrescrito por inline. |
| PROF-19 | P2 | Accesibilidad | `src/pages/commerce/Profile.tsx:245,341,354-355,320-324,380,216-224`; `src/index.css:1-271` | Labels sin `htmlFor`/`id`; input file `hidden` dentro de label no focusable y overlay del logo visible solo con `group-hover`; mapa sin `role`/`aria-label` ni instrucciones accesibles; spinner sin `role=status`; textos de 10 px `text-slate-400`; no hay `focus-visible` explícito ni `motion-reduce`. | Teclado y lector de pantalla no asocian campos ni descubren la carga de imágenes; en táctil el overlay del logo es invisible. Bajo contraste y animaciones que ignoran `prefers-reduced-motion`. | Asociar labels con ids, usar botones de archivo visibles y focusables, dar `aria-label`/descripción al mapa y coordenadas editables, `role=status`/`aria-live`, contraste ≥4.5 y `motion-reduce:animate-none`. |
| PROF-20 | P2 | Errores y feedback | `src/pages/commerce/Profile.tsx:159-161,171-173,192-206,176-190` | El guardado usa `alert()`; el toggle solo hace `console.error`; geolocalización no soportada o denegada retorna sin mensaje; `readFileAsDataURL` rechaza sin catch; no hay errores inline ni reintento. `saved` no se limpia al editar. | El usuario no sabe qué falló ni qué campo corregir; el estado de éxito puede quedar visible mientras hay cambios nuevos. | Errores inline por campo y banner/toast, manejo de códigos de geolocalización, catch de FileReader y `aria-live`; resetear `saved` al cambiar el formulario. |
| PROF-21 | P2 | Estado del comercio / copy | `src/pages/commerce/Profile.tsx:264-269,338` | El copy “Aceptando pedidos en vivo” y el badge “Abierto” dependen solo de `isOpen`; ignoran `commerce.status` (`active/inactive/suspended/pending`), que puede impedir aparecer en el catálogo. El status no se muestra en ninguna parte. | Un comercio suspendido o pendiente cree que está operando; no entiende por qué no recibe pedidos y el toggle no lo hace visible. | Mostrar un badge de `status` (solo lectura) y un aviso cuando no sea `active`; separar “abierto/cerrado” de “aprobado/suspendido”. |
| PROF-22 | P1 | Email / PII local | `src/pages/commerce/Profile.tsx:82-84,133,156,359,425`; `server/commerce-router.ts:9-26,94` | El email read-only sale de `localStorage.merchant_user.email`, no de la sesión verificada. Además, `getById` no devuelve `commerces.email` (no está en `publicCommerceColumns`), así que `form.email` siempre es `""` y `handleSave` lo envía: cada guardado escribe `email = ""` en la DB. | El merchant no reconoce su email de registro y el email de contacto del comercio se borra silenciosamente en cada guardado. PII innecesaria en localStorage; campo read-only que no refleja el dato real. | Obtener el email de `login.checkAuth`/`commerce.me` si debe mostrarse y **no incluir `email` en el payload del perfil**; enviar solo campos editables o dirty y explicar que el email de login no se cambia aquí. |
| PROF-23 | P2 | Geocodificación / OSM | `src/pages/commerce/Profile.tsx:61-72,107-112`; `src/hooks/useGeocode.ts:10-40` | Lógica duplicada de Nominatim sin caché, debounce, abort ni comprobación de `res.ok`. Varias respuestas de `dragend` pueden llegar fuera de orden y sobrescribir la dirección. El header `User-Agent` no es configurable desde el navegador y la atribución del tile no enlaza a OSM. | La dirección final puede corresponder a una posición anterior; si Nominatim falla, el `catch` devuelve `lat, lng` y esa cadena se guarda como dirección del local. Rate limit o 403 silencioso; incumplimiento de la política de uso de OSM. | Reutilizar `useGeocode` (caché en sessionStorage, AbortSignal, debounce), secuenciar peticiones, comprobar `res.ok` y añadir el enlace de atribución de OpenStreetMap. |
| PROF-24 | P2 | Consistencia del layout | `src/components/CommerceLayout.tsx:46,56-66,105-113,174-186` | Sidebar y header usan `merchant_user.name`, leído una sola vez al montar, no `commerces.name`. El perfil edita `form.name`/`commerces.name`. | Tras guardar el nombre, el header del panel sigue mostrando el nombre anterior o el de la cuenta; parece que el guardado no se aplicó. | El layout debe leer el nombre del comercio desde `commerce.me`/caché de React Query y reaccionar a la invalidación. |
| PROF-25 | P2 | Tokens de marca | `src/pages/commerce/Profile.tsx:220,253,274-277,288,309` | La página repite `#FF6A00`, `#0E0E12` y `#18181F` en lugar de usar los tokens `brand`, `surface` e `ink` definidos en `src/index.css:25-47`. | Un cambio de tema o de marca no se propaga; inconsistencia con las demás pantallas que usan tokens. | Reemplazar los hardcodes por `bg-brand`, `text-brand`, `bg-ink` y variantes; mantener los hex solo en el fallback centralizado. |

## 4. Integración con el flujo Cliente

| Superficie | Consulta / campo | Comportamiento real | Riesgo de integración |
|---|---|---|---|
| `/home` | `commerce.list` (`commerce-router.ts:29-34`) devuelve name, logo, coverImage, address, phone, minOrder, deliveryTime, openHours, isOpen | Solo comercios `active`; los cerrados se muestran con badge “Cerrado”. `useCommercesEvents` invalida `commerce.list` (`useOrderEvents.ts:215-227`). | `commerce.update`/`toggleStatus` no emiten `commerces:global` (PROF-08): una pestaña abierta conserva logo, portada, nombre, mínimo y estado viejos hasta recargar. |
| `/search` | `commerce.list` + `product.search` | Misma proyección pública; el buscador filtra por nombre y categoría en cliente/back. | Los cambios de nombre/logo no aparecen en una búsqueda ya abierta; si la tienda se cierra, sus productos pueden seguir listados en caché. |
| `/commerce/:id` | `commerce.getById` (`commerce-router.ts:44-60`) | Devuelve el comercio aunque esté suspendido/inactivo; `useCommerceEvents` (`useOrderEvents.ts:152-169`) solo invalida pedidos y productos, no `commerce.getById`. | Vitrina obsoleta o de un comercio moderado (F-15/PROF-15). El usuario ve “Abierto” y productos que el checkout rechazará. |
| Checkout | `order.quote`/`order.create` (`order-router.ts:124-131,161-168,305-312`) | Lee el estado vivo de la DB: rechaza comercio no `active`, `isOpen !== "open"`, producto agotado y subtotal bajo el mínimo por comercio/global. | **Aquí sí se reflejan los cambios de inmediato**, aunque la UI esté stale. Es la red de seguridad actual y no se debe romper. |
| Tracking `/order/:id` | `order.getById` devuelve `commerces.lat/lng` (`order-router.ts:433-437`) y `OrderTrackingMap` las usa como origen | Las coordenadas se leen en vivo. | Si el perfil guardó el default Quito (PROF-11), el mapa de seguimiento muestra un origen falso. |
| Logout del negocio | `login.logout` (`login-router.ts:125-130`) | Limpia cookies de admin, driver, merchant y customer. | Cierra la sesión del cliente en el mismo navegador (PROF-02). El cliente vuelve a `/customer-login` aunque su sesión fuera independiente. |
| Recarga de sesión | `context.ts:124-152` verifica access y, si expiró, refresh merchant + DB role | Con `qs_session` y `merchant_user` presentes, la cookie válida sobrevive a la recarga y el access se renueva. | Sin `qs_session`/`merchant_user`, `SessionGuard` redirige aunque la cookie siga válida (PROF-05). |
| PII | `publicCommerceColumns` (`commerce-router.ts:9-26`) excluye email, `commissionRate` y `merchantUserId`; `commerce.me` devuelve la fila completa solo al owner | La vitrina no expone esos campos. El perfil no maneja pedidos ni PII de clientes. | El único PII adicional es `merchant_user.email` en localStorage (PROF-22). F-16 (PII de pedidos) no aplica a esta ruta. |

**Resumen de integración:** los datos de perfil que afectan al servidor (nombre, mínimo, horarios, estado, coordenadas) se guardan correctamente y el checkout los valida contra la DB. El problema es la propagación a la UI del cliente: falta el evento de comercio y falta invalidar `commerce.getById`/`product.list`. Abrir/cerrar sí bloquea pedidos en el servidor, pero la UI puede seguir ofreciendo productos de una tienda cerrada. El logout del negocio es el punto más delicado porque rompe la sesión del cliente en el mismo navegador.

## 5. Lo que funciona y no se debe romper

- **Ownership en las mutaciones.** `commerce.update` y `commerce.toggleStatus` comparan `merchantUserId` con `ctx.merchant.id` (`commerce-router.ts:110-114,135-138`) y usan `merchantQuery` (`middleware.ts:51-62`). No se encontró IDOR en estas dos mutaciones.
- **Campos sensibles no editables.** El schema de `commerce.update` no incluye `commissionRate`, `categoryId` ni `merchantUserId` (`commerce-router.ts:88-104`); un merchant no puede cambiarlos por esta vía. Mantener esa lista blanca al corregir PROF-01.
- **Proyección pública sin PII sensible.** `publicCommerceColumns` excluye email, comisión y `merchantUserId` (`commerce-router.ts:9-26`). `commerce.me` devuelve la fila completa solo al owner autenticado (`:38-42`).
- **Validación server-side de disponibilidad en checkout.** `buildQuote` rechaza comercio inactivo, cerrado, producto agotado y mínimo no alcanzado (`order-router.ts:124-131,161-168`); `order.create` aborta si el quote tiene issues (`:305-312`). No mover esta validación al cliente.
- **Cookies HttpOnly y SameSite correctos.** `getSessionCookieOptions` usa `Lax` en localhost y `None + Secure` fuera (`cookies.ts:8-16`); `setMerchantCookie` firma access de 24 h y refresh de 7 días (`merchant-auth.ts:63-83`). El contexto renueva el access desde refresh y revalida el rol en DB (`context.ts:124-152`).
- **CSRF mitigado por diseño.** tRPC solo acepta `application/json` (`@trpc/server` valida `content-type`), no hay CORS configurado en `server/boot.ts`, y las cookies son SameSite. No se encontró un vector CSRF práctico; no añadir CORS permisivo.
- **Sin XSS directo en el perfil.** React escapa nombre, descripción, horarios y dirección; el HTML del pin es una constante (`Profile.tsx:43-50`). Las imágenes se usan en `<img>` o `background-image`, no en `dangerouslySetInnerHTML`. Mantener ese patrón.
- **Mapa Leaflet aislado en el chunk lazy.** `Leaflet` se importa solo en `Profile.tsx:32-33`, que es lazy en `App.tsx:35`; no se importa globalmente en `main.tsx`. Mantenerlo así.
- **Teardown del mapa.** `initMap` elimina una instancia previa y limpia `_leaflet_id` (`Profile.tsx:95-101`); el cleanup del efecto remueve el mapa (`:139-145`). No se encontró duplicación de mapas en lectura estática, aunque el reinicio por refetch provoca parpadeo (PROF-14).
- **Safe-area móvil del layout.** El header y la nav inferior usan `env(safe-area-inset-*)` (`CommerceLayout.tsx:167-172,203-207,213-215`). No reemplazar por valores fijos al corregir PROF-18.
- **Formulario y estados de guardado básicos.** El botón se deshabilita con `saving`, muestra “Guardando…” y el backend devuelve el comercio actualizado (`Profile.tsx:151-165`; `commerce-router.ts:123-125`). Conservar el feedback y mejorarlo, no eliminarlo.
- **Fallbacks de imagen.** `safeImage` y `onError` evitan imágenes rotas (`imageUtils.ts:7-10`; `Profile.tsx:291-295,311-316`). Mantenerlos al migrar a URLs/almacenamiento.
- **Una sola instancia de QueryClient.** `src/providers/trpc.tsx:36-60` es el único cliente; no crear otro para “arreglar” el logout o el perfil.

## 6. Evidencia y verificación

### 6.1 Verificación de los hallazgos conocidos

| Hallazgo previo | Estado en esta auditoría | Evidencia |
|---|---|---|
| **F-02** auto-reactivación | **Confirmado. Elevado a P0.** | `commerce.update` acepta `status` (`commerce-router.ts:99`) y lo escribe sin distinguir admin (`:116-121`). El middleware solo valida `ctx.merchant` (`middleware.ts:51-62`). |
| **F-08** sesión localStorage/fallback | **Confirmado. P1.** | `SessionGuard` exige `qs_session` (`SessionGuard.tsx:76-80`); `JSON.parse` sin protección (`Profile.tsx:82-83`; `useDeliveryData.ts:122-123`); fallback por nombre y `results[0]` (`useDeliveryData.ts:137-163`). |
| **F-10** imágenes | **Confirmado y ampliado. P1.** | Sin validación cliente (`Profile.tsx:176-190`), sin límite server (`commerce-router.ts:95-96`), columnas `text` (`schema.ts:123-124`), body 50 MB (`boot.ts:41`) y `commerce.list` devuelve las imágenes a todos (`commerce-router.ts:9-26`). |
| **F-14** logout incompleto | **Confirmado y ampliado. P1.** | `Profile.tsx:209-214` y `CommerceLayout.tsx:68-77` no limpian caché ni emiten `rapidy:logout`; además `login.logout` limpia cookies customer (`login-router.ts:129`). |
| **F-15** `getById` público sin status | **Confirmado. P2.** | `commerce.getById` no filtra `status`/`isOpen` (`commerce-router.ts:44-60`); solo filtra productos por `isAvailable` (`:58`). |
| **F-16** PII en pedidos | **No aplica a `/commerce/profile`.** | El perfil no consulta pedidos. La proyección pública del comercio excluye email/comisión/merchantUserId (`commerce-router.ts:9-26`); `commerce.me` es owner-only (`:38-42`). El PII local relevante es `merchant_user.email` (PROF-22). |

### 6.2 Comprobaciones realizadas

- Lectura estática completa de todos los archivos de la sección 1, incluyendo `docs/commerce/ROUTES_MAP.md`, `docs/customer/home.md` y `docs/customer/profile.md`.
- Verificación de clases Tailwind con `node -e "require('tailwindcss/defaultTheme').spacing"`: `4.5`, `8.5`, `9.5`, `18` y `22` no existen en la escala; `tailwind.config.js:5-6` no extiende `spacing`.
- Búsqueda de emisiones SSE: `commerce.update` y `commerce.toggleStatus` solo emiten `admin:dashboard` (`commerce-router.ts:124,142`); los emisores admin sí emiten `commerces:global` (`server/admin/commerces-router.ts:88-89,118-119,177-178,219-220`).
- Búsqueda de tests de negocio: `scripts/e2e-smoke.mjs` (178 líneas) no menciona merchant ni `/commerce/profile`; `scripts/redirect-smoke.ts:56-60` solo cubre cliente. **F-20 confirmado para esta ruta.**
- Verificación de que el checkout usa datos vivos: `buildQuote` lee `commerces.status`, `isOpen` y `minOrder` en cada quote (`order-router.ts:124-131,161-168`) y `order.create` aborta con issues (`:305-312`).
- Verificación de autorización: `assertCommerceOwnership` y `merchantOwnsCommerce` (`order-access.ts:33-57`); `update`/`toggleStatus` no aceptan IDs de otro merchant.
- No se ejecutaron `npm test`, `npm run build`, migraciones ni pruebas HTTP contra `localhost:3000` para no tocar el servidor del usuario. La verificación es estática; no se modificó ningún archivo de código.

### 6.3 No verificado en runtime

- Inicialización real de Leaflet en móvil/desktop, comportamiento del pin al arrastrar y posible bloqueo del scroll táctil.
- Tamaño real de los base64 que suben los usuarios y el impacto medido en el payload de `commerce.list`.
- Comportamiento real de las cookies y del logout cruzado en un navegador con sesiones customer + merchant simultáneas; se infiere del código de `login-router.ts:125-130`.
- Respuestas reales de Nominatim (rate limit, 403, tiempos) y geolocalización del navegador.
- Persistencia exacta de valores PostgreSQL para `NaN`/`Infinity` en `minOrder`; la conclusión de validación se basa en el uso de `Number()` y en el tipo `numeric`.

## 7. Resumen para consolidado (top 5)

| Prioridad | ID | Hallazgo | Archivo:línea | Por qué primero |
|---|---|---|---|---|
| 1 | **PROF-01** | Auto-reactivación de comercio vía `commerce.update` con `status: "active"`. | `server/commerce-router.ts:99,116-121` | P0 de integridad/seguridad: un comercio suspendido vuelve al catálogo público sin admin. |
| 2 | **PROF-02** | El logout del negocio limpia también la cookie del cliente. | `server/login-router.ts:125-130`; `src/pages/commerce/Profile.tsx:209-214` | Rompe la sesión del cliente en el mismo navegador y deja localStorage incoherente. |
| 3 | **PROF-05** | La sesión merchant depende de `qs_session`/`merchant_user`, no de la cookie. | `src/components/SessionGuard.tsx:76-80`; `src/hooks/useDeliveryData.ts:134` | F-08: cookie válida pero usuario expulsado o perfil vacío tras limpiar localStorage. |
| 4 | **PROF-08** | Los cambios de comercio no emiten SSE ni invalidan la vitrina. | `server/commerce-router.ts:124,142`; `src/hooks/useOrderEvents.ts:215-227,152-169` | Home/Search/detalle muestran datos viejos; una tienda cerrada puede seguir ofreciendo productos. |
| 5 | **PROF-11** | Coordenadas por defecto de Quito se guardan si faltan lat/lng. | `src/pages/commerce/Profile.tsx:128-130` | Ubica el comercio y el origen del tracking en un punto falso sin que el merchant lo note. |

**Orden recomendado de corrección:** PROF-01 (bloqueante de seguridad) → PROF-02/PROF-03 (logout y caché) → PROF-05/PROF-06 (identidad de sesión y comercio) → PROF-08 (integración SSE) → PROF-09/PROF-10/PROF-11 (imágenes, validación y ubicación) → PROF-22 (email) → resto de P2 visuales/accesibilidad.