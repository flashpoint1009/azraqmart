import { useEffect, useSyncExternalStore } from "react";

export type CartItem = {
  id: string;
  name: string;
  brand?: string;
  image?: string;
  unitPrice: number;
  cartonPrice: number;
  unitsPerCarton?: number;
  qty: number;
};

const KEY = "azraq_cart_v1";
const EVT = "azraq:cart-change";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVT));
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const cartStore = {
  get: read,
  add(p: Omit<CartItem, "qty">, qty = 1) {
    const items = read();
    const existing = items.find((i) => i.id === p.id);
    if (existing) existing.qty += qty;
    else items.push({ ...p, qty });
    write(items);
  },
  setQty(id: string, qty: number) {
    const items = read().map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i));
    write(items);
  },
  remove(id: string) {
    write(read().filter((i) => i.id !== id));
  },
  clear() {
    write([]);
  },
};

export function useCart() {
  const items = useSyncExternalStore(
    subscribe,
    () => {
      // return same reference when content hasn't changed by serializing
      return localStorage.getItem(KEY) ?? "[]";
    },
    () => "[]",
  );
  // Parse derived state
  const parsed: CartItem[] = (() => {
    try { return JSON.parse(items) as CartItem[]; } catch { return []; }
  })();
  const count = parsed.reduce((s, i) => s + i.qty, 0);
  const subtotal = parsed.reduce((s, i) => s + i.cartonPrice * i.qty, 0);
  return { items: parsed, count, subtotal, ...cartStore };
}

// Optional: clear stale items if needed in future migrations
export function useEnsureCart() {
  useEffect(() => {
    // no-op, placeholder for future migrations
  }, []);
}
