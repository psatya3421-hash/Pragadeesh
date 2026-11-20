export type UserRole = 'customer' | 'admin' | 'super_admin';

export type HomeTab = 'projects' | 'studio' | 'music' | 'games' | 'classes';

export type OrderStatus =
  | 'Pending Payment'
  | 'Payment Submitted'
  | 'Verified'
  | 'Needs Admin Review'
  | 'Completed'
  | 'Rejected';

export type AIVerificationVerdict =
  | 'Amount matches'
  | 'Amount mismatch'
  | 'Unclear screenshot';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isAdminAccount: boolean;
  isSuperAdmin: boolean;
  adminPasscodeVerified: boolean;
  provider: 'password' | 'google';
  createdAt: string;
}

export type ProductKind = 'standard' | 'webpage' | 'other_idea';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  priceUnit?: string;
  category: string;
  stock: number;
  imageUrl: string;
  kind?: ProductKind;
  createdAt: string;
  updatedAt: string;
}

export type CustomRequestType = 'webpage' | 'other_idea';
export type CustomRequestStatus = 'Awaiting Quote' | 'Quoted' | 'Ordered';

export interface CustomProjectRequest {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  productId: string;
  productName: string;
  requestType: CustomRequestType;
  contactNumber: string;
  description: string;
  backgroundTheme?: string;
  sampleWebpageUrl?: string;
  status: CustomRequestStatus;
  quotedAmount?: number;
  adminNote?: string;
  linkedOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAddress {
  id: string;
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
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  imageUrl: string;
  quantity: number;
  stock: number;
}

export interface AIVerificationResult {
  verdict: AIVerificationVerdict;
  extractedAmount: number | null;
  dateTime: string | null;
  status: 'success' | 'failed' | 'unknown';
  receiverNumber: string | null;
  receiverMatches: boolean;
  utrId: string | null;
  suspiciousDuplicate: boolean;
  duplicateReason?: string;
  isWrongPayment?: boolean;
  summary: string;
  confidence: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  type: 'store' | 'course' | 'studio_4k' | 'studio_premium' | 'game_download';
  items: OrderItem[];
  deliveryAddress?: DeliveryAddress;
  courseId?: string;
  courseTitle?: string;
  gameId?: string;
  gameTitle?: string;
  subscriptionExpiresAt?: string;
  totalAmount: number;
  status: OrderStatus;
  screenshotUrl?: string;
  screenshotHash?: string;
  utrId?: string;
  aiVerification?: AIVerificationResult;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  schedule: string;
  fee: number;
  meetingLink?: string;
  whatsappNumber?: string;
  createdAt: string;
  updatedAt: string;
  isEnrolled?: boolean;
  enrollmentStatus?: OrderStatus | null;
}

export type AttendanceStatus = 'present' | 'absent' | 'unmarked';

export interface Enrollment {
  id: string;
  courseId: string;
  courseTitle: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  phone?: string;
  orderId: string;
  status: OrderStatus;
  attendance?: AttendanceStatus;
  fee: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRecord {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  passcodeHash: string;
  failedAttempts: number;
  lockedUntil: number | null;
  createdAt: string;
}

export interface AdminPublicInfo {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  createdAt: string;
}

export interface AdminNotification {
  id: string;
  message: string;
  orderId: string;
  type: 'verified' | 'review' | 'order' | 'quote';
  read: boolean;
  createdAt: string;
}

export type AspectRatioPreset = '16:9' | '9:16' | '1:1' | '4:5' | '21:9';
export type ExportResolution = '480p' | '720p' | '1080p' | '4k';
export type StudioFilterPreset =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'cinema_gold'
  | 'midnight_noir'
  | 'warm_vintage'
  | 'crisp_vivid';

export type StudioTransitionPreset =
  | 'none'
  | 'dissolve'
  | 'slide_left'
  | 'zoom_in'
  | 'wipe_right'
  | 'flash_white';

export type StudioKeyframeMotion =
  | 'none'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right';

export type StudioTextStyle =
  | 'classic'
  | 'bold_yellow'
  | 'neon_box'
  | 'karaoke'
  | 'minimal_sub';

export type StudioTextAnimation =
  | 'none'
  | 'pop_in'
  | 'typewriter'
  | 'slide_up'
  | 'bounce';

export type StudioVideoEffectPreset =
  | 'none'
  | 'vignette'
  | 'vhs'
  | 'glitch_rgb'
  | 'film_grain'
  | 'mirror_split'
  | 'dream_glow'
  | 'zoom_pulse';

export type StudioCanvasBackground =
  | 'navy'
  | 'black'
  | 'blur_fill'
  | 'sunset'
  | 'studio_matte';

export interface StudioClip {
  id: string;
  track: 'video' | 'audio' | 'text';
  kind: 'video' | 'image' | 'audio' | 'sfx' | 'text' | 'sticker';
  name: string;
  src?: string;
  sfxType?: 'ambient_pad' | 'cinematic_hit' | 'whoosh' | 'chime' | 'lofi_beat';
  startTime: number;
  duration: number;
  trimStart: number;
  sourceDuration?: number;
  speed: number;
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  scale?: number;
  opacity?: number;
  reverse?: boolean;
  transition?: StudioTransitionPreset;
  transitionDuration?: number;
  keyframeMotion?: StudioKeyframeMotion;
  chromaKeyEnabled?: boolean;
  chromaKeyColor?: 'green' | 'blue';
  chromaKeyTolerance?: number;
  textContent?: string;
  textColor?: string;
  fontSize?: number;
  textStyle?: StudioTextStyle;
  textAnimation?: StudioTextAnimation;
  stickerSymbol?: string;
  posX?: number;
  posY?: number;
}

export interface StudioProject {
  id: string;
  userId: string;
  title: string;
  aspectRatio: AspectRatioPreset;
  filter: StudioFilterPreset;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale?: number;
  sepia?: number;
  blur?: number;
  videoEffect?: StudioVideoEffectPreset;
  effectIntensity?: number;
  canvasBackground?: StudioCanvasBackground;
  clips: StudioClip[];
  updatedAt: string;
  createdAt: string;
}

export interface GeneratedMusicTrack {
  id: string;
  userId: string;
  title: string;
  mode: 'simple' | 'custom';
  prompt: string;
  lyrics: string;
  styles: string[];
  mood?: string;
  vocalStyle?: string;
  bpm: number;
  instrumental: boolean;
  model: string;
  engine: 'lyria-3' | 'synth-preview';
  engineNote?: string;
  mimeType: string;
  audioUrl: string;
  durationSeconds: number;
  coverUrl?: string;
  createdAt: string;
}

export type GameThemeId = 'orbital_gold' | 'neon_cyber' | 'deep_sea' | 'crimson_forge';
export type HeroAbilityId = 'twin_laser' | 'spread_shot' | 'nova_pulse';

export interface GameProject {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  theme: GameThemeId;
  ability: HeroAbilityId;
  heroSpeed: number;
  enemySpawnRate: number;
  difficulty: 'casual' | 'arcade' | 'hardcore';
  winTargetScore: number;
  soundEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type JarvisAction =
  | { type: 'navigate_tab'; tab: HomeTab }
  | { type: 'set_store_view'; subView: 'catalog' | 'cart' | 'orders' }
  | { type: 'filter_catalog'; searchQuery?: string; category?: string }
  | { type: 'clear_catalog_filters' }
  | {
      type: 'order_product';
      productQuery: string;
      quantity?: number;
      openCart?: boolean;
      openCheckout?: boolean;
    }
  | { type: 'open_address_checkout' };
