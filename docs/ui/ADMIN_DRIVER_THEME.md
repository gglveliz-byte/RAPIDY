# Brief visual — Admin y Repartidor

**Objetivo:** alinear Admin y Repartidor con el lenguaje visual de Cliente y
Negocio, con tema claro/oscuro real y sin cambiar contratos ni comportamiento.

## Tokens del sistema

- Marca primaria: `bg-brand`, `text-brand`, `border-brand`, `bg-brand-soft`,
  `hover:bg-brand-strong`. La marca es naranja; **no** usar verde como color
  primario.
- Página: `bg-surface dark:bg-[#0E0E12]` o `bg-[#F7F7FA] dark:bg-[#0A0A0D]`.
- Tarjeta: `bg-white dark:bg-[#1A1A1E]`.
- Tarjeta secundaria / inputs: `bg-zinc-50 dark:bg-[#16161B]`.
- Texto principal: `text-zinc-900 dark:text-zinc-100`.
- Texto secundario: `text-zinc-500 dark:text-zinc-400`.
- Bordes: `border-zinc-100 dark:border-white/10`.
- Separadores: `divide-zinc-100 dark:divide-white/5`.
- Header de marca: `bg-brand` o gradiente `from-brand to-brand-strong`, texto
  blanco.
- Botón primario: `bg-brand hover:bg-brand-strong text-white`.
- Botón secundario: `bg-zinc-100 dark:bg-white/10 text-zinc-700
  dark:text-zinc-200`.
- Bottom nav: `bg-white dark:bg-[#111115] border-t border-zinc-100
  dark:border-white/10`; activo `text-brand`, inactivo `text-zinc-400
  dark:text-zinc-500`.

## Semántica que NO se debe perder

- Verde: éxito, entregado, disponible, online.
- Ámbar: pendiente, advertencia, busy.
- Rojo: error, cancelado, rechazado.
- Azul: información o ruta.

La marca naranja reemplaza el verde **solo** en chrome, headers, botones
primarios, links, tabs activos, iconos de marca y focos. Los badges de estado
siguen usando su color semántico.

## Reglas de implementación

- Cada pantalla debe verse bien en claro y oscuro.
- No dejar `bg-white`, `text-gray-*` o `border-gray-*` sin variante `dark:`
  cuando sean superficie/texto/borde.
- Usar `zinc` para neutros, como Cliente y Negocio.
- Mantener targets táctiles de 44 px y safe-area en mobile.
- Mantener `card-shadow` solo en claro; en oscuro preferir borde sutil.
- No cambiar hooks, queries, rutas, estados ni textos funcionales.
- No tocar `src/index.css`, `tailwind.config.js`, `useDeliveryData.ts`,
  `SessionGuard.tsx` ni migraciones. Si hace falta un cambio compartido,
  reportarlo al agente principal.
- No ejecutar migraciones, builds ni reiniciar `localhost:3000`.
- El mapa del driver ya usa OpenStreetMap; preservar esa URL y la clase
  `.dark .leaflet-tile` de `index.css`.

## Admin

- `AdminLayout` es compartido: solo el agente de Dashboard puede editarlo.
- Sidebar: `bg-white dark:bg-[#111115]`, borde
  `border-zinc-100 dark:border-white/10`, activo `bg-brand/10 text-brand`.
- El resto de páginas admin usan `AdminLayout` y deben asumir fondo
  `bg-[#F7F7FA] dark:bg-[#0A0A0D]`.
- Los modales deben tener `bg-white dark:bg-[#16161B]` y overlay
  `bg-black/70`.

## Repartidor

- Es mobile-first (`mobile-container`), pero debe respetar claro/oscuro en
  desktop también.
- Header de marca naranja; bottom nav claro/oscuro.
- Cards blancas en claro y `#1A1A1E` en oscuro.
- Mantener el mapa con altura visible y tiles OSM.
- El chat debe conservar burbujas propias/ajenas legibles en ambos temas.