import type { Product } from '../types';

const PRODUCTS_STORAGE_KEY = 'primex_persisted_products_v1';
const PRODUCTS_CLEARED_KEY = 'primex_products_explicitly_cleared_v1';
const PRODUCT_IMAGES_STORAGE_KEY = 'primex_product_image_cache_v1';
const MAX_CACHED_IMAGE_CHARS = 1_500_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePersistedProducts(
  products: Product[],
  explicitEmpty = false,
  storage?: StorageLike,
): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
    if (products.length === 0 && explicitEmpty) {
      store.setItem(PRODUCTS_CLEARED_KEY, '1');
    } else if (products.length > 0) {
      store.removeItem(PRODUCTS_CLEARED_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function loadPersistedProducts(storage?: StorageLike): {
  products: Product[];
  explicitlyCleared: boolean;
} {
  const store = getStorage(storage);
  if (!store) return { products: [], explicitlyCleared: false };
  try {
    const explicitlyCleared = store.getItem(PRODUCTS_CLEARED_KEY) === '1';
    const raw = store.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return { products: [], explicitlyCleared };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { products: [], explicitlyCleared };
    return {
      products: parsed.filter(
        (p): p is Product =>
          Boolean(p && typeof p === 'object' && p.id && p.name && Number.isFinite(Number(p.price))),
      ),
      explicitlyCleared,
    };
  } catch {
    return { products: [], explicitlyCleared: false };
  }
}

export function cacheProductImage(
  imageUrl: string,
  base64Data: string,
  storage?: StorageLike,
): void {
  const store = getStorage(storage);
  if (!store || !imageUrl || !base64Data) return;
  if (base64Data.length > MAX_CACHED_IMAGE_CHARS) return;
  try {
    const existing = getCachedProductImages(store);
    const next = { ...existing, [imageUrl]: base64Data };
    // Keep at most 12 cached images to stay comfortably within localStorage limits
    const keys = Object.keys(next);
    if (keys.length > 12) {
      for (const oldKey of keys.slice(0, keys.length - 12)) {
        delete next[oldKey];
      }
    }
    store.setItem(PRODUCT_IMAGES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedProductImages(storage?: StorageLike): Record<string, string> {
  const store = getStorage(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(PRODUCT_IMAGES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
