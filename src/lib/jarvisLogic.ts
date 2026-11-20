import type { HomeTab, JarvisAction, Product } from '../types';

export function resolveProductMatch(
  products: Product[],
  query: string,
): Product | null {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery || products.length === 0) return null;

  // Normalize common spoken synonyms so "human following bot" matches "Human Follower (4 Wheel Chassis)"
  const expanded = cleanQuery
    .replace(/\bbots?\b/g, 'robot follower')
    .replace(/\bfollowing\b/g, 'follower following')
    .replace(/\bavoidance\b/g, 'avoiding')
    .replace(/\bweb\s*pages?\b/g, 'webpage webpages')
    .replace(/\bwebsites?\b/g, 'webpage company')
    .replace(/\bideas?\b/g, 'other ideas custom');

  const queryTokens = Array.from(
    new Set(
      expanded
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2 && !['the', 'and', 'for', 'kit', 'buy', 'order', 'add', 'cart', 'to', 'please', 'one', 'a'].includes(t)),
    ),
  );

  let bestProduct: Product | null = null;
  let bestScore = 0;

  for (const product of products) {
    const hayName = product.name.toLowerCase();
    const hayCat = (product.category || '').toLowerCase();
    const hayDesc = (product.description || '').toLowerCase();

    let score = 0;
    if (hayName === cleanQuery) score += 100;
    if (hayName.includes(cleanQuery)) score += 60;

    for (const token of queryTokens) {
      if (hayName.includes(token)) score += 20;
      if (hayCat.includes(token)) score += 10;
      if (hayDesc.includes(token)) score += 4;
    }

    // Extra targeted bonus for flagship kits
    if (cleanQuery.includes('human') && hayName.includes('human')) score += 25;
    if (cleanQuery.includes('obstacle') && hayName.includes('obstacle')) score += 25;
    if ((cleanQuery.includes('webpage') || cleanQuery.includes('web page') || cleanQuery.includes('website')) && hayName.includes('webpage')) {
      score += 25;
    }
    if ((cleanQuery.includes('other idea') || cleanQuery.includes('custom project')) && hayName.includes('other idea')) {
      score += 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  return bestScore >= 18 ? bestProduct : null;
}

function extractQuantity(text: string): number {
  const numMatch = text.match(/(?:order|buy|add|get)\s+(\d+)\b/i);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 20) return n;
  }
  if (/\btwo\b/i.test(text)) return 2;
  if (/\bthree\b/i.test(text)) return 3;
  return 1;
}

function extractSearchTerm(message: string): string | null {
  const match = message.match(
    /(?:search|find|filter|show|look\s*for)\s+(?:for\s+)?(?:products?\s+|kits?\s+|category\s+)?["']?([a-z0-9\s-]{2,40})["']?/i,
  );
  if (!match) return null;
  const candidate = match[1]
    .replace(/\b(in\s+(?:project\s+)?store|catalog|products?|please|now)\b/gi, '')
    .trim();
  if (!candidate || ['all', 'everything', 'orders', 'bills', 'cart'].includes(candidate.toLowerCase())) {
    return null;
  }
  return candidate;
}

export function dedupeJarvisActions(actions: JarvisAction[]): JarvisAction[] {
  const seen = new Set<string>();
  const result: JarvisAction[] = [];

  for (const action of actions) {
    const key =
      action.type === 'navigate_tab'
        ? `nav:${action.tab}`
        : action.type === 'set_store_view'
          ? `view:${action.subView}`
          : action.type === 'filter_catalog'
            ? `filter:${(action.searchQuery || '').toLowerCase()}|${(action.category || '').toLowerCase()}`
            : action.type === 'order_product'
              ? `order:${action.productQuery.toLowerCase()}`
              : action.type;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }

  return result;
}

export function parseJarvisCommand(
  userMessage: string,
  products: Product[],
): { actions: JarvisAction[]; suggestedReply: string | null } {
  const q = userMessage.trim().toLowerCase();
  if (!q) return { actions: [], suggestedReply: null };

  const actions: JarvisAction[] = [];
  const confirmations: string[] = [];

  const mentionsProjectStore =
    q.includes('project store') ||
    q.includes('prime x project') ||
    q.includes('projects tab') ||
    q.includes('store') ||
    q.includes('catalog');

  const mentionsOrderIntent =
    /\b(order|buy|purchase|add\s+to\s+cart|get\s+me|want\s+to\s+buy|book)\b/i.test(q);

  const wantsCheckout =
    /\b(checkout|proceed\s+to\s+bill|pay\s+now|select\s+address|billing)\b/i.test(q);

  const wantsClearFilters =
    /\b(clear\s+search|reset\s+filter|clear\s+filter|show\s+all\s+products)\b/i.test(q);

  // 1. Tab navigation intents
  let requestedTab: HomeTab | null = null;
  if (mentionsProjectStore) {
    requestedTab = 'projects';
  } else if (
    q.includes('music studio') ||
    q.includes('suno') ||
    /\b(open|go\s+to|switch\s+to|show)\s+music\b/i.test(q)
  ) {
    requestedTab = 'music';
  } else if (
    q.includes('game studio') ||
    q.includes('game creator') ||
    /\b(open|go\s+to|switch\s+to|show)\s+games?\b/i.test(q)
  ) {
    requestedTab = 'games';
  } else if (
    q.includes('prime x studio') ||
    q.includes('video studio') ||
    q.includes('video editor') ||
    q.includes('capcut') ||
    /\b(open|go\s+to|switch\s+to|show)\s+studio\b/i.test(q)
  ) {
    requestedTab = 'studio';
  } else if (
    q.includes('live class') ||
    q.includes('classes') ||
    q.includes('course')
  ) {
    if (/\b(open|go\s+to|switch\s+to|show|view)\b/i.test(q)) {
      requestedTab = 'classes';
    }
  }

  if (requestedTab) {
    actions.push({ type: 'navigate_tab', tab: requestedTab });
    const labelMap: Record<HomeTab, string> = {
      projects: 'PRIME X PROJECTS',
      studio: 'PRIME X STUDIO',
      music: 'MUSIC STUDIO',
      games: 'GAME STUDIO',
      classes: 'LIVE CLASSES',
    };
    confirmations.push(`Opened ${labelMap[requestedTab]}`);
  }

  // 2. Store view intents (cart / orders)
  if (/\b(open|view|show|go\s+to)\s+(?:my\s+)?cart\b/i.test(q)) {
    if (!requestedTab) actions.push({ type: 'navigate_tab', tab: 'projects' });
    actions.push({ type: 'set_store_view', subView: 'cart' });
    confirmations.push('Opened your Shopping Cart');
  } else if (/\b(open|view|show|go\s+to)\s+(?:my\s+)?(orders|bills|history|analytics)\b/i.test(q)) {
    if (!requestedTab) actions.push({ type: 'navigate_tab', tab: 'projects' });
    actions.push({ type: 'set_store_view', subView: 'orders' });
    confirmations.push('Opened your Orders & Bills');
  }

  // 3. Product order / add-to-cart intent
  const matchedProduct = resolveProductMatch(products, q);
  if (matchedProduct && mentionsOrderIntent) {
    if (!requestedTab) {
      actions.push({ type: 'navigate_tab', tab: 'projects' });
    }
    const qty = extractQuantity(q);
    actions.push({
      type: 'order_product',
      productQuery: matchedProduct.name,
      quantity: qty,
      openCart: true,
      openCheckout: wantsCheckout,
    });
    confirmations.push(
      matchedProduct.kind === 'webpage' || matchedProduct.kind === 'other_idea'
        ? `Opened ${matchedProduct.name} details form`
        : `Added ${qty} × ${matchedProduct.name} to your cart and opened Cart`,
    );
  } else if (wantsCheckout) {
    if (!requestedTab) actions.push({ type: 'navigate_tab', tab: 'projects' });
    actions.push({ type: 'set_store_view', subView: 'cart' });
    actions.push({ type: 'open_address_checkout' });
    confirmations.push('Opened delivery address & billing checkout');
  } else if (wantsClearFilters) {
    actions.push({ type: 'navigate_tab', tab: 'projects' });
    actions.push({ type: 'set_store_view', subView: 'catalog' });
    actions.push({ type: 'clear_catalog_filters' });
    confirmations.push('Cleared catalog search filters');
  } else if (/\b(search|find|filter)\b/i.test(q)) {
    const searchTerm = extractSearchTerm(userMessage);
    if (searchTerm) {
      if (!requestedTab) actions.push({ type: 'navigate_tab', tab: 'projects' });
      actions.push({ type: 'set_store_view', subView: 'catalog' });
      actions.push({ type: 'filter_catalog', searchQuery: searchTerm });
      confirmations.push(`Filtered PRIME X PROJECTS for "${searchTerm}"`);
    }
  }

  const deduped = dedupeJarvisActions(actions);
  const suggestedReply =
    confirmations.length > 0
      ? `Right away. ${confirmations.join(', ')}. You can select your delivery address and proceed to bill whenever you are ready.`
      : null;

  return { actions: deduped, suggestedReply };
}

export function describeJarvisAction(action: JarvisAction): string {
  switch (action.type) {
    case 'navigate_tab': {
      const names: Record<HomeTab, string> = {
        projects: 'PRIME X PROJECTS',
        studio: 'PRIME X STUDIO',
        music: 'MUSIC STUDIO',
        games: 'GAME STUDIO',
        classes: 'LIVE CLASSES',
      };
      return `Opened ${names[action.tab]}`;
    }
    case 'set_store_view':
      return action.subView === 'cart'
        ? 'Opened Cart'
        : action.subView === 'orders'
          ? 'Opened Orders & Bills'
          : 'Opened Catalog';
    case 'filter_catalog': {
      const parts: string[] = [];
      if (action.searchQuery) parts.push(`"${action.searchQuery}"`);
      if (action.category && action.category !== 'All') parts.push(`Category: ${action.category}`);
      return `Filtered catalog (${parts.join(', ') || 'Updated'})`;
    }
    case 'clear_catalog_filters':
      return 'Reset catalog search';
    case 'order_product':
      return `Ordered ${action.quantity && action.quantity > 1 ? `${action.quantity}× ` : ''}${action.productQuery}`;
    case 'open_address_checkout':
      return 'Opened Delivery Address & Billing';
  }
}
