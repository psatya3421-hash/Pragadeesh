import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_CHAT_MODEL_IDS,
  STUDIO_CHAT_MODELS,
  THREE_SCENE_PRESETS,
  float32ToInt16Base64,
  formatStudioAiError,
  getThreeCameraPose,
  int16Base64ToFloat32,
  isValidStudioChatModel,
  normalizeImageAspectRatio,
  normalizeMusicModel,
  normalizeVideoAspectRatio,
} from './aiStudioLogic';

test('STUDIO_CHAT_MODELS includes all four required Gemini models', () => {
  const ids = STUDIO_CHAT_MODELS.map((m) => m.id);
  assert.deepEqual(ids.sort(), [...ALLOWED_CHAT_MODEL_IDS].sort());
  assert.equal(isValidStudioChatModel('gemini-4-carbon'), true);
  assert.equal(isValidStudioChatModel('gemini-4-argon'), true);
  assert.equal(isValidStudioChatModel('gemini-4-hydrogen'), true);
  assert.equal(isValidStudioChatModel('gemini-3.1-flash-lite'), true);
  assert.equal(isValidStudioChatModel('gemini-1.5-pro'), false);
});

test('aspect ratio and music model normalizers enforce allowed values', () => {
  assert.equal(normalizeVideoAspectRatio('9:16'), '9:16');
  assert.equal(normalizeVideoAspectRatio('1:1'), '16:9');
  assert.equal(normalizeImageAspectRatio('16:9'), '16:9');
  assert.equal(normalizeImageAspectRatio('9:16'), '9:16');
  assert.equal(normalizeImageAspectRatio('invalid'), '1:1');
  assert.equal(normalizeMusicModel('lyria-3-pro-preview'), 'lyria-3-pro-preview');
  assert.equal(normalizeMusicModel('unknown'), 'lyria-3-clip-preview');
});

test('THREE_SCENE_PRESETS declare composite 3-12 part subjects and camera poses', () => {
  assert.equal(THREE_SCENE_PRESETS.length, 3);
  for (const preset of THREE_SCENE_PRESETS) {
    assert.ok(preset.partCount >= 3 && preset.partCount <= 12);
  }
  const hero = getThreeCameraPose('hero');
  const top = getThreeCameraPose('top');
  assert.equal(hero.position.length, 3);
  assert.ok(top.position[1] > hero.position[1]);
});

test('PCM base64 roundtrip preserves audio samples within Int16 quantization tolerance', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.99, -0.99]);
  const b64 = float32ToInt16Base64(input);
  const decoded = int16Base64ToFloat32(b64);
  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.001);
  }
});

test('formatStudioAiError maps permission and quota statuses clearly', () => {
  assert.match(formatStudioAiError('RESOURCE_EXHAUSTED', 429), /Settings > Secrets/);
  assert.match(formatStudioAiError('PERMISSION_DENIED', 403), /Settings > Secrets/);
  assert.match(formatStudioAiError('Custom failure'), /Custom failure/);
});
