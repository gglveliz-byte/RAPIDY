# Repartidor — E2E de producción

**Estado:** implementado y verificado en local (50/50 PASS, limpieza 0/0/0).
**Script:** `scripts/production-driver-smoke.mjs`
**Alcance:** flujo Repartidor por API tRPC con un driver dedicado temporal.
No usa navegador, no reinicia `localhost:3000` y no ejecuta migraciones.

## Qué valida

| Bloque | Comprobaciones |
|---|---|
| Login | Teléfono + password, rol `driver`, cookies `quickgo_driver_token` / `quickgo_driver_refresh`, `checkAuth`. |
| Disponibles | Lista responde, pedido E2E visible, proyección sin `customerPhone`, `deliveryAddress`, `notes` ni `paymentReceipt`; incluye comercio y `estimatedEarning` neto. |
| Pre-aceptación | `order.getById` de un pedido no asignado devuelve 403; no se filtra PII. |
| Aceptar | Pasa a `driver_assigned`, asigna `driver_id`, marca al driver `busy` y aparece en `driver.getActiveOrders`. Tras aceptar sí recibe dirección/teléfono, nunca el comprobante. |
| Doble pedido | Un segundo `acceptOrder` se rechaza y el segundo pedido queda sin driver. |
| Logout con pedido | Bloqueado mientras hay pedido activo y la sesión sigue válida. |
| Retiro por comercio | Retiro parcial mantiene `driver_assigned`; el retiro repetido del mismo comercio falla; al retirar todos pasa a `picked_up`; después de `on_the_way` ya no se puede retirar. |
| Transiciones | No se puede entregar sin retirar, ni pasar a `on_the_way` sin retirar, ni entregar antes de `on_the_way`. La entrega deja `delivered` + `delivered_at` y devuelve al driver a `online`. |
| Dinero | `driver_earnings.amount = deliveryFee × commissionRate / 100` ($2.50 × 75% = $1.88), tipo `delivery_fee`; `getEarnings` y `getProfile.totalEarnings` coinciden. |
| Historial | Incluye `earningAmount`, `deliveredAt`, sin teléfono del cliente ni comprobante. |
| Chat | Lectura del pedido, `markAsRead` solo actualiza `read_by_driver` (no `is_read` global), envío con identidad derivada del servidor y rechazo al intentar enviar como `customer`. |
| Perfil | `getProfile` propio, actualización de vehículo/placa, 403 al consultar el perfil de otro driver. |
| Pedidos ajenos | 403/4xx en detalle, cambio de estado, retiro, chat, pedidos activos y ganancias de otro driver. |
| Logout y revocación | Incrementa `session_version`, deja `offline`, limpia FCM; el access token anterior deja de autenticar y el refresh anterior ya no puede renovar. |

## Requisitos

1. Servidor de la app levantado y accesible en `E2E_BASE_URL` (por defecto
   `http://localhost:3000`). No reiniciarlo desde este script.
2. `DATABASE_URL` apuntando **a la misma base** que usa ese servidor. Si URL y
   base no coinciden, el script crearía datos en un entorno distinto: verificar
   antes de ejecutar.
3. `APP_SECRET` igual al del servidor (lo usa el login normal; el script no lo
   lee directamente).
4. Dependencias instaladas (`npm install`): `dotenv`, `bcryptjs`, `pg`.
5. Al menos un cliente activo, un comercio activo/abierto y un producto
   disponible. Se usan hasta dos comercios para probar el retiro parcial.
6. Autorización explícita para ejecutarlo contra staging o producción. Crea
   pedidos y dos drivers temporales, aunque los elimina al final.

No se necesitan credenciales de drivers existentes ni de comercios. El driver
temporal se genera en cada corrida:

- Teléfono: `E2E_DRIVER_PHONE` o `099<7 dígitos de timestamp>`.
- Segundo teléfono (pedido ajeno): `E2E_OTHER_DRIVER_PHONE` o `098<7 dígitos>`.
- Password: `E2E_DRIVER_PASSWORD` o el placeholder de laboratorio
  `rapidy-e2e-driver-17`. No es un secreto de producción.

## Ejecución

```bash
node scripts/production-driver-smoke.mjs
```

Variables opcionales:

```bash
E2E_BASE_URL=http://localhost:3000
E2E_DRIVER_PHONE=0990000017
E2E_OTHER_DRIVER_PHONE=0980000017
E2E_DRIVER_PASSWORD=cambiar-en-el-entorno-de-pruebas
DATABASE_URL=postgresql://...
```

El script imprime `SETUP drivers=... orders=... phone=...` y luego una línea
`PASS`/`FAIL` por comprobación. Al final imprime:

```
LIMPIEZA orders=0 drivers=0 earnings=0
RESULT 50/50 PASS
```

## Limpieza

La limpieza corre en `finally`, incluso si una comprobación falla:

1. Borra `driver_earnings` de los pedidos y drivers temporales.
2. Borra los pedidos temporales (cascade de items, estados, historial y chat).
   También recupera pedidos huérfanos mediante el marcador único de la corrida.
3. Borra los dos drivers temporales.
4. Verifica que no queden filas y lo informa en `LIMPIEZA`.

Si `LIMPIEZA` muestra un contador distinto de 0, el script termina con código 1
y hay que revisar los IDs impresos en `SETUP` antes de repetir. Los productos,
clientes y comercios existentes solo se leen; no se modifican.

## Criterio de aceptación

Se considera aprobado solo si:

- `RESULT` es `50/50 PASS` y el proceso termina con código 0.
- `LIMPIEZA orders=0 drivers=0 earnings=0`.
- No hay `FAIL` en PII, doble aceptación, entrega sin retiro, pedidos ajenos,
  ganancias, chat ni revocación de sesión.
- El servidor no se reinició ni se aplicaron migraciones durante la prueba.

Guardar como evidencia la salida completa, la versión del commit y la fecha.
No adjuntar cookies, tokens ni `DATABASE_URL`.

## Fuera de alcance

- UI del navegador, SSE en vivo, push/FCM, mapas y tema visual. Para eso siguen
  vigentes `scripts/e2e-driver-smoke.mjs` y `scripts/e2e-theme-smoke.mjs`.
- Carga, concurrencia real de dos pestañas y comportamiento multi-instancia.
- Migraciones, seed y despliegue. El script asume el esquema ya aplicado.
- Limpieza de datos si el proceso se mata con `SIGKILL` antes del `finally`.
  En ese caso usar los IDs de `SETUP` y repetir la limpieza manual.

## Si falla

1. Revisar el primer `FAIL` (los siguientes pueden ser consecuencia).
2. Confirmar que servidor y `DATABASE_URL` apuntan al mismo entorno.
3. Revisar `LIMPIEZA`; si no es cero, borrar por IDs de `SETUP`.
4. Repetir una sola vez. No reiniciar el servidor ni ejecutar migraciones para
   “arreglar” la prueba.
5. Si el fallo es de contrato (PII, estados, dinero, permisos), tratar el código
   como fuente de verdad solo después de revisar `docs/driver/` y los tests; no
   cambiar el script para ocultar una regresión.