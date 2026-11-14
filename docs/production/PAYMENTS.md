# Pagos, transferencias y liquidaciones — runbook de producción

**Frente:** 11 — dinero, transferencias y liquidaciones.
**Archivos de este frente:** `scripts/production-finance-smoke.mjs` (nuevo) y este documento.
**Alcance:** pedidos en efectivo/transferencia, comisión por comercio, comisión del
repartidor, earning de entrega, liquidación por comercio/repartidor, reportes de
ventas/comisiones y aprobación/rechazo manual de transferencias.

> Este frente **no modificó código de pagos**. Los hallazgos de abajo quedan
> documentados con `archivo:línea`; no se corrigieron para no invadir otro frente.

---

## 1. Modelo de dinero implementado

### 1.1 Comisión del comercio (snapshot al crear el pedido)

En el checkout (`server/order-router.ts:448-537`) se calcula y persiste:

- `order_items.total` por línea.
- `orders.commission` = suma de `total_comercio × tasa_comercio / 100`, redondeada
  al final (`server/order-router.ts:209-215`).
- `order_commerce_status.commission_amount` por cada comercio, calculada con la
  tasa vigente en ese momento (`server/order-router.ts:514-537`).

La comisión histórica vive en `order_commerce_status.commission_amount`; **no** se
recalcula con la tasa actual. Los reportes y el panel admin deben leer ese snapshot
(`server/admin/settings-router.ts:188-288`, `:449-538`; `server/admin/dashboard-router.ts:60-162`).

Fórmula de referencia:

```
comisión_comercio = round2( suma(order_items.total del comercio) × tasa_snapshot / 100 )
```

### 1.2 Comisión del repartidor (snapshot al asignar)

- `orders.driver_commission_rate` se congela al asignar/aceptar:
  - asignación admin: `server/admin/orders-router.ts:769-777`;
  - aceptación del driver: `server/driver-router.ts:414-422`.
- Al entregar se crea un único `driver_earnings` de tipo `delivery_fee`:
  - camino driver: `server/order-router.ts:894-927`;
  - camino admin: `server/admin/orders-router.ts:604-639`.
- Fórmula: `earning = round2(orders.delivery_fee × orders.driver_commission_rate / 100)`.
- El índice único `driver_earnings_order_type_idx` impide duplicados por
  `(order_id, type)` (`db/schema.ts:298-300`).

### 1.3 Liquidación

- Por comercio: `order_commerce_status.settled_at` y el agregado
  `orders.commerce_settled` (`server/admin/orders-router.ts:249-334`).
- Por repartidor: `orders.driver_settled` (`server/admin/orders-router.ts:336-363`).
- Solo se puede liquidar un pedido `delivered`; el servidor rechaza el resto.
- No hay liquidación parcial: es un toggle por comercio/pedido. Si el banco pagó
  parcial, **no** se marca liquidado; se documenta el saldo en el ticket externo.

### 1.4 Transferencias

- `payment_method = transfer` exige comprobante en el checkout
  (`server/order-router.ts:448`), guardado en `orders.payment_receipt`.
- El pedido nace en `pending_payment`; el comercio no debe preparar hasta que un
  admin lo pase a `received` (`contracts/orderStatus.ts:228-240`).
- Rechazo: `payment_rejected` + motivo en `order_status_history.notes`.
- Reenvío: el cliente solo puede subir comprobante en `pending_payment` o
  `payment_rejected` (`server/order-router.ts:1124-1166`).

---

## 2. Smoke API/DB

### 2.1 Requisitos

- Server local en `http://localhost:3000` (no lo reinicia el script).
- `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` en el entorno/`.env`.
- Opcional: `E2E_BASE_URL` para apuntar a otro host local/staging.
- **No ejecutar contra producción**: el script escribe filas temporales y usa
  acceso directo a la BD para preparar fixtures y limpiar.

### 2.2 Ejecución

```bash
node scripts/production-finance-smoke.mjs
```

El script no ejecuta migraciones, `db:push`, build ni tests globales. Tampoco
reinicia el servidor. Ejecutarlo aislado: los deltas de reportes asumen que no
hay otros pedidos entregados en paralelo durante la corrida.

### 2.3 Qué valida

1. Login admin y baseline de reportes.
2. Sesión de cliente temporal mediante una fila OTP local (`local:`), sin llamar
   al proveedor de WhatsApp.
3. `order.quote` + `order.create` con dos comercios:
   - `order_commerce_status.commission_amount` coincide con la tasa vigente;
   - `admin.orders` muestra el snapshot por comercio.
4. Cambio de `commerces.commission_rate`:
   - el snapshot del pedido no cambia;
   - los reportes siguen usando el snapshot, no la tasa nueva.
5. Asignación con `admin.assignDriver`:
   - `driver_commission_rate` queda congelada;
   - cambiar la tasa del driver después no altera el pedido;
   - la entrega crea exactamente un `driver_earnings` con la tasa congelada.
6. Entrega repetida (`delivered` dos veces):
   - no reescribe `delivered_at`;
   - no duplica historial ni earning;
   - un `INSERT` directo duplicado falla con `23505`.
7. Liquidación:
   - liquida solo el comercio indicado;
   - el pedido queda `commerce_settled` solo cuando todos los comercios están
     liquidados;
   - `driver_settled` se registra;
   - un pedido no entregado o cancelado no se puede liquidar.
8. Reportes:
   - `sales` suma pedidos/ingresos/comisiones del día;
   - `commissions` devuelve una fila por pedido/comercio con el snapshot;
   - `admin.commerceCommissions` y `admin.dashboard.totalCommission` acumulan el
     snapshot histórico;
   - los reportes no exponen comprobantes.
9. Transferencias:
   - el checkout queda `pending_payment`;
   - el comprobante se guarda en BD pero no debe servirse en el detalle admin;
   - aprobar pasa pedido y comercio a `received`;
   - no se puede cambiar el comprobante después de aprobar;
   - rechazar registra motivo y deja `payment_rejected` sin earning;
   - el cliente puede reenviar y el pedido vuelve a `pending_payment`;
   - una cancelación no genera earning ni permite liquidar.
10. Limpieza: pedidos, cliente, OTP, driver y tasas originales se restauran en
    `finally`; también se barren pedidos con el marcador `SMOKE_FINANCE_%`.

### 2.4 Resultado de referencia (código actual)

Con la BD local de referencia:

```text
RESULT 42/43 PASS — 2 WARN
FAIL Detalle admin no expone paymentReceipt — fuga: paymentReceipt
WARN Cancelación admin no guarda cancelled_by/cancellation_reason en orders
WARN Un pago ya aprobado puede rechazarse después (sin canTransition)
```

El `FAIL` es un bug real de exposición de comprobantes (ver §5.1). Los `WARN`
son brechas de control/auditoría conocidas. Cuando se corrijan, el resultado
esperado es `43/43 PASS` sin warnings.

### 2.5 Limpieza manual de emergencia

Si el proceso se interrumpe antes del `finally`:

```sql
delete from driver_earnings
 where order_id in (select id from orders where notes like 'SMOKE_FINANCE_%');
delete from orders where notes like 'SMOKE_FINANCE_%';
delete from drivers where name = 'Smoke Finance Driver';
delete from otp_verifications where otp_id like 'local:SMOKE_FINANCE_%';
delete from customers where first_name = 'Smoke' and last_name = 'Finance';
```

Verificar que las tasas de comercio quedaron restauradas antes de cerrar el
incidente. El script imprime `Limpieza: datos temporales eliminados.` cuando
termina bien.

---

## 3. Controles operativos

### 3.1 Comprobantes

- **Captura:** solo por checkout de transferencia. El servidor exige un string no
  vacío y limita el tamaño a 7.5 MB de caracteres (`server/order-router.ts:55-72`);
  el cliente valida JPG/PNG/WEBP y 5 MB (`src/pages/customer/Cart.tsx:143-173`).
- **Almacenamiento:** `orders.payment_receipt` (base64). No hay tabla de
  comprobantes ni hash; no se detectan duplicados automáticamente.
- **Exposición:** `admin.orders` no incluye el comprobante; `admin.orderDetail`
  **sí lo filtra hoy** (bug §5.1). Mientras no se corrija, restringir el acceso al
  detalle admin y no exportarlo.
- **Aprobación:** el admin revisa monto, titular, fecha y banco contra la cuenta
  de `admin.settings` (`bank_transfer_info`). Aprobar = `updateOrderStatus` a
  `received`.
- **Rechazo:** usar `payment_rejected` y escribir un motivo concreto en `notes`.
  El motivo queda en `order_status_history`, no en `orders.cancellation_reason`.
- **Reenvío:** el cliente puede subir un nuevo comprobante solo si el pedido está
  `pending_payment` o `payment_rejected`; después de aprobado el servidor lo
  rechaza.
- **Retención:** conservar comprobantes y pedidos según obligación contable/tributaria
  (la política legal del repo menciona 7 años para comprobantes de retención).
  No borrar pedidos para “limpiar” ventas.

### 3.2 Doble aprobación (four-eyes)

Hoy **no existe** separación de roles ni segundo aprobador: cualquier sesión admin
puede aprobar, rechazar y liquidar (`server/middleware.ts:25-36`). Hasta que se
implemente un campo/tabla de aprobación, el control es operativo:

1. Un admin revisa el comprobante y deja evidencia en el ticket externo
   (imagen, monto, referencia bancaria, ID de pedido).
2. Para transferencias ≥ USD 200 (umbral sugerido; ajustar a política), un segundo
   admin confirma por un canal distinto y es quien ejecuta la aprobación.
3. Registrar en `order_status_history.notes`: “Revisado por <admin A>; aprobado por
   <admin B>; ref. banco ...”.
4. Nunca compartir credenciales admin. Cada aprobador debe tener su propia sesión.
5. Para conciliaciones y liquidaciones, aplicar la misma regla: quien prepara la
   conciliación no debe ser quien marca `settled`.

Limitación: el sistema no impide que la misma persona haga ambos pasos. Si se
requiere cumplimiento formal, agregar en una migración futura
`payment_reviewed_by`, `payment_approved_by`, `settled_by` y una tabla de auditoría
antes del go-live.

### 3.3 Conciliación

**Diaria (T+0/T+1):**

1. Listar pedidos `delivered` con `order_commerce_status.settled_at is null`:
   ```sql
   select o.id, o.payment_method, o.total, ocs.commerce_id,
          ocs.commission_amount, ocs.settled_at
     from orders o
     join order_commerce_status ocs on ocs.order_id = o.id
    where o.status = 'delivered'
      and ocs.settled_at is null
    order by o.delivered_at;
   ```
2. Cruzar transferencias contra el extracto bancario por monto, fecha y
   referencia/comprobante.
3. Marcar `toggleCommerceSettled` solo cuando el dinero esté confirmado. No usar
   la tasa actual para recalcular: usar `commission_amount`.
4. Revisar `orders.driver_settled` contra las remesas/pagos a repartidores.
5. Investigar diferencias > USD 0.01. No editar snapshots ni tasas para “cuadrar”;
   abrir un ticket de ajuste y documentarlo.

**Semanal:** revisar tasas de comisión modificadas, pedidos cancelados, rechazos
de transferencia y reenvíos de comprobante. **Mensual:** reportes `sales` y
`commissions` contra banco/contabilidad.

**Efectivo:** el sistema solo marca flags de liquidación; no registra la remesa
física del efectivo ni el depósito. Llevar una planilla externa por repartidor y
comercio. Revisar la semántica de `commerceAction`/`driverAction` (“cobrar” en
efectivo, “pagar” en transferencia) con operaciones antes de automatizar pagos.

### 3.4 Límites y revisión por riesgo

No hay límites automáticos por monto, por cliente ni por día; el único límite de
código es el tamaño del comprobante. Política recomendada:

| Nivel   | Transferencia                | Revisión                                         |
| ------- | ---------------------------- | ------------------------------------------------ |
| Bajo    | < USD 50                     | Un admin revisa comprobante.                     |
| Medio   | USD 50–199                   | Un admin + verificación bancaria.                |
| Alto    | ≥ USD 200                    | Dos aprobadores + confirmación bancaria.         |
| Crítico | ≥ USD 1,000 o patrón inusual | Dos aprobadores + supervisor + ticket de fraude. |

Además:

- Revisar pedidos con `delivery_fee` atípico: el earning del driver se calcula
  sobre ese flete congelado.
- Revisar clientes con muchos reenvíos de comprobante o pedidos rechazados.
- No liquidar un pedido con comprobante ilegible, monto distinto o titular
  distinto sin aprobación excepcional documentada.
- Si se implementan límites, hacerlo en servidor (no solo en la UI) y con audit
  trail; hoy no existe ese control.

### 3.5 Reembolsos y cancelaciones

- `delivered` y `cancelled` son terminales; el admin no puede cambiarlos
  (`server/admin/orders-router.ts:453-458`).
- Antes de retiro, el comercio puede cancelar si el pedido es solo suyo
  (`server/order-router.ts:306-339`). Después de `picked_up`/`on_the_way`, el
  comercio debe escalar a soporte.
- **No hay tabla de reembolsos ni integración con pasarela.** Los reembolsos son
  manuales (efectivo o transferencia bancaria) y deben registrarse en un ticket
  externo con: pedido, monto, motivo, autorizador, fecha, referencia bancaria.
- No cambiar `orders.total`, `orders.commission` ni `commission_amount` para
  reflejar un reembolso. Si se requiere impacto contable, usar un asiento/ajuste
  externo hasta que exista un modelo de reembolso.
- Un pedido `cancelled` no entra en reportes de ventas/comisiones (solo se
  reportan `delivered`), pero un pedido `delivered` reembolsado **seguirá
  contando** como venta: no hay estado de reembolso. Documentar esta limitación
  en la conciliación mensual.
- Rechazo de transferencia ≠ reembolso: el pedido no se canceló; el cliente puede
  reenviar comprobante.

### 3.6 Auditoría

- `order_status_history` registra transiciones y `notes`; es la fuente principal
  para aprobación/rechazo/cancelación. Usar motivos claros y IDs de ticket.
- `driver_earnings` es append-only por diseño; no editar montos. El índice único
  protege duplicados.
- `order_commerce_status.settled_at` y `orders.driver_settled` son la única
  evidencia de liquidación. **No** generan fila de historial (gap §5.5).
- Los cambios de `commerces.commission_rate` y `drivers.commission_rate` no
  guardan before/after (gap §5.7). Documentar cada cambio en ticket y verificar
  que los pedidos anteriores mantengan su snapshot.
- Acceso: hoy todo admin puede todo. Recomendar cuentas nominales, MFA en el
  proveedor de identidad y revisión trimestral de accesos. No compartir sesiones.
- Exportar/backup antes de cierres mensuales y conservar evidencia de conciliación.

---

## 4. Reportes: definiciones y uso

| Reporte / endpoint                       | Qué muestra                                        | Fuente                         |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `admin.getReports({type:"sales"})`       | Pedidos, ingresos y comisiones por día             | `orders` delivered + snapshots |
| `admin.getReports({type:"commissions"})` | Una fila por pedido/comercio con comisión snapshot | `order_commerce_status`        |
| `admin.getReports({type:"earnings"})`    | Earning por driver/pedido/tipo                     | `driver_earnings`              |
| `admin.commerceCommissions`              | Comisión acumulada histórica por comercio          | snapshot + fallback legacy     |
| `admin.dashboard`                        | `totalCommission`, `totalRevenue`, etc.            | snapshot + delivered           |
| `admin.earningsByPeriod`                 | Comisión vs. pagos de delivery por período         | snapshot + `driver_earnings`   |
| `admin.salesByPeriod`                    | Serie de ventas entregadas                         | `orders` delivered             |

Reglas:

- Fechas en calendario de Guayaquil (`server/lib/dates.ts`), no UTC.
- Rango máximo de `getReports`: 2 años.
- `sales` agrupa por fecha de entrega (`delivered_at`) o creación si falta.
- `commissions` usa `commission_amount`; si es null (pedido legacy sin snapshot),
  recalcula con la tasa **actual** (`server/admin/settings-router.ts:242-264`,
  `:486-537`). Esto puede distorsionar historia antigua. Para pedidos nuevos el
  snapshot siempre existe; no borrar `order_commerce_status`.
- Los reportes no deben incluir `payment_receipt`; hoy `getReports` no lo
  selecciona. El detalle admin sí lo filtra (bug §5.1).

---

## 5. Bugs y brechas de control detectadas

> No se corrigió código de pagos en este frente. Cada hallazgo incluye el archivo
> y línea para que el frente responsable lo resuelva.

### 5.1 Alta — `admin.orderDetail` expone el comprobante de transferencia

`server/admin/orders-router.ts:399-408` elimina `idempotencyKey` pero no
`paymentReceipt`; el `...safeOrder` devuelve el base64 completo. El listado
`admin.orders` sí lo omite, pero el detalle lo filtra. El smoke falla en
“Detalle admin no expone paymentReceipt”.

**Riesgo:** exposición de datos bancarios/comprobantes a cualquier sesión admin y
a logs/herramientas que consuman el detalle. **Acción:** sanear igual que
`server/order-router.ts:231-237` o seleccionar columnas explícitas. Mientras
tanto, restringir el detalle y no exportarlo.

### 5.2 Alta — El admin puede saltarse la máquina de estados de pago

`server/admin/orders-router.ts:411-588` no llama `canTransition`. Solo bloquea
pedidos terminales y algunos estados de retiro/entrega. Por eso un admin puede:

- aprobar un `pending_payment` sin revisar comprobante;
- pasar un `received` ya aprobado a `payment_rejected`;
- saltar pasos (`pending_payment` → `accepted`, etc.).

El smoke verificó el último caso y emite el WARN “Un pago ya aprobado puede
rechazarse después”. **Riesgo:** aprobaciones/rechazos inconsistentes y sin
control. **Acción:** validar transiciones con `canTransition("admin")` o una
máquina equivalente y exigir motivo para `payment_rejected`.

### 5.3 Media — La asignación por `order.updateStatus` no congela la comisión

El camino usado por el smoke (`admin.assignDriver`) sí guarda
`driverCommissionRate` (`server/admin/orders-router.ts:769-777`), y el driver al
aceptar también (`server/driver-router.ts:414-422`). Pero el endpoint genérico
`order.updateStatus` permite a un admin pasar `driverId`
(`server/order-router.ts:855-862`) y el patch solo escribe `driverId`
(`:938-943`), sin `driverCommissionRate`. Al entregar, el earning cae al rate
actual del driver (`:912-914`). **Riesgo:** si se usa ese endpoint para asignar,
la comisión no queda congelada. **Acción:** persistir el snapshot también en ese
camino o bloquear la asignación fuera de `admin.assignDriver`.

### 5.4 Media — La cancelación admin no guarda motivo/autor en `orders`

`server/admin/orders-router.ts:573-588` actualiza estado, entrega, driver y
checklist, pero no `cancellationReason` ni `cancelledBy`. El motivo solo queda en
`order_status_history.notes` (`:598-602`). El smoke emite WARN al respecto.
**Riesgo:** consultas/exportaciones que lean `orders.cancellation_reason` ven
null. **Acción:** setear ambos campos cuando `status === "cancelled"`, igual que
el camino merchant (`server/order-router.ts:321-335`).

### 5.5 Media — Las liquidaciones no tienen historial de auditoría

`server/admin/orders-router.ts:249-334` (comercio) y `:336-363` (driver) solo
actualizan flags/timestamps y emiten SSE. No insertan en `order_status_history`
ni en una tabla de auditoría. **Riesgo:** no se sabe quién liquidó, cuándo ni con
qué evidencia. **Acción:** registrar `settled_by`, `settled_at` y referencia en
una tabla append-only; mientras tanto, llevar planilla externa firmada.

### 5.6 Media — Reenvío de comprobante no sincroniza el estado por comercio

`server/order-router.ts:1144-1161` actualiza `orders.status` a `pending_payment`
pero no `order_commerce_status.status`, que queda en `payment_rejected` hasta la
siguiente transición admin. El override global de `getCommerceOrderStatus`
(`contracts/orderStatus.ts:199-215`) tapa el caso en la UI, pero un reporte/consulta
directa puede ver estados inconsistentes. **Acción:** llamar
`syncAllCommerceStatuses(tx, orderId, "pending_payment")` dentro de la transacción.

### 5.7 Media — No hay modelo de reembolsos ni límites automáticos

`db/schema.ts:182-215` no tiene tabla/campos de reembolso; `orders.status` no
tiene estado `refunded`. Los reembolsos manuales no reducen reportes de ventas.
Tampoco hay límites por monto/cliente/día ni detección de comprobantes duplicados;
solo el límite de tamaño del string. **Riesgo:** fraude, descuadre contable y
reembolsos no reflejados. **Acción:** diseñar migración de `refunds`/`payments` y
controles de límite en servidor antes de escalar.

### 5.8 Baja/Media — Reportes legacy recalculan con tasa actual

Si un pedido antiguo no tiene `order_commerce_status.commission_amount`, los
reportes usan la tasa actual (`server/admin/settings-router.ts:242-264` y
`:486-537`). En el smoke esto se observó al cambiar una tasa: el delta de reportes
incluyó pedidos legacy. Los pedidos nuevos no tienen este problema. **Acción:**
backfill de snapshots para pedidos históricos o marcar explícitamente las filas
legacy como estimadas.

### 5.9 Control — Cualquier admin puede aprobar y liquidar

`server/middleware.ts:25-36` solo exige rol admin; no hay permisos por acción ni
segundo aprobador. El control de doble aprobación de §3.2 es manual. **Acción:**
roles `finance_approver`/`finance_settler` y auditoría de actor si se requiere
cumplimiento.

---

## 6. Checklist antes de go-live

- [ ] Corregir §5.1 (fuga de comprobante) y volver a ejecutar el smoke hasta
      `43/43 PASS`.
- [ ] Definir y documentar umbrales de doble aprobación (§3.2/§3.4).
- [ ] Asignar responsables diarios de conciliación por comercio y repartidor.
- [ ] Verificar que `bank_transfer_info` en admin settings sea la cuenta oficial.
- [ ] Confirmar que ningún proceso borra pedidos/comprobantes para “cuadrar”.
- [ ] Probar el flujo de rechazo/reenvío con un comprobante real en staging.
- [ ] Exportar baseline de comisiones y tasas antes del primer cierre.
- [ ] Revisar accesos admin y activar MFA en el proveedor de identidad.
- [ ] Documentar el tratamiento manual de reembolsos y cancelaciones post-pago.
- [ ] Ejecutar `node scripts/production-finance-smoke.mjs` en staging con una
      copia de la BD, nunca contra producción.

---

## 7. Referencias rápidas

- Checkout y snapshot: `server/order-router.ts:209-215`, `:448-537`.
- Aprobación/rechazo admin: `server/admin/orders-router.ts:411-588`.
- Asignación y congelamiento: `server/admin/orders-router.ts:769-777`;
  `server/driver-router.ts:414-422`; `server/order-router.ts:912-914`.
- Earning e idempotencia: `server/order-router.ts:894-927`;
  `server/admin/orders-router.ts:604-639`; `db/schema.ts:298-300`.
- Liquidación: `server/admin/orders-router.ts:249-363`.
- Reportes: `server/admin/settings-router.ts:151-539`;
  `server/admin/dashboard-router.ts:182-456`.
- Estados: `contracts/orderStatus.ts:228-257`.
- Smoke: `scripts/production-finance-smoke.mjs`.
