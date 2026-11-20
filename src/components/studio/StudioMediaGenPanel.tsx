import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Film,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  Music,
  Plus,
  Sparkles,
  Square,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { ApiError, apiRequest, fileToBase64 } from '../../utils/api';
import type {
  ImageGenAspectRatio,
  StudioMusicModelId,
  VideoGenAspectRatio,
} from '../../lib/aiStudioLogic';

interface StudioMediaGenPanelProps {
  onAddImageToTimeline: (dataUrl: string, name: string) => void;
  onAddVideoToTimeline: (blobUrl: string, name: string) => void;
  onAddAudioToTimeline: (blobUrl: string, name: string, durationSec?: number) => void;
}

interface SpeechRecognitionAlt {
  transcript?: string;
}
interface SpeechRecognitionRes {
  isFinal?: boolean;
  0?: SpeechRecognitionAlt;
}
interface SpeechRecognitionEvt {
  results?: ArrayLike<SpeechRecognitionRes>;
}
interface SpeechRecInst {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEvt) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

export const StudioMediaGenPanel: React.FC<StudioMediaGenPanelProps> = ({
  onAddImageToTimeline,
  onAddVideoToTimeline,
  onAddAudioToTimeline,
}) => {
  // 1. Image Create & Edit (gemini-nano-banana-2.1)
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAspectRatio, setImgAspectRatio] = useState<ImageGenAspectRatio>('1:1');
  const [imgSize, setImgSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imgWebSearch, setImgWebSearch] = useState(false);
  const [imgSourceDataUrl, setImgSourceDataUrl] = useState<string | null>(null);
  const [imgSourceMime, setImgSourceMime] = useState<string>('image/png');
  const [imgSourceName, setImgSourceName] = useState<string>('');
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgResult, setImgResult] = useState<{
    dataUrl: string;
    text: string;
    prompt: string;
  } | null>(null);

  // 2. Video Gen, Animate Photo & Video-to-Video (gemini-omni-1.2-flash)
  const [vidMode, setVidMode] = useState<'text_to_video' | 'image_to_video' | 'video_to_video'>(
    'text_to_video',
  );
  const [vidPrompt, setVidPrompt] = useState('');
  const [vidAspectRatio, setVidAspectRatio] = useState<VideoGenAspectRatio>('16:9');
  const [vidDuration, setVidDuration] = useState<'3s' | '5s' | '10s' | '15s'>('5s');
  const [vidResolution, setVidResolution] = useState<'360p' | '720p' | '1080p'>('720p');
  const [vidSourceDataUrl, setVidSourceDataUrl] = useState<string | null>(null);
  const [vidSourceMime, setVidSourceMime] = useState<string>('image/png');
  const [vidSourceName, setVidSourceName] = useState<string>('');
  const [vidLoading, setVidLoading] = useState(false);
  const [vidError, setVidError] = useState<string | null>(null);
  const [vidResult, setVidResult] = useState<{
    blobUrl: string;
    mimeType: string;
    interactionId?: string;
    prompt: string;
  } | null>(null);

  // 3. Music Generation (lyria-3-clip-preview / lyria-3-pro-preview + MP3 export + Voice Dictation)
  const [musicModel, setMusicModel] = useState<StudioMusicModelId>('lyria-3-clip-preview');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicLyrics, setMusicLyrics] = useState('');
  const [musicImgDataUrl, setMusicImgDataUrl] = useState<string | null>(null);
  const [musicImgMime, setMusicImgMime] = useState<string>('image/png');
  const [musicImgName, setMusicImgName] = useState<string>('');
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicResult, setMusicResult] = useState<{
    blobUrl: string;
    mimeType: string;
    lyrics: string;
    model: string;
    prompt: string;
  } | null>(null);

  const [listeningMusicVoice, setListeningMusicVoice] = useState(false);
  const voiceRecRef = useRef<SpeechRecInst | null>(null);

  useEffect(() => {
    return () => {
      if (voiceRecRef.current) {
        try {
          voiceRecRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleToggleMusicVoice = () => {
    if (listeningMusicVoice) {
      try {
        voiceRecRef.current?.stop();
      } catch {
        // ignore
      }
      setListeningMusicVoice(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecInst;
      webkitSpeechRecognition?: new () => SpeechRecInst;
    };
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechCtor) {
      setMusicError('Live browser voice dictation requires Chrome/Edge speech recognition, or type/upload audio in Audio Transcribe.');
      return;
    }

    setMusicError(null);
    const rec = new SpeechCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
      if (!ev.results) return;
      let text = '';
      for (let i = 0; i < ev.results.length; i++) {
        text += `${ev.results[i]?.[0]?.transcript || ''} `;
      }
      const clean = text.trim();
      if (clean) setMusicLyrics(clean);
    };
    rec.onerror = () => setListeningMusicVoice(false);
    rec.onend = () => setListeningMusicVoice(false);
    voiceRecRef.current = rec;
    rec.start();
    setListeningMusicVoice(true);
  };

  const handleUploadSourceMedia = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'image' | 'video_photo' | 'video_clip' | 'music',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToBase64(file);
    if (target === 'image') {
      setImgSourceDataUrl(dataUrl);
      setImgSourceMime(file.type || 'image/png');
      setImgSourceName(file.name);
    } else if (target === 'video_photo') {
      setVidSourceDataUrl(dataUrl);
      setVidSourceMime(file.type || 'image/png');
      setVidSourceName(file.name);
      setVidMode('image_to_video');
    } else if (target === 'video_clip') {
      setVidSourceDataUrl(dataUrl);
      setVidSourceMime(file.type || 'video/mp4');
      setVidSourceName(file.name);
      setVidMode('video_to_video');
    } else {
      setMusicImgDataUrl(dataUrl);
      setMusicImgMime(file.type || 'image/png');
      setMusicImgName(file.name);
    }
    e.target.value = '';
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim()) {
      setImgError('Please describe the image to create or the edit to apply.');
      return;
    }
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await apiRequest<{
        imageBase64: string;
        mimeType: string;
        text: string;
      }>('/api/ai/studio/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt: imgPrompt.trim(),
          imageBase64: imgSourceDataUrl || undefined,
          imageMimeType: imgSourceDataUrl ? imgSourceMime : undefined,
          aspectRatio: imgAspectRatio,
          imageSize: imgSize,
          enableWebSearch: imgWebSearch,
        }),
      });
      const dataUrl = `data:${res.mimeType || 'image/png'};base64,${res.imageBase64}`;
      setImgResult({ dataUrl, text: res.text, prompt: imgPrompt.trim() });
    } catch (err) {
      setImgError(err instanceof ApiError ? err.message : 'Image generation failed.');
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent, usePreviousTurn = false) => {
    e.preventDefault();
    if (!vidPrompt.trim()) {
      setVidError('Please describe the video scene or transformation prompt.');
      return;
    }
    if (vidMode === 'image_to_video' && !vidSourceDataUrl && !usePreviousTurn) {
      setVidError('Please upload a source photo to animate into video.');
      return;
    }
    if (vidMode === 'video_to_video' && !vidSourceDataUrl && !usePreviousTurn) {
      setVidError('Please upload an MP4 video clip to edit or transform.');
      return;
    }
    setVidLoading(true);
    setVidError(null);
    try {
      const res = await apiRequest<{
        videoBase64: string;
        mimeType: string;
        interactionId?: string;
      }>('/api/ai/studio/video', {
        method: 'POST',
        body: JSON.stringify({
          mode: vidMode,
          prompt: vidPrompt.trim(),
          imageBase64:
            vidMode === 'image_to_video' && !usePreviousTurn
              ? vidSourceDataUrl || undefined
              : undefined,
          imageMimeType:
            vidMode === 'image_to_video' && !usePreviousTurn ? vidSourceMime : undefined,
          videoBase64:
            vidMode === 'video_to_video' && !usePreviousTurn
              ? vidSourceDataUrl || undefined
              : undefined,
          videoMimeType:
            vidMode === 'video_to_video' && !usePreviousTurn ? vidSourceMime : undefined,
          aspectRatio: vidAspectRatio,
          duration: vidDuration,
          resolution: vidResolution,
          previousInteractionId: usePreviousTurn ? vidResult?.interactionId : undefined,
        }),
      });
      const blobUrl = base64ToBlobUrl(res.videoBase64, res.mimeType || 'video/mp4');
      setVidResult({
        blobUrl,
        mimeType: res.mimeType || 'video/mp4',
        interactionId: res.interactionId,
        prompt: vidPrompt.trim(),
      });
    } catch (err) {
      setVidError(err instanceof ApiError ? err.message : 'Video generation failed.');
    } finally {
      setVidLoading(false);
    }
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musicPrompt.trim() && !musicLyrics.trim()) {
      setMusicError('Please enter a music prompt or song lyrics.');
      return;
    }
    setMusicLoading(true);
    setMusicError(null);
    try {
      const res = await apiRequest<{
        audioBase64: string;
        mimeType: string;
        lyrics: string;
        model: string;
      }>('/api/ai/studio/music', {
        method: 'POST',
        body: JSON.stringify({
          prompt: (musicPrompt.trim() || musicLyrics.trim()).slice(0, 500),
          lyrics: musicLyrics.trim() || undefined,
          instrumental: !musicLyrics.trim(),
          model: musicModel,
          imageBase64: musicImgDataUrl || undefined,
          imageMimeType: musicImgDataUrl ? musicImgMime : undefined,
        }),
      });
      const resolvedMime = res.mimeType || 'audio/mpeg';
      const blobUrl = base64ToBlobUrl(res.audioBase64, resolvedMime);
      setMusicResult({
        blobUrl,
        mimeType: resolvedMime,
        lyrics: res.lyrics,
        model: res.model,
        prompt: (musicPrompt.trim() || musicLyrics.trim()).slice(0, 80),
      });
    } catch (err) {
      setMusicError(err instanceof ApiError ? err.message : 'Music generation failed.');
    } finally {
      setMusicLoading(false);
    }
  };

  return (
    <div
      data-testid="studio-ai-media-lab"
      className="grid grid-cols-1 lg:grid-cols-3 gap-5"
    >
      {/* 1. CREATE & EDIT IMAGES (gemini-nano-banana-2.1) */}
      <section className="rounded-2xl bg-[#091930]/95 border border-white/15 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[#F5C542] text-xs font-mono uppercase tracking-wider">
              <ImageIcon className="w-4 h-4" />
              <span>Nano Banana 2.1</span>
            </div>
            <h3 className="font-display text-base font-bold text-white mt-0.5">
              Create &amp; Edit Images
            </h3>
          </div>
          <span className="px-2 py-1 rounded-md bg-[#061121] border border-white/10 text-[10px] font-mono text-slate-300">
            gemini-nano-banana-2.1
          </span>
        </div>

        <form onSubmit={handleGenerateImage} className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-1.5">
            <label
              htmlFor="studio-img-prompt"
              className="block text-xs font-semibold text-slate-200"
            >
              Image Prompt or Edit Instruction
            </label>
            <textarea
              id="studio-img-prompt"
              rows={3}
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              placeholder="e.g., Futuristic gold-accented studio headphones on dark marble, dramatic rim lighting..."
              className="w-full rounded-xl bg-[#061121] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#F5C542] focus:outline-none"
            />
          </div>

          {/* Optional Source Photo to Edit */}
          <div className="rounded-xl bg-[#061121] border border-dashed border-white/15 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-300">
                Source Photo (optional, for Image Editing)
              </span>
              {imgSourceDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setImgSourceDataUrl(null);
                    setImgSourceName('');
                  }}
                  className="text-[11px] text-red-300 hover:text-red-200 inline-flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            {imgSourceDataUrl ? (
              <div className="flex items-center gap-2.5">
                <img
                  src={imgSourceDataUrl}
                  alt="Source to edit"
                  className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/40"
                />
                <span className="text-[11px] text-slate-300 truncate">{imgSourceName}</span>
              </div>
            ) : (
              <label
                htmlFor="studio-ai-img-upload"
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>Upload Image to Edit</span>
                <input
                  id="studio-ai-img-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadSourceMedia(e, 'image')}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-slate-300 block">Aspect Ratio</span>
              <select
                aria-label="Image aspect ratio"
                value={imgAspectRatio}
                onChange={(e) => setImgAspectRatio(e.target.value as ImageGenAspectRatio)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
              >
                <option value="1:1">1:1 Square</option>
                <option value="16:9">16:9 Landscape</option>
                <option value="9:16">9:16 Portrait</option>
                <option value="4:3">4:3 Standard</option>
                <option value="3:4">3:4 Vertical</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-300 block">Resolution</span>
              <select
                aria-label="Image resolution"
                value={imgSize}
                onChange={(e) => setImgSize(e.target.value as '1K' | '2K' | '4K')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
              >
                <option value="1K">1K Standard</option>
                <option value="2K">2K High Res</option>
                <option value="4K">4K Ultra HD</option>
              </select>
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={imgWebSearch}
              onChange={(e) => setImgWebSearch(e.target.checked)}
              className="accent-[#F5C542]"
            />
            <Globe className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Ground with Google Search</span>
          </label>

          {imgError && (
            <div className="rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-xs text-red-200">
              {imgError}
            </div>
          )}

          <button
            type="submit"
            disabled={imgLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-105 disabled:opacity-60"
          >
            {imgLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating with Nano Banana 2.1...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>{imgSourceDataUrl ? 'Edit Image' : 'Create Image'}</span>
              </>
            )}
          </button>
        </form>

        {imgResult && (
          <div className="rounded-xl bg-[#061121] border border-[#D4AF37]/40 p-3 space-y-2.5">
            <img
              src={imgResult.dataUrl}
              alt={imgResult.prompt}
              className="w-full rounded-lg border border-white/10 max-h-52 object-contain bg-black"
            />
            {imgResult.text && <p className="text-[11px] text-slate-300">{imgResult.text}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onAddImageToTimeline(imgResult.dataUrl, `AI: ${imgResult.prompt.slice(0, 18)}`)
                }
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Timeline</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImgSourceDataUrl(imgResult.dataUrl);
                  setImgSourceMime('image/png');
                  setImgSourceName('Generated Image');
                }}
                className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
              >
                Edit Further
              </button>
              <a
                href={imgResult.dataUrl}
                download="primex-nano-banana.png"
                className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </section>

      {/* 2. GENERATE, ANIMATE & EDIT VIDEO (gemini-omni-1.2-flash) */}
      <section className="rounded-2xl bg-[#091930]/95 border border-white/15 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[#F5C542] text-xs font-mono uppercase tracking-wider">
              <Film className="w-4 h-4 shrink-0" />
              <span>Omni Flash · Interactions</span>
            </div>
            <h3 className="font-display text-base font-bold text-white mt-0.5">
              Text, Image &amp; Video Studio
            </h3>
          </div>
          <span className="px-2 py-1 rounded-md bg-[#061121] border border-white/10 text-[10px] font-mono text-slate-300 whitespace-nowrap shrink-0">
            gemini-omni-1.2-flash
          </span>
        </div>

        {/* 3 Mode Toggle */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#061121] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setVidMode('text_to_video');
              setVidError(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              vidMode === 'text_to_video'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Text → Video
          </button>
          <button
            type="button"
            onClick={() => {
              setVidMode('image_to_video');
              setVidError(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              vidMode === 'image_to_video'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Photo → Video
          </button>
          <button
            type="button"
            onClick={() => {
              setVidMode('video_to_video');
              setVidError(null);
            }}
            className={`py-1.5 px-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              vidMode === 'video_to_video'
                ? 'bg-[#F5C542] text-[#0B1F3A]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Edit Video
          </button>
        </div>

        <form onSubmit={(e) => handleGenerateVideo(e, false)} className="space-y-3 flex-1 flex flex-col">
          {(vidMode === 'image_to_video' || vidMode === 'video_to_video') && (
            <div className="rounded-xl bg-[#061121] border border-dashed border-[#D4AF37]/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-200">
                  {vidMode === 'video_to_video' ? 'Source MP4 Video' : 'Photo to Animate'}
                </span>
                {vidSourceDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setVidSourceDataUrl(null);
                      setVidSourceName('');
                    }}
                    className="text-[11px] text-red-300 hover:text-red-200 inline-flex items-center gap-0.5"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
              {vidSourceDataUrl ? (
                <div className="flex items-center gap-2.5">
                  {vidMode === 'video_to_video' ? (
                    <video
                      src={vidSourceDataUrl}
                      className="w-16 h-10 rounded-lg object-cover border border-[#D4AF37]/40 bg-black"
                    />
                  ) : (
                    <img
                      src={vidSourceDataUrl}
                      alt="Starting frame"
                      className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/40"
                    />
                  )}
                  <span className="text-[11px] text-slate-300 truncate">{vidSourceName}</span>
                </div>
              ) : (
                <label
                  htmlFor="studio-ai-vid-source"
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-[#F5C542]" />
                  <span>
                    {vidMode === 'video_to_video'
                      ? 'Upload MP4 to Edit/Extend'
                      : 'Upload Photo to Animate'}
                  </span>
                  <input
                    id="studio-ai-vid-source"
                    type="file"
                    accept={vidMode === 'video_to_video' ? 'video/mp4,video/*' : 'image/*'}
                    onChange={(e) =>
                      handleUploadSourceMedia(
                        e,
                        vidMode === 'video_to_video' ? 'video_clip' : 'video_photo',
                      )
                    }
                    className="sr-only"
                  />
                </label>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="studio-vid-prompt"
              className="block text-xs font-semibold text-slate-200"
            >
              {vidMode === 'image_to_video'
                ? 'Animation Motion Prompt'
                : vidMode === 'video_to_video'
                  ? 'Video Edit / Transformation Prompt'
                  : 'Video Scene Prompt'}
            </label>
            <textarea
              id="studio-vid-prompt"
              rows={3}
              value={vidPrompt}
              onChange={(e) => setVidPrompt(e.target.value)}
              placeholder={
                vidMode === 'image_to_video'
                  ? 'e.g., Camera slowly orbits around the subject while golden light rays shimmer...'
                  : vidMode === 'video_to_video'
                    ? 'e.g., Change lighting to cyberpunk sunset neon reflections...'
                    : 'e.g., Slow cinematic dolly shot of a neon-lit robotics lab with brushed gold machinery...'
              }
              className="w-full rounded-xl bg-[#061121] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#F5C542] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-slate-300 block">Aspect</span>
              <select
                aria-label="Video aspect ratio"
                value={vidAspectRatio}
                onChange={(e) => setVidAspectRatio(e.target.value as VideoGenAspectRatio)}
                className="w-full px-2 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-300 block">Length</span>
              <select
                aria-label="Video duration"
                value={vidDuration}
                onChange={(e) => setVidDuration(e.target.value as '3s' | '5s' | '10s' | '15s')}
                className="w-full px-2 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
              >
                <option value="3s">3 sec</option>
                <option value="5s">5 sec</option>
                <option value="10s">10 sec</option>
                <option value="15s">15 sec</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-slate-300 block">Quality</span>
              <select
                aria-label="Video resolution"
                value={vidResolution}
                onChange={(e) => setVidResolution(e.target.value as '360p' | '720p' | '1080p')}
                className="w-full px-2 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
              >
                <option value="360p">360p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
          </div>

          {vidError && (
            <div className="rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-xs text-red-200">
              {vidError}
            </div>
          )}

          <button
            type="submit"
            disabled={vidLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-105 disabled:opacity-60"
          >
            {vidLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Rendering via Omni 1.2 Flash...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {vidMode === 'image_to_video'
                    ? 'Animate Photo to Video'
                    : vidMode === 'video_to_video'
                      ? 'Transform Video Clip'
                      : 'Generate Video'}
                </span>
              </>
            )}
          </button>
        </form>

        {vidResult && (
          <div className="rounded-xl bg-[#061121] border border-[#D4AF37]/40 p-3 space-y-2.5">
            <video
              src={vidResult.blobUrl}
              controls
              playsInline
              className="w-full rounded-lg border border-white/10 max-h-48 bg-black"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onAddVideoToTimeline(vidResult.blobUrl, `Omni: ${vidResult.prompt.slice(0, 16)}`)
                }
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Timeline</span>
              </button>
              {vidResult.interactionId && (
                <button
                  type="button"
                  disabled={vidLoading}
                  onClick={(e) => handleGenerateVideo(e, true)}
                  className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                >
                  Extend / Edit Turn
                </button>
              )}
              <a
                href={vidResult.blobUrl}
                download="primex-omni-video.mp4"
                className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </section>

      {/* 3. GENERATE MUSIC (lyria-3-clip-preview & lyria-3-pro-preview + Sung Lyrics + MP3) */}
      <section className="rounded-2xl bg-[#091930]/95 border border-white/15 p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[#F5C542] text-xs font-mono uppercase tracking-wider">
              <Music className="w-4 h-4" />
              <span>Lyria 3 Audio Studio</span>
            </div>
            <h3 className="font-display text-base font-bold text-white mt-0.5">
              AI Music Composer (.MP3)
            </h3>
          </div>
          <span className="px-2 py-1 rounded-md bg-[#061121] border border-white/10 text-[10px] font-mono text-slate-300">
            {musicModel}
          </span>
        </div>

        <form onSubmit={handleGenerateMusic} className="space-y-3 flex-1 flex flex-col">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#061121] border border-white/10">
            <button
              type="button"
              onClick={() => setMusicModel('lyria-3-clip-preview')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                musicModel === 'lyria-3-clip-preview'
                  ? 'bg-[#F5C542] text-[#0B1F3A]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Short Clip (≤30s)
            </button>
            <button
              type="button"
              onClick={() => setMusicModel('lyria-3-pro-preview')}
              className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                musicModel === 'lyria-3-pro-preview'
                  ? 'bg-[#F5C542] text-[#0B1F3A]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Full Track (Pro)
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="studio-music-prompt"
              className="block text-xs font-semibold text-slate-200"
            >
              Soundtrack / Music Description
            </label>
            <textarea
              id="studio-music-prompt"
              rows={2}
              value={musicPrompt}
              onChange={(e) => setMusicPrompt(e.target.value)}
              placeholder="e.g., Uplifting cinematic synthwave at 118 BPM with warm analog bass..."
              className="w-full rounded-xl bg-[#061121] border border-white/15 px-3 py-2 text-xs text-white focus:border-[#F5C542] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="studio-music-lyrics"
                className="block text-xs font-semibold text-slate-200"
              >
                Sung Lyrics (optional)
              </label>
              <button
                type="button"
                onClick={handleToggleMusicVoice}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${
                  listeningMusicVoice
                    ? 'bg-red-500 text-white border-red-400'
                    : 'bg-[#061121] text-[#F5C542] border-[#F5C542]/40 hover:bg-[#0B1F3A]'
                }`}
              >
                {listeningMusicVoice ? (
                  <>
                    <Square className="w-3 h-3" />
                    <span>Stop Voice</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3" />
                    <span>Voice Input</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              id="studio-music-lyrics"
              rows={2}
              value={musicLyrics}
              onChange={(e) => setMusicLyrics(e.target.value)}
              placeholder="Optional lyrics to sing (or tap Voice Input to speak)..."
              className="w-full rounded-xl bg-[#061121] border border-white/15 px-3 py-2 text-xs font-mono text-white focus:border-[#F5C542] focus:outline-none"
            />
          </div>

          {/* Optional Inspiration Image */}
          <div className="rounded-xl bg-[#061121] border border-dashed border-white/15 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-300">
                Mood Image (optional)
              </span>
              {musicImgDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setMusicImgDataUrl(null);
                    setMusicImgName('');
                  }}
                  className="text-[11px] text-red-300 hover:text-red-200 inline-flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            {musicImgDataUrl ? (
              <div className="flex items-center gap-2.5">
                <img
                  src={musicImgDataUrl}
                  alt="Music mood reference"
                  className="w-10 h-10 rounded-lg object-cover border border-[#D4AF37]/40"
                />
                <span className="text-[11px] text-slate-300 truncate">{musicImgName}</span>
              </div>
            ) : (
              <label
                htmlFor="studio-ai-music-img"
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>Attach Visual Mood</span>
                <input
                  id="studio-ai-music-img"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadSourceMedia(e, 'music')}
                  className="sr-only"
                />
              </label>
            )}
          </div>

          {musicError && (
            <div className="rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-xs text-red-200">
              {musicError}
            </div>
          )}

          <button
            type="submit"
            disabled={musicLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-105 disabled:opacity-60"
          >
            {musicLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Composing via {musicModel}...</span>
              </>
            ) : (
              <>
                <Music className="w-4 h-4" />
                <span>
                  {musicModel === 'lyria-3-clip-preview'
                    ? 'Generate MP3 Clip'
                    : 'Generate Full MP3 Track'}
                </span>
              </>
            )}
          </button>
        </form>

        {musicResult && (
          <div className="rounded-xl bg-[#061121] border border-[#D4AF37]/40 p-3 space-y-2.5">
            <audio src={musicResult.blobUrl} controls className="w-full" />
            {musicResult.lyrics && (
              <p className="text-[11px] text-slate-300 max-h-20 overflow-y-auto whitespace-pre-wrap">
                {musicResult.lyrics}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onAddAudioToTimeline(
                    musicResult.blobUrl,
                    `Lyria: ${musicResult.prompt.slice(0, 16)}`,
                    musicModel === 'lyria-3-clip-preview' ? 12 : 16,
                  )
                }
                className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Audio Track</span>
              </button>
              <a
                href={musicResult.blobUrl}
                download="primex-lyria-track.mp3"
                className="py-1.5 px-2.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-emerald-200 text-xs font-bold inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>MP3</span>
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
