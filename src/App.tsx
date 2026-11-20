/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, ShieldCheck, ShoppingCart } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { WelcomeTransition } from './components/WelcomeTransition';
import { AdminPasscodeScreen } from './components/AdminPasscodeScreen';
import { ProjectsStoreTab } from './components/ProjectsStoreTab';
import { PrimeXStudioTab } from './components/PrimeXStudioTab';
import { MusicStudioTab } from './components/MusicStudioTab';
import { GameCreatorTab } from './components/GameCreatorTab';
import { LiveClassesTab } from './components/LiveClassesTab';
import { PaymentModal } from './components/PaymentModal';
import { InvoiceModal } from './components/InvoiceModal';
import { AdminPortal } from './components/AdminPortal';
import { LiveClassroomView } from './components/LiveClassroomView';
import { AiAssistantWidget } from './components/AiAssistantWidget';
import { calculateCartTotals, resolveProductKind } from './lib/domainLogic';
import { resolveProductMatch } from './lib/jarvisLogic';
import { apiRequest, setStoredAuthToken } from './utils/api';
import { resolveCatalogImageUrl } from './utils/catalogImages';
import {
  getCachedProductImages,
  loadPersistedProducts,
  savePersistedProducts,
} from './utils/catalogPersistence';
import type {
  CartItem,
  Course,
  CustomProjectRequest,
  DeliveryAddress,
  GameProject,
  GeneratedMusicTrack,
  HomeTab,
  JarvisAction,
  Order,
  Product,
  UserSession,
} from './types';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserSession | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [viewAsCustomer, setViewAsCustomer] = useState(false);

  const [activeTab, setActiveTab] = useState<HomeTab>('projects');
  const [storeSubView, setStoreSubView] = useState<'catalog' | 'cart' | 'orders'>('catalog');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [storeCategory, setStoreCategory] = useState('All');
  const [queuedCustomIntakeProductId, setQueuedCustomIntakeProductId] = useState<string | null>(
    null,
  );
  const [queuedOpenAddressCheckout, setQueuedOpenAddressCheckout] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomProjectRequest[]>([]);
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [musicTracks, setMusicTracks] = useState<GeneratedMusicTrack[]>([]);
  const [gameProjects, setGameProjects] = useState<GameProject[]>([]);
  const [queuedStudioAudio, setQueuedStudioAudio] = useState<{
    id: string;
    title: string;
    audioUrl: string;
    durationSeconds?: number;
  } | null>(null);
  const [queuedMusicLyricsDraft, setQueuedMusicLyricsDraft] = useState<{
    id: number;
    text: string;
  } | null>(null);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '',
  );
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [activePaymentOrder, setActivePaymentOrder] = useState<Order | null>(null);
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<Order | null>(null);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [liveClassId, setLiveClassId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('liveClass');
  });

  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  // Google Maps Case A Quota Exceeded Global Listener
  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Load Google Maps runtime config if Vite build-time env var wasn't set
  useEffect(() => {
    if (mapsApiKey) return;
    apiRequest<{ apiKey: string }>('/api/config/maps')
      .then((res) => {
        if (res.apiKey) setMapsApiKey(res.apiKey);
      })
      .catch(() => {});
  }, [mapsApiKey]);

  useEffect(() => {
    const onPopState = () => {
      setLiveClassId(new URLSearchParams(window.location.search).get('liveClass'));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openLiveClassroom = useCallback((courseId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('liveClass', courseId);
    window.history.pushState({}, '', url.toString());
    setLiveClassId(courseId);
  }, []);

  const closeLiveClassroom = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('liveClass');
    window.history.pushState({}, '', url.toString());
    setLiveClassId(null);
  }, []);

  const loadCustomerWorkspaceData = useCallback(async () => {
    try {
      const [
        prodRes,
        cartRes,
        ordRes,
        crsRes,
        customReqRes,
        addrRes,
        tracksRes,
        gamesRes,
      ] = await Promise.all([
        apiRequest<{ products: Product[] }>('/api/products'),
        apiRequest<{ items: CartItem[] }>('/api/cart'),
        apiRequest<{ orders: Order[] }>('/api/orders/my'),
        apiRequest<{ courses: Course[] }>('/api/courses'),
        apiRequest<{ requests: CustomProjectRequest[] }>('/api/custom-requests/my'),
        apiRequest<{ addresses: DeliveryAddress[] }>('/api/addresses'),
        apiRequest<{ tracks: GeneratedMusicTrack[] }>('/api/music/tracks'),
        apiRequest<{ games: GameProject[] }>('/api/games'),
      ]);
      let resolvedProducts = prodRes.products;
      if (resolvedProducts.length > 0) {
        savePersistedProducts(resolvedProducts, false);
      } else {
        const { products: saved, explicitlyCleared } = loadPersistedProducts();
        if (!explicitlyCleared && saved.length > 0) {
          if (user?.adminPasscodeVerified) {
            const restored = await apiRequest<{ products: Product[] }>(
              '/api/products/restore',
              {
                method: 'POST',
                body: JSON.stringify({
                  products: saved,
                  imageMap: getCachedProductImages(),
                }),
              },
            );
            resolvedProducts = restored.products;
          } else {
            resolvedProducts = saved;
          }
        }
      }
      setProducts(resolvedProducts);
      setCart(cartRes.items);
      setOrders(ordRes.orders);
      setCourses(crsRes.courses);
      setCustomRequests(customReqRes.requests);
      setAddresses(addrRes.addresses || []);
      setMusicTracks(tracksRes.tracks || []);
      setGameProjects(gamesRes.games || []);
    } catch {
      // Ignored if unauthenticated
    }
  }, [user?.adminPasscodeVerified]);

  // Persistent session auto-restore on mount
  useEffect(() => {
    apiRequest<{ user: UserSession | null }>('/api/auth/me')
      .then((res) => {
        if (res.user) {
          setUser(res.user);
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (user && (!user.isAdminAccount || user.adminPasscodeVerified)) {
      loadCustomerWorkspaceData();
    }
  }, [user, loadCustomerWorkspaceData]);

  const handleAuthenticated = (loggedUser: UserSession) => {
    setUser(loggedUser);
    setViewAsCustomer(false);
    if (!isAutostart && !loggedUser.isAdminAccount) {
      setShowWelcome(true);
    }
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredAuthToken(null);
    setUser(null);
    setShowWelcome(false);
    setViewAsCustomer(false);
    setProducts([]);
    setCart([]);
    setOrders([]);
    setCourses([]);
    setCustomRequests([]);
    setAddresses([]);
    setMusicTracks([]);
    setGameProjects([]);
    setAiWarnings([]);
  };

  const handleUpdateCart = useCallback(async (nextCart: CartItem[]) => {
    setCart(nextCart);
    try {
      const res = await apiRequest<{ items: CartItem[] }>('/api/cart', {
        method: 'PUT',
        body: JSON.stringify({ items: nextCart }),
      });
      setCart(res.items);
    } catch {
      // Keep local fallback if transient network issue
    }
  }, []);

  const executeJarvisActions = useCallback(
    async (actions: JarvisAction[]): Promise<string[]> => {
      const completedLabels: string[] = [];
      let workingCart = [...cart];

      const tabLabelMap: Record<HomeTab, string> = {
        projects: 'PRIME X PROJECTS',
        studio: 'PRIME X STUDIO',
        music: 'MUSIC STUDIO',
        games: 'GAME STUDIO',
        classes: 'LIVE CLASSES',
      };

      for (const action of actions) {
        if (action.type === 'navigate_tab') {
          setActiveTab(action.tab);
          completedLabels.push(`Opened ${tabLabelMap[action.tab]}`);
        } else if (action.type === 'set_store_view') {
          setActiveTab('projects');
          setStoreSubView(action.subView);
          completedLabels.push(
            action.subView === 'cart'
              ? 'Opened Shopping Cart'
              : action.subView === 'orders'
                ? 'Opened My Orders & Bills'
                : 'Opened Store Catalog',
          );
        } else if (action.type === 'filter_catalog') {
          setActiveTab('projects');
          setStoreSubView('catalog');
          if (action.searchQuery !== undefined) {
            setStoreSearchQuery(action.searchQuery);
          }
          if (action.category !== undefined) {
            setStoreCategory(action.category || 'All');
          }
          completedLabels.push(
            `Filtered catalog${action.searchQuery ? ` for "${action.searchQuery}"` : ''}${action.category ? ` (${action.category})` : ''}`,
          );
        } else if (action.type === 'clear_catalog_filters') {
          setActiveTab('projects');
          setStoreSubView('catalog');
          setStoreSearchQuery('');
          setStoreCategory('All');
          completedLabels.push('Cleared catalog search filters');
        } else if (action.type === 'order_product') {
          setActiveTab('projects');
          const matched = resolveProductMatch(products, action.productQuery);
          if (!matched) {
            setStoreSubView('catalog');
            setStoreSearchQuery(action.productQuery);
            completedLabels.push(`Searched catalog for "${action.productQuery}"`);
            continue;
          }

          const kind = resolveProductKind(matched);
          if (kind === 'webpage' || kind === 'other_idea') {
            setStoreSubView('catalog');
            setQueuedCustomIntakeProductId(matched.id);
            completedLabels.push(`Opened details form for ${matched.name}`);
            continue;
          }

          const qtyToAdd = Math.max(1, Math.min(matched.stock || 99, action.quantity || 1));
          const resolvedImg = resolveCatalogImageUrl(matched.imageUrl);
          const existing = workingCart.find((c) => c.productId === matched.id);
          if (existing) {
            workingCart = workingCart.map((c) =>
              c.productId === matched.id
                ? { ...c, quantity: Math.min(matched.stock || 99, c.quantity + qtyToAdd) }
                : c,
            );
          } else {
            workingCart = [
              ...workingCart,
              {
                productId: matched.id,
                name: matched.name,
                price: matched.price,
                imageUrl: resolvedImg,
                quantity: qtyToAdd,
                stock: matched.stock,
              },
            ];
          }
          await handleUpdateCart(workingCart);
          if (action.openCart !== false || action.openCheckout) {
            setStoreSubView('cart');
          }
          if (action.openCheckout) {
            setQueuedOpenAddressCheckout(true);
            completedLabels.push(
              `Added ${qtyToAdd} × ${matched.name} & opened Address Checkout`,
            );
          } else {
            completedLabels.push(`Added ${qtyToAdd} × ${matched.name} to Cart`);
          }
        } else if (action.type === 'open_address_checkout') {
          setActiveTab('projects');
          setStoreSubView('cart');
          if (workingCart.length > 0) {
            setQueuedOpenAddressCheckout(true);
            completedLabels.push('Opened Delivery Address & Billing');
          } else {
            completedLabels.push('Opened Cart (add a kit before billing)');
          }
        }
      }

      return completedLabels;
    },
    [cart, products, handleUpdateCart],
  );

  const handleSaveAddress = async (
    draft: Omit<DeliveryAddress, 'id' | 'updatedAt'> & { id?: string },
  ): Promise<DeliveryAddress> => {
    const res = await apiRequest<{
      address: DeliveryAddress;
      addresses: DeliveryAddress[];
    }>('/api/addresses', {
      method: 'POST',
      body: JSON.stringify(draft),
    });
    setAddresses(res.addresses || []);
    return res.address;
  };

  const handleDeleteAddress = async (id: string) => {
    const res = await apiRequest<{ addresses: DeliveryAddress[] }>(
      `/api/addresses/${id}`,
      { method: 'DELETE' },
    );
    setAddresses(res.addresses || []);
  };

  const handleOrderUpdated = (updated: Order) => {
    setOrders((prev) => [updated, ...prev.filter((o) => o.id !== updated.id)]);
    setActivePaymentOrder(updated);
    loadCustomerWorkspaceData();
  };

  const pushAiWarning = useCallback((warning: string) => {
    setAiWarnings((prev) =>
      prev.includes(warning) ? prev : [...prev.slice(-4), warning],
    );
  }, []);

  const { itemCount } = useMemo(() => calculateCartTotals(cart), [cart]);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#D4AF37]/30 border-t-[#F5C542] animate-spin mx-auto" />
          <div className="font-display text-sm font-semibold text-[#F5C542]">
            PRIME X INNOVATION
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  // Admin email logged in -> require backend-verified passcode before entering Admin Portal
  if (user.isAdminAccount && !user.adminPasscodeVerified) {
    return (
      <AdminPasscodeScreen
        user={user}
        onVerified={(verifiedUser) => {
          setUser(verifiedUser);
          if (!isAutostart) setShowWelcome(true);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (showWelcome) {
    return (
      <WelcomeTransition
        name={user.name}
        onComplete={() => setShowWelcome(false)}
      />
    );
  }

  // Built-in Live Classroom URL (?liveClass=<courseId>)
  if (liveClassId) {
    return (
      <>
        <LiveClassroomView
          courseId={liveClassId}
          onExit={closeLiveClassroom}
        />
        <AiAssistantWidget
          activeTabLabel="Live Classroom"
          warnings={aiWarnings}
          onClearWarnings={() => setAiWarnings([])}
        />
      </>
    );
  }

  // Verified Admin Portal (completely hidden and unreachable for customers)
  if (user.adminPasscodeVerified && !viewAsCustomer) {
    return (
      <>
        <AdminPortal
          user={user}
          onViewAsCustomer={() => setViewAsCustomer(true)}
          onLogout={handleLogout}
          onDataChanged={loadCustomerWorkspaceData}
          onOpenLiveClassroom={openLiveClassroom}
        />
        <AiAssistantWidget
          activeTabLabel="Admin Portal"
          warnings={aiWarnings}
          onClearWarnings={() => setAiWarnings([])}
        />
      </>
    );
  }

  // Customer Portal Home Page (Five Tabs)
  const tabs: { id: HomeTab; label: string }[] = [
    { id: 'projects', label: 'PRIME X PROJECTS' },
    { id: 'studio', label: 'PRIME X STUDIO' },
    { id: 'music', label: 'MUSIC STUDIO' },
    { id: 'games', label: 'GAME STUDIO' },
    { id: 'classes', label: 'LIVE CLASSES' },
  ];

  const activeTabLabel =
    tabs.find((t) => t.id === activeTab)?.label || 'PRIME X PROJECTS';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Mandatory Case A Google Maps Demo Quota Exceeded Banner */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#08172C]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-3 sm:gap-6">
          {/* Zone 1: Gold Brand Wordmark */}
          <div className="font-display text-base sm:text-lg font-bold tracking-wide text-[#F5C542] whitespace-nowrap shrink-0">
            PRIME X INNOVATION
          </div>

          {/* Zone 2: Navigation Tabs (Desktop & Tablet) */}
          <nav
            aria-label="Primary sections"
            className="hidden lg:flex items-center gap-5"
          >
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`py-2 text-xs font-display font-bold tracking-wide border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'text-[#F5C542] border-[#F5C542]'
                      : 'text-slate-300 border-transparent hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Actions (Cart + Admin return ONLY if verified admin + Logout) */}
          <div className="flex items-center gap-2 shrink-0">
            {user.adminPasscodeVerified && (
              <button
                type="button"
                onClick={() => setViewAsCustomer(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37]/20 border border-[#F5C542]/50 text-[#F5C542] text-xs font-bold whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin Portal</span>
              </button>
            )}

            <button
              type="button"
              aria-label={`Open shopping cart with ${itemCount} items`}
              onClick={() => {
                setActiveTab('projects');
                setStoreSubView('cart');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-[#F5C542]" />
              <span className="font-mono tabular-nums">{itemCount}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 hover:bg-white/10 text-slate-200 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile / Compact Tab Strip */}
        <nav
          aria-label="Mobile sections"
          className="lg:hidden flex items-center justify-between overflow-x-auto border-t border-white/10 px-2 gap-1"
        >
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`py-2.5 px-2.5 text-[11px] font-display font-bold border-b-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-[#F5C542] border-[#F5C542]'
                    : 'text-slate-300 border-transparent'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-24">
        {activeTab === 'projects' && (
          <ProjectsStoreTab
            products={products}
            cart={cart}
            orders={orders}
            customRequests={customRequests}
            addresses={addresses}
            mapsApiKey={mapsApiKey}
            defaultRecipientName={user.name}
            onSaveAddress={handleSaveAddress}
            onDeleteAddress={handleDeleteAddress}
            onCustomRequestCreated={(req) =>
              setCustomRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)])
            }
            onUpdateCart={handleUpdateCart}
            onOrderCreated={(order) =>
              setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])
            }
            onOpenPayment={(order) => setActivePaymentOrder(order)}
            onOpenInvoice={(order) => setActiveInvoiceOrder(order)}
            onAiWarning={pushAiWarning}
            subView={storeSubView}
            onChangeSubView={setStoreSubView}
            externalSearchQuery={storeSearchQuery}
            onExternalSearchQueryChange={setStoreSearchQuery}
            externalCategory={storeCategory}
            onExternalCategoryChange={setStoreCategory}
            queuedCustomIntakeProductId={queuedCustomIntakeProductId}
            onConsumeQueuedCustomIntake={() => setQueuedCustomIntakeProductId(null)}
            queuedOpenAddressCheckout={queuedOpenAddressCheckout}
            onConsumeQueuedCheckout={() => setQueuedOpenAddressCheckout(false)}
          />
        )}

        {activeTab === 'studio' && (
          <PrimeXStudioTab
            orders={orders}
            onOrderCreated={(order) =>
              setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])
            }
            onOpenPayment={(order) => setActivePaymentOrder(order)}
            onOpenInvoice={(order) => setActiveInvoiceOrder(order)}
            onAiWarning={pushAiWarning}
            queuedExternalAudio={queuedStudioAudio}
            onConsumeQueuedAudio={() => setQueuedStudioAudio(null)}
            onSendTranscriptToMusic={(text) => {
              setQueuedMusicLyricsDraft({ id: Date.now(), text });
              setActiveTab('music');
            }}
          />
        )}

        {activeTab === 'music' && (
          <MusicStudioTab
            tracks={musicTracks}
            onTrackCreated={(track) =>
              setMusicTracks((prev) => [track, ...prev.filter((t) => t.id !== track.id)])
            }
            onTrackDeleted={(id) =>
              setMusicTracks((prev) => prev.filter((t) => t.id !== id))
            }
            onSendToStudio={(track) => {
              setQueuedStudioAudio({
                id: track.id,
                title: track.title,
                audioUrl: track.audioUrl,
                durationSeconds: track.durationSeconds,
              });
              setActiveTab('studio');
            }}
            onAiWarning={pushAiWarning}
            externalLyricsDraft={queuedMusicLyricsDraft}
            onConsumeExternalLyricsDraft={() => setQueuedMusicLyricsDraft(null)}
          />
        )}

        {activeTab === 'games' && (
          <GameCreatorTab
            games={gameProjects}
            orders={orders}
            onGameSaved={(game) =>
              setGameProjects((prev) => [game, ...prev.filter((g) => g.id !== game.id)])
            }
            onGameDeleted={(id) =>
              setGameProjects((prev) => prev.filter((g) => g.id !== id))
            }
            onOrderCreated={(order) =>
              setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])
            }
            onOpenPayment={(order) => setActivePaymentOrder(order)}
            onAiWarning={pushAiWarning}
          />
        )}

        {activeTab === 'classes' && (
          <LiveClassesTab
            courses={courses}
            orders={orders}
            onOrderCreated={(order) =>
              setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)])
            }
            onOpenPayment={(order) => setActivePaymentOrder(order)}
            onOpenClassroom={openLiveClassroom}
            onAiWarning={pushAiWarning}
          />
        )}
      </main>

      {/* UPI Payment & Gemini Vision Modal */}
      {activePaymentOrder && (
        <PaymentModal
          order={activePaymentOrder}
          onClose={() => setActivePaymentOrder(null)}
          onOrderUpdated={handleOrderUpdated}
          onOpenInvoice={(ord) => {
            setActivePaymentOrder(null);
            setActiveInvoiceOrder(ord);
          }}
          onAiWarning={pushAiWarning}
        />
      )}

      {/* Bill / Invoice Modal */}
      {activeInvoiceOrder && (
        <InvoiceModal
          order={activeInvoiceOrder}
          onClose={() => setActiveInvoiceOrder(null)}
        />
      )}

      {/* Always-Active Floating JARVIS Live AI Assistant */}
      <AiAssistantWidget
        activeTabLabel={activeTabLabel}
        warnings={aiWarnings}
        onClearWarnings={() => setAiWarnings([])}
        onExecuteActions={executeJarvisActions}
      />
    </div>
  );
}
