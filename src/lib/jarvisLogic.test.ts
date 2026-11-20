import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_DEFAULT_ITEMS } from './domainLogic';
import {
  dedupeJarvisActions,
  describeJarvisAction,
  parseJarvisCommand,
  resolveProductMatch,
} from './jarvisLogic';
import type { Product } from '../types';

const SAMPLE_PRODUCTS: Product[] = CATALOG_DEFAULT_ITEMS.map((item) => ({
  ...item,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

describe('JARVIS fuzzy product matching & command parsing', () => {
  it('matches spoken "human following bot" to Human Follower (4 Wheel Chassis)', () => {
    const matched = resolveProductMatch(SAMPLE_PRODUCTS, 'human following bot');
    assert.ok(matched);
    assert.equal(matched.id, 'prod_default_human_follower');
    assert.equal(matched.name, 'Human Follower (4 Wheel Chassis)');
  });

  it('matches "obstacle avoiding kit" and "company website"', () => {
    const obstacle = resolveProductMatch(SAMPLE_PRODUCTS, 'obstacle avoiding kit');
    assert.equal(obstacle?.id, 'prod_default_obstacle_avoiding');

    const webpage = resolveProductMatch(SAMPLE_PRODUCTS, 'company webpage');
    assert.equal(webpage?.id, 'prod_default_webpages_company');
  });

  it('parses "Open project store and order human following bot" into multi-step actions', () => {
    const { actions, suggestedReply } = parseJarvisCommand(
      'Open project store and order human following bot',
      SAMPLE_PRODUCTS,
    );

    assert.equal(actions.length, 2);
    assert.deepEqual(actions[0], { type: 'navigate_tab', tab: 'projects' });
    assert.deepEqual(actions[1], {
      type: 'order_product',
      productQuery: 'Human Follower (4 Wheel Chassis)',
      quantity: 1,
      openCart: true,
      openCheckout: false,
    });
    assert.ok(suggestedReply && suggestedReply.includes('Human Follower'));
  });

  it('parses quantity + checkout requests cleanly', () => {
    const { actions } = parseJarvisCommand(
      'Order 2 obstacle avoiding kits and checkout now',
      SAMPLE_PRODUCTS,
    );

    const orderAction = actions.find((a) => a.type === 'order_product');
    assert.ok(orderAction && orderAction.type === 'order_product');
    assert.equal(orderAction.quantity, 2);
    assert.equal(orderAction.openCheckout, true);
  });

  it('parses catalog search commands', () => {
    const { actions } = parseJarvisCommand('Search Obstacle Avoiding', SAMPLE_PRODUCTS);
    assert.ok(actions.some((a) => a.type === 'filter_catalog' && a.searchQuery === 'Obstacle Avoiding'));
  });

  it('parses studio and game tab switches', () => {
    assert.deepEqual(parseJarvisCommand('Open Music Studio', SAMPLE_PRODUCTS).actions, [
      { type: 'navigate_tab', tab: 'music' },
    ]);
    assert.deepEqual(parseJarvisCommand('Open Game Studio', SAMPLE_PRODUCTS).actions, [
      { type: 'navigate_tab', tab: 'games' },
    ]);
  });

  it('does not trigger navigation for pure Q&A queries', () => {
    const { actions } = parseJarvisCommand('What kits are available?', SAMPLE_PRODUCTS);
    assert.equal(actions.length, 0);
  });

  it('deduplicates repeated actions and describes them clearly', () => {
    const deduped = dedupeJarvisActions([
      { type: 'navigate_tab', tab: 'projects' },
      { type: 'navigate_tab', tab: 'projects' },
      { type: 'order_product', productQuery: 'Human Follower (4 Wheel Chassis)', quantity: 1 },
    ]);
    assert.equal(deduped.length, 2);
    assert.equal(describeJarvisAction(deduped[0]), 'Opened PRIME X PROJECTS');
  });
});
