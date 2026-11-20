import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DOWNLOAD_FEE_INR,
  buildStandaloneHtmlGame,
  createDefaultGameConfig,
  findPendingGameDownloadOrder,
  hasUnlockedGameDownload,
  sanitizeSlug,
} from './gameBuilderLogic';
import type { Order } from '../types';

test('GAME_DOWNLOAD_FEE_INR is strictly 10 rupees and sanitizeSlug formats safe filenames', () => {
  assert.equal(GAME_DOWNLOAD_FEE_INR, 10);
  assert.equal(sanitizeSlug('Starfall Citadel 2!'), 'starfall-citadel-2');
  assert.equal(sanitizeSlug('   '), 'prime-x-arcade');
});

test('hasUnlockedGameDownload and findPendingGameDownloadOrder enforce Rs 10 payment gate per game', () => {
  const pendingOrder: Order = {
    id: 'ORD-GAME-1',
    userId: 'u1',
    customerName: 'Asha',
    customerEmail: 'asha@example.com',
    type: 'game_download',
    gameId: 'game_alpha',
    gameTitle: 'Alpha Grid',
    items: [{ productId: 'game_alpha', name: 'Playable Game', price: 10, quantity: 1 }],
    totalAmount: 10,
    status: 'Payment Submitted',
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };

  assert.equal(hasUnlockedGameDownload([pendingOrder], 'game_alpha'), false);
  assert.equal(findPendingGameDownloadOrder([pendingOrder], 'game_alpha')?.id, 'ORD-GAME-1');

  const verifiedOrder: Order = { ...pendingOrder, status: 'Verified' };
  assert.equal(hasUnlockedGameDownload([verifiedOrder], 'game_alpha'), true);
  assert.equal(hasUnlockedGameDownload([verifiedOrder], 'game_beta'), false);
  assert.equal(findPendingGameDownloadOrder([verifiedOrder], 'game_alpha'), null);
});

test('buildStandaloneHtmlGame serializes custom title, palette, ability, speed, and win target cleanly', () => {
  const base = createDefaultGameConfig();
  const html = buildStandaloneHtmlGame({
    ...base,
    title: 'SOLAR DEFENDER',
    theme: 'neon_cyber',
    ability: 'spread_shot',
    heroSpeed: 380,
    winTargetScore: 2500,
  });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('SOLAR DEFENDER'));
  assert.ok(html.includes('Neon Trench Grid'));
  assert.ok(html.includes('"ability":"spread_shot"'));
  assert.ok(html.includes('"winTargetScore":2500'));
  assert.ok(html.includes('data-start="true"'));
});
