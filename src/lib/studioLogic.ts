import type {
  AspectRatioPreset,
  ExportResolution,
  Order,
  StudioCanvasBackground,
  StudioClip,
  StudioFilterPreset,
  StudioKeyframeMotion,
  StudioTextAnimation,
  StudioTextStyle,
  StudioTransitionPreset,
  StudioVideoEffectPreset,
} from '../types';

export const STUDIO_4K_FEE_INR = 10;
export const STUDIO_PREMIUM_MONTHLY_FEE_INR = 49;
export const STUDIO_PREMIUM_DURATION_DAYS = 30;

export function getResolutionFeeINR(resolution: ExportResolution): number {
  return resolution === '4k' ? STUDIO_4K_FEE_INR : 0;
}

export function getExportDimensions(
  aspectRatio: AspectRatioPreset,
  resolution: ExportResolution,
): { width: number; height: number } {
  const heightMap: Record<ExportResolution, number> = {
    '480p': 480,
    '720p': 720,
    '1080p': 1080,
    '4k': 2160,
  };
  const base = heightMap[resolution] || 720;
  switch (aspectRatio) {
    case '9:16':
      return { width: base, height: Math.round((base * 16) / 9) };
    case '4:5':
      return { width: Math.round((base * 4) / 5), height: base };
    case '21:9':
      return { width: Math.round((base * 21) / 9), height: base };
    case '1:1':
      return { width: base, height: base };
    case '16:9':
    default:
      return { width: Math.round((base * 16) / 9), height: base };
  }
}

export function getCanvasDimensions(aspectRatio: AspectRatioPreset): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 540, height: 960 };
    case '4:5':
      return { width: 640, height: 800 };
    case '21:9':
      return { width: 1050, height: 450 };
    case '1:1':
      return { width: 720, height: 720 };
    case '16:9':
    default:
      return { width: 960, height: 540 };
  }
}

export interface StudioFilterAdjustments {
  grayscale?: number;
  sepia?: number;
  blur?: number;
}

export const DEFAULT_STUDIO_FILTERS = {
  filter: 'none' as StudioFilterPreset,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
};

export function buildCanvasFilterString(
  preset: StudioFilterPreset,
  brightness: number,
  contrast: number,
  saturation: number,
  adjustments: StudioFilterAdjustments = {},
): string {
  const b = Math.max(20, Math.min(200, brightness));
  const c = Math.max(20, Math.min(200, contrast));
  const s = Math.max(0, Math.min(200, saturation));
  const g = Math.max(0, Math.min(100, adjustments.grayscale ?? 0));
  const sep = Math.max(0, Math.min(100, adjustments.sepia ?? 0));
  const bl = Math.max(0, Math.min(10, adjustments.blur ?? 0));

  const parts = [`brightness(${b}%)`, `contrast(${c}%)`, `saturate(${s}%)`];
  if (g > 0) parts.push(`grayscale(${g}%)`);
  if (sep > 0) parts.push(`sepia(${sep}%)`);
  if (bl > 0) parts.push(`blur(${bl}px)`);

  switch (preset) {
    case 'grayscale':
      if (g === 0) parts.push('grayscale(100%)');
      break;
    case 'sepia':
      if (sep === 0) parts.push('sepia(100%)');
      break;
    case 'cinema_gold':
      parts.push('sepia(22%) hue-rotate(-8deg)');
      break;
    case 'midnight_noir':
      parts.push('grayscale(85%) contrast(115%)');
      break;
    case 'warm_vintage':
      parts.push('sepia(40%)');
      break;
    case 'crisp_vivid':
      parts.push('saturate(130%) contrast(108%)');
      break;
    case 'none':
    default:
      break;
  }

  return parts.join(' ');
}

export function computeTimelineDuration(clips: StudioClip[]): number {
  if (clips.length === 0) return 5;
  let maxEnd = 0;
  for (const clip of clips) {
    const effectiveDur = clip.duration / Math.max(0.25, clip.speed || 1);
    const end = clip.startTime + effectiveDur;
    if (end > maxEnd) maxEnd = end;
  }
  return Math.max(1, Math.round(maxEnd * 100) / 100);
}

export function splitClipAtTime(
  clips: StudioClip[],
  clipId: string,
  playheadTime: number,
): StudioClip[] {
  const idx = clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return clips;

  const target = clips[idx];
  const speed = Math.max(0.25, target.speed || 1);
  const effectiveDuration = target.duration / speed;
  const relativeTime = playheadTime - target.startTime;

  if (relativeTime <= 0.25 || relativeTime >= effectiveDuration - 0.25) {
    return clips;
  }

  const firstSourceDuration = Math.round(relativeTime * speed * 100) / 100;
  const secondSourceDuration = Math.round((target.duration - firstSourceDuration) * 100) / 100;

  const firstHalf: StudioClip = {
    ...target,
    duration: firstSourceDuration,
  };

  const secondHalf: StudioClip = {
    ...target,
    id: `${target.id}_split_${Math.random().toString(36).slice(2, 7)}`,
    name: `${target.name} (Part 2)`,
    startTime: Math.round(playheadTime * 100) / 100,
    trimStart: Math.round((target.trimStart + firstSourceDuration) * 100) / 100,
    duration: secondSourceDuration,
  };

  const next = [...clips];
  next.splice(idx, 1, firstHalf, secondHalf);
  return next;
}

export function trimClip(
  clip: StudioClip,
  newTrimStart: number,
  newDuration: number,
): StudioClip {
  return {
    ...clip,
    trimStart: Math.max(0, Math.round(newTrimStart * 100) / 100),
    duration: Math.max(0.5, Math.round(newDuration * 100) / 100),
  };
}

export function reorderClipsInTrack(
  clips: StudioClip[],
  track: StudioClip['track'],
  fromIndex: number,
  toIndex: number,
): StudioClip[] {
  const trackClips = clips.filter((c) => c.track === track);
  const otherClips = clips.filter((c) => c.track !== track);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= trackClips.length ||
    toIndex >= trackClips.length ||
    fromIndex === toIndex
  ) {
    return clips;
  }

  const reordered = [...trackClips];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  // Re-pack start times sequentially for clean track ordering
  let cursor = 0;
  const packed = reordered.map((clip) => {
    const updated = { ...clip, startTime: Math.round(cursor * 100) / 100 };
    cursor += clip.duration / Math.max(0.25, clip.speed || 1);
    return updated;
  });

  return [...otherClips, ...packed];
}

export function formatMediaFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function extractVideoFormat(fileName?: string, mimeType?: string): string {
  const cleanMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (cleanMime.startsWith('video/')) {
    const sub = cleanMime.slice('video/'.length);
    if (sub === 'quicktime') return 'MOV';
    if (sub === 'x-matroska') return 'MKV';
    if (sub === 'x-msvideo') return 'AVI';
    if (sub === 'x-m4v') return 'M4V';
    if (sub === '3gpp') return '3GP';
    if (sub) return sub.toUpperCase();
  }
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.trim().toUpperCase();
    if (ext && /^[A-Z0-9]{2,6}$/.test(ext)) {
      return ext;
    }
  }
  return 'VIDEO';
}

export function formatVideoResolution(
  width?: number,
  height?: number,
  processed = false,
): string {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return processed ? 'Unavailable' : 'Detecting...';
  }
  const w = Math.round(width);
  const h = Math.round(height);
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  let tier = '';
  if (maxDim >= 3800 || minDim >= 2160) tier = ' (4K)';
  else if (minDim >= 1080) tier = ' (1080p)';
  else if (minDim >= 720) tier = ' (720p)';
  else if (minDim >= 480) tier = ' (480p)';
  return `${w} × ${h}${tier}`;
}

export function formatVideoDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export type VideoExportFormat = 'mp4' | 'webm' | 'mov';

export interface ExportFormatSpec {
  id: VideoExportFormat;
  label: string;
  ext: string;
  mimeType: string;
  description: string;
}

export const EXPORT_FORMAT_OPTIONS: ExportFormatSpec[] = [
  {
    id: 'mp4',
    label: 'MP4 (H.264)',
    ext: 'mp4',
    mimeType: 'video/mp4',
    description: 'Universal playback across phones, social platforms, and editors',
  },
  {
    id: 'webm',
    label: 'WebM (VP9)',
    ext: 'webm',
    mimeType: 'video/webm',
    description: 'Compact web-optimized video container',
  },
  {
    id: 'mov',
    label: 'MOV (QuickTime)',
    ext: 'mov',
    mimeType: 'video/quicktime',
    description: 'QuickTime / NLE pro post-production container',
  },
];

export function normalizeExportFormat(raw?: string): VideoExportFormat {
  const clean = (raw || '').trim().toLowerCase();
  if (clean === 'webm') return 'webm';
  if (clean === 'mov') return 'mov';
  return 'mp4';
}

export function buildExportFilename(
  projectTitle: string,
  resolution: ExportResolution,
  format: VideoExportFormat,
): string {
  const safeBase = (projectTitle || 'PrimeX_Studio_Cut')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'PrimeX_Studio_Cut';
  const fmt = normalizeExportFormat(format);
  return `${safeBase}_${resolution.toUpperCase()}.${fmt}`;
}

export const ASPECT_RATIO_OPTIONS: { id: AspectRatioPreset; label: string; platformHint: string }[] = [
  { id: '16:9', label: '16:9', platformHint: 'YouTube / Cinema' },
  { id: '9:16', label: '9:16', platformHint: 'Reels / Shorts' },
  { id: '1:1', label: '1:1', platformHint: 'Square Feed' },
  { id: '4:5', label: '4:5', platformHint: 'Portrait Post' },
  { id: '21:9', label: '21:9', platformHint: 'Anamorphic' },
];

export const VIDEO_EFFECT_OPTIONS: {
  id: StudioVideoEffectPreset;
  label: string;
  premium: boolean;
  description: string;
}[] = [
  { id: 'none', label: 'Clean', premium: false, description: 'Original untouched frame' },
  { id: 'vignette', label: 'Cinema Vignette', premium: true, description: 'Soft edge framing' },
  { id: 'vhs', label: 'VHS Retro', premium: true, description: 'Analog scanlines & warm chroma' },
  { id: 'glitch_rgb', label: 'RGB Glitch', premium: true, description: 'Dynamic chromatic slice shift' },
  { id: 'film_grain', label: '35mm Film Grain', premium: true, description: 'Organic celluloid texture' },
  { id: 'mirror_split', label: 'Mirror Twin', premium: true, description: 'Symmetrical split reflection' },
  { id: 'dream_glow', label: 'Dreamy Glow', premium: true, description: 'Soft halation highlight bloom' },
  { id: 'zoom_pulse', label: 'Beat Zoom Pulse', premium: true, description: 'Rhythmic camera bump' },
];

export const TRANSITION_OPTIONS: { id: StudioTransitionPreset; label: string; premium: boolean }[] = [
  { id: 'none', label: 'Hard Cut', premium: false },
  { id: 'dissolve', label: 'Cross Dissolve', premium: true },
  { id: 'slide_left', label: 'Slide Reveal', premium: true },
  { id: 'zoom_in', label: 'Lens Zoom In', premium: true },
  { id: 'wipe_right', label: 'Curtain Wipe', premium: true },
  { id: 'flash_white', label: 'White Flash', premium: true },
];

export const KEYFRAME_MOTION_OPTIONS: { id: StudioKeyframeMotion; label: string; premium: boolean }[] = [
  { id: 'none', label: 'Static', premium: false },
  { id: 'zoom_in', label: 'Keyframe Zoom In', premium: true },
  { id: 'zoom_out', label: 'Keyframe Zoom Out', premium: true },
  { id: 'pan_left', label: 'Camera Pan Left', premium: true },
  { id: 'pan_right', label: 'Camera Pan Right', premium: true },
];

export const TEXT_STYLE_OPTIONS: { id: StudioTextStyle; label: string; premium: boolean }[] = [
  { id: 'classic', label: 'Classic Clean', premium: false },
  { id: 'bold_yellow', label: 'CapCut Bold', premium: true },
  { id: 'neon_box', label: 'Highlight Box', premium: true },
  { id: 'karaoke', label: 'Karaoke Pill', premium: true },
  { id: 'minimal_sub', label: 'Cinema Subtitle', premium: true },
];

export const TEXT_ANIMATION_OPTIONS: { id: StudioTextAnimation; label: string; premium: boolean }[] = [
  { id: 'none', label: 'None', premium: false },
  { id: 'pop_in', label: 'Pop In', premium: true },
  { id: 'typewriter', label: 'Typewriter', premium: true },
  { id: 'slide_up', label: 'Slide Up', premium: true },
  { id: 'bounce', label: 'Bounce', premium: true },
];

export const CANVAS_BACKGROUND_OPTIONS: {
  id: StudioCanvasBackground;
  label: string;
  premium: boolean;
}[] = [
  { id: 'navy', label: 'Prime Navy', premium: false },
  { id: 'black', label: 'Studio Black', premium: false },
  { id: 'blur_fill', label: 'Blurred Fill', premium: true },
  { id: 'sunset', label: 'Amber Dusk', premium: true },
  { id: 'studio_matte', label: 'Slate Matte', premium: true },
];

export const PRO_STICKER_PRESETS: { symbol: string; label: string; premium: boolean }[] = [
  { symbol: 'LIVE', label: 'Live Tag', premium: true },
  { symbol: '4K UHD', label: '4K Stamp', premium: true },
  { symbol: 'TRENDING', label: 'Trending', premium: true },
  { symbol: 'SUBSCRIBE', label: 'Subscribe', premium: true },
  { symbol: 'NEW CUT', label: 'Release', premium: true },
  { symbol: 'PRIME PRO', label: 'Pro Crest', premium: true },
];

export const PREMIUM_EDITS_BENEFITS: string[] = [
  'Pro Video FX: VHS Retro, RGB Glitch, 35mm Grain, Mirror Twin, Dreamy Glow, Beat Pulse & Vignette',
  'Cinematic Clip Transitions: Cross Dissolve, Slide Reveal, Lens Zoom, Curtain Wipe & White Flash',
  'Chroma Key Cutout: Real-time Green Screen & Blue Screen background removal',
  'Keyframe Motion, Freeze Frame at Playhead, Reverse Playback & Pro Speed (0.25x to 4x)',
  'Auto-Captions & Kinetic Text Styles (CapCut Bold, Karaoke Pill, Typewriter, Bounce)',
  'Unlimited 4K Ultra HD Exports included during your 30-day pass',
];

export function formatTimestampMMSS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

export function clampTrimWindow(
  startTime: number,
  endTime: number,
  sourceDuration: number,
  minDuration = 0.5,
): { startTime: number; endTime: number; duration: number } {
  const safeMax = Number.isFinite(sourceDuration) && sourceDuration > minDuration
    ? Math.round(sourceDuration * 100) / 100
    : 60;
  const safeMinDur = Math.min(minDuration, safeMax);

  let s = Number.isFinite(startTime) ? startTime : 0;
  let e = Number.isFinite(endTime) ? endTime : safeMax;

  s = Math.max(0, Math.min(safeMax - safeMinDur, s));
  e = Math.max(s + safeMinDur, Math.min(safeMax, e));

  const roundedStart = Math.round(s * 100) / 100;
  const roundedEnd = Math.round(e * 100) / 100;
  const roundedDuration = Math.max(
    safeMinDur,
    Math.round((roundedEnd - roundedStart) * 100) / 100,
  );

  return {
    startTime: roundedStart,
    endTime: roundedEnd,
    duration: roundedDuration,
  };
}

export interface ClipTransformComputed {
  alpha: number;
  scaleX: number;
  scaleY: number;
  rotationRad: number;
  translateXRatio: number;
  translateYRatio: number;
  wipeProgress: number | null;
  flashAlpha: number;
}

export function computeClipTransformState(
  clip: StudioClip,
  localTime: number,
  effectiveDuration: number,
): ClipTransformComputed {
  const safeDur = Math.max(0.25, effectiveDuration);
  const progress = Math.max(0, Math.min(1, localTime / safeDur));

  let alpha = clip.opacity !== undefined ? Math.max(0, Math.min(1, clip.opacity)) : 1;
  if (clip.fadeIn && localTime < 0.6) {
    alpha *= Math.max(0.05, localTime / 0.6);
  }
  if (clip.fadeOut && safeDur - localTime < 0.6) {
    alpha *= Math.max(0.05, (safeDur - localTime) / 0.6);
  }

  let baseScale = clip.scale !== undefined ? Math.max(0.4, Math.min(2.5, clip.scale)) : 1;
  let translateXRatio = 0;
  const translateYRatio = 0;

  switch (clip.keyframeMotion) {
    case 'zoom_in':
      baseScale *= 1 + 0.18 * progress;
      break;
    case 'zoom_out':
      baseScale *= 1.18 - 0.18 * progress;
      break;
    case 'pan_left':
      baseScale *= 1.12;
      translateXRatio = 0.05 - 0.1 * progress;
      break;
    case 'pan_right':
      baseScale *= 1.12;
      translateXRatio = -0.05 + 0.1 * progress;
      break;
    case 'none':
    default:
      break;
  }

  const transDur = Math.max(0.2, Math.min(safeDur * 0.6, clip.transitionDuration ?? 0.6));
  const inT = Math.max(0, Math.min(1, localTime / transDur));
  let wipeProgress: number | null = null;
  let flashAlpha = 0;

  switch (clip.transition) {
    case 'dissolve':
      alpha *= inT;
      break;
    case 'slide_left':
      translateXRatio += (1 - inT) * 0.85;
      break;
    case 'zoom_in':
      baseScale *= 0.72 + 0.28 * inT;
      alpha *= Math.min(1, inT * 1.4);
      break;
    case 'wipe_right':
      wipeProgress = inT;
      break;
    case 'flash_white':
      if (inT < 0.65) {
        flashAlpha = Math.max(0, 1 - inT / 0.65) * 0.75;
      }
      break;
    case 'none':
    default:
      break;
  }

  const scaleX = baseScale * (clip.flipH ? -1 : 1);
  const scaleY = baseScale * (clip.flipV ? -1 : 1);
  const rotationRad = (((clip.rotation || 0) % 360) * Math.PI) / 180;

  return {
    alpha: Math.max(0, Math.min(1, alpha)),
    scaleX,
    scaleY,
    rotationRad,
    translateXRatio,
    translateYRatio,
    wipeProgress,
    flashAlpha,
  };
}

export function generateTimedCaptionsFromScript(
  script: string,
  startAt = 0,
  textStyle: StudioTextStyle = 'bold_yellow',
  textAnimation: StudioTextAnimation = 'pop_in',
  wordsPerCaption = 4,
): StudioClip[] {
  const words = script
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  const chunkSize = Math.max(1, Math.min(8, Math.round(wordsPerCaption)));
  const result: StudioClip[] = [];
  let cursor = Math.max(0, Math.round(startAt * 10) / 10);

  for (let i = 0; i < words.length; i += chunkSize) {
    const phrase = words.slice(i, i + chunkSize).join(' ');
    const dur = Math.max(1.4, Math.min(3.6, Math.round((phrase.length * 0.11 + 0.8) * 10) / 10));
    result.push({
      id: `cap_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
      track: 'text',
      kind: 'text',
      name: `Caption: ${phrase.slice(0, 14)}`,
      startTime: cursor,
      duration: dur,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
      textContent: phrase,
      textColor: '#F5C542',
      fontSize: 34,
      textStyle,
      textAnimation,
      posX: 50,
      posY: 82,
    });
    cursor = Math.round((cursor + dur) * 10) / 10;
  }

  return result;
}

export function isPremiumSubscriptionActive(
  orders: Order[],
  nowMs: number = Date.now(),
): {
  unlocked: boolean;
  activeOrder: Order | null;
  latestOrder: Order | null;
  expiresAt: string | null;
} {
  const premiumOrders = orders
    .filter((o) => o.type === 'studio_premium')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestOrder = premiumOrders[0] || null;

  for (const ord of premiumOrders) {
    if (ord.status !== 'Verified' && ord.status !== 'Completed') continue;
    const expiryIso =
      ord.subscriptionExpiresAt ||
      new Date(
        new Date(ord.updatedAt || ord.createdAt).getTime() +
          STUDIO_PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
    const expiryMs = new Date(expiryIso).getTime();
    if (Number.isFinite(expiryMs) && expiryMs > nowMs) {
      return {
        unlocked: true,
        activeOrder: ord,
        latestOrder,
        expiresAt: expiryIso,
      };
    }
  }

  return {
    unlocked: false,
    activeOrder: null,
    latestOrder,
    expiresAt: null,
  };
}

export type ClassifiedMediaKind = 'video' | 'image' | 'audio' | 'unsupported';

export function classifyTimelineMediaFile(file: {
  name?: string;
  type?: string;
}): ClassifiedMediaKind {
  const name = (file.name || '').trim().toLowerCase();
  const mime = (file.type || '').trim().toLowerCase();

  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(name)
  ) {
    return 'audio';
  }
  if (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(name)
  ) {
    return 'video';
  }
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
  ) {
    return 'image';
  }
  return 'unsupported';
}

export function getTimelineTrackForMediaKind(
  kind: 'video' | 'image' | 'audio',
): StudioClip['track'] {
  return kind === 'audio' ? 'audio' : 'video';
}

export interface CreateTextOverlayOptions {
  startTime?: number;
  duration?: number;
  textColor?: string;
  fontSize?: number;
  posX?: number;
  posY?: number;
  textStyle?: StudioTextStyle;
  textAnimation?: StudioTextAnimation;
}

export function createTextOverlayClip(
  rawText: string,
  options: CreateTextOverlayOptions = {},
): StudioClip | null {
  const clean = (rawText || '').trim();
  if (!clean) return null;

  const startTime = Math.max(0, Math.round((options.startTime ?? 0) * 10) / 10);
  const duration = Math.max(0.5, Math.min(60, options.duration ?? 3.5));
  const fontSize = Math.max(16, Math.min(96, Math.round(options.fontSize ?? 38)));
  const posX = Math.max(5, Math.min(95, options.posX ?? 50));
  const posY = Math.max(10, Math.min(92, options.posY ?? 75));

  return {
    id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    track: 'text',
    kind: 'text',
    name: clean.slice(0, 22),
    startTime,
    duration,
    trimStart: 0,
    speed: 1,
    volume: 1,
    fadeIn: true,
    fadeOut: true,
    textContent: clean,
    textColor: options.textColor || '#F5C542',
    fontSize,
    textStyle: options.textStyle,
    textAnimation: options.textAnimation,
    posX,
    posY,
  };
}

export function clampTimelineZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(0.5, Math.min(3, Math.round(zoom * 100) / 100));
}

export function getPixelsPerSecond(zoom = 1): number {
  return Math.round(64 * clampTimelineZoom(zoom));
}

export function timeToTimelineX(seconds: number, zoom = 1, scrollLeft = 0): number {
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return Math.round((safeSec * getPixelsPerSecond(zoom) - scrollLeft) * 100) / 100;
}

export function timelineXToTime(
  x: number,
  zoom = 1,
  scrollLeft = 0,
  snapStepSec = 0,
): number {
  const pps = getPixelsPerSecond(zoom);
  const raw = Math.max(0, (x + scrollLeft) / Math.max(1, pps));
  if (snapStepSec > 0) {
    return Math.round(Math.round(raw / snapStepSec) * snapStepSec * 100) / 100;
  }
  return Math.round(raw * 100) / 100;
}

export interface TimelineRulerTick {
  time: number;
  label: string;
  isMajor: boolean;
}

export function computeRulerTicks(totalSeconds: number, zoom = 1): TimelineRulerTick[] {
  const safeTotal = Math.max(8, Math.ceil(totalSeconds + 4));
  const majorStep = zoom >= 1.5 ? 1 : zoom >= 0.85 ? 2 : 5;
  const minorStep = majorStep >= 5 ? 1 : 0.5;
  const ticks: TimelineRulerTick[] = [];

  for (let t = 0; t <= safeTotal; t = Math.round((t + minorStep) * 100) / 100) {
    const isMajor = Math.abs(t % majorStep) < 0.001;
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    ticks.push({
      time: t,
      label: isMajor ? `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : '',
      isMajor,
    });
  }
  return ticks;
}

export function moveClipStartTime(
  clips: StudioClip[],
  clipId: string,
  nextStartTime: number,
): StudioClip[] {
  const clamped = Math.max(0, Math.round(nextStartTime * 10) / 10);
  return clips.map((c) => (c.id === clipId ? { ...c, startTime: clamped } : c));
}

export function trimClipEdges(
  clip: StudioClip,
  deltaDurationSec: number,
): StudioClip {
  const nextDuration = Math.max(0.5, Math.min(180, clip.duration + deltaDurationSec));
  return {
    ...clip,
    duration: Math.round(nextDuration * 100) / 100,
  };
}


