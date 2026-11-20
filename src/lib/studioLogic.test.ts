import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPORT_FORMAT_OPTIONS,
  STUDIO_PREMIUM_MONTHLY_FEE_INR,
  buildCanvasFilterString,
  buildExportFilename,
  clampTimelineZoom,
  clampTrimWindow,
  classifyTimelineMediaFile,
  computeClipTransformState,
  computeRulerTicks,
  computeTimelineDuration,
  createTextOverlayClip,
  extractVideoFormat,
  formatMediaFileSize,
  formatTimestampMMSS,
  formatVideoDuration,
  formatVideoResolution,
  generateTimedCaptionsFromScript,
  getCanvasDimensions,
  getExportDimensions,
  getPixelsPerSecond,
  getResolutionFeeINR,
  getTimelineTrackForMediaKind,
  isPremiumSubscriptionActive,
  moveClipStartTime,
  normalizeExportFormat,
  reorderClipsInTrack,
  splitClipAtTime,
  timeToTimelineX,
  timelineXToTime,
  trimClip,
  trimClipEdges,
} from './studioLogic';
import type { Order, StudioClip } from '../types';

const sampleClip: StudioClip = {
  id: 'c1',
  track: 'video',
  kind: 'image',
  name: 'Intro Frame',
  startTime: 0,
  duration: 6,
  trimStart: 0,
  speed: 1,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
};

test('getCanvasDimensions returns expected aspect dimensions', () => {
  assert.deepEqual(getCanvasDimensions('16:9'), { width: 960, height: 540 });
  assert.deepEqual(getCanvasDimensions('9:16'), { width: 540, height: 960 });
  assert.deepEqual(getCanvasDimensions('1:1'), { width: 720, height: 720 });
});

test('getExportDimensions and getResolutionFeeINR handle 4K, 1080p, 720p, and 480p', () => {
  assert.deepEqual(getExportDimensions('16:9', '4k'), { width: 3840, height: 2160 });
  assert.deepEqual(getExportDimensions('16:9', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(getExportDimensions('16:9', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(getExportDimensions('16:9', '480p'), { width: 853, height: 480 });
  assert.equal(getResolutionFeeINR('4k'), 10);
  assert.equal(getResolutionFeeINR('1080p'), 0);
  assert.equal(getResolutionFeeINR('720p'), 0);
  assert.equal(getResolutionFeeINR('480p'), 0);
});

test('buildCanvasFilterString composes brightness, contrast, saturation, grayscale, sepia, blur and presets', () => {
  const str = buildCanvasFilterString('cinema_gold', 110, 105, 95);
  assert.ok(str.includes('brightness(110%)'));
  assert.ok(str.includes('contrast(105%)'));
  assert.ok(str.includes('saturate(95%)'));
  assert.ok(str.includes('sepia(22%)'));

  const customStr = buildCanvasFilterString('none', 100, 145, 90, {
    grayscale: 65,
    sepia: 35,
    blur: 2,
  });
  assert.ok(customStr.includes('contrast(145%)'));
  assert.ok(customStr.includes('grayscale(65%)'));
  assert.ok(customStr.includes('sepia(35%)'));
  assert.ok(customStr.includes('blur(2px)'));

  assert.ok(buildCanvasFilterString('grayscale', 100, 100, 100).includes('grayscale(100%)'));
  assert.ok(buildCanvasFilterString('sepia', 100, 100, 100).includes('sepia(100%)'));
});

test('splitClipAtTime splits a clip cleanly at playhead', () => {
  const split = splitClipAtTime([sampleClip], 'c1', 2.5);
  assert.equal(split.length, 2);
  assert.equal(split[0].duration, 2.5);
  assert.equal(split[1].startTime, 2.5);
  assert.equal(split[1].trimStart, 2.5);
  assert.equal(split[1].duration, 3.5);
});

test('trimClip clamps duration to >= 0.5s', () => {
  const trimmed = trimClip(sampleClip, 1.25, 0.1);
  assert.equal(trimmed.trimStart, 1.25);
  assert.equal(trimmed.duration, 0.5);
});

test('reorderClipsInTrack swaps clips and recalculates sequential start times', () => {
  const second: StudioClip = { ...sampleClip, id: 'c2', name: 'Second', startTime: 6, duration: 4 };
  const reordered = reorderClipsInTrack([sampleClip, second], 'video', 0, 1);
  assert.equal(reordered[0].id, 'c2');
  assert.equal(reordered[0].startTime, 0);
  assert.equal(reordered[1].id, 'c1');
  assert.equal(reordered[1].startTime, 4);
  assert.equal(computeTimelineDuration(reordered), 10);
});

test('video metadata formatters compute file size, format, resolution tier, and duration', () => {
  assert.equal(formatMediaFileSize(512), '512 B');
  assert.equal(formatMediaFileSize(2048), '2.0 KB');
  assert.equal(formatMediaFileSize(5 * 1024 * 1024), '5.00 MB');
  assert.equal(formatMediaFileSize(undefined), '—');

  assert.equal(extractVideoFormat('demo.mp4', 'video/mp4'), 'MP4');
  assert.equal(extractVideoFormat('clip.webm', 'video/webm;codecs=vp9'), 'WEBM');
  assert.equal(extractVideoFormat('iphone.mov', 'video/quicktime'), 'MOV');
  assert.equal(extractVideoFormat('raw.mkv', ''), 'MKV');

  assert.equal(formatVideoResolution(3840, 2160), '3840 × 2160 (4K)');
  assert.equal(formatVideoResolution(1920, 1080), '1920 × 1080 (1080p)');
  assert.equal(formatVideoResolution(1280, 720), '1280 × 720 (720p)');
  assert.equal(formatVideoResolution(854, 480), '854 × 480 (480p)');
  assert.equal(formatVideoResolution(640, 360), '640 × 360');
  assert.equal(formatVideoResolution(0, 0), 'Detecting...');
  assert.equal(formatVideoResolution(0, 0, true), 'Unavailable');

  assert.equal(formatVideoDuration(12.4), '12.4s');
  assert.equal(formatVideoDuration(75), '1m 15s');
  assert.equal(formatVideoDuration(undefined), '—');
});

test('export format options and filename builder support MP4, WebM, and MOV', () => {
  const ids = EXPORT_FORMAT_OPTIONS.map((opt) => opt.id);
  assert.deepEqual(ids, ['mp4', 'webm', 'mov']);
  assert.equal(normalizeExportFormat('WEBM'), 'webm');
  assert.equal(normalizeExportFormat('mov'), 'mov');
  assert.equal(normalizeExportFormat('unknown'), 'mp4');
  assert.equal(
    buildExportFilename('Prime X Launch Cut!', '1080p', 'mp4'),
    'Prime_X_Launch_Cut_1080P.mp4',
  );
  assert.equal(
    buildExportFilename('  ', '4k', 'webm'),
    'PrimeX_Studio_Cut_4K.webm',
  );
});

test('getCanvasDimensions and getExportDimensions support 4:5 and 21:9 aspect ratios', () => {
  assert.deepEqual(getCanvasDimensions('4:5'), { width: 640, height: 800 });
  assert.deepEqual(getCanvasDimensions('21:9'), { width: 1050, height: 450 });
  assert.deepEqual(getExportDimensions('4:5', '1080p'), { width: 864, height: 1080 });
  assert.deepEqual(getExportDimensions('21:9', '1080p'), { width: 2520, height: 1080 });
});

test('clampTrimWindow enforces start/end bounds and minimum duration with MM:SS formatting', () => {
  assert.equal(formatTimestampMMSS(0), '00:00.0');
  assert.equal(formatTimestampMMSS(65.4), '01:05.4');

  const clean = clampTrimWindow(1.25, 4.75, 10);
  assert.deepEqual(clean, { startTime: 1.25, endTime: 4.75, duration: 3.5 });

  const clampedMin = clampTrimWindow(9.8, 9.9, 10, 0.5);
  assert.equal(clampedMin.startTime, 9.5);
  assert.equal(clampedMin.endTime, 10);
  assert.equal(clampedMin.duration, 0.5);

  const clampedOverflow = clampTrimWindow(-2, 25, 12);
  assert.deepEqual(clampedOverflow, { startTime: 0, endTime: 12, duration: 12 });
});

test('computeClipTransformState applies rotation, flip, keyframe motion, and transitions', () => {
  const transformed: StudioClip = {
    ...sampleClip,
    rotation: 90,
    flipH: true,
    flipV: false,
    keyframeMotion: 'zoom_in',
    transition: 'flash_white',
    transitionDuration: 1,
    opacity: 0.8,
  };
  const mid = computeClipTransformState(transformed, 0.25, 6);
  assert.ok(Math.abs(mid.rotationRad - Math.PI / 2) < 1e-6);
  assert.ok(mid.scaleX < 0);
  assert.ok(mid.scaleY > 1);
  assert.ok(mid.flashAlpha > 0);
  assert.ok(mid.alpha <= 0.8);
});

test('generateTimedCaptionsFromScript splits scripts into sequential kinetic caption clips', () => {
  const captions = generateTimedCaptionsFromScript(
    'Prime X Studio brings cinema editing into the browser',
    1.5,
    'karaoke',
    'bounce',
    4,
  );
  assert.equal(captions.length, 3);
  assert.equal(captions[0].textContent, 'Prime X Studio brings');
  assert.equal(captions[0].startTime, 1.5);
  assert.equal(captions[0].textStyle, 'karaoke');
  assert.equal(captions[0].textAnimation, 'bounce');
  assert.ok(captions[1].startTime > captions[0].startTime);
});

test('isPremiumSubscriptionActive verifies ₹49/mo studio_premium order and 30-day window', () => {
  assert.equal(STUDIO_PREMIUM_MONTHLY_FEE_INR, 49);
  const now = new Date('2026-11-14T10:00:00.000Z').getTime();

  const pendingOrder: Order = {
    id: 'ORD-P1',
    userId: 'u1',
    customerName: 'Alex',
    customerEmail: 'alex@example.com',
    type: 'studio_premium',
    items: [{ productId: 'studio_premium_monthly', name: 'Premium Edits', price: 49, quantity: 1 }],
    totalAmount: 49,
    status: 'Pending Payment',
    createdAt: '2026-11-14T09:00:00.000Z',
    updatedAt: '2026-11-14T09:00:00.000Z',
  };
  assert.equal(isPremiumSubscriptionActive([pendingOrder], now).unlocked, false);

  const verifiedOrder: Order = {
    ...pendingOrder,
    id: 'ORD-P2',
    status: 'Verified',
    subscriptionExpiresAt: '2026-12-14T09:00:00.000Z',
  };
  const activeRes = isPremiumSubscriptionActive([pendingOrder, verifiedOrder], now);
  assert.equal(activeRes.unlocked, true);
  assert.equal(activeRes.activeOrder?.id, 'ORD-P2');

  const expiredOrder: Order = {
    ...verifiedOrder,
    id: 'ORD-P3',
    subscriptionExpiresAt: '2026-11-01T09:00:00.000Z',
  };
  assert.equal(isPremiumSubscriptionActive([expiredOrder], now).unlocked, false);
});

test('classifyTimelineMediaFile routes MP3 to audio track and MP4 to video track', () => {
  assert.equal(classifyTimelineMediaFile({ name: 'beat.mp3', type: 'audio/mpeg' }), 'audio');
  assert.equal(classifyTimelineMediaFile({ name: 'music.MP3', type: '' }), 'audio');
  assert.equal(classifyTimelineMediaFile({ name: 'voice.wav', type: 'audio/wav' }), 'audio');
  assert.equal(classifyTimelineMediaFile({ name: 'scene.mp4', type: 'video/mp4' }), 'video');
  assert.equal(classifyTimelineMediaFile({ name: 'intro.MP4', type: 'application/octet-stream' }), 'video');
  assert.equal(classifyTimelineMediaFile({ name: 'cover.png', type: 'image/png' }), 'image');
  assert.equal(classifyTimelineMediaFile({ name: 'notes.txt', type: 'text/plain' }), 'unsupported');

  assert.equal(getTimelineTrackForMediaKind('audio'), 'audio');
  assert.equal(getTimelineTrackForMediaKind('video'), 'video');
  assert.equal(getTimelineTrackForMediaKind('image'), 'video');
});

test('createTextOverlayClip builds clamped text overlay clip for timeline text track', () => {
  assert.equal(createTextOverlayClip('   '), null);

  const clip = createTextOverlayClip('PRIME X LAUNCH', {
    startTime: 2.34,
    textColor: '#FFFFFF',
    fontSize: 44,
    posY: 20,
  });
  assert.ok(clip);
  assert.equal(clip.track, 'text');
  assert.equal(clip.kind, 'text');
  assert.equal(clip.textContent, 'PRIME X LAUNCH');
  assert.equal(clip.startTime, 2.3);
  assert.equal(clip.textColor, '#FFFFFF');
  assert.equal(clip.fontSize, 44);
  assert.equal(clip.posY, 20);
});

test('CapCut timeline geometry helpers compute zoom, ruler ticks, coordinates, move, and trim', () => {
  assert.equal(clampTimelineZoom(0.1), 0.5);
  assert.equal(clampTimelineZoom(5), 3);
  assert.equal(getPixelsPerSecond(1), 64);
  assert.equal(timeToTimelineX(2, 1), 128);
  assert.equal(timelineXToTime(128, 1), 2);
  assert.equal(timelineXToTime(132, 1, 0, 0.5), 2);

  const ticks = computeRulerTicks(6, 1);
  assert.ok(ticks.some((t) => t.time === 0 && t.label === '00:00' && t.isMajor));
  assert.ok(ticks.some((t) => t.time === 4 && t.label === '00:04' && t.isMajor));

  const moved = moveClipStartTime([sampleClip], 'c1', 3.24);
  assert.equal(moved[0].startTime, 3.2);
  const movedClamped = moveClipStartTime([sampleClip], 'c1', -5);
  assert.equal(movedClamped[0].startTime, 0);

  const shrunk = trimClipEdges(sampleClip, -2.5);
  assert.equal(shrunk.duration, 3.5);
  const floorClamped = trimClipEdges(sampleClip, -20);
  assert.equal(floorClamped.duration, 0.5);
});



