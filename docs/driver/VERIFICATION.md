# Verificación del flujo Repartidor

**Fecha:** 2026-11-13  
**Resultado global:** flujo driver corregido, migración 0009 aplicada,
API 16/16 y navegador 8/8.

## Comandos ejecutados

```bash
npx tsc -b --force                 # 0 errores
npm test                          # 9/9 OK
npm run lint                      # 0 errores, 357 warnings históricos
npm run build                     # OK
npm run db:generate               # No schema changes
npm run db:migrate                # 0009 aplicada
node scripts/driver-api-smoke.mjs # 16/16 PASS
node scripts/e2e-driver-smoke.mjs # 8/8 PASS
node scripts/e2e-commerce-smoke.mjs # 20/20 PASS (regresión)
node scripts/admin-smoke.mjs      # admin 200 / anon 401
npx tsx scripts/redirect-smoke.ts # sesión/logo/landing OK
```

## API driver — 16/16

| Caso | Resultado |
|---|---|
| Login driver | PASS |
| `getAvailableForDriver` responde | PASS |
| Pedido listo visible | PASS |
| Sin PII pre-aceptación (sin teléfono/notas/dirección cliente) | PASS |
| Ganancia estimada neta ($1.88 de $2.50 al 75%) | PASS |
| Aceptar deja `driver_assigned` | PASS |
| No puede entregar sin retirar | PASS |
| Retiro por comercio deja `picked_up` | PASS |
| Pasa a `on_the_way` | PASS |
| Entrega escribe `delivered_at` | PASS |
| Crea earning de $1.88 | PASS |
| Historial devuelve `earningAmount` | PASS |
| Historial sin teléfono | PASS |
| Chat marca lectura por rol (`read_by_driver`) | PASS |
| Login driver limpia cookies merchant | PASS |
| Logout revoca tokens anteriores (`sessionVersion`) | PASS |

## Navegador driver — 8/8

| Caso | Resultado |
|---|---|
| Login por pestaña Celular | PASS |
| Home carga | PASS |
| Sesión sobrevive reload | PASS |
| `/driver/earnings` | PASS |
| `/driver/profile` | PASS |
| `/driver/history` | PASS |
| `/driver/chat/:orderId` | PASS |
| 0 errores de página | PASS |

## Seguridad verificada

| Prueba | Resultado |
|---|---|
| Driver no ve PII antes de aceptar | PASS |
| `delivered` sin retiro por comercio | 4xx |
| `picked_up` por `order.updateStatus` | 4xx |
| `markCommercePickup` sobre terminal | 4xx |
| Login driver sobre cookie merchant | `checkAuth` = driver |
| Logout driver revoca refresh anterior | `checkAuth` no autenticado |
| Driver no puede cambiar estado con pedido activo | 4xx |
| Admin no cambia pedido terminal | 4xx |
| Admin no borra driver con historial | 4xx |
| Admin no reasigna pedido retirado/terminal | 4xx |
| `driver.getOrderHistory` de otro driver | filtra por `ctx.driver.id` |

## Migración 0009

`db/migrations/0009_furry_nemesis.sql`, `0010_skinny_rage.sql` y
`0011_icy_satana.sql`:

- `chat_messages.read_by_customer`, `read_by_driver`, `read_by_commerce`;
- `drivers.session_version`;
- índice `orders(driver_id, status, delivered_at)`;
- unique `drivers.phone`;
- unique `users.email`;
- `orders.driver_commission_rate` para congelar la comisión al asignar.

`npm run db:generate` responde **“No schema changes”** después de aplicar.

## Regresión Cliente y Negocio

- E2E negocio: 20/20.
- Redirect/sesión: `SESSION SURVIVED: true`, `PAGE ERRORS: 0`.
- Admin smoke: admin 200 / anónimo 401.
- El E2E completo del cliente requiere OTP real (`E2E_OTP_CODE`) porque
  `NEUROCHAT_API_KEY` está configurada.

## Warnings de lint

Se mantienen 357 warnings históricos (`any`, efectos en pantallas heredadas y
fast-refresh). No hay errores de lint ni afectan build/runtime.

## Criterios que no se deben romper

- `tsc` en 0 errores.
- `npm test` 9/9 o más.
- `npm run build` OK.
- `db:generate` sin cambios tras migrar.
- Driver API 16/16 y navegador 8/8.
- E2E negocio 20/20.
- Redirect smoke con `SESSION SURVIVED: true`.