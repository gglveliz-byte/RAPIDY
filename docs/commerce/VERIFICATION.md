# Verificación del flujo Negocio

**Fecha:** 2026-11-13  
**Resultado global:** rutas del negocio corregidas, migración aplicada y E2E
del negocio 20/20.

## Comandos ejecutados

```bash
npx tsc -b --force          # 0 errores
npm test                    # 9/9 OK
npm run lint                # 0 errores, 363 warnings históricos
npm run build               # OK
npm run db:generate         # No schema changes
node scripts/e2e-commerce-smoke.mjs   # 20/20 PASS
node scripts/admin-smoke.mjs          # admin 200 / anon 401
npx tsx scripts/redirect-smoke.ts     # sesión + logo/landing/login
```

## E2E del negocio — 20/20

`scripts/e2e-commerce-smoke.mjs` valida:

| Caso | Resultado |
|---|---|
| Login merchant con `comercio@test.com` | PASS |
| Dashboard carga | PASS |
| Sesión sobrevive reload | PASS |
| `/commerce/orders` | PASS |
| `/commerce/products` | PASS |
| `/commerce/stats` | PASS |
| `/commerce/profile` | PASS |
| `/commerce/foo` no expulsa al merchant | PASS |
| Sesión sigue viva tras ruta inválida | PASS |
| API login merchant | PASS |
| `checkAuth` devuelve `commerceId` | PASS |
| Precio negativo rechazado | PASS |
| Precio cero rechazado | PASS |
| Merchant no puede cambiar `status` | PASS |
| `markReady` rechaza `cancelled` | PASS |
| `markReady` rechaza `payment_rejected` | PASS |
| `markReady` avanza `received` | PASS |
| Logout merchant no borra cookies customer | PASS |
| Logout merchant responde | PASS |
| Sin errores de página | PASS |

## Pruebas de seguridad verificadas

| Prueba | Resultado |
|---|---|
| `product.create` con `price:"-5"` | 400 |
| `product.create` con `price:"0"` | 400 |
| `commerce.update { status:"suspended" }` | status sigue `active` |
| `commerce.markReady` sobre `cancelled` | 4xx, pedido no revive |
| `commerce.markReady` sobre `payment_rejected` | 4xx |
| `commerce.markReady` sobre `received` | 200, pasa a `ready_for_pickup` |
| `login.logout { scope:"merchant" }` | no emite cookies customer |
| `driver.list` anónimo | 401 |
| `driver.list` admin | 200 |

## Regresión Cliente

```text
HOME OK
LOGO URL: /home
SESSION STILL HOME: true
LANDING REDIRECT: /home
LOGIN REDIRECT: /home
SESSION SURVIVED: true
PAGE ERRORS: 0
```

El E2E completo del cliente (`scripts/e2e-smoke.mjs`) requiere un código OTP
real. Con `NEUROCHAT_API_KEY` configurada no se imprime `devCode`. Para
ejecutarlo:

```bash
E2E_OTP_CODE=123456 node scripts/e2e-smoke.mjs
```

La última ejecución certificada del cliente fue 10/10 antes de estos cambios.
Los cambios de esta iteración que tocan cliente son: `/store/:id`, carrito desde
quote, SSE de productos en Home/Search/vitrina y timeline por comercio. El
redirect smoke y el build confirman que las rutas siguen compilando y la sesión
cliente sobrevive.

## Migración

`db/migrations/0008_simple_vance_astro.sql` aplicada:

- `order_commerce_status_enum` + `pending_payment`, `payment_rejected`,
  `received`, `accepted`, `cancelled`.
- `order_commerce_status.status` default `received`.
- `order_commerce_status.commission_amount`.
- `orders.delivered_at`.
- Índices `order_items(commerce_id, order_id)` y `orders(delivered_at)`.

`npm run db:generate` responde **“No schema changes”**.  
Nota operativa: `ALTER TYPE ... ADD VALUE` dentro de la transacción de Drizzle
falló en este PostgreSQL; la migración se aplicó statement-by-statement de forma
idempotente y se registró el hash en `drizzle.__drizzle_migrations`.

## Backfill aplicado

Se sincronizaron los estados por comercio de pedidos existentes:

```sql
UPDATE order_commerce_status ocs
SET status = o.status::text::order_commerce_status_enum,
    updated_at = now()
FROM orders o
WHERE ocs.order_id = o.id
  AND o.status IN (
    'pending_payment','payment_rejected','received','accepted',
    'preparing','ready_for_pickup','cancelled'
  )
  AND ocs.status::text <> o.status::text;
```

Resultado: 3 filas actualizadas. Los pedidos `delivered` conservan su estado de
cocina (`picked_up`/`ready_for_pickup`).

## Warnings de lint

Se mantienen **363 warnings históricos** (`@typescript-eslint/no-explicit-any`,
`react-hooks/set-state-in-effect` y dependencias de efectos en pantallas
heredadas). No hay errores de lint ni afectan build/runtime.

## Criterios que no se deben romper

- `tsc` en 0 errores.
- `npm test` en 9/9 o más.
- `npm run build` OK.
- E2E negocio 20/20.
- Redirect smoke con `SESSION SURVIVED: true` y `PAGE ERRORS: 0`.
- `db:generate` sin cambios después de una migración aplicada.