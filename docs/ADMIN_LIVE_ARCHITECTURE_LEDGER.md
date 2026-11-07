# ADMIN LIVE ARCHITECTURE LEDGER & MAPA INTEGRAL DEL SISTEMA
> **Fecha de creación:** 2026-11-07  
> **Alcance:** Mapeo completo, flujo de datos y auditoría quirúrgica de las 6 rutas del Panel de Administración (`/admin`).  
> **Estado:** Auditoría en curso (Subagentes en paralelo).  
> **Modo:** 100% Solo Lectura (Inspección estricta sin modificación de código fuente).

---

## 📑 ÍNDICE GENERAL DEL LEDGER
1. [Ruta 1: `/admin` - Dashboard Principal](#ruta-1-admin---dashboard-principal) *(✅ COMPLETADO por Subagente 1)*
2. [Ruta 2: `/admin/commerces` - Gestión de Comercios](#ruta-2-admincommerces---gestión-de-comercios) *(✅ COMPLETADO por Subagente 2)*
3. [Ruta 3: `/admin/drivers` - Gestión de Repartidores](#ruta-3-admindrivers---gestión-de-repartidores) *(✅ COMPLETADO por Subagente 3)*
4. [Ruta 4: `/admin/orders` - Gestión y Monitoreo de Pedidos](#ruta-4-adminorders---gestión-y-monitoreo-de-pedidos) *(✅ COMPLETADO por Subagente 4)*
5. [Ruta 5: `/admin/products` - Catálogo Global de Productos](#ruta-5-adminproducts---catálogo-global-de-productos) *(✅ COMPLETADO por Subagente 5)*
6. [Ruta 6: `/admin/settings` - Configuración Global del Sistema](#ruta-6-adminsettings---configuración-global-del-sistema) *(✅ COMPLETADO por Subagente 6)*
7. [Matriz Consolidada de Vulnerabilidades y Errores Matemáticos](#matriz-consolidada-de-vulnerabilidades-y-errores-matemáticos)

---

## Ruta 1: `/admin` - Dashboard Principal
*(Auditoría completada por Subagente 1)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx`: Ruta `/admin` bajo `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Dashboard.tsx`: KPIs principales, gráficos Recharts (`BarChart` para ventas, comisiones y delivery fee neto), rankings de comercios y categorías, tabla de comisiones por comercio y balance de repartidores.
  - `app/src/components/AdminLayout.tsx`: Layout del panel admin.
- **Backend tRPC:**
  - `app/server/admin-router.ts`:
    - `admin.dashboard` (`adminQuery`): KPIs globales (pedidos, comercios activos/totales, repartidores online/busy, facturación, comisiones).
    - `admin.salesByPeriod` (`adminQuery`): Ventas y cantidad de pedidos agrupados por día/semana/mes/año.
    - `admin.earningsByPeriod` (`adminQuery`): Comisiones de comercio y ganancias netas de delivery agrupadas por fecha.
    - `admin.topCommerces` (`adminQuery`): Top comercios por facturación y volumen.
    - `admin.topProducts` (`adminQuery`): Top productos más vendidos.
    - `admin.categoryRanking` (`adminQuery`): Ingresos por rubro/categoría.
    - `admin.driverPerformance` (`adminQuery`): Desempeño y balance de conductores.
    - `admin.commerceCommissions` (`adminQuery`): Comisiones acumuladas por comercio.
    - `admin.driverEarningsBreakdown` (`adminQuery`): Pagos a choferes vs costos de envío cobrados a clientes.
    - `admin.adminDeliveryEarnings` (`adminQuery`): Ganancia neta de envíos de la plataforma.
- **Eventos SSE & Servidor:**
  - `app/server/boot.ts` (L129-142): Endpoint HTTP `GET /api/events/admin-dashboard`.
  - `app/src/hooks/useAdminSSE.ts`: EventSource reactivo hacia `/api/events/admin-dashboard`.
- **Tablas de Base de Datos (Drizzle ORM):**
  - `orders`, `orderItems`, `commerces`, `drivers`, `driverEarnings`, `categories`, `customers`.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **MATH-DASH-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:46-49`) | **Facturación y comisiones globales infladas por cancelaciones:** `admin.dashboard` ejecuta `SUM(orders.total)` sin filtrar por `status`. Suma órdenes canceladas, pagos rechazados y transferencias pendientes. |
| **MATH-DASH-02** | 🔴 CRÍTICA | Backend / DB (`order-router.ts:26`, `admin-router.ts:48`) | **Desincronización del campo `orders.commission`:** Al crearse el pedido, toma `input.commission` del cliente (`"0.00"`). Por ende, el KPI card superior muestra `$0.00`, mientras los gráficos inferiores calculan comisiones dinámicamente, contradiciéndose en la misma pantalla. |
| **SEC-DASH-01** | 🔴 CRÍTICA | Servidor / SSE (`boot.ts:129-142`) | **Endpoint SSE `/api/events/admin-dashboard` sin autenticación:** No tiene middleware de verificación de cookie de admin. Cualquier atacante o usuario no autenticado puede abrir un EventSource y escuchar notificaciones y eventos operativos en vivo. |
| **MATH-DASH-03** | 🔴 CRÍTICA | Backend (`admin-router.ts:853-895`) | **Entregas desde admin no acreditan `driverEarnings`:** Si el admin pasa una orden a `delivered`, nunca se inserta en `driverEarnings`. `adminDeliveryEarnings` asume erróneamente que el costo del chofer fue $0 y la plataforma se quedó con el 100% del delivery fee. |
| **MATH-DASH-04** | 🟡 ALTA | Backend (`admin-router.ts:188`) / UI (`Dashboard.tsx:318`) | **Métrica falsa de pedidos en `topCommerces`:** Suma unidades de productos (`item.quantity`, ej: 20 empanadas) y las asigna a `.orders`, mostrándose en el front como "20 pedidos" en lugar de 1. |
| **MATH-DASH-05** | 🟡 ALTA | Frontend (`Dashboard.tsx:44-55`) | **Cálculo de crecimiento erróneo (`growthPercent`):** Compara períodos de diferente escala (ej: 30 días vs 24 meses), mostrando caídas falsas de `-97%`. |
| **SEC-DASH-02** | 🟡 ALTA | Backend (`admin-router.ts:244-251`) | **Fuga de hashes y tokens en `driverPerformance`:** Hace `select().from(drivers)` y retorna `...d`, exponiendo `passwordHash` y `fcmToken` de todos los choferes. |
| **PERF-DASH-01** | 🟡 ALTA | Backend (`admin-router.ts:182,204,230`) | **Antipatrón N+1 masivo:** Carga todos los `orderItems` de la historia y ejecuta una consulta SQL individual a `commerces` por cada ítem. |
| **UI-DASH-01** | 🟢 MEDIA | Frontend (`Dashboard.tsx`) | **Selector de período acoplado:** Un único estado `period` compartido entre los 3 gráficos distintos. Cambiar el período en comisiones altera sin querer el gráfico de ventas y de envíos. |
| **PERF-DASH-02** | 🟢 MEDIA | Frontend (`useAdminSSE.ts`, `Dashboard.tsx`) | **Tormenta de peticiones por eventos SSE:** Sin debounce ante ráfagas de pedidos, disparando múltiples recargas concurrentes de `loadAll()`. |

---

## Ruta 2: `/admin/commerces` - Gestión de Comercios
*(Auditoría completada por Subagente 2)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx`: Ruta `/admin/commerces` bajo `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Commerces.tsx`: Tabla desktop y tarjetas mobile, modal nuevo comercio (`admin.createMerchant`), modal editar comercio (`admin.updateCommerce`), modal eliminar comercio (`admin.deleteCommerce`).
  - `app/src/components/AdminLayout.tsx`: Contenedor maestro con barra de navegación.
- **Backend tRPC:**
  - `app/server/admin-router.ts`:
    - `admin.listCommerces` (`adminQuery`): devuelve todos los comercios sin filtro.
    - `admin.createMerchant` (`adminQuery`): inserta usuario `merchant` en `users` y fila en `commerces`.
    - `admin.updateCommerce` (`adminQuery`): actualización granular de campos en `commerces`.
    - `admin.deleteCommerce` (`adminQuery`): borrado de comercio, productos, órdenes asociadas y ganancias de choferes.
  - `app/server/commerce-router.ts`: `list`, `getById` (`publicQuery`), `me`, `update`, `toggleStatus` (`merchantQuery`).
- **Tablas de Base de Datos (Drizzle ORM):**
  - `commerces`: `id`, `name`, `description`, `logo`, `coverImage`, `categoryId`, `address`, `phone`, `email`, `minOrder`, `deliveryTime`, `rating`, `status`, `isOpen`, `openHours`, `commissionRate`, `lat`, `lng`, `merchantUserId`.
  - `users`: `id`, `unionId`, `name`, `email` *(sin constraint UNIQUE)*, `passwordHash`, `role`.
  - `categories`: `id`, `name`, `icon`, `color`, `sortOrder`.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **SEC-COM-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:630-654`) | **Fuga de hash de contraseña (Password Hash Leak):** `admin.createMerchant` retorna `userResult[0]`, que incluye `passwordHash` (hash bcrypt) directamente en la respuesta JSON tRPC al frontend. |
| **SEC-COM-02** | 🔴 CRÍTICA | Backend (`commerce-router.ts:49-85`) | **Vulnerabilidad BOLA / IDOR en Comercios:** `commerce.update` y `commerce.toggleStatus` usan `merchantQuery`, pero **nunca verifican si `commerce.merchantUserId === ctx.merchant.id`**. Cualquier comercio autenticado puede modificar datos, abrir/cerrar o forzar su comisión a `0.00%` en comercios ajenos. |
| **SEC-COM-03** | 🟡 ALTA | DB / Backend (`schema.ts:16`, `admin-router.ts:620`) | **Emails duplicados rompen autenticación:** `users.email` no tiene `.unique()`. Si se crea un comercio con un email ya registrado, se inserta duplicado y el nuevo comerciante queda bloqueado sin poder loguearse. |
| **SEC-COM-04** | 🟢 MEDIA | Backend (`commerce-router.ts:10,24`) | **Exposición de tasas privadas de comisión:** `commerce.list` y `getById` devuelven `select().from(commerces)` en `publicQuery`, exponiendo `commissionRate` al público/scraping. |
| **MATH-COM-01** | 🟡 ALTA | Backend (`admin-router.ts:736-747`) | **Comisión rota en pedidos multi-comercio:** Se toma únicamente la comisión del primer comercio (`coms[0]`) y se aplica a todo el subtotal del pedido. |
| **MATH-COM-02** | 🟡 ALTA | DB / Backend (`admin-router.ts:402`, `Commerces.tsx:621`) | **Riesgo de Crash SQL en `commissionRate` y `rating`:** No se valida numéricamente en Zod ni en el front. Texto o valores > 999 en `commissionRate` o strings vacíos en `rating` causan error fatal 500 en PostgreSQL. |
| **LOG-COM-01** | 🟡 ALTA | Negocio / DB / Frontend | **Inexistencia total de Radio de Entrega (`deliveryRadius`):** No existe columna de radio ni validación de distancia. Clientes a 100 km pueden ordenar con tarifa estándar. Además, los comercios nacen con `lat`/`lng` en `NULL` porque el admin no tiene selector cartográfico. |
| **BUG-COM-01** | 🟡 ALTA | Frontend (`Commerces.tsx:97`) | **Falla de Foreign Key al crear Merchant:** Si no se selecciona categoría, `Number("")` da `0`, que el backend inserta como `categoryId: 0`, causando violación de FK y abortando la creación. |
| **DATA-COM-01** | 🟡 ALTA | Backend (`admin-router.ts:937-987`) | **Destrucción de historial contable en borrado:** `deleteCommerce` ejecuta borrado físico en cascada de órdenes y `driverEarnings`, borrando la trazabilidad financiera histórica. |

---

## Ruta 3: `/admin/drivers` - Gestión de Repartidores
*(Auditoría completada por Subagente 3)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx`: Ruta `/admin/drivers` bajo `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Drivers.tsx`: Tabla desktop y tarjetas móviles de choferes, badges de estado (Online, Ocupado, Desconectado), modal alta/edición de choferes, disparador de eliminación.
  - `app/src/components/PhoneInput.tsx`: Componente de prefijo de país (`+54`, etc.) e input numérico.
  - `app/src/components/AdminLayout.tsx`: Contenedor maestro con barra lateral de navegación.
- **Backend tRPC:**
  - `app/server/admin-router.ts`:
    - `admin.createDriver` (`adminQuery`): Hashea contraseña con bcrypt, normaliza teléfono e inserta en `drivers`.
    - `admin.updateDriver` (`adminQuery`): Actualiza datos de `drivers` y rehashea contraseña si se envía.
    - `admin.deleteDriver` (`adminQuery`): Transacción SQL que desvincula pedidos (`driverId: null`), elimina registros de `driverEarnings` y borra el repartidor de `drivers`.
    - `admin.driverPerformance` (`adminQuery`): Lista repartidores y mapea `earnings` desde `d.totalEarnings`.
    - `admin.driverEarningsBreakdown` (`adminQuery`): Agrupa montos por repartidor desde `driverEarnings`.
  - `app/server/driver-router.ts`: `list`, `getById`, `getProfile` (`publicQuery`), `getEarnings` (`driverQuery`).
- **Tablas de Base de Datos (Drizzle ORM):**
  - `drivers`: `id`, `name`, `phone`, `passwordHash`, `vehicle`, `licensePlate`, `status`, `currentLat`, `currentLng`, `rating`, `totalEarnings`, `commissionRate`, `fcmToken`.
  - `orders`: `driverId`, `status`, `deliveryFee`, `driverSettled`.
  - `driverEarnings`: `id`, `driverId`, `orderId`, `amount`, `type`, `date`.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **BUG-DRV-01** | 🔴 CRÍTICA | Frontend (`Drivers.tsx:47`) | **`setDriverList is not defined` (ReferenceError):** Al borrar un repartidor, invoca `setDriverList(...)` que no existe en el componente. Lanza un crash capturado por alert, haciendo creer al usuario que falló cuando el chofer ya fue borrado en BD. Tampoco invalida la caché de React Query. |
| **BUG-DRV-02** | 🔴 CRÍTICA | Componente (`PhoneInput.tsx:60-68`) / Backend | **Duplicación y corrupción del prefijo telefónico (`5454...`):** `PhoneInput` busca prefijo con `+54`, pero la BD guarda dígitos crudos (`54...`). Al editar, no coincide, añade otro prefijo `+54` y guarda `5454911...`. El chofer queda **bloqueado de por vida sin poder loguearse**. |
| **SEC-DRV-01** | 🔴 CRÍTICA | Backend (`driver-router.ts:10-37`) | **Fuga masiva de datos sensibles (`publicQuery`):** `driver.list`, `getById` y `getProfile` son públicos y ejecutan `SELECT * FROM drivers`, exponiendo **`passwordHash` (bcrypt), `fcmToken`, coordenadas GPS en tiempo real (`currentLat`, `currentLng`), teléfono y comisiones** a cualquier persona en internet sin sesión. |
| **SEC-DRV-02** | 🔴 CRÍTICA | Backend (`driver-router.ts:98-140`) | **IDOR masivo en endpoints de choferes:** `getEarnings`, `getActiveOrders`, `getOrderHistory`, `updateStatus`, `updateLocation` y `updateProfile` reciben `id` arbitrario sin verificar que coincida con `ctx.driver.id`. Cualquier chofer puede alterar la ubicación de otro o espiar direcciones de clientes. |
| **MATH-DRV-01** | 🟡 ALTA | DB / Backend (`schema.ts:91`) | **`drivers.totalEarnings` permanentemente en `$0.00`:** Ninguna mutación en todo el sistema actualiza este acumulador. Reportes de administración exportan ganancias en `$0.00` para todos los choferes. |
| **DATA-DRV-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:992-1003`) | **Destrucción contable y pedidos en limbo por borrado:** `deleteDriver` destruye físicamente el historial contable de `driverEarnings` (alterando retroactivamente balances de la empresa) y deja pedidos en curso (`on_the_way`) con `driverId = null` varados para siempre. |

---

## Ruta 4: `/admin/orders` - Gestión y Monitoreo de Pedidos
*(Auditoría completada por Subagente 4)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx`: Ruta `/admin/orders` bajo `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Orders.tsx` (506 líneas): Tabla de pedidos desktop y tarjetas mobile, filtros por estado (`pending_payment`, `received`, etc.), modal de comprobante de transferencia y botones de liquidación financiera directa ("Saldado" / "Pendiente").
  - `app/src/components/AdminLayout.tsx`: Cáscara de administración.
- **Hooks & Tiempo Real:**
  - `useAdminOrders()`, `useAdminOrderDetail()`, `useAdminUpdateOrderStatus()`, `useAdminAssignDriver()`.
  - `app/src/hooks/useAdminSSE.ts`: EventSource a `/api/events/admin-dashboard` para invalidar queries automáticamente.
  - `app/src/hooks/useOrderEvents.ts`: Canales `/api/events/orders/:id`, `/api/events/commerce/:id`, `/api/events/driver/:id`.
- **Backend tRPC & Servidor:**
  - `app/server/admin-router.ts`:
    - `admin.orders` (L702-L784): Procedimiento `adminQuery` que extrae todos los pedidos con sus ítems, comercios y repartidores.
    - `admin.orderDetail` (L808-L833): Detalle de un pedido.
    - `admin.updateOrderStatus` (L835-L895): Mutación de estado e historial.
    - `admin.assignDriver` (L897-L935): Asignación directa con `.for("update")`.
    - `admin.toggleCommerceSettled`, `admin.toggleDriverSettled` (L786-L806).
  - `app/server/order-router.ts`:
    - `order.create`, `order.updateStatus`, `order.markCommerceReady`, `order.list`, `order.getById`.
  - `app/server/boot.ts` & `app/server/events.ts`: SSE stream y bus de eventos en memoria.
- **Tablas de Base de Datos (Drizzle ORM):**
  - `orders`: `id`, `customerId`, `driverId`, `status`, `subtotal`, `deliveryFee`, `total`, `paymentMethod`, `paymentReceipt`, `commerceSettled`, `driverSettled`, `pickedUpCommerceIds`.
  - `orderItems`: Ítems con `productId`, `commerceId`, `quantity`, `unitPrice`, `total`.
  - `orderStatusHistory`: Auditoría histórica de cambios de estado.
  - `orderCommerceStatus`: Estados por comercio en pedidos multi-tienda.
  - `driverEarnings`: Ganancias de los repartidores.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **BUG-ORD-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:838`) | **`payment_rejected` omitido en el Zod schema:** En `Orders.tsx:103`, el admin pulsa "Rechazar comprobante", pero el backend rechaza la petición con error Zod `Invalid enum value` porque `payment_rejected` no existe en la lista de estados permitidos. |
| **SEC-ORD-01** | 🔴 CRÍTICA | Backend (`order-router.ts:233,473,118`) | **Procedimientos públicos sin autenticación:** `order.updateStatus`, `order.list` y `order.getById` están declarados como `publicQuery`. Cualquier usuario no autenticado en internet puede listar pedidos, ver nombres y direcciones de clientes, o cambiar el estado de cualquier pedido. |
| **MATH-ORD-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:856-881`) | **Falta de acreditación a repartidores y liberación al marcar `delivered`:** Si el admin marca un pedido como `delivered`, a diferencia de `order-router.ts`, el admin-router **NO inserta en `driverEarnings` ni pasa al repartidor a estado `online`**. El repartidor queda atrapado en `busy` y sin sus ganancias. |
| **LOG-ORD-01** | 🟡 ALTA | Backend (`admin-router.ts:910`) | **Imposibilidad de reasignar repartidor:** `admin.assignDriver` lanza `throw new Error("Pedido ya tiene repartidor asignado")` si `order.driverId` existe. Si un chofer se accidenta o cancela, el admin no puede reasignar el pedido. Además, no se emite SSE a cliente ni chofer. |
| **MATH-ORD-02** | 🟡 ALTA | Backend (`admin-router.ts:734-742`) | **Cálculo financiero erróneo en pedidos multi-comercio:** `admin.orders` toma únicamente la tasa de comisión del primer comercio (`coms[0]`) y la aplica al subtotal global, calculando saldos y liquidaciones erróneas para pedidos con productos de diferentes tiendas. |
| **UI-ORD-01** | 🟢 MEDIA | Frontend (`Orders.tsx`) | **Falta de controles de despacho:** La interfaz no expone selector para asignar choferes ni para forzar estados intermedios; solo permite ver detalles y validar comprobantes de pago. |
| **PERF-ORD-01** | 🟡 ALTA | Backend (`admin-router.ts:702-784`) | **Patrón N+1 masivo en `admin.orders`:** Realiza consultas individuales por cliente, repartidor, ítems y comercios para cada pedido en memoria (~400 consultas por cada 100 pedidos). |

---

## Ruta 5: `/admin/products` - Catálogo Global de Productos
*(Auditoría completada por Subagente 5)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx` (L121): Ruta `<Route path="/admin/products" ... />` envuelta en `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Products.tsx`: Vista con 2 tabs: *"Más vendidos"* (`activeTab === 'ranking'`) y *"Todos los productos"* (`activeTab === 'all'`).
  - `app/src/components/AdminLayout.tsx`: Layout del panel admin con barra lateral y superior.
- **Backend tRPC:**
  - `app/server/admin-router.ts`:
    - `admin.topProducts` (L197-L222): Procedimiento bajo `adminQuery` para calcular ranking histórico.
    - `admin.listProducts` (L373-L394): Procedimiento bajo `adminQuery` para listar todos los productos con `leftJoin(commerces)`.
  - `app/server/product-router.ts`: Contiene mutaciones `create`, `update`, `delete`, pero **ninguna es accesible por el Admin** (están bajo `merchantQuery`).
  - `app/server/category-router.ts`: Listado de categorías del comercio.
  - `app/server/middleware.ts`: `adminQuery` vs `merchantQuery`.
- **Tablas de Base de Datos (Drizzle ORM):**
  - `products`: `id`, `commerceId` (FK con onDelete: cascade), `name`, `description`, `price` (numeric 10,2), `category` (texto libre), `unitType` (varchar 20 default 'unit'), `isAvailable`, `isFeatured`.
  - `commerces`: `id`, `name`, `categoryId`, `status`, `isOpen`, `merchantUserId`.
  - `orderItems`: `orderId`, `productId`, `commerceId`, `quantity`, `unitPrice`, `total`. *(Sin ON DELETE CASCADE ni SET NULL en productId)*.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **PERF-01** | 🔴 CRÍTICA | Backend (`admin-router.ts:200-222`) | **Antipatrón N+1 masivo en memoria:** `admin.topProducts` carga TODOS los `orderItems` de la historia sin paginar y ejecuta un `db.select()` a `commerces` por cada producto único en un bucle `for`. Causará timeout con volumen real de pedidos. |
| **MATH-01** | 🟡 ALTA | Backend (`admin-router.ts:200`) | **Cómputo indiscriminado de ventas:** El ranking suma `orderItems` sin filtrar por estado del pedido. Órdenes canceladas o rechazadas se suman al volumen vendido y recaudación. |
| **SEC-01** | 🔴 CRÍTICA | Backend (`product-router.ts:62-181`) | **Vulnerabilidad BOLA / IDOR:** Las mutaciones de productos (`create`, `update`, `delete`) exigen `merchantQuery`, pero **nunca verifican si el producto o comercio pertenece al `ctx.merchant.id`**. Cualquier comercio autenticado puede modificar precios o borrar productos de otros comercios. |
| **SEC-02** | 🟡 ALTA | Backend / Frontend | **Admin desprovisto de permisos de moderación:** La vista `/admin/products` es 100% solo lectura y en `admin-router.ts` no existen mutaciones para que el admin pueda dar de baja o editar productos fraudulentos sin borrar el comercio entero. |
| **VAL-01** | 🟡 ALTA | Backend (`product-router.ts:68,107`) / DB | **Validación de precios deficiente:** Zod solo valida `z.string()` sin regex numérico ni chequeo de valor positivo. La BD carece de `CHECK (price >= 0)`. Precios negativos se propagarían al carrito y descontarían saldo. |
| **UI-01** | 🟢 MEDIA | Frontend (`Products.tsx:142,169`) | **Categoría en Ranking siempre muestra `"-"`:** `admin.topProducts` omite la propiedad `category` en el objeto devuelto, haciendo que la columna categoría siempre sea nula en el frontend. |
| **UI-02** | 🟢 MEDIA | Frontend (`Products.tsx`) | **Invisibilidad del Tipo de Unidad (`unitType`):** Aunque el backend devuelve `unitType`, la tabla del admin no lo muestra. Un precio de `$8.000` no aclara si es por kilo (`/kg`) o por unidad (`/u`). |
| **UI-03** | 🟢 MEDIA | Frontend (`Products.tsx`) | **Filtros inexistentes por Comercio o Categoría:** Solo existe un input de texto que filtra en memoria del navegador. No se puede filtrar por tienda madre ni por rubro. |
| **DB-01** | 🟡 ALTA | Base de Datos (`schema.ts:186`) | **Bloqueo por Foreign Key en `orderItems`:** `orderItems.productId` no tiene `ON DELETE SET NULL`. Si un producto tiene ventas históricas, la base de datos rechaza su eliminación por constraint 23503. |

---

## Ruta 6: `/admin/settings` - Configuración Global del Sistema
*(Auditoría completada por Subagente 6)*

### 1. Mapa de Dependencias y Flujo de Datos
- **Frontend Vistas & Layout:**
  - `app/src/App.tsx`: Ruta `/admin/settings` protegida por `<SessionGuard role="admin">`.
  - `app/src/pages/admin/Settings.tsx` (352 líneas): Formulario de ajustes de plataforma (nombre de app, soporte, delivery fee, pedido mínimo, datos bancarios), exportador de reportes PDF y Excel (jsPDF + XLSX).
  - `app/src/components/AdminLayout.tsx`: Navegación admin.
- **Backend tRPC:**
  - `app/server/admin-router.ts`:
    - `admin.settings` (`adminQuery`): devuelve pares clave/valor de `appSettings`.
    - `admin.updateSetting` (`adminQuery`): actualiza o inserta un registro en `appSettings`.
    - `admin.getReports` (`adminQuery`): genera data para exportación contable.
  - `app/server/settings-router.ts`:
    - `settings.getPublic` (`publicQuery`): expone todas las configuraciones al público general sin autenticación.
- **Tablas de Base de Datos (Drizzle ORM):**
  - `appSettings` (`app_settings`): `id`, `key` (varchar 100 unique not null), `value` (text), `updatedAt` (timestamp).
- **Impacto Transversal en otros módulos:**
  - `app/src/pages/customer/Cart.tsx`: Consume `settings.getPublic` para calcular en el cliente `deliveryFee` y `commission`.
  - `app/server/order-router.ts`: Recibe montos de envío y comisión calculados por el cliente.

### 2. Hallazgos Críticos y Vulnerabilidades Quirúrgicas

| Código | Severidad | Capa | Descripción del Hallazgo |
|---|---|---|---|
| **SEC-SET-01** | 🔴 CRÍTICA | Backend (`settings-router.ts:5-13`) | **Fuga masiva de configuración (`SELECT *` en `publicQuery`):** `settings.getPublic` devuelve todas las filas de `app_settings` sin filtrar. Si se añaden claves de API (MercadoPago, Resend, JWT, etc.), se filtran de inmediato a cualquier usuario de internet. |
| **SEC-SET-02** | 🔴 CRÍTICA | Cliente / Backend (`Cart.tsx:106`, `order-router.ts:25-66`) | **Cálculo de tarifas financieras delegado en el cliente:** El cliente calcula el costo de envío y la comisión en el navegador y los envía al backend. El backend los acepta a ciegas sin recalcularlos contra las reglas de la base de datos (un atacante puede enviar `deliveryFee: "0.01"`). |
| **MATH-SET-01** | 🟡 ALTA | DB / Frontend / Backend | **Incoherencia de monedas y fallbacks (ARS vs USD):** Seeds iniciales usan Pesos Argentinos (`delivery_fee: "500"`), mientras que el código fuente hardcodea fallbacks en USD (`delivery_fee: "2.50"`). Si la DB arranca limpia, los pedidos se cobran en dólares fraccionarios. |
| **LOG-SET-01** | 🟡 ALTA | Negocio / Frontend / Backend | **Configuraciones "Placebo" sin efecto real:** `min_order_amount` se edita en settings pero ningún endpoint ni pantalla de checkout bloquea compras menores al mínimo. `app_name` se edita pero el texto "YA LLEGA" está quemado en más de 20 archivos TSX. |
| **LOG-SET-02** | 🟡 ALTA | Negocio / Legal (`TermsAndConditions.tsx:115`) | **Tarifa por kilómetro inexistente:** Los Términos y Condiciones prometen cálculo según distancia, pero en la realidad el delivery fee es 100% plano y fijo independientemente de los kilómetros. |
| **VAL-SET-01** | 🟡 ALTA | Backend (`admin-router.ts:413`) | **Falta de validación de tipos y rangos en Zod:** `updateSetting` solo valida `z.string()`. Un valor no numérico en `delivery_fee` hace que `Cart.tsx` evalúe a `NaN` y cause un crash SQL 500 en la creación de todas las órdenes. |
| **DATA-SET-01** | 🟢 MEDIA | Frontend (`Settings.tsx:173`) | **Guardado no atómico (5 llamadas concurrentes):** Guarda los 5 ajustes mediante `Promise.all` desincronizadas en vez de una sola transacción atómica `admin.updateSettingsBulk`. |

---

## 7. MATRIZ CONSOLIDADA DE VULNERABILIDADES Y ERRORES MATEMÁTICOS DEL SISTEMA ADMIN

A continuación se presenta la tabla resumen de todas las brechas detectadas por los 6 subagentes en su auditoría integral:

### 🔴 Vulnerabilidades y Errores Críticos (P0)

1. **SEC-01 (Fuga Masiva de Hashes y GPS en Repartidores):** `driver.list`, `getById` y `getProfile` son `publicQuery` que retornan `SELECT *`, exponiendo `passwordHash` (bcrypt), `fcmToken`, ubicación GPS en vivo (`currentLat`, `currentLng`) y teléfonos sin autenticación.
2. **SEC-02 (IDOR Masivo en Comercios):** `commerce.update` y `commerce.toggleStatus` permiten a cualquier comerciante alterar datos, estado (`status: "active"`) y autoasignarse comisión `0.00%` en comercios ajenos.
3. **SEC-03 (IDOR Masivo en Repartidores):** `getEarnings`, `getActiveOrders`, `getOrderHistory`, `updateLocation`, `updateStatus` permiten a cualquier repartidor ver órdenes ajenas o suplantar coordenadas GPS de otros.
4. **SEC-04 (BOLA/IDOR en Productos):** `product.create`, `update`, `delete` no verifican si el producto pertenece al comerciante autenticado.
5. **SEC-05 (Manipulación de Pedidos en `publicQuery`):** `order.updateStatus`, `order.list` y `order.getById` son públicos; cualquiera puede listar direcciones de clientes o modificar estados de órdenes.
6. **SEC-06 (SSE sin Autenticación):** `/api/events/admin-dashboard` acepta conexiones de cualquier cliente anónimo sin verificar cookies de admin.
7. **SEC-07 (Fuga de Secretos en `settings.getPublic`):** Devuelve `SELECT *` de la tabla de configuraciones sin lista blanca.
8. **SEC-08 (Hash Leaks en Retornos de Altas):** `admin.createMerchant`, `createDriver` y `updateDriver` devuelven el objeto completo con `passwordHash` al frontend.
9. **BUG-01 (Crash Fatal en Borrado de Chofer):** `Drivers.tsx:47` invoca `setDriverList(...)` (inexistente), disparando un `ReferenceError` y rompiendo el flujo.
10. **BUG-02 (Corrupción de Teléfonos en `PhoneInput.tsx`):** Al editar un chofer, el prefijo internacional se duplica (`5454...`), bloqueando su acceso de por vida.
11. **BUG-03 (Botón "Rechazar Pago" Roto en Pedidos):** `admin.updateOrderStatus` omitió `payment_rejected` en su Zod enum, haciendo fallar la acción con error de validación.
12. **MATH-01 (Ingresos Inflados en Dashboard):** `admin.dashboard` suma pedidos cancelados y rechazados a la facturación total.
13. **MATH-02 (Comisiones Desconectadas):** `orders.commission` se guarda como `"0.00"` en creación; los KPI cards muestran `$0.00` y contradicen las gráficas.
14. **MATH-03 (Choferes no cobran por entregas del Admin):** Si el admin marca un pedido como `delivered`, no se acredita `driverEarnings` y el chofer queda atrapado en `busy`.
15. **MATH-04 (Comisión Rota en Pedidos Multi-Comercio):** Se aplica la tasa del primer comercio a todo el subtotal del pedido.
16. **DATA-01 (Destrucción Financiera en Borrado):** `deleteCommerce` y `deleteDriver` borran físicamente `driverEarnings` y órdenes históricas, corrompiendo la contabilidad histórica de la plataforma.

---

### 📋 Estado de la Auditoría
- **Rutas analizadas:** 6 de 6 (100% completado).
- **Archivos fuente modificados durante la auditoría:** 0 (Modo 100% de solo lectura respetado rigurosamente).
- **Próximo paso:** Presentar el mapa completo y el ledger consolidado al usuario para coordinar la fase de blindaje y resolución técnica estructurada.

