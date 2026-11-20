import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSunoLyriaPrompt,
  buildStructuredFallbackLyrics,
  extractSingableLyricsText,
  generateStudioSynthWavBase64,
  normalizeMusicDownloadFilename,
  splitLyricsForTimedPlayback,
} from './musicStudioLogic';

test('buildSunoLyriaPrompt incorporates title, styles, BPM, mood, and custom lyrics', () => {
  const prompt = buildSunoLyriaPrompt({
    mode: 'custom',
    title: 'Neon Telemetry',
    prompt: 'Driving synthwave chorus',
    lyrics: '[Verse]\nGlowing circuits tonight\n[Chorus]\nTake flight',
    styles: ['Synthwave', 'Future Bass'],
    mood: 'Anthemic',
    vocalStyle: 'Dual Harmony',
    bpm: 126,
    instrumental: false,
  });

  assert.ok(prompt.includes('Track Title: "Neon Telemetry"'));
  assert.ok(prompt.includes('Genre & Production Style: Synthwave, Future Bass'));
  assert.ok(prompt.includes('Mood: Anthemic'));
  assert.ok(prompt.includes('Tempo: 126 BPM'));
  assert.ok(prompt.includes('Dual Harmony'));
  assert.ok(prompt.includes('[Chorus]'));
});

test('buildStructuredFallbackLyrics respects instrumental flag and custom lyrics preservation', () => {
  const inst = buildStructuredFallbackLyrics({
    mode: 'custom',
    prompt: 'Chill beat',
    lyrics: '[Verse]\nShould not appear when instrumental',
    styles: ['Lo-Fi Chill'],
    bpm: 92,
    instrumental: true,
  });
  assert.ok(inst.includes('Instrumental Arrangement'));
  assert.ok(inst.includes('92 BPM'));

  const custom = buildStructuredFallbackLyrics({
    mode: 'custom',
    prompt: 'Custom song',
    lyrics: '[Drop]\nHands up in the arena',
    styles: ['EDM'],
    bpm: 128,
    instrumental: false,
  });
  assert.equal(custom, '[Drop]\nHands up in the arena');
});

test('extractSingableLyricsText, splitLyricsForTimedPlayback, and normalizeMusicDownloadFilename work accurately', () => {
  const raw = '[Intro]\n(Synth pads rising)\n\n[Verse]\nGolden skies ahead\nTurn the dial loud';
  const singable = extractSingableLyricsText(raw);
  assert.equal(singable, 'Golden skies ahead, Turn the dial loud');

  const cues = splitLyricsForTimedPlayback(raw, 12);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].section, '[Verse]');
  assert.equal(cues[0].text, 'Golden skies ahead');
  assert.ok(cues[1].startSec >= cues[0].endSec);

  assert.equal(normalizeMusicDownloadFilename('Midnight Telemetry!'), 'midnight-telemetry.mp3');
  assert.equal(normalizeMusicDownloadFilename('   '), 'primex-track.mp3');
});

test('generateStudioSynthWavBase64 outputs a valid RIFF/WAVE base64 payload tuned to model duration', () => {
  const clip = generateStudioSynthWavBase64({
    bpm: 120,
    styles: ['Synthwave'],
    model: 'lyria-3-clip-preview',
    seedText: 'TestTrack',
    lyrics: '[Verse]\nSinging bright melodies',
    instrumental: false,
  });
  assert.equal(clip.mimeType, 'audio/wav');
  assert.equal(clip.durationSeconds, 12);
  const bytes = Buffer.from(clip.audioBase64, 'base64');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.ok(bytes.length > 44);

  const pro = generateStudioSynthWavBase64({
    bpm: 105,
    styles: ['Ambient Space'],
    model: 'lyria-3-pro-preview',
    seedText: 'ExtendedTrack',
    instrumental: true,
  });
  assert.equal(pro.durationSeconds, 16);
});
