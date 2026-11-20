import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  LogOut,
  Package,
  Plus,
  Receipt,
  Shield,
  Trash2,
  Users,
  X,
  XCircle,
  Edit3,
  Bell,
  Copy,
  ExternalLink,
  MessageCircle,
  UserPlus,
  Globe,
  Lightbulb,
  Clock,
} from 'lucide-react';
import {
  buildWhatsAppUrl,
  formatINR,
  summarizeCourseAttendance,
  validatePaymentFile,
} from '../lib/domainLogic';
import { apiRequest, ApiError, fileToBase64 } from '../utils/api';
import {
  cacheProductImage,
  getCachedProductImages,
  loadPersistedProducts,
  savePersistedProducts,
} from '../utils/catalogPersistence';
import { downloadSalesReportPdf } from '../utils/pdfGenerator';
import type {
  AdminNotification,
  AdminPublicInfo,
  AttendanceStatus,
  Course,
  CustomProjectRequest,
  Enrollment,
  Order,
  Product,
  UserSession,
} from '../types';

interface AdminPortalProps {
  user: UserSession;
  onViewAsCustomer: () => void;
  onLogout: () => void;
  onDataChanged: () => void;
  onOpenLiveClassroom?: (courseId: string) => void;
}

type AdminSection =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'quotes'
  | 'courses'
  | 'reports'
  | 'admins';

interface OverviewResponse {
  stats: {
    todayOrdersCount: number;
    todayTotalSales: number;
    pendingPayments: number;
    verifiedPayments: number;
    newStudentsCount: number;
    activeCoursesCount: number;
  };
  orders: Order[];
  courses: Course[];
  enrollments: Enrollment[];
  customRequests: CustomProjectRequest[];
  notifications: AdminNotification[];
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  user,
  onViewAsCustomer,
  onLogout,
  onDataChanged,
  onOpenLiveClassroom,
}) => {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [admins, setAdmins] = useState<AdminPublicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Product Form State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState('Hardware');
  const [prodStock, setProdStock] = useState('10');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [uploadingProdImg, setUploadingProdImg] = useState(false);

  // Course Form State
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseInstructor, setCourseInstructor] = useState('');
  const [courseSchedule, setCourseSchedule] = useState('');
  const [courseFee, setCourseFee] = useState('');
  const [courseLink, setCourseLink] = useState('');
  const [courseWhatsapp, setCourseWhatsapp] = useState('');
  const [copiedCourseUrlId, setCopiedCourseUrlId] = useState<string | null>(null);
  const [studentDrafts, setStudentDrafts] = useState<
    Record<string, { name: string; email: string; attendance: AttendanceStatus }>
  >({});

  // Extra Admin Form State
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPasscode, setNewAdminPasscode] = useState('');
  const [passcodeDrafts, setPasscodeDrafts] = useState<Record<string, string>>({});

  // Order Screenshot Inspection Modal
  const [inspectOrder, setInspectOrder] = useState<Order | null>(null);

  // Custom Quote Drafts (per request ID)
  const [quoteDrafts, setQuoteDrafts] = useState<
    Record<string, { amount: string; note: string }>
  >({});

  // Report Date Range
  const todayIso = new Date().toISOString().slice(0, 10);
  const [reportStart, setReportStart] = useState(todayIso);
  const [reportEnd, setReportEnd] = useState(todayIso);

  const loadAllAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, pr] = await Promise.all([
        apiRequest<OverviewResponse>('/api/admin/overview'),
        apiRequest<{ products: Product[] }>('/api/products'),
      ]);
      setOverview(ov);

      let loadedProducts = pr.products;
      if (loadedProducts.length === 0) {
        const { products: saved, explicitlyCleared } = loadPersistedProducts();
        if (!explicitlyCleared && saved.length > 0) {
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
          loadedProducts = restored.products;
          onDataChanged();
        }
      } else {
        savePersistedProducts(loadedProducts, false);
      }

      setProducts(loadedProducts);

      if (user.isSuperAdmin) {
        const adm = await apiRequest<{ admins: AdminPublicInfo[] }>('/api/admin/admins');
        setAdmins(adm.admins);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdminData();
  }, [user.isSuperAdmin]);

  const showToast = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(null), 3200);
  };

  // ==================== PRODUCT HANDLERS ====================
  const resetProductForm = () => {
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdCategory('Hardware');
    setProdStock('10');
    setProdImageUrl('');
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validatePaymentFile({ type: file.type, size: file.size });
    if (!check.valid) {
      setError(check.error || 'Invalid product image.');
      return;
    }
    setUploadingProdImg(true);
    try {
      const base64Image = await fileToBase64(file);
      const res = await apiRequest<{ url: string }>('/api/uploads/image', {
        method: 'POST',
        body: JSON.stringify({
          base64Image,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      cacheProductImage(res.url, base64Image);
      setProdImageUrl(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Image upload failed.');
    } finally {
      setUploadingProdImg(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        name: prodName,
        description: prodDesc,
        price: Number(prodPrice),
        category: prodCategory,
        stock: Number(prodStock),
        imageUrl: prodImageUrl,
      };
      if (editingProductId) {
        const updated = await apiRequest<{ product: Product }>(
          `/api/products/${editingProductId}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
        );
        const nextList = products.map((p) =>
          p.id === editingProductId ? updated.product : p,
        );
        savePersistedProducts(nextList, false);
        showToast('Product updated.');
      } else {
        const created = await apiRequest<{ product: Product }>('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const nextList = [created.product, ...products];
        savePersistedProducts(nextList, false);
        showToast('Product added to PRIME X PROJECTS.');
      }
      resetProductForm();
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save product.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
      const remaining = products.filter((p) => p.id !== id);
      savePersistedProducts(remaining, remaining.length === 0);
      showToast('Product deleted.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete product.');
    }
  };

  // ==================== COURSE HANDLERS ====================
  const resetCourseForm = () => {
    setEditingCourseId(null);
    setCourseTitle('');
    setCourseDesc('');
    setCourseInstructor('');
    setCourseSchedule('');
    setCourseFee('');
    setCourseLink('');
    setCourseWhatsapp('');
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        title: courseTitle,
        description: courseDesc,
        instructor: courseInstructor,
        schedule: courseSchedule,
        fee: Number(courseFee),
        meetingLink: courseLink.trim(),
        whatsappNumber: courseWhatsapp.trim(),
      };
      if (editingCourseId) {
        await apiRequest(`/api/courses/${editingCourseId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Course updated.');
      } else {
        await apiRequest('/api/courses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Live class course created.');
      }
      resetCourseForm();
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save course.');
    }
  };

  const handleRemoveCourseExternalUrl = async (courseId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}`, {
        method: 'PUT',
        body: JSON.stringify({ meetingLink: '' }),
      });
      if (editingCourseId === courseId) {
        setCourseLink('');
      }
      showToast('External class URL removed. Built-in Live Class URL remains active.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove class URL.');
    }
  };

  const handleAddCourseStudent = async (courseId: string) => {
    const draft = studentDrafts[courseId] || {
      name: '',
      email: '',
      attendance: 'present' as AttendanceStatus,
    };
    if (!draft.name.trim()) {
      setError('Please enter a student name.');
      return;
    }
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/students`, {
        method: 'POST',
        body: JSON.stringify({
          studentName: draft.name.trim(),
          studentEmail: draft.email.trim() || undefined,
          attendance: draft.attendance,
        }),
      });
      setStudentDrafts((prev) => ({
        ...prev,
        [courseId]: { name: '', email: '', attendance: 'present' },
      }));
      showToast(`Added ${draft.name.trim()} to course roster.`);
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add student.');
    }
  };

  const handleSetCourseAttendance = async (
    courseId: string,
    enrollmentId: string,
    attendance: AttendanceStatus,
  ) => {
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/attendance/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ attendance }),
      });
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update attendance.');
    }
  };

  const handleRemoveCourseStudent = async (courseId: string, enrollmentId: string) => {
    setError(null);
    try {
      await apiRequest(`/api/courses/${courseId}/students/${enrollmentId}`, {
        method: 'DELETE',
      });
      showToast('Student removed from course.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove student.');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    try {
      await apiRequest(`/api/courses/${id}`, { method: 'DELETE' });
      showToast('Course deleted.');
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete course.');
    }
  };

  // ==================== ORDER HANDLERS ====================
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: Order['status'],
  ) => {
    setError(null);
    try {
      const res = await apiRequest<{ order: Order }>(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (inspectOrder?.id === orderId) setInspectOrder(res.order);
      showToast(`Order ${orderId} marked as ${status}.`);
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update order.');
    }
  };

  // ==================== CUSTOM QUOTE HANDLER ====================
  const handleSendCustomQuote = async (requestId: string, defaultAmount?: number) => {
    const draft = quoteDrafts[requestId];
    const rawAmt = Number(draft?.amount ?? defaultAmount ?? 0);
    if (!Number.isFinite(rawAmt) || rawAmt <= 0) {
      setError('Please enter a valid exact quote amount greater than ₹0.');
      return;
    }
    setError(null);
    try {
      const res = await apiRequest<{ request: CustomProjectRequest }>(
        `/api/admin/custom-requests/${requestId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            quotedAmount: rawAmt,
            adminNote: draft?.note || '',
          }),
        },
      );
      showToast(
        `Quote ${formatINR(res.request.quotedAmount || rawAmt)} delivered exclusively to ${res.request.customerName}.`,
      );
      await loadAllAdminData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send custom quote.');
    }
  };

  // ==================== ADMIN MANAGEMENT HANDLERS ====================
  const handleAddExtraAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          email: newAdminEmail,
          name: newAdminName,
          passcode: newAdminPasscode,
        }),
      });
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPasscode('');
      showToast('Extra admin added.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add admin.');
    }
  };

  const handleChangeAdminPasscode = async (id: string) => {
    const nextCode = passcodeDrafts[id] || '';
    if (nextCode.trim().length < 4) {
      setError('New passcode must be at least 4 characters.');
      return;
    }
    try {
      await apiRequest(`/api/admin/admins/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ passcode: nextCode }),
      });
      setPasscodeDrafts((prev) => ({ ...prev, [id]: '' }));
      showToast('Admin passcode updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update passcode.');
    }
  };

  const handleRemoveExtraAdmin = async (id: string) => {
    try {
      await apiRequest(`/api/admin/admins/${id}`, { method: 'DELETE' });
      showToast('Extra admin removed.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove admin.');
    }
  };

  const pendingCustomQuotes = (overview?.customRequests || []).filter(
    (r) => r.status === 'Awaiting Quote',
  );

  const navItems: { id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: Receipt },
    {
      id: 'quotes',
      label:
        pendingCustomQuotes.length > 0
          ? `Custom Quotes (${pendingCustomQuotes.length})`
          : 'Custom Quotes',
      icon: MessageCircle,
    },
    { id: 'courses', label: 'Courses', icon: BookOpen },
    { id: 'reports', label: 'Sales Reports', icon: Download },
    ...(user.isSuperAdmin
      ? [{ id: 'admins' as const, label: 'Admin Management', icon: Shield }]
      : []),
  ];

  const unreadNotifs = (overview?.notifications || []).filter((n) => !n.read);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#08172C]/95 backdrop-blur-md border-b border-[#D4AF37]/30 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <span className="font-display text-lg font-bold text-[#F5C542] whitespace-nowrap shrink-0">
          PRIME X INNOVATION
        </span>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onViewAsCustomer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold whitespace-nowrap transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>View as Customer</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/20 text-slate-200 hover:bg-white/10 text-xs font-semibold whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 space-y-2">
          <div className="rounded-2xl bg-[#0D2342]/80 border border-white/10 p-3 space-y-1">
            <div className="px-3.5 py-2 text-xs font-display font-bold uppercase tracking-wider text-[#F5C542]/90">
              Admin Control Center
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                    section === item.id
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A]'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-9 space-y-6">
          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-red-950/70 border border-red-400/40 text-red-200 text-sm"
            >
              {error}
            </div>
          )}

          {banner && (
            <div className="p-3.5 rounded-xl bg-[#D4AF37]/20 border border-[#F5C542]/50 text-[#F5C542] text-sm font-medium">
              {banner}
            </div>
          )}

          {loading && !overview ? (
            <div className="rounded-2xl bg-white/10 p-10 text-center text-slate-300 text-sm">
              Loading admin workspace...
            </div>
          ) : (
            <>
              {/* DASHBOARD SECTION */}
              {section === 'dashboard' && overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      {
                        label: "Today's Orders",
                        value: String(overview.stats.todayOrdersCount),
                      },
                      {
                        label: "Today's Total Sales",
                        value: formatINR(overview.stats.todayTotalSales),
                      },
                      {
                        label: 'Pending Payments',
                        value: String(overview.stats.pendingPayments),
                      },
                      {
                        label: 'Verified Payments',
                        value: String(overview.stats.verifiedPayments),
                      },
                      {
                        label: 'Paid Students',
                        value: String(overview.stats.newStudentsCount),
                      },
                      {
                        label: 'Active Courses',
                        value: String(overview.stats.activeCoursesCount),
                      },
                    ].map((kpi) => (
                      <div
                        key={kpi.label}
                        className="bg-white text-slate-900 rounded-2xl p-5 shadow border border-slate-200"
                      >
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {kpi.label}
                        </div>
                        <div className="font-mono text-2xl font-bold text-[#0B1F3A] mt-2 tabular-nums">
                          {kpi.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Notifications */}
                  <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-display font-bold text-[#0B1F3A]">
                        <Bell className="w-4 h-4 text-[#D4AF37]" />
                        <span>
                          Payment & Verification Activity ({unreadNotifs.length} unread)
                        </span>
                      </div>
                      {unreadNotifs.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest('/api/admin/notifications/read', {
                              method: 'POST',
                            });
                            await loadAllAdminData();
                          }}
                          className="text-xs font-semibold text-[#0B1F3A] hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {overview.notifications.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No payment notifications yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {overview.notifications.slice(0, 6).map((n) => (
                          <div
                            key={n.id}
                            className="py-2.5 flex items-center justify-between gap-3 text-sm"
                          >
                            <span className={n.read ? 'text-slate-600' : 'font-semibold text-slate-900'}>
                              {n.message}
                            </span>
                            <span className="text-xs font-mono text-slate-400 shrink-0">
                              {new Date(n.createdAt).toLocaleTimeString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PRODUCTS MANAGEMENT */}
              {section === 'products' && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleSaveProduct}
                    className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4"
                  >
                    <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                      {editingProductId ? 'Edit Product' : 'Add New Product'}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="prod-name" className="block text-xs font-semibold text-slate-700 mb-1">
                          Product Name
                        </label>
                        <input
                          id="prod-name"
                          type="text"
                          required
                          value={prodName}
                          onChange={(e) => setProdName(e.target.value)}
                          placeholder="e.g., Prime IoT Core Kit"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="prod-cat" className="block text-xs font-semibold text-slate-700 mb-1">
                          Category
                        </label>
                        <input
                          id="prod-cat"
                          type="text"
                          required
                          value={prodCategory}
                          onChange={(e) => setProdCategory(e.target.value)}
                          placeholder="Hardware, Robotics, Software..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="prod-price" className="block text-xs font-semibold text-slate-700 mb-1">
                          Price (INR ₹)
                        </label>
                        <input
                          id="prod-price"
                          type="number"
                          min={1}
                          required
                          value={prodPrice}
                          onChange={(e) => setProdPrice(e.target.value)}
                          placeholder="2499"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>

                      <div>
                        <label htmlFor="prod-stock" className="block text-xs font-semibold text-slate-700 mb-1">
                          Stock Quantity
                        </label>
                        <input
                          id="prod-stock"
                          type="number"
                          min={0}
                          required
                          value={prodStock}
                          onChange={(e) => setProdStock(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="prod-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                        Description
                      </label>
                      <textarea
                        id="prod-desc"
                        rows={2}
                        value={prodDesc}
                        onChange={(e) => setProdDesc(e.target.value)}
                        placeholder="Key specs and features..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div>
                        <label htmlFor="prod-img-url" className="block text-xs font-semibold text-slate-700 mb-1">
                          Image URL (or upload below)
                        </label>
                        <input
                          id="prod-img-url"
                          type="text"
                          value={prodImageUrl}
                          onChange={(e) => setProdImageUrl(e.target.value)}
                          placeholder="/api/uploads/..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Upload Product Image (Max 5 MB)
                        </label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleProductImageUpload}
                          className="text-xs text-slate-600"
                        />
                        {uploadingProdImg && (
                          <span className="text-xs text-amber-600">Uploading...</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{editingProductId ? 'Update Product' : 'Add Product'}</span>
                      </button>
                      {editingProductId && (
                        <button
                          type="button"
                          onClick={resetProductForm}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-600"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Product List */}
                  <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4">
                    <h3 className="font-display font-bold text-[#0B1F3A]">
                      Store Catalog ({products.length})
                    </h3>
                    {products.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No products added yet. Use the form above to publish your first product.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {products.map((p) => (
                          <div
                            key={p.id}
                            className="py-3 flex flex-wrap items-center justify-between gap-4"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{p.name}</div>
                              <div className="text-xs text-slate-500">
                                {p.category} · Stock: {p.stock} ·{' '}
                                <span className="font-mono font-semibold text-[#0B1F3A]">
                                  {formatINR(p.price)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingProductId(p.id);
                                  setProdName(p.name);
                                  setProdDesc(p.description);
                                  setProdPrice(String(p.price));
                                  setProdCategory(p.category);
                                  setProdStock(String(p.stock));
                                  setProdImageUrl(p.imageUrl);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(p.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ORDERS MANAGEMENT */}
              {section === 'orders' && overview && (
                <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4">
                  <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                    Orders & Payment Verification ({overview.orders.length})
                  </h2>

                  {overview.orders.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      No customer orders yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                            <th className="py-2.5 pr-3">Order</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3">Amount</th>
                            <th className="py-2.5 px-3">AI Verdict</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 pl-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {overview.orders.map((o) => (
                            <tr key={o.id}>
                              <td className="py-3 pr-3 font-mono text-xs font-bold text-[#0B1F3A]">
                                {o.id}
                                <div className="text-[11px] font-sans font-normal text-slate-500">
                                  {o.type === 'studio_4k'
                                    ? 'Studio 4K (₹10)'
                                    : o.type === 'studio_premium'
                                      ? 'Studio Pro (₹49/mo)'
                                      : o.type === 'game_download'
                                        ? 'Game Download (₹10)'
                                        : o.type === 'course'
                                          ? 'Live Class'
                                          : 'Store'}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium text-slate-900">{o.customerName}</div>
                                <div className="text-xs text-slate-500">{o.customerEmail}</div>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold tabular-nums">
                                {formatINR(o.totalAmount)}
                              </td>
                              <td className="py-3 px-3 text-xs">
                                {o.aiVerification ? (
                                  <div>
                                    <div className="font-semibold">{o.aiVerification.verdict}</div>
                                    {o.aiVerification.suspiciousDuplicate && (
                                      <div className="text-red-600 font-semibold">
                                        Duplicate Flagged
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">Awaiting upload</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-xs font-semibold">{o.status}</td>
                              <td className="py-3 pl-3 text-right space-x-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setInspectOrder(o)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Inspect
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(o.id, 'Verified')}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(o.id, 'Rejected')}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                                >
                                  Reject
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* CUSTOM QUOTES MANAGEMENT (WEBPAGES & OTHER IDEAS) */}
              {section === 'quotes' && overview && (
                <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                        Custom Webpage &amp; Project Idea Quotes ({(overview.customRequests || []).length})
                      </h2>
                      <p className="text-xs text-slate-500">
                        Review customer specifications and enter the exact INR amount — delivered privately only to the requesting user.
                      </p>
                    </div>
                  </div>

                  {(overview.customRequests || []).length === 0 ? (
                    <p className="text-sm text-slate-500 py-8 text-center">
                      No custom webpage or project idea requests submitted yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {(overview.customRequests || []).map((req) => {
                        const draft = quoteDrafts[req.id] || {
                          amount: req.quotedAmount ? String(req.quotedAmount) : '',
                          note: req.adminNote || '',
                        };
                        return (
                          <div
                            key={req.id}
                            data-testid={`admin-quote-row-${req.id}`}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-bold text-[#0B1F3A] flex items-center gap-1">
                                    {req.requestType === 'webpage' ? (
                                      <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                                    ) : (
                                      <Lightbulb className="w-3.5 h-3.5 text-[#D4AF37]" />
                                    )}
                                    <span>{req.productName}</span>
                                  </span>
                                  <span className="font-mono text-slate-400">#{req.id}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-semibold ${
                                      req.status === 'Awaiting Quote'
                                        ? 'bg-amber-100 text-amber-800'
                                        : req.status === 'Quoted'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-sky-100 text-sky-800'
                                    }`}
                                  >
                                    {req.status}
                                  </span>
                                </div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {req.customerName}{' '}
                                  <span className="font-normal text-xs text-slate-500">
                                    ({req.customerEmail})
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs font-mono text-slate-400">
                                {new Date(req.createdAt).toLocaleString('en-IN')}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-white rounded-lg p-3 border border-slate-200">
                              <div>
                                <span className="font-semibold text-slate-500 block">
                                  Contact Number
                                </span>
                                <span className="font-mono text-slate-900">
                                  {req.contactNumber || 'Not provided'}
                                </span>
                              </div>
                              {req.requestType === 'webpage' && (
                                <div>
                                  <span className="font-semibold text-slate-500 block">
                                    Background Theme
                                  </span>
                                  <span className="text-slate-900">
                                    {req.backgroundTheme || '—'}
                                  </span>
                                </div>
                              )}
                              <div className="md:col-span-2">
                                <span className="font-semibold text-slate-500 block">
                                  {req.requestType === 'webpage'
                                    ? 'Webpage Description'
                                    : 'Project Details'}
                                </span>
                                <p className="text-slate-800 mt-0.5 leading-relaxed">
                                  {req.description}
                                </p>
                              </div>
                              {req.requestType === 'webpage' && (
                                <div className="md:col-span-2">
                                  <span className="font-semibold text-slate-500 block">
                                    Sample Web Page (Optional)
                                  </span>
                                  <span className="text-slate-700">
                                    {req.sampleWebpageUrl || 'None provided'}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-end gap-3 pt-1">
                              <div>
                                <label
                                  htmlFor={`quote-amt-${req.id}`}
                                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                                >
                                  Exact Amount for {req.customerName} (INR ₹)
                                </label>
                                <input
                                  id={`quote-amt-${req.id}`}
                                  type="number"
                                  min={1}
                                  disabled={req.status === 'Ordered'}
                                  value={draft.amount}
                                  onChange={(e) =>
                                    setQuoteDrafts((prev) => ({
                                      ...prev,
                                      [req.id]: { ...draft, amount: e.target.value },
                                    }))
                                  }
                                  placeholder="e.g., 7999"
                                  className="w-40 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono"
                                />
                              </div>

                              <div className="flex-1 min-w-[180px]">
                                <label
                                  htmlFor={`quote-note-${req.id}`}
                                  className="block text-[11px] font-semibold text-slate-700 mb-1"
                                >
                                  Delivery / Quote Note (Optional)
                                </label>
                                <input
                                  id={`quote-note-${req.id}`}
                                  type="text"
                                  disabled={req.status === 'Ordered'}
                                  value={draft.note}
                                  onChange={(e) =>
                                    setQuoteDrafts((prev) => ({
                                      ...prev,
                                      [req.id]: { ...draft, note: e.target.value },
                                    }))
                                  }
                                  placeholder="Timeline or breakdown note..."
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                                />
                              </div>

                              {req.status !== 'Ordered' ? (
                                <button
                                  type="button"
                                  onClick={() => handleSendCustomQuote(req.id, req.quotedAmount)}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>
                                    {req.status === 'Quoted' ? 'Update Quote' : 'Send Amount to User'}
                                  </span>
                                </button>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-xs font-semibold text-sky-800">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Bill Generated ({req.linkedOrderId})</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* COURSES MANAGEMENT */}
              {section === 'courses' && overview && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleSaveCourse}
                    className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4"
                  >
                    <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                      {editingCourseId ? 'Edit Live Class Course' : 'Add Live Class Course'}
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="crs-title" className="block text-xs font-semibold text-slate-700 mb-1">
                          Course Title
                        </label>
                        <input
                          id="crs-title"
                          type="text"
                          required
                          value={courseTitle}
                          onChange={(e) => setCourseTitle(e.target.value)}
                          placeholder="e.g., Full-Stack AI Systems Cohort"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="crs-inst" className="block text-xs font-semibold text-slate-700 mb-1">
                          Instructor
                        </label>
                        <input
                          id="crs-inst"
                          type="text"
                          required
                          value={courseInstructor}
                          onChange={(e) => setCourseInstructor(e.target.value)}
                          placeholder="Instructor Name"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="crs-sched" className="block text-xs font-semibold text-slate-700 mb-1">
                          Schedule
                        </label>
                        <input
                          id="crs-sched"
                          type="text"
                          required
                          value={courseSchedule}
                          onChange={(e) => setCourseSchedule(e.target.value)}
                          placeholder="Sat & Sun · 7:00 PM IST"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="crs-fee" className="block text-xs font-semibold text-slate-700 mb-1">
                          Fee (INR ₹)
                        </label>
                        <input
                          id="crs-fee"
                          type="number"
                          min={1}
                          required
                          value={courseFee}
                          onChange={(e) => setCourseFee(e.target.value)}
                          placeholder="1999"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="crs-link" className="block text-xs font-semibold text-slate-700 mb-1">
                          External Live Class URL (Optional — can be removed anytime)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="crs-link"
                            type="url"
                            value={courseLink}
                            onChange={(e) => setCourseLink(e.target.value)}
                            placeholder="Optional external Meet / Zoom link"
                            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                          />
                          {courseLink && (
                            <button
                              type="button"
                              onClick={() => setCourseLink('')}
                              className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 shrink-0"
                            >
                              Remove URL
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="crs-whatsapp" className="block text-xs font-semibold text-slate-700 mb-1">
                          Contact WhatsApp Number
                        </label>
                        <input
                          id="crs-whatsapp"
                          type="tel"
                          value={courseWhatsapp}
                          onChange={(e) => setCourseWhatsapp(e.target.value)}
                          placeholder="e.g., 9080397469"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="crs-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                        Course Description
                      </label>
                      <textarea
                        id="crs-desc"
                        rows={2}
                        value={courseDesc}
                        onChange={(e) => setCourseDesc(e.target.value)}
                        placeholder="What students will build and learn..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{editingCourseId ? 'Update Course' : 'Publish Course'}</span>
                      </button>
                      {editingCourseId && (
                        <button
                          type="button"
                          onClick={resetCourseForm}
                          className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-600"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4">
                    <h3 className="font-display font-bold text-[#0B1F3A]">
                      Courses, Live Class URLs &amp; Attendance ({overview.courses.length})
                    </h3>
                    {overview.courses.length === 0 ? (
                      <p className="text-sm text-slate-500">No courses created yet.</p>
                    ) : (
                      <div className="space-y-5">
                        {overview.courses.map((c) => {
                          const courseStudents = overview.enrollments.filter(
                            (e) =>
                              e.courseId === c.id &&
                              (e.status === 'Verified' || e.status === 'Completed'),
                          );
                          const attSummary = summarizeCourseAttendance(courseStudents);
                          const liveClassUrl =
                            typeof window !== 'undefined'
                              ? `${window.location.origin}/?liveClass=${c.id}`
                              : `/?liveClass=${c.id}`;
                          const waUrl = buildWhatsAppUrl(c.whatsappNumber);
                          const draft = studentDrafts[c.id] || {
                            name: '',
                            email: '',
                            attendance: 'present' as AttendanceStatus,
                          };

                          return (
                            <div
                              key={c.id}
                              className="rounded-xl border border-slate-200 p-4 space-y-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="font-bold text-[#0B1F3A]">{c.title}</div>
                                  <div className="text-xs text-slate-500">
                                    {c.instructor} · {c.schedule} ·{' '}
                                    <span className="font-mono font-semibold text-slate-900">
                                      {formatINR(c.fee)}
                                    </span>
                                  </div>
                                  {c.whatsappNumber && (
                                    <div className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1.5">
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      <span>WhatsApp: {c.whatsappNumber}</span>
                                      {waUrl && (
                                        <a
                                          href={waUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="underline font-semibold"
                                        >
                                          Open Chat
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCourseId(c.id);
                                      setCourseTitle(c.title);
                                      setCourseDesc(c.description);
                                      setCourseInstructor(c.instructor);
                                      setCourseSchedule(c.schedule);
                                      setCourseFee(String(c.fee));
                                      setCourseLink(c.meetingLink || '');
                                      setCourseWhatsapp(c.whatsappNumber || '');
                                    }}
                                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCourse(c.id)}
                                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              {/* Live Class URL & Optional External Link */}
                              <div className="rounded-lg bg-[#0B1F3A]/5 border border-[#D4AF37]/30 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                      Live Class URL (Attendance &amp; Students Room)
                                    </div>
                                    <div className="font-mono text-xs text-[#0B1F3A] truncate">
                                      {liveClassUrl}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard?.writeText(liveClassUrl);
                                        setCopiedCourseUrlId(c.id);
                                        setTimeout(() => setCopiedCourseUrlId(null), 1800);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold"
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>
                                        {copiedCourseUrlId === c.id ? 'Copied' : 'Copy URL'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onOpenLiveClassroom?.(c.id)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-[#F5C542] text-xs font-bold"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>Open Live Class</span>
                                    </button>
                                  </div>
                                </div>

                                {c.meetingLink && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs">
                                    <span className="text-slate-600 truncate">
                                      External URL: <span className="font-mono">{c.meetingLink}</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCourseExternalUrl(c.id)}
                                      className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-semibold hover:bg-red-100"
                                    >
                                      Remove External URL
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Attendance Summary & Add Student */}
                              <div className="text-xs bg-slate-50 rounded-lg p-3.5 border border-slate-200 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                                    <span>Students &amp; Attendance ({courseStudents.length})</span>
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-600">
                                    Present: {attSummary.presentNames.length} · Absent:{' '}
                                    {attSummary.absentNames.length}
                                  </div>
                                </div>

                                {/* Add Student Inline Form */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                  <input
                                    type="text"
                                    aria-label={`New student name for ${c.title}`}
                                    placeholder="New student name"
                                    value={draft.name}
                                    onChange={(e) =>
                                      setStudentDrafts((prev) => ({
                                        ...prev,
                                        [c.id]: { ...draft, name: e.target.value },
                                      }))
                                    }
                                    className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                  <input
                                    type="email"
                                    aria-label={`New student email for ${c.title}`}
                                    placeholder="Email (optional)"
                                    value={draft.email}
                                    onChange={(e) =>
                                      setStudentDrafts((prev) => ({
                                        ...prev,
                                        [c.id]: { ...draft, email: e.target.value },
                                      }))
                                    }
                                    className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  />
                                  <select
                                    aria-label={`Initial attendance for ${c.title}`}
                                    value={draft.attendance}
                                    onChange={(e) =>
                                      setStudentDrafts((prev) => ({
                                        ...prev,
                                        [c.id]: {
                                          ...draft,
                                          attendance: e.target.value as AttendanceStatus,
                                        },
                                      }))
                                    }
                                    className="sm:col-span-2 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                                  >
                                    <option value="present">Present</option>
                                    <option value="absent">Absent</option>
                                    <option value="unmarked">Unmarked</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => handleAddCourseStudent(c.id)}
                                    className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    <span>Add Student</span>
                                  </button>
                                </div>

                                {/* Present / Absent Name Breakdown */}
                                {courseStudents.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-emerald-900">
                                      <strong>Present:</strong>{' '}
                                      {attSummary.presentNames.length > 0
                                        ? attSummary.presentNames.join(', ')
                                        : 'None'}
                                    </div>
                                    <div className="rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-red-900">
                                      <strong>Absent:</strong>{' '}
                                      {attSummary.absentNames.length > 0
                                        ? attSummary.absentNames.join(', ')
                                        : 'None'}
                                    </div>
                                  </div>
                                )}

                                {courseStudents.length === 0 ? (
                                  <span className="block text-slate-400">
                                    No students yet. Add a student above or wait for verified enrollments.
                                  </span>
                                ) : (
                                  <div className="divide-y divide-slate-200/70">
                                    {courseStudents.map((st) => (
                                      <div
                                        key={st.id}
                                        className="py-2 flex flex-wrap items-center justify-between gap-2"
                                      >
                                        <div>
                                          <span className="font-semibold text-slate-800">
                                            {st.studentName}
                                          </span>{' '}
                                          <span className="text-slate-500">({st.studentEmail})</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleSetCourseAttendance(c.id, st.id, 'present')
                                            }
                                            className={`px-2 py-1 rounded text-[11px] font-bold ${
                                              st.attendance === 'present'
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-emerald-50 text-emerald-700'
                                            }`}
                                          >
                                            Present
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleSetCourseAttendance(c.id, st.id, 'absent')
                                            }
                                            className={`px-2 py-1 rounded text-[11px] font-bold ${
                                              st.attendance === 'absent'
                                                ? 'bg-red-600 text-white'
                                                : 'bg-red-50 text-red-700'
                                            }`}
                                          >
                                            Absent
                                          </button>
                                          <button
                                            type="button"
                                            aria-label={`Remove ${st.studentName}`}
                                            onClick={() => handleRemoveCourseStudent(c.id, st.id)}
                                            className="p-1 text-slate-400 hover:text-red-600"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SALES REPORTS */}
              {section === 'reports' && overview && (
                <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                        Sales Reports (PDF)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Export today&apos;s verified sales or generate a custom date-range PDF breakdown.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadSalesReportPdf(
                          overview.orders,
                          todayIso,
                          todayIso,
                          "Today's Sales Report",
                        )
                      }
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow hover:brightness-105"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Today&apos;s Sales Report as PDF</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label htmlFor="rep-start" className="block text-xs font-semibold text-slate-700 mb-1">
                        Start Date
                      </label>
                      <input
                        id="rep-start"
                        type="date"
                        value={reportStart}
                        onChange={(e) => setReportStart(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="rep-end" className="block text-xs font-semibold text-slate-700 mb-1">
                        End Date
                      </label>
                      <input
                        id="rep-end"
                        type="date"
                        value={reportEnd}
                        onChange={(e) => setReportEnd(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadSalesReportPdf(
                          overview.orders,
                          reportStart,
                          reportEnd,
                          'Date-Range Sales Report',
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-sm font-bold hover:bg-[#16325C]"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Date-Range PDF</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ADMIN MANAGEMENT (SUPER ADMIN ONLY) */}
              {section === 'admins' && user.isSuperAdmin && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleAddExtraAdmin}
                    className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-4"
                  >
                    <div>
                      <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                        Admin Management (Super Admin)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Add up to 2 extra administrators, each with a separate email and security passcode.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="adm-name" className="block text-xs font-semibold text-slate-700 mb-1">
                          Admin Name
                        </label>
                        <input
                          id="adm-name"
                          type="text"
                          required
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          placeholder="Name"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="adm-email" className="block text-xs font-semibold text-slate-700 mb-1">
                          Email
                        </label>
                        <input
                          id="adm-email"
                          type="email"
                          required
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          placeholder="admin@primex.in"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor="adm-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                          Passcode (min 4 chars)
                        </label>
                        <input
                          id="adm-pass"
                          type="password"
                          required
                          minLength={4}
                          value={newAdminPasscode}
                          onChange={(e) => setNewAdminPasscode(e.target.value)}
                          placeholder="Passcode"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Extra Admin</span>
                    </button>
                  </form>

                  <div className="bg-white text-slate-900 rounded-2xl p-6 shadow border border-slate-200 space-y-3">
                    <h3 className="font-display font-bold text-[#0B1F3A]">
                      Configured Administrators ({admins.length}/3)
                    </h3>
                    <div className="divide-y divide-slate-100">
                      {admins.map((adm) => (
                        <div
                          key={adm.id}
                          className="py-3 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">
                              {adm.name}{' '}
                              <span className="text-xs font-normal text-slate-500">
                                ({adm.isSuperAdmin ? 'Super Admin' : 'Extra Admin'})
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-600">{adm.email}</div>
                          </div>

                          {!adm.isSuperAdmin && (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="password"
                                aria-label={`New passcode for ${adm.email}`}
                                placeholder="New passcode"
                                value={passcodeDrafts[adm.id] || ''}
                                onChange={(e) =>
                                  setPasscodeDrafts((prev) => ({
                                    ...prev,
                                    [adm.id]: e.target.value,
                                  }))
                                }
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono w-32"
                              />
                              <button
                                type="button"
                                onClick={() => handleChangeAdminPasscode(adm.id)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Update Passcode
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveExtraAdmin(adm.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Inspect Order & Screenshot Lightbox */}
      {inspectOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-order-title"
          className="fixed inset-0 z-50 bg-[#050F1E]/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-xl bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
              <h3 id="inspect-order-title" className="font-display font-bold text-[#F5C542]">
                Inspect Payment · #{inspectOrder.id}
              </h3>
              <button
                type="button"
                aria-label="Close inspection dialog"
                onClick={() => setInspectOrder(null)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between text-sm">
                <div>
                  <div className="font-bold">{inspectOrder.customerName}</div>
                  <div className="text-xs text-slate-500">{inspectOrder.customerEmail}</div>
                </div>
                <div className="text-right font-mono font-bold text-lg text-[#0B1F3A]">
                  {formatINR(inspectOrder.totalAmount)}
                </div>
              </div>

              {inspectOrder.deliveryAddress && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-0.5">
                  <div className="font-bold text-[#0B1F3A]">
                    Delivery Address ({inspectOrder.deliveryAddress.label}) · {inspectOrder.deliveryAddress.recipientName}
                  </div>
                  <div className="text-slate-700">{inspectOrder.deliveryAddress.formattedAddress}</div>
                  <div className="font-mono text-slate-500">
                    Contact: {inspectOrder.deliveryAddress.contactPhone}
                    {inspectOrder.deliveryAddress.landmark ? ` · Landmark: ${inspectOrder.deliveryAddress.landmark}` : ''}
                  </div>
                  {typeof inspectOrder.deliveryAddress.lat === 'number' &&
                    typeof inspectOrder.deliveryAddress.lng === 'number' && (
                      <div className="font-mono text-emerald-700">
                        Pinned Map GPS: {inspectOrder.deliveryAddress.lat.toFixed(5)}, {inspectOrder.deliveryAddress.lng.toFixed(5)}
                      </div>
                    )}
                  <div className="text-[11px] font-semibold text-slate-600">
                    Dispatch Origin: Coimbatore, Tamil Nadu → Tamil Nadu Delivery
                  </div>
                </div>
              )}

              {inspectOrder.aiVerification && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
                  <div className="font-bold text-slate-900">
                    AI Result: {inspectOrder.aiVerification.verdict}
                  </div>
                  <p className="text-slate-600">{inspectOrder.aiVerification.summary}</p>
                  <div className="font-mono text-slate-700 pt-1">
                    UTR: {inspectOrder.aiVerification.utrId || 'None'} · Extracted:{' '}
                    {inspectOrder.aiVerification.extractedAmount !== null
                      ? formatINR(inspectOrder.aiVerification.extractedAmount)
                      : 'N/A'}
                  </div>
                  {inspectOrder.aiVerification.suspiciousDuplicate && (
                    <div className="text-red-600 font-bold">
                      ⚠ {inspectOrder.aiVerification.duplicateReason}
                    </div>
                  )}
                  {inspectOrder.aiVerification.isWrongPayment && (
                    <div className="text-red-700 font-semibold">
                      Notice: Wrong payment is not responsible on PRIME X INNOVATION.
                    </div>
                  )}
                </div>
              )}

              {inspectOrder.screenshotUrl ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex justify-center">
                  <img
                    src={inspectOrder.screenshotUrl}
                    alt="Customer UPI Payment Screenshot"
                    referrerPolicy="no-referrer"
                    className="max-h-72 object-contain"
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No payment screenshot uploaded yet.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => handleUpdateOrderStatus(inspectOrder.id, 'Rejected')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateOrderStatus(inspectOrder.id, 'Verified')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve (Verified)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateOrderStatus(inspectOrder.id, 'Completed')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-xs font-bold"
                >
                  <span>Mark Completed</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
