import type { StudioClip } from '../types';

export interface BuiltInSfxDefinition {
  id: NonNullable<StudioClip['sfxType']>;
  label: string;
  duration: number;
  description: string;
}

export const BUILT_IN_SFX: BuiltInSfxDefinition[] = [
  {
    id: 'ambient_pad',
    label: 'Midnight Ambient Pad',
    duration: 5,
    description: 'Warm sustained synthesizer chord bed',
  },
  {
    id: 'cinematic_hit',
    label: 'Cinematic Gold Impact',
    duration: 2.5,
    description: 'Deep sub-bass boom with shimmer tail',
  },
  {
    id: 'whoosh',
    label: 'Studio Transition Whoosh',
    duration: 1.5,
    description: 'Filtered air sweep for scene cuts',
  },
  {
    id: 'chime',
    label: 'Crystal Notification Chime',
    duration: 2,
    description: 'Clean harmonic bell arpeggio',
  },
  {
    id: 'lofi_beat',
    label: 'Pulse Studio Groove',
    duration: 6,
    description: 'Rhythmic warm synth pulse loop',
  },
];

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

const sfxCache = new Map<string, string>();

export function getSynthesizedSfxUrl(
  sfxType: NonNullable<StudioClip['sfxType']>,
): string {
  const existing = sfxCache.get(sfxType);
  if (existing) return existing;

  const def = BUILT_IN_SFX.find((s) => s.id === sfxType) || BUILT_IN_SFX[0];
  const sampleRate = 22050;
  const totalSamples = Math.floor(def.duration * sampleRate);
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const progress = t / def.duration;
    let val = 0;

    if (sfxType === 'ambient_pad') {
      const env = Math.sin(Math.PI * progress);
      val =
        (Math.sin(2 * Math.PI * 196 * t) * 0.35 +
          Math.sin(2 * Math.PI * 246.94 * t) * 0.3 +
          Math.sin(2 * Math.PI * 293.66 * t) * 0.25) *
        env *
        0.5;
    } else if (sfxType === 'cinematic_hit') {
      const env = Math.exp(-t * 2.2);
      const freq = 95 * Math.exp(-t * 1.4) + 36;
      val = (Math.sin(2 * Math.PI * freq * t) * 0.8 + (Math.random() * 2 - 1) * 0.15 * Math.exp(-t * 6)) * env;
    } else if (sfxType === 'whoosh') {
      const env = Math.sin(Math.PI * progress);
      const sweep = Math.sin(2 * Math.PI * (180 + progress * 500) * t);
      val = ((Math.random() * 2 - 1) * 0.4 + sweep * 0.2) * env;
    } else if (sfxType === 'chime') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const idx = Math.min(notes.length - 1, Math.floor(t * 3));
      const noteStart = idx / 3;
      const localEnv = Math.exp(-(t - noteStart) * 5);
      val = Math.sin(2 * Math.PI * notes[idx] * t) * localEnv * 0.45;
    } else {
      // lofi_beat
      const beatTime = t % 0.5;
      const kick = Math.sin(2 * Math.PI * (110 * Math.exp(-beatTime * 14) + 45) * beatTime) * Math.exp(-beatTime * 10);
      const chord = Math.sin(2 * Math.PI * 220 * t) * 0.15 + Math.sin(2 * Math.PI * 277.18 * t) * 0.12;
      val = (kick * 0.55 + chord) * Math.min(1, t * 4) * Math.min(1, (def.duration - t) * 4);
    }

    samples[i] = val;
  }

  const blob = encodeWavFromFloat32(samples, sampleRate);
  const url = URL.createObjectURL(blob);
  sfxCache.set(sfxType, url);
  return url;
}
