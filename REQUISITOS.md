# REQUISITOS DEL SISTEMA — Plataforma de Delivery Multi-Comercio

## Objetivo General

Crear una aplicación móvil y plataforma administrativa que conecte clientes, comercios y repartidores dentro de una ciudad. Los usuarios compran productos de distintos comercios desde una sola app; los comercios gestionan sus pedidos; los repartidores realizan las entregas.

---

## ACTORES DEL SISTEMA (4 roles)

| Rol | App | Login |
|-----|-----|-------|
| Cliente | App móvil | Se registra con nombre+apellido+celular+dirección → auto-login |
| Comercio | Panel web | Login con email + contraseña (lo crea el admin) |
| Repartidor | App móvil | Login con teléfono + contraseña (lo crea el admin) |
| Administrador | Panel web | Login con email + contraseña (definido en .env, se crea automáticamente al iniciar el sistema) |

---

## MÓDULO 1: APLICACIÓN PARA CLIENTES

### Pantalla de Bienvenida (ruta: `/`)
- Logo de la empresa
- Nombre de la aplicación
- Botón **"Crear cuenta"** → lleva a `/register`
- _No incluir_ "Iniciar sesión" ni "Continuar como invitado"

### Registro (ruta: `/register`)
- Nombre y apellido
- Número de celular
- Dirección principal
- Al registrarse → auto-login → redirige a `/home`
- _No incluir_ correo electrónico, contraseña, ni inicio con Google

### Login general (ruta: `/login`)
- Solo para: admin, comercios y repartidores
- Campo: email o teléfono + contraseña
- _No hay SMS de verificación_ (omitido por costo)

### Pantalla Principal (ruta: `/home`)
- Barra de búsqueda superior: "¿Qué deseas pedir hoy?"
- Categorías: Comidas, Panaderías, Supermercados, Farmacias, Heladerías, Bebidas, Mascotas, Otros
- Productos populares (destacados de todos los comercios): foto, nombre, precio, comercio, botón "Agregar"
- Lista de comercios: logo, portada, estado (abierto/cerrado), tiempo estimado, calificación, pedido mínimo + productos destacados debajo

### Perfil del Comercio (ruta: `/commerce/:id`)
- Logo, portada, horarios, tiempo estimado, info del comercio
- Productos organizados por categorías: foto, nombre, descripción, precio, botón "Agregar"

### Carrito Multi-Comercio (ruta: `/cart`)
- Productos de distintos comercios en un mismo carrito
- Cantidades, subtotal, costo de envío, comisión, total final
- Botón "Confirmar pedido"

### Método de Pago
- Opciones: Efectivo, Transferencia Bancaria
- _Futuro:_ Mercado Pago, tarjetas, PayPal

### Seguimiento del Pedido (ruta: `/order/:id`)
- Estados: Recibido → Aceptado → Preparando → Repartidor asignado → En camino → Entregado
- Barra de progreso

### Mapa en Tiempo Real
- Ubicación del cliente, del repartidor, ruta de entrega, tiempo estimado

### Chat (ruta: `/chat/:orderId`)
- Cliente ↔ Comercio
- Cliente ↔ Repartidor

### Perfil del Cliente (ruta: `/profile`)
- Datos personales, dirección, historial de pedidos

### Función Diferenciadora: Pedido Multi-Comercio
- El cliente agrega productos de distintos comercios en un mismo carrito
- Todo en una sola compra y una sola entrega
- El sistema divide internamente en sub-pedidos por comercio

---

## MÓDULO 2: APLICACIÓN PARA REPARTIDORES

### Pantalla de Inicio (ruta: `/driver`)
- Pedidos disponibles con: distancia, ganancia estimada, comercio, dirección de entrega
- Botón "Aceptar pedido"

### Pedido Activo (ruta: `/driver/order/:id`)
- Info: comercio, cliente, dirección, teléfono
- Estados: Camino al comercio → Esperando pedido → Camino al cliente → Entregado
- Navegación con Google Maps (botón "Abrir ruta")

### Historial y Ganancias (ruta: `/driver/earnings`)
- Pedidos realizados, ganancias diarias/semanales/mensuales

### Perfil (ruta: `/driver/profile`)

---

## MÓDULO 3: PANEL PARA COMERCIOS

### Dashboard (ruta: `/commerce`)
- Ventas del día, del mes, pedidos recibidos, pendientes, completados

### Gestión de Pedidos (ruta: `/commerce/orders`)
- Notificación instantánea al llegar un pedido
- Número de pedido, cliente, productos, total, hora
- Botones: Aceptar / Rechazar

### Seguimiento del Repartidor
- Nombre, teléfono, estado, ubicación en tiempo real

### Gestión de Productos (ruta: `/commerce/products`)
- Crear, editar, eliminar productos
- Cambiar precios, subir fotos

### Estadísticas (ruta: `/commerce/stats`)
- Productos más vendidos, ventas diarias/mensuales, ticket promedio, cantidad de pedidos

---

## MÓDULO 4: PANEL ADMINISTRATIVO GENERAL

### Dashboard Principal (ruta: `/admin`)
- En tiempo real: pedidos totales, comercios activos/registrados, repartidores activos, clientes registrados, facturación total, ganancias por comisión

### Gestión de Comercios (ruta: `/admin/commerces`)
- Aprobar, suspender, editar info, ver historial

### Gestión de Repartidores (ruta: `/admin/drivers`)
- Crear, editar, ver historial
- Mapa en tiempo real: conectados, ocupados, desconectados

### Gestión de Órdenes (ruta: `/admin/orders`)
- Todas las órdenes del sistema

### Gestión de Productos (ruta: `/admin/products`)
- Todos los productos del sistema

### Configuración (ruta: `/admin/settings`)
- Comisión por comercio, comisión global, costo de envío

### Estadísticas y Reportes
- Ventas por día/semana/mes/año — gráficos interactivos
- Rankings: categorías más vendidas, comercios más vendidos, productos más vendidos
- Exportar a PDF y Excel: ventas, pedidos, comercios, repartidores, ganancias, comisiones

---

## STACK TÉCNICO (ya implementado)

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 20 |
| Frontend | React + Vite 7 + Tailwind CSS 3.4 + shadcn/ui |
| Backend | tRPC + TypeScript |
| Base de datos | PostgreSQL + Drizzle ORM |
| Autenticación clientes | JWT httpOnly cookies (access 15min + refresh 30d) |
| Autenticación admin/comercios/repartidores | Email/teléfono + contraseña (sin cookie, response JSON) |
| PWA | Instalable (manifest + service worker + iconos) |
| Imágenes | URLs desde la base de datos (Sin stock images en public/) |

---

## DISEÑO VISUAL

- **Estilo:** Moderno, limpio, profesional
- **Color principal:** Verde
- **Fondo:** Blanco
- **Textos:** Negro
- **Secciones secundarias:** Gris claro
- **Inspiración:** PedidosYa, iFood, Uber Eats — navegación simple, fotos grandes, botones visibles

---

## NOTAS IMPORTANTES PARA EL DESARROLLADOR

1. **Pantalla de bienvenida:** Solo nombre de la app + botón "Crear cuenta". Sin otras opciones.
2. **Registro de clientes:** Solo nombre, apellido, celular, dirección. Sin email, sin contraseña, sin Google.
3. **Login:** Existe para admin, comercios y repartidores (email/teléfono + contraseña). SMS omitido por costo.
4. **Admin inicial:** se define con `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env`. No hay credenciales por defecto; usa una contraseña única y no reutilices valores de ejemplo.
5. **PWA:** El prompt de instalación se muestra justo después del registro exitoso.
6. **Pedido multi-comercio:** Es la función estrella — un carrito, productos de varios comercios, una sola entrega.
7. **Rutas definidas en:** `ROUTES.md`
