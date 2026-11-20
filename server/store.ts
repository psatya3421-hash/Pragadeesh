import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AdminNotification,
  AdminRecord,
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
} from '../src/types';
import { CATALOG_DEFAULT_ITEMS, SUPER_ADMIN_EMAIL } from '../src/lib/domainLogic';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  provider: 'password' | 'google';
  createdAt: string;
}

export interface DatabaseSchema {
  users: StoredUser[];
  admins: AdminRecord[];
  products: Product[];
  customRequests: CustomProjectRequest[];
  addresses: Record<string, DeliveryAddress[]>;
  defaultCatalogSeeded?: boolean;
  carts: Record<string, CartItem[]>;
  orders: Order[];
  courses: Course[];
  enrollments: Enrollment[];
  studioProjects: StudioProject[];
  musicTracks: GeneratedMusicTrack[];
  gameProjects: GameProject[];
  notifications: AdminNotification[];
  sessionSecret: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export function hashSecret(value: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(value: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(value, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function buildSeededDefaultProducts(now: string): Product[] {
  return CATALOG_DEFAULT_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    priceUnit: item.priceUnit,
    category: item.category,
    stock: item.stock,
    imageUrl: item.imageUrl,
    kind: item.kind,
    createdAt: now,
    updatedAt: now,
  }));
}

function createInitialDb(): DatabaseSchema {
  const now = new Date().toISOString();
  const initialAdminEmail = SUPER_ADMIN_EMAIL.toLowerCase();
  const defaultPasscode = process.env.SUPER_ADMIN_INITIAL_PASSCODE || '2012';
  return {
    users: [],
    admins: [
      {
        id: 'admin_super_1',
        email: initialAdminEmail,
        name: 'Super Admin',
        isSuperAdmin: true,
        passcodeHash: hashSecret(defaultPasscode),
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: now,
      },
    ],
    products: buildSeededDefaultProducts(now),
    customRequests: [],
    addresses: {},
    defaultCatalogSeeded: true,
    carts: {},
    orders: [],
    courses: [],
    enrollments: [],
    studioProjects: [],
    musicTracks: [],
    gameProjects: [],
    notifications: [],
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  };
}

let cachedDb: DatabaseSchema | null = null;

export function loadDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  ensureDirectories();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    cachedDb = initial;
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed.admins || parsed.admins.length === 0) {
      const initial = createInitialDb();
      parsed.admins = initial.admins;
    }
    if (!parsed.sessionSecret) {
      parsed.sessionSecret = crypto.randomBytes(32).toString('hex');
    }

    const existingProducts = Array.isArray(parsed.products) ? parsed.products : [];
    let resolvedProducts = existingProducts;
    let seededFlag = Boolean(parsed.defaultCatalogSeeded);

    if (!seededFlag) {
      const now = new Date().toISOString();
      const existingIds = new Set(existingProducts.map((p) => p.id));
      const missingDefaults = buildSeededDefaultProducts(now).filter(
        (item) => !existingIds.has(item.id),
      );
      resolvedProducts = [...existingProducts, ...missingDefaults];
      seededFlag = true;
    }

    cachedDb = {
      users: parsed.users || [],
      admins: parsed.admins || [],
      products: resolvedProducts,
      customRequests: Array.isArray(parsed.customRequests) ? parsed.customRequests : [],
      addresses: parsed.addresses || {},
      defaultCatalogSeeded: seededFlag,
      carts: parsed.carts || {},
      orders: parsed.orders || [],
      courses: parsed.courses || [],
      enrollments: parsed.enrollments || [],
      studioProjects: parsed.studioProjects || [],
      musicTracks: Array.isArray(parsed.musicTracks) ? parsed.musicTracks : [],
      gameProjects: Array.isArray(parsed.gameProjects) ? parsed.gameProjects : [],
      notifications: parsed.notifications || [],
      sessionSecret: parsed.sessionSecret,
    };
    if (!parsed.defaultCatalogSeeded) {
      saveDb(cachedDb);
    }
    return cachedDb;
  } catch {
    const initial = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    cachedDb = initial;
    return cachedDb;
  }
}

export function saveDb(db: DatabaseSchema): void {
  ensureDirectories();
  cachedDb = db;
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function saveUploadedImage(
  base64Data: string,
  mimeType: string,
  prefix: string,
): { filename: string; sha256: string; publicUrl: string } {
  ensureDirectories();
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
  };
  const ext = extMap[mimeType.toLowerCase()] || 'png';
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);

  return {
    filename,
    sha256,
    publicUrl: `/api/uploads/${filename}`,
  };
}

export function saveUploadedAudio(
  base64Data: string,
  mimeType: string,
  prefix: string,
): { filename: string; publicUrl: string } {
  ensureDirectories();
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  const lower = (mimeType || '').toLowerCase();
  const ext = lower.includes('mpeg') || lower.includes('mp3') ? 'mp3' : 'wav';
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return {
    filename,
    publicUrl: `/api/uploads/${filename}`,
  };
}

export function getUploadFilePath(filename: string): string | null {
  const safeName = path.basename(filename);
  const full = path.join(UPLOADS_DIR, safeName);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function restoreUploadedImage(filename: string, base64Data: string): boolean {
  ensureDirectories();
  const safeName = path.basename(filename);
  if (!safeName || !safeName.startsWith('prod_')) return false;
  const targetPath = path.join(UPLOADS_DIR, safeName);
  if (fs.existsSync(targetPath)) return true;
  const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return false;
  fs.writeFileSync(targetPath, buffer);
  return true;
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  adminPasscodeVerified: boolean;
  iat: number;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionTokenPayload, 'iat' | 'exp'>, secret: string): string {
  const now = Date.now();
  const fullPayload: SessionTokenPayload = {
    ...payload,
    iat: now,
    exp: now + 30 * 24 * 60 * 60 * 1000, // 30 days persistent login
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): SessionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionTokenPayload;
    if (!parsed.userId || !parsed.email || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
