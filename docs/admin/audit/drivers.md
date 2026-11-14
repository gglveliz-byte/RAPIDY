# Auditoría `/admin/drivers` — Administración

**Fecha:** 2026-11-13  
**Ruta auditada:** `/admin/drivers` (gestión de repartidores)  
**Commit de referencia:** `5a9853a` (`fix(driver): session segura, aceptacion/retiro/entrega, PII, ganancias e historial`)  
**Modo:** auditoría estática de solo lectura. No se modificó código, esquema, base de datos ni servidores.

## 1. Alcance y archivos

El alcance solicitado incluye listado, alta, edición, teléfono/contraseña,
vehículo/placa, estado, comisión, rendimiento, ganancias, liquidaciones y
borrado. La implementación real de `/admin/drivers` cubre **listado, alta,
edición, comisión y borrado**; no hay una acción admin explícita para el
**estado** (lo cambia el propio driver y algunas acciones admin lo fuerzan), y
**rendimiento/ganancias/liquidaciones** viven en `/admin` (Dashboard) y
`/admin/orders`, no en esta ruta. Esa diferencia se registra como hallazgo
(ADM-DRV-19).

Archivos principales revisados:

| Capa | Archivo | Uso |
|---|---|---|
| Ruta / UI | `src/App.tsx` | `SessionGuard role="admin"` para `/admin/drivers` (línea 134) |
| Layout | `src/components/AdminLayout.tsx` | Navegación, sidebar, bottom nav y logout |
| Página | `src/pages/admin/Drivers.tsx` | Listado, tarjetas, búsqueda, modal, alta/edición/borrado |
| Hook | `src/hooks/useDeliveryData.ts` | `trpcMutate`, helpers `createDriver`/`updateDriver`/`assignDriver` |
| Router admin | `server/admin-router.ts` | Fusión de submódulos; refresh admin |
| Drivers backend | `server/admin/drivers-router.ts` | `createDriver`, `updateDriver`, `deleteDriver`, `driverPerformance`, `driverEarningsBreakdown` |
| Pedidos admin | `server/admin/orders-router.ts` | `assignDriver`, `toggleDriverSettled`, `updateOrderStatus`, cálculo de liquidación |
| Driver backend | `server/driver-router.ts` | `driver.list`, aceptación, retiro, entrega, logout, FCM |
| Auth | `server/login-router.ts`, `server/admin-auth.ts`, `server/driver-auth.ts`, `server/context.ts`, `server/middleware.ts` | Cookies, JWT, `adminQuery`, `sessionVersion` |
| Contrato / DB | `contracts/orderStatus.ts`, `db/schema.ts` | Estados, `drivers`, `driver_earnings`, `orders` |
| Documentación | `docs/driver/README.md`, `docs/driver/VERIFICATION.md`, `docs/driver/audit/MASTER_TRIAGE.md`, `docs/customer/README.md`, `docs/commerce/README.md`, `docs/commerce/VERIFICATION.md`, `docs/commerce/audit/MASTER_TRIAGE.md` | Reglas y evidencia vigente |

No se identificó un **P0**: todas las mutaciones admin sobre repartidores pasan
por `adminQuery` (`server/middleware.ts:25-36`) y las respuestas del listado no
exponen `passwordHash` ni `fcmToken` (`server/driver-router.ts:15-31`).

## 2. Flujo end-to-end (UI → hook → tRPC → DB)

```text
/admin/drivers
  └─ SessionGuard role="admin"                    src/App.tsx:134
      └─ AdminDrivers                             src/pages/admin/Drivers.tsx
          ├─ trpc.driver.list.useQuery()          Drivers.tsx:14
          │   └─ driver.list (adminQuery)         server/driver-router.ts:15-31
          │       └─ SELECT drivers (sin hash)    db/schema.ts:91-107
          ├─ admin.createDriver                   Drivers.tsx:64
          │   └─ normaliza phone, bcrypt, INSERT  server/admin/drivers-router.ts:26-69
          ├─ admin.updateDriver                   Drivers.tsx:62
          │   └─ phone único, bcrypt, sessionVersion++
          │                                       server/admin/drivers-router.ts:71-121
          ├─ admin.deleteDriver                   Drivers.tsx:46
          │   └─ transacción: historial/activos, DELETE
          │                                       server/admin/drivers-router.ts:123-170
          └─ utils.driver.list.invalidate()       Drivers.tsx:47,67
```

1. **Listado.** La página consulta `driver.list` con `adminQuery`. El backend
   devuelve `id`, nombre, teléfono, vehículo, placa, estado, rating, coordenadas
   y comisión; no devuelve credenciales (`server/driver-router.ts:15-31`). La UI
   calcula los contadores online/busy/offline en cliente (`Drivers.tsx:27-29`).
2. **Alta.** `openCreate` limpia el formulario y fija comisión `75`
   (`Drivers.tsx:31-35`). `handleSave` normaliza la comisión con
   `parseFloat(...).toFixed(2)` (`Drivers.tsx:57`) y llama
   `admin.createDriver` (`Drivers.tsx:64`). El servidor normaliza el teléfono a
   dígitos, rechaza duplicados exactos, hashea con bcrypt e inserta
   (`server/admin/drivers-router.ts:37-65`).
3. **Edición.** `openEdit` precarga nombre, teléfono, vehículo, placa y comisión;
   la contraseña queda vacía (`Drivers.tsx:37-41`). Si se escribe contraseña, se
   envía; si no, se omite (`Drivers.tsx:60-62`). El servidor vuelve a comprobar
   el teléfono, hashea la nueva contraseña e incrementa `sessionVersion`
   (`server/admin/drivers-router.ts:86-105`).
4. **Borrado.** `confirm()` nativo (`Drivers.tsx:44`) y `admin.deleteDriver`
   (`Drivers.tsx:46`). El backend abre transacción, bloquea el borrado si existe
   cualquier pedido histórico (`server/admin/drivers-router.ts:129-140`),
   comprueba pedidos activos (`:143-159`), desvincula pedidos y elimina el
   driver (`:161-165`).
5. **Estado y comisión.** El estado es de solo lectura en esta ruta: no hay
   mutación admin para `online/busy/offline`. La comisión se edita en el mismo
   modal (`Drivers.tsx:330-341`) y se persiste en `drivers.commission_rate`
   (`db/schema.ts:103`). La ganancia se calcula después, al entregar, con la
   tasa vigente en ese momento (`server/order-router.ts:893-911`).
6. **Rendimiento y liquidación.** `driverPerformance`
   (`server/admin/drivers-router.ts:172-203`) y
   `driverEarningsBreakdown` (`:205-263`) son procedimientos admin, pero la
   página no los consume. El Dashboard consume el breakdown
   (`src/pages/admin/Dashboard.tsx:71`); la liquidación por pedido se alterna en
   `/admin/orders` (`server/admin/orders-router.ts:165-177`).

## 3. Hallazgos

| ID | Severidad (P0/P1/P2) | Área | Archivo:línea | Hallazgo | Impacto | Corrección propuesta |
|---|---|---|---|---|---|---|
| **ADM-DRV-01** | P1 | Auth / identidad driver | `server/login-router.ts:167-183`; `server/admin/drivers-router.ts:37-45`; `db/schema.ts:94` | El alta/edición compara el teléfono normalizado completo, pero el login hace fallback por los últimos 9 dígitos sin `ORDER BY` ni `LIMIT` (`login-router.ts:175-183`). Formatos como `+593 099...` y `099...` normalizan distinto y pueden coexistir; el fallback devuelve la primera fila que entregue Postgres. | El driver puede entrar a la cuenta equivocada (pedidos/PII) o quedar bloqueado; la unicidad declarada no cubre el identificador efectivo de login. | Canonicalizar el teléfono al escribir con la misma regla del login, o imponer unicidad por últimos 9 dígitos. En el fallback, ordenar de forma determinista, `.limit(1)` y fallar con conflicto si hay ambigüedad. |
| **ADM-DRV-02** | P1 | Reasignación / integridad de pedidos | `server/admin/orders-router.ts:242-257,285-306,341-400`; `server/driver-router.ts:537-538` | `assignDriver` solo valida el estado del pedido: no comprueba que el driver destino exista, esté online/busy, no tenga otro pedido activo, ni que el pedido no tenga retiros parciales (`pickedUpCommerceIds` no vacío con estado `driver_assigned`). Además, `updateOrderStatus` permite llamar `delivered` sobre un pedido ya `delivered` con otro `driverId` porque el guard terminal solo compara estados (líneas 242-250), y luego reasigna/crea liberación sin mover el earning existente. | Un driver puede quedar con dos pedidos; se reasigna un pedido ya retirado parcialmente; un pedido entregado puede cambiar de driver; el earning queda asociado al driver anterior y el comercio no recibe SSE de la reasignación (`orders-router.ts:405-411` solo emite `order:` y `driver:`). | Bloquear la fila del driver; validar existencia, estado y ausencia de pedido activo; rechazar `pickedUpCommerceIds.length > 0`; en estados terminales rechazar cualquier cambio de `driverId`; liberar al anterior solo si no tiene otro activo; emitir a `commerce:{id}`. |
| **ADM-DRV-03** | P1 | Seguridad / sesión admin | `server/admin-auth.ts:13-29,42-51`; `server/context.ts:72-95`; `server/login-router.ts:241-258`; `server/admin-router.ts:32-51` | Los JWT admin solo llevan `userId` y `role`; no incluyen `sessionVersion` y el `jti` del refresh no se persiste ni se valida. `login.logout` se limita a borrar cookies y `admin.refresh` puede emitir un access nuevo con cualquier refresh válido, sin rate limit. | Un refresh admin copiado sigue siendo válido hasta 7 días después del logout; el acceso permite ver PII de repartidores y borrar cuentas. | Añadir `sessionVersion` a los tokens admin y validarlo en `context`/`refresh`, como ya se hace con drivers (`context.ts:131-136`); incrementarlo en logout y en cualquier cambio de contraseña admin; limitar el refresh. |
| **ADM-DRV-04** | P1 | Validación / credenciales | `server/admin/drivers-router.ts:27-34,72-105,107-120`; `src/pages/admin/Drivers.tsx:298-306`; `db/schema.ts:93-97` | `updateDriver` solo cambia la contraseña si `trim().length >= 4` (`drivers-router.ts:98`); con 1-3 caracteres no devuelve error y la contraseña queda igual. Create acepta mínimo 4, la UI promete mínimo 6 y no tiene `minLength`. Además, `phone` en update es opcional sin mínimo: un `""` se normaliza a `""` y se guarda (`:75,86-96`); nombre/vehículo/placa también aceptan vacío; no se replican los máximos de DB (nombre 200, teléfono 20, vehículo 100, placa 20); un `id` inexistente devuelve 200 sin datos (`:107-120`); y el chequeo de duplicado es check-then-write, por lo que una carrera choca con la unique y no se mapea a un `CONFLICT` (`:39-48,88-104`). | El admin puede creer que rotó una contraseña y no ocurrió; puede dejar a un driver sin login al vaciar el teléfono; errores de longitud terminan en 500; un update a un id inexistente parece exitoso. | Política única de contraseña (mínimo y máximo) en Zod y UI, con error explícito; `trim().min()` para teléfono/nombre/vehículo/placa; máximos espejo de DB; verificar fila afectada y lanzar `NOT_FOUND`; capturar `23505` y devolver `CONFLICT`. |
| **ADM-DRV-05** | P1 | Dinero / comisión | `src/pages/admin/Drivers.tsx:57`; `server/admin/drivers-router.ts:33,54,79,104`; `db/schema.ts:103`; `server/order-router.ts:672,899-900` | Si el campo de comisión queda vacío o no numérico, el frontend usa **80** (`Drivers.tsx:57`), no el default 75 del formulario ni el 75 de la DB. El backend acepta cualquier string (`z.string().optional()`), sin rango 0-100; `numeric(5,2)` admite negativos y hasta 999.99. Tampoco hay snapshot de la tasa al asignar: la ganancia final se calcula con la comisión vigente al entregar (`order-router.ts:899-900`). | Comisión futura incorrecta, sobre/subpago del driver y del neto admin; diferencia entre ganancia estimada y acreditada si se edita la tasa durante un pedido activo. | Validación compartida `z.coerce.number().min(0).max(100)`, default 75, rechazo de vacío/NaN y mensaje inline; congelar la tasa al asignar/aceptar o documentar que la tasa al entregar es la contractual. |
| **ADM-DRV-06** | P2 | UI / estados de carga | `src/pages/admin/Drivers.tsx:14-15,94-96,182-184,191-192` | La página solo desestructura `data` e `isLoading`. Si la query falla, `data` queda `undefined`, se convierte en `[]` y se muestra “Sin repartidores”; no hay `isError`, `error` ni `refetch`. Tampoco monta `useAdminSSE` (solo Dashboard y Orders lo usan: `Dashboard.tsx:80`, `Orders.tsx:61`). | Un fallo de red o un 500 parece una lista vacía; el admin puede intentar crear duplicados. Los contadores online/busy quedan obsoletos hasta recargar. | Exponer `isError/error/refetch` con un estado distinto del vacío y reintento; invalidar por SSE admin o polling de 30 s como respaldo. |
| **ADM-DRV-07** | P2 | Borrado / UX destructiva | `src/pages/admin/Drivers.tsx:43-51,174-177,240-246`; `server/admin/drivers-router.ts:129-159` | El botón Eliminar se muestra para todos los drivers. El guard de historial bloquea cualquier driver con pedidos antes de llegar al guard de pedidos activos, así que el mensaje específico de “pedidos en curso” es código muerto. El mensaje pide “Desactívalo”, pero no existe endpoint ni UI de desactivación. | El admin confirma borrados que siempre fallan; no hay una ruta operativa para retirar un driver con historial; el mensaje es engañoso. | Calcular `canDelete/hasHistory` y ocultar o deshabilitar el botón; ajustar el mensaje a la acción realmente disponible; retirar el guard inalcanzable. |
| **ADM-DRV-08** | P2 | Integridad contable | `db/schema.ts:288`; `server/admin/drivers-router.ts:161-165` | `driver_earnings.driver_id` es `onDelete: "cascade"` (`schema.ts:288`), pero el comentario del router dice que las ganancias se conservan. El `update orders set driverId = null` es inalcanzable porque cualquier pedido ya bloqueó el borrado. Si un driver no tiene `orders.driver_id` pero sí earnings (reasignación o dato legacy), el borrado elimina su historial contable. | Pérdida de trazabilidad financiera en casos borde; la documentación promete una conservación que el esquema no garantiza. | Bloquear también si existen `driver_earnings` o usar borrado lógico; corregir el comentario y no prometer conservación sin respaldo. |
| **ADM-DRV-09** | P2 | Disponibilidad / estado | `server/admin/orders-router.ts:279-286,310-311,380,400`; `server/admin/dashboard-router.ts:60-70`; `src/pages/admin/Dashboard.tsx:152` | El admin no puede corregir `online/busy/offline` ni limpiar un `busy` huérfano. `assignDriver` pone `busy` al destino aunque esté offline; entrega, cancelación y reasignación fuerzan `online` sin mirar el estado previo ni si el driver tiene otro pedido activo. El KPI “Repartidores (Activos)” suma solo `online`, excluyendo `busy`. | Se rompe la regla “online solo por acción explícita”; los contadores de disponibilidad no reflejan la operación; un driver puede quedar online sin estarlo. | Derivar la disponibilidad de pedidos activos o preservar el estado previo; validar el estado del destino antes de asignar; sumar online+busy o renombrar el KPI a “En línea”. |
| **ADM-DRV-10** | P2 | Datos / rating | `src/pages/admin/Drivers.tsx:169,205`; `db/schema.ts:101` | La UI muestra `4.5` cuando `rating` es `null` o vacío. En el repositorio no hay ningún endpoint que escriba `drivers.rating`: solo se lee (`server/driver-router.ts:25`, `server/admin/drivers-router.ts:62,114,183`). | Se muestra una calificación inventada; el admin puede tomar decisiones de asignación con un dato falso. | Mostrar “Sin calificar” o el valor real; no inventar un default en la UI. |
| **ADM-DRV-11** | P2 | Búsqueda / operación | `src/pages/admin/Drivers.tsx:23-25,117-123` | El filtro solo compara `name`. No busca por teléfono (el identificador de login), placa, vehículo ni estado. | El soporte no puede encontrar al driver por el dato con el que inicia sesión; localizar una placa es manual. | Normalizar la consulta y buscar en nombre, teléfono, placa y vehículo; si se desea, filtro por estado coherente con las tarjetas. |
| **ADM-DRV-12** | P2 | Performance / payload | `server/driver-router.ts:15-31`; `src/pages/admin/Drivers.tsx:14` | `driver.list` hace un `SELECT` sin límite, sin `ORDER BY` y sin paginación, y devuelve teléfono y coordenadas de toda la flota. | El payload y el render crecen con el número de drivers; las coordenadas no se usan en todas las vistas y aumentan la exposición de datos. | Paginación o `limit` server-side con búsqueda; orden determinista; proyección sin lat/lng si la tabla no las necesita. |
| **ADM-DRV-13** | P2 | Accesibilidad / formulario | `src/pages/admin/Drivers.tsx:259-271,282-340`; `src/components/PhoneInput.tsx:110`; `src/pages/admin/Drivers.tsx:85-88,236-246` | El modal no tiene `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, cierre con Escape, scroll lock ni cierre por overlay. Los `<label>` no están asociados con `htmlFor`. `PhoneInput` renderiza su propio label y el formulario agrega otro, duplicándolo. Cerrar mide 32 px, “Nuevo” ~32 px y las acciones móviles 40 px. | Uso deficiente con teclado/lector de pantalla; targets táctiles por debajo de 44 px; el formulario muestra dos etiquetas para el mismo campo. | Usar un diálogo accesible (Radix Dialog o equivalente), asociar labels, dejar un solo label de teléfono y llevar los targets a ≥44 px. |
| **ADM-DRV-14** | P2 | Visual / dark mode | `src/components/AdminLayout.tsx:33,35`; `src/pages/admin/Drivers.tsx:77,260,349,356`; `tailwind.config.js:83-101` | El admin no tiene variantes `dark:` pese a que el proyecto usa `darkMode: ["class"]` (`tailwind.config.js:3`) y otras pantallas sí lo implementan. Además, `animate-fade-in`, `backdrop-blur-xs` y `active:scale-98` no están definidas en Tailwind 3.4/config, por lo que no producen efecto. | El panel queda blanco/ilegible si se activa dark mode; animaciones y feedback táctil no se aplican. | Usar tokens/variantes dark en layout y página; reemplazar las utilidades inexistentes por las definidas o declararlas en la config. |
| **ADM-DRV-15** | P2 | Contraste / tipografía | `src/pages/admin/Drivers.tsx:102,106,110,159-160,209-210`; `src/components/AdminLayout.tsx:97` | Las etiquetas de las tarjetas usan 10 px y colores `green-600`/`orange-600` sobre fondos `-50`; el bottom nav móvil usa 7.5 px. Los textos pequeños pueden no alcanzar contraste AA. | Lectura difícil en móvil y para usuarios con baja visión. | Subir tamaño y tono de los textos pequeños; verificar contraste AA en estados y navegación. |
| **ADM-DRV-16** | P2 | Feedback / destructive action | `src/pages/admin/Drivers.tsx:43-50,66-71` | El borrado usa `confirm()` nativo y los errores usan `alert()`; al guardar, el modal se cierra sin toast ni confirmación visual. No hay undo ni detalle del impacto del borrado. | Falta de feedback claro; riesgo de borrado accidental; experiencia inconsistente con el resto del panel. | Diálogo destructivo con nombre e impacto, toast de éxito y errores inline; no usar `alert` para flujos normales. |
| **ADM-DRV-17** | P2 | Formulario / pérdida de datos | `src/pages/admin/Drivers.tsx:265-270,346-359` | Cerrar y Cancelar siguen habilitados mientras `saving` está activo; el modal puede cerrarse durante la mutación. Tampoco hay guard de cambios sin guardar. | Se pierden ediciones o se cierra el modal mientras la petición sigue en vuelo. | Deshabilitar cierre/cancelar durante el guardado y confirmar el descarte si el formulario está dirty. |
| **ADM-DRV-18** | P2 | Seguridad / FCM | `server/admin/drivers-router.ts:98-101`; `server/driver-router.ts:603-604`; `db/schema.ts:106` | El cambio de contraseña incrementa `sessionVersion` (correcto), pero no limpia `fcmToken`; el logout sí lo hace (`driver-router.ts:603-604`). La UI tampoco avisa que se cerrarán las sesiones del driver. | El dispositivo revocado puede seguir recibiendo push hasta que FCM falle; el admin no sabe que la rotación expulsa al driver. | Limpiar `fcmToken` al cambiar contraseña y avisar en el modal que las sesiones activas se cerrarán. |
| **ADM-DRV-19** | P2 | Alcance / endpoints muertos | `server/admin/drivers-router.ts:172-263`; `src/pages/admin/Dashboard.tsx:71`; `src/pages/admin/Orders.tsx:236-245`; `src/hooks/useDeliveryData.ts:601-609` | La ruta no muestra rendimiento, ganancias ni liquidaciones: `driverPerformance` no tiene consumidor, el helper `useAdminAssignDriver` no tiene UI y las liquidaciones están en `/admin/orders`. El alcance solicitado para `/admin/drivers` no coincide con la implementación. | El admin debe buscar funciones en otras pantallas; endpoints/helpers sin uso se desactualizan y confunden la auditoría. | Documentar qué pantalla es dueña de cada función; eliminar helpers sin uso o consolidar la navegación sin duplicar vistas. |
| **ADM-DRV-20** | P2 | Liquidaciones / integridad | `server/admin/orders-router.ts:165-177`; `src/pages/admin/Orders.tsx:236-245`; `db/schema.ts:196` | `toggleDriverSettled` no exige que el pedido esté `delivered`, que tenga driver ni que exista earning; alterna un booleano sin auditoría (quién/cuándo) y sin idempotencia. La UI solo muestra el botón en `delivered`, pero la API no lo valida. | Se puede marcar/desmarcar “Saldado” en pedidos no entregados o sin repartidor; no hay rastro para conciliar disputas. | Validar `delivered` y la existencia de `driver_earnings`; registrar `settledAt`/actor o usar un estado con historial; rechazar estados inválidos. |
| **ADM-DRV-21** | P2 | Liquidación comercio | `server/admin/orders-router.ts:96-101,119-129`; `db/schema.ts:258` | La conciliación de comercio recalcula con `commerces.commissionRate` actual en vez de usar `order_commerce_status.commission_amount`; el lado driver sí usa `driver_earnings.amount` (`orders-router.ts:107-111`). | La liquidación del comercio cambia retroactivamente si se edita la tasa, en contradicción con la comisión histórica documentada (C-14). | Leer `commission_amount` y usar la tasa actual solo como fallback para pedidos legacy sin snapshot. |
| **ADM-DRV-22** | P2 | Copy / consistencia | `src/pages/admin/Drivers.tsx:44,134-138,160,210,331` | Hay copy inconsistente: “Vehiculo”, “Ubicacion” y “Calif.” sin tilde; los estados “Online/Offline” conviven con “En línea/Desconectados”; la confirmación “Eliminar repartidor \"...\"?” no usa “¿”; “Ganancia del Repartidor” mezcla mayúsculas. | El panel se percibe descuidado y las etiquetas no coinciden entre escritorio y móvil. | Unificar español, acentos y etiquetas de estado en toda la página. |
| **ADM-DRV-23** | P2 | Navegación móvil / sesión | `src/components/AdminLayout.tsx:83-103`; `src/pages/admin/Drivers.tsx:77-90` | En móvil el layout solo muestra el bottom nav, sin logout; el header de `/admin/drivers` tampoco tiene “Salir”. El logout existe en el sidebar desktop y en los headers de Dashboard (`Dashboard.tsx:129-137`) y Settings (`Settings.tsx:154`), pero no en esta ruta. | No se puede cerrar sesión desde `/admin/drivers` en móvil sin navegar a otra pantalla; riesgo en dispositivo compartido. | Incluir un acceso de logout en el layout móvil o en el header de la ruta, reutilizando el handler role-scoped existente. |
| **ADM-DRV-24** | P2 | Paridad visual desktop/móvil | `src/pages/admin/Drivers.tsx:132-140,228-230` | La tabla desktop no muestra la comisión (solo el card móvil la muestra); a la inversa, el card móvil no muestra la ubicación que sí aparece en desktop. | El admin no puede comparar comisiones ni ubicaciones sin abrir cada edición o cambiar de dispositivo; la información clave no está donde se opera. | Unificar columnas/campos entre tabla y card, o mover comisión/ubicación a un detalle consistente. |

## 4. Integración con Cliente, Negocio y Driver

| Tramo | Estado | Evidencia / riesgo |
|---|---|---|
| Alta de driver → login `/login` (Celular) | **Parcial** | El alta guarda dígitos y el login normaliza; funciona para formatos canónicos. El fallback por últimos 9 puede elegir otra cuenta (ADM-DRV-01, `login-router.ts:175-183`). |
| Edición de teléfono/nombre/vehículo/placa → perfil driver | **Correcto en siguiente lectura** | Admin y driver leen la misma fila (`drivers`); `driver.getProfile` no devuelve hash ni FCM (`driver-router.ts:46-67`). No hay push ni SSE al perfil; el driver ve el cambio al refrescar. |
| Cambio de contraseña → sesión driver | **Correcto en revocación; incompleto en FCM** | `sessionVersion` se incrementa (`drivers-router.ts:98-101`) y se valida en contexto/refresh (`context.ts:131-136`; `driver-auth.ts:119-135`). El `fcmToken` permanece (ADM-DRV-18). |
| Comisión → disponibilidad/ganancias | **Parcial** | Las ganancias históricas salen de `driver_earnings.amount` y no se recalculan; las futuras usan la tasa vigente al entregar (`order-router.ts:899-900`). No hay snapshot al asignar (ADM-DRV-05). |
| Estado → disponibilidad | **No administrable** | El admin no edita `online/busy/offline`; `assignDriver`/`updateOrderStatus` fuerzan `busy`/`online` sin preservar el estado previo (ADM-DRV-09). |
| Borrado → pedidos del cliente/negocio | **Protegido con historial** | Cualquier pedido con `driverId` bloquea el borrado (`drivers-router.ts:129-140`); `orders.driver_id` es `ON DELETE SET NULL` (`schema.ts:183`). El caso earnings sin pedido puede perder historial (ADM-DRV-08). |
| Reasignación → pedido/comercio | **Incompleto** | `assignDriver` rechaza terminales y `picked_up`/`on_the_way`, pero permite reasignar un pedido con retiro parcial y no valida capacidad del destino (ADM-DRV-02). No emite a `commerce:{id}` (`orders-router.ts:405-411`). |
| Entrega → cliente/negocio | **Correcto** | `delivered` exige `on_the_way` y todos los comercios retirados; escribe `deliveredAt` y earning idempotente (`order-router.ts:874-911`; unique en `schema.ts:295`). |
| Liquidación driver | **Correcta en monto** | `/admin/orders` usa `driver_earnings.amount` cuando existe (`orders-router.ts:107-111`), no la tasa actual. El toggle de “Saldado” no tiene guard ni auditoría (ADM-DRV-20). |
| Liquidación comercio | **Inconsistente** | Recalcula con la tasa actual en vez del snapshot (`orders-router.ts:96-101,119-129`), a diferencia de la regla C-14. |
| PII / credenciales | **Sin fuga observada** | `driver.list`, create/update y performance usan proyección explícita sin `passwordHash`/`fcmToken` (`driver-router.ts:18-29`; `drivers-router.ts:55-65,107-117,176-186`). El admin sí ve teléfono y coordenadas, lo cual es esperable para su rol. |

## 5. Lo que funciona y no se debe romper

1. **Autorización.** `driver.list`, `createDriver`, `updateDriver`, `deleteDriver`,
   `driverPerformance` y `driverEarningsBreakdown` usan `adminQuery`
   (`server/driver-router.ts:15`; `server/admin/drivers-router.ts:26,71,123,172,205`).
   `adminQuery` exige `ctx.admin.role === "admin"` (`server/middleware.ts:25-36`).
2. **Proyección sin secretos.** El listado admin y las respuestas de alta/edición
   no devuelven `passwordHash` ni `fcmToken` (`server/driver-router.ts:18-29`;
   `server/admin/drivers-router.ts:55-65,107-117`). No se debe introducir un
   `select *` en estos endpoints.
3. **Teléfono único.** La DB tiene unique en `drivers.phone` (`db/schema.ts:94`) y
   hay comprobación previa en create/update (`drivers-router.ts:39-45,88-94`).
   La corrección de ADM-DRV-01 debe mantener la unicidad.
4. **Revocación por contraseña.** Cambiar la contraseña incrementa
   `sessionVersion` (`drivers-router.ts:98-101`) y el contexto/refresh lo valida
   (`context.ts:131-136`; `driver-auth.ts:119-135`). Es la base para cerrar
   sesiones del driver.
5. **Borrado con historial.** Cualquier pedido histórico bloquea el borrado
   (`drivers-router.ts:129-140`), cumpliendo la regla de
   `docs/driver/VERIFICATION.md:69-71`. El guard de pedidos activos existe
   (`:143-159`), aunque hoy es inalcanzable por el guard anterior
   (ADM-DRV-07).
6. **Estados terminales.** `admin.updateOrderStatus` rechaza cambiar un pedido
   `delivered`/`cancelled` a otro estado (`orders-router.ts:242-250`) y
   `assignDriver` rechaza terminales/retirados (`:361-372`). La corrección de
   ADM-DRV-02 debe cerrar el bypass del mismo estado.
7. **Ganancia histórica.** `driver_earnings.amount` es la fuente del monto. El
   flujo driver usa la unique `(order_id, type)` con `onConflictDoNothing`
   (`db/schema.ts:295`; `order-router.ts:893-911`) y el flujo admin comprueba la
   existencia dentro de la transacción (`orders-router.ts:288-306`). No se debe
   volver a calcular la ganancia histórica con la tasa actual.
8. **Sesión y logout role-scoped.** `SessionGuard` es cookie-first para
   admin/merchant/driver (`SessionGuard.tsx:102-127`) y
   `login.logout` acepta `scope` (`login-router.ts:241-258`); el layout admin
   limpia solo su rol (`AdminLayout.tsx:23-29`). No cerrar sesiones de otros
   roles.
9. **Ruta protegida.** `/admin/drivers` está dentro de
   `SessionGuard role="admin"` (`App.tsx:134`). No quitar ese guard.
10. **Reglas documentadas.** “No borrar un driver con historial” y “la
    liquidación usa el monto acreditado” están en
    `docs/driver/VERIFICATION.md:69-71` y
    `docs/driver/audit/MASTER_TRIAGE.md:50`. Cualquier cambio debe actualizar
    esos documentos y volver a pasar los smokes.
11. **Sin mass assignment ni IDOR observable.** `createDriver`/`updateDriver`
    usan Zod con claves explícitas y `...data` solo contiene
    `name/vehicle/licensePlate/commissionRate`
    (`server/admin/drivers-router.ts:27-34,72-84`). `driver.list` no acepta `id`
    y es admin global por diseño; no se encontró un IDOR explotable en esta
    ruta.
12. **Moneda.** `/admin/drivers` no muestra importes monetarios: la comisión es
    un porcentaje. En las pantallas relacionadas, Dashboard y Orders usan `$` +
    `toFixed(2)` sin separador de miles (`Dashboard.tsx:278-286`,
    `Orders.tsx:201-233`); no se encontró un error de moneda, solo falta de
    formato localizado.
13. **Sin N+1 en esta ruta.** `driver.list` es una sola consulta;
    `driverPerformance` hace dos consultas y `driverEarningsBreakdown` usa
    agregados (`server/admin/drivers-router.ts:176-195,208-230`). El problema de
    performance es el listado sin límite (ADM-DRV-12), no un N+1.
14. **Cookies admin.** Se emiten con `HttpOnly` y opciones por entorno
    (`server/admin-auth.ts:70-82`; `server/lib/cookies.ts:8-16`); no se
    encontró exposición de la cookie al JavaScript del cliente.

## 6. Evidencia y verificación

**Comandos y comprobaciones ejecutadas (solo lectura):**

| Comprobación | Resultado |
|---|---|
| `git status --short` | Sin cambios locales; working tree limpio. |
| `git log --oneline -12 -- server/admin/drivers-router.ts src/pages/admin/Drivers.tsx db/migrations server/admin/orders-router.ts` | Último commit relevante: `5a9853a fix(driver): session segura, aceptacion/retiro/entrega, PII, ganancias e historial`. |
| `git show --stat 5a9853a` | 31 archivos; incluye `drivers.session_version`, unique de teléfono, índice de historial y cambios de earnings. |
| Lectura estática de los archivos de la sección 1 | Hallazgos con archivo:línea citados en la tabla. |
| Búsqueda de usos de `driverPerformance`, `useAdminAssignDriver`, `driverEarningsBreakdown`, `useAdminSSE` | `driverPerformance` sin consumidor; `useAdminAssignDriver` sin UI; breakdown en Dashboard; SSE admin solo en Dashboard/Orders. |
| Verificación de proyecciones | `driver.list` y respuestas admin no incluyen `passwordHash`/`fcmToken`. |

**Evidencia documental usada:**

- `docs/driver/VERIFICATION.md:73-83` afirma que la migración `0009` aplicó
  `drivers.session_version`, el unique de `drivers.phone` y el índice
  `orders(driver_id,status,delivered_at)`, y que `db:generate` quedó sin cambios.
- `docs/driver/VERIFICATION.md:57-71` registra las pruebas de “admin no borra
  driver con historial” y “admin no reasigna pedido retirado/terminal”.
- `docs/driver/audit/MASTER_TRIAGE.md:50` registra que la liquidación debe usar
  el monto acreditado, no la tasa actual.
- `docs/driver/README.md:59-64,107-126` fija las reglas de disponibilidad,
  ganancias e historial.

**No ejecutado por instrucción expresa:**

- No se ejecutó `npm test`, `tsc`, `lint`, `build`, migraciones, consultas a
  PostgreSQL, smokes ni el servidor de desarrollo.
- No se verificó en runtime si el unique de teléfono está efectivamente aplicado
  en la base actual, si existen teléfonos duplicados por últimos 9 dígitos, ni
  el estado real de las liquidaciones.
- No se abrió el navegador ni se probó el modal; los hallazgos visuales son
  estáticos sobre clases y estructura JSX.

**Limitación principal:** este informe no reemplaza una prueba E2E de admin. Para
cerrar ADM-DRV-01/02/04/05 hace falta una prueba de API con dos teléfonos que
compartan últimos 9 dígitos, un pedido con retiro parcial, una comisión inválida
y un cambio de contraseña de 1-3 caracteres.

## 7. Resumen para consolidado (top 5)

| # | ID | Severidad | Hallazgo | Archivo:línea |
|---|---|---|---|---|
| 1 | **ADM-DRV-02** | P1 | Reasignación sin capacidad del driver ni guard de retiro parcial; `delivered` puede cambiar de driver con el mismo estado. | `server/admin/orders-router.ts:242-257,285-306,341-400`; `server/driver-router.ts:537-538` |
| 2 | **ADM-DRV-01** | P1 | Login por últimos 9 dígitos ambiguo; el alta solo garantiza unicidad del número completo. | `server/login-router.ts:167-183`; `server/admin/drivers-router.ts:37-45` |
| 3 | **ADM-DRV-03** | P1 | Sesión admin sin `sessionVersion` ni revocación; el refresh sobrevive al logout. | `server/admin-auth.ts:13-29,42-51`; `server/context.ts:72-95` |
| 4 | **ADM-DRV-05** | P1 | Comisión inválida cae a 80%, sin rango server-side y sin snapshot al asignar. | `src/pages/admin/Drivers.tsx:57`; `server/admin/drivers-router.ts:33,79,104` |
| 5 | **ADM-DRV-04** | P1 | Contraseña corta se ignora en silencio; teléfono/nombre vacíos y límites de DB sin validar. | `server/admin/drivers-router.ts:72-105`; `src/pages/admin/Drivers.tsx:298-306` |

No se encontró P0. Los cinco P1 anteriores son los de mayor riesgo; el resto
son P2 de acabado, consistencia, accesibilidad o rendimiento. La corrección de
ADM-DRV-02 y ADM-DRV-04 debe coordinarse con los flujos Driver y Admin ya
verificados para no reintroducir los invariantes de un pedido activo por driver,
PII y ganancias históricas.