# Verificación del flujo Administración

**Fecha:** 2026-11-13  
**Resultado global:** flujo Admin corregido, migraciones `0010` y `0011`
aplicadas, API Admin 29/29 y navegador Admin 12/12.

## Comandos ejecutados

```bash
npx tsc -b --force                  # 0 errores
npm test                            # 9/9 OK
npm run lint                        # 0 errores, 321 warnings históricos
npm run build                       # OK
npm run db:generate                 # No schema changes
npm run db:migrate                  # 0010 y 0011 aplicadas
node scripts/admin-api-smoke.mjs    # 29/29 PASS
node scripts/e2e-admin-smoke.mjs    # 12/12 PASS
node scripts/e2e-theme-smoke.mjs    # 50/50 PASS (Driver + Admin, claro/oscuro)
node scripts/driver-api-smoke.mjs   # 16/16 PASS
node scripts/e2e-driver-smoke.mjs   # 8/8 PASS
node scripts/e2e-commerce-smoke.mjs # 20/20 PASS
node scripts/admin-smoke.mjs        # admin 200 / anon 401
npx tsx scripts/redirect-smoke.ts   # SESSION SURVIVED: true, 0 errores
```

## API Admin — 29/29

| Caso | Resultado |
|---|---|
| Login admin | PASS |
| Logout admin revoca refresh anterior | PASS |
| Re-login admin tras revocación | PASS |
| Settings rechaza envío negativo | PASS |
| Settings rechaza coma decimal | PASS |
| Settings acepta decimal válido | PASS |
| Settings rechaza clave desconocida | PASS |
| `admin.orders` responde paginado | PASS |
| `admin.orders` no expone `paymentReceipt` | PASS |
| Comisión snapshot suma el monto histórico | PASS |
| `admin.orders` muestra comisión snapshot | PASS |
| Cambiar tasa no reescribe comisión snapshot | PASS |
| Dashboard incluye comisión histórica | PASS |
| Settlement liquida solo un comercio | PASS |
| Pedido multi-comercio queda pendiente | PASS |
| Entrega repetida no reescribe `delivered_at` | PASS |
| Ganancia usa comisión congelada al asignar | PASS |
| No asigna repartidor offline | PASS |
| Merchant no revierte pausa admin | PASS |
| Alta merchant normaliza email | PASS |
| No activa comercio incompleto | PASS |
| Reporte de pedidos sin comprobantes | PASS |
| Reporte de ganancias responde | PASS |
| Reporte de ventas responde | PASS |
| Reporte de comisiones responde | PASS |
| Serie de ventas responde | PASS |
| Serie de ganancias responde | PASS |
| Growth calcula ventana equivalente | PASS |
| Top productos responde | PASS |

## Navegador Admin — 12/12

| Caso | Resultado |
|---|---|
| Login admin | PASS |
| Dashboard admin carga | PASS |
| Sesión admin sobrevive reload | PASS |
| Ruta `/admin/commerces` | PASS |
| Ruta `/admin/drivers` | PASS |
| Ruta `/admin/orders` | PASS |
| Ruta `/admin/products` | PASS |
| Ruta `/admin/settings` | PASS |
| Productos muestra acciones de moderación | PASS |
| Pedidos muestra liquidación por comercio | PASS |
| Settings guarda sin error | PASS |
| Sin errores de página | PASS |

## Tema y aislamiento de sesión — 50/50

`node scripts/e2e-theme-smoke.mjs` recorre las 6 rutas de Admin y las 6 de
Repartidor en viewport móvil/escritorio y valida:

| Caso | Resultado |
|---|---|
| `ThemeToggle` presente y cambia `html.dark` | PASS en 12 rutas |
| Sin 401 de `commerce.me` / `order.getCommerceOrders` en Driver | PASS en 6 rutas |
| Sin 401 de merchant en Admin | PASS en 6 rutas |
| Sin errores de página | PASS en 12 rutas |
| Mapa del driver visible con tiles y marcadores | PASS |
| Capturas claras/oscuras | Generadas |

## Regresión Cliente / Negocio / Driver

| Prueba | Resultado |
|---|---|
| Driver API | 16/16 PASS |
| Driver navegador | 8/8 PASS |
| Negocio navegador | 20/20 PASS |
| Admin smoke | 200 admin / 401 anónimo |
| Redirect/sesión | `SESSION SURVIVED: true`, 0 errores |

## Migraciones

`db/migrations/0010_skinny_rage.sql`:

- `users.session_version`;
- `order_commerce_status.settled_at`;
- `products.admin_paused`;
- `app_settings.updated_by` + FK.

`db/migrations/0011_icy_satana.sql`:

- `orders.driver_commission_rate`.

`npm run db:generate` responde **“No schema changes”** después de aplicar.

## Seguridad verificada

| Prueba | Resultado |
|---|---|
| Logout admin revoca access/refresh | PASS |
| SSE admin valida rol y `sessionVersion` | Código + contexto |
| Desactivar comercio revoca sesión merchant | PASS (código + login bloqueado) |
| Merchant no reactiva producto pausado | PASS |
| `admin.orders` sin comprobantes | PASS |
| Reportes sin comprobantes | PASS |
| Settings rechaza claves y valores inválidos | PASS |
| Asignación a driver offline | PASS (4xx) |
| Entrega sin checklist | PASS (4xx en driver/admin) |
| Entrega repetida idempotente | PASS |

## Warnings de lint

Se mantienen 321 warnings históricos (`any`, fast-refresh y pantallas
heredadas). No hay errores de lint ni afectan build/runtime.

## Criterios que no se deben romper

- `tsc` en 0 errores.
- `npm test` 9/9 o más.
- `npm run build` OK.
- `db:generate` sin cambios tras migrar.
- Admin API 29/29 y navegador 12/12.
- Theme smoke 50/50 en las 12 rutas.
- Driver API 16/16 y navegador 8/8.
- Negocio navegador 20/20.
- Redirect smoke con `SESSION SURVIVED: true`.
- Comisión con snapshot estable al cambiar tasas; el fallback legacy usa la
  tasa actual solo cuando no existe snapshot.
- Settlement por comercio y entrega idempotente.