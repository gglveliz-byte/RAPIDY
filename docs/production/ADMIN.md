# E2E de producción — Admin

## Objetivo

Verificar el panel administrativo completo (navegador + API) contra un entorno
desplegado, sin reiniciar el servidor ni ejecutar migraciones. El smoke cubre:

- Login admin por API y navegador.
- Dashboard y endpoints que alimentan sus KPIs.
- Rutas `/admin`, `/admin/commerces`, `/admin/drivers`, `/admin/orders`,
  `/admin/products` y `/admin/settings`.
- Listados de comercios, drivers, pedidos, productos y settings.
- Reportes exportables de ventas, pedidos, comercios, drivers, ganancias y
  comisiones.
- 401 anónimo, settings inválidos, revocación de sesión.
- Invariantes financieros: comisión snapshot, settlement multi-comercio,
  comisión de driver congelada al asignar y entrega idempotente.
- Driver offline/online y pausa administrativa de producto.

Archivo ejecutable: `scripts/production-admin-smoke.mjs`.

> No existe una ruta `/admin/reports`: los reportes se generan desde
> **Configuración → Reportes exportables**. El smoke valida la API y la
> presencia de los 12 botones PDF/Excel en esa pantalla.

## Requisitos

| Requisito | Detalle |
| --- | --- |
| Node.js | 20 o superior (`AbortSignal.timeout`, `fetch`, `getSetCookie`). |
| Servidor | Instancia ya levantada en `E2E_BASE_URL`. El script no inicia, reinicia ni compila nada. |
| Dependencias | Las del repo: `pg`, `dotenv`, `playwright-core`. No requiere instalación adicional. |
| Navegador | Chrome/Chromium compatible. Definir `CHROME_PATH` o tener el Chromium de Playwright en `%LOCALAPPDATA%\ms-playwright`. |
| Credenciales | `ADMIN_EMAIL` y `ADMIN_PASSWORD` de un administrador real. No usar credenciales de ejemplo ni commitear secretos. |
| Base de datos | `DATABASE_URL` con lectura/escritura para las validaciones completas y la limpieza. |
| Datos base | Al menos un cliente, un comercio con productos y, para settlement multi-comercio, dos comercios con productos. |
| Permisos SQL | `SELECT` sobre catálogo/pedidos; `INSERT/DELETE` en `orders`, `order_items`, `order_commerce_status`, `order_status_history`, `driver_earnings`, `drivers`; `UPDATE` en `drivers`, `products`, `commerces`, `app_settings`. |
| Ventana | Ejecutar en horario de baja demanda: la prueba cambia temporalmente tasa de comisión y disponibilidad de un producto. |

Variables opcionales:

- `E2E_BASE_URL`: por defecto `http://localhost:3000`.
- `E2E_ADMIN_ALLOW_WRITES=1`: obligatorio para host remoto. En localhost las
  escrituras están habilitadas por defecto.
- `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD`: habilita la comprobación
  adicional de que un merchant no puede revertir la pausa administrativa. Deben
  pertenecer al comercio del primer producto probado.
- `E2E_ADMIN_SCREENSHOTS=1`: guarda una captura del dashboard en
  `test-flow-screenshots/production-admin/`.

## Ejecución

### Local (escrituras habilitadas)

```powershell
node scripts\production-admin-smoke.mjs
```

### Producción / remoto (ventana autorizada)

```powershell
$env:E2E_BASE_URL="https://<host>"
$env:ADMIN_EMAIL="<admin-email>"
$env:ADMIN_PASSWORD="<admin-password>"
$env:DATABASE_URL="postgresql://<usuario>:<clave>@<host>:<puerto>/<db>?sslmode=verify-full"
$env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:E2E_ADMIN_ALLOW_WRITES="1"
node scripts\production-admin-smoke.mjs
```

### Solo lectura (post-deploy rápido)

Sin `E2E_ADMIN_ALLOW_WRITES=1` contra un host remoto, el script valida login,
rutas, dashboard, listados, reportes, 401 y settings inválidos, pero omite:

- Comisión snapshot, driver online, entrega idempotente, settlement y pausa de
  producto (requieren escritura y `DATABASE_URL`).
- Revocación de sesión (incrementa `sessionVersion` y cierra todas las sesiones
  admin).

La salida indica cada omisión con `SKIP`. Un `SKIP` no es un fallo, pero la
aceptación completa exige ejecutar con escrituras y revisar que los `SKIP`
restantes sean justificados.

## Criterios de aceptación

1. `RESULT n/n PASS` y código de salida `0`.
2. Cero `FAIL`; los `SKIP` deben corresponder a credenciales merchant no
   configuradas o a la comprobación visual de settlement sin pedidos entregados.
3. Login admin redirige a `/admin`; recargar conserva la sesión.
4. Las seis rutas cargan con su encabezado correcto y sin errores JS.
5. `admin.dashboard` y todos sus endpoints auxiliares responden `200`.
6. El listado de pedidos y los reportes no exponen `paymentReceipt`; los
   listados no exponen `passwordHash`, `fcmToken` ni `idempotencyKey`.
7. Settings rechaza negativos, coma decimal, texto, montos fuera de rango,
   nombre vacío, clave desconocida y claves duplicadas; acepta un valor válido.
8. Reportes responden para los seis tipos y rechazan rango invertido o mayor a
   2 años.
9. Comisión snapshot no cambia al modificar la tasa del comercio, ni en
   `admin.orders`, ni en el detalle, ni en el reporte de comisiones.
10. Entrega repetida no reescribe `delivered_at`, no duplica historial ni
    ganancias; el driver vuelve a `online`.
11. Driver offline no se asigna; driver online sí, queda `busy` y la ganancia
    usa la tasa congelada al asignar (`75.00` → `1.88` sobre envío `2.50`).
12. Settlement por comercio liquida solo el elegido; la liquidación total marca
    el pedido como conciliado.
13. Pausa admin deja `admin_paused=true` e `isAvailable="no"`.
14. Logout invalida access token (`401`), `checkAuth` y `refresh`; el panel
    redirige a `/login`.
15. Limpieza final: `0` pedidos y `0` drivers temporales; producto, tasa y
    settings restaurados.

Referencia local (2026-11-13): `68/68 PASS, 2 SKIP` (credenciales merchant no
configuradas y comprobación visual de settlement sin pedidos entregados).

## Datos temporales y limpieza

Cada ejecución usa un `RUN_ID` y el marcador:

```text
Smoke admin prod <runId>
```

Se usan en `orders.delivery_address` y en `drivers.name`. El bloque `finally`:

1. Elimina `driver_earnings` y pedidos temporales.
2. Elimina drivers temporales por nombre.
3. Restaura `products.is_available/admin_paused` y
   `commerces.commission_rate`.
4. Restaura los valores originales de `app_settings`.
5. Verifica que no queden pedidos ni drivers con el marcador.

Si el proceso se interrumpe de forma abrupta (SIGKILL, corte de red o cierre de
la terminal), revisar y limpiar manualmente:

```sql
select id, status, delivery_address
  from orders
 where delivery_address like 'Smoke admin prod %';

delete from driver_earnings
 where order_id in (
   select id from orders where delivery_address like 'Smoke admin prod %'
 );
delete from orders where delivery_address like 'Smoke admin prod %';
delete from drivers where name like 'Smoke admin prod %';
```

La tasa de comisión, la disponibilidad del producto y los settings se restauran
en memoria durante la ejecución; si hubo un corte abrupto, comparar contra los
valores anotados antes de la ventana o revisar el historial operativo.

## Impacto y seguridad

- La prueba de revocación cierra **todas** las sesiones admin del usuario
  probado (`sessionVersion`). Coordinar con el operador y volver a iniciar sesión
  al terminar.
- La tasa de comisión del primer comercio con producto se cambia temporalmente
  para demostrar el snapshot. Se restaura en `finally`.
- El producto probado se pausa temporalmente. Se restaura en `finally`.
- Los pedidos temporales se insertan directamente en la base para controlar
  estados y tiempos; por eso se exige `DATABASE_URL` y permisos de escritura.
- El script no imprime credenciales, tokens ni valores de settings. Solo muestra
  estados, IDs y mensajes de error del servidor.
- No hace commits, no cambia de rama, no ejecuta migraciones ni `db:push`, y no
  reinicia `localhost:3000`.

## Observaciones

- `admin.orderDetail` devuelve el comprobante (`paymentReceipt`) y la fila
  completa del cliente, que incluye `fcmToken`. El smoke solo exige que no se
  filtren credenciales del driver ni `idempotencyKey`; el listado y los reportes
  sí se validan sin comprobantes. Si se quiere endurecer, el cambio corresponde
  a `server/admin/orders-router.ts` (archivo no asignado a este frente).
- El script acepta valores numéricos como string o number en los KPIs, porque
  PostgreSQL puede devolver `COUNT(*)` como string según el driver/consulta.
- El aviso de `pg` sobre `sslmode=require/prefer` es informativo; para producción
  usar `sslmode=verify-full` cuando el proveedor lo soporte.

## Solución de problemas

| Síntoma | Causa probable | Acción |
| --- | --- | --- |
| `Faltan ADMIN_EMAIL / ADMIN_PASSWORD` | Variables no cargadas | Revisar `.env` o exportarlas en la sesión. |
| `Chrome/Playwright disponible — FAIL` | No se encontró navegador | Definir `CHROME_PATH` a un Chrome/Chromium real. |
| `MODO SEGURO` y varios `SKIP` | Host remoto sin flag | Repetir con `E2E_ADMIN_ALLOW_WRITES=1` en ventana autorizada. |
| `Anónimo recibe 401` falla | Proxy/CDN devuelve 200 con HTML o auth mal configurada | Verificar que `/api/trpc/*` llegue al servidor y no a un fallback SPA. |
| `Login admin falló` | Credenciales o rate limit | Verificar credenciales; tras 8 fallos hay bloqueo temporal de 15 min. |
| `Limpieza de datos temporales — FAIL` | Permisos SQL o FK inesperada | Revisar el detalle y ejecutar el SQL de limpieza manual. |
| `Settlement total concilia el pedido — SKIP` | Solo hay un comercio con productos | Es esperado; el settlement por comercio sí se valida. |
| `Merchant no revierte pausa admin — SKIP` | Faltan credenciales merchant | Configurar `E2E_MERCHANT_EMAIL/PASSWORD` del comercio probado. |