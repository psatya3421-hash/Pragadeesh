import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function inferAudioExt(mimeType: string): string {
  const lower = (mimeType || '').toLowerCase();
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  return 'wav';
}

/**
 * Convert any server audio buffer (WAV, WebM, etc.) into genuine MP3 (audio/mpeg) via ffmpeg libmp3lame.
 * Falls back cleanly to original bytes if ffmpeg fails unexpectedly.
 */
export async function transcodeAudioBase64ToMp3(
  audioBase64: string,
  inputMimeType: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  if ((inputMimeType || '').toLowerCase().includes('mpeg')) {
    return { audioBase64: cleanBase64, mimeType: 'audio/mpeg' };
  }

  const token = crypto.randomUUID();
  const inExt = inferAudioExt(inputMimeType);
  const inPath = path.join(os.tmpdir(), `primex-aud-in-${token}.${inExt}`);
  const outPath = path.join(os.tmpdir(), `primex-aud-out-${token}.mp3`);

  try {
    await fs.writeFile(inPath, Buffer.from(cleanBase64, 'base64'));
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inPath,
        '-vn',
        '-acodec',
        'libmp3lame',
        '-b:a',
        '192k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-f',
        'mp3',
        outPath,
      ],
      { timeout: 30_000 },
    );
    const outBuf = await fs.readFile(outPath);
    if (outBuf.length > 0) {
      return { audioBase64: outBuf.toString('base64'), mimeType: 'audio/mpeg' };
    }
  } catch {
    // Preserve original format if ffmpeg fails
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }

  return { audioBase64: cleanBase64, mimeType: inputMimeType || 'audio/wav' };
}

/**
 * Mix a WAV vocal track over a synthesized WAV backing bed and export as stereo 192kbps MP3.
 */
export async function mixVocalAndBackingToMp3(params: {
  backingWavBase64: string;
  vocalWavBase64: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const token = crypto.randomUUID();
  const backPath = path.join(os.tmpdir(), `primex-back-${token}.wav`);
  const vocPath = path.join(os.tmpdir(), `primex-voc-${token}.wav`);
  const outPath = path.join(os.tmpdir(), `primex-mix-${token}.mp3`);

  const cleanBack = params.backingWavBase64.includes(',')
    ? params.backingWavBase64.split(',')[1]
    : params.backingWavBase64;
  const cleanVoc = params.vocalWavBase64.includes(',')
    ? params.vocalWavBase64.split(',')[1]
    : params.vocalWavBase64;

  try {
    await fs.writeFile(backPath, Buffer.from(cleanBack, 'base64'));
    await fs.writeFile(vocPath, Buffer.from(cleanVoc, 'base64'));

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-stream_loop',
        '-1',
        '-i',
        backPath,
        '-i',
        vocPath,
        '-filter_complex',
        '[0:a]volume=0.65[bg];[1:a]volume=1.35[vo];[bg][vo]amix=inputs=2:duration=shortest:dropout_transition=2',
        '-acodec',
        'libmp3lame',
        '-b:a',
        '192k',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-f',
        'mp3',
        outPath,
      ],
      { timeout: 30_000 },
    );

    const outBuf = await fs.readFile(outPath);
    if (outBuf.length > 0) {
      return {
        audioBase64: outBuf.toString('base64'),
        mimeType: 'audio/mpeg',
      };
    }
  } catch {
    // Fallback to backing track MP3 conversion below
  } finally {
    await fs.unlink(backPath).catch(() => {});
    await fs.unlink(vocPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }

  return transcodeAudioBase64ToMp3(cleanBack, 'audio/wav');
}
