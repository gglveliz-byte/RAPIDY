# Verificación del flujo Cliente

**Fecha:** 2026-11-13  
**Resultado global:** rutas críticas corregidas y verificadas.

## Comandos

```bash
npx tsc -b --force          # 0 errores
npm test                    # 9 tests OK
npm run lint                # 0 errores, 363 warnings históricos
npm run build               # OK
npm run db:generate         # No schema changes
npm run db:migrate          # OK (historial baselineado)
node scripts/e2e-smoke.mjs  # 10/10 PASS
node scripts/admin-smoke.mjs# admin 200 / anon 401
npx tsx scripts/redirect-smoke.ts # sesión + logo/landing/login
```

## Resultados E2E

| Caso | Resultado |
|---|---|
| Login OTP + `/home` | PASS |
| Búsqueda de productos en `/home` | PASS |
| `/search` server-side + categoría | PASS |
| Carrito detecta mínimo de compra | PASS |
| `/cart` quote + modal | PASS |
| `/profile` | PASS |
| `/order` estado compartido + sin auto-redirect | PASS |
| Cancelación de pedido activo visible | PASS |
| `/chat` envío + SSE | PASS |
| Sin errores de página | PASS |

## Regresión del logo / sesión

```text
HOME OK
LOGO URL: /home
SESSION STILL HOME: true
LANDING REDIRECT: /home
LOGIN REDIRECT: /home
SESSION SURVIVED: true
PAGE ERRORS: 0
```

## Persistencia de sesión

| Prueba | Resultado |
|---|---|
| Cookie refresh `Max-Age` | `31536000` (365 días) |
| Atributos | `HttpOnly`, `SameSite=Lax` en localhost |
| `customer.checkAuth` solo con refresh token | 200 + cliente |
| `customer.refresh` solo con refresh token | 200 success |

## Seguridad verificada

| Prueba | Resultado |
|---|---|
| Anónimo a `order.getById` | 401 |
| Otro cliente a pedido ajeno | 403 |
| Anónimo a `order.updateStatus` | 401 |
| Cliente enviando como driver en chat | 403 |
| Cliente a `customer.list` / `driver.list` | 401 |
| SSE sin cookie | 401 |
| SSE del dueño | 200 |
| Precios manipulados (`deliveryFee`, `commission`, `customerId`) | ignorados; total server-side |
| Doble `order.create` misma idempotency key | un solo pedido |
| Baja de cuenta | PII anonimizada + `session_version` incrementado |

## Base de datos

- Tablas OTP y solicitudes de baja creadas.
- `orders.idempotency_key` único.
- Índices de FKs, estados, fechas y chat.
- Unique en `driver_earnings(order_id,type)`.
- Unique en `order_commerce_status(order_id,commerce_id)`.
- Migración `0007` aplicada y `db:generate` sin cambios.

## Nota sobre OTP real

Con `NEUROCHAT_API_KEY` configurada ya no se muestra `devCode`. Para ejecutar el E2E
con OTP real:

```bash
E2E_OTP_CODE=123456 node scripts/e2e-smoke.mjs
```

El código debe leerse del WhatsApp del número de prueba. Sin `E2E_OTP_CODE`, el E2E
espera el fallback de desarrollo (`OTP_DEV_FALLBACK=true`).

## Warnings de lint

Quedan 363 warnings históricos, principalmente `@typescript-eslint/no-explicit-any` y
`react-hooks/set-state-in-effect` en pantallas admin/driver/commerce heredadas.
No hay errores de lint ni afectan build/runtime.