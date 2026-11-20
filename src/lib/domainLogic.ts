import type {
  AIVerificationResult,
  AIVerificationVerdict,
  AdminRecord,
  CartItem,
  Course,
  CustomProjectRequest,
  CustomRequestType,
  Enrollment,
  Order,
  OrderStatus,
  Product,
  ProductKind,
} from '../types';

export const SUPER_ADMIN_EMAIL = 'psatya3421@gmail.com';
export const ADMIN_PAYMENT_UPI_NUMBER = '9080397469';
export const MANUFACTURING_ORIGIN = 'Coimbatore, Tamil Nadu';
export const DELIVERY_SERVICE_AREA_NOTE =
  'Deliverable ONLY within Tamil Nadu · All projects are manufactured at Coimbatore.';
export const WRONG_PAYMENT_NOTICE =
  'Wrong payment is not responsible on PRIME X INNOVATION. Verify the exact INR amount and official UPI number (9080397469) before paying.';
export const GAME_DOWNLOAD_FEE_INR = 10;
export const MAX_EXTRA_ADMINS = 2;
export const MAX_PASSCODE_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function calculateCartTotals(items: CartItem[]): { subtotal: number; itemCount: number } {
  let subtotal = 0;
  let itemCount = 0;
  for (const item of items) {
    const qty = Math.max(0, Math.floor(item.quantity));
    const price = Math.max(0, item.price);
    subtotal += qty * price;
    itemCount += qty;
  }
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    itemCount,
  };
}

export function validatePaymentFile(file: { type: string; size: number }): {
  valid: boolean;
  error?: string;
} {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Only PNG, JPG, or WEBP image screenshots are accepted.',
    };
  }
  if (file.size <= 0) {
    return {
      valid: false,
      error: 'The uploaded screenshot file is empty.',
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      valid: false,
      error: 'Screenshot exceeds the 5 MB upload limit. Please compress or crop the image.',
    };
  }
  return { valid: true };
}

export function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\D/g, '').slice(-10);
}

export interface RawAIExtraction {
  extractedAmount: number | null;
  dateTime: string | null;
  status: 'success' | 'failed' | 'unknown';
  receiverNumber: string | null;
  utrId: string | null;
  summary: string;
  confidence: number;
}

export function evaluatePaymentVerification(
  raw: RawAIExtraction,
  expectedAmount: number,
  existingUtrs: string[],
  imageHash: string,
  existingHashes: string[],
): {
  result: AIVerificationResult;
  nextStatus: OrderStatus;
} {
  const normalizedUtr = raw.utrId ? raw.utrId.trim().toUpperCase() : null;
  const duplicateUtr = Boolean(
    normalizedUtr &&
      existingUtrs.some((u) => u.trim().toUpperCase() === normalizedUtr),
  );
  const duplicateImage = Boolean(
    imageHash && existingHashes.some((h) => h === imageHash),
  );
  const suspiciousDuplicate = duplicateUtr || duplicateImage;

  const receiverDigits = normalizePhoneDigits(raw.receiverNumber);
  const receiverMatches = receiverDigits === ADMIN_PAYMENT_UPI_NUMBER;

  let verdict: AIVerificationVerdict = 'Unclear screenshot';
  if (raw.extractedAmount !== null && Number.isFinite(raw.extractedAmount)) {
    const diff = Math.abs(raw.extractedAmount - expectedAmount);
    if (diff <= 0.5) {
      verdict = 'Amount matches';
    } else {
      verdict = 'Amount mismatch';
    }
  }

  let duplicateReason: string | undefined;
  if (duplicateUtr && duplicateImage) {
    duplicateReason = 'Both this screenshot image and UTR/transaction ID have already been submitted.';
  } else if (duplicateUtr) {
    duplicateReason = `Transaction/UTR ID ${normalizedUtr} has already been used on a previous order.`;
  } else if (duplicateImage) {
    duplicateReason = 'An identical payment screenshot was already uploaded on a previous order.';
  }

  const canAutoVerify =
    verdict === 'Amount matches' &&
    raw.status === 'success' &&
    receiverMatches &&
    !suspiciousDuplicate &&
    raw.confidence >= 0.7;

  const isWrongPayment =
    verdict === 'Amount mismatch' ||
    verdict === 'Unclear screenshot' ||
    !receiverMatches ||
    raw.status === 'failed' ||
    suspiciousDuplicate;

  const nextStatus: OrderStatus = canAutoVerify ? 'Verified' : 'Needs Admin Review';
  const baseSummary = raw.summary || 'Screenshot analyzed.';
  const summaryWithNotice =
    isWrongPayment && !baseSummary.toLowerCase().includes('not responsible')
      ? `${baseSummary} Notice: Wrong payment is not responsible on PRIME X INNOVATION.`
      : baseSummary;

  return {
    result: {
      verdict,
      extractedAmount: raw.extractedAmount,
      dateTime: raw.dateTime,
      status: raw.status,
      receiverNumber: raw.receiverNumber,
      receiverMatches,
      utrId: normalizedUtr,
      suspiciousDuplicate,
      duplicateReason,
      isWrongPayment,
      summary: summaryWithNotice,
      confidence: raw.confidence,
    },
    nextStatus,
  };
}

export function checkAdminLockoutState(
  record: Pick<AdminRecord, 'failedAttempts' | 'lockedUntil'>,
  now: number,
): { locked: boolean; remainingMs: number; attemptsLeft: number } {
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      locked: true,
      remainingMs: record.lockedUntil - now,
      attemptsLeft: 0,
    };
  }
  const activeAttempts = record.lockedUntil && record.lockedUntil <= now ? 0 : record.failedAttempts;
  return {
    locked: false,
    remainingMs: 0,
    attemptsLeft: Math.max(0, MAX_PASSCODE_ATTEMPTS - activeAttempts),
  };
}

export function computeNextFailedAttemptState(
  currentFailedAttempts: number,
  currentLockedUntil: number | null,
  now: number,
): { failedAttempts: number; lockedUntil: number | null; lockedNow: boolean; attemptsLeft: number } {
  const baseline = currentLockedUntil && currentLockedUntil <= now ? 0 : currentFailedAttempts;
  const nextAttempts = baseline + 1;
  if (nextAttempts >= MAX_PASSCODE_ATTEMPTS) {
    return {
      failedAttempts: nextAttempts,
      lockedUntil: now + LOCKOUT_DURATION_MS,
      lockedNow: true,
      attemptsLeft: 0,
    };
  }
  return {
    failedAttempts: nextAttempts,
    lockedUntil: null,
    lockedNow: false,
    attemptsLeft: MAX_PASSCODE_ATTEMPTS - nextAttempts,
  };
}

export function canAddExtraAdmin(
  admins: Pick<AdminRecord, 'email' | 'isSuperAdmin'>[],
  requesterEmail: string,
  candidateEmail: string,
): { allowed: boolean; reason?: string } {
  if (requesterEmail.trim().toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { allowed: false, reason: 'Only the Super Admin can manage administrator accounts.' };
  }
  const cleanCandidate = candidateEmail.trim().toLowerCase();
  if (!cleanCandidate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanCandidate)) {
    return { allowed: false, reason: 'Please enter a valid admin email address.' };
  }
  if (admins.some((a) => a.email.toLowerCase() === cleanCandidate)) {
    return { allowed: false, reason: 'This email is already registered as an admin.' };
  }
  const extraCount = admins.filter((a) => !a.isSuperAdmin).length;
  if (extraCount >= MAX_EXTRA_ADMINS) {
    return {
      allowed: false,
      reason: `Maximum of ${MAX_EXTRA_ADMINS} extra admins reached. Remove an existing extra admin first.`,
    };
  }
  return { allowed: true };
}

export function sanitizeCoursesForUser(
  courses: Course[],
  userEnrollments: Enrollment[],
  isVerifiedAdmin: boolean,
): Course[] {
  return courses.map((course) => {
    const enrollment = userEnrollments.find((e) => e.courseId === course.id);
    const hasPaidAccess =
      enrollment?.status === 'Verified' || enrollment?.status === 'Completed';

    const sanitized: Course = {
      id: course.id,
      title: course.title,
      description: course.description,
      instructor: course.instructor,
      schedule: course.schedule,
      fee: course.fee,
      whatsappNumber: course.whatsappNumber,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      isEnrolled: Boolean(hasPaidAccess),
      enrollmentStatus: enrollment ? enrollment.status : null,
    };

    if (isVerifiedAdmin || hasPaidAccess) {
      sanitized.meetingLink = course.meetingLink;
    }

    return sanitized;
  });
}

export function filterOrdersByDateRange(
  orders: Order[],
  startDateIso: string,
  endDateIso: string,
): {
  orders: Order[];
  totalSales: number;
  verifiedCount: number;
  pendingCount: number;
} {
  const startMs = new Date(`${startDateIso}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${endDateIso}T23:59:59.999Z`).getTime();

  const matched = orders.filter((order) => {
    const createdMs = new Date(order.createdAt).getTime();
    return createdMs >= startMs && createdMs <= endMs;
  });

  const paidOrders = matched.filter(
    (o) => o.status === 'Verified' || o.status === 'Completed',
  );
  const totalSales = paidOrders.reduce((acc, o) => acc + o.totalAmount, 0);
  const pendingCount = matched.filter(
    (o) =>
      o.status === 'Pending Payment' ||
      o.status === 'Payment Submitted' ||
      o.status === 'Needs Admin Review',
  ).length;

  return {
    orders: matched,
    totalSales: Math.round(totalSales * 100) / 100,
    verifiedCount: paidOrders.length,
    pendingCount,
  };
}

export function buildWhatsAppUrl(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

export function summarizeCourseAttendance(enrollments: Enrollment[]): {
  presentNames: string[];
  absentNames: string[];
  unmarkedCount: number;
} {
  const presentNames: string[] = [];
  const absentNames: string[] = [];
  let unmarkedCount = 0;

  for (const enr of enrollments) {
    if (enr.attendance === 'present') {
      presentNames.push(enr.studentName);
    } else if (enr.attendance === 'absent') {
      absentNames.push(enr.studentName);
    } else {
      unmarkedCount += 1;
    }
  }

  return { presentNames, absentNames, unmarkedCount };
}

export interface OrderCategoryPoint {
  category: string;
  totalAmount: number;
  verifiedAmount: number;
  orderCount: number;
  itemCount: number;
}

export interface OrderTimeSeriesPoint {
  dateKey: string;
  label: string;
  amount: number;
  verifiedAmount: number;
  cumulativeAmount: number;
  orderCount: number;
}

export interface UserOrderMetrics {
  totalOrders: number;
  totalSpend: number;
  verifiedSpend: number;
  averageOrderValue: number;
  topCategory: string;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatShortDateLabel(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthLabel = SHORT_MONTHS[monthIdx] || parts[1];
  return `${day} ${monthLabel}`;
}

export function resolveOrderCategoryLabel(
  orderType: Order['type'],
  productCategory?: string,
): string {
  if (orderType === 'course') return 'Live Classes';
  if (orderType === 'game_download') return 'Game Downloads';
  if (orderType === 'studio_4k' || orderType === 'studio_premium') return 'Studio Pro & 4K';
  const clean = (productCategory || '').trim();
  return clean || 'Store Projects';
}

export function aggregateOrderHistoryByCategory(
  orders: Order[],
  products: { id: string; category: string }[],
): OrderCategoryPoint[] {
  const productCategoryMap = new Map<string, string>();
  for (const prod of products) {
    if (prod.id && prod.category) {
      productCategoryMap.set(prod.id, prod.category.trim());
    }
  }

  const map = new Map<
    string,
    {
      totalAmount: number;
      verifiedAmount: number;
      orderIds: Set<string>;
      itemCount: number;
    }
  >();

  const ensureBucket = (category: string) => {
    let bucket = map.get(category);
    if (!bucket) {
      bucket = {
        totalAmount: 0,
        verifiedAmount: 0,
        orderIds: new Set<string>(),
        itemCount: 0,
      };
      map.set(category, bucket);
    }
    return bucket;
  };

  for (const order of orders) {
    if (order.status === 'Rejected') continue;
    const isVerified = order.status === 'Verified' || order.status === 'Completed';

    if (order.type === 'store' && Array.isArray(order.items) && order.items.length > 0) {
      for (const item of order.items) {
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const lineAmount = Math.max(0, Number(item.price) || 0) * qty;
        const cat = resolveOrderCategoryLabel(
          'store',
          productCategoryMap.get(item.productId),
        );
        const bucket = ensureBucket(cat);
        bucket.totalAmount += lineAmount;
        if (isVerified) bucket.verifiedAmount += lineAmount;
        bucket.orderIds.add(order.id);
        bucket.itemCount += qty;
      }
    } else {
      const cat = resolveOrderCategoryLabel(order.type);
      const amt = Math.max(0, Number(order.totalAmount) || 0);
      const bucket = ensureBucket(cat);
      bucket.totalAmount += amt;
      if (isVerified) bucket.verifiedAmount += amt;
      bucket.orderIds.add(order.id);
      bucket.itemCount += Math.max(
        1,
        (order.items || []).reduce((acc, i) => acc + Math.max(1, Math.floor(i.quantity || 1)), 0),
      );
    }
  }

  return Array.from(map.entries())
    .map(([category, b]) => ({
      category,
      totalAmount: Math.round(b.totalAmount * 100) / 100,
      verifiedAmount: Math.round(b.verifiedAmount * 100) / 100,
      orderCount: b.orderIds.size,
      itemCount: b.itemCount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export function aggregateOrderHistoryOverTime(orders: Order[]): OrderTimeSeriesPoint[] {
  const activeOrders = orders
    .filter((o) => o.status !== 'Rejected')
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (activeOrders.length === 0) return [];

  const distinctDays = new Set(
    activeOrders.map((o) => {
      const parsed = new Date(o.createdAt);
      return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toISOString().slice(0, 10);
    }),
  );

  // When multiple orders were placed on a single day, plot chronological per-order points so the trend curve renders continuously.
  if (distinctDays.size === 1 && activeOrders.length > 1) {
    let runningCumulative = 0;
    return activeOrders.map((order, idx) => {
      const parsed = new Date(order.createdAt);
      const dateKey = Number.isNaN(parsed.getTime())
        ? order.id
        : parsed.toISOString();
      const shortTime = Number.isNaN(parsed.getTime())
        ? `#${idx + 1}`
        : `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
      const shortOrderCode = order.id.split('-').pop() || order.id.slice(-3);
      const amt = Math.max(0, Number(order.totalAmount) || 0);
      const isVerified = order.status === 'Verified' || order.status === 'Completed';
      runningCumulative = Math.round((runningCumulative + amt) * 100) / 100;

      return {
        dateKey,
        label: `${shortTime} · #${shortOrderCode}`,
        amount: Math.round(amt * 100) / 100,
        verifiedAmount: isVerified ? Math.round(amt * 100) / 100 : 0,
        cumulativeAmount: runningCumulative,
        orderCount: 1,
      };
    });
  }

  const byDay = new Map<
    string,
    { amount: number; verifiedAmount: number; orderCount: number }
  >();

  for (const order of activeOrders) {
    const parsed = new Date(order.createdAt);
    const dateKey = Number.isNaN(parsed.getTime())
      ? 'Unknown'
      : parsed.toISOString().slice(0, 10);
    const entry = byDay.get(dateKey) || { amount: 0, verifiedAmount: 0, orderCount: 0 };
    const amt = Math.max(0, Number(order.totalAmount) || 0);
    entry.amount += amt;
    if (order.status === 'Verified' || order.status === 'Completed') {
      entry.verifiedAmount += amt;
    }
    entry.orderCount += 1;
    byDay.set(dateKey, entry);
  }

  let runningCumulative = 0;
  return Array.from(byDay.entries()).map(([dateKey, d]) => {
    runningCumulative = Math.round((runningCumulative + d.amount) * 100) / 100;
    return {
      dateKey,
      label: dateKey === 'Unknown' ? 'Unknown' : formatShortDateLabel(dateKey),
      amount: Math.round(d.amount * 100) / 100,
      verifiedAmount: Math.round(d.verifiedAmount * 100) / 100,
      cumulativeAmount: runningCumulative,
      orderCount: d.orderCount,
    };
  });
}

export function summarizeUserOrderMetrics(
  orders: Order[],
  products: { id: string; category: string }[],
): UserOrderMetrics {
  const activeOrders = orders.filter((o) => o.status !== 'Rejected');
  const totalOrders = activeOrders.length;
  const totalSpend =
    Math.round(activeOrders.reduce((acc, o) => acc + Math.max(0, Number(o.totalAmount) || 0), 0) * 100) /
    100;
  const verifiedSpend =
    Math.round(
      activeOrders
        .filter((o) => o.status === 'Verified' || o.status === 'Completed')
        .reduce((acc, o) => acc + Math.max(0, Number(o.totalAmount) || 0), 0) * 100,
    ) / 100;
  const averageOrderValue =
    totalOrders > 0 ? Math.round((totalSpend / totalOrders) * 100) / 100 : 0;
  const byCategory = aggregateOrderHistoryByCategory(activeOrders, products);
  const topCategory = byCategory[0]?.category || '—';

  return {
    totalOrders,
    totalSpend,
    verifiedSpend,
    averageOrderValue,
    topCategory,
  };
}

export interface DefaultCatalogSeedItem {
  id: string;
  name: string;
  description: string;
  price: number;
  priceUnit?: string;
  category: string;
  stock: number;
  imageUrl: string;
  kind: ProductKind;
}

export const CATALOG_DEFAULT_ITEMS: readonly DefaultCatalogSeedItem[] = [
  {
    id: 'prod_default_obstacle_avoiding',
    name: 'Obstacle Avoiding Kit (4 Wheel Chassis)',
    description:
      'Complete 4-wheel robotics chassis kit with HC-SR04 ultrasonic sensor, servo sweep mount, L298N motor driver, 4 geared DC motors, microcontroller, and pre-tested wiring harness.',
    price: 2999,
    category: 'Robotics Kits',
    stock: 15,
    imageUrl: '/src/assets/images/obstacle_avoiding_kit_1794708589462.jpg',
    kind: 'standard',
  },
  {
    id: 'prod_default_human_follower',
    name: 'Human Follower (4 Wheel Chassis)',
    description:
      'Autonomous 4-wheel human-following robot kit with dual IR tracking & ultrasonic sensors, motor driver shield, aluminum standoffs, and ready-to-run follower firmware.',
    price: 2499,
    category: 'Robotics Kits',
    stock: 15,
    imageUrl: '/src/assets/images/human_follower_kit_1794708590281.jpg',
    kind: 'standard',
  },
  {
    id: 'prod_default_webpages_company',
    name: 'Webpages for Company',
    description:
      'Custom responsive company webpages starting at ₹3,999 per page. Click to enter your contact number, webpage description, background theme, and optional sample page before billing.',
    price: 3999,
    priceUnit: 'per page',
    category: 'Web Solutions',
    stock: 99,
    imageUrl: '/src/assets/images/company_webpage_service_1794708590660.jpg',
    kind: 'webpage',
  },
  {
    id: 'prod_default_other_ideas',
    name: 'Other Ideas',
    description:
      'Have a custom robotics, IoT, AI, or software project idea? Submit your project details and our admin team will review and send your exact personalized quote within 1 day.',
    price: 0,
    category: 'Custom Ideas',
    stock: 99,
    imageUrl: '/src/assets/images/custom_innovation_ideas_1794708590798.jpg',
    kind: 'other_idea',
  },
];

export function resolveProductKind(
  product: Pick<Product, 'kind' | 'name'>,
): ProductKind {
  if (
    product.kind === 'webpage' ||
    product.kind === 'other_idea' ||
    product.kind === 'standard'
  ) {
    return product.kind;
  }
  const lower = product.name.trim().toLowerCase();
  if (lower.includes('webpage')) return 'webpage';
  if (lower.includes('other idea')) return 'other_idea';
  return 'standard';
}

export interface CustomRequestInput {
  requestType: CustomRequestType;
  contactNumber?: string;
  description?: string;
  backgroundTheme?: string;
  sampleWebpageUrl?: string;
}

export function validateCustomRequestSubmission(input: CustomRequestInput): {
  valid: boolean;
  error?: string;
  cleaned: {
    contactNumber: string;
    description: string;
    backgroundTheme: string;
    sampleWebpageUrl: string;
  };
} {
  const cleanContact = (input.contactNumber || '').trim();
  const cleanDescription = (input.description || '').trim();
  const cleanTheme = (input.backgroundTheme || '').trim();
  const cleanSample = (input.sampleWebpageUrl || '').trim();
  const digitsCount = cleanContact.replace(/\D/g, '').length;

  if (input.requestType === 'webpage') {
    if (!cleanContact || digitsCount < 7) {
      return {
        valid: false,
        error: 'Please enter a valid user contact number (at least 7 digits).',
        cleaned: {
          contactNumber: cleanContact,
          description: cleanDescription,
          backgroundTheme: cleanTheme,
          sampleWebpageUrl: cleanSample,
        },
      };
    }
    if (cleanDescription.length < 5) {
      return {
        valid: false,
        error: 'Please enter a clear description of the webpage (at least 5 characters).',
        cleaned: {
          contactNumber: cleanContact,
          description: cleanDescription,
          backgroundTheme: cleanTheme,
          sampleWebpageUrl: cleanSample,
        },
      };
    }
    if (!cleanTheme) {
      return {
        valid: false,
        error: 'Please specify your preferred background theme.',
        cleaned: {
          contactNumber: cleanContact,
          description: cleanDescription,
          backgroundTheme: cleanTheme,
          sampleWebpageUrl: cleanSample,
        },
      };
    }
    return {
      valid: true,
      cleaned: {
        contactNumber: cleanContact,
        description: cleanDescription,
        backgroundTheme: cleanTheme,
        sampleWebpageUrl: cleanSample,
      },
    };
  }

  // other_idea: project details compulsory; contact number helpful/optional if left blank
  if (cleanDescription.length < 5) {
    return {
      valid: false,
      error: 'Please describe the details of your project idea (at least 5 characters).',
      cleaned: {
        contactNumber: cleanContact,
        description: cleanDescription,
        backgroundTheme: cleanTheme,
        sampleWebpageUrl: cleanSample,
      },
    };
  }
  if (cleanContact && digitsCount < 7) {
    return {
      valid: false,
      error: 'Contact number must contain at least 7 digits when provided.',
      cleaned: {
        contactNumber: cleanContact,
        description: cleanDescription,
        backgroundTheme: cleanTheme,
        sampleWebpageUrl: cleanSample,
      },
    };
  }
  return {
    valid: true,
    cleaned: {
      contactNumber: cleanContact,
      description: cleanDescription,
      backgroundTheme: cleanTheme,
      sampleWebpageUrl: cleanSample,
    },
  };
}

export function filterCustomRequestsForUser(
  requests: CustomProjectRequest[],
  userId: string,
): CustomProjectRequest[] {
  if (!userId) return [];
  return requests
    .filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function validateAdminCustomQuoteAmount(amount: number): {
  valid: boolean;
  rounded: number;
  error?: string;
} {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) {
    return {
      valid: false,
      rounded: 0,
      error: 'Quote amount must be greater than ₹0.',
    };
  }
  return {
    valid: true,
    rounded: Math.round(num * 100) / 100,
  };
}

export interface DeliveryAddressInput {
  label?: string;
  recipientName?: string;
  contactPhone?: string;
  formattedAddress?: string;
  streetDetails?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
}

const NON_TAMIL_NADU_PLACE_KEYWORDS = [
  'karnataka',
  'bengaluru',
  'bangalore',
  'mysuru',
  'mysore',
  'mangalore',
  'hubli',
  'kerala',
  'kochi',
  'cochin',
  'thiruvananthapuram',
  'trivandrum',
  'kozhikode',
  'thrissur',
  'ernakulam',
  'andhra pradesh',
  'vijayawada',
  'visakhapatnam',
  'tirupati',
  'guntur',
  'telangana',
  'hyderabad',
  'warangal',
  'maharashtra',
  'mumbai',
  'pune',
  'nagpur',
  'nashik',
  'new delhi',
  'delhi',
  'noida',
  'gurgaon',
  'gurugram',
  'gujarat',
  'ahmedabad',
  'surat',
  'rajasthan',
  'jaipur',
  'west bengal',
  'kolkata',
  'odisha',
  'bhubaneswar',
  'bihar',
  'patna',
  'uttar pradesh',
  'lucknow',
  'madhya pradesh',
  'bhopal',
  'indore',
  'punjab',
  'chandigarh',
  'haryana',
  'goa',
  'puducherry',
  'pondicherry',
  'assam',
  'guwahati',
  'united states',
  'california',
  'new york',
  'texas',
  'london',
  'united kingdom',
  'singapore',
  'dubai',
];

const TAMIL_NADU_LOCATION_KEYWORDS = [
  'tamil nadu',
  'tamilnadu',
  'coimbatore',
  'chennai',
  'madurai',
  'tiruchirappalli',
  'trichy',
  'salem',
  'tiruppur',
  'tirupur',
  'erode',
  'vellore',
  'tirunelveli',
  'thoothukudi',
  'tuticorin',
  'thanjavur',
  'tanjore',
  'dindigul',
  'hosur',
  'kanchipuram',
  'kancheepuram',
  'nagercoil',
  'karur',
  'kumbakonam',
  'cuddalore',
  'pollachi',
  'ooty',
  'udhagamandalam',
  'namakkal',
  'sivakasi',
  'krishnagiri',
  'tambaram',
  'avadi',
  'ambattur',
  'adyar',
  'anna nagar',
  'velachery',
  't nagar',
  'guindy',
  'gandhipuram',
  'rs puram',
  'peelamedu',
  'saravanampatti',
  'singanallur',
  'ramanathapuram',
  'nagapattinam',
  'theni',
  'viluppuram',
  'villupuram',
  'ranipet',
  'tiruvannamalai',
  'dharmapuri',
  'ariyalur',
  'perambalur',
  'kallakurichi',
  'mayiladuthurai',
  'chengalpattu',
  'virudhunagar',
  'tenkasi',
  'pudukkottai',
  'sivaganga',
  'tiruvallur',
  'thiruvallur',
  'nilgiris',
  'kanyakumari',
  'kanniyakumari',
  'tirupathur',
  'karapakkam',
  'sholinganallur',
  'omr',
  'marina',
  'mylapore',
  'chromepet',
  'pallavaram',
];

function escapeWordRegex(word: string): RegExp {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

function looksLikeGibberishAddress(address: string): boolean {
  const clean = address.trim();
  if (clean.length < 8) return true;
  const alphaWords = clean.match(/[a-zA-Z]{2,}/g) || [];
  if (alphaWords.length < 2) return true;
  if (/(.)\1{4,}/.test(clean.replace(/\s+/g, ''))) return true;
  const lower = clean.toLowerCase();
  if (/^(test|asdf|qwer|zxcv|dummy|fake|invalid|none|na|xyz)+/.test(lower) && alphaWords.length <= 2) {
    return true;
  }
  return false;
}

export function isTamilNaduPinCode(postalCode: string | undefined): boolean {
  if (!postalCode) return false;
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 6) return false;
  const num = Number(digits);
  if (num < 600000 || num > 643999) return false;
  // Puducherry UT enclave PINs (605001–605014)
  if (num >= 605001 && num <= 605014) return false;
  return true;
}

export function validateTamilNaduDeliveryEligibility(input: {
  formattedAddress?: string;
  streetDetails?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): { valid: boolean; error?: string } {
  const stateLower = (input.state || '').trim().toLowerCase();
  const combined = [
    input.streetDetails || '',
    input.formattedAddress || '',
    input.city || '',
    input.state || '',
    input.postalCode || '',
  ]
    .join(' ')
    .trim();

  if (stateLower && !stateLower.includes('tamil nadu') && !stateLower.includes('tamilnadu') && stateLower !== 'tn') {
    return {
      valid: false,
      error: `Wrong or out-of-state address ("${input.state}"). Delivery is available ONLY within Tamil Nadu (projects are manufactured at Coimbatore).`,
    };
  }

  for (const outPlace of NON_TAMIL_NADU_PLACE_KEYWORDS) {
    if (escapeWordRegex(outPlace).test(combined)) {
      return {
        valid: false,
        error:
          'Delivery is available ONLY within Tamil Nadu (projects are manufactured at Coimbatore). Please enter a valid Tamil Nadu address to proceed to payment.',
      };
    }
  }

  // Check any 6-digit PIN mentioned anywhere in postalCode or address text
  const rawPinMatch = (input.postalCode || '').trim() || (combined.match(/\b(\d{6})\b/)?.[1] || '');
  if (rawPinMatch) {
    const pinDigits = rawPinMatch.replace(/\D/g, '');
    if (pinDigits.length > 0 && !isTamilNaduPinCode(pinDigits)) {
      return {
        valid: false,
        error: `Wrong or unserviceable PIN code (${pinDigits}). Delivery is available ONLY within Tamil Nadu (600xxx–643xxx, manufactured at Coimbatore).`,
      };
    }
  }

  if (looksLikeGibberishAddress(input.formattedAddress || combined)) {
    return {
      valid: false,
      error:
        'Wrong or incomplete delivery address. Please enter a real street address, city/district, and PIN code within Tamil Nadu to proceed to payment.',
    };
  }

  const hasTamilNaduMatch =
    stateLower.includes('tamil nadu') ||
    stateLower.includes('tamilnadu') ||
    stateLower === 'tn' ||
    /\bTN\b/.test(combined) ||
    TAMIL_NADU_LOCATION_KEYWORDS.some((kw) => escapeWordRegex(kw).test(combined)) ||
    isTamilNaduPinCode(rawPinMatch);

  if (!hasTamilNaduMatch) {
    return {
      valid: false,
      error:
        'Wrong or non-Tamil Nadu address. Deliveries are restricted ONLY to Tamil Nadu (projects manufactured at Coimbatore). Please include a Tamil Nadu city/district, "Tamil Nadu", or TN PIN code.',
    };
  }

  return { valid: true };
}

export function validateDeliveryAddress(input: DeliveryAddressInput): {
  valid: boolean;
  error?: string;
  cleaned: {
    label: string;
    recipientName: string;
    contactPhone: string;
    formattedAddress: string;
    streetDetails?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    landmark?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  };
} {
  const label = (input.label || 'Home').trim().slice(0, 32) || 'Home';
  const recipientName = (input.recipientName || '').trim();
  const contactPhone = (input.contactPhone || '').trim();
  const streetDetails = (input.streetDetails || '').trim();
  const city = (input.city || '').trim();
  const state = (input.state || '').trim();
  const postalCode = (input.postalCode || '').trim();
  const landmark = (input.landmark || '').trim();

  const rawFormatted = (input.formattedAddress || '').trim();
  const combinedFallback = [streetDetails, city, state, postalCode].filter(Boolean).join(', ');
  const formattedAddress = rawFormatted || combinedFallback;

  const digits = contactPhone.replace(/\D/g, '').length;

  const cleaned = {
    label,
    recipientName,
    contactPhone,
    formattedAddress,
    streetDetails: streetDetails || undefined,
    city: city || undefined,
    state: state || 'Tamil Nadu',
    postalCode: postalCode || undefined,
    landmark: landmark || undefined,
    lat: typeof input.lat === 'number' && Number.isFinite(input.lat) ? input.lat : undefined,
    lng: typeof input.lng === 'number' && Number.isFinite(input.lng) ? input.lng : undefined,
    placeId: (input.placeId || '').trim() || undefined,
  };

  if (recipientName.length < 2) {
    return {
      valid: false,
      error: 'Please enter the recipient name for delivery.',
      cleaned,
    };
  }
  if (digits < 10) {
    return {
      valid: false,
      error: 'Please enter a valid 10-digit delivery contact phone number.',
      cleaned,
    };
  }
  if (formattedAddress.length < 8) {
    return {
      valid: false,
      error: 'Please select an address on Google Maps or enter complete street, city & Tamil Nadu details.',
      cleaned,
    };
  }

  const tnCheck = validateTamilNaduDeliveryEligibility({
    formattedAddress,
    streetDetails,
    city,
    state,
    postalCode,
  });
  if (!tnCheck.valid) {
    return {
      valid: false,
      error: tnCheck.error,
      cleaned,
    };
  }

  return { valid: true, cleaned };
}

export function filterCatalogProducts(
  products: Product[],
  searchQuery: string,
  selectedCategory: string = 'All',
): Product[] {
  const q = searchQuery.trim().toLowerCase();
  const cat = selectedCategory.trim().toLowerCase();

  return products.filter((p) => {
    const productCat = (p.category || '').trim().toLowerCase();
    const matchCat = !cat || cat === 'all' || productCat === cat;
    if (!matchCat) return false;

    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      productCat.includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  });
}
