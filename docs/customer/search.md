# `/search` — Búsqueda y filtros

**Archivo de página:** `src/pages/customer/Search.tsx`  
**Ruta:** `/search?q=...&category=...`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Buscar productos y comercios en todo el catálogo, filtrar por categoría, mantener estado en la URL y evitar agregar productos no disponibles.

## Flujo end-to-end

```text
/search
  ├─ useSearchParams → q, category (fuente de verdad)
  ├─ useCategories → category.list
  ├─ useCommerces → commerce.list
  ├─ useFeaturedProducts → product.getFeatured (sugerencias)
  ├─ useCatalogProducts → product.list (filtro por categoría)
  └─ useProductSearch(q) → product.search (q >= 2, debounce 300 ms)
```

## Comportamiento

- El input actualiza `q` en la URL con `replace` en cada cambio.
- Los chips actualizan `category` en la URL.
- La búsqueda server-side se activa desde 2 caracteres.
- Para 0–1 caracteres se filtra el catálogo local.
- Los productos se filtran además por `commerceCategoryId`.
- Los comercios se filtran por `categoryId` y nombre.
- Los productos de comercio cerrado o agotado se marcan “No disponible” y no se agregan.
- La tarjeta de producto y la de comercio son accesibles por teclado (`role="button"`, `tabIndex`, Enter/Espacio).

## Contratos

| Procedimiento | Entrada | Salida |
|---|---|---|
| `product.search` | `{ query: string }` | productos con `commerceName`, `commerceCategoryId`, `commerceIsOpen`, `commerceStatus` |
| `product.list` | — | catálogo disponible de comercios activos/abiertos |
| `commerce.list` | — | comercios activos con proyección pública |
| `category.list` | — | categorías |

## Estados de UI

- Loading con spinner.
- Error con mensaje y botón “Reintentar”.
- Empty state si no hay productos ni comercios.
- `aria-live` con el conteo de resultados.
- Chips y botones con targets táctiles adecuados.

## Performance

- Debounce de 300 ms para no hacer una request por tecla.
- `useDeferredValue` para mantener el input fluido.
- `staleTime` de 30 s en búsqueda y 60 s en catálogo.
- No hay N+1: una consulta de catálogo y una de búsqueda.
