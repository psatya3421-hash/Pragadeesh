import React, { useMemo, useState } from 'react';
import {
  FileText,
  Minus,
  PackageOpen,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  CreditCard,
  Clock,
  CheckCircle2,
  Globe,
  Lightbulb,
  MapPin,
  X,
} from 'lucide-react';
import {
  DELIVERY_SERVICE_AREA_NOTE,
  MANUFACTURING_ORIGIN,
  calculateCartTotals,
  filterCatalogProducts,
  formatINR,
  resolveProductKind,
} from '../lib/domainLogic';
import { apiRequest, ApiError } from '../utils/api';
import { resolveCatalogImageUrl } from '../utils/catalogImages';
import { OrderHistoryAnalytics } from './store/OrderHistoryAnalytics';
import { CustomProjectRequestModal } from './store/CustomProjectRequestModal';
import { AddressSelectorModal } from './store/AddressSelectorModal';
import type {
  CartItem,
  CustomProjectRequest,
  CustomRequestType,
  DeliveryAddress,
  Order,
  Product,
} from '../types';

interface ProjectsStoreTabProps {
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  customRequests: CustomProjectRequest[];
  addresses: DeliveryAddress[];
  mapsApiKey: string;
  defaultRecipientName: string;
  onSaveAddress: (draft: Omit<DeliveryAddress, 'id' | 'updatedAt'> & { id?: string }) => Promise<DeliveryAddress>;
  onDeleteAddress: (id: string) => Promise<void>;
  onCustomRequestCreated: (req: CustomProjectRequest) => void;
  onUpdateCart: (nextCart: CartItem[]) => Promise<void>;
  onOrderCreated: (order: Order) => void;
  onOpenPayment: (order: Order) => void;
  onOpenInvoice: (order: Order) => void;
  onAiWarning: (warning: string) => void;
  subView: 'catalog' | 'cart' | 'orders';
  onChangeSubView: (view: 'catalog' | 'cart' | 'orders') => void;
  externalSearchQuery?: string;
  onExternalSearchQueryChange?: (q: string) => void;
  externalCategory?: string;
  onExternalCategoryChange?: (cat: string) => void;
  queuedCustomIntakeProductId?: string | null;
  onConsumeQueuedCustomIntake?: () => void;
  queuedOpenAddressCheckout?: boolean;
  onConsumeQueuedCheckout?: () => void;
}

export const ProjectsStoreTab: React.FC<ProjectsStoreTabProps> = ({
  products,
  cart,
  orders,
  customRequests = [],
  addresses = [],
  mapsApiKey = '',
  defaultRecipientName = '',
  onSaveAddress,
  onDeleteAddress,
  onCustomRequestCreated,
  onUpdateCart,
  onOrderCreated,
  onOpenPayment,
  onOpenInvoice,
  onAiWarning,
  subView,
  onChangeSubView,
  externalSearchQuery,
  onExternalSearchQueryChange,
  externalCategory,
  onExternalCategoryChange,
  queuedCustomIntakeProductId,
  onConsumeQueuedCustomIntake,
  queuedOpenAddressCheckout,
  onConsumeQueuedCheckout,
}) => {
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [internalCategory, setInternalCategory] = useState<string>('All');
  const searchQuery =
    externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = (next: string) => {
    setInternalSearchQuery(next);
    onExternalSearchQueryChange?.(next);
  };
  const selectedCategory =
    externalCategory !== undefined ? externalCategory : internalCategory;
  const setSelectedCategory = (next: string) => {
    setInternalCategory(next);
    onExternalCategoryChange?.(next);
  };

  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutQuoteId, setCheckoutQuoteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    addresses[0]?.id || null,
  );
  const [addressModalMode, setAddressModalMode] = useState<
    | { mode: 'select_only' }
    | { mode: 'cart' }
    | { mode: 'custom_quote'; request: CustomProjectRequest }
    | null
  >(null);
  const [intakeTarget, setIntakeTarget] = useState<{
    product: Product;
    requestType: CustomRequestType;
  } | null>(null);

  React.useEffect(() => {
    if (!queuedCustomIntakeProductId) return;
    const match = products.find((p) => p.id === queuedCustomIntakeProductId);
    if (match) {
      const kind = resolveProductKind(match);
      if (kind === 'webpage' || kind === 'other_idea') {
        setIntakeTarget({ product: match, requestType: kind });
      }
    }
    onConsumeQueuedCustomIntake?.();
  }, [queuedCustomIntakeProductId, products, onConsumeQueuedCustomIntake]);

  React.useEffect(() => {
    if (!queuedOpenAddressCheckout) return;
    if (cart.length > 0) {
      setAddressModalMode({ mode: 'cart' });
    }
    onConsumeQueuedCheckout?.();
  }, [queuedOpenAddressCheckout, cart.length, onConsumeQueuedCheckout]);

  const selectedAddress =
    addresses.find((a) => a.id === selectedAddressId) || addresses[0] || null;

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['All', ...unique];
  }, [products]);

  const filteredProducts = useMemo(
    () => filterCatalogProducts(products, searchQuery, selectedCategory),
    [products, searchQuery, selectedCategory],
  );

  const { subtotal, itemCount } = useMemo(() => calculateCartTotals(cart), [cart]);

  const handleProductAction = async (product: Product) => {
    const kind = resolveProductKind(product);
    if (kind === 'webpage' || kind === 'other_idea') {
      setIntakeTarget({ product, requestType: kind });
      return;
    }

    const resolvedImage = resolveCatalogImageUrl(product.imageUrl);
    const existing = cart.find((c) => c.productId === product.id);
    let nextCart: CartItem[];
    if (existing) {
      nextCart = cart.map((c) =>
        c.productId === product.id
          ? { ...c, quantity: Math.min(product.stock || 99, c.quantity + 1) }
          : c,
      );
    } else {
      nextCart = [
        ...cart,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: resolvedImage,
          quantity: 1,
          stock: product.stock,
        },
      ];
    }
    await onUpdateCart(nextCart);
    setFeedback(`Added "${product.name}" to cart.`);
    setTimeout(() => setFeedback(null), 2400);
  };

  const handleChangeQuantity = async (productId: string, delta: number) => {
    const nextCart = cart
      .map((item) =>
        item.productId === productId
          ? { ...item, quantity: item.quantity + delta }
          : item,
      )
      .filter((item) => item.quantity > 0);
    await onUpdateCart(nextCart);
  };

  const handleRemoveItem = async (productId: string) => {
    const nextCart = cart.filter((item) => item.productId !== productId);
    await onUpdateCart(nextCart);
  };

  const handleProceedToCheckout = async () => {
    if (cart.length === 0) {
      onAiWarning('Your cart is empty. Add at least one project or product before checking out.');
      return;
    }
    setAddressModalMode({ mode: 'cart' });
  };

  const finalizeCartCheckoutWithAddress = async (deliveryAddress: DeliveryAddress) => {
    setCheckingOut(true);
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ type: 'store', deliveryAddress }),
      });
      await onUpdateCart([]);
      onOrderCreated(res.order);
      setAddressModalMode(null);
      onChangeSubView('orders');
      onOpenPayment(res.order);
    } catch (err) {
      onAiWarning(
        err instanceof ApiError ? err.message : 'Unable to start checkout.',
      );
      throw err;
    } finally {
      setCheckingOut(false);
    }
  };

  const handlePayQuotedRequest = (req: CustomProjectRequest) => {
    setAddressModalMode({ mode: 'custom_quote', request: req });
  };

  const finalizeQuoteCheckoutWithAddress = async (
    req: CustomProjectRequest,
    deliveryAddress: DeliveryAddress,
  ) => {
    setCheckoutQuoteId(req.id);
    try {
      const res = await apiRequest<{ order: Order; request: CustomProjectRequest }>(
        `/api/custom-requests/${req.id}/checkout`,
        {
          method: 'POST',
          body: JSON.stringify({ deliveryAddress }),
        },
      );
      onCustomRequestCreated(res.request);
      onOrderCreated(res.order);
      setAddressModalMode(null);
      onChangeSubView('orders');
      onOpenPayment(res.order);
    } catch (err) {
      onAiWarning(
        err instanceof ApiError
          ? err.message
          : 'Unable to proceed to bill for this custom quote.',
      );
      throw err;
    } finally {
      setCheckoutQuoteId(null);
    }
  };

  const storeOrders = orders.filter((o) => o.type === 'store');
  const quotedReadyCount = customRequests.filter((r) => r.status === 'Quoted').length;

  const renderMyCustomRequestsCard = () => {
    if (customRequests.length === 0) return null;
    return (
      <section
        data-testid="my-custom-quotes-section"
        className="rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-lg p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#0B1F3A]">
              My Custom Webpage &amp; Project Quotes ({customRequests.length})
            </h2>
            <p className="text-xs text-slate-500">
              Private to your account · Wait up to 1 day after submitting details for Admin exact amount
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {customRequests.map((req) => (
            <div
              key={req.id}
              data-testid={`custom-quote-card-${req.id}`}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-[#0B1F3A] flex items-center gap-1">
                    {req.requestType === 'webpage' ? (
                      <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                    ) : (
                      <Lightbulb className="w-3.5 h-3.5 text-[#D4AF37]" />
                    )}
                    <span>{req.productName}</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-slate-500">#{req.id}</span>
                  <span className="text-slate-400">·</span>
                  {req.status === 'Awaiting Quote' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                      <Clock className="w-3 h-3" />
                      <span>Waiting 1 day for exact amount</span>
                    </span>
                  ) : req.status === 'Quoted' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Exact Amount Ready</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-semibold">
                      <span>Bill Created ({req.linkedOrderId})</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">{req.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  {req.contactNumber && <span>Contact: {req.contactNumber}</span>}
                  {req.backgroundTheme && <span>Theme: {req.backgroundTheme}</span>}
                  {req.sampleWebpageUrl && <span>Sample: {req.sampleWebpageUrl}</span>}
                </div>
                {req.adminNote && (
                  <p className="text-xs text-[#0B1F3A] font-medium">
                    Admin Note: {req.adminNote}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {req.status === 'Quoted' && req.quotedAmount ? (
                  <>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                        Exact Amount
                      </div>
                      <div className="font-mono text-lg font-bold text-[#0B1F3A] tabular-nums">
                        {formatINR(req.quotedAmount)}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={checkoutQuoteId === req.id}
                      onClick={() => handlePayQuotedRequest(req)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 disabled:opacity-50"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>
                        {checkoutQuoteId === req.id ? 'Creating Bill...' : 'Proceed to Bill & Pay'}
                      </span>
                    </button>
                  </>
                ) : req.status === 'Ordered' && req.quotedAmount ? (
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-700 tabular-nums">
                      {formatINR(req.quotedAmount)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onChangeSubView('orders')}
                      className="text-xs font-semibold text-[#0B1F3A] hover:underline"
                    >
                      View in My Bills
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                    Wait 1 day for Admin quote
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Store Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-5 py-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            PRIME X PROJECTS
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Browse kits &amp; custom solutions · Request webpage or project quotes before billing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeSubView('catalog')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              subView === 'catalog'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Catalog ({products.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeSubView('cart')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              subView === 'cart'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Cart ({itemCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeSubView('orders')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
              subView === 'orders'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>
              My Bills ({storeOrders.length}
              {quotedReadyCount > 0 ? ` · ${quotedReadyCount} Quote Ready` : ''})
            </span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl bg-[#D4AF37]/20 border border-[#F5C542]/50 text-[#F5C542] px-4 py-2.5 text-sm font-medium">
          {feedback}
        </div>
      )}

      {/* CATALOG VIEW */}
      {subView === 'catalog' && (
        <div className="space-y-6">
          {/* Search & Category Filter */}
          <div className="space-y-2.5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  data-testid="catalog-search-input"
                  aria-label="Search products by name or category"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name or category..."
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#F5C542]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear product search"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {categories.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white/10 border border-white/15">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-[#F5C542] text-[#0B1F3A]'
                          : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(searchQuery.trim() || selectedCategory !== 'All') && products.length > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-300 px-1">
                <span>
                  Showing <strong className="text-[#F5C542]">{filteredProducts.length}</strong> of{' '}
                  {products.length} products
                  {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
                  {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="text-[#F5C542] hover:underline font-semibold"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {renderMyCustomRequestsCard()}

          {/* Empty State */}
          {products.length === 0 ? (
            <div className="rounded-3xl bg-white/10 backdrop-blur-md border border-white/15 p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center mx-auto text-[#F5C542]">
                <PackageOpen className="w-8 h-8" />
              </div>
              <h2 className="font-display text-xl font-bold text-white">
                No products yet
              </h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Our curated PRIME X PROJECTS catalog is being prepared by the administrator. Check back soon or explore PRIME X STUDIO and LIVE CLASSES in the meantime.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl bg-white/10 border border-white/15 p-10 text-center space-y-3">
              <p className="font-display text-lg font-semibold text-white">
                No matching products found
              </p>
              <p className="text-sm text-slate-300">
                Try clearing your search or selecting another category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="px-4 py-2 rounded-xl bg-[#F5C542] text-[#0B1F3A] text-xs font-bold"
              >
                Reset Search &amp; Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => {
                const kind = resolveProductKind(product);
                const resolvedImg = resolveCatalogImageUrl(product.imageUrl);
                const isCustomIntake = kind === 'webpage' || kind === 'other_idea';
                return (
                  <article
                    key={product.id}
                    className="bg-white text-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-200 flex flex-col transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {resolvedImg ? (
                        <img
                          src={resolvedImg}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#0B1F3A] to-[#16325C] flex flex-col items-center justify-center text-[#F5C542] p-4 text-center">
                          <ShoppingBag className="w-8 h-8 mb-2 opacity-80" />
                          <span className="font-display text-sm font-semibold text-white">
                            {product.name}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <span>{product.category || 'Project'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isCustomIntake
                              ? 'Quote in 1 day'
                              : product.stock > 0
                                ? `${product.stock} in stock`
                                : 'Out of stock'}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                          {product.name}
                        </h3>
                        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                          {product.description || 'PRIME X INNOVATION engineered solution.'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                          {kind === 'other_idea' ? (
                            <span className="text-base">Custom Quote</span>
                          ) : (
                            <>
                              <span className="text-xl">{formatINR(product.price)}</span>
                              {product.priceUnit && (
                                <span className="text-xs font-sans font-medium text-slate-500 ml-1">
                                  {product.priceUnit}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!isCustomIntake && product.stock <= 0}
                          onClick={() => handleProductAction(product)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {kind === 'webpage'
                            ? 'Enter Details'
                            : kind === 'other_idea'
                              ? 'Share Idea'
                              : product.stock > 0
                                ? 'Add to Cart'
                                : 'Unavailable'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CART VIEW */}
      {subView === 'cart' && (
        <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChangeSubView('catalog')}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Back to catalog"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
                  Your Shopping Cart
                </h2>
                <p className="text-xs text-slate-500">
                  Review items and proceed to UPI checkout
                </p>
              </div>
            </div>
            <span className="font-mono text-sm font-semibold text-slate-600">
              {itemCount} item(s)
            </span>
          </div>

          {cart.length === 0 ? (
            <div className="py-10 text-center space-y-4">
              <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="font-display font-semibold text-slate-800">
                  Your cart is empty
                </p>
                <p className="text-sm text-slate-500">
                  Add products from PRIME X PROJECTS before checking out.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeSubView('catalog')}
                className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-sm font-bold"
              >
                Browse Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 divide-y divide-slate-100">
                {cart.map((item) => {
                  const cartImg = resolveCatalogImageUrl(item.imageUrl);
                  return (
                    <div
                      key={item.productId}
                      className="py-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                          {cartImg ? (
                            <img
                              src={cartImg}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#0B1F3A] flex items-center justify-center text-[#F5C542]">
                              <ShoppingBag className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {item.name}
                          </h3>
                          <div className="font-mono text-sm text-slate-500 tabular-nums">
                            {formatINR(item.price)} each
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}`}
                            onClick={() => handleChangeQuantity(item.productId, -1)}
                            className="p-2 hover:bg-slate-100 text-slate-700"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 font-mono text-sm font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}`}
                            onClick={() => handleChangeQuantity(item.productId, 1)}
                            className="p-2 hover:bg-slate-100 text-slate-700"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="w-24 text-right font-mono font-bold text-[#0B1F3A] tabular-nums">
                          {formatINR(item.price * item.quantity)}
                        </div>

                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => handleRemoveItem(item.productId)}
                          className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="lg:col-span-4 rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-4 h-fit">
                <h3 className="font-display font-bold text-slate-900">
                  Order Summary
                </h3>

                {/* Selected Delivery Address Preview */}
                <div className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B1F3A]">
                      <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Delivery Address</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddressModalMode({ mode: 'select_only' })}
                      className="text-[11px] font-bold text-[#0B1F3A] hover:underline"
                    >
                      {selectedAddress ? 'Change / Add' : 'Enter Address'}
                    </button>
                  </div>
                  {selectedAddress ? (
                    <div className="text-xs text-slate-700 space-y-0.5">
                      <div className="font-semibold text-slate-900">
                        {selectedAddress.label} · {selectedAddress.recipientName}
                      </div>
                      <div className="line-clamp-2">{selectedAddress.formattedAddress}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        Tel: {selectedAddress.contactPhone}
                      </div>
                      {typeof selectedAddress.lat === 'number' &&
                        typeof selectedAddress.lng === 'number' && (
                          <div className="font-mono text-[11px] text-emerald-700">
                            Pinned Map: {selectedAddress.lat.toFixed(4)}, {selectedAddress.lng.toFixed(4)}
                          </div>
                        )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700">
                      Select or enter a Tamil Nadu delivery address before billing.
                    </p>
                  )}
                  <div className="text-[11px] text-slate-600 pt-1.5 border-t border-slate-100">
                    {DELIVERY_SERVICE_AREA_NOTE}
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Platform Fee</span>
                    <span className="font-mono tabular-nums">₹0</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-base text-[#0B1F3A]">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">{formatINR(subtotal)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={checkingOut}
                  onClick={handleProceedToCheckout}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] font-display font-bold text-sm shadow hover:brightness-105 disabled:opacity-60"
                >
                  {checkingOut ? 'Generating Order...' : 'Select Address & Proceed to Bill'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ORDERS / BILLS VIEW */}
      {subView === 'orders' && (
        <div className="space-y-6">
          {renderMyCustomRequestsCard()}

          <div className="bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
                My Store Orders &amp; Bills
              </h2>
              <button
                type="button"
                onClick={() => onChangeSubView('catalog')}
                className="text-sm font-semibold text-[#0B1F3A] hover:underline"
              >
                Continue Shopping
              </button>
            </div>

            <OrderHistoryAnalytics
              orders={orders}
              products={products}
              onBrowseCatalog={() => onChangeSubView('catalog')}
            />

            {storeOrders.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                You have not placed any store orders yet.
              </p>
            ) : (
              <div className="space-y-4">
                {storeOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                        <span className="font-bold text-[#0B1F3A]">#{order.id}</span>
                        <span>·</span>
                        <span>{new Date(order.createdAt).toLocaleString('en-IN')}</span>
                        <span>·</span>
                        <span className="font-semibold text-slate-800">{order.status}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-800">
                        {order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')}
                      </div>
                      {order.deliveryAddress && (
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#D4AF37] shrink-0" />
                            <span>
                              {order.deliveryAddress.label}: {order.deliveryAddress.formattedAddress} ({order.deliveryAddress.contactPhone})
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 pl-4">
                            Manufactured at {MANUFACTURING_ORIGIN}
                            {typeof order.deliveryAddress.lat === 'number' &&
                            typeof order.deliveryAddress.lng === 'number'
                              ? ` · Pin: ${order.deliveryAddress.lat.toFixed(4)}, ${order.deliveryAddress.lng.toFixed(4)}`
                              : ''}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-lg text-[#0B1F3A] tabular-nums">
                        {formatINR(order.totalAmount)}
                      </span>
                      {order.status !== 'Verified' && order.status !== 'Completed' && (
                        <button
                          type="button"
                          onClick={() => onOpenPayment(order)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Pay / Upload</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenInvoice(order)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Bill PDF</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {intakeTarget && (
        <CustomProjectRequestModal
          product={intakeTarget.product}
          requestType={intakeTarget.requestType}
          onClose={() => setIntakeTarget(null)}
          onSubmitted={(req) => {
            onCustomRequestCreated(req);
            setFeedback(
              'Details delivered to Admin Portal. Please wait for 1 day (24 hours) for your exact amount.',
            );
          }}
        />
      )}

      {addressModalMode && (
        <AddressSelectorModal
          mapsApiKey={mapsApiKey}
          addresses={addresses}
          selectedAddressId={selectedAddress?.id || null}
          defaultRecipientName={defaultRecipientName}
          actionLabel={
            addressModalMode.mode === 'select_only'
              ? 'Use Selected Delivery Address'
              : 'Confirm Address & Proceed to Bill'
          }
          onSaveAddress={async (draft) => {
            const saved = await onSaveAddress(draft);
            setSelectedAddressId(saved.id);
            return saved;
          }}
          onDeleteAddress={onDeleteAddress}
          onConfirmAddress={async (confirmedAddr) => {
            setSelectedAddressId(confirmedAddr.id);
            if (addressModalMode.mode === 'cart') {
              await finalizeCartCheckoutWithAddress(confirmedAddr);
            } else if (addressModalMode.mode === 'custom_quote') {
              await finalizeQuoteCheckoutWithAddress(
                addressModalMode.request,
                confirmedAddr,
              );
            } else {
              setAddressModalMode(null);
            }
          }}
          onClose={() => setAddressModalMode(null)}
        />
      )}
    </div>
  );
};

