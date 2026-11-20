import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheProductImage,
  getCachedProductImages,
  loadPersistedProducts,
  savePersistedProducts,
  type StorageLike,
} from '../utils/catalogPersistence';
import type { Product } from '../types';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

test('savePersistedProducts and loadPersistedProducts retain added products and respect explicit deletion', () => {
  const store = createMemoryStorage();
  const sample: Product = {
    id: 'prod_1',
    name: 'Prime Neural Kit',
    description: 'Edge AI dev kit',
    price: 2999,
    category: 'Hardware',
    stock: 15,
    imageUrl: '/api/uploads/prod_1.png',
    createdAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
  };

  savePersistedProducts([sample], false, store);
  const loaded = loadPersistedProducts(store);
  assert.equal(loaded.products.length, 1);
  assert.equal(loaded.products[0].name, 'Prime Neural Kit');
  assert.equal(loaded.explicitlyCleared, false);

  savePersistedProducts([], true, store);
  const cleared = loadPersistedProducts(store);
  assert.equal(cleared.products.length, 0);
  assert.equal(cleared.explicitlyCleared, true);
});

test('cacheProductImage and getCachedProductImages store small uploaded image fallbacks', () => {
  const store = createMemoryStorage();
  cacheProductImage('/api/uploads/prod_abc.png', 'data:image/png;base64,AAAA', store);
  const cached = getCachedProductImages(store);
  assert.equal(cached['/api/uploads/prod_abc.png'], 'data:image/png;base64,AAAA');
});
