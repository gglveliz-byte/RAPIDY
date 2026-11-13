# `/home` — Catálogo principal

**Archivo de página:** `src/pages/customer/Home.tsx`  
**Ruta:** `/home`  
**Guard:** `SessionGuard role="customer"`.

## Objetivo

Mostrar identidad del cliente, categorías, banner de productos más pedidos, comercios destacados, platillos populares y catálogo completo, con búsqueda y filtros.

## Flujo end-to-end

```text
/home
  └─ SessionGuard
      └─ CustomerHome
          ├─ HomeHeader (cliente, dirección, buscador)
          ├─ HomeCategories
          ├─ HomePromoBanner
          ├─ HomeFeaturedCommerces
          ├─ ProductCard (platillos)
          ├─ CommerceCard (comercios)
          └─ CustomerBottomNav
```

### Datos

| Dato | Hook | Procedimiento tRPC |
|---|---|---|
| Categorías | `useCategories` | `category.list` |
| Comercios | `useCommerces` | `commerce.list` |
| Destacados | `useFeaturedProducts` | `product.getFeatured` |
| Catálogo completo | `useCatalogProducts` | `product.list` |
| Búsqueda | `useProductSearch` | `product.search` |
| Banner top | `useTopOrderedProducts` | `product.getTopOrdered` |
| Carrito | `useCart` | Local + `order.quote` al checkout |

- `commerce.list` devuelve solo comercios activos y una proyección pública.
- `product.getFeatured`, `product.list`, `product.search` y `product.getTopOrdered`
  solo devuelven productos disponibles de comercios activos y abiertos.
- Al buscar desde 2 caracteres se usa el backend con debounce de 300 ms.
- Las categorías filtran productos por `commerceCategoryId` y comercios por `categoryId`.

### Tiempo real

- `useProductEvents` invalida catálogo y destacados.
- `useCommercesEvents` invalida comercios.
- Ambos canales SSE requieren sesión autenticada.

## Estados de UI

- Skeletons para comercios y platillos mientras cargan.
- Estado vacío de comercios con mensaje y sugerencia.
- Productos de comercio cerrado/agotado muestran “No disponible” y botón deshabilitado.
- Si la búsqueda no encuentra productos ni comercios, se muestra el estado vacío.

## Performance

- Se eliminó el N+1: antes cada `CommerceCard` hacía `product.getByCommerce`.
  Ahora Home usa el catálogo ya cargado y pasa `featuredProducts` como prop.
- E2E verifica **0 llamadas** `product.getByCommerce` al cargar `/home`.
- `QueryClient` único y `staleTime` de 30 s.
- `product.search` tiene debounce y `staleTime` de 30 s.

## Visual

- Tokens de marca: `brand`, `surface`, `ink`.
- Header Dark Velvet, fondo `#F7F7FA` vía `bg-surface`, acentos `bg-brand`.
- Logo RAPIDY ahora navega a `/home` (no a la landing pública).
- Si el cliente está logueado, `/` redirige a `/home`.
