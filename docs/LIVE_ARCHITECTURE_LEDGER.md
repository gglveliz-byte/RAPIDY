# REGISTRO VIVO DE ARQUITECTURA, DEPENDENCIAS E INTEGRACIONES (LIVE LEDGER)

**Última Actualización:** 2026-11-13 16:56:00 UTC  
**Agente / Autor de Última Modificación:** Antigravity (Google DeepMind)  
**Estado de Integridad (<500 líneas por archivo):** VERIFICADO (100% compliant)  
**Repositorio Oficial:** `https://github.com/gglveliz-byte/RAPIDY`

---

## 1. Mapa de Enrutamiento para Lectura Dirigida (Qué Archivos Leer Según la Tarea)

> Instrucción para la IA: NO recorras todo el repositorio. Busca el dominio de tu tarea en esta tabla y lee únicamente los archivos indicados en "Archivos Clave de Lectura Obligatoria" antes de integrar tus cambios.

| Dominio / Módulo | Propósito Técnico | Archivos Clave de Lectura Obligatoria | Contratos / Puertos que Expone |
| :--- | :--- | :--- | :--- |
| **00. UI Kernel & Canvas** | Motor visual 60 FPS, partículas reactivas, constelaciones, inputs telefónicos adaptativos y barra de navegación | `src/components/RapidyCanvas.tsx`, `src/components/PhoneInput.tsx`, `src/components/CustomerBottomNav.tsx`, `src/lib/locationUtils.ts` | `<RapidyCanvas />`, `<PhoneInput />`, `<CustomerBottomNav />`, `getAddressFromCoords()` |
| **01. Identidad & Onboarding** | Bienvenida, inicio de sesión clientes, portal socios y registro de clientes con GPS | `src/pages/customer/Welcome.tsx`, `src/pages/customer/CustomerLogin.tsx`, `src/pages/customer/Register.tsx`, `src/pages/Login.tsx` | `useCustomerSession()`, `trpcMutate("customer.register")`, `trpcMutate("customer.login")`, `trpcMutate("login.login")` |
| **02. Panel de Cliente (Home)** | Identidad oficial, búsqueda rápida, atajos a 4 categorías, banner "¡Pedidos más rápidos!", carrusel de destacados y comercios | `src/pages/customer/Home.tsx`, `src/pages/customer/components/HomeHeader.tsx`, `src/pages/customer/components/HomePromoBanner.tsx`, `src/pages/customer/components/HomeCategories.tsx`, `src/pages/customer/components/HomeFeaturedCommerces.tsx` | `useCategories()`, `useCommerces()`, `useFeaturedProducts()`, `<HomeHeader />`, `<HomePromoBanner />` |
| **03. Repartidor (Driver App)** | Aceptación de pedidos, geolocalización continua, historial y ganancias | `src/pages/driver/DriverHome.tsx`, `src/pages/driver/DriverOrder.tsx`, `src/pages/driver/DriverEarnings.tsx` | `driverRouter`, `driverStatusEnum` |
| **04. Comercios Aliados** | Gestión de menú, inventario de productos, estados de comandas y métricas | `src/pages/commerce/Dashboard.tsx`, `src/pages/commerce/Orders.tsx`, `src/pages/commerce/Products.tsx` | `commerceRouter`, `orderCommerceStatusEnum` |
| **05. Administración Central** | Auditoría global, gestión de comisiones, liquidaciones, repartidores y settings | `src/pages/admin/Dashboard.tsx`, `src/pages/admin/Commerces.tsx`, `src/pages/admin/Drivers.tsx`, `src/pages/admin/Orders.tsx` | `adminRouter`, `docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md` |
| **06. Backend tRPC & Neon DB** | Procedimientos remotos tipados, autenticación por cookies/JWT, pool PostgreSQL Neon | `server/customer-router.ts`, `server/driver-router.ts`, `server/commerce-router.ts`, `server/admin-router.ts`, `db/schema.ts`, `db/seed.ts` | `appRouter`, `getDb()` |

---

## 2. Catálogo Único de Dependencias y Utilidades Internas (Prohibido Duplicar)

### 2.1. Dependencias Externas Oficiales (`package.json`)

| Paquete | Versión | Uso Único Autorizado en el Proyecto | Prohibiciones (No Instalar Equivalentes) |
| :--- | :---: | :--- | :--- |
| `drizzle-orm` | `^0.39.3` | ORM nativo TypeScript y constructor de consultas PostgreSQL | Prohibido instalar Prisma o TypeORM |
| `@neondatabase/serverless` | `^0.10.4` | Conexión WebSocket y HTTP pooler hacia PostgreSQL Neon | Prohibido usar drivers desalineados sin SSL |
| `@trpc/server` / `client` | `^10.45.2` | Capa de API RPC punto a punto con contratos de tipos TypeScript | Prohibido reemplazar por endpoints REST aislados sin tipado |
| `lucide-react` | `^0.475.0` | Conjunto iconográfico estándar del diseño Rapidy | Prohibido instalar FontAwesome u otros paquetes de iconos |
| `framer-motion` | `^12.4.7` | Animaciones de transición de páginas y microinteracciones | Prohibido animaciones CSS ad-hoc no estandarizadas |
| `leaflet` | `^1.9.4` | Mapas interactivos para tracking de entregas y repartidores | Prohibido usar Google Maps SDK pagado sin requerimiento |

### 2.2. Utilidades Internas Compartidas Ya Construidas

| Nombre de Utilidad / Componente | Ruta Exacta | Funciones Principales que Provee |
| :--- | :--- | :--- |
| `RapidyCanvas` | `src/components/RapidyCanvas.tsx` | Motor Canvas 60 FPS con malla de constelaciones dinámicas, pulsación y partículas reactivas al puntero. |
| `PhoneInput` | `src/components/PhoneInput.tsx` | Selector internacional de prefijo de país + entrada telefónica móvil en modos claro/oscuro. |
| `CustomerBottomNav` | `src/components/CustomerBottomNav.tsx` | Barra inferior fija con islas flotantes en Glassmorphism e indicador activo en naranja Rapidy. |
| `getAddressFromCoords` | `src/lib/locationUtils.ts` | Geocodificación inversa vía Nominatim OpenStreetMap (traduce lat/lng a dirección física). **Prohibido duplicar**. |
| `useCustomerSession` | `src/hooks/useCustomerSession.ts` | Gestión de sesión de cliente final en memoria y localStorage. |
| `trpcMutate` / `trpcQuery` | `src/hooks/useDeliveryData.ts` | Wrapper cliente para ejecución de queries y mutaciones tRPC. |

---

## 3. Semáforo de Concurrencia Multi-Agente (Archivos en Edición Activa)

| Agente IA | Módulo / Tarea Activa | Archivos Bloqueados Temporalmente | Estado | Timestamp Inicio |
| :--- | :--- | :--- | :---: | :--- |
| `Antigravity` | 02. Panel de Cliente (Home) | `src/pages/customer/Home.tsx` | `LIBRE` | 2026-11-13 16:56 UTC |

---

## 4. Inventario de Archivos del Proyecto y Auditoría de Líneas (<500 Líneas)

| Ruta del Archivo | Módulo | Líneas Actuales (`/ 500 máx`) | Resumen de Responsabilidad y Exportaciones | Dependencias que Consume |
| :--- | :--- | :---: | :--- | :--- |
| `src/pages/customer/Search.tsx` | Cliente | `290 / 500` | Búsqueda reactiva por texto y categorías, tarjetas Dark Velvet de productos y comercios | `useCategories`, `useCommerces`, `useFeaturedProducts`, `useCart`, `CustomerBottomNav`, `safeImage` |
| `src/pages/customer/Cart.tsx` | Cliente | `443 / 500` | Gestión de carrito multi-comercio, selector de pago, checkout y modal de entrega con geolocalización | `useCart`, `useCustomerSession`, `useCreateOrder`, `usePublicSettings`, `useCommerces`, `locationUtils` |
| `src/pages/customer/Profile.tsx` | Cliente | `291 / 500` | Perfil de usuario, editor GPS de dirección, historial de pedidos y accesos al marco legal | `useCustomerSession`, `useCustomerOrders`, `useUpdateCustomerProfile`, `CustomerBottomNav`, `locationUtils` |
| `src/pages/customer/Home.tsx` | Cliente | `346 / 500` | Orquesta catálogo con cabecera compacta 50/50, padding-top optimizado y scroll fluido | `HomeHeader`, `HomePromoBanner`, `HomeCategories`, `HomeFeaturedCommerces`, `CustomerBottomNav` |
| `src/pages/customer/components/HomeHeader.tsx` | Cliente | `146 / 500` | Cabecera fija split (50% cliente izq / 50% Rapidy der) con buscador inferior de ancho completo | `lucide-react`, `react-router`, `react` |
| `src/pages/customer/components/HomePromoBanner.tsx` | Cliente | `82 / 500` | Banner "¡Pedidos más rápidos!" con platillos flotantes en 3D | `lucide-react`, `react-router` |
| `src/pages/customer/components/HomeCategories.tsx` | Cliente | `104 / 500` | Carrusel dinámico de categorías conectado a BD (eliminado bloque estático redundante) | `lucide-react` |
| `src/pages/customer/components/HomeFeaturedCommerces.tsx` | Cliente | `118 / 500` | Carrusel de restaurantes destacados con fotos, tiempo y rating | `safeImage`, `lucide-react`, `react-router` |
| `src/components/CustomerBottomNav.tsx` | UI Kernel | `88 / 500` | Navegación inferior flotante con acentos Rapidy Flame Orange | `framer-motion`, `lucide-react`, `react-router` |
| `src/pages/customer/Welcome.tsx` | Identidad | `168 / 500` | Pantalla inicial de bienvenida con Hero visual y accesos principales | `react-router`, `lucide-react` |
| `src/pages/customer/CustomerLogin.tsx` | Identidad | `185 / 500` | Login directo de cliente final con tarjeta Glassmorphism | `RapidyCanvas`, `PhoneInput`, `useCustomerSession`, `trpcMutate` |
| `src/pages/customer/Register.tsx` | Identidad | `283 / 500` | Registro de nuevos clientes con GPS autocompletado y validación | `RapidyCanvas`, `PhoneInput`, `locationUtils`, `useCustomerSession`, `registerCustomer` |
| `src/pages/Login.tsx` | Identidad | `246 / 500` | Portal unificado de socios (Email para Admin/Comercio, Celular para Chofer) | `RapidyCanvas`, `PhoneInput`, `trpcMutate` |
| `src/components/RapidyCanvas.tsx` | UI Kernel | `268 / 500` | Motor Canvas 2D interactivo con constelaciones luminosas a 60 FPS | `react` |
| `src/components/PhoneInput.tsx` | UI Kernel | `187 / 500` | Selector de país internacional con búsqueda y sanitización | `lucide-react`, `react` |
| `src/lib/locationUtils.ts` | Utilidades | `13 / 500` | Geocodificación inversa con OpenStreetMap Nominatim | `fetch` nativo |

---

## 5. Bitácora Cronológica de Integraciones (Changelog Técnico Live)

### [2026-11-13 17:48 UTC] - Rediseño Concurrente Multi-Agente de Search, Cart y Profile (Estilo Rapidy)
- **Resumen Técnico:**
  1. Se ejecutó el rediseño coordinado en paralelo de las 3 páginas restantes del portal de cliente mediante subagentes especializados, aplicando con rigor la política de **CERO invención de lógica o campos**.
  2. **`Search.tsx`:** Erradicación del verde Ya Llega; cabecera sticky Dark Velvet con input de píldora blanca, micro-anillo `#FF6A00`, carrusel de categorías con píldora activa en Flame Orange y micro-brillo, y tarjetas de productos y comercios en dark mode (`#18181F`).
  3. **`Cart.tsx`:** Carrito con lista de productos agrupada por comercio, botones de incremento/decremento con acento Rapidy, vista de carrito vacío con micro-glow, modal de checkout y confirmación de pedidos con geolocalización directa y subida de transferencias.
  4. **`Profile.tsx`:** Encabezado con degradado Dark Velvet, halo difuso `#FF6A00`, avatar iluminado, edición de domicilio con GPS OpenStreetMap en vivo, historial interactivo de pedidos y marco legal.
  5. Todas las páginas cuentan con cabeceras JSDoc canónicas en español, estricto conteo <500 líneas y compilación validada al 100% con `npm run build`.
- **Archivos Modificados:**
  - `src/pages/customer/Search.tsx` (290 líneas).
  - `src/pages/customer/Cart.tsx` (443 líneas).
  - `src/pages/customer/Profile.tsx` (291 líneas).
  - `docs/LIVE_ARCHITECTURE_LEDGER.md` (Actualizado).

### [2026-11-13 16:56 UTC] - Rediseño Modular del Panel de Cliente (Home) según Mockup Rapidy
- **Resumen Técnico:** 
  1. Se rediseñó la pantalla `Home.tsx` aplicando la estética exacta enviada por el usuario (Logotipo oficial centrado con eslogan *"Todo lo que quieres, en un solo pedido"*, píldora de búsqueda blanca flotante *"Buscar en Rapidy..."*, atajos a las 4 categorías: Comida, Supermercado, Farmacia y Compras).
  2. Se construyó el banner promocional interactivo `HomePromoBanner.tsx` con degradado cálido, insignia Rapidy Express y platillos flotantes en levitación.
  3. Se construyó el carrusel `HomeFeaturedCommerces.tsx` para "Restaurantes destacados" con tiempos y ratings.
  4. Se descompuso la pantalla en 4 subcomponentes modulares dentro de `src/pages/customer/components/` respetando estrictamente el límite de 500 líneas de `reglas-globales-construccion-codigo`.
  5. Se actualizaron los datos semilla (`db/seed.ts`) agregando clientes de prueba oficiales: **Lautaro Ezequiel (`+593 99 123 4567`)** y **Cliente Rapidy (`+54 9 11 1234-5678`)**.
- **Archivos Creados / Modificados:**
  - `src/pages/customer/Home.tsx` (315 líneas - Rediseñado y modularizado).
  - `src/pages/customer/components/HomeHeader.tsx` (132 líneas - Creado).
  - `src/pages/customer/components/HomePromoBanner.tsx` (82 líneas - Creado).
  - `src/pages/customer/components/HomeCategories.tsx` (145 líneas - Creado).
  - `src/pages/customer/components/HomeFeaturedCommerces.tsx` (118 líneas - Creado).
  - `src/components/CustomerBottomNav.tsx` (88 líneas - Modificado a naranja Rapidy).
  - `db/seed.ts` (Modificado con clientes de prueba e import de `customers`).
  - `docs/LIVE_ARCHITECTURE_LEDGER.md` (Actualizado con nuevo inventario de líneas).
- **Dependencias Integradas:** Reutilización de `safeImage`, `useCustomerSession`, `useCart`.
- **Impacto en Base de Datos:** Base de datos sembrada con 5 comercios, 8 categorías, 20 productos y 2 clientes de prueba.

### [2026-11-13 16:38 UTC] - Creación de Ledger Live & Erradicación de Duplicación en Registro
- **Resumen Técnico:** 
  1. Se aplicó la skill `ecosystem-connect` eliminando la función duplicada `getAddressFromCoords` en `src/pages/customer/Register.tsx`.
  2. Se agregaron cabeceras canónicas estructuradas en español al 100% de los archivos modificados.
  3. Se creó el archivo maestro `docs/LIVE_ARCHITECTURE_LEDGER.md`.
