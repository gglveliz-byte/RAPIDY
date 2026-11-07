# Mapa del Sistema: App de Delivery

Este documento detalla de forma profesional la arquitectura de la aplicación, basándose estrictamente en el código actual del proyecto. Se divide en 3 secciones: Mapeo de Rutas (Frontend), Mapeo de Endpoints (Backend) y Estructura Funcional de Archivos.

## 1. 🗺️ Rutas del Frontend (React Router)
Detalle de las vistas accesibles por los usuarios (definidas en `src/App.tsx`).

### Públicas y Autenticación
- `/` - **Welcome**: Pantalla inicial de bienvenida.
- `/descargar` - **DownloadApp**: Página para descargar la app de cliente (PWA).
- `/descargar-socios` - **DownloadPartners**: Página para descargar la app de repartidores/comercios.
- `/register` - **Register**: Registro de nuevos clientes.
- `/customer-login` - **CustomerLogin**: Inicio de sesión exclusivo para clientes.
- `/login` - **Login**: Inicio de sesión general (Admin, Comercios, Repartidores).
- `*` - **NotFound**: Página de error 404.

### Aplicación de Cliente (Requiere rol `customer`)
- `/home` - **CustomerHome**: Pantalla principal del cliente con categorías y comercios destacados.
- `/search` - **CustomerSearch**: Búsqueda de comercios y productos.
- `/commerce/:id` - **CommerceDetail**: Vista detallada de un comercio y su catálogo.
- `/cart` - **Cart**: Carrito de compras y proceso de checkout.
- `/order/:id` - **OrderTracking**: Seguimiento de un pedido en tiempo real.
- `/chat/:orderId` - **Chat**: Chat en vivo (cliente, comercio, repartidor).
- `/profile` - **CustomerProfile**: Gestión de perfil y direcciones del cliente.

### Aplicación de Repartidor (Requiere rol `driver`)
- `/driver` - **DriverHome**: Panel principal del repartidor (pedidos disponibles y mapa).
- `/driver/order/:id` - **DriverOrder**: Vista de un pedido asignado en curso.
- `/driver/earnings` - **DriverEarnings**: Resumen de ganancias y comisiones.
- `/driver/profile` - **DriverProfile**: Perfil y configuración del vehículo.
- `/driver/chat/:orderId` - **DriverChat**: Chat del repartidor en un pedido.
- `/driver/history` - **DriverHistory**: Historial de pedidos entregados.

### Panel de Comercios (Requiere rol `merchant`)
- `/commerce` - **CommerceDashboard**: Panel principal del comercio (estadísticas).
- `/commerce/orders` - **CommerceOrders**: Gestión de pedidos entrantes y en preparación.
- `/commerce/products` - **CommerceProducts**: ABM (Alta, Baja, Modificación) del catálogo de productos.
- `/commerce/stats` - **CommerceStats**: Estadísticas detalladas de ventas.
- `/commerce/profile` - **CommerceProfile**: Configuración del comercio.

### Panel de Administración (Requiere rol `admin`)
> *Para el desglose técnico exhaustivo, flujo de datos por archivo y matriz de auditoría forense, consultar [`docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md`](docs/ADMIN_LIVE_ARCHITECTURE_LEDGER.md).*

- `/admin` - **AdminDashboard** (`src/pages/admin/Dashboard.tsx`): Panel de métricas globales de la plataforma. Consume `admin.dashboard`, `admin.salesByPeriod`, `admin.earningsByPeriod`, `admin.topCommerces`, `admin.categoryRanking`, `admin.driverPerformance`, `admin.commerceCommissions`, `admin.adminDeliveryEarnings`. Conectado al canal SSE en tiempo real `/api/events/admin-dashboard`.
- `/admin/commerces` - **AdminCommerces** (`src/pages/admin/Commerces.tsx`): Gestión centralizada de comercios. Consume `admin.listCommerces`, `admin.createMerchant`, `admin.updateCommerce`, `admin.deleteCommerce` y `admin.listCategories`. Gestiona estado operativo (`isOpen`) y estado de habilitación (`status`).
- `/admin/drivers` - **AdminDrivers** (`src/pages/admin/Drivers.tsx`): Gestión y activación de repartidores. Consume `driver.list`, `admin.createDriver`, `admin.updateDriver`, `admin.deleteDriver`. Integra `PhoneInput.tsx` para prefijos telefónicos y visualiza estados (online, busy, offline).
- `/admin/orders` - **AdminOrders** (`src/pages/admin/Orders.tsx`): Monitoreo de todos los pedidos del sistema en tiempo real. Consume `admin.orders`, `admin.orderDetail`, `admin.updateOrderStatus`, `admin.toggleCommerceSettled`, `admin.toggleDriverSettled`. Gestiona validación de comprobantes de pago por transferencia y liquidación.
- `/admin/products` - **AdminProducts** (`src/pages/admin/Products.tsx`): Vista unificada del catálogo global y ranking de más vendidos. Consume `admin.listProducts` y `admin.topProducts`. Permite filtrado en memoria y visualización de precios y categorías.
- `/admin/settings` - **AdminSettings** (`src/pages/admin/Settings.tsx`): Configuración global de la plataforma y parámetros de negocio. Consume `admin.settings`, `admin.updateSetting`, `admin.getReports`. Gestiona tarifas de envío base, pedido mínimo, datos de transferencia bancaria y exportación de reportes PDF/Excel.

---

## 2. 🔌 Endpoints del Backend (tRPC)
El backend utiliza tRPC expuesto a través de `app/api/router.ts`.

### `loginRouter` (`api/login-router.ts`)
- `login`: Autentica a usuarios (email/teléfono) y emite cookies de sesión.
- `refresh` / `logout`: Gestión de estado de sesión JWT/Cookies.
- `seedAdmin`: Genera el super-usuario admin inicial.

### `customerRouter` (`api/customer-router.ts`)
- `register` / `login`: Acceso específico para clientes.
- `getById` / `list`: Obtención de perfiles.
- `update`: Modifica el perfil del cliente.

### `commerceRouter` (`api/commerce-router.ts`)
- `list` / `getById` / `getByCategory` / `search`: Queries de lectura de comercios.
- `me`: Obtiene el comercio del merchant actualmente autenticado.
- `update` / `toggleStatus`: Actualiza información y abre/cierra local.
- `getStats`: Obtiene métricas del comercio específico.
- `markReady`: Marca la preparación del pedido de ese local como completada.

### `productRouter` (`api/product-router.ts`)
- `list` / `getById` / `getByCommerce` / `getFeatured` / `search`: Consultas de productos.
- `create` / `update` / `delete`: ABM de productos (restringido a merchants).

### `driverRouter` (`api/driver-router.ts`)
- `list` / `getProfile` / `getEarnings` / `getActiveOrders` / `getOrderHistory`: Lectura de datos del repartidor.
- `updateStatus` / `updateLocation`: Tracking y estado en vivo (online/offline).
- `updateProfile`: Modifica datos del repartidor y su vehículo.
- `acceptOrder`: El repartidor se asigna un pedido libre.
- `markCommercePickup`: El repartidor indica que retiró el paquete del local.

### `orderRouter` (`api/order-router.ts`)
- `create`: Cliente genera el pedido.
- `getById` / `getByCustomer` / `getByDriver` / `getCommerceOrders`: Queries de lectura según el rol.
- `getAvailableForDriver`: Lista pedidos en espera de un repartidor.
- `updateStatus`: Mueve el estado del pedido a lo largo de su ciclo vital.
- `markCommerceReady`: Interfaz para que el comercio reporte su parte lista.
- `updatePaymentReceipt`: Sube comprobante de transferencia (cliente).

### `chatRouter` (`api/chat-router.ts`)
- `send` / `getByOrder` / `markAsRead`: Envío y lectura de mensajes vinculados a un `orderId`.

### `categoryRouter` (`api/category-router.ts`)
- `list`: Lista todas las categorías ordenadas por `sortOrder`.
- `getById`: Obtiene una categoría por ID.

### `settingsRouter` (`api/settings-router.ts`)
- `getPublic`: Retorna todas las configuraciones globales como clave/valor.

### `adminRouter` (`api/admin-router.ts`)
- Múltiples queries de métricas: `dashboard`, `salesByPeriod`, `earningsByPeriod`, `topCommerces`, `topProducts`, `categoryRanking`, `driverPerformance`, `commerceCommissions`.
- Gestión de Usuarios y Plataforma: `createMerchant`, `createCommerce`, `createDriver`, `updateCommerce`, `updateDriver`, `updateSetting`, `updateOrderStatus`.
- `getReports`: Generador de reportes tabulares por fecha.
- `refresh`: Refresca la sesión admin via refresh token cookie.

### Público global (`api/router.ts`)
- `ping`: Health check público que retorna `{ ok, ts }`.

---

## 3. 📁 Estructura del Código y Descripción de Archivos

### Raíz del Proyecto (`app/`)
- **`.env`** / **`.env.example`**: Variables de entorno (tokens, cadenas de conexión DB).
- **`drizzle.config.ts`**: Configuración de Drizzle ORM y rutas de schemas.
- **`vite.config.ts`**: Configuración de Vite para empaquetar el código.
- **`vitest.config.ts`**: Configuración de Vitest para tests unitarios.
- **`tailwind.config.js`** / **`postcss.config.js`**: Configuración de estilos Tailwind CSS.
- **`tsconfig.json`** / **`tsconfig.app.json`** / **`tsconfig.node.json`** / **`tsconfig.server.json`**: Configuraciones de TypeScript para cada entorno.
- **`eslint.config.js`**: Reglas de linting.
- **`package.json`**: Lista de dependencias (React, tRPC, Drizzle, Tailwind, Hono) y scripts base.
- **`index.html`**: Entry point HTML con meta tags PWA (theme-color, apple-mobile-web-app, manifest).
- **`components.json`**: Configuración de shadcn/ui.
- **`Dockerfile`** / **`render.yaml`**: Archivos de despliegue para producción.
- **`count_orders.ts`**: Script utilitario para conteo de pedidos.

### Servidor HTTP (`app/api/boot.ts`)
- Servidor basado en **Hono** con `@hono/node-server`.
- Middleware de seguridad: CSP, HSTS, CORS, body limit (50MB).
- **Endpoints SSE** en tiempo real:
  - `/api/events/orders/:orderId` — Actualizaciones de un pedido específico.
  - `/api/events/commerce/:commerceId` — Novedades de un comercio.
  - `/api/events/driver/:driverId` — Eventos para un repartidor.
  - `/api/events/admin-dashboard` — Métricas globales del admin.
  - `/api/events/commerces` — Listado global de comercios.
  - `/api/events/products` — Catálogo global de productos.
- `/api/trpc/*` — Adapter que enruta todas las llamadas tRPC.
- En producción: sirve archivos estáticos del frontend compilado vía `lib/vite.ts`.

### Backend (`app/api/`)
- **`router.ts`**: Combina todos los sub-routers en `appRouter`.
- **`middleware.ts`**: Lógica de protección (middlewares) que exige `admin`, `merchant`, `driver` o `customer`. Exporta `publicQuery`, `customerQuery`, `adminQuery`, `driverQuery`, `merchantQuery`.
- **`context.ts`**: Lee las cookies de la request e hidrata el contexto con los usuarios autenticados.
- **`events.ts`**: Bus de eventos en memoria para Server-Sent Events (SSE) — canales por orderId, commerceId, driverId, etc.
- **`*-auth.ts`** (`admin-auth.ts`, `customer-auth.ts`, `driver-auth.ts`, `merchant-auth.ts`): Módulos para generación y verificación de JWTs para cada rol.
- **`category-router.ts`** / **`settings-router.ts`**: Routers adicionales de categorías y configuraciones globales.
- **`queries/connection.ts`**: Inicialización del motor de base de datos (Drizzle).
- **`queries/users.ts`**: Queries auxiliares de usuarios.
- **`lib/cookies.ts`**: Helpers para configuración de cookies (HttpOnly, Secure, SameSite).
- **`lib/env.ts`**: Validación y tipado de variables de entorno.
- **`lib/http.ts`**: Utilidades HTTP.
- **`lib/vite.ts`**: Servir archivos estáticos del frontend en producción.

### Base de Datos (`app/db/`)
- **`schema.ts`**: DDL (Data Definition Language). Aquí residen las tablas (orders, users, products, commerces, drivers, customers, categories, chatMessages, etc.).
- **`relations.ts`**: Relaciones (joins automáticos de Drizzle) entre entidades.
- **`seed.ts`**: Lógica para llenar la base de datos con comercios, categorías y usuarios de prueba.
- **`migrations/`**: Migraciones SQL versionadas (6 archivos + meta) generadas por Drizzle Kit.

### Frontend - Providers (`app/src/providers/`)
- **`trpc.tsx`**: Inicializa el cliente tRPC con `createTRPCReact`, manejo de errores de autenticación y refresh automático de sesión.
- **`QueryProvider.tsx`**: Wrapper que combina `QueryClientProvider` de React Query con el provider de tRPC.

### Frontend Vistas (`app/src/pages/`)
Organizadas en carpetas por área de negocio:
- **`admin/`**: Dashboard, Commerces, Drivers, Orders, Products, Settings.
- **`commerce/`**: Dashboard, Orders, Products, Profile, Stats.
- **`customer/`**: Welcome, Home, Search, CommerceDetail, Cart, OrderTracking, Chat, Profile, Register, CustomerLogin, DownloadApp.
- **`driver/`**: DriverHome, DriverOrder, DriverEarnings, DriverProfile, DriverChat, DriverHistory, DownloadPartners.
- **`Login.tsx`**: Login general (admin, comercios, repartidores).
- **`NotFound.tsx`**: Página 404.

### Frontend Componentes (`app/src/components/`)
- **`AdminLayout.tsx`** / **`CommerceLayout.tsx`** / **`AuthLayout.tsx`**: "Cáscaras" visuales que proveen navegación (sidebar/navbar) al contenido.
- **`AuthLayoutSkeleton.tsx`**: Skeleton loader para layouts de autenticación.
- **`SessionGuard.tsx`**: Wrapper que protege rutas verificando el rol, si no coincide, expulsa al Login.
- **`CustomerBottomNav.tsx`**: Menú inferior para móviles exclusivo del cliente.
- **`ChatBubble.tsx`**: Componente de burbuja de chat.
- **`DynamicManifest.tsx`**: Inyecta dinámicamente el manifest.json para PWA según el rol.
- **`PhoneInput.tsx`**: Input de teléfono con formato.
- **`PWAInstallBanner.tsx`**: Banner para instalar la PWA en el dispositivo.
- **`ui/`**: Colección de componentes "tontos" visuales (botones, inputs, diálogos) estilo Shadcn (53 componentes).

### Frontend Lógica y Hooks (`app/src/hooks/` & `src/lib/`)
- **`useDeliveryData.ts`**: Hook masivo que expone la comunicación frontend->backend vía tRPC de manera tipada.
- **`useOrderEvents.ts`** / **`useDriverNotification.ts`**: Hooks que escuchan a `events.ts` del servidor y lanzan notificaciones toast en tiempo real.
- **`useCart.tsx`**: Maneja el estado global del carrito (añadir, quitar, totales).
- **`useAuth.ts`**: Hook de autenticación general con detección del rol activo.
- **`useCustomerSession.tsx`**: Manejo específico de sesión de clientes.
- **`useSessionSync.ts`**: Sincroniza la sesión entre pestañas vía localStorage.
- **`useAdminSSE.ts`**: Escucha eventos SSE del panel de administración.
- **`usePWAInstall.ts`**: Hook para capturar el evento `beforeinstallprompt`.
- **`use-mobile.ts`**: Detección de dispositivo móvil para responsive.
- **`imageUtils.ts`**: Manejo y optimización de imágenes en base64/URLs.
- **`locationUtils.ts`**: Cálculo matemático para coordenadas GPS.
- **`leaflet-fix.ts`**: Corrección de iconos default de Leaflet.
- **`utils.ts`**: Utilidades genéricas (cn con clsx/tailwind-merge).

### Frontend Entry (`app/src/`)
- **`main.tsx`**: Punto de entrada de React (renderiza `<App />` en el DOM).
- **`App.css`** / **`index.css`**: Estilos globales y resets.
- **`const.ts`**: Constantes globales (ej: `LOGIN_PATH`).

### PWA y Assets (`app/public/`)
- **`manifest.json`**: Web App Manifest para la app de clientes.
- **`manifest-partners.json`**: Web App Manifest para la app de socios (repartidores/comercios).
- **`sw.js`**: Service Worker para funcionalidad offline y caché.
- **`icon-192.svg`** / **`icon-512.svg`**: Iconos PWA en SVG.
- **`logotipo.jpeg`**: Logo de la aplicación.

### Shared / Types (`app/contracts/`)
- **`constants.ts`** / **`types.ts`** / **`errors.ts`**: Definiciones tipadas compartidas universalmente.
