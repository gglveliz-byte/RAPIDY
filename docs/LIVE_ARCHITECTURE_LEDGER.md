# REGISTRO VIVO DE ARQUITECTURA, DEPENDENCIAS E INTEGRACIONES (LIVE LEDGER)

**Última Actualización:** 2026-11-13 16:38:00 UTC  
**Agente / Autor de Última Modificación:** Antigravity (Google DeepMind)  
**Estado de Integridad (<500 líneas por archivo):** VERIFICADO (100% compliant)  
**Repositorio Oficial:** `https://github.com/gglveliz-byte/RAPIDY`

---

## 1. Mapa de Enrutamiento para Lectura Dirigida (Qué Archivos Leer Según la Tarea)

> Instrucción para la IA: NO recorras todo el repositorio. Busca el dominio de tu tarea en esta tabla y lee únicamente los archivos indicados en "Archivos Clave de Lectura Obligatoria" antes de integrar tus cambios.

| Dominio / Módulo | Propósito Técnico | Archivos Clave de Lectura Obligatoria | Contratos / Puertos que Expone |
| :--- | :--- | :--- | :--- |
| **00. UI Kernel & Canvas** | Motor visual 60 FPS, partículas reactivas, constelaciones, inputs telefónicos adaptativos | `src/components/RapidyCanvas.tsx`, `src/components/PhoneInput.tsx`, `src/lib/locationUtils.ts` | `<RapidyCanvas />`, `<PhoneInput />`, `getAddressFromCoords()` |
| **01. Identidad & Onboarding** | Bienvenida, inicio de sesión clientes, portal socios y registro de clientes con GPS | `src/pages/customer/Welcome.tsx`, `src/pages/customer/CustomerLogin.tsx`, `src/pages/customer/Register.tsx`, `src/pages/Login.tsx` | `useCustomerSession()`, `trpcMutate("customer.register")`, `trpcMutate("customer.login")`, `trpcMutate("login.login")` |
| **02. Catálogo & Pedidos Cliente** | Exploración de comercios, carrito, tracking en vivo con Leaflet y WebSocket | `src/pages/customer/Home.tsx`, `src/pages/customer/CommerceDetail.tsx`, `src/pages/customer/Cart.tsx`, `src/pages/customer/OrderTracking.tsx` | `useDeliveryData()`, `useCartStore()`, `useOrderEvents()` |
| **03. Repartidor (Driver App)** | Aceptación de pedidos, geolocalización continua, historial y ganancias | `src/pages/driver/DriverHome.tsx`, `src/pages/driver/DriverOrder.tsx`, `src/pages/driver/DriverEarnings.tsx` | `driverRouter`, `driverStatusEnum` |
| **04. Comercios Aliados** | Gestión de menú, inventario de productos, estados de comandas y métricas | `src/pages/commerce/Dashboard.tsx`, `src/pages/commerce/Orders.tsx`, `src/pages/commerce/Products.tsx` | `commerceRouter`, `orderCommerceStatusEnum` |
| **05. Administración Central** | Auditoría global, gestión de comisiones, liquidaciones, repartidores y settings | `src/pages/admin/Dashboard.tsx`, `src/pages/admin/Commerces.tsx`, `src/pages/admin/Drivers.tsx`, `src/pages/admin/Orders.tsx` | `adminRouter`, `docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md` |
| **06. Backend tRPC & Neon DB** | Procedimientos remotos tipados, autenticación por cookies/JWT, pool PostgreSQL Neon | `server/customer-router.ts`, `server/driver-router.ts`, `server/commerce-router.ts`, `server/admin-router.ts`, `db/schema.ts` | `appRouter`, `getDb()` |

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
| `getAddressFromCoords` | `src/lib/locationUtils.ts` | Geocodificación inversa vía Nominatim OpenStreetMap (traduce lat/lng a dirección física). **Prohibido duplicar**. |
| `useCustomerSession` | `src/hooks/useCustomerSession.ts` | Gestión de sesión de cliente final en memoria y localStorage. |
| `trpcMutate` / `trpcQuery` | `src/hooks/useDeliveryData.ts` | Wrapper cliente para ejecución de queries y mutaciones tRPC. |

---

## 3. Semáforo de Concurrencia Multi-Agente (Archivos en Edición Activa)

| Agente IA | Módulo / Tarea Activa | Archivos Bloqueados Temporalmente | Estado | Timestamp Inicio |
| :--- | :--- | :--- | :---: | :--- |
| `Antigravity` | 01. Identidad & Onboarding | `src/pages/customer/Register.tsx` | `LIBRE` | 2026-11-13 16:38 UTC |

---

## 4. Inventario de Archivos del Proyecto y Auditoría de Líneas (<500 Líneas)

| Ruta del Archivo | Módulo | Líneas Actuales (`/ 500 máx`) | Resumen de Responsabilidad y Exportaciones | Dependencias que Consume |
| :--- | :--- | :---: | :--- | :--- |
| `src/pages/customer/Welcome.tsx` | Identidad | `168 / 500` | Pantalla inicial de bienvenida con Hero visual y accesos principales | `react-router`, `lucide-react` |
| `src/pages/customer/CustomerLogin.tsx` | Identidad | `185 / 500` | Login directo de cliente final con tarjeta Glassmorphism | `RapidyCanvas`, `PhoneInput`, `useCustomerSession`, `trpcMutate` |
| `src/pages/customer/Register.tsx` | Identidad | `283 / 500` | Registro de nuevos clientes con GPS autocompletado y validación | `RapidyCanvas`, `PhoneInput`, `locationUtils`, `useCustomerSession`, `registerCustomer` |
| `src/pages/Login.tsx` | Identidad | `246 / 500` | Portal unificado de socios (Email para Admin/Comercio, Celular para Chofer) | `RapidyCanvas`, `PhoneInput`, `trpcMutate` |
| `src/components/RapidyCanvas.tsx` | UI Kernel | `268 / 500` | Motor Canvas 2D interactivo con constelaciones luminosas a 60 FPS | `react` |
| `src/components/PhoneInput.tsx` | UI Kernel | `187 / 500` | Selector de país internacional con búsqueda y sanitización | `lucide-react`, `react` |
| `src/lib/locationUtils.ts` | Utilidades | `13 / 500` | Geocodificación inversa con OpenStreetMap Nominatim | `fetch` nativo |

---

## 5. Bitácora Cronológica de Integraciones (Changelog Técnico Live)

### [2026-11-13 16:38 UTC] - Creación de Ledger Live & Erradicación de Duplicación en Registro
- **Resumen Técnico:** 
  1. Se aplicó la skill `ecosystem-connect` eliminando la función duplicada `getAddressFromCoords` en `src/pages/customer/Register.tsx`, importándola directamente desde `src/lib/locationUtils.ts`.
  2. Se aplicó la skill `reglas-globales-construccion-codigo`, agregando cabeceras documentales estructuradas en español al 100% de los archivos tocados (`Register.tsx`, `CustomerLogin.tsx`, `Login.tsx`, `RapidyCanvas.tsx`, `PhoneInput.tsx`).
  3. Se aplicó la skill `documentadora-live-contexto`, creando este archivo maestro canónico `docs/LIVE_ARCHITECTURE_LEDGER.md` con su mapa de lectura dirigida, catálogo de dependencias sin duplicados, semáforo de concurrencia y auditoría estricta de líneas (<500).
- **Archivos Modificados:**
  - `src/pages/customer/Register.tsx` (283 líneas - Reutilización de `locationUtils.ts` y cabecera en español).
  - `src/pages/customer/CustomerLogin.tsx` (185 líneas - Cabecera canónica en español).
  - `src/pages/Login.tsx` (246 líneas - Cabecera canónica en español).
  - `src/components/RapidyCanvas.tsx` (268 líneas - Cabecera canónica en español).
  - `src/components/PhoneInput.tsx` (187 líneas - Cabecera canónica en español).
  - `docs/LIVE_ARCHITECTURE_LEDGER.md` (Creado - Registro vivo maestro de arquitectura).
- **Dependencias Integradas:** Reutilización estricta de `src/lib/locationUtils.ts` y `RapidyCanvas`. Cero librerías redundantes instaladas.
- **Impacto en Contratos / Base de Datos:** Total compatibilidad con tabla `customers` de PostgreSQL Neon y endpoint `customer.register`.
- **Guía para el Siguiente Agente:** Leer la Sección 1 de este Ledger para intervenir cualquier módulo subsiguiente sin recorrer carpetas a ciegas.

