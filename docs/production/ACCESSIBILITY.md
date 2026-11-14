# Accesibilidad y responsive — Admin y Driver

**Frente 14 · smoke Playwright + auditoría WCAG 2.1 AA**
Fecha de medición: 2026-11-13 · Entorno: `http://localhost:3000` (dev, sin reinicio)
Alcance: 6 rutas Admin + 6 rutas Driver, en viewport móvil `390x844` y escritorio `1280x900`.
Archivos tocados: `scripts/a11y-smoke.mjs` (nuevo) y este informe. **No se editó ninguna página.**

> Las líneas de código citadas corresponden a la medición de esta fecha. Si otro frente
> modifica las páginas, los números pueden desplazarse; se incluye el selector/texto para
> localizarlas igualmente.

---

## 1. Cómo ejecutar el smoke

```powershell
# Credenciales desde .env (nunca hardcodear en el script)
$env:ADMIN_EMAIL = "..."       # obligatorio
$env:ADMIN_PASSWORD = "..."    # obligatorio
$env:E2E_DRIVER_PHONE = "0991234567"      # default del repo
$env:E2E_DRIVER_PASSWORD = "moto123"      # default del repo
$env:E2E_DRIVER_ORDER_ID = "5"            # pedido asignado al driver
$env:E2E_DRIVER_CHAT_ORDER_ID = "5"       # pedido para /driver/chat/:id

node scripts/a11y-smoke.mjs
```

- No reinicia `localhost:3000`, no ejecuta migraciones y no escribe en base de datos.
- El script solo inicia sesión (cookie), navega y audita el DOM. Sale con código `1`
  mientras existan hallazgos; hoy el resultado esperado es **149/194 PASS (45 FAIL)**.
- Los widgets de TanStack Query Devtools (solo dev) y los marcadores Leaflet se
  excluyen del chequeo general; los marcadores se auditan en un chequeo propio.
- Para usar otro pedido: `E2E_DRIVER_ORDER_ID=<id>` (debe pertenecer al driver de prueba).

### Checks automáticos por ruta y viewport

1. `h1` visible **o** landmark `<main>`/`role="main"`.
2. Todos los botones visibles con nombre accesible (texto, `aria-label`,
   `aria-labelledby`, `alt`, `title` como último recurso).
3. `input`/`textarea`/`select` visibles con label programático (`label for`,
   `aria-label`, `aria-labelledby` o label envolvente). El `placeholder` no cuenta.
4. Sin overflow horizontal (`scrollWidth <= innerWidth + 1`).
5. Acciones (botones y `role="button"`) con caja >= `40x40 px`.
6. Foco visible: `:focus-visible` + cambio real de `outline`, `box-shadow`,
   borde, fondo o decoración al enfocar.
7. Recorrido con `Tab`: el foco avanza y no queda atrapado.
8. Extra en `/driver/order/:id`: marcadores del mapa con nombre y tamaño.

---

## 2. Resultado ejecutivo

**194 chequeos = 12 rutas × 2 viewports × 8 checks (+ mapa), 149 PASS / 45 FAIL.**
No hubo overflow horizontal en ninguna ruta/viewport. Todas las rutas tienen `h1`
visible una vez cargadas y todas tienen foco visible y recorrido con `Tab` correcto
(según la medición automática). Los fallos se concentran en:

- nombres accesibles de botones icon-only (back, cerrar modal),
- labels de inputs (Settings, búsquedas, edición de perfil y modales),
- tamaño de acciones (tabs, filtros, iconos, nav inferior, theme toggle),
- marcadores del mapa (12x12 y sin nombre en el marcador del driver).

| #   | Ruta               | h1/landmark | Botones  |  Labels  | Overflow | Targets  | Foco | Tab | Veredicto             |
| --- | ------------------ | :---------: | :------: | :------: | :------: | :------: | :--: | :-: | --------------------- |
| 1   | `/admin`           |     OK      |    OK    |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 2 fallos              |
| 2   | `/admin/commerces` |     OK      | **FAIL** | **FAIL** |    OK    | **FAIL** |  OK  | OK  | 6 fallos              |
| 3   | `/admin/drivers`   |     OK      | **FAIL** | **FAIL** |    OK    | **FAIL** |  OK  | OK  | 6 fallos              |
| 4   | `/admin/orders`    |     OK      | **FAIL** | **FAIL** |    OK    | **FAIL** |  OK  | OK  | 6 fallos              |
| 5   | `/admin/products`  |     OK      | **FAIL** |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 3 fallos              |
| 6   | `/admin/settings`  |     OK      | **FAIL** | **FAIL** |    OK    | **FAIL** |  OK  | OK  | 6 fallos              |
| 7   | `/driver`          |     OK      |    OK    |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 2 fallos              |
| 8   | `/driver/order/5`  |     OK      | **FAIL** |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 6 fallos (incl. mapa) |
| 9   | `/driver/earnings` |     OK      | **FAIL** |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 4 fallos              |
| 10  | `/driver/profile`  |     OK      | **FAIL** |  OK (0)  |    OK    |    OK    |  OK  | OK  | 2 fallos              |
| 11  | `/driver/history`  |     OK      |    OK    |  OK (0)  |    OK    | **FAIL** |  OK  | OK  | 2 fallos              |
| 12  | `/driver/chat/5`   |     OK      |    OK    |  OK (1)  |    OK    |    OK    |  OK  | OK  | **sin hallazgos**     |

Lectura: los fallos por ruta son la suma de móvil + escritorio; hay checks que pasan
en un viewport y fallan en el otro (p. ej. tabs de Admin a 32px solo en escritorio).

---

## 3. Hallazgos por ruta (archivo:línea + corrección)

### 3.1 `/admin` — 2 fallos (móvil y escritorio)

| Hallazgo                                              | Archivo:línea                                                                                         | Corrección concreta                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Theme toggle de 32x32 en escritorio                   | `src/components/AdminLayout.tsx:87` y `:112` (`<ThemeToggle size="sm" />`)                            | Usar `size="lg"` (44x44) o añadir `!w-11 !h-11`; el mínimo de producto es 40, recomendado 44.                       |
| Botón “Recargar” 36x44 en móvil / 97x36 en escritorio | `src/pages/admin/Dashboard.tsx:137-146` (`lg:min-h-[36px]`)                                           | Quitar `lg:min-h-[36px]`, añadir `min-h-11 min-w-11`.                                                               |
| Botón “Salir” 32x44 en móvil / 65x36 en escritorio    | `src/pages/admin/Dashboard.tsx:147-155`                                                               | Añadir `min-h-11 min-w-11` y `aria-label="Cerrar sesión"` si el texto se oculta.                                    |
| Tabs de periodo 43x32 (desktop) y 37x44 (móvil)       | `src/pages/admin/Dashboard.tsx:531-543` (`min-h-[44px] lg:min-h-[32px]`, `px-2.5`)                    | `min-h-11 min-w-11`; eliminar `lg:min-h-[32px]`. Se repiten 3 veces (`:221`, `:249`, `:277`).                       |
| Contraste de CTA naranja                              | `src/pages/admin/Dashboard.tsx:141`/`:150` y tokens `src/index.css:41-43` (claro) / `:77-79` (oscuro) | Ver §5.3: blanco sobre `#FF6A00` = 2.87:1. Usar texto oscuro o un naranja más oscuro para botones con texto blanco. |

### 3.2 `/admin/commerces` — 6 fallos

| Hallazgo                                        | Archivo:línea                                                                                 | Corrección concreta                                                                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back icon-only sin nombre accesible             | `src/pages/admin/Commerces.tsx:249-251`                                                       | `<button aria-label="Volver al panel">` (o `<span className="sr-only">Volver</span>`).                                                                                                                                                            |
| Buscador solo con placeholder                   | `src/pages/admin/Commerces.tsx:284-290`                                                       | `<label htmlFor="commerce-search" className="sr-only">Buscar comercio</label>` + `id="commerce-search"`. `aria-label` también sirve.                                                                                                              |
| “Nuevo” 78x28 en móvil                          | `src/pages/admin/Commerces.tsx:254-257` (`px-3 py-1.5`)                                       | Añadir `min-h-11` (44px) o `py-2.5`; conservar el ancho.                                                                                                                                                                                          |
| Acciones de fila 28x28 / 45x32                  | `src/pages/admin/Commerces.tsx:343-352` (`p-1.5`)                                             | Añadir `touch-target` o `min-h-11 min-w-11` a las tres acciones; los iconos de estado/eliminar usan `title` como única etiqueta (ver aviso §5.6).                                                                                                 |
| Modal “Nuevo comercio” sin semántica de diálogo | `src/pages/admin/Commerces.tsx:445-455`                                                       | Usar `@radix-ui/react-dialog` (ya está en dependencias) o añadir `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, foco inicial, trampa de foco, Escape y retorno de foco. El botón X (`:450-455`) no tiene nombre: `aria-label="Cerrar"`. |
| Labels de formulario no asociados (modal)       | `src/pages/admin/Commerces.tsx:465-466`, `:475-476`, `:486-487`, `:498-499`, `:682-683`, etc. | Cada `<label>` debe tener `htmlFor` y el input un `id`; patrón repetido en todos los campos.                                                                                                                                                      |
| Modal eliminar / editar                         | `src/pages/admin/Commerces.tsx:537`, `:543-548`, `:604`, `:609-614`                           | Mismo tratamiento de diálogo y `aria-label="Cerrar"` en la X.                                                                                                                                                                                     |

### 3.3 `/admin/drivers` — 6 fallos

| Hallazgo                                 | Archivo:línea                                                                                     | Corrección concreta                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Back icon-only sin nombre                | `src/pages/admin/Drivers.tsx:91-93`                                                               | `aria-label="Volver al panel"`.                                                        |
| Buscador solo con placeholder            | `src/pages/admin/Drivers.tsx:128-134`                                                             | Label `sr-only` + `id`, o `aria-label="Buscar repartidor"`.                            |
| “Nuevo” 78x28 en móvil                   | `src/pages/admin/Drivers.tsx:96-99`                                                               | `min-h-11`.                                                                            |
| “Editar” 49x24 y “Eliminar” 28x28        | `src/pages/admin/Drivers.tsx:185-188`                                                             | `min-h-11 min-w-11`; `aria-label={`Eliminar a ${d.name}`}` en el icono de papelera.    |
| Modal repartidor sin diálogo/foco/Escape | `src/pages/admin/Drivers.tsx:271-281`                                                             | Radix Dialog; X con `aria-label="Cerrar"`.                                             |
| Labels del modal no asociados            | `src/pages/admin/Drivers.tsx:293-294`, `:304-306`, `:311-312`, `:325-326`, `:334-335`, `:345-347` | `htmlFor`/`id` por campo; `PhoneInput` necesita `aria-label` o label externo asociado. |

### 3.4 `/admin/orders` — 6 fallos

| Hallazgo                                  | Archivo:línea                                         | Corrección concreta                                                                    |
| ----------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Back icon-only sin nombre                 | `src/pages/admin/Orders.tsx:215-217`                  | `aria-label="Volver al panel"`.                                                        |
| Buscador solo con placeholder             | `src/pages/admin/Orders.tsx:227-233`                  | Label `sr-only` + `id`, o `aria-label="Buscar por ID o cliente"`.                      |
| 12 filtros de estado de 36px              | `src/pages/admin/Orders.tsx:237-250` (`min-h-[36px]`) | `min-h-11` (44) o al menos 40; el contenedor ya tiene scroll horizontal.               |
| “Ver detalles” 36x36 en tabla desktop     | `src/pages/admin/Orders.tsx:315-317` (`w-9 h-9`)      | `min-h-11 min-w-11`; mantener el título como refuerzo, no como único nombre.           |
| Modal de detalles sin diálogo/foco/Escape | `src/pages/admin/Orders.tsx:417-429`                  | Radix Dialog; X con `aria-label="Cerrar"`; foco inicial en el título o primer control. |
| Botones de acción con `title` únicamente  | `src/pages/admin/Orders.tsx:315`, `:381-382`          | Añadir `aria-label="Ver detalles del pedido #<id>"`.                                   |

### 3.5 `/admin/products` — 3 fallos

| Hallazgo                                  | Archivo:línea                                      | Corrección concreta                              |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Back icon-only sin nombre                 | `src/pages/admin/Products.tsx:113-115`             | `aria-label="Volver al panel"`.                  |
| Theme toggle 32x32 en escritorio          | `src/components/AdminLayout.tsx:87`                | `size="lg"` o `!w-11 !h-11`.                     |
| CTA / acciones con contraste insuficiente | `src/pages/admin/Products.tsx:126`, `:136`, `:271` | Ver §5.3: blanco sobre `brand` no alcanza 4.5:1. |

No hay inputs visibles en el estado inicial de esta ruta (0 campos), por eso “Labels” pasa.

### 3.6 `/admin/settings` — 6 fallos

| Hallazgo                         | Archivo:línea                                                                                                                    | Corrección concreta                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Back icon-only sin nombre        | `src/pages/admin/Settings.tsx:194-196`                                                                                           | `aria-label="Volver al panel"`.                                                                                                                                                                                                |
| 7 campos sin label programático  | Labels `:250`, `:259`, `:281`, `:294`, `:320-322`, `:356`, `:365`; inputs `:251`, `:260`, `:282`, `:295`, `:323`, `:357`, `:366` | `htmlFor`/`id` en cada par. Ejemplo: `<label htmlFor="settings-app-name">Nombre de la app</label>` + `<input id="settings-app-name" …>`. Para el textarea, `id="settings-bank-info"` y `<label htmlFor="settings-bank-info">`. |
| Logout del header 36x28 / 113x30 | `src/pages/admin/Settings.tsx:199-206`                                                                                           | `min-h-11 min-w-11`; `aria-label="Cerrar sesión"` (hoy solo `title`).                                                                                                                                                          |
| Logout de la tarjeta 124x32      | `src/pages/admin/Settings.tsx:413-419`                                                                                           | `min-h-11`.                                                                                                                                                                                                                    |
| Theme toggle 32x32               | `src/components/AdminLayout.tsx:87`                                                                                              | `size="lg"` o 44x44.                                                                                                                                                                                                           |
| Contraste de botones naranjas    | `src/pages/admin/Settings.tsx:337` (guardar) y CTA de reportes `:415`                                                            | §5.3. El botón guardar sí tiene un buen `focus-visible:ring` (`:337`), que sirve de referencia para el resto.                                                                                                                  |

### 3.7 `/driver` — 2 fallos

| Hallazgo                                                           | Archivo:línea                                                                            | Corrección concreta                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Nav inferior con anchos 35x44, 37x44 y 23x44                       | `src/pages/driver/DriverHome.tsx:370-387`; `.bottom-nav-item` en `src/index.css:222-227` | Añadir `min-w-11` a cada botón (o `flex-1 min-w-11`); el alto ya es 44. “Ganancias” también debe quedar >=40 de ancho. |
| Texto “Hoy/Entregas/Rating” y CTA sobre naranja con contraste bajo | `src/pages/driver/DriverHome.tsx:194-207`, `:346`                                        | §5.3; usar texto oscuro sobre naranja o superficie más oscura.                                                         |

### 3.8 `/driver/order/5` — 6 fallos + mapa

| Hallazgo                                                  | Archivo:línea                                                                                    | Corrección concreta                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back icon-only sin nombre                                 | `src/pages/driver/DriverOrder.tsx:349-351`                                                       | `aria-label="Volver a pedidos"`.                                                                                                                                                                                                                          |
| Marcadores Leaflet 12x12 y marcador del driver sin nombre | `src/pages/driver/DriverOrder.tsx:247-257` (comercio), `:268-275` (driver), `:282-295` (cliente) | `L.divIcon({ iconSize: [36,44], iconAnchor: [18,44] })` y `L.marker(..., { title: "Tu ubicación" / `Comercio: ${c.name}` / "Cliente", alt: "..." })`; los marcadores tienen `role="button"` y `tabindex="0"`, por lo que necesitan nombre y foco visible. |
| Salto de encabezados h1 → h3                              | `src/pages/driver/DriverOrder.tsx:372`, `:415`, `:472`                                           | Cambiar los `h3` de secciones a `h2` (o añadir un `h2` “Detalles del pedido”).                                                                                                                                                                            |
| Enlace telefónico 104x16                                  | `src/pages/driver/DriverOrder.tsx:400-402`                                                       | El smoke incluye `a[href^="tel:"]` como acción principal; convertirlo en botón/enlace con `min-h-11` (44) e icono + número.                                                                                                                               |
| Estado de carga sin h1/status                             | `src/pages/driver/DriverOrder.tsx:328-333`                                                       | Añadir `role="status"` y `<span className="sr-only">Cargando pedido…</span>`.                                                                                                                                                                             |

### 3.9 `/driver/earnings` — 4 fallos

| Hallazgo                                      | Archivo:línea                                          | Corrección concreta                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back icon-only sin nombre                     | `src/pages/driver/DriverEarnings.tsx:97-99`            | `aria-label="Volver a pedidos"`.                                                                                                                                                                  |
| Tabs Hoy/Semana/Mes de 36px de alto           | `src/pages/driver/DriverEarnings.tsx:124-135` (`py-2`) | `min-h-11` (44) y `min-w-11`; conservar `flex-1`.                                                                                                                                                 |
| Carga inicial sin `h1`/`main`/`role="status"` | `src/pages/driver/DriverEarnings.tsx:68-74`            | `<div role="status" aria-live="polite">` + `sr-only` “Cargando ganancias”. Se observó una primera carga lenta de >3 s en móvil; el smoke espera 3 s y en la segunda pasada ya midió el contenido. |
| Contraste de “Ganancias acumuladas” y CTA     | `src/pages/driver/DriverEarnings.tsx:113-116`, `:99`   | §5.3.                                                                                                                                                                                             |

### 3.10 `/driver/profile` — 2 fallos

| Hallazgo                    | Archivo:línea                                                                                    | Corrección concreta                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back icon-only sin nombre   | `src/pages/driver/DriverProfile.tsx:148-150`                                                     | `aria-label="Volver a pedidos"`.                                                                                                                                                                         |
| Inputs de edición sin label | `src/pages/driver/DriverProfile.tsx:180-186` (nombre), `:265-271` (vehículo), `:282-288` (placa) | Cada input tiene solo `placeholder`; añadir `aria-label="Nombre"`, `"Vehículo"`, `"Placa"` o un `<label htmlFor>` visible/`sr-only`. El smoke de ruta no los ve porque el perfil inicia en modo lectura. |

Los botones Editar/Cancelar/Guardar sí tienen `aria-label` (`:157`, `:162`, `:165`) y el toggle online usa `aria-pressed` (`:231-236`): buen patrón a replicar.

### 3.11 `/driver/history` — 2 fallos

| Hallazgo                    | Archivo:línea                                                                      | Corrección concreta                                   |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Nav inferior con anchos <40 | `src/pages/driver/DriverHistory.tsx:121-155` (Pedidos 35, Historial 37, Perfil 23) | `min-w-11` o `flex-1 min-w-11` en cada botón.         |
| Back correcto               | `src/pages/driver/DriverHistory.tsx:27-33`                                         | Ya tiene `aria-label="Volver"`; usar como referencia. |

### 3.12 `/driver/chat/5` — sin hallazgos

| Punto                       | Archivo:línea                             | Nota                                                                             |
| --------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| Back con nombre             | `src/pages/driver/DriverChat.tsx:87-94`   | `aria-label="Volver"` + 44x44.                                                   |
| Input de mensaje con nombre | `src/pages/driver/DriverChat.tsx:205-219` | `aria-label="Mensaje"`.                                                          |
| Enviar con nombre           | `src/pages/driver/DriverChat.tsx:220-228` | `aria-label="Enviar mensaje"` + 44x44.                                           |
| Carga con texto para lector | `src/pages/driver/DriverChat.tsx:115-119` | `sr-only` “Cargando mensajes”.                                                   |
| Foco visible                | —                                         | El smoke midió 7 controles, todos con indicador; Tab con 7 paradas por viewport. |

---

## 4. Hallazgos transversales (no ligados a una sola ruta)

### 4.1 Modales: foco, Escape y semántica — **bloqueante**

Los overlays de Admin son `div.fixed` hechos a mano, no diálogos:

- `src/pages/admin/Commerces.tsx:445`, `:537`, `:604`
- `src/pages/admin/Drivers.tsx:271`
- `src/pages/admin/Orders.tsx:417`

Prueba de teclado real sobre `/admin/commerces` → “Nuevo comercio”:

| Prueba                 | Resultado actual                                             | Esperado                                                |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Abrir con teclado      | El foco **permanece en el botón “Nuevo”** detrás del overlay | Foco inicial dentro del diálogo (título o primer campo) |
| `Escape`               | **No cierra** el modal                                       | Cierra y devuelve el foco al disparador                 |
| `Tab` dentro del modal | Puede salir al contenido de fondo                            | Foco atrapado dentro del diálogo                        |
| Nombre del botón X     | **Vacío** (solo SVG)                                         | “Cerrar”                                                |
| Rol/atributos          | Sin `role="dialog"`, sin `aria-modal`, sin `aria-labelledby` | Diálogo anunciado y titulado                            |

**Corrección:** reemplazar los tres overlays por `@radix-ui/react-dialog` (ya está en
`package.json`), que resuelve `role`, `aria-modal`, foco inicial, trap, Escape y
restauración de foco. Si se mantiene el `div`, como mínimo:

```tsx
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Nuevo comercio</h2>
  <button aria-label="Cerrar" onClick={close}>
    …
  </button>
</div>
```

más `useEffect` de foco inicial, `keydown` Escape, trap de Tab y retorno al disparador.
Los formularios dentro de los modales repiten el problema de labels no asociados
(ej. `Commerces.tsx:465-466`, `Drivers.tsx:293-294`).

### 4.2 Skip link y landmarks — **WCAG 2.4.1**

`AdminLayout` monta primero el sidebar con 6 botones de nav, tema y logout
(`src/components/AdminLayout.tsx:50-99`) y después `<main>` (`:102`). No existe enlace
“Saltar al contenido”; un usuario de teclado debe tabular por todo el menú en cada
navegación. Corrección:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] …">
  Saltar al contenido
</a>
<main id="main-content" tabIndex={-1}>…</main>
```

En Driver, todas las páginas usan `div.mobile-container` como raíz y solo tienen `h1`
(ej. `DriverHome.tsx:148`, `DriverEarnings.tsx:93`, `DriverProfile.tsx:144`,
`DriverChat.tsx:84`, `DriverOrder.tsx:345`, `DriverHistory.tsx:22`). El `h1` hace pasar
el smoke, pero conviene envolver el contenido en `<main>` para que los lectores de
pantalla puedan saltar al contenido principal.

### 4.3 Títulos de página — **WCAG 2.4.2, no cumple**

Todas las rutas comparten `<title>RAPIDY</title>` (`index.html:9`). No hay
`document.title` por ruta en `src`. Corrección: un hook `usePageTitle("Pedidos · Admin")`
en cada página, o un mapa ruta→título en `App.tsx`, actualizando `document.title` en
`useEffect`. Es un cambio de 5 líneas por layout y beneficia a todos los frentes.

### 4.4 Estados de carga sin anuncio — **WCAG 4.1.3 parcial**

- `src/components/SessionGuard.tsx:166-171`: spinner sin texto ni `role="status"`.
- `src/pages/driver/DriverEarnings.tsx:68-74`: ídem.
- `src/pages/driver/DriverOrder.tsx:328-333`: ídem.
- `src/pages/admin/Commerces.tsx:263-264`, `Drivers.tsx:105-106`, `Orders.tsx:271-276`:
  texto “Cargando…” sin `role="status"`.

Añadir `role="status" aria-live="polite"` y un `sr-only` descriptivo. El chat ya lo hace
bien (`DriverChat.tsx:115-119`).

### 4.5 Nombres solo por `title` — avisos no bloqueantes

El smoke emitió 13 avisos no bloqueantes; la mayoría son botones cuyo único nombre
proviene de `title` (y un placeholder que no cuenta como label):
`Commerces.tsx:343-352` (acciones de fila), `Drivers.tsx:186`, `Orders.tsx:315`/
`:381-382`, y los botones de cabecera de Dashboard con texto oculto en móvil.
`title` participa en el cálculo de nombre accesible, pero no es fiable en táctil ni
en todos los lectores. Añadir `aria-label` explícito y mantener el `title` solo como
tooltip visual.

---

## 5. Contraste y WCAG 2.1 AA

### 5.1 Checklist WCAG 2.1 AA (criterios relevantes)

| Criterio                            | Estado           | Evidencia / pendiente                                                                           |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text content              | **Parcial**      | Backs y X de modales sin nombre; marcador del driver sin nombre.                                |
| 1.3.1 Info and relationships        | **Parcial**      | Labels no asociados; Driver sin `<main>`; salto h1→h3 en DriverOrder.                           |
| 1.3.2 Meaningful sequence           | Cumple           | DOM y orden de Tab coherentes en las 24 pasadas.                                                |
| 1.3.3 Sensory characteristics       | Cumple           | Estados con texto, no solo color (ej. “En línea”, “Ocupado”).                                   |
| 1.3.4 Orientation                   | Cumple           | Sin bloqueo de orientación; layout responsive.                                                  |
| 1.4.1 Use of color                  | Cumple           | Badges y estados incluyen texto.                                                                |
| 1.4.3 Contrast (minimum)            | **No cumple**    | Blanco/`#FF6A00` = 2.87:1; `zinc-400`/blanco = 2.56:1; `zinc-500`/`#0A0A0D` = 4.09:1. Ver §5.3. |
| 1.4.4 Resize text (200%)            | Pendiente manual | No medido por el smoke.                                                                         |
| 1.4.10 Reflow                       | **Parcial**      | 390 y 1280 sin overflow; falta 320 y zoom 400%.                                                 |
| 1.4.11 Non-text contrast            | Pendiente manual | Revisar bordes de inputs y focus ring.                                                          |
| 2.1.1 Keyboard                      | **Parcial**      | Tab funciona; modales no reciben foco ni cierran con Escape.                                    |
| 2.1.2 No keyboard trap              | **Parcial**      | No hay trap dentro del modal (el foco se escapa al fondo); corregir con Dialog.                 |
| 2.4.1 Bypass blocks                 | **No cumple**    | Sin skip link en AdminLayout; Driver sin `<main>`.                                              |
| 2.4.2 Page titled                   | **No cumple**    | Todas las rutas se llaman “RAPIDY”.                                                             |
| 2.4.3 Focus order                   | **Parcial**      | Correcto en página; el modal deja el foco en el disparador.                                     |
| 2.4.4 Link purpose                  | **Parcial**      | El enlace `tel:` de DriverOrder no describe el número; marcadores sin nombre.                   |
| 2.4.6 Headings and labels           | **Parcial**      | h1 presente; labels faltantes y h3 sin h2 en DriverOrder.                                       |
| 2.4.7 Focus visible                 | **Cumple**       | 0 fallos en los 194 chequeos; se apoya en el outline del navegador.                             |
| 2.5.5 Target size (AAA 44px)        | **No cumple**    | Múltiples acciones de 23-36px. El producto pide >=40.                                           |
| 2.5.8 Target size minimum (AA 24px) | **Parcial**      | Marcadores 12x12; el resto suele superar 24.                                                    |
| 3.1.1 Language of page              | Cumple           | `<html lang="es">` (`index.html:2`).                                                            |
| 3.2.1 On focus                      | Cumple           | Sin cambios inesperados al enfocar.                                                             |
| 3.2.2 On input                      | Cumple           | Filtros/búsquedas actualizan solo su lista.                                                     |
| 3.3.1 Error identification          | **Parcial**      | Hay mensajes de error; no todos anuncian con `role="alert"`.                                    |
| 3.3.2 Labels or instructions        | **No cumple**    | Settings, búsquedas, perfil en edición y modales.                                               |
| 4.1.2 Name, role, value             | **No cumple**    | Backs/X sin nombre; map markers `role=button` sin nombre.                                       |
| 4.1.3 Status messages               | **Parcial**      | Settings guardado usa `role="status"` (`:232-237`); cargas no.                                  |

### 5.2 Pruebas de teclado ejecutadas

| Prueba                 | Cómo                                                                                      | Resultado                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Tab hacia adelante     | 16 pulsaciones por ruta/viewport, se registran hasta 8 paradas útiles                     | **24/24 pasadas**, >=4 paradas; sin quedar atrapado en `body`. |
| Foco visible           | `focus({ focusVisible: true })` + comparación de `outline/box-shadow/borde` antes/después | **0 fallos** en controles de producto (se excluyó Devtools).   |
| Modal con teclado      | Abrir “Nuevo comercio” con Enter/click y observar `document.activeElement`                | **Falla**: foco queda en “Nuevo” detrás del overlay.           |
| Escape en modal        | `page.keyboard.press("Escape")`                                                           | **Falla**: el modal sigue abierto.                             |
| `Tab` dentro del modal | Tab repetido                                                                              | **Falla**: no hay trap; el foco puede ir al fondo.             |
| Shift+Tab inverso      | No automatizado                                                                           | Pendiente manual (§5.4).                                       |
| Enter/Space en botones | No automatizado                                                                           | Pendiente manual; son `<button>` nativos.                      |
| Lector de pantalla     | No ejecutado                                                                              | Pendiente con NVDA/VoiceOver.                                  |

### 5.3 Ratios de contraste medidos (fórmula WCAG)

| Combinación                                  |      Ratio | ¿AA texto normal?                            |
| -------------------------------------------- | ---------: | -------------------------------------------- |
| `#FFFFFF` sobre `#FF6A00` (`bg-brand` claro) | **2.87:1** | No                                           |
| `#FFFFFF` sobre `#E85D00` (`brand-strong`)   | **3.50:1** | No (solo texto grande >=18.66px bold / 24px) |
| `#FFFFFF` sobre `#FF8C1A` (`brand` oscuro)   | **2.33:1** | No                                           |
| `#A1A1AA` (`zinc-400`) sobre blanco          | **2.56:1** | No                                           |
| `#71717A` (`zinc-500`) sobre blanco          | **4.83:1** | Sí                                           |
| `#71717A` (`zinc-500`) sobre `#0A0A0D`       | **4.09:1** | No                                           |
| `#A1A1AA` (`zinc-400`) sobre `#111115`       | **7.35:1** | Sí                                           |
| `#FFFFFF` sobre `#DC2626` (red-600)          | **4.83:1** | Sí                                           |
| `#18181B` sobre `#FF6A00`                    | **6.17:1** | Sí                                           |

Ejemplos concretos que fallan: `Commerces.tsx:254` (“Nuevo”), `Drivers.tsx:96`,
`DriverHome.tsx:346` (“Aceptar”), `Settings.tsx:337` (“Guardar configuración”),
`Settings.tsx:415` y todos los headers con gradiente `from-brand to-brand-strong`
(`DriverHome.tsx:149`, `DriverEarnings.tsx:95`, `DriverProfile.tsx:146`,
`DriverChat.tsx:86`, `DriverHistory.tsx:24`, `DriverOrder.tsx:340`).
Texto secundario: `AdminLayout.tsx:58` (`text-zinc-400` a 10px), `Commerces.tsx:358`,
`Drivers.tsx:194`, `Orders.tsx:273` y `dark:text-zinc-500` en `AdminLayout.tsx:58`.

**Correcciones posibles (elegir una por sistema):**

1. Texto oscuro sobre naranja: `text-zinc-950` sobre `#FF6A00` = 6.17:1; en oscuro
   `text-zinc-950` sobre `#FF8C1A` = 8.54:1. Cambia el look de los CTA.
2. Fondo naranja más oscuro para texto blanco: `#C2410C` (5.18:1) o `#B34700` (5.50:1),
   manteniendo `#FF6A00` para iconos, bordes y acentos.
3. Solo texto grande/bold en los CTA naranjas no exime a los `text-xs` actuales.

Para secundarios: `text-zinc-500` en claro (4.83:1) y `text-zinc-400` en oscuro
(7.35:1); evitar `zinc-400` sobre blanco y `zinc-500` sobre `#0A0A0D`.

### 5.4 Protocolo manual pendiente (teclado + lector)

Ejecutar en Admin y Driver, claro y oscuro, 390px y 1280px:

1. Desde la barra de direcciones, `Tab` hasta el primer control visible; verificar
   que el foco entra en el skip link (cuando exista) y luego en `<main>`.
2. Recorrer toda la página con `Tab` y volver con `Shift+Tab`; comprobar orden lógico,
   foco visible y que no se salte ningún control.
3. Abrir cada modal con `Enter`; verificar foco inicial dentro, `Tab` atrapado,
   `Escape` cierra y el foco vuelve al disparador.
4. Activar botones con `Enter` y `Space`; comprobar que no hay doble envío.
5. En formularios, salir de un campo con `Tab` y verificar que el label se anuncia.
6. Probar `200%` de zoom y `400%` de reflow a 320px; no debe haber scroll horizontal.
7. Repetir con NVDA (Windows) o VoiceOver (macOS/iOS): encabezados, landmarks,
   nombre de iconos y anuncio de toasts/cargas.
8. En móvil real, confirmar targets con el pulgar y que el teclado virtual no tapa
   el CTA (especialmente guardar en Settings y enviar en Chat).

---

## 6. Plan de corrección sugerido (sin editar páginas en este frente)

**P0 — bloqueantes de accesibilidad**

1. Labels programáticos en Settings, búsquedas de Admin, edición de perfil y modales.
2. `aria-label` en todos los back icon-only y X de modales.
3. Diálogos con Radix (rol, `aria-modal`, foco inicial/trap/Escape/restore).
4. Nombre y tamaño de marcadores del mapa.

**P1 — WCAG AA y targets** 5. Sustituir el esquema de contraste de CTA naranja y textos `zinc-400`/`zinc-500`. 6. Llevar a >=40px (ideal 44) tabs, filtros, iconos de fila, theme toggle,
logout y nav inferior. 7. `document.title` por ruta y skip link/`<main>` en Admin y Driver.

**P2 — pulido** 8. `role="status"` en cargas; `aria-label` en botones que hoy solo usan `title`. 9. Corregir h1→h3 en DriverOrder; unificar focus ring global en `index.css`. 10. Repetir `node scripts/a11y-smoke.mjs` y el protocolo manual §5.4.

---

## 7. Evidencia y límites

- Salida completa de la última corrida: **149/194 PASS**, 45 FAIL, 13 avisos no
  bloqueantes. El detalle por selector y tamaño está en la consola del script.
- Viewports probados: 390x844 y 1280x900. No se probó 320px ni zoom 200/400%.
- El smoke no mide contraste, lectores de pantalla ni modales (se revisaron aparte
  con una sonda Playwright y lectura de código).
- No se modificaron páginas, estilos ni contratos. Los cambios propuestos son
  responsabilidad de los frentes Admin/Driver correspondientes.
