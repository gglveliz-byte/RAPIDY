import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface CartItem {
  productId: number;
  commerceId: number;
  name: string;
  price: string;
  quantity: number;
  image: string;
  commerceName: string;
  unitType?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  getItemsByCommerce: () => Record<number, { commerceName: string; items: CartItem[] }>;
}

const CartContext = createContext<CartContextType | null>(null);
const CART_KEY = "cart";
const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isValidItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as CartItem;
  return (
    Number.isFinite(item.productId) &&
    Number.isFinite(item.commerceId) &&
    typeof item.name === "string" &&
    typeof item.price === "string" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    item.quantity <= 999
  );
}

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[] | { items?: unknown; ts?: number };
    if (Array.isArray(parsed)) {
      // Compatibilidad con el formato antiguo (sin TTL).
      return parsed.filter(isValidItem);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return [];
    const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
    if (!ts || Date.now() - ts > CART_TTL_MS) {
      localStorage.removeItem(CART_KEY);
      return [];
    }
    return parsed.items.filter(isValidItem);
  } catch {
    try {
      localStorage.removeItem(CART_KEY);
    } catch { /* sin acción */ }
    return [];
  }
}

function persistCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({ items, ts: Date.now() }));
  } catch {
    // Sin almacenamiento (modo privado/cuota): el carrito sigue en memoria.
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart);

  const commit = useCallback((updater: (prev: CartItem[]) => CartItem[]) => {
    setItems((prev) => {
      const next = updater(prev).slice(0, 50);
      persistCart(next);
      return next;
    });
  }, []);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      const qty = Number(item.quantity ?? 1);
      if (!Number.isFinite(qty) || qty <= 0) return;
      commit((prev) => {
        const existing = prev.find((i) => i.productId === item.productId);
        if (existing) {
          return prev.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: Math.min(999, i.quantity + qty) }
              : i
          );
        }
        return [...prev, { ...item, quantity: Math.min(999, qty) }];
      });
    },
    [commit]
  );

  const removeItem = useCallback(
    (productId: number) => {
      commit((prev) => prev.filter((i) => i.productId !== productId));
    },
    [commit]
  );

  const updateQuantity = useCallback(
    (productId: number, quantity: number) => {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        commit((prev) => prev.filter((i) => i.productId !== productId));
        return;
      }
      commit((prev) =>
        prev.map((i) =>
          i.productId === productId ? { ...i, quantity: Math.min(999, quantity) } : i
        )
      );
    },
    [commit]
  );

  const clearCart = useCallback(() => {
    setItems([]);
    try {
      localStorage.removeItem(CART_KEY);
    } catch { /* sin acción */ }
  }, []);

  // Sincronización entre pestañas y limpieza al cerrar sesión.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CART_KEY) setItems(readStoredCart());
      if (event.key === null) setItems(readStoredCart());
    };
    const onLogout = () => {
      setItems([]);
      try {
        localStorage.removeItem(CART_KEY);
      } catch { /* sin acción */ }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("rapidy:logout", onLogout);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rapidy:logout", onLogout);
    };
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce(
    (sum, i) => sum + (Number.isFinite(Number(i.price)) ? Number(i.price) : 0) * i.quantity,
    0
  );

  const getItemsByCommerce = useCallback(() => {
    const grouped: Record<number, { commerceName: string; items: CartItem[] }> = {};
    for (const item of items) {
      if (!grouped[item.commerceId]) {
        grouped[item.commerceId] = { commerceName: item.commerceName, items: [] };
      }
      grouped[item.commerceId].items.push(item);
    }
    return grouped;
  }, [items]);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal, getItemsByCommerce }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}