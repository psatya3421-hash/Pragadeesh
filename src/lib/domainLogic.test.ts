import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_PAYMENT_UPI_NUMBER,
  CATALOG_DEFAULT_ITEMS,
  LOCKOUT_DURATION_MS,
  MAX_UPLOAD_BYTES,
  SUPER_ADMIN_EMAIL,
  WRONG_PAYMENT_NOTICE,
  aggregateOrderHistoryByCategory,
  aggregateOrderHistoryOverTime,
  buildWhatsAppUrl,
  calculateCartTotals,
  canAddExtraAdmin,
  checkAdminLockoutState,
  computeNextFailedAttemptState,
  evaluatePaymentVerification,
  filterCatalogProducts,
  filterCustomRequestsForUser,
  filterOrdersByDateRange,
  formatINR,
  isTamilNaduPinCode,
  resolveProductKind,
  sanitizeCoursesForUser,
  summarizeCourseAttendance,
  summarizeUserOrderMetrics,
  validateAdminCustomQuoteAmount,
  validateCustomRequestSubmission,
  validateDeliveryAddress,
  validatePaymentFile,
  validateTamilNaduDeliveryEligibility,
} from './domainLogic';
import type { Course, CustomProjectRequest, Enrollment, Order, Product } from '../types';

test('formatINR formats Indian rupee figures cleanly', () => {
  const formatted = formatINR(14999);
  assert.ok(formatted.includes('14,999'));
  assert.ok(formatted.includes('₹'));
});

test('calculateCartTotals computes subtotal and itemCount accurately', () => {
  const totals = calculateCartTotals([
    { productId: 'p1', name: 'Kit A', price: 1200, imageUrl: '', quantity: 2, stock: 5 },
    { productId: 'p2', name: 'Kit B', price: 499.5, imageUrl: '', quantity: 1, stock: 3 },
  ]);
  assert.equal(totals.itemCount, 3);
  assert.equal(totals.subtotal, 2899.5);
});

test('validatePaymentFile enforces image MIME types and 5 MB limit', () => {
  assert.equal(validatePaymentFile({ type: 'image/png', size: 1024 }).valid, true);
  assert.equal(validatePaymentFile({ type: 'application/pdf', size: 1024 }).valid, false);
  assert.equal(validatePaymentFile({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 }).valid, false);
  assert.equal(validatePaymentFile({ type: 'image/webp', size: 0 }).valid, false);
});

test('evaluatePaymentVerification auto-verifies matching UTR payment and flags duplicates/mismatches', () => {
  const verified = evaluatePaymentVerification(
    {
      extractedAmount: 2500,
      dateTime: '2026-11-13 18:00',
      status: 'success',
      receiverNumber: `+91 ${ADMIN_PAYMENT_UPI_NUMBER}`,
      utrId: 'UTR99887766',
      summary: 'Paid ₹2,500 via GPay',
      confidence: 0.95,
    },
    2500,
    ['UTR111111'],
    'hash_abc',
    ['hash_old'],
  );
  assert.equal(verified.result.verdict, 'Amount matches');
  assert.equal(verified.result.receiverMatches, true);
  assert.equal(verified.result.suspiciousDuplicate, false);
  assert.equal(verified.nextStatus, 'Verified');

  const duplicate = evaluatePaymentVerification(
    {
      extractedAmount: 2500,
      dateTime: '2026-11-13 18:05',
      status: 'success',
      receiverNumber: ADMIN_PAYMENT_UPI_NUMBER,
      utrId: 'utr111111',
      summary: 'Duplicate UTR',
      confidence: 0.98,
    },
    2500,
    ['UTR111111'],
    'hash_new',
    [],
  );
  assert.equal(duplicate.result.suspiciousDuplicate, true);
  assert.equal(duplicate.nextStatus, 'Needs Admin Review');

  const mismatch = evaluatePaymentVerification(
    {
      extractedAmount: 1999,
      dateTime: '2026-11-13 18:10',
      status: 'success',
      receiverNumber: ADMIN_PAYMENT_UPI_NUMBER,
      utrId: 'UTR222222',
      summary: 'Short payment',
      confidence: 0.9,
    },
    2500,
    [],
    'hash_short',
    [],
  );
  assert.equal(mismatch.result.verdict, 'Amount mismatch');
  assert.equal(mismatch.nextStatus, 'Needs Admin Review');
});

test('admin passcode lockout triggers after 5 wrong attempts for 10 minutes', () => {
  const now = 1_700_000_000_000;
  let attempts = 0;
  let lockedUntil: number | null = null;

  for (let i = 1; i <= 4; i++) {
    const res = computeNextFailedAttemptState(attempts, lockedUntil, now);
    attempts = res.failedAttempts;
    lockedUntil = res.lockedUntil;
    assert.equal(res.lockedNow, false);
    assert.equal(res.attemptsLeft, 5 - i);
  }

  const fifth = computeNextFailedAttemptState(attempts, lockedUntil, now);
  assert.equal(fifth.lockedNow, true);
  assert.equal(fifth.attemptsLeft, 0);
  assert.equal(fifth.lockedUntil, now + LOCKOUT_DURATION_MS);

  const checkLocked = checkAdminLockoutState(fifth, now + 5000);
  assert.equal(checkLocked.locked, true);

  const checkUnlocked = checkAdminLockoutState(fifth, now + LOCKOUT_DURATION_MS + 1);
  assert.equal(checkUnlocked.locked, false);
  assert.equal(checkUnlocked.attemptsLeft, 5);
});

test('canAddExtraAdmin enforces super admin role and max 2 extra admins', () => {
  const baseAdmins = [
    { email: SUPER_ADMIN_EMAIL, isSuperAdmin: true },
    { email: 'admin1@primex.in', isSuperAdmin: false },
  ];

  assert.equal(canAddExtraAdmin(baseAdmins, 'other@primex.in', 'admin2@primex.in').allowed, false);
  assert.equal(canAddExtraAdmin(baseAdmins, SUPER_ADMIN_EMAIL, 'admin2@primex.in').allowed, true);

  const fullAdmins = [
    ...baseAdmins,
    { email: 'admin2@primex.in', isSuperAdmin: false },
  ];
  assert.equal(canAddExtraAdmin(fullAdmins, SUPER_ADMIN_EMAIL, 'admin3@primex.in').allowed, false);
});

test('sanitizeCoursesForUser never leaks meetingLink to unpaid students', () => {
  const courses: Course[] = [
    {
      id: 'c1',
      title: 'AI Systems',
      description: 'Live workshop',
      instructor: 'Satya',
      schedule: 'Sat 7 PM IST',
      fee: 1500,
      meetingLink: 'https://meet.google.com/secret-room-123',
      createdAt: '2026-11-13T10:00:00Z',
      updatedAt: '2026-11-13T10:00:00Z',
    },
  ];

  const unpaidEnrollments: Enrollment[] = [
    {
      id: 'e1',
      courseId: 'c1',
      courseTitle: 'AI Systems',
      userId: 'u1',
      studentName: 'Asha',
      studentEmail: 'asha@example.com',
      orderId: 'o1',
      status: 'Needs Admin Review',
      fee: 1500,
      createdAt: '2026-11-13T10:00:00Z',
      updatedAt: '2026-11-13T10:00:00Z',
    },
  ];

  const unpaidView = sanitizeCoursesForUser(courses, unpaidEnrollments, false);
  assert.equal(unpaidView[0].meetingLink, undefined);
  assert.equal(unpaidView[0].isEnrolled, false);

  const paidEnrollments: Enrollment[] = [{ ...unpaidEnrollments[0], status: 'Verified' }];
  const paidView = sanitizeCoursesForUser(courses, paidEnrollments, false);
  assert.equal(paidView[0].meetingLink, 'https://meet.google.com/secret-room-123');
  assert.equal(paidView[0].isEnrolled, true);
});

test('filterOrdersByDateRange calculates sales totals for verified/completed orders', () => {
  const orders: Order[] = [
    {
      id: 'o1',
      userId: 'u1',
      customerName: 'A',
      customerEmail: 'a@test.com',
      type: 'store',
      items: [],
      totalAmount: 1000,
      status: 'Verified',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
    },
    {
      id: 'o2',
      userId: 'u2',
      customerName: 'B',
      customerEmail: 'b@test.com',
      type: 'course',
      items: [],
      totalAmount: 500,
      status: 'Pending Payment',
      createdAt: '2026-11-13T13:00:00.000Z',
      updatedAt: '2026-11-13T13:00:00.000Z',
    },
  ];

  const report = filterOrdersByDateRange(orders, '2026-11-13', '2026-11-13');
  assert.equal(report.orders.length, 2);
  assert.equal(report.totalSales, 1000);
  assert.equal(report.verifiedCount, 1);
  assert.equal(report.pendingCount, 1);
});

test('buildWhatsAppUrl normalizes 10-digit Indian numbers and rejects invalid inputs', () => {
  assert.equal(buildWhatsAppUrl('9080397469'), 'https://wa.me/919080397469');
  assert.equal(buildWhatsAppUrl('+91 90803 97469'), 'https://wa.me/919080397469');
  assert.equal(buildWhatsAppUrl('123'), null);
});

test('summarizeCourseAttendance groups present and absent student names', () => {
  const sample: Enrollment[] = [
    {
      id: 'e1',
      courseId: 'c1',
      courseTitle: 'AI',
      userId: 'u1',
      studentName: 'Asha',
      studentEmail: 'asha@test.com',
      orderId: 'o1',
      status: 'Verified',
      attendance: 'present',
      fee: 1000,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'e2',
      courseId: 'c1',
      courseTitle: 'AI',
      userId: 'u2',
      studentName: 'Ravi',
      studentEmail: 'ravi@test.com',
      orderId: 'o2',
      status: 'Verified',
      attendance: 'absent',
      fee: 1000,
      createdAt: '',
      updatedAt: '',
    },
  ];
  const summary = summarizeCourseAttendance(sample);
  assert.deepEqual(summary.presentNames, ['Asha']);
  assert.deepEqual(summary.absentNames, ['Ravi']);
  assert.equal(summary.unmarkedCount, 0);
});

test('aggregateOrderHistoryByCategory groups store items by product category and handles course/studio orders', () => {
  const products = [
    { id: 'p1', category: 'Robotics' },
    { id: 'p2', category: 'IoT Hardware' },
  ];
  const sampleOrders: Order[] = [
    {
      id: 'ORD-1',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'store',
      items: [
        { productId: 'p1', name: 'Rover Kit', price: 1500, quantity: 2 },
        { productId: 'p2', name: 'ESP32 Node', price: 600, quantity: 1 },
      ],
      totalAmount: 3600,
      status: 'Verified',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'ORD-2',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'course',
      items: [{ productId: 'c1', name: 'Live Class', price: 1200, quantity: 1 }],
      totalAmount: 1200,
      status: 'Pending Payment',
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
    },
    {
      id: 'ORD-3',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'studio_premium',
      items: [{ productId: 'sp', name: 'Pro Edits', price: 49, quantity: 1 }],
      totalAmount: 49,
      status: 'Rejected',
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
    },
  ];

  const categories = aggregateOrderHistoryByCategory(sampleOrders, products);
  assert.equal(categories.length, 3);
  assert.deepEqual(categories[0], {
    category: 'Robotics',
    totalAmount: 3000,
    verifiedAmount: 3000,
    orderCount: 1,
    itemCount: 2,
  });
  assert.equal(categories[1].category, 'Live Classes');
  assert.equal(categories[1].totalAmount, 1200);
  assert.equal(categories[1].verifiedAmount, 0);
  assert.equal(categories[2].category, 'IoT Hardware');
  assert.equal(categories[2].totalAmount, 600);
});

test('aggregateOrderHistoryOverTime aggregates chronological daily spend and cumulative totals', () => {
  const sampleOrders: Order[] = [
    {
      id: 'ORD-B',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'store',
      items: [{ productId: 'p1', name: 'Kit', price: 1000, quantity: 1 }],
      totalAmount: 1000,
      status: 'Verified',
      createdAt: '2026-11-14T08:00:00.000Z',
      updatedAt: '2026-11-14T08:00:00.000Z',
    },
    {
      id: 'ORD-A',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'store',
      items: [{ productId: 'p2', name: 'Sensor', price: 500, quantity: 1 }],
      totalAmount: 500,
      status: 'Completed',
      createdAt: '2026-11-10T08:00:00.000Z',
      updatedAt: '2026-11-10T08:00:00.000Z',
    },
    {
      id: 'ORD-A2',
      userId: 'u1',
      customerName: 'Asha',
      customerEmail: 'asha@test.com',
      type: 'store',
      items: [{ productId: 'p2', name: 'Sensor', price: 250, quantity: 1 }],
      totalAmount: 250,
      status: 'Pending Payment',
      createdAt: '2026-11-10T18:00:00.000Z',
      updatedAt: '2026-11-10T18:00:00.000Z',
    },
  ];

  const series = aggregateOrderHistoryOverTime(sampleOrders);
  assert.equal(series.length, 2);
  assert.equal(series[0].dateKey, '2026-11-10');
  assert.equal(series[0].label, '10 Nov');
  assert.equal(series[0].amount, 750);
  assert.equal(series[0].verifiedAmount, 500);
  assert.equal(series[0].cumulativeAmount, 750);
  assert.equal(series[0].orderCount, 2);

  assert.equal(series[1].dateKey, '2026-11-14');
  assert.equal(series[1].amount, 1000);
  assert.equal(series[1].cumulativeAmount, 1750);

  const metrics = summarizeUserOrderMetrics(sampleOrders, [{ id: 'p1', category: 'Robotics' }]);
  assert.equal(metrics.totalOrders, 3);
  assert.equal(metrics.totalSpend, 1750);
  assert.equal(metrics.verifiedSpend, 1500);
  assert.equal(metrics.topCategory, 'Robotics');

  // Same-day orders expand into chronological order points for continuous trend curve
  const sameDay = aggregateOrderHistoryOverTime(sampleOrders.slice(1));
  assert.equal(sameDay.length, 2);
  assert.equal(sameDay[0].amount, 500);
  assert.equal(sameDay[1].amount, 250);
  assert.equal(sameDay[1].cumulativeAmount, 750);
});

test('CATALOG_DEFAULT_ITEMS includes requested 4 kits/services with accurate pricing', () => {
  assert.equal(CATALOG_DEFAULT_ITEMS.length, 4);
  const obstacle = CATALOG_DEFAULT_ITEMS.find((p) => p.name.includes('Obstacle Avoiding'));
  const follower = CATALOG_DEFAULT_ITEMS.find((p) => p.name.includes('Human Follower'));
  const webpage = CATALOG_DEFAULT_ITEMS.find((p) => p.name.includes('Webpages for Company'));
  const other = CATALOG_DEFAULT_ITEMS.find((p) => p.name.includes('Other Ideas'));

  assert.equal(obstacle?.price, 2999);
  assert.equal(follower?.price, 2499);
  assert.equal(webpage?.price, 3999);
  assert.equal(webpage?.priceUnit, 'per page');
  assert.equal(resolveProductKind(webpage!), 'webpage');
  assert.equal(resolveProductKind(other!), 'other_idea');
});

test('validateCustomRequestSubmission enforces webpage compulsory fields while keeping sampleWebpage optional', () => {
  // Missing contact number -> invalid
  assert.equal(
    validateCustomRequestSubmission({
      requestType: 'webpage',
      contactNumber: '',
      description: 'Corporate website with 5 sections',
      backgroundTheme: 'Dark Navy & Gold',
    }).valid,
    false,
  );

  // Missing backgroundTheme -> invalid
  assert.equal(
    validateCustomRequestSubmission({
      requestType: 'webpage',
      contactNumber: '9876543210',
      description: 'Corporate website with 5 sections',
      backgroundTheme: '',
    }).valid,
    false,
  );

  // Missing description -> invalid
  assert.equal(
    validateCustomRequestSubmission({
      requestType: 'webpage',
      contactNumber: '9876543210',
      description: 'Hi',
      backgroundTheme: 'Minimal White',
    }).valid,
    false,
  );

  // Sample webpage blank -> VALID (sample webpage is optional alone!)
  const okWithoutSample = validateCustomRequestSubmission({
    requestType: 'webpage',
    contactNumber: '9876543210',
    description: '3-page SaaS company showcase site',
    backgroundTheme: 'Midnight Navy & Gold',
    sampleWebpageUrl: '',
  });
  assert.equal(okWithoutSample.valid, true);
  assert.equal(okWithoutSample.cleaned.sampleWebpageUrl, '');

  // Other Ideas -> details compulsory
  assert.equal(
    validateCustomRequestSubmission({
      requestType: 'other_idea',
      description: '',
    }).valid,
    false,
  );
  assert.equal(
    validateCustomRequestSubmission({
      requestType: 'other_idea',
      description: 'Autonomous solar panel cleaning rover prototype',
      contactNumber: '9876501234',
    }).valid,
    true,
  );
});

test('filterCustomRequestsForUser isolates quotes strictly per user and validates admin quote amounts', () => {
  const requests: CustomProjectRequest[] = [
    {
      id: 'req_a',
      userId: 'user_a',
      customerName: 'User A',
      customerEmail: 'a@example.com',
      productId: 'prod_default_webpages_company',
      productName: 'Webpages for Company',
      requestType: 'webpage',
      contactNumber: '9111111111',
      description: 'Site A',
      backgroundTheme: 'Navy Gold',
      status: 'Quoted',
      quotedAmount: 14500,
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T11:00:00Z',
    },
    {
      id: 'req_b',
      userId: 'user_b',
      customerName: 'User B',
      customerEmail: 'b@example.com',
      productId: 'prod_default_other_ideas',
      productName: 'Other Ideas',
      requestType: 'other_idea',
      contactNumber: '9222222222',
      description: 'Idea B',
      status: 'Quoted',
      quotedAmount: 5500,
      createdAt: '2026-11-14T10:05:00Z',
      updatedAt: '2026-11-14T11:05:00Z',
    },
  ];

  const userAView = filterCustomRequestsForUser(requests, 'user_a');
  const userBView = filterCustomRequestsForUser(requests, 'user_b');

  assert.equal(userAView.length, 1);
  assert.equal(userAView[0].id, 'req_a');
  assert.equal(userAView[0].quotedAmount, 14500);

  assert.equal(userBView.length, 1);
  assert.equal(userBView[0].id, 'req_b');
  assert.equal(userBView[0].quotedAmount, 5500);

  assert.equal(validateAdminCustomQuoteAmount(0).valid, false);
  assert.equal(validateAdminCustomQuoteAmount(-500).valid, false);
  assert.equal(validateAdminCustomQuoteAmount(14500).rounded, 14500);
});

test('validateDeliveryAddress enforces contact phone, recipient, and formatted street address', () => {
  assert.equal(
    validateDeliveryAddress({
      label: 'Home',
      recipientName: 'Asha',
      contactPhone: '12',
      formattedAddress: '42 Marina High Road, Chennai',
    }).valid,
    false,
  );

  assert.equal(
    validateDeliveryAddress({
      label: 'Home',
      recipientName: 'Asha',
      contactPhone: '9876543210',
      formattedAddress: 'No',
    }).valid,
    false,
  );

  const ok = validateDeliveryAddress({
    label: 'Workshop',
    recipientName: 'Asha',
    contactPhone: '9876543210',
    formattedAddress: '42 Marina High Road, Chennai 600001',
    city: 'Chennai',
    postalCode: '600001',
    lat: 13.0827,
    lng: 80.2707,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.cleaned.label, 'Workshop');
  assert.equal(ok.cleaned.city, 'Chennai');
});

test('aggregateOrderHistoryByCategory classifies game_download orders accurately', () => {
  const gameOrder: Order = {
    id: 'ORD-GAME',
    userId: 'u1',
    customerName: 'Asha',
    customerEmail: 'asha@test.com',
    type: 'game_download',
    gameId: 'g1',
    gameTitle: 'Citadel Run',
    items: [{ productId: 'g1', name: 'Playable Game Bundle', price: 10, quantity: 1 }],
    totalAmount: 10,
    status: 'Verified',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
  };

  const categories = aggregateOrderHistoryByCategory([gameOrder], []);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].category, 'Game Downloads');
  assert.equal(categories[0].totalAmount, 10);
});

test('filterCatalogProducts filters accurately by name, category text, and category chip', () => {
  const sampleProducts: Product[] = CATALOG_DEFAULT_ITEMS.map((item) => ({
    ...item,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));

  // By product name
  const byName = filterCatalogProducts(sampleProducts, 'Human Follower');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, 'prod_default_human_follower');

  // By category string inside search box
  const byCategorySearch = filterCatalogProducts(sampleProducts, 'Web Solutions');
  assert.equal(byCategorySearch.length, 1);
  assert.equal(byCategorySearch[0].id, 'prod_default_webpages_company');

  // Combined search + category chip
  const byCategoryChip = filterCatalogProducts(sampleProducts, '', 'Robotics Kits');
  assert.equal(byCategoryChip.length, 2);
});

test('isTamilNaduPinCode and validateTamilNaduDeliveryEligibility enforce Coimbatore/Tamil Nadu serviceability', () => {
  assert.equal(isTamilNaduPinCode('641012'), true); // Coimbatore
  assert.equal(isTamilNaduPinCode('600001'), true); // Chennai
  assert.equal(isTamilNaduPinCode('625001'), true); // Madurai
  assert.equal(isTamilNaduPinCode('560001'), false); // Bengaluru
  assert.equal(isTamilNaduPinCode('682001'), false); // Kochi
  assert.equal(isTamilNaduPinCode('605001'), false); // Puducherry

  const cbe = validateDeliveryAddress({
    label: 'Lab',
    recipientName: 'Karthik',
    contactPhone: '9876543210',
    formattedAddress: '42 Cross Cut Road, Gandhipuram, Coimbatore, Tamil Nadu 641012',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    postalCode: '641012',
    lat: 11.0168,
    lng: 76.9558,
  });
  assert.equal(cbe.valid, true);

  const blr = validateDeliveryAddress({
    label: 'Office',
    recipientName: 'Karthik',
    contactPhone: '9876543210',
    formattedAddress: '100 MG Road, Bengaluru, Karnataka 560001',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
  });
  assert.equal(blr.valid, false);
  assert.match(blr.error || '', /Tamil Nadu/i);
  assert.match(blr.error || '', /Coimbatore/i);

  const gibberish = validateTamilNaduDeliveryEligibility({
    formattedAddress: 'asdfgh 12345 xyz',
  });
  assert.equal(gibberish.valid, false);
});

test('evaluatePaymentVerification flags wrong payment and includes PRIME X INNOVATION liability notice', () => {
  assert.match(WRONG_PAYMENT_NOTICE, /Wrong payment is not responsible on PRIME X INNOVATION/i);

  const wrongAmt = evaluatePaymentVerification(
    {
      extractedAmount: 500,
      dateTime: '2026-11-16T10:00:00Z',
      status: 'success',
      receiverNumber: ADMIN_PAYMENT_UPI_NUMBER,
      utrId: 'UTR999111222',
      summary: 'Paid INR 500 instead of expected amount.',
      confidence: 0.92,
    },
    2999,
    [],
    'hash_abc',
    [],
  );

  assert.equal(wrongAmt.result.isWrongPayment, true);
  assert.equal(wrongAmt.nextStatus, 'Needs Admin Review');
  assert.match(
    wrongAmt.result.summary,
    /Wrong payment is not responsible on PRIME X INNOVATION/i,
  );

  const wrongReceiver = evaluatePaymentVerification(
    {
      extractedAmount: 2999,
      dateTime: '2026-11-16T10:00:00Z',
      status: 'success',
      receiverNumber: '9999988888',
      utrId: 'UTR888777666',
      summary: 'Paid to incorrect receiver.',
      confidence: 0.9,
    },
    2999,
    [],
    'hash_def',
    [],
  );
  assert.equal(wrongReceiver.result.isWrongPayment, true);
  assert.match(
    wrongReceiver.result.summary,
    /Wrong payment is not responsible on PRIME X INNOVATION/i,
  );
});


