import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { transcodeAudioBase64ToMp3 } from './server/audioMedia';
import {
  STUDIO_PREMIUM_DURATION_DAYS,
  STUDIO_PREMIUM_MONTHLY_FEE_INR,
  normalizeExportFormat,
} from './src/lib/studioLogic';
import {
  ADMIN_PAYMENT_UPI_NUMBER,
  ALLOWED_IMAGE_MIME_TYPES,
  GAME_DOWNLOAD_FEE_INR,
  MAX_UPLOAD_BYTES,
  SUPER_ADMIN_EMAIL,
  calculateCartTotals,
  canAddExtraAdmin,
  checkAdminLockoutState,
  computeNextFailedAttemptState,
  evaluatePaymentVerification,
  filterCustomRequestsForUser,
  resolveProductKind,
  sanitizeCoursesForUser,
  validateAdminCustomQuoteAmount,
  validateCustomRequestSubmission,
  validateDeliveryAddress,
  validatePaymentFile,
  validateTamilNaduDeliveryEligibility,
} from './src/lib/domainLogic';
import {
  getUploadFilePath,
  hashSecret,
  loadDb,
  restoreUploadedImage,
  saveDb,
  saveUploadedAudio,
  saveUploadedImage,
  signSessionToken,
  verifySecret,
  verifySessionToken,
} from './server/store';
import {
  analyzePaymentScreenshotWithGemini,
  chatWithPrimeXAssistant,
  chatWithStudioModels,
  classifyStudioGeminiError,
  generateOrEditStudioImage,
  generateStudioMusic,
  generateStudioVideo,
  transcribeStudioAudio,
} from './server/gemini';
import type {
  AdminPublicInfo,
  CartItem,
  Course,
  CustomProjectRequest,
  DeliveryAddress,
  Enrollment,
  GameProject,
  GeneratedMusicTrack,
  Order,
  Product,
  StudioProject,
  UserSession,
} from './src/types';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

const SESSION_COOKIE_NAME = 'primex_session';

function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function getAuthenticatedSession(req: express.Request): {
  userSession: UserSession;
} | null {
  const db = loadDb();
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = bearerToken || cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return null;

  const payload = verifySessionToken(rawToken, db.sessionSecret);
  if (!payload) return null;

  const user = db.users.find((u) => u.id === payload.userId);
  if (!user) return null;

  const adminRecord = db.admins.find(
    (a) => a.email.toLowerCase() === user.email.toLowerCase(),
  );

  const isAdminAccount = Boolean(adminRecord);
  const isSuperAdmin = Boolean(adminRecord?.isSuperAdmin);
  const adminPasscodeVerified = Boolean(isAdminAccount && payload.adminPasscodeVerified);

  let role: UserSession['role'] = 'customer';
  if (adminPasscodeVerified) {
    role = isSuperAdmin ? 'super_admin' : 'admin';
  }

  return {
    userSession: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      isAdminAccount,
      isSuperAdmin,
      adminPasscodeVerified,
      provider: user.provider,
      createdAt: user.createdAt,
    },
  };
}

function requireAuth(
  req: express.Request,
  res: express.Response,
): UserSession | null {
  const auth = getAuthenticatedSession(req);
  if (!auth) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return auth.userSession;
}

function requireVerifiedAdmin(
  req: express.Request,
  res: express.Response,
): UserSession | null {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (!session.isAdminAccount || !session.adminPasscodeVerified) {
    res.status(403).json({ error: 'Verified admin privileges required.' });
    return null;
  }
  return session;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '45mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'PRIME X INNOVATION' });
  });

  // Google Maps runtime key provisioning bridge for @vis.gl/react-google-maps
  app.get('/api/config/maps', (_req, res) => {
    const rawKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    const apiKey = rawKey && rawKey !== 'MY_GOOGLE_MAPS_API_KEY' ? rawKey : '';
    res.json({ apiKey });
  });

  // ==================== AUTH ROUTES ====================
  app.get('/api/auth/me', (req, res) => {
    const auth = getAuthenticatedSession(req);
    if (!auth) {
      return res.json({ user: null });
    }
    return res.json({ user: auth.userSession });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();
    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const db = loadDb();
    if (db.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      email: cleanEmail,
      passwordHash: hashSecret(password),
      provider: 'password' as const,
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    saveDb(db);

    const adminRecord = db.admins.find((a) => a.email.toLowerCase() === cleanEmail);
    const token = signSessionToken(
      { userId: newUser.id, email: newUser.email, adminPasscodeVerified: false },
      db.sessionSecret,
    );
    setSessionCookie(req, res, token);

    return res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: 'customer',
        isAdminAccount: Boolean(adminRecord),
        isSuperAdmin: Boolean(adminRecord?.isSuperAdmin),
        adminPasscodeVerified: false,
        provider: 'password',
        createdAt: newUser.createdAt,
      } satisfies UserSession,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = loadDb();
    let user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);

    // Allow super/extra admin first-time password login bootstrap if they never registered manually
    const adminRecord = db.admins.find((a) => a.email.toLowerCase() === cleanEmail);
    if (!user && adminRecord) {
      if (password.length < 6) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      user = {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: adminRecord.name,
        email: cleanEmail,
        passwordHash: hashSecret(password),
        provider: 'password',
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb(db);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'This account uses Google Sign-In. Please click "Continue with Google".',
      });
    }
    if (!verifySecret(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signSessionToken(
      { userId: user.id, email: user.email, adminPasscodeVerified: false },
      db.sessionSecret,
    );
    setSessionCookie(req, res, token);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'customer',
        isAdminAccount: Boolean(adminRecord),
        isSuperAdmin: Boolean(adminRecord?.isSuperAdmin),
        adminPasscodeVerified: false,
        provider: user.provider,
        createdAt: user.createdAt,
      } satisfies UserSession,
    });
  });

  app.post('/api/auth/google', (req, res) => {
    const { email, name } = req.body as { email?: string; name?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim() || cleanEmail.split('@')[0] || 'Google User';

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please select or enter a valid Google email.' });
    }

    const db = loadDb();
    let user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      user = {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        email: cleanEmail,
        provider: 'google',
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);
      saveDb(db);
    }

    const adminRecord = db.admins.find((a) => a.email.toLowerCase() === cleanEmail);
    const token = signSessionToken(
      { userId: user.id, email: user.email, adminPasscodeVerified: false },
      db.sessionSecret,
    );
    setSessionCookie(req, res, token);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'customer',
        isAdminAccount: Boolean(adminRecord),
        isSuperAdmin: Boolean(adminRecord?.isSuperAdmin),
        adminPasscodeVerified: false,
        provider: 'google',
        createdAt: user.createdAt,
      } satisfies UserSession,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
    });
    return res.json({ ok: true });
  });

  // ==================== ADMIN PASSCODE & RBAC ====================
  app.post('/api/admin/verify-passcode', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;

    const { passcode } = req.body as { passcode?: string };
    const db = loadDb();
    const adminIndex = db.admins.findIndex(
      (a) => a.email.toLowerCase() === session.email.toLowerCase(),
    );
    if (adminIndex === -1) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const adminRecord = db.admins[adminIndex];
    const now = Date.now();
    const lockState = checkAdminLockoutState(adminRecord, now);
    if (lockState.locked) {
      const minutes = Math.ceil(lockState.remainingMs / 60000);
      return res.status(429).json({
        error: `Too many wrong attempts. Account locked for ${minutes} minute(s).`,
        locked: true,
        remainingMs: lockState.remainingMs,
        attemptsLeft: 0,
      });
    }

    if (!passcode || !verifySecret(passcode.trim(), adminRecord.passcodeHash)) {
      const nextState = computeNextFailedAttemptState(
        adminRecord.failedAttempts,
        adminRecord.lockedUntil,
        now,
      );
      db.admins[adminIndex] = {
        ...adminRecord,
        failedAttempts: nextState.failedAttempts,
        lockedUntil: nextState.lockedUntil,
      };
      saveDb(db);

      if (nextState.lockedNow) {
        return res.status(429).json({
          error: '5 incorrect attempts reached. Admin access is locked for 10 minutes.',
          locked: true,
          remainingMs: 10 * 60 * 1000,
          attemptsLeft: 0,
        });
      }

      return res.status(401).json({
        error: `Incorrect passcode. ${nextState.attemptsLeft} attempt(s) remaining before 10-minute lock.`,
        locked: false,
        attemptsLeft: nextState.attemptsLeft,
      });
    }

    // Success: reset failed attempts and upgrade session cookie
    db.admins[adminIndex] = {
      ...adminRecord,
      failedAttempts: 0,
      lockedUntil: null,
    };
    saveDb(db);

    const token = signSessionToken(
      { userId: session.id, email: session.email, adminPasscodeVerified: true },
      db.sessionSecret,
    );
    setSessionCookie(req, res, token);

    return res.json({
      token,
      user: {
        ...session,
        role: adminRecord.isSuperAdmin ? 'super_admin' : 'admin',
        adminPasscodeVerified: true,
      } satisfies UserSession,
    });
  });

  // ==================== ADMIN MANAGEMENT (SUPER ADMIN ONLY) ====================
  app.get('/api/admin/admins', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    if (!session.isSuperAdmin) {
      return res.status(403).json({ error: 'Super Admin privileges required.' });
    }
    const db = loadDb();
    const list: AdminPublicInfo[] = db.admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      isSuperAdmin: a.isSuperAdmin,
      failedAttempts: a.failedAttempts,
      lockedUntil: a.lockedUntil,
      createdAt: a.createdAt,
    }));
    return res.json({ admins: list });
  });

  app.post('/api/admin/admins', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    if (!session.isSuperAdmin) {
      return res.status(403).json({ error: 'Only Super Admin can add extra admins.' });
    }

    const { email, name, passcode } = req.body as {
      email?: string;
      name?: string;
      passcode?: string;
    };
    const db = loadDb();
    const check = canAddExtraAdmin(db.admins, session.email, email || '');
    if (!check.allowed) {
      return res.status(400).json({ error: check.reason });
    }
    if (!passcode || passcode.trim().length < 4) {
      return res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const newAdmin = {
      id: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email: cleanEmail,
      name: (name || '').trim() || cleanEmail.split('@')[0],
      isSuperAdmin: false,
      passcodeHash: hashSecret(passcode.trim()),
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    };
    db.admins.push(newAdmin);
    saveDb(db);

    return res.status(201).json({
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        isSuperAdmin: newAdmin.isSuperAdmin,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: newAdmin.createdAt,
      } satisfies AdminPublicInfo,
    });
  });

  app.patch('/api/admin/admins/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    if (!session.isSuperAdmin) {
      return res.status(403).json({ error: 'Only Super Admin can update admin passcodes.' });
    }

    const { passcode } = req.body as { passcode?: string };
    if (!passcode || passcode.trim().length < 4) {
      return res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
    }

    const db = loadDb();
    const idx = db.admins.findIndex((a) => a.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Admin record not found.' });
    }

    db.admins[idx] = {
      ...db.admins[idx],
      passcodeHash: hashSecret(passcode.trim()),
      failedAttempts: 0,
      lockedUntil: null,
    };
    saveDb(db);
    return res.json({ ok: true });
  });

  app.delete('/api/admin/admins/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    if (!session.isSuperAdmin) {
      return res.status(403).json({ error: 'Only Super Admin can remove extra admins.' });
    }

    const db = loadDb();
    const target = db.admins.find((a) => a.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Admin record not found.' });
    }
    if (target.isSuperAdmin || target.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      return res.status(400).json({ error: 'The Super Admin account cannot be removed.' });
    }

    db.admins = db.admins.filter((a) => a.id !== req.params.id);
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== PRODUCTS (STORE) ====================
  app.get('/api/products', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    return res.json({ products: db.products });
  });

  app.post('/api/products', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { name, description, price, priceUnit, category, stock, imageUrl, kind } =
      req.body as Partial<Product>;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Product name is required.' });
    }
    const resolvedKind = resolveProductKind({ kind, name: name.trim() });
    const numPrice = Number(price ?? 0);
    const numStock = Number(stock ?? 0);
    if (resolvedKind !== 'other_idea' && (!Number.isFinite(numPrice) || numPrice <= 0)) {
      return res.status(400).json({ error: 'Product price must be greater than ₹0.' });
    }

    const now = new Date().toISOString();
    const product: Product = {
      id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      description: (description || '').trim(),
      price: Math.max(0, Math.round(numPrice * 100) / 100),
      priceUnit: priceUnit ? String(priceUnit).trim() : undefined,
      category: (category || 'General').trim(),
      stock: Math.max(0, Math.floor(numStock)),
      imageUrl: (imageUrl || '').trim(),
      kind: resolvedKind,
      createdAt: now,
      updatedAt: now,
    };

    const db = loadDb();
    db.products.unshift(product);
    saveDb(db);
    return res.status(201).json({ product });
  });

  app.put('/api/products/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    const idx = db.products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const { name, description, price, priceUnit, category, stock, imageUrl, kind } =
      req.body as Partial<Product>;
    const current = db.products[idx];
    const nextName = name !== undefined ? name.trim() : current.name;
    const nextKind = resolveProductKind({ kind: kind ?? current.kind, name: nextName });
    db.products[idx] = {
      ...current,
      name: nextName,
      description: description !== undefined ? description.trim() : current.description,
      price:
        price !== undefined
          ? nextKind === 'other_idea'
            ? Math.max(0, Number(price))
            : Math.max(1, Number(price))
          : current.price,
      priceUnit: priceUnit !== undefined ? priceUnit.trim() || undefined : current.priceUnit,
      category: category !== undefined ? category.trim() : current.category,
      stock: stock !== undefined ? Math.max(0, Math.floor(Number(stock))) : current.stock,
      imageUrl: imageUrl !== undefined ? imageUrl.trim() : current.imageUrl,
      kind: nextKind,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return res.json({ product: db.products[idx] });
  });

  app.delete('/api/products/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    db.products = db.products.filter((p) => p.id !== req.params.id);
    saveDb(db);
    return res.json({ ok: true });
  });

  app.post('/api/products/restore', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { products, imageMap } = req.body as {
      products?: Product[];
      imageMap?: Record<string, string>;
    };
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Products array is required.' });
    }

    const db = loadDb();
    const existingIds = new Set(db.products.map((p) => p.id));
    let changed = false;

    for (const raw of products) {
      if (!raw || !raw.id || !raw.name) continue;
      const cleanPrice = Number(raw.price ?? 0);
      const resolvedKind = resolveProductKind({ kind: raw.kind, name: String(raw.name) });
      if (resolvedKind !== 'other_idea' && (!Number.isFinite(cleanPrice) || cleanPrice <= 0)) {
        continue;
      }

      const imgUrl = String(raw.imageUrl || '').trim();
      if (imgUrl.startsWith('/api/uploads/prod_') && imageMap && imageMap[imgUrl]) {
        const filename = imgUrl.split('/').pop() || '';
        restoreUploadedImage(filename, imageMap[imgUrl]);
      }

      if (!existingIds.has(raw.id)) {
        const now = new Date().toISOString();
        db.products.push({
          id: String(raw.id),
          name: String(raw.name).trim(),
          description: String(raw.description || '').trim(),
          price: Math.max(0, Math.round(cleanPrice * 100) / 100),
          priceUnit: raw.priceUnit ? String(raw.priceUnit).trim() : undefined,
          category: String(raw.category || 'General').trim(),
          stock: Math.max(0, Math.floor(Number(raw.stock ?? 0))),
          imageUrl: imgUrl,
          kind: resolvedKind,
          createdAt: raw.createdAt || now,
          updatedAt: raw.updatedAt || now,
        });
        existingIds.add(String(raw.id));
        changed = true;
      }
    }

    if (changed) {
      saveDb(db);
    }
    return res.json({ products: db.products });
  });

  // ==================== CUSTOM PROJECT / WEBPAGE QUOTE REQUESTS ====================
  app.get('/api/custom-requests/my', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const requests = filterCustomRequestsForUser(db.customRequests, session.id);
    return res.json({ requests });
  });

  app.post('/api/custom-requests', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = req.body as {
      productId?: string;
      productName?: string;
      requestType?: 'webpage' | 'other_idea';
      contactNumber?: string;
      description?: string;
      backgroundTheme?: string;
      sampleWebpageUrl?: string;
    };

    const requestType = body.requestType === 'webpage' ? 'webpage' : 'other_idea';
    const check = validateCustomRequestSubmission({
      requestType,
      contactNumber: body.contactNumber,
      description: body.description,
      backgroundTheme: body.backgroundTheme,
      sampleWebpageUrl: body.sampleWebpageUrl,
    });
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }

    const db = loadDb();
    const matchedProduct = body.productId
      ? db.products.find((p) => p.id === body.productId)
      : undefined;
    const now = new Date().toISOString();
    const request: CustomProjectRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: session.id,
      customerName: session.name,
      customerEmail: session.email,
      productId: matchedProduct?.id || body.productId || (requestType === 'webpage' ? 'prod_default_webpages_company' : 'prod_default_other_ideas'),
      productName:
        matchedProduct?.name ||
        (body.productName || '').trim() ||
        (requestType === 'webpage' ? 'Webpages for Company' : 'Other Ideas'),
      requestType,
      contactNumber: check.cleaned.contactNumber,
      description: check.cleaned.description,
      backgroundTheme: check.cleaned.backgroundTheme || undefined,
      sampleWebpageUrl: check.cleaned.sampleWebpageUrl || undefined,
      status: 'Awaiting Quote',
      createdAt: now,
      updatedAt: now,
    };

    db.customRequests.unshift(request);
    db.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      orderId: request.id,
      type: 'quote',
      message: `New ${requestType === 'webpage' ? 'Company Webpage' : 'Custom Idea'} request from ${session.name} (${session.email}). Enter exact amount in Custom Quotes.`,
      read: false,
      createdAt: now,
    });
    saveDb(db);

    return res.status(201).json({
      request,
      message:
        'Your details have been delivered to the Admin Portal. Please wait for 1 day (24 hours) for the exact amount to be sent to your account.',
    });
  });

  // ==================== SERVER-SIDE GOOGLE MAPS GEOCODING PROXY ====================
  app.post('/api/maps/geocode', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const { address, lat, lng } = req.body as {
      address?: string;
      lat?: number;
      lng?: number;
    };

    const hasCoords =
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lng === 'number' &&
      Number.isFinite(lng);
    const cleanAddress = (address || '').trim();

    if (!hasCoords && cleanAddress.length < 3) {
      return res.status(400).json({ error: 'Enter at least 3 characters or valid coordinates.' });
    }
    if (!apiKey) {
      return res.json({ found: false, geocodeUnavailable: true });
    }

    try {
      // Call Google Maps Geocoding REST API v4 server-side (avoids CORS / legacy JS Geocoder)
      const v4Url = hasCoords
        ? `https://geocode.googleapis.com/v4/geocode/location/${lat},${lng}?languageCode=en&regionCode=IN`
        : `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(cleanAddress)}?regionCode=IN&languageCode=en&locationBias.rectangle.low.latitude=8.07&locationBias.rectangle.low.longitude=76.22&locationBias.rectangle.high.latitude=13.56&locationBias.rectangle.high.longitude=80.35`;

      const v4Res = await fetch(v4Url, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });

      if (v4Res.status === 429) {
        return res.status(429).json({ error: 'Google Maps geocoding quota reached.', quotaExceeded: true });
      }

      if (v4Res.ok) {
        const v4Data = (await v4Res.json()) as {
          results?: Array<{
            placeId?: string;
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            postalAddress?: {
              postalCode?: string;
              administrativeArea?: string;
              locality?: string;
            };
            addressComponents?: Array<{
              longText?: string;
              shortText?: string;
              types?: string[];
            }>;
          }>;
        };

        const first = v4Data.results?.[0];
        if (first?.location && typeof first.location.latitude === 'number' && typeof first.location.longitude === 'number') {
          let city = first.postalAddress?.locality || '';
          let state = first.postalAddress?.administrativeArea || '';
          let postalCode = first.postalAddress?.postalCode || '';
          for (const comp of first.addressComponents || []) {
            if (!city && (comp.types?.includes('locality') || comp.types?.includes('administrative_area_level_2'))) {
              city = comp.longText || comp.shortText || '';
            }
            if (!state && comp.types?.includes('administrative_area_level_1')) {
              state = comp.longText || comp.shortText || '';
            }
            if (!postalCode && comp.types?.includes('postal_code')) {
              postalCode = comp.longText || comp.shortText || '';
            }
          }
          const formatted = first.formattedAddress || cleanAddress;
          const serviceability = validateTamilNaduDeliveryEligibility({
            formattedAddress: formatted,
            city,
            state,
            postalCode,
          });
          return res.json({
            found: true,
            lat: first.location.latitude,
            lng: first.location.longitude,
            formattedAddress: formatted,
            city,
            state,
            postalCode,
            placeId: first.placeId,
            validTamilNadu: serviceability.valid,
            serviceabilityError: serviceability.error,
          });
        }
      }

      // Secondary fallback: Google Maps Geocoding JSON REST endpoint
      const v3Url = hasCoords
        ? `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(apiKey)}`
        : `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&region=in&bounds=8.07,76.22|13.56,80.35&key=${encodeURIComponent(apiKey)}`;

      const v3Res = await fetch(v3Url);
      if (v3Res.status === 429) {
        return res.status(429).json({ error: 'Google Maps geocoding quota reached.', quotaExceeded: true });
      }
      if (v3Res.ok) {
        const v3Data = (await v3Res.json()) as {
          status?: string;
          results?: Array<{
            place_id?: string;
            formatted_address?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
            address_components?: Array<{
              long_name?: string;
              short_name?: string;
              types?: string[];
            }>;
          }>;
        };

        if (v3Data.status === 'OVER_QUERY_LIMIT') {
          return res.status(429).json({ error: 'Google Maps geocoding quota reached.', quotaExceeded: true });
        }

        const hit = v3Data.results?.[0];
        if (hit?.geometry?.location && typeof hit.geometry.location.lat === 'number' && typeof hit.geometry.location.lng === 'number') {
          let city = '';
          let state = '';
          let postalCode = '';
          for (const comp of hit.address_components || []) {
            if (!city && (comp.types?.includes('locality') || comp.types?.includes('administrative_area_level_2'))) {
              city = comp.long_name || comp.short_name || '';
            }
            if (!state && comp.types?.includes('administrative_area_level_1')) {
              state = comp.long_name || comp.short_name || '';
            }
            if (!postalCode && comp.types?.includes('postal_code')) {
              postalCode = comp.long_name || comp.short_name || '';
            }
          }
          const formatted = hit.formatted_address || cleanAddress;
          const serviceability = validateTamilNaduDeliveryEligibility({
            formattedAddress: formatted,
            city,
            state,
            postalCode,
          });
          return res.json({
            found: true,
            lat: hit.geometry.location.lat,
            lng: hit.geometry.location.lng,
            formattedAddress: formatted,
            city,
            state,
            postalCode,
            placeId: hit.place_id,
            validTamilNadu: serviceability.valid,
            serviceabilityError: serviceability.error,
          });
        }
        return res.json({
          found: false,
          zeroResults: v3Data.status === 'ZERO_RESULTS',
          geocodeStatus: v3Data.status || 'ZERO_RESULTS',
        });
      }

      return res.json({ found: false, geocodeUnavailable: true });
    } catch {
      return res.json({ found: false, geocodeUnavailable: true });
    }
  });

  // ==================== DELIVERY ADDRESS BOOK ====================
  app.get('/api/addresses', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const list = (db.addresses[session.id] || []).slice().sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return res.json({ addresses: list });
  });

  app.post('/api/addresses', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = req.body as Partial<DeliveryAddress>;
    const check = validateDeliveryAddress({
      label: body.label,
      recipientName: body.recipientName || session.name,
      contactPhone: body.contactPhone,
      formattedAddress: body.formattedAddress,
      streetDetails: body.streetDetails,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      landmark: body.landmark,
      lat: body.lat,
      lng: body.lng,
      placeId: body.placeId,
    });
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }

    const db = loadDb();
    const existing = db.addresses[session.id] || [];
    const now = new Date().toISOString();
    const address: DeliveryAddress = {
      id: body.id && existing.some((a) => a.id === body.id)
        ? body.id
        : `addr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...check.cleaned,
      updatedAt: now,
    };
    const nextList = [address, ...existing.filter((a) => a.id !== address.id)].slice(0, 15);
    db.addresses[session.id] = nextList;
    saveDb(db);
    return res.status(201).json({ address, addresses: nextList });
  });

  app.delete('/api/addresses/:id', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const existing = db.addresses[session.id] || [];
    db.addresses[session.id] = existing.filter((a) => a.id !== req.params.id);
    saveDb(db);
    return res.json({ addresses: db.addresses[session.id] });
  });

  app.post('/api/custom-requests/:id/checkout', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { deliveryAddress } = req.body as { deliveryAddress?: Partial<DeliveryAddress> };
    const db = loadDb();
    const idx = db.customRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Custom request not found.' });
    }
    const customReq = db.customRequests[idx];
    if (customReq.userId !== session.id) {
      return res.status(403).json({ error: 'You can only check out your own quoted requests.' });
    }
    if (customReq.linkedOrderId) {
      const existingOrder = db.orders.find(
        (o) => o.id === customReq.linkedOrderId && o.userId === session.id,
      );
      if (existingOrder) {
        return res.json({ order: existingOrder, request: customReq });
      }
    }
    if (customReq.status !== 'Quoted' || !customReq.quotedAmount || customReq.quotedAmount <= 0) {
      return res.status(400).json({
        error: 'Please wait for the admin to enter the exact quoted amount before proceeding to bill.',
      });
    }

    const addrCheck = validateDeliveryAddress(deliveryAddress || {});
    if (!addrCheck.valid) {
      return res.status(400).json({
        error: addrCheck.error || 'Please select a delivery address before proceeding to bill.',
      });
    }
    const now = new Date().toISOString();
    const confirmedAddress: DeliveryAddress = {
      id: deliveryAddress?.id || `addr_${Date.now()}`,
      ...addrCheck.cleaned,
      updatedAt: now,
    };

    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const order: Order = {
      id: orderId,
      userId: session.id,
      customerName: session.name,
      customerEmail: session.email,
      type: 'store',
      items: [
        {
          productId: customReq.productId,
          name: `${customReq.productName} (Quote: ${customReq.description.slice(0, 48)})`,
          price: customReq.quotedAmount,
          quantity: 1,
        },
      ],
      deliveryAddress: confirmedAddress,
      totalAmount: customReq.quotedAmount,
      status: 'Pending Payment',
      adminNote: customReq.adminNote,
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(order);
    db.customRequests[idx] = {
      ...customReq,
      status: 'Ordered',
      linkedOrderId: order.id,
      updatedAt: now,
    };
    saveDb(db);
    return res.status(201).json({ order, request: db.customRequests[idx] });
  });

  // ==================== CART ====================
  app.get('/api/cart', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const items = db.carts[session.id] || [];
    return res.json({ items, ...calculateCartTotals(items) });
  });

  app.put('/api/cart', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { items } = req.body as { items?: CartItem[] };
    const safeItems = Array.isArray(items)
      ? items
          .filter((i) => i && i.productId && Number(i.quantity) > 0)
          .map((i) => ({
            productId: String(i.productId),
            name: String(i.name),
            price: Number(i.price),
            imageUrl: String(i.imageUrl || ''),
            quantity: Math.max(1, Math.floor(Number(i.quantity))),
            stock: Math.max(0, Math.floor(Number(i.stock ?? 99))),
          }))
      : [];
    const db = loadDb();
    db.carts[session.id] = safeItems;
    saveDb(db);
    return res.json({ items: safeItems, ...calculateCartTotals(safeItems) });
  });

  // ==================== ORDERS & PAYMENTS ====================
  app.get('/api/orders/my', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const orders = db.orders
      .filter((o) => o.userId === session.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ orders });
  });

  app.post('/api/orders', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const {
      type,
      courseId,
      studioProjectTitle,
      gameId,
      gameTitle,
      deliveryAddress,
    } = req.body as {
      type?: 'store' | 'course' | 'studio_4k' | 'studio_premium' | 'game_download';
      courseId?: string;
      studioProjectTitle?: string;
      gameId?: string;
      gameTitle?: string;
      deliveryAddress?: Partial<DeliveryAddress>;
    };
    const db = loadDb();
    const now = new Date().toISOString();

    if (type === 'game_download') {
      const cleanGameTitle = (gameTitle || 'Prime X Arcade Game').trim().slice(0, 64);
      const cleanGameId = (gameId || 'custom_game').trim();
      const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const order: Order = {
        id: orderId,
        userId: session.id,
        customerName: session.name,
        customerEmail: session.email,
        type: 'game_download',
        gameId: cleanGameId,
        gameTitle: cleanGameTitle,
        items: [
          {
            productId: cleanGameId,
            name: `Playable Game Bundle Download (${cleanGameTitle})`,
            price: GAME_DOWNLOAD_FEE_INR,
            quantity: 1,
          },
        ],
        totalAmount: GAME_DOWNLOAD_FEE_INR,
        status: 'Pending Payment',
        createdAt: now,
        updatedAt: now,
      };
      db.orders.unshift(order);
      saveDb(db);
      return res.status(201).json({ order });
    }

    if (type === 'studio_premium') {
      const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const order: Order = {
        id: orderId,
        userId: session.id,
        customerName: session.name,
        customerEmail: session.email,
        type: 'studio_premium',
        items: [
          {
            productId: 'studio_premium_monthly',
            name: 'PRIME X Studio Pro — Monthly Premium CapCut Edits (30 Days)',
            price: STUDIO_PREMIUM_MONTHLY_FEE_INR,
            quantity: 1,
          },
        ],
        totalAmount: STUDIO_PREMIUM_MONTHLY_FEE_INR,
        status: 'Pending Payment',
        createdAt: now,
        updatedAt: now,
      };
      db.orders.unshift(order);
      saveDb(db);
      return res.status(201).json({ order });
    }

    if (type === 'studio_4k') {
      const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const label = (studioProjectTitle || 'Prime X Studio Video').trim();
      const order: Order = {
        id: orderId,
        userId: session.id,
        customerName: session.name,
        customerEmail: session.email,
        type: 'studio_4k',
        items: [
          {
            productId: 'studio_4k_export',
            name: `4K Ultra HD Video Export (${label})`,
            price: 10,
            quantity: 1,
          },
        ],
        totalAmount: 10,
        status: 'Pending Payment',
        createdAt: now,
        updatedAt: now,
      };
      db.orders.unshift(order);
      saveDb(db);
      return res.status(201).json({ order });
    }

    if (type === 'course') {
      const course = db.courses.find((c) => c.id === courseId);
      if (!course) {
        return res.status(404).json({ error: 'Selected course not found.' });
      }
      const existingPaid = db.enrollments.find(
        (e) =>
          e.courseId === course.id &&
          e.userId === session.id &&
          (e.status === 'Verified' || e.status === 'Completed'),
      );
      if (existingPaid) {
        return res.status(400).json({ error: 'You are already enrolled and verified for this course.' });
      }

      const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      const order: Order = {
        id: orderId,
        userId: session.id,
        customerName: session.name,
        customerEmail: session.email,
        type: 'course',
        courseId: course.id,
        courseTitle: course.title,
        items: [
          {
            productId: course.id,
            name: `Live Class: ${course.title}`,
            price: course.fee,
            quantity: 1,
          },
        ],
        totalAmount: course.fee,
        status: 'Pending Payment',
        createdAt: now,
        updatedAt: now,
      };
      db.orders.unshift(order);

      const enrollmentIdx = db.enrollments.findIndex(
        (e) => e.courseId === course.id && e.userId === session.id,
      );
      const enrollment: Enrollment = {
        id: enrollmentIdx >= 0 ? db.enrollments[enrollmentIdx].id : `enr_${Date.now()}`,
        courseId: course.id,
        courseTitle: course.title,
        userId: session.id,
        studentName: session.name,
        studentEmail: session.email,
        orderId: order.id,
        status: 'Pending Payment',
        fee: course.fee,
        createdAt: now,
        updatedAt: now,
      };
      if (enrollmentIdx >= 0) {
        db.enrollments[enrollmentIdx] = enrollment;
      } else {
        db.enrollments.unshift(enrollment);
      }

      saveDb(db);
      return res.status(201).json({ order });
    }

    // Store cart order — enforce delivery address selection before bill generation
    const cartItems = db.carts[session.id] || [];
    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty. Add products before checking out.' });
    }

    const addrCheck = validateDeliveryAddress(deliveryAddress || {});
    if (!addrCheck.valid) {
      return res.status(400).json({
        error: addrCheck.error || 'Please enter and select a delivery address before proceeding to bill.',
      });
    }
    const confirmedAddress: DeliveryAddress = {
      id: deliveryAddress?.id || `addr_${Date.now()}`,
      ...addrCheck.cleaned,
      updatedAt: now,
    };

    const { subtotal } = calculateCartTotals(cartItems);
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const order: Order = {
      id: orderId,
      userId: session.id,
      customerName: session.name,
      customerEmail: session.email,
      type: 'store',
      items: cartItems.map((c) => ({
        productId: c.productId,
        name: c.name,
        price: c.price,
        quantity: c.quantity,
      })),
      deliveryAddress: confirmedAddress,
      totalAmount: subtotal,
      status: 'Pending Payment',
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(order);
    db.carts[session.id] = [];
    saveDb(db);
    return res.status(201).json({ order });
  });

  app.patch('/api/orders/:id/address', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { deliveryAddress } = req.body as { deliveryAddress?: Partial<DeliveryAddress> };
    const addrCheck = validateDeliveryAddress(deliveryAddress || {});
    if (!addrCheck.valid) {
      return res.status(400).json({ error: addrCheck.error });
    }
    const db = loadDb();
    const idx = db.orders.findIndex((o) => o.id === req.params.id && o.userId === session.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const now = new Date().toISOString();
    const nextAddress: DeliveryAddress = {
      id: deliveryAddress?.id || `addr_${Date.now()}`,
      ...addrCheck.cleaned,
      updatedAt: now,
    };
    db.orders[idx] = {
      ...db.orders[idx],
      deliveryAddress: nextAddress,
      updatedAt: now,
    };
    saveDb(db);
    return res.json({ order: db.orders[idx] });
  });

  app.post('/api/orders/:id/payment', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;

    const { base64Image, mimeType, fileSize } = req.body as {
      base64Image?: string;
      mimeType?: string;
      fileSize?: number;
    };

    const validation = validatePaymentFile({
      type: mimeType || '',
      size: Number(fileSize ?? 0),
    });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    if (!base64Image || base64Image.length < 20) {
      return res.status(400).json({ error: 'Valid payment screenshot image data is required.' });
    }

    // Double check decoded byte size <= 5MB
    const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
    const byteLength = Buffer.byteLength(cleanBase64, 'base64');
    if (byteLength > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ error: 'Uploaded file exceeds the 5 MB maximum limit.' });
    }

    const db = loadDb();
    const orderIdx = db.orders.findIndex((o) => o.id === req.params.id);
    if (orderIdx === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = db.orders[orderIdx];
    if (order.userId !== session.id && !session.adminPasscodeVerified) {
      return res.status(403).json({ error: 'You cannot modify this order.' });
    }

    // Store screenshot
    const savedImg = saveUploadedImage(base64Image, mimeType || 'image/png', 'pay');

    // Collect existing UTRs and screenshot hashes (excluding current order)
    const existingUtrs = db.orders
      .filter((o) => o.id !== order.id && o.utrId)
      .map((o) => o.utrId as string);
    const existingHashes = db.orders
      .filter((o) => o.id !== order.id && o.screenshotHash)
      .map((o) => o.screenshotHash as string);

    // Run Gemini Vision analysis
    const aiRaw = await analyzePaymentScreenshotWithGemini(
      base64Image,
      mimeType || 'image/png',
      order.totalAmount,
    );

    const evaluated = evaluatePaymentVerification(
      aiRaw,
      order.totalAmount,
      existingUtrs,
      savedImg.sha256,
      existingHashes,
    );

    const now = new Date().toISOString();
    const expiresAt =
      order.type === 'studio_premium' &&
      (evaluated.nextStatus === 'Verified' || evaluated.nextStatus === 'Completed')
        ? new Date(Date.now() + STUDIO_PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : order.subscriptionExpiresAt;
    const updatedOrder: Order = {
      ...order,
      status: evaluated.nextStatus,
      subscriptionExpiresAt: expiresAt,
      screenshotUrl: savedImg.publicUrl,
      screenshotHash: savedImg.sha256,
      utrId: evaluated.result.utrId || undefined,
      aiVerification: evaluated.result,
      updatedAt: now,
    };

    db.orders[orderIdx] = updatedOrder;

    // Sync course enrollment if applicable
    if (updatedOrder.type === 'course' && updatedOrder.courseId) {
      const enrIdx = db.enrollments.findIndex(
        (e) => e.orderId === updatedOrder.id || (e.courseId === updatedOrder.courseId && e.userId === updatedOrder.userId),
      );
      if (enrIdx >= 0) {
        db.enrollments[enrIdx] = {
          ...db.enrollments[enrIdx],
          status: updatedOrder.status,
          updatedAt: now,
        };
      }
    }

    // Notify admin
    db.notifications.unshift({
      id: `notif_${Date.now()}`,
      orderId: updatedOrder.id,
      type: updatedOrder.status === 'Verified' ? 'verified' : 'review',
      message:
        updatedOrder.status === 'Verified'
          ? `Order ${updatedOrder.id} (₹${updatedOrder.totalAmount}) AI-Verified for ${updatedOrder.customerName}.`
          : `Order ${updatedOrder.id} from ${updatedOrder.customerName} needs Admin Review (${evaluated.result.verdict}).`,
      read: false,
      createdAt: now,
    });

    saveDb(db);
    return res.json({ order: updatedOrder });
  });

  // ==================== COURSES (LIVE CLASSES) ====================
  app.get('/api/courses', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const userEnrollments = db.enrollments.filter((e) => e.userId === session.id);
    const courses = sanitizeCoursesForUser(
      db.courses,
      userEnrollments,
      session.adminPasscodeVerified,
    );
    return res.json({ courses });
  });

  app.post('/api/courses', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { title, description, instructor, schedule, fee, meetingLink, whatsappNumber } =
      req.body as Partial<Course>;
    if (!title || !title.trim() || !instructor || !instructor.trim()) {
      return res.status(400).json({ error: 'Course title and instructor are required.' });
    }
    const numFee = Number(fee);
    if (!Number.isFinite(numFee) || numFee <= 0) {
      return res.status(400).json({ error: 'Course fee must be greater than ₹0.' });
    }
    const now = new Date().toISOString();
    const id = `crs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const course: Course = {
      id,
      title: title.trim(),
      description: (description || '').trim(),
      instructor: instructor.trim(),
      schedule: (schedule || '').trim(),
      fee: Math.round(numFee * 100) / 100,
      meetingLink: (meetingLink || '').trim(),
      whatsappNumber: (whatsappNumber || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    const db = loadDb();
    db.courses.unshift(course);
    saveDb(db);
    return res.status(201).json({ course });
  });

  app.put('/api/courses/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    const idx = db.courses.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    const { title, description, instructor, schedule, fee, meetingLink, whatsappNumber } =
      req.body as Partial<Course>;
    const current = db.courses[idx];
    db.courses[idx] = {
      ...current,
      title: title !== undefined ? title.trim() : current.title,
      description: description !== undefined ? description.trim() : current.description,
      instructor: instructor !== undefined ? instructor.trim() : current.instructor,
      schedule: schedule !== undefined ? schedule.trim() : current.schedule,
      fee: fee !== undefined ? Math.max(1, Number(fee)) : current.fee,
      meetingLink: meetingLink !== undefined ? meetingLink.trim() : current.meetingLink,
      whatsappNumber:
        whatsappNumber !== undefined ? whatsappNumber.trim() : current.whatsappNumber,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return res.json({ course: db.courses[idx] });
  });

  app.delete('/api/courses/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    db.courses = db.courses.filter((c) => c.id !== req.params.id);
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== BUILT-IN LIVE CLASSROOM & ATTENDANCE ====================
  app.get('/api/courses/:id/classroom', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const course = db.courses.find((c) => c.id === req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Live class not found.' });
    }

    if (session.adminPasscodeVerified) {
      const roster = db.enrollments.filter((e) => e.courseId === course.id);
      return res.json({
        course,
        isAdminView: true,
        roster,
      });
    }

    const myEnrollment = db.enrollments.find(
      (e) =>
        e.courseId === course.id &&
        e.userId === session.id &&
        (e.status === 'Verified' || e.status === 'Completed'),
    );
    if (!myEnrollment) {
      return res.status(403).json({
        error: 'Payment verification is required before joining this live class.',
      });
    }

    return res.json({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        instructor: course.instructor,
        schedule: course.schedule,
        fee: course.fee,
        meetingLink: course.meetingLink,
        whatsappNumber: course.whatsappNumber,
      },
      isAdminView: false,
      myAttendance: myEnrollment.attendance || 'unmarked',
    });
  });

  app.post('/api/courses/:id/students', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    const course = db.courses.find((c) => c.id === req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const { studentName, studentEmail, phone, attendance } = req.body as {
      studentName?: string;
      studentEmail?: string;
      phone?: string;
      attendance?: Enrollment['attendance'];
    };
    const cleanName = (studentName || '').trim();
    if (!cleanName) {
      return res.status(400).json({ error: 'Student name is required.' });
    }

    const now = new Date().toISOString();
    const cleanEmail =
      (studentEmail || '').trim().toLowerCase() ||
      `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'student'}@student.primex`;

    const existingUser = db.users.find(
      (u) => u.email.toLowerCase() === cleanEmail,
    );
    const enrollment: Enrollment = {
      id: `enr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      courseId: course.id,
      courseTitle: course.title,
      userId: existingUser ? existingUser.id : `manual_${Date.now()}`,
      studentName: cleanName,
      studentEmail: cleanEmail,
      phone: (phone || '').trim() || undefined,
      orderId: `ADM-${Date.now().toString().slice(-6)}`,
      status: 'Verified',
      attendance:
        attendance === 'present' || attendance === 'absent'
          ? attendance
          : 'unmarked',
      fee: course.fee,
      createdAt: now,
      updatedAt: now,
    };

    db.enrollments.unshift(enrollment);
    saveDb(db);
    return res.status(201).json({ enrollment });
  });

  app.patch('/api/courses/:id/attendance/:enrollmentId', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { attendance } = req.body as { attendance?: Enrollment['attendance'] };
    if (attendance !== 'present' && attendance !== 'absent' && attendance !== 'unmarked') {
      return res.status(400).json({ error: 'Invalid attendance value.' });
    }

    const db = loadDb();
    const idx = db.enrollments.findIndex(
      (e) => e.id === req.params.enrollmentId && e.courseId === req.params.id,
    );
    if (idx === -1) {
      return res.status(404).json({ error: 'Student enrollment record not found.' });
    }

    db.enrollments[idx] = {
      ...db.enrollments[idx],
      attendance,
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
    return res.json({ enrollment: db.enrollments[idx] });
  });

  app.delete('/api/courses/:id/students/:enrollmentId', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    db.enrollments = db.enrollments.filter(
      (e) => !(e.id === req.params.enrollmentId && e.courseId === req.params.id),
    );
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== ADMIN OVERVIEW & ORDER ACTIONS ====================
  app.get('/api/admin/overview', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    const todayPrefix = new Date().toISOString().slice(0, 10);

    const todayOrders = db.orders.filter((o) => o.createdAt.startsWith(todayPrefix));
    const todaySales = todayOrders
      .filter((o) => o.status === 'Verified' || o.status === 'Completed')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const pendingPayments = db.orders.filter(
      (o) =>
        o.status === 'Pending Payment' ||
        o.status === 'Payment Submitted' ||
        o.status === 'Needs Admin Review',
    ).length;

    const verifiedPayments = db.orders.filter(
      (o) => o.status === 'Verified' || o.status === 'Completed',
    ).length;

    const paidEnrollments = db.enrollments.filter(
      (e) => e.status === 'Verified' || e.status === 'Completed',
    );
    const uniqueStudents = new Set(paidEnrollments.map((e) => e.userId)).size;

    return res.json({
      stats: {
        todayOrdersCount: todayOrders.length,
        todayTotalSales: Math.round(todaySales * 100) / 100,
        pendingPayments,
        verifiedPayments,
        newStudentsCount: uniqueStudents,
        activeCoursesCount: db.courses.length,
      },
      orders: db.orders,
      courses: db.courses,
      enrollments: db.enrollments,
      customRequests: db.customRequests,
      notifications: db.notifications.slice(0, 20),
    });
  });

  app.patch('/api/admin/custom-requests/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { quotedAmount, adminNote } = req.body as {
      quotedAmount?: number;
      adminNote?: string;
    };
    const priceCheck = validateAdminCustomQuoteAmount(Number(quotedAmount));
    if (!priceCheck.valid) {
      return res.status(400).json({ error: priceCheck.error });
    }

    const db = loadDb();
    const idx = db.customRequests.findIndex((r) => r.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Custom request not found.' });
    }

    const now = new Date().toISOString();
    const updated: CustomProjectRequest = {
      ...db.customRequests[idx],
      quotedAmount: priceCheck.rounded,
      adminNote: adminNote !== undefined ? adminNote.trim() : db.customRequests[idx].adminNote,
      status: 'Quoted',
      updatedAt: now,
    };
    db.customRequests[idx] = updated;
    saveDb(db);
    return res.json({ request: updated });
  });

  app.patch('/api/admin/orders/:id', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { status, adminNote } = req.body as { status?: Order['status']; adminNote?: string };
    const allowedStatuses: Order['status'][] = [
      'Pending Payment',
      'Payment Submitted',
      'Verified',
      'Needs Admin Review',
      'Completed',
      'Rejected',
    ];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }

    const db = loadDb();
    const idx = db.orders.findIndex((o) => o.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const now = new Date().toISOString();
    const previousStatus = db.orders[idx].status;
    const subscriptionExpiresAt =
      db.orders[idx].type === 'studio_premium' &&
      (status === 'Verified' || status === 'Completed')
        ? db.orders[idx].subscriptionExpiresAt ||
          new Date(Date.now() + STUDIO_PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
        : db.orders[idx].subscriptionExpiresAt;

    const updated = {
      ...db.orders[idx],
      status,
      subscriptionExpiresAt,
      adminNote: adminNote !== undefined ? adminNote : db.orders[idx].adminNote,
      updatedAt: now,
    };
    db.orders[idx] = updated;

    // Sync course enrollment if course order
    if (updated.type === 'course' && updated.courseId) {
      const enrIdx = db.enrollments.findIndex(
        (e) => e.orderId === updated.id || (e.courseId === updated.courseId && e.userId === updated.userId),
      );
      if (enrIdx >= 0) {
        db.enrollments[enrIdx] = {
          ...db.enrollments[enrIdx],
          status,
          updatedAt: now,
        };
      }
    }

    // Decrement product stock if moving to Verified/Completed for store order first time
    if (
      updated.type === 'store' &&
      (status === 'Verified' || status === 'Completed') &&
      previousStatus !== 'Verified' &&
      previousStatus !== 'Completed'
    ) {
      for (const item of updated.items) {
        const prodIdx = db.products.findIndex((p) => p.id === item.productId);
        if (prodIdx >= 0) {
          db.products[prodIdx].stock = Math.max(
            0,
            db.products[prodIdx].stock - item.quantity,
          );
        }
      }
    }

    saveDb(db);
    return res.json({ order: updated });
  });

  app.post('/api/admin/notifications/read', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const db = loadDb();
    db.notifications = db.notifications.map((n) => ({ ...n, read: true }));
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== STUDIO PROJECTS ====================
  app.get('/api/studio-projects', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const projects = db.studioProjects
      .filter((p) => p.userId === session.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return res.json({ projects });
  });

  app.post('/api/studio-projects', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = req.body as Partial<StudioProject>;
    const now = new Date().toISOString();
    const db = loadDb();

    if (body.id) {
      const idx = db.studioProjects.findIndex(
        (p) => p.id === body.id && p.userId === session.id,
      );
      if (idx >= 0) {
        db.studioProjects[idx] = {
          ...db.studioProjects[idx],
          title: (body.title || db.studioProjects[idx].title).trim(),
          aspectRatio: body.aspectRatio || db.studioProjects[idx].aspectRatio,
          filter: body.filter || db.studioProjects[idx].filter,
          brightness: body.brightness ?? db.studioProjects[idx].brightness,
          contrast: body.contrast ?? db.studioProjects[idx].contrast,
          saturation: body.saturation ?? db.studioProjects[idx].saturation,
          grayscale: body.grayscale ?? db.studioProjects[idx].grayscale ?? 0,
          sepia: body.sepia ?? db.studioProjects[idx].sepia ?? 0,
          blur: body.blur ?? db.studioProjects[idx].blur ?? 0,
          videoEffect: body.videoEffect ?? db.studioProjects[idx].videoEffect ?? 'none',
          effectIntensity: body.effectIntensity ?? db.studioProjects[idx].effectIntensity ?? 65,
          canvasBackground: body.canvasBackground ?? db.studioProjects[idx].canvasBackground ?? 'navy',
          clips: Array.isArray(body.clips) ? body.clips : db.studioProjects[idx].clips,
          updatedAt: now,
        };
        saveDb(db);
        return res.json({ project: db.studioProjects[idx] });
      }
    }

    const project: StudioProject = {
      id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: session.id,
      title: (body.title || 'Untitled Studio Cut').trim(),
      aspectRatio: body.aspectRatio || '16:9',
      filter: body.filter || 'none',
      brightness: body.brightness ?? 100,
      contrast: body.contrast ?? 100,
      saturation: body.saturation ?? 100,
      grayscale: body.grayscale ?? 0,
      sepia: body.sepia ?? 0,
      blur: body.blur ?? 0,
      videoEffect: body.videoEffect ?? 'none',
      effectIntensity: body.effectIntensity ?? 65,
      canvasBackground: body.canvasBackground ?? 'navy',
      clips: Array.isArray(body.clips) ? body.clips : [],
      createdAt: now,
      updatedAt: now,
    };
    db.studioProjects.unshift(project);
    saveDb(db);
    return res.status(201).json({ project });
  });

  app.delete('/api/studio-projects/:id', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    db.studioProjects = db.studioProjects.filter(
      (p) => !(p.id === req.params.id && p.userId === session.id),
    );
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== UPLOADS ====================
  app.post('/api/uploads/image', (req, res) => {
    const session = requireVerifiedAdmin(req, res);
    if (!session) return;
    const { base64Image, mimeType, fileSize } = req.body as {
      base64Image?: string;
      mimeType?: string;
      fileSize?: number;
    };
    if (!ALLOWED_IMAGE_MIME_TYPES.includes((mimeType || '').toLowerCase())) {
      return res.status(400).json({ error: 'Only PNG, JPG, and WEBP images are allowed.' });
    }
    if (Number(fileSize ?? 0) > MAX_UPLOAD_BYTES || !base64Image) {
      return res.status(400).json({ error: 'Image must be under 5 MB.' });
    }
    const saved = saveUploadedImage(base64Image, mimeType || 'image/png', 'prod');
    return res.json({ url: saved.publicUrl });
  });

  app.get('/api/uploads/:filename', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const filename = req.params.filename;
    if (filename.startsWith('pay_') && !session.adminPasscodeVerified) {
      const db = loadDb();
      const ownsOrder = db.orders.some(
        (o) => o.userId === session.id && o.screenshotUrl?.endsWith(`/${filename}`),
      );
      if (!ownsOrder) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
    }
    const filePath = getUploadFilePath(filename);
    if (!filePath) {
      return res.status(404).json({ error: 'File not found.' });
    }
    return res.sendFile(filePath);
  });

  // ==================== GEMINI AI ASSISTANT ====================
  app.post('/api/ai/chat', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { message, history, context } = req.body as {
      message?: string;
      history?: { role: 'user' | 'model'; text: string }[];
      context?: Record<string, unknown>;
    };
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const db = loadDb();
    const userCart = db.carts[session.id] || [];
    const cartTotals = calculateCartTotals(userCart);
    const userQuotes = filterCustomRequestsForUser(db.customRequests, session.id);
    const productsSummary = db.products
      .slice(0, 10)
      .map((p) => `${p.name} (${p.price > 0 ? `₹${p.price}${p.priceUnit ? ` ${p.priceUnit}` : ''}` : 'Custom Quote'})`)
      .join(', ');
    const customQuotesSummary =
      userQuotes.length > 0
        ? userQuotes
            .map((q) => `${q.productName}: ${q.status}${q.quotedAmount ? ` (₹${q.quotedAmount})` : ''}`)
            .join('; ')
        : 'None';

    const aiResult = await chatWithPrimeXAssistant(
      message.trim(),
      Array.isArray(history) ? history : [],
      {
        userName: session.name,
        activeTab: String(context?.activeTab || 'Home'),
        cartCount: cartTotals.itemCount,
        cartSubtotal: cartTotals.subtotal,
        productsCount: db.products.length,
        products: db.products,
        productsSummary,
        customQuotesSummary,
        coursesCount: db.courses.length,
        recentWarnings: Array.isArray(context?.recentWarnings)
          ? (context?.recentWarnings as string[])
          : [],
      },
    );

    return res.json({
      reply: aiResult.reply,
      actions: aiResult.actions,
      upiNumber: ADMIN_PAYMENT_UPI_NUMBER,
    });
  });

  // ==================== SUNO-STYLE MUSIC STUDIO ENDPOINTS ====================
  app.get('/api/music/tracks', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const tracks = db.musicTracks
      .filter((t) => t.userId === session.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ tracks });
  });

  app.post('/api/music/generate', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const {
      mode,
      title,
      prompt,
      lyrics,
      styles,
      mood,
      vocalStyle,
      bpm,
      instrumental,
      model,
      imageBase64,
      imageMimeType,
    } = req.body as {
      mode?: 'simple' | 'custom';
      title?: string;
      prompt?: string;
      lyrics?: string;
      styles?: string[];
      mood?: string;
      vocalStyle?: string;
      bpm?: number;
      instrumental?: boolean;
      model?: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    const cleanPrompt = (prompt || '').trim();
    const cleanLyrics = (lyrics || '').trim();
    if (!cleanPrompt && !cleanLyrics) {
      return res.status(400).json({ error: 'Please enter a song prompt or custom lyrics.' });
    }

    try {
      const result = await generateStudioMusic({
        mode: mode === 'custom' ? 'custom' : 'simple',
        title,
        prompt: cleanPrompt || cleanLyrics,
        lyrics: cleanLyrics,
        styles: Array.isArray(styles) ? styles : [],
        mood,
        vocalStyle,
        bpm: Number(bpm || 118),
        instrumental: Boolean(instrumental),
        model,
        imageBase64,
        imageMimeType,
      });

      const savedAudio = saveUploadedAudio(result.audioBase64, result.mimeType, 'music');
      let coverUrl: string | undefined;
      if (imageBase64 && imageMimeType) {
        try {
          const savedCover = saveUploadedImage(imageBase64, imageMimeType, 'cover');
          coverUrl = savedCover.publicUrl;
        } catch {
          // Ignore invalid optional cover
        }
      }

      const now = new Date().toISOString();
      const track: GeneratedMusicTrack = {
        id: `trk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: session.id,
        title:
          (title || '').trim() ||
          cleanPrompt.split(/\s+/).slice(0, 4).join(' ') ||
          'Prime X Track',
        mode: mode === 'custom' ? 'custom' : 'simple',
        prompt: cleanPrompt || cleanLyrics,
        lyrics: result.lyrics,
        styles: Array.isArray(styles) ? styles.filter(Boolean) : [],
        mood: (mood || '').trim() || undefined,
        vocalStyle: (vocalStyle || '').trim() || undefined,
        bpm: Math.max(60, Math.min(180, Math.round(Number(bpm || 118)))),
        instrumental: Boolean(instrumental),
        model: result.model,
        engine: result.engine,
        engineNote: result.engineNote,
        mimeType: result.mimeType,
        audioUrl: savedAudio.publicUrl,
        durationSeconds: result.durationSeconds,
        coverUrl,
        createdAt: now,
      };

      const db = loadDb();
      db.musicTracks.unshift(track);
      saveDb(db);
      return res.status(201).json({ track });
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  app.get('/api/music/tracks/:id/download', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const track = db.musicTracks.find(
      (t) => t.id === req.params.id && t.userId === session.id,
    );
    if (!track) {
      return res.status(404).json({ error: 'Track not found.' });
    }
    const filenameSlug =
      track.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'primex-track';
    const audioFilename = track.audioUrl.split('/').pop() || '';
    const diskPath = getUploadFilePath(audioFilename);
    if (!diskPath) {
      return res.status(404).json({ error: 'Audio file not found on server.' });
    }
    try {
      const rawBuf = await fs.readFile(diskPath);
      let outBuf = rawBuf;
      if (!track.mimeType.includes('mpeg') && !audioFilename.endsWith('.mp3')) {
        const converted = await transcodeAudioBase64ToMp3(
          rawBuf.toString('base64'),
          track.mimeType || 'audio/wav',
        );
        outBuf = Buffer.from(converted.audioBase64, 'base64');
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filenameSlug}.mp3"`,
      );
      return res.send(outBuf);
    } catch {
      return res.status(500).json({ error: 'Failed to prepare MP3 download.' });
    }
  });

  app.delete('/api/music/tracks/:id', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    db.musicTracks = db.musicTracks.filter(
      (t) => !(t.id === req.params.id && t.userId === session.id),
    );
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== GAME CREATOR ENDPOINTS ====================
  app.get('/api/games', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    const games = db.gameProjects
      .filter((g) => g.userId === session.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return res.json({ games });
  });

  app.post('/api/games', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const body = req.body as Partial<GameProject>;
    const cleanTitle = (body.title || '').trim();
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Game title is required.' });
    }

    const db = loadDb();
    const now = new Date().toISOString();

    if (body.id) {
      const idx = db.gameProjects.findIndex(
        (g) => g.id === body.id && g.userId === session.id,
      );
      if (idx >= 0) {
        const cur = db.gameProjects[idx];
        db.gameProjects[idx] = {
          ...cur,
          title: cleanTitle.slice(0, 48),
          subtitle: (body.subtitle ?? cur.subtitle).trim().slice(0, 80),
          theme: body.theme || cur.theme,
          ability: body.ability || cur.ability,
          heroSpeed: Math.max(180, Math.min(440, Number(body.heroSpeed ?? cur.heroSpeed))),
          enemySpawnRate: Math.max(1, Math.min(5, Number(body.enemySpawnRate ?? cur.enemySpawnRate))),
          difficulty: body.difficulty || cur.difficulty,
          winTargetScore: Math.max(500, Math.min(10000, Number(body.winTargetScore ?? cur.winTargetScore))),
          soundEnabled: body.soundEnabled ?? cur.soundEnabled,
          updatedAt: now,
        };
        saveDb(db);
        return res.json({ game: db.gameProjects[idx] });
      }
    }

    const game: GameProject = {
      id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: session.id,
      title: cleanTitle.slice(0, 48),
      subtitle: (body.subtitle || 'Custom PRIME X Arcade Build').trim().slice(0, 80),
      theme: body.theme || 'orbital_gold',
      ability: body.ability || 'twin_laser',
      heroSpeed: Math.max(180, Math.min(440, Number(body.heroSpeed || 310))),
      enemySpawnRate: Math.max(1, Math.min(5, Number(body.enemySpawnRate || 3))),
      difficulty: body.difficulty || 'arcade',
      winTargetScore: Math.max(500, Math.min(10000, Number(body.winTargetScore || 1500))),
      soundEnabled: body.soundEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    db.gameProjects.unshift(game);
    saveDb(db);
    return res.status(201).json({ game });
  });

  app.delete('/api/games/:id', (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const db = loadDb();
    db.gameProjects = db.gameProjects.filter(
      (g) => !(g.id === req.params.id && g.userId === session.id),
    );
    saveDb(db);
    return res.json({ ok: true });
  });

  // ==================== PRIME X STUDIO AI ENDPOINTS ====================
  app.post('/api/ai/studio/music', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const {
      prompt,
      model,
      imageBase64,
      imageMimeType,
      lyrics,
      instrumental,
    } = req.body as {
      prompt?: string;
      model?: string;
      imageBase64?: string;
      imageMimeType?: string;
      lyrics?: string;
      instrumental?: boolean;
    };
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Please describe the music track you want to generate.' });
    }
    try {
      const result = await generateStudioMusic({
        mode: lyrics && lyrics.trim() ? 'custom' : 'simple',
        prompt: prompt.trim(),
        lyrics: lyrics?.trim(),
        instrumental: Boolean(instrumental),
        model,
        imageBase64,
        imageMimeType,
      });
      return res.json(result);
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/ai/studio/image', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const {
      prompt,
      imageBase64,
      imageMimeType,
      aspectRatio,
      imageSize,
      enableWebSearch,
    } = req.body as {
      prompt?: string;
      imageBase64?: string;
      imageMimeType?: string;
      aspectRatio?: string;
      imageSize?: '1K' | '2K' | '4K';
      enableWebSearch?: boolean;
    };
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Please enter a prompt to create or edit an image.' });
    }
    try {
      const result = await generateOrEditStudioImage({
        prompt: prompt.trim(),
        imageBase64,
        imageMimeType,
        aspectRatio,
        imageSize,
        enableWebSearch: Boolean(enableWebSearch),
      });
      return res.json(result);
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/ai/studio/video', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const {
      mode,
      prompt,
      imageBase64,
      imageMimeType,
      videoBase64,
      videoMimeType,
      aspectRatio,
      duration,
      resolution,
      previousInteractionId,
    } = req.body as {
      mode?: 'text_to_video' | 'image_to_video' | 'video_to_video';
      prompt?: string;
      imageBase64?: string;
      imageMimeType?: string;
      videoBase64?: string;
      videoMimeType?: string;
      aspectRatio?: string;
      duration?: string;
      resolution?: '360p' | '720p' | '1080p';
      previousInteractionId?: string;
    };
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a prompt describing the video motion or scene.' });
    }
    if (mode === 'image_to_video' && !imageBase64 && !previousInteractionId) {
      return res.status(400).json({ error: 'Please upload a photo to animate into video.' });
    }
    if (mode === 'video_to_video' && !videoBase64 && !previousInteractionId) {
      return res.status(400).json({ error: 'Please upload a video clip to edit or extend.' });
    }
    try {
      const normalizedMode =
        mode === 'image_to_video'
          ? 'image_to_video'
          : mode === 'video_to_video'
            ? 'video_to_video'
            : 'text_to_video';
      const result = await generateStudioVideo({
        mode: normalizedMode,
        prompt: prompt.trim(),
        imageBase64,
        imageMimeType,
        videoBase64,
        videoMimeType,
        aspectRatio,
        duration,
        resolution,
        previousInteractionId,
      });
      return res.json(result);
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/ai/studio/transcribe', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { audioBase64, mimeType, formatMode } = req.body as {
      audioBase64?: string;
      mimeType?: string;
      formatMode?: 'plain' | 'timestamps' | 'lyrics';
    };
    if (!audioBase64 || audioBase64.length < 16) {
      return res.status(400).json({ error: 'Valid audio data is required for transcription.' });
    }
    try {
      const result = await transcribeStudioAudio({
        audioBase64,
        mimeType: mimeType || 'audio/webm',
        formatMode,
      });
      return res.json(result);
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  app.post('/api/ai/studio/chat', async (req, res) => {
    const session = requireAuth(req, res);
    if (!session) return;
    const { model, systemInstruction, message, history } = req.body as {
      model?: string;
      systemInstruction?: string;
      message?: string;
      history?: { role: 'user' | 'model'; text: string }[];
    };
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please enter a message.' });
    }
    try {
      const result = await chatWithStudioModels({
        model: model || 'gemini-4-hydrogen',
        systemInstruction: systemInstruction || '',
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
      });
      return res.json(result);
    } catch (error) {
      const classified = classifyStudioGeminiError(error);
      return res.status(classified.status).json({ error: classified.message });
    }
  });

  // ==================== STUDIO MULTI-FORMAT TRANSCODER (MP4 / WEBM / MOV) ====================
  const execFileAsync = promisify(execFile);

  app.post(
    '/api/studio/export-transcode',
    express.raw({ type: ['video/*', 'application/octet-stream'], limit: '80mb' }),
    async (req, res) => {
      const session = requireAuth(req, res);
      if (!session) return;

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'No video payload received for export transcoding.' });
      }

      const targetFormat = normalizeExportFormat(String(req.query.format || 'mp4'));
      const rawName = String(req.query.filename || `primex_export.${targetFormat}`).replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );
      const parsedTrimStart = Number(req.query.trimStart);
      const parsedTrimDuration = Number(req.query.trimDuration);
      const trimArgs: string[] = [];
      if (Number.isFinite(parsedTrimStart) && parsedTrimStart > 0) {
        trimArgs.push('-ss', parsedTrimStart.toFixed(2));
      }
      if (Number.isFinite(parsedTrimDuration) && parsedTrimDuration >= 0.3) {
        trimArgs.push('-t', parsedTrimDuration.toFixed(2));
      }

      const tokenId = crypto.randomUUID();
      const inputExt = String(req.headers['content-type'] || '').includes('mp4') ? 'mp4' : 'webm';
      const inPath = path.join(os.tmpdir(), `primex-in-${tokenId}.${inputExt}`);
      const outPath = path.join(os.tmpdir(), `primex-out-${tokenId}.${targetFormat}`);

      try {
        await fs.writeFile(inPath, req.body);

        const codecArgs =
          targetFormat === 'webm'
            ? [
                '-c:v',
                'libvpx',
                '-b:v',
                '1400k',
                '-deadline',
                'realtime',
                '-cpu-used',
                '4',
                '-c:a',
                'libopus',
                outPath,
              ]
            : targetFormat === 'mov'
              ? [
                  '-c:v',
                  'libx264',
                  '-preset',
                  'veryfast',
                  '-pix_fmt',
                  'yuv420p',
                  '-c:a',
                  'aac',
                  '-b:a',
                  '128k',
                  outPath,
                ]
              : [
                  '-c:v',
                  'libx264',
                  '-preset',
                  'veryfast',
                  '-pix_fmt',
                  'yuv420p',
                  '-movflags',
                  '+faststart',
                  '-c:a',
                  'aac',
                  '-b:a',
                  '128k',
                  outPath,
                ];

        const ffmpegArgs = ['-y', ...trimArgs, '-i', inPath, ...codecArgs];

        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 90_000 });
        const outBuffer = await fs.readFile(outPath);

        const mimeType =
          targetFormat === 'webm'
            ? 'video/webm'
            : targetFormat === 'mov'
              ? 'video/quicktime'
              : 'video/mp4';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${rawName}"`);
        return res.send(outBuffer);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Video transcoding failed.';
        return res.status(500).json({ error: `Export conversion failed: ${msg}` });
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    },
  );

  // ==================== VITE / STATIC SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PRIME X INNOVATION server running on http://localhost:${PORT}`);
  });
}

startServer();
