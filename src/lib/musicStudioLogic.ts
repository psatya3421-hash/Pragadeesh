import type { StudioMusicModelId } from './aiStudioLogic';

export type MusicCreationMode = 'simple' | 'custom';

export const MUSIC_GENRE_CHIPS = [
  'Synthwave',
  'Cinematic Orchestral',
  'Lo-Fi Chill',
  'Afrobeats',
  'Indie Pop',
  'Future Bass',
  'Trap 808',
  'Acoustic Folk',
  'Cyberpunk Rock',
  'Ambient Space',
] as const;

export const MUSIC_MOOD_CHIPS = [
  'Euphoric',
  'Dark & Moody',
  'Anthemic',
  'Dreamy',
  'High-Energy',
  'Uplifting',
  'Late-Night',
  'Heroic',
] as const;

export const VOCAL_STYLE_OPTIONS = [
  'Melodic Vocal',
  'Airy Female Vocal',
  'Warm Male Baritone',
  'Dual Harmony',
  'Vocoder Synth',
  'Choir Anthem',
  'Instrumental Only',
] as const;

export const LYRIC_STRUCTURE_TAGS = [
  '[Intro]',
  '[Verse]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Bridge]',
  '[Drop]',
  '[Outro]',
] as const;

export interface SunoPromptInput {
  mode: MusicCreationMode;
  title?: string;
  prompt: string;
  lyrics?: string;
  styles: string[];
  mood?: string;
  vocalStyle?: string;
  bpm?: number;
  instrumental?: boolean;
}

export function extractSingableLyricsText(rawLyrics: string): string {
  if (!rawLyrics) return '';
  return rawLyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\[[^\]]+\]$/.test(line)) return false;
      if (/^\([^)]+\)$/.test(line)) return false;
      return true;
    })
    .join(', ')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TimedLyricCue {
  id: string;
  section?: string;
  text: string;
  startSec: number;
  endSec: number;
}

export function splitLyricsForTimedPlayback(
  rawLyrics: string,
  totalDurationSec = 14,
): TimedLyricCue[] {
  const safeDur = Math.max(4, Number.isFinite(totalDurationSec) ? totalDurationSec : 14);
  const lines = (rawLyrics || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentSection: string | undefined;
  const singableLines: { section?: string; text: string }[] = [];

  for (const line of lines) {
    if (/^\[([^\]]+)\]$/.test(line)) {
      currentSection = line;
      continue;
    }
    if (/^\([^)]+\)$/.test(line)) continue;
    const cleaned = line.replace(/\[[^\]]+\]/g, '').trim();
    if (cleaned) {
      singableLines.push({ section: currentSection, text: cleaned });
    }
  }

  if (singableLines.length === 0) return [];

  const totalChars = Math.max(
    1,
    singableLines.reduce((sum, item) => sum + Math.max(8, item.text.length), 0),
  );
  let cursor = 0.2;
  const usableDur = Math.max(3, safeDur - 0.5);

  return singableLines.map((item, idx) => {
    const share = (Math.max(8, item.text.length) / totalChars) * usableDur;
    const startSec = Math.round(cursor * 100) / 100;
    const endSec = Math.round(Math.min(safeDur, cursor + share) * 100) / 100;
    cursor += share;
    return {
      id: `cue_${idx}`,
      section: item.section,
      text: item.text,
      startSec,
      endSec: Math.max(startSec + 0.5, endSec),
    };
  });
}

export function normalizeMusicDownloadFilename(title: string): string {
  const slug =
    (title || 'primex-track')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'primex-track';
  return `${slug}.mp3`;
}

export function buildSunoLyriaPrompt(input: SunoPromptInput): string {
  const cleanPrompt = (input.prompt || '').trim();
  const cleanLyrics = (input.lyrics || '').trim();
  const cleanTitle = (input.title || '').trim();
  const stylesLine = input.styles.filter(Boolean).join(', ');
  const bpm = Math.max(60, Math.min(180, Math.round(Number(input.bpm || 118))));
  const isInstrumental = Boolean(input.instrumental) || input.vocalStyle === 'Instrumental Only';

  const parts: string[] = [];
  if (cleanTitle) {
    parts.push(`Track Title: "${cleanTitle}"`);
  }
  if (stylesLine) {
    parts.push(`Genre & Production Style: ${stylesLine}`);
  }
  if (input.mood) {
    parts.push(`Mood: ${input.mood}`);
  }
  parts.push(`Tempo: ${bpm} BPM`);
  parts.push(
    isInstrumental
      ? 'Arrangement: Strictly instrumental track with zero vocals, rich expressive instrumentation and clean stereo mastering.'
      : `Vocals: ${input.vocalStyle || 'Melodic expressive lead vocals'} — clearly sing the lyrics aloud in rhythm and tune over the music.`,
  );

  if (!isInstrumental && cleanLyrics) {
    parts.push(
      `Sung Lyrics & Song Structure (sing every lyric line verbatim with clear melody):\n${cleanLyrics}`,
    );
  } else if (input.mode === 'custom' && cleanLyrics) {
    parts.push(`Arrangement & Structure Notes:\n${cleanLyrics}`);
  }
  if (cleanPrompt) {
    parts.push(`Song Concept & Sonic Direction:\n${cleanPrompt}`);
  }

  return parts.join('\n');
}

export function buildStructuredFallbackLyrics(input: SunoPromptInput): string {
  if (input.instrumental || input.vocalStyle === 'Instrumental Only') {
    const tags = input.styles.slice(0, 3).join(' · ') || 'Cinematic Synth';
    return `[Instrumental Arrangement — ${tags} · ${input.bpm || 118} BPM]\nOpening atmospheric pad swell -> Tight percussive groove -> Harmonic synth lead motif -> Dynamic bridge -> Clean fade outro.`;
  }

  if (input.lyrics && input.lyrics.trim()) {
    return input.lyrics.trim();
  }

  const theme = (input.prompt || input.title || 'Horizon Lights').trim();
  const styleLabel = input.styles[0] || 'Neon Pulse';
  return `[Intro]
(${styleLabel} motif · ${input.bpm || 118} BPM)

[Verse]
Stepping through the static when the city lights wake
Every quiet signal turning gold in the haze
${theme.slice(0, 72)}

[Chorus]
Turn the dial up higher, let the rhythm take flight
Echoes in the skyline glowing warm through the night
Holding on to the frequency, shining clear and bright

[Bridge]
Strip the beat back, feel the bassline breathe
Rising up together on the sound underneath

[Outro]
Fading golden chords into the morning sky.`;
}

function getVowelFormantPair(ch: string): [number, number] {
  switch (ch) {
    case 'a':
      return [730, 1090];
    case 'e':
      return [530, 1840];
    case 'i':
      return [290, 2240];
    case 'o':
      return [570, 840];
    case 'u':
      return [320, 870];
    default:
      return [480, 1450];
  }
}

/**
 * Deterministic RIFF/PCM WAV synthesizer so Music Studio works even without a billed Lyria key.
 * When non-instrumental lyrics are given, synthesizes a lyrical vocal-formant lead melody tuned to syllables over the chord bed.
 */
export function generateStudioSynthWavBase64(params: {
  bpm?: number;
  styles?: string[];
  model?: StudioMusicModelId;
  seedText?: string;
  lyrics?: string;
  instrumental?: boolean;
}): { audioBase64: string; mimeType: string; durationSeconds: number } {
  const sampleRate = 22050;
  const singableLyrics = params.instrumental
    ? ''
    : extractSingableLyricsText(params.lyrics || '');
  const durationSeconds = params.model === 'lyria-3-pro-preview' ? 16 : 12;
  const totalSamples = sampleRate * durationSeconds;
  const bpm = Math.max(70, Math.min(170, Math.round(params.bpm || 118)));
  const beatSec = 60 / bpm;

  // Deterministic scale & chord root offset from seedText
  const seed = (params.seedText || singableLyrics || 'PrimeX')
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const styleText = (params.styles || []).join(' ').toLowerCase();
  const isChill =
    styleText.includes('lo-fi') ||
    styleText.includes('ambient') ||
    styleText.includes('acoustic');
  const isHighEnergy =
    styleText.includes('edm') ||
    styleText.includes('trap') ||
    styleText.includes('cyber');

  const rootMidiBase = 48 + (seed % 7); // C3..B3
  const progressions = isChill
    ? [
        [0, 3, 7, 10],
        [5, 8, 12, 15],
        [3, 7, 10, 14],
        [7, 10, 14, 17],
      ]
    : [
        [0, 4, 7, 11],
        [5, 9, 12, 16],
        [9, 12, 16, 19],
        [7, 11, 14, 17],
      ];

  const words = singableLyrics ? singableLyrics.split(/\s+/).filter(Boolean) : [];
  const syllableList = words.flatMap((w) => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (!clean) return [];
    const chunks = clean.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*(?=[aeiouy]|$))?/g) || [clean];
    return chunks;
  });

  const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

  const dataBytes = totalSamples * 2;
  const buffer = new Uint8Array(44 + dataBytes);
  const view = new DataView(buffer.buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) buffer[offset + i] = s.charCodeAt(i);
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let vocalPhase = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatFloat = t / beatSec;
    const barIdx = Math.floor(beatFloat / 4) % 4;
    const beatInBar = beatFloat % 4;
    const eighthBeat = (beatFloat * 2) % 1;
    const chord = progressions[barIdx];

    // Warm Pad Chord
    let pad = 0;
    for (let c = 0; c < chord.length; c++) {
      const freq = midiToHz(rootMidiBase + 12 + chord[c]);
      pad += Math.sin(2 * Math.PI * freq * t) * 0.12;
    }

    // Driving Bass Pulse
    const bassFreq = midiToHz(rootMidiBase + chord[0]);
    const bassEnv = Math.exp(-eighthBeat * (isHighEnergy ? 4.5 : 2.6));
    const bass =
      (Math.sin(2 * Math.PI * bassFreq * t) + 0.3 * Math.sin(4 * Math.PI * bassFreq * t)) *
      0.22 *
      bassEnv;

    // Arpeggio Lead
    const arpIdx = Math.floor(beatFloat * 2 + seed) % chord.length;
    const arpFreq = midiToHz(rootMidiBase + 24 + chord[arpIdx]);
    const arpEnv = Math.exp(-eighthBeat * 5.0);
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * 0.13 * arpEnv;

    // Melodic Formant Vocal Lead matching user's lyrics when not instrumental
    let vocal = 0;
    if (!params.instrumental && syllableList.length > 0) {
      const phraseSlot = Math.floor(beatFloat * 1.5);
      const syllable = syllableList[phraseSlot % syllableList.length];
      const slotFrac = (beatFloat * 1.5) % 1;
      const vowelMatch = syllable.match(/[aeiou]/)?.[0] || 'a';
      const [f1, f2] = getVowelFormantPair(vowelMatch);
      const melodyStep = (phraseSlot + syllable.charCodeAt(0)) % chord.length;
      const vocalPitchHz =
        midiToHz(rootMidiBase + 12 + chord[melodyStep]) *
        (1 + 0.008 * Math.sin(2 * Math.PI * 5.2 * t));
      vocalPhase += (2 * Math.PI * vocalPitchHz) / sampleRate;
      const syllEnv =
        Math.sin(Math.PI * Math.min(1, slotFrac / 0.92)) * (slotFrac < 0.92 ? 1 : 0.1);
      const glottal =
        Math.sin(vocalPhase) * 0.55 +
        Math.sin(2 * vocalPhase) * 0.3 +
        Math.sin(3 * vocalPhase) * 0.15;
      const formantBoost =
        Math.sin(2 * Math.PI * f1 * t) * 0.18 + Math.sin(2 * Math.PI * f2 * t) * 0.09;
      vocal = (glottal * 0.42 + formantBoost) * syllEnv * 0.45;
    }

    // Subtle Kick Pulse on beats 0 & 2
    const kickPhase = beatInBar % 1;
    const kickFreq = 110 * Math.exp(-kickPhase * 18) + 42;
    const kickEnv = Math.exp(-kickPhase * 12);
    const kick =
      beatInBar < 1 || (beatInBar >= 2 && beatInBar < 3)
        ? Math.sin(2 * Math.PI * kickFreq * t) * 0.28 * kickEnv
        : 0;

    // Master Fade In / Fade Out
    const fadeIn = Math.min(1, t / 0.25);
    const fadeOut = Math.min(1, (durationSeconds - t) / 0.6);
    const raw = (pad + bass + arp + kick + vocal) * fadeIn * fadeOut;
    const clamped = Math.max(-0.95, Math.min(0.95, raw));
    view.setInt16(44 + i * 2, Math.round(clamped * 0x7fff), true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunkSize));
  }
  const audioBase64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(buffer).toString('base64');

  return {
    audioBase64,
    mimeType: 'audio/wav',
    durationSeconds,
  };
}

