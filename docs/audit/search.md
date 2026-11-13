> **Reporte histórico de auditoría (2026-11-13).** No es un backlog ni una lista de tareas.
> Varios hallazgos ya están corregidos. No implementes nada de este documento sin pedido explícito.
> Estado actual verificado: [docs/customer/README.md](../customer/README.md).
# Auditoría de la ruta `/search` — Rapidy (DeliveryCity)

- **Fecha:** 2026-11-13
- **Commit auditado:** `0b722b7` (`feat(customer): dark bottom nav in all routes, fixed headers in search/profile, reubicacion de logout y modal de pedidos`)
- **Alcance:** `GET /search` de inicio a fin, navegación a `/commerce/:id`, contratos tRPC/SQL asociados y UI compartida usada por la ruta.
- **Método:** revisión estática de código + ejecución local en `http://localhost:3000` con Playwright (seed local: 8 categorías, 5 comercios activos, 20 productos, 8 destacados, 2 clientes). No se modificó código fuente ni datos.
- **Límite:** no se probó el build de producción ni un dispositivo iOS/Android real. Lo marcado como **hipótesis** requiere esa verificación.

> **Nota de alcance:** `/search` no usa los endpoints `product.search` ni `commerce.search`; usa tres consultas de catálogo y filtra en memoria. Varias conclusiones dependen de esa decisión de diseño.

---

## 1. Resumen ejecutivo

- **P1 — La búsqueda no busca el catálogo completo.** Solo consulta `product.getFeatured` (8 productos marcados `isFeatured=yes`) y filtra en el cliente. `product.search` existe pero está muerto. Verificado: buscar `Leche` devuelve “Sin resultados” aunque `product.search` devuelve `Leche entera 1L`; buscar `Pan` solo encuentra el comercio, no `Pan flauta x2` ni `Pan lactal blanco`; `Papas fritas grandes` nunca aparece.
- **P1 — El filtro de categorías no filtra productos.** `selectedCategory` solo se aplica a comercios. Al elegir `Comidas`, la pantalla muestra `PRODUCTOS (8)` incluyendo productos de Farmacia y Heladería, y solo un comercio. `Bebidas` (sin comercios activos) sigue mostrando los 8 productos.
- **P1 — Productos de comercios cerrados/inactivos siguen siendo comprables.** `getFeatured` hace `LEFT JOIN commerces` sin filtrar `status` ni `isOpen`; las tarjetas permiten “Añadir” y el detalle permite agregar. El carrito recién bloquea el checkout después.
- **P1 — `SessionGuard` falla abierto para clientes.** Con solo `qs_session` (sin `customer_session` ni cookie válida), a los 600 ms renderiza `/search`. Verificado en navegador. Una sesión expirada no redirige; el `checkAuth` en segundo plano no limpia el estado local.
- **P0 colateral — `customer.list` es público y devuelve PII completa.** `publicQuery` con `select * from customers`: id, nombre, apellido, teléfono, dirección y `fcmToken`. Verificado sin cookie: 2 filas en la BD local (valores omitidos). No lo usa `/search`, pero está en un router nuclear y es un P0 real.
- **P2 — Estado y URL divorciados.** Limpiar con la “X” deja `?q=` en la URL; recargar restaura la búsqueda. El botón “Buscar” del bottom nav cambia la URL pero conserva el texto. Las categorías nunca se escriben en la URL.
- **P2 — No hay estados de error/offline.** Si fallan las tres APIs, se ve “Productos populares” vacío; al escribir, “Sin resultados”. No hay retry, banner offline ni distinción entre “no hay datos” y “falló la red”.
- **P2 — Accesibilidad y rendimiento por debajo del estándar.** Tarjetas de resultado son `div` no focusables (el teclado no puede abrir un comercio), sin `aria-live` ni label de búsqueda, targets de 20/28/36 px y contrastes de 2,56–2,87:1. Además hay tres GET completos al montar, dos `QueryClientProvider` anidados y datos internos de comercio expuestos en el payload.

---

## 2. Mapa end-to-end

### 2.1 Entradas a `/search`

| Origen | Evidencia | Estado que llega |
|---|---|---|
| Buscador de `/home` + Enter | `src/pages/customer/components/HomeHeader.tsx:123-130`, `src/pages/customer/Home.tsx:102-106` | `navigate('/search?q=<trim>')`; solo si el texto no es vacío |
| “Ver todo” de productos populares | `src/pages/customer/Home.tsx:147-153` | `/search` sin parámetros |
| “Ver más” de restaurantes | `src/pages/customer/components/HomeFeaturedCommerces.tsx:58-64` | `/search` sin parámetros |
| Fallback del banner | `src/pages/customer/components/HomePromoBanner.tsx:90-97` | `/search` sin parámetros |
| Bottom nav “Buscar” | `src/components/CustomerBottomNav.tsx:57-68` | `/search` sin parámetros, incluso si ya se está en `/search?q=...` |

### 2.2 Diagrama

```text
[HomeHeader Enter] [Home "Ver todo"] [HomeFeatured "Ver más"] [Promo fallback] [BottomNav Buscar]
        │                  │                   │                    │                  │
        └──────────────────┴───────────────────┴────────────────────┴──────────────────┘
                                      navigate('/search[?q=...]')
                                                     │
                                                     ▼
App.tsx:96  <Route /search> ── SessionGuard role="customer" ── PageTransition
                               │
                               ├─ getSession() = localStorage "qs_session"  (role customer)
                               ├─ localStorage "customer_session" (solo para el estado inicial)
                               ├─ si falta customer_session: timer 600 ms → checking=false (FAIL-OPEN)
                               └─ useSessionSync escucha solo cambios de "qs_session"

Search.tsx
  URL: q, category ──► useState(query, selectedCategory)   [solo lectura; no setSearchParams]
  tecla ──► setQuery ──► .filter() en memoria              [sin debounce, sin request]
        │
        ├─ GET /api/trpc/category.list        → 8 categorías (chips)
        ├─ GET /api/trpc/commerce.list       → 5 comercios activos, todas las columnas
        └─ GET /api/trpc/product.getFeatured → 8 productos destacados + commerceName
        │
        ├─ isLoading (las 3) → spinner de página completa
        ├─ query vacío y category nula → "Productos populares" (slice 0,6)
        └─ resto → PRODUCTOS (filtro solo por nombre) + COMERCIOS (nombre + categoría)
                     │
                     ├─ tarjeta producto click → /commerce/:commerceId
                     ├─ botón "+" → useCart.addItem() local (sin unitType)
                     └─ tarjeta comercio click → /commerce/:id
                                                     │
                                                     ▼
CommerceDetail.tsx
  ├─ GET commerce.getById {id}        → comercio + products[] (products anidados NO se usan)
  ├─ GET product.getByCommerce {id}   → todos los productos; el FE filtra isAvailable="yes"
  ├─ agrupa por product.category (string libre, no categoryId)
  ├─ producto unit → addItem; producto kg → modal peso/importe
  └─ volver → navigate('/home') (pierde la búsqueda)
```

### 2.3 Secuencia exacta

1. **Entrada y guard.** `App.tsx:96` monta `SessionGuard role="customer"`. El guard lee `qs_session` y `customer_session` de `localStorage` (`SessionGuard.tsx:14-21`). Para clientes no llama a `login.checkAuth`; si falta autenticación, un `setTimeout` de 600 ms pone `checking=false` (`SessionGuard.tsx:57-60`). Es decir, la protección efectiva es un flag de `localStorage`.
2. **Estado local/URL.** `useSearchParams()` se usa solo como lectura (`Search.tsx:41-43`); `query` y `selectedCategory` se inicializan desde `q` y `category` (`Search.tsx:49-52`). Los efectos solo escriben si el parámetro es *truthy* (`Search.tsx:54-60`), por lo que un `q`/`category` eliminado no limpia el estado.
3. **Fetch inicial.** Se ejecutan en paralelo `category.list`, `commerce.list` y `product.getFeatured` mediante `trpcCall` GET + superjson (`useDeliveryData.ts:33-51,75-90,153-159`). No hay `enabled` por término: se descarga todo el catálogo destacado/comercios al entrar.
4. **Normalización.** Ninguna: solo `toLowerCase().includes()` sobre `name` de producto y `name` de comercio (`Search.tsx:62-74`). No hay `trim`, normalización Unicode, eliminación de acentos, tokenización ni búsqueda en descripción/categoría/comercio.
5. **Render.** `isLoading` global de las tres consultas (`Search.tsx:76`). Estado inicial: 6 destacados (`Search.tsx:152-162`). Estado con query/categoría: secciones productos y comercios (`Search.tsx:163-202`). Sin resultados: mensaje genérico (`Search.tsx:191-201`). Sin estado de error.
6. **Tap a producto.** La tarjeta completa navega a `/commerce/:commerceId` (`Search.tsx:217-220`); el botón “+” agrega al carrito local (`Search.tsx:236-253`). No se pasa `unitType`; no hay modal de peso.
7. **Tap a comercio.** Navega a `/commerce/:id` (`Search.tsx:264-267`). `CommerceDetail` hace dos consultas: `commerce.getById` (que ya devuelve `products`) y `product.getByCommerce` (que vuelve a pedir los productos) (`CommerceDetail.tsx:64-65`; `CommerceDetail.tsx:88`).
8. **Checkout posterior.** El carrito bloquea comercios cerrados/inexistentes (`Cart.tsx:77-80,376`), pero eso ocurre después de que `/search` ya permitió agregar. El servidor de órdenes no revalida disponibilidad/estado del comercio (`server/order-router.ts:46-62`, fuera del alcance principal pero relevante aguas abajo).

### 2.4 Contratos API usados por `/search`

| Acción UI | Procedimiento tRPC | Tipo | Input real | SQL/Drizzle | Respuesta usada | Observaciones |
|---|---|---|---|---|---|---|
| Montar chips | `category.list` | `publicQuery` | `{}` | `select * from categories order by sort_order` (`category-router.ts:8-11`) | `id, name, icon, color` | 8 filas; incluye categorías sin comercios |
| Montar comercios | `commerce.list` | `publicQuery` | `{}` | `select * from commerces where status='active'` (`commerce-router.ts:9-12`) | 5 filas; el FE usa `id,name,logo,deliveryTime,rating,isOpen,categoryId` | Devuelve también `email,phone,address,lat,lng,commissionRate,merchantUserId` |
| Montar productos | `product.getFeatured` | `publicQuery` | `{}` | `select ... from products left join commerces where is_featured='yes' and is_available='yes'` (`product-router.ts:30-50`) | 8 filas + `commerceName` | No filtra `commerces.status` ni `isOpen`; sin orden/limit |
| Buscar texto | **No se llama** | — | — | — | — | El filtrado es `Array.filter` local (`Search.tsx:62-74`) |
| Buscar productos | `product.search` (muerto) | `publicQuery` | `{ query: string }` | `like(products.name, '%query%') and is_available='yes'` (`product-router.ts:99-106`) | No usado | Case-sensitive, sin límite, sin `commerceName`, sin estado de comercio |
| Buscar comercios | `commerce.search` (muerto) | `publicQuery` | `{ query: string }` | `like(commerces.name, '%query%') and status='active'` (`commerce-router.ts:40-47`) | No usado | Case-sensitive, sin límite |
| Detalle de comercio | `commerce.getById` | `publicQuery` | `{ id }` | comercio + `products` anidados (`commerce-router.ts:21-29`) | `commerce` | Ignora `status/isOpen`; el array anidado se descarta |
| Productos del detalle | `product.getByCommerce` | `publicQuery` | `{ commerceId }` | `select * from products where commerce_id=$1` (`product-router.ts:23-28`) | `products` | Incluye `isAvailable="no"`; el FE filtra (`CommerceDetail.tsx:88`) |
| Carrito | `useCart` | local | — | `localStorage["cart"]` (`useCart.tsx:27-31,46,57,74`) | `items` | Sin API; `/search` solo agrega localmente |

**Envelope HTTP real:** `GET /api/trpc/<procedimiento>?input=<superjson>` con `credentials: include` (`useDeliveryData.ts:33-40`). Ejemplo: `input={"json":{}}` para las consultas sin argumentos; `input={"json":{"query":"Pan"}}` para `product.search`.

---

## 3. Inventario de archivos

| Archivo | Rol en el flujo | Líneas clave | Estado |
|---|---|---|---|
| `src/pages/customer/Search.tsx` | Pantalla, estado, filtros, tarjetas | 39-300 | Leído completo |
| `src/pages/customer/CommerceDetail.tsx` | Destino de resultados y add-to-cart | 61-447 | Leído completo |
| `src/components/CustomerBottomNav.tsx` | Navegación inferior | 35-108 | Leído completo |
| `src/components/CommerceCartBar.tsx` | Barra de carrito en detalle | 32-85 | Leído completo |
| `src/components/PageTransition.tsx` | Animación de ruta | 19-57 | Leído completo |
| `src/components/SessionGuard.tsx` | Protección de ruta | 11-96 | Leído completo |
| `src/hooks/useDeliveryData.ts` | Cliente tRPC manual y hooks de catálogo | 5-51,75-99,153-176 | Leído completo |
| `src/hooks/useCart.tsx` | Carrito local | 27-113 | Leído completo |
| `src/hooks/useSessionSync.ts` | Sincronización de sesión | 27-42 | Leído completo |
| `src/hooks/useCustomerSession.tsx` | Sesión de cliente en localStorage | 47-127 | Leído completo |
| `src/hooks/useOrderEvents.ts` | SSE de productos/comercios (no usado por Search) | 176-207 | Leído |
| `src/providers/trpc.tsx` | Cliente tRPC y primer QueryClient | 24-72 | Leído completo |
| `src/providers/QueryProvider.tsx` | Segundo QueryClient | 6-27 | Leído completo |
| `server/product-router.ts` | Listado, destacados y búsqueda de productos | 10-106 | Leído completo |
| `server/commerce-router.ts` | Listado, detalle y búsqueda de comercios | 9-47 | Leído completo |
| `server/category-router.ts` | Categorías | 8-20 | Leído completo |
| `server/customer-router.ts` | Auth de cliente y `list` público | 9-124 | Leído completo |
| `server/middleware.ts` | `publicQuery`/`customerQuery` | 10-67 | Leído |
| `db/schema.ts` | `categories`, `commerces`, `products` | 101-153 | Leído completo |
| `db/relations.ts` | Relaciones Drizzle | 12-24 | Leído |
| `src/App.tsx` | Rutas y providers | 85-154 | Leído completo |
| `src/main.tsx` | Providers globales | 11-23 | Leído completo |
| `src/index.css` | Tokens, safe-area, tipografía global | 6-145,209-221 | Leído completo |
| `tailwind.config.js` | Tokens Tailwind | 6-83 | Leído completo |
| `index.html` | Viewport, fuente, registro SW | 5,15-17,41-45 | Leído completo |
| `public/sw.js` | Service worker (excluye API) | 16-57 | Leído |
| `src/pages/customer/Home.tsx` | Duplicación de filtros/tarjetas | 75-106,212-345 | Leído completo |
| `src/pages/customer/components/HomeHeader.tsx` | Entrada al buscador | 123-130 | Leído |
| `src/pages/customer/components/HomeCategories.tsx` | Chips de Home | 60-109 | Leído |
| `src/pages/customer/components/HomeFeaturedCommerces.tsx` | Enlace “Ver más” | 58-64 | Leído |
| `src/lib/imageUtils.ts` | Fallbacks de imagen | 1-11 | Leído completo |
| `db/seed.ts` | Datos reproducibles | 76-218 | Leído |

---

## 4. Comportamiento de búsqueda

| Aspecto | Comportamiento observado | Evidencia | Veredicto |
|---|---|---|---|
| **Debounce** | No hay debounce. Tampoco hay request por tecla: el filtrado es síncrono sobre arrays ya cargados. | `Search.tsx:62-74,95-96` | No es un bug de latencia hoy; sí impide búsqueda real. Si se migra a servidor, hará falta debounce de 200–250 ms. |
| **Cancelación** | No hay búsqueda remota que cancelar. Las 3 consultas iniciales no reciben `AbortSignal` (`queryFn: () => trpcCall(...)`). | `useDeliveryData.ts:76-79,85-88,154-157` | Sin carreras entre búsquedas; sin cancelación al desmontar. |
| **Búsqueda vacía** | Muestra “Productos populares” con 6 de los 8 destacados. | `Search.tsx:152-162`; runtime: 6 botones “Añadir”, faltan Banana split y Helado 1kg | Funciona, pero oculta 2 destacados y no ofrece “ver todo”. |
| **Espacios** | No hay `trim`. Un espacio (`" "`) entra en modo resultados y muestra los 8 productos; dos espacios (`"  "`) no coinciden con nada. `" a "` no encuentra “Panadería” por los extremos. | `Search.tsx:63-64,71-72`; runtime | Bug de normalización. |
| **Mayúsculas** | `toLowerCase()` en ambos lados: `Pan` encuentra `Panadería`; `ALCOHOL`/`alcohol` funcionan en el cliente. | `Search.tsx:64,72`; runtime | Correcto en cliente. |
| **Acentos** | `Panadería` encuentra el comercio; `panaderia` devuelve “Sin resultados”. | `Search.tsx:64`; runtime | Falso negativo típico en español; falta `normalize('NFD')`. |
| **Caracteres especiales `%` / `_`** | En el cliente se buscan literalmente: `%` no devuelve nada. En los endpoints muertos, `%` y `_` son wildcards SQL y devuelven todos los registros. | `Search.tsx:64`; `product-router.ts:104`; `commerce-router.ts:45`; runtime: `product.search?query=%` → 20 filas, `commerce.search?query=%` → 5 filas | No hay SQL injection (Drizzle parametriza), pero sí **wildcard injection** latente y respuestas sin límite. |
| **Límite/paginación** | No hay paginación ni `limit`. `getFeatured` devuelve 8; `commerce.list` devuelve todos los activos. El estado inicial corta a 6 con `slice`, pero los resultados renderizan todo. | `Search.tsx:158,171-173,184-186`; `product-router.ts:30-50`; `commerce-router.ts:9-12` | Aceptable con el seed actual; no escala. |
| **Orden/relevancia** | Sin ranking: orden de inserción de PostgreSQL. Comercios cerrados se mezclan con abiertos. | `product-router.ts:30-50`; `commerce-router.ts:9-12` | No hay coincidencia exacta/prefix/popularidad; resultados arbitrarios. |
| **Duplicados** | No hay duplicados: `key={product.id}`/`key={commerce.id}` son únicos. Un comercio puede aparecer como tarjeta de producto y como tarjeta de comercio, pero son secciones distintas. | `Search.tsx:159,172,185` | Correcto. |
| **Productos vs comercios** | Productos: solo `product.name`. Comercios: solo `commerce.name`. No se busca `commerceName` en productos (Home sí lo hace), ni descripción, categoría o producto dentro de un comercio. | `Search.tsx:63-64` vs `Home.tsx:90-94` | Búsqueda muy superficial; además los productos no vienen de `product.search`. |
| **Filtros/categorías** | Los chips solo filtran comercios. Se muestran todas las categorías, incluso sin comercios activos. | `Search.tsx:62-74,126-142`; `Home.tsx:70-73`; runtime: `Comidas` → 8 productos de varios rubros; `Bebidas` → 8 productos y 0 comercios | **Bug funcional** (ver SRCH-02/SRCH-10). |
| **Historial** | No existe historial ni sugerencias. No hay `localStorage`/`sessionStorage` de términos ni componente de recientes. | Búsqueda global en `src/pages/customer`: 0 referencias a historial/sugerencias | Feature ausente; no figura en `REQUISITOS.md`, por eso P3. |
| **“Sin resultados”** | Solo aparece si `filteredProducts` y `filteredCommerces` están vacíos. Copy genérico; no incluye el término ni ofrece limpiar filtros. | `Search.tsx:191-201`; runtime `Leche`, `panaderia`, `%`, `"  "` | Correcto visualmente, pero engañoso cuando el problema es un falso negativo o un error de red. |
| **Estado inicial** | “Productos populares” con 6 destacados. No hay sección de comercios ni categorías sugeridas. | `Search.tsx:152-162`; runtime | Correcto como MVP; incompleto frente a Home. |
| **Limpiar búsqueda** | La “X” hace `setQuery("")`, pero no toca URL ni categoría. El estado inicial reaparece, pero la URL sigue con `?q=`. | `Search.tsx:101-105`; runtime: URL `?q=Pan` tras limpiar; recarga devuelve `Pan` | Bug de sincronización. |
| **Foco / teclado** | `autoFocus` en el input. No hay `<form>` ni `onKeyDown`; Enter no actualiza URL ni dispara nada. | `Search.tsx:93-100`; runtime: Enter con “Leche” deja URL `/search` | No hay submit; en móvil no se declara `enterKeyHint="search"`. |
| **Accesibilidad** | Input sin label/`role="search"`; resultados sin `aria-live`; chips sin `aria-pressed`; tarjetas no focusables. | `Search.tsx:93-100,116-142,217-219,264-266`; runtime Tab: input → limpiar → chips → nav, sin tarjetas de comercio | Falla para teclado y lector de pantalla. |
| **Carreras / stale closures** | No se detectaron: no hay requests por término ni estado asíncrono local; los filtros se recalculan en cada render desde el estado actual. | `Search.tsx:62-74` | Sin bug de carrera. El problema es de producto/arquitectura, no de concurrencia. |
| **Re-renders** | Cada tecla re-renderiza toda la pantalla y todas las tarjetas; no hay `useMemo` ni memoización de tarjetas. Con 8+5 filas es imperceptible; con catálogo real no. | `Search.tsx:62-74,171-186` | Deuda de performance. |

---

## 5. Hallazgos

> Severidades: **P0** exposición crítica / pérdida de datos; **P1** flujo principal roto o bypass de seguridad; **P2** UX, accesibilidad, rendimiento o contrato relevante; **P3** pulido/deuda menor.

| ID | Severidad | Tipo | Archivo:línea | Descripción | Impacto | Fix recomendado |
|---|---|---|---|---|---|---|
| **SEC-01** | **P0** | Seguridad / Privacidad | `server/customer-router.ts:111-114` | `list: publicQuery` ejecuta `select * from customers` sin auth. Verificado con GET sin cookie: devolvió 2 filas con `id, firstName, lastName, phone, address, createdAt, fcmToken` (valores omitidos). No lo usa `/search`, pero está en un router nuclear. | Cualquier persona con la URL obtiene PII completa de todos los clientes y tokens FCM. Es el hallazgo más grave de la auditoría, aunque sea colateral al render. | Eliminar el endpoint o moverlo a `adminQuery`; devolver solo campos necesarios; nunca `fcmToken`; rate limit/auditoría. Rotar tokens si el endpoint estuvo expuesto. |
| **SRCH-01** | **P1** | Funcional / Backend | `src/pages/customer/Search.tsx:47,70-74,158`; `server/product-router.ts:99-106`; `src/hooks/useDeliveryData.ts:153-159` | `/search` solo usa `product.getFeatured` (8 productos `isFeatured=yes`) y filtra en memoria. `product.search` existe pero no se llama. Runtime: `Leche` → “Sin resultados” (la API devuelve `Leche entera 1L`); `Pan` → solo `Panadería El Horno` (la API devuelve `Pan flauta x2` y `Pan lactal blanco`); `Papa` → solo “Milanesa con papas fritas”, no “Papas fritas grandes”. | La mayoría del catálogo es invisible. El usuario concluye que el producto no existe. Es una falla del core de búsqueda, no un detalle visual. | Implementar búsqueda de servidor unificada (`search.global`) sobre productos y comercios, con `trim`, normalización de acentos, `ILIKE`/trigram, join a comercio, paginación y ranking. Como paso intermedio, llamar `product.search` + `commerce.search` y enriquecer `commerceName`. |
| **SRCH-02** | **P1** | Funcional / Filtros | `src/pages/customer/Search.tsx:62-74,165-176` | `selectedCategory` solo se aplica a `filteredCommerces`; `filteredProducts` no lo usa. Runtime: elegir `Comidas` muestra `PRODUCTOS (8)` con productos de Farmacia y Heladería, y `COMERCIOS (1)` La Esquina del Sabor. `Bebidas` no tiene comercios y aun así muestra 8 productos. | El filtro miente: el usuario cree que ve una categoría y ve todo el catálogo destacado. Categorías sin comercios producen un estado incoherente. | Ocultar la sección de productos cuando hay categoría seleccionada, o filtrar productos por la categoría de su comercio (`commerce.categoryId`) y no por `product.category` (texto libre). Construir chips solo con categorías con comercios activos (como `Home.tsx:70-73`) o mostrar conteo/empty state. |
| **SRCH-03** | **P1** | Lógica de negocio / Backend | `server/product-router.ts:30-50`; `src/pages/customer/Search.tsx:236-253`; `src/pages/customer/CommerceDetail.tsx:88,311-318` | `getFeatured` hace `LEFT JOIN commerces` pero no filtra `commerces.status` ni `isOpen`. Las tarjetas de producto de comercios cerrados/suspendidos/inactivos se muestran, permiten “Añadir” y el detalle permite agregar. El carrito recién bloquea en `Cart.tsx:77-80,376`. (Verificado por código; no se alteró la BD para esta prueba.) | Pedido en dead-end: el usuario arma el carrito y al pagar se le impide continuar. Además se promociona catálogo de comercios suspendidos/inactivos. | Unir `getFeatured` con `eq(commerces.status,'active')` y decidir política para `isOpen`; devolver `commerceStatus/isOpen` a la tarjeta; deshabilitar “Añadir” y mostrar “Cerrado”; revalidar en `order.create`. |
| **SEC-02** | **P1** | Auth / Sesión | `src/components/SessionGuard.tsx:14-21,45-61`; `src/hooks/useSessionSync.ts:27-41`; `src/hooks/useCustomerSession.tsx:59-74` | Para `role="customer"` el guard confía en `localStorage`. Si existe `qs_session` pero no `customer_session`, el efecto programa `setChecking(false)` a los 600 ms y renderiza la ruta. Verificado en navegador: con solo `qs_session` la URL se mantiene `/search` y la pantalla carga completa; sin storage redirige. El `checkAuth` de `useCustomerSession` no limpia el estado si devuelve `customer:null`; una cookie expirada no se detecta. | Bypass de todas las rutas de cliente con un `localStorage` mínimo; sesión expirada aparenta estar activa. Aunque `/search` es catálogo público, el mismo guard protege `/profile`, `/order` y `/cart`. | Para cliente, validar contra servidor (`customer.checkAuth`/refresh) antes de `checking=false`; si `!isAuthenticated`, redirigir; eliminar el timer que falla abierto; limpiar `customer_session`/`qs_session` cuando `checkAuth` devuelva null; escuchar también cambios de `customer_session`. |
| **SRCH-04** | **P2** | Estado / URL | `src/pages/customer/Search.tsx:41-43,49-60,101-105,117,129-132` | La URL es solo de lectura (no se usa el setter de `useSearchParams`). Los efectos solo aplican `q`/`category` si son *truthy*. Runtime: limpiar con “X” deja `?q=Pan`; recargar restaura `Pan`; bottom nav “Buscar” cambia a `/search` pero el input conserva `Pan`; seleccionar categoría no cambia la URL; “Todos” tampoco limpia `?category=`. | Estado no compartible, recargas que resucitan filtros, back/forward que puede sobrescribir lo escrito o no limpiar. | Una sola fuente de verdad en la URL (`q`, `category`) con `setSearchParams(..., { replace: true })`; efecto que aplique también valores vacíos; limpiar ambos al presionar “X”/“Todos”; `navigate` del bottom nav debe resetear o preservar explícitamente. |
| **SRCH-05** | **P2** | Estados UI / Error | `src/pages/customer/Search.tsx:76,148-201`; `src/hooks/useDeliveryData.ts:75-90,153-159`; `public/sw.js:22-30` | No se consume `isError` de ninguna query. Si se abortan las APIs, el estado inicial muestra “Productos populares” vacío sin mensaje; al escribir muestra “Sin resultados” (runtime). Si falla solo `category.list`, desaparecen los chips y queda solo “Todos”, sin aviso. El SW no cachea `/api/`, así que offline no hay fallback de datos. | El usuario no distingue “no hay resultados” de “falló la red/servidor”; no hay retry ni forma de recuperarse salvo recargar. | Renderizar error por sección con `isError`, botón “Reintentar” (`refetch`), banner offline con `navigator.onLine`/`online`/`offline`, y distinguir copys de vacío vs error. Mantener datos previos con `placeholderData`/`keepPreviousData`. |
| **SRCH-06** | **P2** | Performance / Estados UI | `src/pages/customer/Search.tsx:76,148-151` | `isLoading` suma las tres consultas (`categoriesLoading`, `commercesLoading`, `productsLoading`) y bloquea toda la página con un spinner. No hay skeletons ni carga progresiva: si `category.list` tarda, no se ven productos/comercios aunque ya hayan llegado. | TTI y CLS pobres; una consulta lenta degrada todo el catálogo; el cambio de spinner a grid produce salto visual. | Skeletons por sección, `isPending` independiente, header siempre visible; `placeholderData` para cache; considerar `useQueries` con estados separados. |
| **SRCH-07** | **P2** | Consistencia / Caché | `src/pages/customer/Search.tsx:45-47`; `src/providers/QueryProvider.tsx:10-15`; `src/hooks/useOrderEvents.ts:176-207` | `Search` no se suscribe a `useProductEvents` ni `useCommercesEvents` (solo `Home` lo hace). La config efectiva de las queries de catálogo en `/search` es `staleTime: 5 min`, `refetchOnWindowFocus:false` (QueryProvider), y no hay SSE. | Precios, disponibilidad, `isOpen` y productos pueden quedar obsoletos hasta 5 minutos o hasta remount; un comercio que cierra sigue mostrándose abierto. | Suscribir Search a los eventos globales o invalidar al foco; bajar `staleTime` del catálogo a 30–60 s; invalidar `commerce.list`/`product.getFeatured` desde el SSE en la misma caché. |
| **SRCH-08** | **P2** | Perf / Privacidad | `src/hooks/useDeliveryData.ts:84-90`; `server/commerce-router.ts:9-12` | `commerce.list` devuelve `select *`: runtime confirmó 20 campos, incluidos `email`, `phone`, `address`, `lat`, `lng`, `commissionRate` y `merchantUserId`. `product.getFeatured` devuelve 12 campos por producto (incluye `description`, `category`, `isFeatured`, `isAvailable`, `unitType`, `preparationTime`) aunque la tarjeta solo usa `id`, `name`, `price`, `image`, `commerceId` y `commerceName`. Todo viaja al cliente en cada `/search`. | Payload innecesario y filtración de datos internos del negocio (comisión, dueño, coordenadas) a cualquier visitante. Facilita scraping y aumenta tiempo de red/parseo. | Proyección explícita de campos públicos en el servidor (`id,name,logo,coverImage,deliveryTime,rating,minOrder,isOpen,address` si se necesita); DTO público separado del modelo interno; nunca enviar `commissionRate`/`userId`. |
| **SRCH-09** | **P2** | Escalabilidad / Orden | `src/pages/customer/Search.tsx:158,171-173,184-186`; `server/product-router.ts:30-50`; `server/commerce-router.ts:9-12` | Sin `limit`, paginación, `orderBy` ni ranking. El estado inicial corta a 6, pero los resultados renderizan todos los elementos. No hay prioridad para abiertos, coincidencia exacta, prefijo o popularidad. | Con catálogo real, la primera carga y el DOM crecen sin control; resultados irrelevantes o cerrados primero. | Backend: `limit`/`offset` o cursor, ranking (`exact > prefix > trigram > popularity`), `isOpen desc`; Frontend: “cargar más” o virtualización; cachear páginas. |
| **SRCH-10** | **P2** | UX / Categorías | `src/pages/customer/Search.tsx:126-142`; `src/pages/customer/Home.tsx:70-73` | Se muestran las 8 categorías de `category.list`, incluidas `Bebidas`, `Mascotas` y `Otros` sin comercios activos. Home ya filtra por IDs presentes (`activeCategories`). Al elegir una categoría vacía, siguen apareciendo todos los productos y no hay mensaje de “sin comercios”. | Chips muertos que llevan a un estado incoherente; inconsistencia directa con Home. | Reutilizar `activeCategories` o calcular conteos; si una categoría no tiene comercios, ocultarla o mostrar “Próximamente”; aplicar el filtro también a productos. |
| **SRCH-11** | **P2** | Accesibilidad / Teclado | `src/pages/customer/Search.tsx:217-219,264-266` | Las tarjetas de resultado son `<div onClick>` sin `role`, `tabIndex` ni `onKeyDown`. Runtime: `role=null`, `tabindex=null`; al tabular desde el input se pasa por “Limpiar”, chips y bottom nav; las tarjetas de comercio no reciben foco. Los botones “Añadir” sí son focusables, pero no abren el comercio. | Un usuario de teclado/switch no puede abrir ningún comercio desde los resultados; un lector de pantalla no anuncia la tarjeta como enlace. | Usar `<Link to={...}>` o `<button>` para la tarjeta; si se necesita el “+”, separarlo fuera del enlace o usar un `div` con `role="link"`, `tabIndex=0`, Enter/Espacio y `aria-label`. |
| **SRCH-12** | **P2** | Accesibilidad / Semántica | `src/pages/customer/Search.tsx:93-100,116-142,165-201` | El input es `type="text"`, sin `<label>`, `aria-label`, `role="search"`, `aria-controls`, `enterKeyHint` ni `<form>`. Los resultados no tienen `aria-live`; los chips no tienen `aria-pressed`; el spinner no tiene `role="status"`/texto. Enter no envía nada (runtime). | Lectores de pantalla no anuncian el propósito, el estado ni los resultados; usuarios móviles no tienen tecla “Buscar”; el estado de filtro no es perceptible. | `<form role="search">` con label `sr-only`, `type="search"`, `enterKeyHint="search"`; `aria-live="polite"` en conteo/estado; `aria-pressed` en chips; `role="status"` + `sr-only` en loading/empty. |
| **SRCH-13** | **P2** | Accesibilidad / Táctil | `src/pages/customer/Search.tsx:84-90,102-109,116-141,236-253` | Targets medidos: back 36×36, clear 20×20, chip 29 px de alto, “+” 28×28 (clase `w-7 h-7`; `sm` 32). El bottom nav sí cumple (49 px). | Errores de toque y dificultad para personas con motricidad fina; incumple la recomendación de 44×44. | Aumentar el área interactiva con padding o pseudo-elemento a ≥44×44 sin agrandar necesariamente el icono; separar “+” del área de la tarjeta. |
| **SRCH-14** | **P2** | Accesibilidad / Contraste | `src/pages/customer/Search.tsx:99,227,235,249,284` | Contraste calculado: `#FF6A00` sobre blanco = **2,87:1** (precio y texto blanco sobre naranja), `#A1A1AA` (zinc-400) sobre blanco = **2,56:1** (nombre de comercio/placeholder), `#FFC107` sobre blanco = **1,63:1** (estrella). Runtime: placeholder `rgb(161,161,170)`. | Falla WCAG AA (4,5:1 texto normal / 3:1 no textual); precios y labels clave son difíciles de leer en exteriores o baja visión. | Usar un naranja más oscuro para texto sobre claro (p. ej. `#C2410C`/`#B45309`), `zinc-600/700` para labels, y estrella con outline/contraste; validar con axe/Lighthouse. |
| **SRCH-15** | **P2** | Accesibilidad / Viewport | `index.html:5` | `maximum-scale=1.0, user-scalable=no` impide el zoom por pellizco en toda la app, incluida `/search`. | Incumple WCAG 1.4.4; afecta a usuarios con baja visión. | Quitar `maximum-scale` y `user-scalable=no`; si se temía el zoom automático de iOS, el CSS ya fuerza 16 px en inputs (`index.css:120-125`). |
| **SRCH-16** | **P2** | Correctitud / Carrito | `src/pages/customer/Search.tsx:240-247`; `src/pages/customer/Home.tsx:232-239`; `src/pages/customer/CommerceDetail.tsx:97-116`; `src/hooks/useCart.tsx:3-12` | `addItem` desde Search/Home no envía `unitType`. Para un producto `unitType="kg"` se agrega cantidad 1 sin modal de peso; el carrito lo trata como unidad (`Cart.tsx:264-298`), aunque el precio sea por kg. `CommerceDetail` sí tiene modal. | **Latente**: el seed actual no tiene productos kg, pero el modelo lo permite. Si se activa, el usuario compra “1” sin saber si es 1 kg y el carrito no muestra “kg”. | Reutilizar el modal de `CommerceDetail` o pedir peso/importe antes de `addItem`; pasar `unitType` y validar en servidor. |
| **SRCH-17** | **P2** | Performance / Contrato | `src/pages/customer/CommerceDetail.tsx:64-65`; `server/commerce-router.ts:21-29`; `src/hooks/useDeliveryData.ts:92-99,169-176` | `useCommerce` llama `commerce.getById`, que devuelve `commerce + products[]`; el componente ignora `commerce.products` y `useProductsByCommerce` vuelve a pedir los mismos productos. Runtime: dos requests, `nestedProducts=4` descartados. | Payload y latencia duplicados; el detalle tarda más y gasta datos. | Elegir un contrato: o `getById` devuelve solo comercio y se mantiene `getByCommerce`, o se usa `commerce.products` y se elimina la segunda query. |
| **SRCH-18** | **P2** | Arquitectura / Caché | `src/main.tsx:14-20`; `src/App.tsx:147`; `src/providers/trpc.tsx:24-47`; `src/providers/QueryProvider.tsx:6-19` | Hay dos `QueryClientProvider` anidados y dos configuraciones: `TRPCProvider` (staleTime 30 s, gc 10 min, retry false) y `QueryProvider` (5 min, 30 min, retry 1). Los hooks de `useDeliveryData` usan el más interno (`QueryProvider`), dejando la config de `trpc.tsx` muerta para el catálogo. | Comportamiento de caché impredecible, invalidaciones que pueden apuntar a cachés distintas, duplicación de memoria y confusión al depurar. | Un solo `QueryClient` en `main.tsx`; eliminar `QueryProvider` o la config duplicada de `trpc.tsx`; documentar `staleTime` por tipo de dato. |
| **SRCH-19** | **P2** | Backend / Deuda | `server/product-router.ts:99-106`; `server/commerce-router.ts:40-47`; `db/schema.ts:101-153` | Los endpoints de búsqueda no se usan. Si se usaran tal cual: `LIKE` es case-sensitive (`ALCOHOL` → 0), no escapan `%`/`_` (runtime: `%` → 20 productos y 5 comercios), no tienen `limit` ni paginación, no filtran estado de comercio en productos y no hay índices/trigram. | Latente: resultados incorrectos, respuestas ilimitadas y secuencias full scan; código muerto que confunde el contrato. | Implementar `search` real con `ILIKE` + `unaccent` + `pg_trgm` (GIN), escape de wildcards, `limit`/cursor, join a comercio y ranking; o borrar los endpoints hasta implementarlos. |
| **SRCH-20** | **P2** | Design system | `src/pages/customer/Search.tsx` (varias líneas: 81,99,120,150,218,235,249); `src/index.css:20-49`; `tailwind.config.js:13-19,52-58` | La pantalla hardcodea `#FF6A00`, `#0E0E12`, `#F7F7FA`, radios y sombras. Los tokens `--primary`/`--ring` son verdes (`122 39% 33%`) y `--radius` no refleja los `rounded-2xl/3xl/full` usados. | Deriva visual: componentes shadcn (`bg-primary`, `ring`) quedan verdes; cambiar la marca exige tocar decenas de strings. | Definir tokens `brand.orange`, `brand.velvet`, `brand.canvas`, radios y sombras en Tailwind/CSS vars; reemplazar hardcodes en Search, nav, cards y Home. |
| **SRCH-21** | **P2** | Funcional / Matching | `src/pages/customer/Search.tsx:62-74` | `.toLowerCase().includes()` sin `trim`, sin normalización de acentos y solo sobre `name`. Runtime: `panaderia` falla, `Panadería` funciona; `" "` devuelve 8 productos, `"  "` devuelve 0; `%` literal no encuentra nada. | Falsos negativos frecuentes en español y comportamientos extraños con espacios; la búsqueda se siente “rota” incluso cuando el dato existe en otra forma. | `normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase()`, dividir en tokens y buscar en `name + commerceName + category + description`; si es servidor, misma normalización en SQL. |
| **SRCH-22** | **P3** | UX / Inicial | `src/pages/customer/Search.tsx:158` | El estado inicial hace `.slice(0, 6)` sobre 8 destacados. Runtime: 6 botones “Añadir”; Banana split y Helado 1kg no aparecen. No hay “Ver todo”. | Dos productos destacados quedan inalcanzables salvo que el usuario escriba algo. | Mostrar los 8 o agregar “Ver todo”/scroll horizontal; alinear con Home, que sí muestra 8 (`Home.tsx:164`). |
| **SRCH-23** | **P3** | Producto / Historial | `src/pages/customer/Search.tsx` (sin implementación) | No hay historial de búsquedas, recientes ni sugerencias. No hay claves en `localStorage`/`sessionStorage`. | Repetición de búsquedas y menos descubrimiento; no hay personalización. No figura en `REQUISITOS.md`, por eso no es P1/P2. | Agregar “Recientes” con límite (p. ej. 5), borrado individual/total y aviso de privacidad; opcional sugerencias desde categorías/productos. |
| **SRCH-24** | **P3** | UX / Empty state | `src/pages/customer/Search.tsx:191-201` | Copy genérico, no incluye el término buscado ni ofrece “Limpiar filtros”/“Ver todo”. No tiene `role="status"` ni `aria-live`. | Usuario en dead-end; especialmente si combinó query + categoría. | Incluir término/categoría, botón “Limpiar búsqueda” y “Ver categorías”; anunciar con `aria-live`. |
| **SRCH-25** | **P3** | Performance / Imágenes | `src/pages/customer/Search.tsx:221-224,268-275`; `src/lib/imageUtils.ts:7-10` | Las imágenes de producto son `background-image` CSS: no hay `loading="lazy"`, `alt`, `srcset` ni `onError`; una URL rota deja un bloque gris. El logo de comercio usa `<img>` con `onError`, pero sin `loading="lazy"` ni dimensiones explícitas. | Peso inicial y datos; imágenes rotas silenciosas; sin información accesible de imagen (aunque el nombre está en texto). | Usar `<img loading="lazy" decoding="async" width height alt="">` con fallback; o un componente `ProductImage` que maneje error; CDN con resize. |
| **SRCH-26** | **P3** | Accesibilidad / Movimiento | `src/pages/customer/Search.tsx:79,98`; `src/components/PageTransition.tsx:19-37`; `src/index.css:6-12` | `autoFocus` abre teclado al entrar; `select-none` global impide seleccionar texto; no hay `prefers-reduced-motion` para la transición de 120 ms ni para `animate-spin`; no hay `focus-visible` explícito en tarjetas (no focusables). | Teclado tapando resultados en móvil; usuarios sensibles al movimiento no pueden reducirlo; selección de texto limitada. | Respetar `useReducedMotion` y media query; quitar `autoFocus` o activarlo solo en desktop; limitar `select-none` a controles, no a todo el contenedor. |
| **SRCH-27** | **P3** | Consistencia visual | `src/pages/customer/Search.tsx:79,81,218,265`; `src/pages/customer/Home.tsx:159,187,259`; `src/App.tsx:61`; `src/index.css:7` | Search usa `rounded-2xl` para comercios, Home `rounded-3xl`; spinner de página completa vs skeletons de Home; Search muestra 6 destacados vs 8 de Home; conviven `#0E0E12`, `#0A0A0D` y `#121212` como “fondo oscuro”. | La ruta se siente de otro módulo y la marca pierde consistencia. | Tokens y componentes compartidos (`ProductCard`, `CommerceCard`, `EmptyState`, `Skeleton`); unificar radios, sombras, fondos y patrón de carga. |
| **SRCH-28** | **P3** | UX / Destino | `src/pages/customer/CommerceDetail.tsx:47-55`; `db/seed.ts:103,122,141,160,179` | `formatHours` mapea `mon-thu`, `fri-sat`, `sun`, `all`, pero el seed usa `mon-fri`, `mon-sat`, `mon-sun`; el detalle muestra las claves crudas (`mon-fri: 11:00-23:00`) en vez de “Lun-Vie”. | Horarios menos legibles justo en el destino de la búsqueda. | Normalizar claves o guardar `openHours` estructurado (`[{days:[1,2,3,4,5],from,to}]`); formatear con `Intl`. |
| **SRCH-29** | **P3** | Robustez / URL | `src/pages/customer/Search.tsx:50-52,54-56` | `parseInt(categoryId, 10)` sin validar: `?category=abc` → `NaN` (no hay chip activo y se comporta como “Todos”); `?category=0` → 0 (falsy, también “Todos”); `?category=999` → filtro sin comercios pero productos visibles. | Deep links inválidos producen estados silenciosamente incorrectos. | Validar contra la lista de categorías; si no existe, `null` y limpiar URL; usar `Number.isFinite`. |
| **SRCH-30** | **P3** | Visual / Hipótesis | `index.html:15-17`; `server/boot.ts:28` | La CSP de producción declara `style-src 'self' 'unsafe-inline'` y `font-src 'self' data:` sin `fonts.googleapis.com`/`fonts.gstatic.com`, pero `index.html` carga Outfit desde Google Fonts. En dev no se observó CSP y la fuente cargó; **en producción probablemente se bloquee** y caiga al fallback del sistema. | Tipografía distinta a la diseñada; no rompe la funcionalidad. | Self-hostear Outfit o agregar los dominios a `style-src`/`font-src`; verificar con build de producción y `document.fonts`. |
| **SRCH-31** | **P3** | Navegación / Contexto | `src/pages/customer/Search.tsx:84-90`; `src/pages/customer/CommerceDetail.tsx:175-181` | El botón volver de Search va siempre a `/home`; el de CommerceDetail también. Si el usuario llegó desde `?q=Pan`, pierde la búsqueda y los filtros. | Fricción en el flujo explorar → detalle → volver. | Usar `navigate(-1)` con fallback a `/home`, o pasar `location.state.from`/`returnTo` y restaurar query/categoría (idealmente ya en URL, ver SRCH-04). |

---

## 6. Inconsistencias visuales

1. **Paleta sin tokens.** `#FF6A00`, `#0E0E12` y `#F7F7FA` se repiten inline en `Search.tsx`, `CustomerBottomNav.tsx`, `CommerceCartBar.tsx`, `CommerceDetail.tsx` y `Home.tsx`. El token `--primary` sigue siendo verde (`index.css:27,39`; `tailwind.config.js:13-19`), por lo que cualquier componente basado en `bg-primary`/`ring` se ve fuera de marca.
2. **Tres “negros” distintos.** `#0E0E12` (header/nav), `#0A0A0D` (fallback de App, `App.tsx:61`) y `#121212` (html/body, `index.html:2,38`; `index.css:7`). En una misma transición pueden verse los tres.
3. **Radios dispares.** Search: tarjetas `rounded-2xl`, botón “+” `rounded-xl`, chips `rounded-full`, nav `rounded-3xl`. Home: tarjetas de comercio `rounded-3xl`. El token `--radius` no se usa en Search.
4. **Loading distinto.** Search usa un spinner de página completa (`Search.tsx:148-151`); Home usa skeletons (`Home.tsx:156-161,184-189`). Esto cambia el ritmo percibido entre pestañas.
5. **Estado inicial distinto.** Search muestra 6 destacados; Home muestra 8 (`Home.tsx:164`). Search no tiene “Ver todo” ni carrusel.
6. **Chips de categoría distintos.** Search: fondo oscuro translúcido, alto ~29 px, texto 12 px. Home: fondo blanco, `py-2`, alto ~32 px, icono + texto (`HomeCategories.tsx:93-97`). Search además muestra categorías vacías; Home no.
7. **Jerarquía tipográfica.** Search usa `text-sm font-bold uppercase` para secciones (`Search.tsx:167,180`), Home usa `text-base/lg font-black` (`Home.tsx:144,175`). En Search los nombres de comercio usan `text-[10px]` zinc-400 (contraste 2,56:1) y en Home `text-sm font-bold` zinc-900.
8. **Input más grande de lo diseñado en móvil.** La clase `text-xs sm:text-sm` (`Search.tsx:99`) queda sobrescrita por `input { font-size: 16px !important; }` (`index.css:120-125`). En móvil el texto es 16 px (runtime), no 12/14; evita el zoom de iOS pero rompe la escala visual prevista.
9. **Contraste.** Naranja sobre blanco (2,87:1), zinc-400 sobre blanco (2,56:1) y estrella amarilla sobre blanco (1,63:1). Los precios y labels clave no pasan AA.
10. **Áreas táctiles.** Back 36×36, clear 20×20, chip 29 px, “+” 28×28. El bottom nav (49 px) y la tarjeta completa sí son cómodos; el problema son los controles pequeños.
11. **Imágenes.** Producto con `background-image` (sin `alt`, sin lazy, sin fallback visible) vs logo de comercio con `<img>` y `onError`. En la misma pantalla conviven dos estrategias.
12. **Empty states.** Search: icono + “Sin resultados” genérico, `py-20` (`Search.tsx:191-201`). Home: tarjeta blanca `rounded-3xl`, copy específico y `py-12` (`Home.tsx:190-195`). No comparten componente.
13. **Scroll horizontal.** Los chips usan `overflow-x-auto no-scrollbar` (`Search.tsx:115`) sin gradiente/indicador; en 320 px el último chip queda cortado sin pista visual. No hay scroll horizontal de página: verificado `scrollWidth === innerWidth` en 320/375/390/430.
14. **Header/safe-area.** Verificado: header mide 117-119 px y el contenido usa `pt-[env(safe-area-inset-top)+118px]`; no hay solape visible en 320-430. El bottom nav mide 63 px y a máximo scroll deja 77 px libres sobre la última tarjeta (390×844). **Pasa** en esas condiciones; falta probar teclado abierto y iOS real.
15. **Z-index.** Header `z-40`, nav `z-50`, modal de compra `z-[120]` (`CommerceDetail.tsx:332`). No se detectó conflicto en Search.

---

## 7. Fluidez y performance

### 7.1 Quick wins (bajo costo, impacto alto)

| Quick win | Impacto | Evidencia |
|---|---|---|
| Sincronizar `q`/`category` con `setSearchParams` y limpiar URL al borrar | Elimina recargas fantasma y hace la búsqueda compartible | `Search.tsx:41-60,101-105` |
| Ocultar productos cuando hay categoría o filtrarlos por `commerce.categoryId` | Corrige un filtro que hoy miente | `Search.tsx:62-74,165-176` |
| Reutilizar `activeCategories` de Home para los chips | Menos chips muertos y consistencia entre pestañas | `Home.tsx:70-73` |
| Filtrar `getFeatured` por `commerces.status='active'` y devolver `isOpen` | Evita agregar productos no vendibles | `product-router.ts:30-50` |
| Mostrar error/retry/offline por sección | Convierte fallos silenciosos en estados accionables | `Search.tsx:76,148-201` |
| `useMemo` + normalización (trim/NFD) de los filtros | Menos falsos negativos y menos trabajo por tecla | `Search.tsx:62-74` |
| Tarjetas como `<Link>` y `aria-label`/`aria-pressed`/`aria-live` | Accesibilidad básica | `Search.tsx:93-100,217-266` |
| Subir targets a 44×44 con padding | Cumple guía táctil sin cambiar el diseño | `Search.tsx:84-109,236-253` |
| Cargar 8 destacados o agregar “Ver todo” | Recupera 2 productos ocultos | `Search.tsx:158` |
| `<img loading="lazy" decoding="async">` + fallback | Menos bytes y menos imágenes rotas | `Search.tsx:221-224,268-275` |

### 7.2 Cambios profundos (mayor costo, mayor retorno)

1. **Búsqueda de servidor unificada.** Un procedimiento `search.global` que consulte productos y comercios con `unaccent` + `pg_trgm`, devuelva `commerceName`, `isOpen`, `status`, rankee por exactitud/prefijo/similitud/popularidad y pagine. El frontend debe usar `useQuery` con `queryKey: ['search', term, category, page]`, `enabled: term.trim().length >= 2`, debounce 200–250 ms y `AbortSignal` (hoy `trpcCall` no lo recibe, `useDeliveryData.ts:33-51`).
2. **Índices y modelo.** `CREATE EXTENSION pg_trgm; CREATE INDEX ... USING gin (name gin_trgm_ops);` para `products.name` y `commerces.name`; índices B-tree en `commerces.status`, `commerces.category_id`, `products.commerce_id`, `products.is_featured/is_available`. Hoy el schema no declara ningún índice (`db/schema.ts:101-153`) y `LIKE '%x%'` no puede usar un B-tree.
3. **Una sola caché.** Eliminar el `QueryClientProvider` duplicado (`App.tsx:147` vs `providers/trpc.tsx:24-47`); definir `staleTime` por recurso y usar el cliente tRPC generado con `httpBatchLink` para agrupar las tres consultas de montaje en un solo request. Hoy son 3 GET separados (verificado).
4. **DTOs públicos.** `commerce.list` no debe devolver `commissionRate`, `merchantUserId`, `lat/lng`, `email` ni `phone` si la UI no los usa. `product.getFeatured` no debe devolver campos internos. Esto reduce payload y superficie de scraping.
5. **Carga progresiva y skeletons.** Header siempre interactivo; cada sección con su skeleton; `placeholderData` para volver a Search sin parpadeo; `content-visibility: auto` o virtualización si el catálogo crece.
6. **Imágenes y CDN.** Convertir las imágenes de producto a `<img>` con `srcset`, CDN/resize y fallback; las URLs actuales de Unsplash/Wikimedia traen tamaños fijos y algunas son pesadas.
7. **SSE o invalidación por foco.** Search debería reaccionar a `products:global`/`commerces` o, como mínimo, invalidar al recuperar foco; hoy `refetchOnWindowFocus:false` + `staleTime:5min` dejan el catálogo congelado.
8. **Prefetch del destino.** `CommerceDetail` es lazy (`App.tsx:19`); al hacer `pointerdown`/hover sobre una tarjeta se puede precargar el chunk y las queries (`commerce.getById`, `product.getByCommerce`) para evitar el flash de `LoadingFallback` (`App.tsx:59-65`).

### 7.3 Lo que ya está bien

- Las tres consultas iniciales se lanzan en paralelo, no en cascada.
- No hay request por tecla ni carreras de respuestas; el filtrado local es inmediato.
- Las claves de React Query (`category.list`, `commerce.list`, `product.getFeatured`) permiten reutilizar caché al volver desde Home dentro del `staleTime`.
- `key` de productos/comercios/categorías es estable y único.
- El bottom nav respeta safe-area y no tapa la última tarjeta a máximo scroll en 390×844 (77 px de margen).
- No hay overflow horizontal de página en 320/375/390/430.

---

## 8. Duplicados y deuda técnica

| Duplicado / deuda | Evidencia | Riesgo |
|---|---|---|
| Filtrado de catálogo duplicado Home/Search, con reglas distintas | `Home.tsx:75-95` vs `Search.tsx:62-74` | Home busca también `commerceName` en productos; Search no. Misma pregunta, dos respuestas. |
| Tarjetas de producto duplicadas | `Home.tsx:212-250` vs `Search.tsx:212-258` | Dos implementaciones de imagen, precio, “+” y accesibilidad; un fix hay que hacerlo dos veces. |
| Tarjetas de comercio con variantes | `Home.tsx:252-345` vs `Search.tsx:260-300` | Radios, portada, minOrder y badges distintos; no comparten componente. |
| Empty states duplicados | `Home.tsx:190-195` vs `Search.tsx:191-201` | Copy/estilo inconsistentes. |
| Cliente tRPC manual + cliente tRPC React | `useDeliveryData.ts:33-72` + `providers/trpc.tsx:49-62` | Dos formas de serializar/autenticar/errores; `handleAuthError` está duplicado en ambos (`useDeliveryData.ts:11-31`, `trpc.tsx:10-22`). |
| Dos `QueryClient` | `trpc.tsx:24-47` + `QueryProvider.tsx:6-19` + `App.tsx:147` | Configuración contradictoria; caché duplicada. |
| Endpoints de búsqueda muertos | `product-router.ts:99-106`; `commerce-router.ts:40-47` | No tienen callers; al activarlos, su contrato es deficiente (case-sensitive, sin límite, sin join). |
| `commerce.getById` devuelve productos que nadie usa | `commerce-router.ts:21-29`; `CommerceDetail.tsx:64-65` | Duplica payload y consultas. |
| Formatos de precio dispersos | `Search.tsx:235` (`${product.price}`), `Cart.tsx:280` (`toFixed(2)`), `CommerceCartBar.tsx:71` (`toFixed(2)`) | `$6.5` vs `$6.50`; inconsistencia de moneda/locale. |
| Tokens de tema obsoletos | `index.css:20-49` (primary/ring verdes), `progress-fill` verde (`index.css:183-185`), `bottom-nav-item.active` verde (`index.css:201-207`) | Componentes shadcn y estilos heredados se ven fuera de la identidad naranja. |
| `PageTransition` con `exit` que probablemente nunca corre | `PageTransition.tsx:28-31`; `App.tsx:89-90` (`AnimatePresence` alrededor de `<Routes>`, no de un `motion`) | La variante `out` es dead code o produce animaciones inconsistentes; verificar en runtime. |
| `CommerceCartBar` con `AnimatePresence` mal ubicado | `CommerceCartBar.tsx:44-47` (return null antes del `AnimatePresence`) | La animación de salida no puede ejecutarse; el componente desaparece de golpe. Fuera de Search, pero es UI compartida. |
| `QueryProvider` con devtools en producción | `QueryProvider.tsx:24` | Peso y UI de debug en builds; oculto en móvil por CSS (`index.css:274-279`), visible en desktop. |

---

## 9. Accesibilidad (resumen operativo)

- **Teclado:** el input y los chips son focusables; las tarjetas de resultado **no**. Un usuario de teclado puede agregar un producto con “+” pero no abrir el comercio. Las tarjetas de comercio no tienen ningún hijo focusable: son inalcanzables.
- **Lector de pantalla:** no hay label para el buscador, ni `role="search"`, ni `aria-live` para el conteo/“Sin resultados”, ni `aria-pressed` para el chip activo, ni `alt` en la imagen de producto (es CSS background).
- **Foco:** `autoFocus` abre el teclado al entrar; no hay manejo de foco al limpiar, cambiar de categoría o recibir resultados.
- **Contraste:** 2,87:1 naranja/blanco; 2,56:1 zinc-400/blanco; 1,63:1 estrella/blanco. No cumple AA.
- **Táctil:** 20/28/29/36 px para clear, “+”, chips y back; el mínimo recomendado es 44×44.
- **Zoom:** `user-scalable=no` y `maximum-scale=1` bloquean el pellizco en toda la app.
- **Movimiento:** sin `prefers-reduced-motion`; `PageTransition` 120 ms y spinner infinito.
- **Semántica:** no hay `<main>` ni `<h1>` en Search (el header solo contiene input/chips); las secciones usan `h2/h3`, pero la página no tiene encabezado principal.

---

## 10. Seguridad y privacidad

- **P0 colateral:** `customer.list` público con PII y `fcmToken` (ver SEC-01). Es el único P0 real detectado en los routers nucleares; no lo consume `/search`.
- **Exposición de datos de comercio:** `commerce.list` entrega `commissionRate`, `merchantUserId`, coordenadas, email y teléfono a cualquier visitante (SRCH-08). No es PII de cliente, pero es información comercial interna.
- **Bypass de guard:** `SessionGuard` para customer se apoya en `localStorage` y falla abierto a los 600 ms (SEC-02). El catálogo de `/search` es público por contrato, pero el mismo guard protege `/profile`, `/cart` y `/order`.
- **Sesión expirada:** `useCustomerSession` hidrata desde `localStorage` y su `checkAuth` no limpia si el servidor devuelve `customer:null` (`useCustomerSession.tsx:47-74`). Una cookie vencida no redirige; el usuario sigue viendo la UI “autenticada”. El checkout posterior puede fallar.
- **Búsqueda sin fuga de término:** como el filtrado es 100% cliente, el texto buscado **no se envía al servidor** ni se registra. Es un punto positivo de privacidad, aunque es consecuencia de no tener búsqueda real.
- **Sin SQL injection en el flujo actual:** no hay SQL construido con el texto del usuario en `/search`; Drizzle parametriza `like` en los endpoints muertos. Sí hay **wildcard injection** (`%`/`_`) y respuestas sin límite si se activan (SRCH-19).
- **Sin XSS en Search:** el término no se interpola en HTML; React escaparía cualquier texto. No se encontró `dangerouslySetInnerHTML` en la ruta.
- **Rate limiting/abuso:** los endpoints públicos de catálogo no tienen rate limit visible en `server/boot.ts`; `commerce.list`/`product.getFeatured` pueden usarse para scraping masivo. Considerar límites y caché CDN si el catálogo es público.
- **Datos en `localStorage`:** `qs_session` y `customer_session` son manipulables; no deben ser la única fuente de autorización. El carrito también se persiste sin validación (`useCart.tsx:27-31`), pero el servidor recalcula precios (`order-router.ts:47-60`), lo que mitiga la manipulación de precio.
- **Aguas abajo (no auditado a fondo):** `order.create` solo verifica que el producto exista; no valida `isAvailable`, `status/isOpen` del comercio ni que `product.commerceId === item.commerceId` (`order-router.ts:46-62`). El bloqueo del carrito es cliente; una llamada directa a la API podría ordenar productos no disponibles. Recomendación: revalidar en servidor y derivar `commerceId` del producto.

---

## 11. Plan de verificación reproducible

### 11.1 Preparación

1. `npm run dev` (Vite + Hono en `http://localhost:3000`).
2. BD local con `npm run db:seed` (destructivo; solo local) para tener 5 comercios, 8 categorías, 20 productos y 8 destacados.
3. Para entrar sin credenciales reales en local: abrir `/customer-login`, ejecutar en consola:
   ```js
   localStorage.setItem("qs_session", JSON.stringify({role:"customer",ts:1}));
   ```
   Navegar a `/search`. (Esto también demuestra SEC-02: no hay `customer_session` y aun así entra.)
4. Viewport 390×844; repetir en 320×568 y 430×932. Desactivar caché del navegador.

### 11.2 Casos manuales/automatizados

| ID | Pasos | Resultado esperado | Resultado observado (2026-11-13, local) |
|---|---|---|---|
| V01 | Borrar `localStorage` y abrir `/search` | Redirigir a `/customer-login` | **Pasa** |
| V02 | Dejar solo `qs_session` (sin `customer_session`) y abrir `/search` | Redirigir o bloquear | **Falla**: a los ~600 ms renderiza `/search` (SEC-02) |
| V03 | Abrir `/search`, contar tarjetas iniciales | 8 destacados o “Ver todo” | **Falla parcial**: 6; faltan Banana split y Helado 1kg (SRCH-22) |
| V04 | Buscar `Leche` | Mostrar “Leche entera 1L” | **Falla**: “Sin resultados” (SRCH-01) |
| V05 | Buscar `Pan` | 2 productos (`Pan flauta x2`, `Pan lactal blanco`) + comercio | **Falla**: solo `Panadería El Horno` (SRCH-01) |
| V06 | Buscar `Papa` | “Papas fritas grandes” y “Milanesa con papas fritas” | **Falla parcial**: solo Milanesa (SRCH-01) |
| V07 | Buscar `panaderia` y luego `Panadería` | Ambos deberían encontrar el comercio | **Falla**: sin acento no encuentra; con acento sí (SRCH-21) |
| V08 | Escribir un espacio `" "`, luego dos `"  "` | Tratar como vacío/trim | **Falla**: un espacio muestra 8 productos; dos, “Sin resultados” (SRCH-21) |
| V09 | Escribir `%` y `_` | Búsqueda literal o mensaje claro | **Pasa** en cliente: literal, sin resultados; **latente** en endpoints (SRCH-19) |
| V10 | Seleccionar `Comidas` | Solo comercios/productos de Comidas | **Falla**: `PRODUCTOS (8)` de Farmacia/Heladería + 1 comercio (SRCH-02) |
| V11 | Seleccionar `Bebidas` (sin comercios) | 0 comercios y aviso; productos filtrados | **Falla**: 8 productos y ningún aviso (SRCH-02/SRCH-10) |
| V12 | `?q=Pan` → limpiar con “X” → recargar | URL sin `q`; input vacío tras recarga | **Falla**: URL sigue `?q=Pan`; recarga restaura Pan (SRCH-04) |
| V13 | `?q=Pan` → bottom nav “Buscar” | Input vacío o búsqueda preservada explícitamente | **Falla**: URL `/search` pero input sigue `Pan` (SRCH-04) |
| V14 | Elegir categoría → mirar URL | URL con `?category=<id>` | **Falla**: URL no cambia (SRCH-04) |
| V15 | Escribir `Leche` y presionar Enter | URL con `q=Leche` o submit visible | **Falla**: no cambia URL; no hay form (SRCH-12) |
| V16 | Tab desde el input en resultados | Foco en tarjetas de comercio/producto | **Falla**: salta a chips/nav/botones “+”, nunca a la tarjeta (SRCH-11) |
| V17 | Bloquear `/api/trpc/*` en DevTools y abrir `/search` | Estado de error con retry | **Falla**: “Productos populares” vacío; al escribir, “Sin resultados” (SRCH-05) |
| V18 | Bloquear solo `category.list` | Chips con error/retry, resto usable | **Falla**: solo “Todos”, sin aviso; productos siguen (SRCH-05) |
| V19 | Comercio con `isOpen='closed'` o `status='inactive'` (SQL local) y buscar su producto | Producto no comprable o badge/disabled | **Falla por código**: `getFeatured` no filtra; “+” activo; detalle permite agregar (SRCH-03). No se modificó la BD en esta auditoría. |
| V20 | Producto `unitType='kg'` (crear en BD local) y agregarlo desde Search | Modal kg/importe o cantidad en kg | **Falla latente**: `addItem` sin `unitType`, cantidad 1 (SRCH-16). Seed actual no tiene kg. |
| V21 | 320/375/390/430 px: `scrollWidth` vs `innerWidth` | Sin scroll horizontal | **Pasa**: iguales en los 4 anchos |
| V22 | 390×844, scroll a máximo: última tarjeta vs bottom nav | Última tarjeta visible por encima del nav | **Pasa**: 77 px de margen |
| V23 | Medir targets de back/clear/chip/+ | ≥44×44 | **Falla**: 36/20/29/28 px (SRCH-13) |
| V24 | Calcular contraste de precio/label/placeholder | ≥4,5:1 texto | **Falla**: 2,87/2,56/2,56 (SRCH-14) |
| V25 | `document.fonts.check('16px Outfit')` en build de producción | Outfit cargada | **Hipótesis**: en dev carga; la CSP de `boot.ts:28` no permite Google Fonts (SRCH-30) |

### 11.3 Comprobaciones de API/DB

```bash
# 3 GET que hace /search al montar (sin cookies)
curl -s 'http://localhost:3000/api/trpc/category.list?input=%7B%22json%22%3A%7B%7D%7D'
curl -s 'http://localhost:3000/api/trpc/commerce.list?input=%7B%22json%22%3A%7B%7D%7D'
curl -s 'http://localhost:3000/api/trpc/product.getFeatured?input=%7B%22json%22%3A%7B%7D%7D'

# Búsqueda que /search NO usa
curl -s 'http://localhost:3000/api/trpc/product.search?input=%7B%22json%22%3A%7B%22query%22%3A%22Leche%22%7D%7D'
# Debe devolver "Leche entera 1L"; /search no la muestra.

# Wildcards y falta de límite (endpoint muerto)
curl -s 'http://localhost:3000/api/trpc/product.search?input=%7B%22json%22%3A%7B%22query%22%3A%22%25%22%7D%7D'
# 20 filas (todos los productos) en el seed local.

# P0 colateral: NO ejecutar en producción; en local, contar sin imprimir PII
curl -s 'http://localhost:3000/api/trpc/customer.list?input=%7B%22json%22%3A%7B%7D%7D' | jq '.result.data.json | length'
# 2 en el seed local; el payload incluye phone/address/fcmToken.
```

```sql
-- Verificar que no hay índices para búsqueda
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('products','commerces');

-- Plan actual de un LIKE de búsqueda (si se activara product.search)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM products
WHERE name LIKE '%pan%' AND is_available = 'yes';
-- Esperado: Seq Scan; con pg_trgm + GIN debería usar bitmap index scan.

-- Estados que /search no filtra
SELECT id, name, status, is_open FROM commerces ORDER BY id;
SELECT p.id, p.name, p.is_featured, p.is_available, c.status, c.is_open
FROM products p JOIN commerces c ON c.id = p.commerce_id
WHERE p.is_featured = 'yes';
```

**Criterio de aceptación mínimo para cerrar los P1:**

1. Buscar cualquier producto `isAvailable='yes'` de un comercio `status='active'` debe encontrarlo por nombre, sin acentos y con acentos.
2. El filtro de categoría debe afectar productos y comercios, o los productos deben ocultarse.
3. Ningún producto de comercio `inactive/suspended` o cerrado debe poder agregarse.
4. `SessionGuard` no debe renderizar contenido sin una sesión de servidor válida.
5. La URL debe reflejar `q` y `category`, y recargar/volver debe restaurar exactamente el estado visible.

---

## 12. Anexo: contratos API y consultas DB

### 12.1 Esquema relevante (`db/schema.ts`)

| Tabla | Campos | Notas |
|---|---|---|
| `categories` | `id`, `name`, `icon`, `color`, `sortOrder`, `createdAt` (`101-108`) | `name` varchar(100); sin índice adicional |
| `commerces` | `id`, `name`, `description`, `logo`, `coverImage`, `categoryId`, `address`, `phone`, `email`, `minOrder`, `deliveryTime`, `rating`, `status`, `isOpen`, `openHours`, `commissionRate`, `lat`, `lng`, `merchantUserId`, `createdAt` (`113-134`) | `status` enum active/inactive/suspended/pending; `isOpen` open/closed; `rating`/`minOrder` numeric → string en JSON |
| `products` | `id`, `commerceId`, `name`, `description`, `price`, `image`, `category`, `unitType`, `isFeatured`, `isAvailable`, `preparationTime`, `createdAt` (`140-153`) | `category` es texto libre (no FK a `categories`); `price` numeric → string; `unitType` default `unit`; sin índice |
| `orderItems` | `productId`, `commerceId`, `productName`, `quantity`, `unitPrice`, `total` (`184-194`) | Snapshot de nombre/precio; no guarda `unitType` |

**Índices:** el schema no declara `index()` ni `uniqueIndex()`; las migraciones no contienen `CREATE INDEX`/`pg_trgm`/`unaccent` (verificado por búsqueda). Solo existen PK y el `unique` de `customers.phone`/`users.unionId`.

### 12.2 SQL equivalente de las consultas de `/search`

```sql
-- category.list
SELECT * FROM categories ORDER BY sort_order;

-- commerce.list
SELECT * FROM commerces WHERE status = 'active';

-- product.getFeatured
SELECT
  p.id, p.commerce_id, p.name, p.description, p.price, p.image,
  p.category, p.is_featured, p.is_available, p.preparation_time, p.unit_type,
  c.name AS commerce_name
FROM products p
LEFT JOIN commerces c ON p.commerce_id = c.id
WHERE p.is_featured = 'yes' AND p.is_available = 'yes';
-- Faltan: c.status = 'active', c.is_open, ORDER BY, LIMIT.
```

### 12.3 Consultas del destino (`/commerce/:id`)

```sql
-- commerce.getById
SELECT * FROM commerces WHERE id = $1;
SELECT * FROM products WHERE commerce_id = $1;  -- se devuelve como commerce.products y se descarta

-- product.getByCommerce
SELECT * FROM products WHERE commerce_id = $1;
-- El FE filtra is_available='yes' (CommerceDetail.tsx:88).
```

### 12.4 Endpoints muertos / latentes

```sql
-- product.search
SELECT * FROM products
WHERE name LIKE '%' || $1 || '%' AND is_available = 'yes';
-- LIKE case-sensitive; $1 con % o _ actúa como wildcard; sin LIMIT; sin join a commerces.

-- commerce.search
SELECT * FROM commerces
WHERE name LIKE '%' || $1 || '%' AND status = 'active';
-- Mismo problema de case/wildcards/limit.
```

### 12.5 Resultados runtime relevantes (seed local)

| Consulta | Resultado |
|---|---|
| `category.list` | 8 categorías |
| `commerce.list` | 5 comercios activos; 20 campos por fila |
| `product.getFeatured` | 8 productos: Hamburguesa, Milanesa, Medialunas, Docena de facturas, Paracetamol, Ibuprofeno, Banana split, Helado 1kg |
| `product.search {query:"Leche"}` | 1: `Leche entera 1L` (no featured) |
| `product.search {query:"Pan"}` | 2: `Pan flauta x2`, `Pan lactal blanco` (no featured) |
| `product.search {query:"%"}` | 20: todos los productos |
| `commerce.search {query:"%"}` | 5: todos los comercios activos |
| `commerce.search {query:"Panadería"}` | 1: `Panadería El Horno` |
| `commerce.search {query:"panadería"}` | 0 (case-sensitive) |
| `customer.list` sin cookie | 2 filas con PII (valores omitidos) |
| `commerce.getById {id:1}` | comercio + 4 productos anidados; el FE vuelve a pedir los 4 |

### 12.6 Evidencia runtime de UI

- Con `qs_session` únicamente: `/search` renderiza completo tras ~600 ms; sin storage redirige a `/customer-login`.
- Al montar `/search`: exactamente 3 requests (`category.list`, `commerce.list`, `product.getFeatured`), además de los `customer.checkAuth` del provider.
- Estado inicial: 6 botones “Añadir”; los 2 destacados restantes no están en el DOM.
- `?q=Pan` → limpiar → URL sigue `?q=Pan`; recarga → input `Pan`.
- Bottom nav “Buscar” → URL `/search`, input `Pan`.
- `Comidas` → `PRODUCTOS (8)` + `COMERCIOS (1)`; URL sin `category`.
- `Bebidas` → `PRODUCTOS (8)`, sin comercios.
- `Panadería` → comercio; `panaderia` → “Sin resultados”.
- `Leche` → “Sin resultados”.
- Tab desde input: `Limpiar búsqueda` → `Todos` → chips → `Inicio`/`Buscar`/`Carrito`/`Perfil`; no tarjetas de comercio.
- En 320/375/390/430: `scrollWidth === innerWidth`; header 117–119 px; nav 63 px; a máximo scroll, última tarjeta 77 px por encima del nav (390×844).

---

**Fin del reporte.** No se modificó ningún archivo fuente; el único archivo escrito es este documento.