export type StudioChatModelId =
  | 'gemini-4-carbon'
  | 'gemini-4-argon'
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite';

export type StudioMusicModelId = 'lyria-3-clip-preview' | 'lyria-3-pro-preview';

export type VideoGenAspectRatio = '16:9' | '9:16';
export type ImageGenAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type ThreeScenePresetId = 'gimbal_rig' | 'synth_turntable' | 'orbital_sat';
export type ThreeFinishPresetId =
  | 'prime_gold'
  | 'titanium_blue'
  | 'matte_obsidian'
  | 'pearl_silver';
export type ThreeCameraViewId = 'hero' | 'front' | 'top' | 'detail';

export interface StudioChatModelOption {
  id: StudioChatModelId;
  label: string;
  tierHint: string;
  description: string;
}

export const STUDIO_CHAT_MODELS: StudioChatModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tierHint: 'General',
    description: 'Balanced creative scripting, captions, and general studio tasks.',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    tierHint: 'Deep Reasoning',
    description: 'Deep reasoning for multi-scene planning, technical audits, and production logic.',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    tierHint: 'Complex Interactive',
    description: 'High-capability coding, interactive storyboards, and complex multi-step workflows.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tierHint: 'Ultra-Fast',
    description: 'Low-latency quick brainstorms, hooks, tags, and instant summaries.',
  },
];

export const ALLOWED_CHAT_MODEL_IDS: readonly StudioChatModelId[] = [
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
];

export const STUDIO_CHAT_PERSONAS = [
  {
    id: 'creative_director',
    label: 'Creative Director',
    instruction:
      'You are the Senior Creative Director at PRIME X INNOVATION Studio. Help users plan shots, pacing, lighting, audio mood, and cohesive visual storytelling.',
  },
  {
    id: 'scriptwriter',
    label: 'Commercial Scriptwriter',
    instruction:
      'You are an award-winning commercial scriptwriter. Craft punchy hooks, voiceover scripts with exact second markers, and engaging CTAs.',
  },
  {
    id: 'sound_architect',
    label: 'Music & Sound Designer',
    instruction:
      'You are a film score composer and sound architect. Suggest BPM, instrumentation, Lyria prompts, and audio transitions.',
  },
  {
    id: 'technical_architect',
    label: '3D & Pipeline Architect',
    instruction:
      'You are a Three.js, shader, and video production engineer. Give precise technical guidance on lighting, aspect ratios, composition, and render workflows.',
  },
] as const;

export const ALLOWED_VIDEO_ASPECT_RATIOS: readonly VideoGenAspectRatio[] = ['16:9', '9:16'];
export const ALLOWED_IMAGE_ASPECT_RATIOS: readonly ImageGenAspectRatio[] = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
];

export function isValidStudioChatModel(model: string): model is StudioChatModelId {
  return (ALLOWED_CHAT_MODEL_IDS as readonly string[]).includes(model);
}

export function normalizeVideoAspectRatio(ratio?: string): VideoGenAspectRatio {
  return ratio === '9:16' ? '9:16' : '16:9';
}

export function normalizeImageAspectRatio(ratio?: string): ImageGenAspectRatio {
  if (ratio === '16:9' || ratio === '9:16' || ratio === '4:3' || ratio === '3:4') {
    return ratio;
  }
  return '1:1';
}

export function normalizeMusicModel(model?: string): StudioMusicModelId {
  return model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
}

export interface ThreeSceneSpec {
  id: ThreeScenePresetId;
  name: string;
  subtitle: string;
  partCount: number;
}

export const THREE_SCENE_PRESETS: ThreeSceneSpec[] = [
  {
    id: 'gimbal_rig',
    name: 'Prime X Cinema Rig',
    subtitle: '8-part articulated studio camera & sapphire lens assembly',
    partCount: 8,
  },
  {
    id: 'synth_turntable',
    name: 'Aero Audio Deck',
    subtitle: '7-part brushed-gold turntable & sculpted tonearm assembly',
    partCount: 7,
  },
  {
    id: 'orbital_sat',
    name: 'Orbital Telemetry Craft',
    subtitle: '9-part parabolic reflector, faceted hull & twin solar arrays',
    partCount: 9,
  },
];

export interface ThreeFinishSpec {
  id: ThreeFinishPresetId;
  label: string;
  primaryHex: number;
  accentHex: number;
  swatchClass: string;
  metalness: number;
  roughness: number;
}

export const THREE_FINISH_PRESETS: ThreeFinishSpec[] = [
  {
    id: 'prime_gold',
    label: 'Prime Gold',
    primaryHex: 0x162b4a,
    accentHex: 0xd4af37,
    swatchClass: 'bg-[#D4AF37]',
    metalness: 0.92,
    roughness: 0.22,
  },
  {
    id: 'titanium_blue',
    label: 'Cobalt Alloy',
    primaryHex: 0x0f2544,
    accentHex: 0x5da9e9,
    swatchClass: 'bg-sky-400',
    metalness: 0.88,
    roughness: 0.26,
  },
  {
    id: 'matte_obsidian',
    label: 'Obsidian',
    primaryHex: 0x181c24,
    accentHex: 0xf5c542,
    swatchClass: 'bg-slate-800',
    metalness: 0.45,
    roughness: 0.58,
  },
  {
    id: 'pearl_silver',
    label: 'Brushed Silver',
    primaryHex: 0xcbd5e1,
    accentHex: 0xd4af37,
    swatchClass: 'bg-slate-300',
    metalness: 0.95,
    roughness: 0.18,
  },
];

export function getThreeCameraPose(
  view: ThreeCameraViewId,
): { position: [number, number, number]; target: [number, number, number] } {
  switch (view) {
    case 'front':
      return { position: [0, 1.85, 5.4], target: [0, 1.25, 0] };
    case 'top':
      return { position: [0.01, 6.2, 1.9], target: [0, 1.0, 0] };
    case 'detail':
      return { position: [2.1, 1.9, 2.3], target: [0, 1.35, 0] };
    case 'hero':
    default:
      return { position: [3.8, 2.55, 4.4], target: [0, 1.25, 0] };
  }
}

export function formatStudioAiError(rawMessage: string, statusCode?: number): string {
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    statusCode === 403
  ) {
    return 'Gemini API permission or key error. Please check your GEMINI_API_KEY in Settings > Secrets.';
  }
  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('paid') ||
    statusCode === 429
  ) {
    return 'Quota or paid-tier model limit reached. Please select a billing-enabled GEMINI_API_KEY in Settings > Secrets to run this model.';
  }
  if (lower.includes('not_found') || statusCode === 404) {
    return `Requested AI model is unavailable in the current region/key: ${rawMessage.slice(0, 120)}`;
  }
  return rawMessage || 'AI Studio request failed.';
}

/**
 * Convert Float32Array (-1..1) PCM audio samples to base64 Int16 little-endian bytes for Gemini Live API (16kHz).
 */
export function float32ToInt16Base64(float32: Float32Array): string {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Convert base64 Int16 little-endian PCM bytes (from Gemini Live 24kHz audio) into Float32Array samples.
 */
export function int16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length;
  const sampleCount = Math.floor(byteLength / 2);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    out[i] = int16 / 0x8000;
  }
  return out;
}
