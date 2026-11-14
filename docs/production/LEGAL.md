# Frente 12 — Legal, privacidad y LOPDP

**Estado:** NO-GO legal para producción hasta cerrar los P0 de este informe.
**Fecha:** 2026-11-13.
**Alcance:** páginas legales, enlaces de entrada/footer/PWA, consentimiento, retención, PII en pedidos/chat, borrado de cuenta, cookies, encargados y transferencias internacionales.
**Restricción respetada:** no se editó código ni páginas legales. Este documento es el único archivo creado.

> Este informe es técnico-jurídico y no sustituye la revisión de un abogado ecuatoriano ni la del Delegado de Protección de Datos. Las citas legales deben validarse contra el texto vigente antes de publicar.

---

## 1. Veredicto ejecutivo

La estructura legal existe y las rutas cargan, pero **la documentación promete más de lo que el sistema hace**. Los bloqueadores son:

1. La solicitud pública de eliminación **solo crea un ticket**: no elimina ni anonimiza nada, y no existe cola administrativa para procesarla (`server/customer-router.ts:464-485`).
2. El formulario público de baja **no verifica identidad** (solo teléfono + nombre) y permite solicitar la baja de un tercero (`server/customer-router.ts:434-443`).
3. Las páginas afirman borrar “historial, direcciones y chat”, pero el borrado autenticado solo anonimiza la fila `customers`; pedidos y chat conservan PII (`server/customer-router.ts:411-431`; `db/schema.ts:194-197,270-285`).
4. Los formularios de **reclamo** y **arrepentimiento** generan tickets falsos y guardan cédula/teléfono en `localStorage`, sin enviar nada al backend (`ConsumerProtection.tsx:114-135`; `RegretButton.tsx:104-134`).
5. La Política de Privacidad cita mal los artículos de la LOPDP: usa “Arts. 21-26” para ARCO+, cuando los derechos están en los Arts. 13-20 (`PrivacyPolicy.tsx:51-81`).
6. Se ofrecen **tarjetas y “Rapidy Cash”** en Términos/Reembolsos, pero el esquema solo admite efectivo y transferencia (`db/schema.ts:44`; `termsData.ts:115`; `RefundPolicy.tsx:263-274`).

Sin corregir estos puntos, publicar aumenta el riesgo de reclamos por publicidad engañosa, incumplimiento de derechos del titular y sanciones de la SPDP.

---

## 2. Inventario real de páginas y rutas

| Ruta(s) | Archivo | Estado | Observación |
|---|---|---|---|
| `/legal` | `src/pages/legal/LegalHub.tsx` | Pública, OK | Hub de 6 pilares; enlaza a todas las rutas. |
| `/terminos-y-condiciones`, `/terminos` | `src/pages/legal/TermsAndConditions.tsx` + `termsData.ts` | Pública, OK | 10 cláusulas; sin fecha/versión real ni registro de aceptación. |
| `/politica-de-privacidad`, `/privacidad` | `src/pages/PrivacyPolicy.tsx` | Pública, OK | **Está fuera de `src/pages/legal`**; el hub la enlaza correctamente. |
| `/politica-de-reembolso`, `/reembolsos` | `src/pages/legal/RefundPolicy.tsx` | Pública, OK | 4 pestañas; canales de reintegro no implementados. |
| `/boton-de-arrepentimiento`, `/arrepentimiento` | `src/pages/legal/RegretButton.tsx` | Pública, OK | Formulario solo local; cita Art. 45 LODC sin el plazo vigente. |
| `/defensa-del-consumidor` | `src/pages/legal/ConsumerProtection.tsx` | Pública, OK | “Libro Digital” solo en `localStorage`; no hay libro real. |
| `/eliminar-cuenta` | `src/pages/legal/DeleteAccount.tsx` | Pública, OK | Ticket sin procesamiento; SLA 48 h no respaldado. |
| `*` | `src/App.tsx:153` | 404 | Correcto. |

Rutas declaradas en `src/App.tsx:142-152`. No hay `SessionGuard` en ninguna ruta legal: son accesibles sin sesión, lo cual es correcto para Google Play y consumidores.

---

## 3. Enlaces de entrada, footer y PWA

### 3.1 Dónde sí hay enlaces legales

| Lugar | Evidencia | Enlaces |
|---|---|---|
| Welcome cliente | `src/pages/customer/Welcome.tsx:102-124` | Términos, Privacidad, Centro Legal. |
| Registro cliente | `src/pages/customer/Register.tsx:373-383` | Términos y Privacidad, pero solo como aviso pasivo (“Al continuar aceptas”), sin checkbox ni evidencia. |
| Perfil cliente | `src/pages/customer/Profile.tsx:340-384` | Centro Legal, Arrepentimiento, Eliminar cuenta. |
| Términos | `src/pages/legal/TermsAndConditions.tsx:281-306` | Privacidad, Reembolsos, Centro Legal. |

### 3.2 Dónde faltan

- `src/pages/Login.tsx` (acceso de comercios/admin) **no tiene enlaces legales ni aviso de privacidad**. Tampoco los tienen las páginas de driver, comercio ni admin: el grep de `terminos|privacidad|Legal` en `src/pages/driver/*`, `src/pages/commerce/*` y `src/pages/admin/*` no devuelve resultados.
- La Política de Privacidad **no enlaza** a Términos, Reembolsos ni Defensa del Consumidor; solo a Eliminar cuenta (`PrivacyPolicy.tsx:314-321`).
- `RefundPolicy`, `RegretButton`, `ConsumerProtection` y `DeleteAccount` no enlazan entre sí ni a la Política de Privacidad.
- El footer de `LegalHub` no incluye enlaces, solo texto (`LegalHub.tsx:300-308`).

### 3.3 PWA

- `public/manifest.json` no declara enlaces legales ni `shortcuts`; no es obligatorio, pero ayudaría a cumplir Google Play/instalación.
- `index.html:31-34` cambia el manifest entre cliente y partners. `public/manifest-partners.json` tampoco incluye avisos legales.
- `public/sw.js:22-40` solo cachea assets estáticos (JS/CSS/imágenes); **no cachea HTML, API ni SSE**. Correcto desde privacidad: no hay PII en caché del service worker.
- El borrado público funciona sin instalar la app, pero es una SPA: requiere JS y el fallback de `server/lib/vite.ts:15`. Para Google Play conviene una URL estática o SSR que muestre el formulario aunque falle JS.

---

## 4. Hallazgos P0 (bloqueadores)

### P0-1. La eliminación de cuenta es un ticket sin ejecución

**Evidencia:**
- `DeleteAccount.tsx:79` llama a `customer.requestDeletion`.
- `DeleteAccount.tsx:190` afirma: “Tus datos serán eliminados en un plazo máximo de 48 horas hábiles”.
- `server/customer-router.ts:464-485` solo inserta en `account_deletion_requests` y devuelve un ticket; no borra ni anonimiza.
- No existe ninguna referencia a `accountDeletionRequests` en rutas admin (`grep` en `server/admin/**` = 0 resultados).
- El borrado autenticado `customer.deleteAccount` existe (`server/customer-router.ts:411-431`) pero **no se usa en ninguna UI** (`grep` solo lo encuentra en el router).

**Riesgo:** el titular cree que sus datos fueron suprimidos; en realidad siguen en `customers`, `orders`, `chat_messages`, `otp_verifications` y en el propio registro de baja. Es una infracción directa del Art. 15 LOPDP y una representación engañosa.

**Acción:** implementar cola/admin, verificación, ejecución real y evidencia; o cambiar el texto a “solicitud registrada, se atenderá en el plazo legal de 15 días” y no prometer 48 h.

### P0-2. Baja pública sin verificación de identidad

**Evidencia:** `server/customer-router.ts:434-443` acepta `phone`, `fullName`, `role` y `reason`; no hay OTP, sesión ni comprobante. `DeleteAccount.tsx:67-109` solo valida formato de teléfono. El rate limit es por teléfono (`customer-router.ts:448-462`), no por identidad.

**Riesgo:** cualquiera puede solicitar la baja de otra persona con su nombre y teléfono; el proceso puede usarse para denegar servicio o eliminar datos ajenos. También impide distinguir al titular real en un número compartido.

**Acción:** exigir OTP al teléfono registrado o sesión autenticada; si no es posible, verificación documental y respuesta al canal registrado. No revelar si el teléfono existe.

### P0-3. El alcance del borrado es falso

**Evidencia:**
- `DeleteAccount.tsx:421-423` promete eliminar “perfil y acceso”, “ubicación” e “historial de pedidos, favoritos y registros de chat”.
- `LegalHub.tsx:123` promete “supresión definitiva de perfil, historial transaccional y borrado irrevocable de credenciales”.
- `server/customer-router.ts:416-427` solo actualiza `customers.firstName`, `lastName`, `phone`, `address`, `fcmToken`, `deletedAt` y `sessionVersion`.
- `orders` conserva `deliveryAddress`, `customerPhone`, `notes`, `paymentReceipt` (`db/schema.ts:194-197`); `chat_messages` conserva `senderName`, `message` (`db/schema.ts:270-285`); `otp_verifications` conserva `phone` e `ip` (`db/schema.ts:303-321`); `account_deletion_requests` conserva nombre, teléfono, motivo e IP (`db/schema.ts:326-340`).

**Riesgo:** los datos personales y el historial siguen siendo identificables por `customerId` y por los campos copiados en pedidos. La promesa de “borrado irreversible” es falsa.

**Acción:** definir una matriz de borrado por tabla antes de tocar código. Como mínimo: anonimizar pedidos (dirección, teléfono, notas, comprobante), borrar o anonimizar chat, purgar OTP, borrar el ticket de baja tras el plazo de auditoría y revocar tokens FCM. Conservar solo la información fiscal estrictamente necesaria.

### P0-4. Reclamos y arrepentimiento son simulaciones locales

**Evidencia:**
- `ConsumerProtection.tsx:114-135` genera un ticket `REC-EC-...` y guarda el reclamo completo (nombre, cédula, teléfono, email, pedido, detalle) en `localStorage`; no hay llamada al backend.
- `ConsumerProtection.tsx:326-328` dice “Tu reclamo ha sido incorporado formalmente en nuestro Libro Digital”; `:474` dice que “todos los reclamos… son auditados por nuestro equipo legal”.
- `RegretButton.tsx:104-134` usa `setTimeout(500)` y guarda cédula, teléfono y detalle en `localStorage`; `:290` dice “Tu solicitud ha quedado radicada formalmente”.

**Riesgo:** el consumidor recibe un código que no existe en ningún sistema; no hay trazabilidad, no hay libro de reclamaciones real y la empresa no puede demostrar atención. Además, la cédula queda en texto plano en el dispositivo, accesible a cualquier script del origen y a quien use el equipo.

**Acción:** persistir en servidor con ticket, estado, SLA y cola admin; enviar confirmación por WhatsApp/email. Si no se implementa, retirar las palabras “formalmente”, “Libro Digital” y “auditados”, y rotular como constancia local.

### P0-5. Numeración LOPDP incorrecta e inconsistente

**Evidencia:**
- `PrivacyPolicy.tsx:51-81` rotula los derechos como “Art. 21” a “Art. 26” LOPDP.
- El texto vigente ubica acceso en Art. 13, rectificación en Art. 14, eliminación en Art. 15, oposición en Art. 16, portabilidad en Art. 17 y suspensión en Art. 19. Los Arts. 21-26 no son el catálogo ARCO+.
- `PrivacyPolicy.tsx:306` rotula la baja como “Art. 23 LOPDP”.
- `DeleteAccount.tsx:101` cita “LOPDP (Arts. 15 y 16)” para supresión; el Art. 16 es oposición.
- `DeleteAccount.tsx:160` y `LegalHub.tsx:124` citan correctamente el Art. 15 para eliminación.

**Riesgo:** una autoridad o un consumidor puede detectar que la política cita artículos que no corresponden; resta credibilidad y puede considerarse información defectuosa.

**Acción:** unificar todo a LOPDP Arts. 13-20; eliminación = Art. 15; respuesta = 15 días. Revisar también el Reglamento y las resoluciones de la SPDP.

### P0-6. Medios de pago y reembolsos inexistentes

**Evidencia:**
- `termsData.ts:115` acepta “tarjetas bancarias procesadas con protocolos de seguridad cifrados”.
- `RefundPolicy.tsx:263-266` promete reintegros a tarjetas en 3-5 días; `:271-274` promete “Billetera Rapidy Cash” instantánea; `:255` promete SPI/BCE.
- `db/schema.ts:44` solo define `payment_method` como `cash` y `transfer`.
- No hay tabla, router ni estado de reembolsos; `grep refund|reembolso` en `server/**` solo encuentra comprobantes, no un flujo de devolución.

**Riesgo:** publicidad engañosa y expectativas incumplibles. Si mañana se cobra con tarjeta, además cambia el régimen PCI-DSS y el contrato con la pasarela.

**Acción:** publicar solo efectivo y transferencia; describir el reembolso manual y sus plazos reales. Eliminar “Rapidy Cash” y tarjetas hasta que existan.

### P0-7. Datos de salud en notas sin consentimiento explícito

**Evidencia:** `termsData.ts:136-138` instruye al usuario a registrar “celiaquía o intolerancias alimentarias en las notas del pedido”. `orders.notes` es texto libre (`db/schema.ts:197`) y se comparte con el comercio. La LOPDP trata los datos de salud como sensibles (Art. 26) y exige una base reforzada/consentimiento explícito.

**Riesgo:** si la UI habilita notas (hoy el checkout no las envía: `Cart.tsx:181-188`), se recopilan datos sensibles sin aviso ni consentimiento específico. Si no se habilitan, el Término pide un dato que la app no recoge: contradicción menor, pero igual debe corregirse.

**Acción:** decidir si se recopilan alergias. Si sí: checkbox explícito, finalidad, acceso restringido, retención corta y aviso de que el comercio los verá. Si no: eliminar la instrucción del Término.

---

## 5. Hallazgos P1

### P1-1. Identidad del responsable contradictoria y sin datos societarios

- `TermsAndConditions.tsx:312`: “Rapidy Technologies Ecuador S.A.S. • RUC Ecuatoriano en trámite”.
- `PrivacyPolicy.tsx:117` y `:412`: “Rapidy Delivery Ecuador S.A.S.”.
- `PrivacyPolicy.tsx:439`: “Rapidy Ecuador S.A.S.”.
- `LegalHub.tsx` no identifica razón social, RUC, domicilio ni representante.

**Riesgo:** no se sabe quién es el responsable del tratamiento ni quién responde contractualmente. “RUC en trámite” es especialmente delicado: un proveedor sin RUC no puede facturar ni identificarse plenamente ante el consumidor. **Acción:** una sola razón social, RUC, domicilio, correo y representante legal en Términos, Privacidad y footer.

### P1-2. Correos de contacto contradictorios

- `PrivacyPolicy.tsx:414,417`: `privacidad@rapidy.app`.
- `DeleteAccount.tsx:474-475`: `privacidad@rapidy.ec`.
- `LegalHub.tsx:274,286`: `soporte@rapidy.app`.

**Riesgo:** el titular puede enviar su solicitud ARCO a un buzón que no existe o que nadie monitorea. **Acción:** un solo buzón oficial, con alias y SLA; verificar recepción y respuesta.

### P1-3. Consentimiento pasivo y sin evidencia

- `Register.tsx:373-383`: “Al continuar aceptas los Términos y la Privacidad”, sin checkbox, sin versión, sin fecha y sin registro.
- No hay aceptación de términos en el checkout (`Cart.tsx:181-188` no envía versión ni aceptación).
- `termsData.ts:235` afirma que pulsar “Realizar Pedido” formaliza el acuerdo, pero no se guarda evidencia de qué versión aceptó el usuario.
- No hay opt-in de marketing ni de push; el token FCM se registra sin aviso específico (`server/customer-router.ts:393-402`).

**Riesgo:** la LOPDP exige consentimiento informado, previo, expreso e inequívoco cuando esa es la base; la carga de la prueba recae en el responsable. **Acción:** checkbox no premarcado en registro y checkout, versión/fecha/hash del documento, registro en BD y opt-in separado para marketing.

### P1-4. La Política de Privacidad omite categorías y finalidades

Faltan, como mínimo:
- Dirección de entrega y direcciones guardadas (`customers.address`, `orders.deliveryAddress`).
- Teléfono copiado en cada pedido (`orders.customerPhone`).
- Historial de pedidos, notas y comprobantes de transferencia (`orders.notes`, `orders.paymentReceipt`).
- Contenido de chat y nombre del remitente (`chat_messages`).
- IP, user-agent y datos de OTP (`otp_verifications`).
- Tokens FCM (`customers.fcmToken`, `drivers.fcmToken`, `users.fcmToken`).
- Ubicación del repartidor (`drivers.currentLat/currentLng`), no solo la del cliente.
- Datos de comercios y repartidores (la política está redactada solo para consumidores; `PrivacyPolicy.tsx:200-235,252-261`).

**Acción:** reescribir la sección 1 con tabla categoría → finalidad → base legal → destinatario → plazo.

### P1-5. Retención inexistente fuera de la frase fiscal

- `PrivacyPolicy.tsx:378-381` solo dice “mientras mantengas tu cuenta” y “hasta 7 años” para transacciones facturadas.
- No hay plazo para chat, pedidos operativos, OTP, solicitudes de baja, logs IP, comprobantes de transferencia ni `localStorage`.
- No hay job de purga: `otp_verifications` y `account_deletion_requests` solo crecen (`db/schema.ts:303-340`).
- `localStorage` de reclamos y arrepentimiento no expira (`ConsumerProtection.tsx:129`; `RegretButton.tsx:130`).

**Riesgo:** la retención indefinida viola el principio de minimización/limitación (LOPDP Art. 10) y aumenta el impacto de una brecha. **Acción:** aprobar tabla de retención y job de purga; ver §9.

### P1-6. Afirmaciones de seguridad no verificables

- `PrivacyPolicy.tsx:349-351`: TLS 1.3, AES-256 “en servidores certificados ISO 27001”, PCI-DSS y “Rapidy nunca almacena números completos de tarjetas”.
- `server/boot.ts:43` sí envía HSTS; `:44` define CSP.
- No hay evidencia en el repo de certificación ISO 27001 del hosting, de TLS 1.3 forzado ni de PCI-DSS. Además, **no se procesan tarjetas** (`db/schema.ts:44`), por lo que la frase PCI-DSS es inaplicable.

**Riesgo:** afirmaciones de seguridad falsas o exageradas pueden constituir publicidad engañosa y agravan una eventual brecha. **Acción:** describir solo controles verificables (HTTPS/HSTS, cookies HttpOnly, hash de OTP, acceso por rol) y aportar evidencia del proveedor para el resto.

### P1-7. Citas LODC desactualizadas o no reconciliadas

- `LegalHub.tsx:103` afirma que el desistimiento dura “3 días hábiles”. El Art. 45 LODC fue reformado en 2022 (R.O. 1-S, 11-II-2022) y el plazo pasó a **15 días hábiles** desde la recepción, cuando la naturaleza del bien lo permita.
- `RefundPolicy.tsx:303-307` cita “Artículo 46: Devolución de lo Pagado”. La numeración posterior a la reforma debe verificarse: hay fuentes que ubican el Art. 46 como “Promociones y Ofertas” y el procedimiento de devolución en el Art. 45.
- `termsData.ts:205` cita Art. 47 para cancelar; `:208` Art. 45; `:213` Art. 50 para un plazo de 2 horas. Esas citas no están reconciliadas entre sí ni con el texto vigente.
- `termsData.ts:213` y `RefundPolicy.tsx:225-227` imponen 2 horas para reclamar alimentos. Un plazo interno de reporte es válido, pero **no puede extinguir derechos legales** del consumidor; redactarlo como “plazo recomendado para trazabilidad”, no como caducidad.

**Acción:** revisión legal artículo por artículo; actualizar el plazo a 15 días y explicar la excepción de perecederos.

### P1-8. PII en respuestas admin y chat sin minimización

- `server/admin/orders-router.ts:366-376` hace `select().from(customers)` en `orderDetail`, devolviendo todos los campos del cliente, incluidos `fcmToken`, `sessionVersion` y `deletedAt` (ver también `docs/admin/audit/orders.md:77`).
- `chat_messages` guarda `senderName` y `message` sin cifrado de campo ni retención (`db/schema.ts:270-285`); el admin puede leer todo el chat (`server/chat-router.ts:57-77`).
- `docs/LIVE_ARCHITECTURE_LEDGER.md:178` ya reporta exposición de `passwordHash`, `fcmToken` y GPS en `driver.list`/`getById` (debe verificarse si sigue vigente).

**Riesgo:** minimización y confidencialidad; una brecha del panel admin expone PII y tokens de push. **Acción:** proyección explícita, excluir `fcmToken`/`sessionVersion`, limitar chat a participantes y auditar accesos.

### P1-9. Falta aviso para repartidores y comercios

La Política de Privacidad solo describe al consumidor. Los repartidores tienen GPS, teléfono, vehículo, placa, contraseña y ganancias; los comercios tienen RUC, email, dirección y datos de contacto. No hay enlace legal en sus logins ni en sus perfiles. **Acción:** añadir sección “Repartidores y comercios” y enlaces en `src/pages/Login.tsx`, `DriverProfile`, `CommerceProfile` y `Admin` (sin editar aquí; otro frente).

### P1-10. Menores y edad

`termsData.ts:83` exige 18 años, pero no hay verificación de edad; la Política de Privacidad no trata menores. La LOPDP tiene régimen reforzado para niñas, niños y adolescentes (Arts. 23-24). **Acción:** age gate o declaración jurada, política de menores y procedimiento de borrado.

### P1-11. DPO genérico sin designación formal

`PrivacyPolicy.tsx:408-420` ofrece un “Oficial de Protección de Datos” genérico, sin nombre, dirección ni inscripción. La SPDP exige designar e inscribir al DPD cuando corresponda (Resolución SPDP-SPD-2025-0028-R, plazo de 15 días desde el nombramiento). **Acción:** designar, inscribir y publicar datos de contacto; o documentar por qué no aplica.

### P1-12. Enlaces y versionado

No hay changelog, fecha de entrada en vigor en Términos (solo “Versión Oficial 2026”, `TermsAndConditions.tsx:85`) ni hash de versión. La Privacidad dice “Vigente desde Noviembre 2026” (`PrivacyPolicy.tsx:117`). **Acción:** versión `YYYY.MM.DD`, changelog y archivo de versiones anteriores.

---

## 6. Mapa de datos personales

| Categoría | Dónde se recoge/almacena | Finalidad | Base legal | Destinatarios/encargados | Retención actual | Brecha |
|---|---|---|---|---|---|---|
| Nombre, teléfono, email | `customers.firstName/lastName/phone` (`db/schema.ts:74-86`); OTP | Cuenta, login, entrega | Contrato | Comercio, driver, admin, NeuroChat | Indefinida hasta baja | Sin aviso claro ni borrado real |
| Dirección | `customers.address`, `orders.deliveryAddress` | Entrega | Contrato | Driver, comercio, admin | Indefinida | No se anonimiza en pedidos |
| GPS cliente | `Cart.tsx:109-117`, `Profile.tsx:97-104`; dirección guardada | Tarifa, entrega | Contrato/consentimiento | OSM/Nominatim (geocode) | Indefinida | Falta mención de geocodificación |
| GPS driver | `DriverHome.tsx:102-117`, `DriverOrder.tsx:100-115`; `drivers.currentLat/Lng` | Despacho, seguimiento | Contrato | Admin, cliente | Indefinida | Política solo habla del cliente |
| Pedidos | `orders` (`db/schema.ts:182-215`) | Ejecución, historial, disputas | Contrato/legal | Comercio, driver, admin | Indefinida | Sin retención ni anonimización |
| Notas de pedido | `orders.notes` | Instrucciones, alergias | Contrato; salud = sensible | Comercio, driver | Indefinida | Sin consentimiento explícito |
| Comprobante de transferencia | `orders.paymentReceipt` (hasta 7.5 MB) | Verificar pago | Contrato | Admin | Indefinida | Contiene datos bancarios; no se menciona |
| Chat | `chat_messages` (`db/schema.ts:270-285`) | Coordinar entrega, soporte | Contrato | Participantes, admin | Indefinida | Sin aviso, moderación ni retención |
| OTP | `otp_verifications` (`db/schema.ts:303-321`) | Autenticación | Seguridad | NeuroChat | Indefinida | Sin purga |
| IP | `otp_verifications.ip`, `account_deletion_requests.ip` | Antifraude/seguridad | Interés legítimo/seguridad | Neon | Indefinida | Sin plazo ni aviso |
| FCM token | `customers.fcmToken`, `drivers.fcmToken`, `users.fcmToken` | Push | Consentimiento/interés | Google Firebase | Hasta logout/baja | Sin opt-in explícito |
| Sesión/localStorage | `useCustomerSession.tsx:58-134`; `useCart.tsx:45-69`; `Chat.tsx:81-89` | Sesión, carrito, borrador | Contrato | Dispositivo | Hasta limpiar | PII en texto plano; sin aviso |
| Reclamos | `ConsumerProtection.tsx:119-129` | Reclamo | Legal | Solo dispositivo | Indefinida | No llega al backend |
| Arrepentimiento | `RegretButton.tsx:115-130` | Desistimiento | Legal | Solo dispositivo | Indefinida | Cédula en texto plano |
| Solicitud de baja | `account_deletion_requests` (`db/schema.ts:326-340`) | Atender supresión | Legal | Admin (no implementado) | Indefinida | No se procesa |
| Datos de comercio/driver | `users`, `drivers`, `commerces` | Operación, pagos | Contrato | Admin | Indefinida | Sin aviso específico |

---

## 7. Encargados y transferencias internacionales

La Política de Privacidad solo menciona al comercio y al repartidor (`PrivacyPolicy.tsx:246-263`). **No menciona encargados técnicos, países, garantías ni cláusulas contractuales.** La LOPDP exige informar destinatarios y transferencias (Art. 12) y regularlas (Arts. 55-61; normativa SPDP de transferencias).

| Proveedor | Uso | Evidencia | Transferencia/riesgo | Acción |
|---|---|---|---|---|
| Neon (PostgreSQL) | Base de datos principal | `docs/LIVE_ARCHITECTURE_LEDGER.md:27`; `DATABASE_URL` en `.env.example:8` | Región no documentada; probable EE. UU. | DPA, región, cifrado, cláusulas modelo/registro de transferencia |
| NeuroChat | OTP por WhatsApp | `.env.example:18-25`; `db/schema.ts:303-321` | Ecuador (verificar subencargados) | DPA, confidencialidad, retención del proveedor |
| Firebase/FCM | Push y token de dispositivo | `android/app/google-services.json:5`; `fcmToken` en schema | Google LLC (EE. UU.) | DPA/SCC, aviso de push, borrado de token |
| OpenStreetMap/Nominatim | Tiles y geocodificación inversa | `OrderTrackingMap.tsx:149-151`; `DriverOrder.tsx:128,220-222`; `src/lib/locationUtils.ts` | IP y coordenadas a OSM (Reino Unido/UE) | Aviso, atribución, política de uso, no enviar más coordenadas de las necesarias |
| Google Fonts | Tipografía | `index.html:15-17` | IP a Google | Autohospedar o divulgar |
| Unsplash/Picsum | Imágenes | `server/boot.ts:44` (CSP) | IP a terceros | Divulgar o eliminar si no se usan |
| Supabase | Permitido en CSP | `server/boot.ts:44` | Potencial encargado no documentado | Confirmar uso; si no se usa, retirar del CSP |
| Hosting/proxy | Servidor y logs | No documentado en el repo | País/región desconocidos | DPA y política de logs |

**Requisitos mínimos:** contrato de encargo con finalidad, instrucciones, confidencialidad, seguridad, subencargados, notificación de brechas en máximo 2 días, devolución/borrado y auditoría. Para transferencias: país adecuado, garantías (cláusulas contractuales autorizadas) o consentimiento explícito informado; registrar la transferencia.

---

## 8. Consentimiento, cookies y PWA

### 8.1 Consentimiento

| Momento | Estado actual | Qué falta |
|---|---|---|
| Registro cliente | Aviso pasivo (`Register.tsx:373-383`) | Checkbox no premarcado, versión, fecha, log en BD |
| Checkout | No hay aceptación ni versión (`Cart.tsx:181-188`) | Aceptación de Términos/Privacidad y registro |
| Marketing/push | Sin opt-in específico; token FCM se guarda | Consentimiento separado y opt-out |
| Datos sensibles (alergias) | Sin aviso; además el checkout no envía notas | Consentimiento explícito o eliminar la instrucción |
| Reclamo/arrepentimiento | Sin aviso de privacidad ni checkbox | Aviso + consentimiento para tratar cédula/teléfono |
| Menores | Solo declaración de 18+ | Verificación/age gate |

### 8.2 Cookies y almacenamiento local

- Cookies de sesión: `quickgo_token`, `refresh_token`, `quickgo_driver_token`, `quickgo_merchant_token`, `quickgo_admin_token`, HttpOnly y SameSite (`server/context.ts:46-164`; `server/admin-auth.ts:114-125`). Son estrictamente necesarias.
- `localStorage`: sesión de cliente, carrito, borrador de chat, reclamos, arrepentimiento y `pwa_dismissed` (`useCustomerSession.tsx:58-134`; `useCart.tsx:45-69`; `Chat.tsx:81-89`; `ConsumerProtection.tsx:119-129`; `RegretButton.tsx:115-130`).
- No se encontraron analytics, píxeles ni cookies de terceros (`grep analytics|gtag|sentry|posthog|clarity|mixpanel|segment` = 0 en `src`/`index.html`).
- No hay banner de cookies. Con solo cookies esenciales no es obligatorio un banner de consentimiento, pero **sí** es obligatorio informar cookies/localStorage y su finalidad. Si se añade analítica, se necesita CMP con rechazo equivalente.

### 8.3 PWA

- `manifest.json` y `manifest-partners.json` no incluyen enlaces legales; añadir `shortcuts` a Privacidad y Eliminar cuenta es opcional.
- El service worker no cachea PII (correcto).
- La URL de eliminación debe ser pública, sin login y sin instalar la app; hoy la SPA depende de JS. Para Google Play, publicar una página estática de respaldo o garantizar el render.

---

## 9. Borrado de cuenta: flujo actual y flujo objetivo

### 9.1 Flujo actual

```text
Formulario /eliminar-cuenta
  -> customer.requestDeletion (público, sin OTP)
  -> INSERT account_deletion_requests
  -> devuelve ticket + "48 horas hábiles"
  -> nadie lo procesa
  -> los datos siguen en customers/orders/chat/otp
```

El borrado autenticado `customer.deleteAccount` (`customer-router.ts:411-431`) no está expuesto en la UI y, aunque se usara, solo anonimiza la fila `customers`.

### 9.2 Flujo objetivo

1. **Verificar identidad:** OTP al teléfono registrado o sesión autenticada; si no, verificación documental.
2. **Registrar la solicitud** con ticket, canal, fecha, base legal y estado; notificar por WhatsApp/email.
3. **Congelar la cuenta** (soft delete, revocar sesiones y FCM) para evitar nuevos tratamientos.
4. **Aplicar matriz de borrado** por tabla:
   - `customers`: anonimizar nombre, teléfono, dirección, tokens, sesión.
   - `orders`: anonimizar `deliveryAddress`, `customerPhone`, `notes`, `paymentReceipt`; conservar solo importes/fechas e IVA si hay factura.
   - `chat_messages`: borrar o anonimizar `senderName`/`message`; conservar metadatos mínimos si hay disputa.
   - `otp_verifications`: borrar.
   - `account_deletion_requests`: conservar solo evidencia mínima y purgar tras el plazo.
   - `localStorage`: no puede borrarse remotamente; documentar que el usuario debe limpiar el navegador y evitar prometer borrado total.
5. **Borrar en encargados:** Neon (incluidos backups según rotación), FCM, NeuroChat, OSM no almacena (pero verificar logs).
6. **Confirmar al titular** dentro de 15 días, con detalle de lo conservado y por qué.
7. **Registrar evidencia** de la ejecución (quién, cuándo, qué tablas, qué excepciones).

### 9.3 Excepciones que deben documentarse

- Facturación y tributación: solo datos fiscales, 7 años (Código Tributario), no todo el pedido.
- Reclamos, fraudes o seguridad: retención mínima mientras dure la investigación.
- Obligaciones legales de conservación: identificar norma y plazo.
- Backups: indicar que la supresión se replica en la siguiente rotación.

---

## 10. Retención propuesta (sujeta a revisión legal)

| Dato | Retención propuesta | Base/observación |
|---|---|---|
| Cuenta activa | Mientras haya relación + 30 días de gracia | Contrato |
| Pedidos operativos | 24 meses desde la entrega | Garantía/disputas; luego anonimizar |
| Facturación/impuestos | 7 años | Código Tributario; solo datos fiscales |
| Chat | 90 días tras cierre del pedido; 12 meses si hay disputa | Minimización; hoy indefinido |
| OTP | 24 horas el código; 90 días el registro de auditoría | Seguridad |
| Solicitudes de baja | 1 año (o 3 años si se usa como evidencia) | LOPDP/defensa |
| Reclamos | 2 años desde la resolución | LODC/defensa |
| Logs/IP | 90 días salvo incidente | Seguridad |
| FCM | Hasta logout/inactividad 90 días | Push |
| `localStorage` de reclamos/arrepentimiento | Migrar a servidor; máximo 30 días local | Evitar PII persistente |
| Backups | Rotación definida; documentar | Borrado diferido |

---

## 11. Obligaciones LOPDP/Ecuador que deben quedar cubiertas

### 11.1 LOPDP

- [ ] Inventario/registro de actividades de tratamiento (RAT) con finalidades, bases, destinatarios y plazos.
- [ ] Base legal por finalidad (Arts. 7-8): contrato, consentimiento, obligación legal, interés legítimo/seguridad.
- [ ] Aviso de privacidad completo (Art. 12): identidad y contacto del responsable, DPD, finalidades, categorías, destinatarios, transferencias, plazos, derechos, consecuencias de no entregar datos y medidas de seguridad.
- [ ] Procedimiento ARCO+ gratuito, con verificación de identidad y respuesta en 15 días (Arts. 13-20); registro de solicitudes y respuestas.
- [ ] Designación e inscripción del DPD ante la SPDP cuando corresponda (Resolución SPDP-SPD-2025-0028-R).
- [ ] Evaluación de impacto (Art. 42) para GPS/chat/datos sensibles/decisiones automatizadas.
- [ ] Seguridad (Art. 37) y notificación de brechas: SPDP/ARCOTEL en máximo 5 días; titulares en máximo 3 días (Arts. 43 y 46).
- [ ] Contratos de encargo y transferencias internacionales (Arts. 55-61; normativa SPDP de transferencias).
- [ ] Datos sensibles (Art. 26) y menores (Arts. 23-24).
- [ ] Consentimiento y opt-out de marketing/push.
- [ ] Registro de versiones y cambios de la política.

### 11.2 Consumo y comercio electrónico (Ecuador)

- [ ] LODC Art. 4 (derechos), Art. 15 (precio/IVA), Art. 45 (devolución, 15 días tras reforma 2022), Art. 46 (verificar numeración), Art. 47/50 (verificar), Art. 71 (reparación/reposición).
- [ ] Ley 2002-67 (comercio electrónico, firmas y mensajes de datos): consentimiento, integridad, conservación y valor probatorio.
- [ ] ARCSA: solo comercios con permiso; no venta de medicamentos controlados.
- [ ] SRI: facturación electrónica y retención fiscal.
- [ ] Defensoría del Pueblo/MPCEIP: canales y competencia; no atribuir a la DPE funciones que no tiene.
- [ ] Google Play Data Safety: declaración coherente con la política y URL de eliminación pública.

---

## 12. Textos faltantes por documento

### 12.1 Política de Privacidad (`src/pages/PrivacyPolicy.tsx`)

1. Identidad completa del responsable: razón social, RUC, domicilio, representante y email.
2. DPD: nombre, dirección, teléfono, email e inscripción.
3. Bases legales por finalidad.
4. Categorías completas: dirección, pedidos, notas, chat, comprobantes, IP, FCM, GPS del driver, datos de comercios/repartidores.
5. Encargados y transferencias internacionales con países y garantías.
6. Retención por categoría.
7. Cookies, `localStorage` y PWA.
8. Derechos ARCO+ con artículos correctos, procedimiento y plazo de 15 días; autoridad de control.
9. Menores.
10. Datos sensibles (salud en notas) y consentimiento explícito.
11. Seguridad verificable (sin ISO/PCI si no hay evidencia).
12. Notificación de brechas.
13. Cambios/versionado.
14. Enlaces a Términos, Reembolsos, Arrepentimiento y Defensa del Consumidor.

### 12.2 Términos y Condiciones (`termsData.ts`, `TermsAndConditions.tsx`)

1. Identificación del proveedor (razón social, RUC, domicilio, representante).
2. Fecha, versión, changelog y mecanismo de aceptación con evidencia.
3. Incorporación expresa de la Política de Privacidad.
4. Medios de pago reales (efectivo/transferencia) y tratamiento de comprobantes.
5. Cancelación/devolución conforme al Art. 45 vigente (15 días) y excepciones por perecederos.
6. Rol de comercios/repartidores y deslinde laboral revisado por abogado (hoy `termsData.ts:161` afirma “sin relación de dependencia”).
7. Responsabilidad, indemnidad, fuerza mayor, modificaciones y notificaciones.
8. Conservación de derechos del consumidor; prohibición de renuncias.
9. Conducta en chat, contenido prohibido y moderación.
10. Ley aplicable, mediación y jurisdicción (hoy `termsData.ts:270-279`).
11. Enlaces legales en el cuerpo, no solo al final.

### 12.3 Reembolsos (`RefundPolicy.tsx`)

1. Medios reales (efectivo/transferencia), quién reembolsa (Rapidy o comercio) y plazos.
2. Tratamiento de comisión, delivery fee, propinas e impuestos.
3. Citas correctas LODC Art. 45/46 y plazo vigente.
4. Proceso, evidencia (fotos) y retención de esa evidencia.
5. Casos de force majeure y demora.
6. Enlaces a Términos, Privacidad y Defensa del Consumidor.

### 12.4 Arrepentimiento (`RegretButton.tsx`)

1. Plazo legal de 15 días hábiles (Art. 45 reformado) y excepción por naturaleza del bien.
2. Ticket persistido en servidor, no `setTimeout`/`localStorage`.
3. Confirmación por canal y plazo de respuesta.
4. Reembolso y medio.
5. Aviso de privacidad y consentimiento para cédula/teléfono.

### 12.5 Defensa del Consumidor (`ConsumerProtection.tsx`)

1. Aviso de privacidad y consentimiento para nombre/cédula/teléfono/email.
2. Persistencia real del reclamo y ticket verificable.
3. Plazo de 5 días hábiles realista y responsable.
4. Enlaces a Términos/Privacidad/Reembolsos.
5. Distinción entre reclamo interno y denuncia ante autoridad.

### 12.6 Eliminación de cuenta (`DeleteAccount.tsx`)

1. Verificación de identidad.
2. Matriz de datos borrados/conservados.
3. Plazo legal de 15 días (puede prometerse 48 h solo si se cumple).
4. Borrado en encargados y backups.
5. Confirmación y evidencia.
6. Enlaces a Privacidad/Términos.
7. No prometer borrado de chat si no se borra.

---

## 13. Contradicciones textuales (archivo:línea)

| # | Texto A | Texto B | Riesgo | Resolución |
|---|---|---|---|---|
| 1 | `TermsAndConditions.tsx:312`: “Rapidy Technologies Ecuador S.A.S. • RUC en trámite” | `PrivacyPolicy.tsx:117,412`: “Rapidy Delivery Ecuador S.A.S.”; `:439`: “Rapidy Ecuador S.A.S.” | No se identifica al responsable | Unificar razón social/RUC/domicilio |
| 2 | `PrivacyPolicy.tsx:414`: `privacidad@rapidy.app` | `DeleteAccount.tsx:474`: `privacidad@rapidy.ec` | Solicitudes ARCO perdidas | Un solo buzón verificado |
| 3 | `PrivacyPolicy.tsx:54-81`: derechos “Arts. 21-26” | LOPDP: derechos Arts. 13-20; eliminación Art. 15 | Información jurídica incorrecta | Corregir numeración |
| 4 | `PrivacyPolicy.tsx:306`: baja “Art. 23 LOPDP” | `DeleteAccount.tsx:160`: “Art. 15 LOPDP” | Inconsistencia | Usar Art. 15 |
| 5 | `DeleteAccount.tsx:190`: datos borrados en 48 h | `customer-router.ts:464-485`: solo inserta ticket | Promesa falsa | Implementar o cambiar texto |
| 6 | `DeleteAccount.tsx:421-423`: borra historial/chat | `customer-router.ts:411-431`: solo anonimiza `customers`; `orders`/`chat` intactos | Borrado incompleto | Matriz de borrado |
| 7 | `LegalHub.tsx:103`: desistimiento 3 días hábiles | LODC Art. 45 reformado: 15 días hábiles | Cita desactualizada | Actualizar |
| 8 | `RefundPolicy.tsx:303`: Art. 46 “Devolución de lo pagado” | Numeración vigente a verificar (Art. 45 procedimiento; Art. 46 promociones) | Cita posiblemente errónea | Revisión legal |
| 9 | `termsData.ts:115`: tarjetas | `db/schema.ts:44`: solo cash/transfer | Publicidad engañosa | Eliminar tarjetas o implementarlas |
| 10 | `RefundPolicy.tsx:271-274`: “Rapidy Cash” | No existe wallet en schema/routers | Promesa inexistente | Eliminar |
| 11 | `PrivacyPolicy.tsx:349-351`: ISO 27001/PCI-DSS/AES-256 | Sin evidencia en repo; no hay tarjetas | Afirmaciones no verificables | Aportar evidencia o retirar |
| 12 | `PrivacyPolicy.tsx:216`: GPS solo cliente en uso activo | `DriverHome.tsx:102-117` y `DriverOrder.tsx:100-115` también rastrean driver | Política incompleta | Añadir driver |
| 13 | `ConsumerProtection.tsx:326-328`: reclamo “incorporado formalmente” | `:119-129`: solo `localStorage` | Libro de reclamaciones falso | Persistir en servidor |
| 14 | `RegretButton.tsx:290`: solicitud “radicada formalmente” | `:104-134`: `setTimeout` + `localStorage` | Constancia falsa | Persistir en servidor |
| 15 | `termsData.ts:213` / `RefundPolicy.tsx:225-227`: reclamo en 2 horas | Derechos LODC no caducan por un plazo interno | Posible cláusula abusiva | Redactar como recomendación |
| 16 | `PrivacyPolicy.tsx:420`: “48-72 horas conforme a la LOPDP” | LOPDP: 15 días | Plazo mal etiquetado | Aclarar SLA interno vs legal |
| 17 | `LegalHub.tsx:274`: `soporte@rapidy.app` | `PrivacyPolicy.tsx:414`: `privacidad@rapidy.app` | Canales confusos | Unificar |

---

## 14. Checklist para revisión legal humana

### Bloqueantes de lanzamiento

- [ ] **Entidad y RUC:** confirmar razón social, RUC, domicilio, representante y capacidad para contratar; actualizar Términos, Privacidad y footer.
- [ ] **Contacto:** unificar `privacidad@` y `soporte@`; verificar recepción, alias y SLA.
- [ ] **LOPDP:** validar Arts. 13-20, plazo de 15 días, base legal por finalidad y texto del aviso.
- [ ] **LODC:** validar Arts. 4, 15, 45 (15 días), 46, 47, 50 y 71 contra el texto vigente; corregir “3 días” y “Art. 46”.
- [ ] **Pagos:** decidir si se aceptan tarjetas/wallet; alinear Términos, Reembolsos y schema. Si no, eliminar promesas.
- [ ] **Borrado:** aprobar matriz de datos, verificación de identidad, plazo, excepciones, backups y confirmación.
- [ ] **Reclamos/arrepentimiento:** aprobar persistencia server-side, ticket, SLA y aviso de privacidad; eliminar simulaciones.
- [ ] **Datos sensibles:** decidir si se recogen alergias; si sí, consentimiento explícito y acceso restringido; si no, retirar la instrucción.
- [ ] **Encargados:** firmar DPA con Neon, NeuroChat, Firebase, OSM/hosting; documentar subencargados y transferencias (Arts. 55-61).
- [ ] **Seguridad:** validar TLS 1.3, cifrado en reposo, ISO 27001 y PCI-DSS; retirar lo no demostrable.
- [ ] **Brechas:** definir procedimiento SPDP/ARCOTEL 5 días y titulares 3 días (Arts. 43 y 46).
- [ ] **DPD:** designar e inscribir si aplica; publicar datos.
- [ ] **Menores:** age gate/declaración y política de menores (Arts. 23-24).
- [ ] **Google Play:** Data Safety coherente y URL de eliminación pública sin login.
- [ ] **Consentimiento:** checkbox no premarcado en registro/checkout, versión/fecha/hash y log en BD; opt-in de marketing/push.
- [ ] **Retención:** aprobar tabla §10 y job de purga.
- [ ] **Chat:** política de contenido, moderación, acceso y retención.
- [ ] **Repartidores/comercios:** aviso y aceptación específicos; enlaces en sus logins/perfiles.
- [ ] **Versionado:** fecha, changelog y archivo de versiones; evitar “RUC en trámite” al publicar.

### Verificación técnica posterior (sin editar este frente)

- [ ] `rg -n "requestDeletion|accountDeletionRequests" server src` debe mostrar una cola admin y una ejecución real, no solo el insert.
- [ ] `rg -n "customer.deleteAccount" server src` debe mostrar uso en UI o eliminarse.
- [ ] `rg -n "localStorage" src/pages/legal src/pages/PrivacyPolicy.tsx` no debe encontrar PII de reclamos/arrepentimiento.
- [ ] `rg -n "fcmToken|paymentReceipt|deliveryAddress|customerPhone" server/admin db/schema.ts` debe revisarse para minimización.
- [ ] `rg -n "Art\\. 2[1-6] LOPDP|Art\\. 23 LOPDP|3 días hábiles|Rapidy Cash|tarjetas" src/pages/legal src/pages/PrivacyPolicy.tsx` no debe devolver citas incorrectas.
- [ ] Probar `/eliminar-cuenta`, `/politica-de-privacidad`, `/terminos-y-condiciones`, `/politica-de-reembolso`, `/boton-de-arrepentimiento` y `/defensa-del-consumidor` en incógnito, sin sesión y con JS deshabilitado (verificar fallback).
- [ ] Verificar que la URL de eliminación sea accesible desde Google Play y que el ticket se pueda consultar.
- [ ] Revisar que ningún texto prometa un plazo o canal que no exista en backend.

---

## 15. Resumen de archivos y responsabilidad

| Archivo | Cambio requerido | ¿Se editó? |
|---|---|---|
| `docs/production/LEGAL.md` | Este informe | Sí (único archivo creado) |
| `src/pages/legal/*.tsx`, `termsData.ts` | Textos y enlaces | No |
| `src/pages/PrivacyPolicy.tsx` | Texto, artículos, encargados, retención | No |
| `server/customer-router.ts` | Cola de baja, verificación, borrado real | No |
| `db/schema.ts` | Retención/anonimización, índices | No |
| `src/pages/customer/Register.tsx`, `Cart.tsx` | Consentimiento y evidencia | No |
| `src/pages/Login.tsx`, driver/commerce/admin | Enlaces legales y avisos | No |
| `public/manifest*.json` | Shortcuts legales (opcional) | No |

**Conclusión:** no publicar hasta cerrar P0-1 a P0-7 y obtener firma legal. La prioridad inmediata es dejar de afirmar que se borran datos y que se radican reclamos cuando el backend no lo hace.