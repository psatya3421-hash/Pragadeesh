import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Box,
  CheckCircle2,
  CreditCard,
  Crown,
  Download,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Lock,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Scissors,
  Sliders,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Upload,
  Video,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { ThreeSceneStudio } from './studio/ThreeSceneStudio';
import { StudioMediaGenPanel } from './studio/StudioMediaGenPanel';
import { StudioVoiceAudioPanel } from './studio/StudioVoiceAudioPanel';
import { StudioGeminiChatPanel } from './studio/StudioGeminiChatPanel';
import { VideoTrimPanel } from './studio/VideoTrimPanel';
import { CapCutProToolsPanel } from './studio/CapCutProToolsPanel';
import { CapCutTimeline } from './studio/CapCutTimeline';
import { PremiumEditsModal } from './studio/PremiumEditsModal';
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_STUDIO_FILTERS,
  EXPORT_FORMAT_OPTIONS,
  STUDIO_4K_FEE_INR,
  STUDIO_PREMIUM_MONTHLY_FEE_INR,
  buildCanvasFilterString,
  buildExportFilename,
  clampTrimWindow,
  classifyTimelineMediaFile,
  computeClipTransformState,
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
  getResolutionFeeINR,
  isPremiumSubscriptionActive,
  reorderClipsInTrack,
  splitClipAtTime,
  trimClip,
} from '../lib/studioLogic';
import type { VideoExportFormat } from '../lib/studioLogic';
import { formatINR } from '../lib/domainLogic';
import { BUILT_IN_SFX, getSynthesizedSfxUrl } from '../utils/sfxAudio';
import { apiRequest, ApiError, getStoredAuthToken } from '../utils/api';
import type {
  AspectRatioPreset,
  ExportResolution,
  Order,
  StudioCanvasBackground,
  StudioClip,
  StudioFilterPreset,
  StudioProject,
  StudioTextAnimation,
  StudioTextStyle,
  StudioVideoEffectPreset,
} from '../types';

interface PrimeXStudioTabProps {
  orders?: Order[];
  onOrderCreated?: (order: Order) => void;
  onOpenPayment?: (order: Order) => void;
  onOpenInvoice?: (order: Order) => void;
  onAiWarning?: (msg: string) => void;
  queuedExternalAudio?: {
    id: string;
    title: string;
    audioUrl: string;
    durationSeconds?: number;
  } | null;
  onConsumeQueuedAudio?: () => void;
  onSendTranscriptToMusic?: (lyricsText: string) => void;
}

interface UploadedMediaItem {
  id: string;
  clipId: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  url: string;
  fileSize?: number;
  mimeType?: string;
  formatLabel?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  processed?: boolean;
}

const STICKER_PRESETS = [
  { symbol: '★', label: 'Gold Star' },
  { symbol: '◆', label: 'Diamond' },
  { symbol: '▶', label: 'Play Mark' },
  { symbol: '✦', label: 'Prime Crest' },
  { symbol: '●', label: 'Studio Rec' },
  { symbol: '⚡', label: 'Energy' },
];

const RESOLUTION_OPTIONS: { id: ExportResolution; label: string; badge?: string }[] = [
  { id: '480p', label: '480p' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '4k', label: '4K', badge: `₹${STUDIO_4K_FEE_INR}` },
];

export const PrimeXStudioTab: React.FC<PrimeXStudioTabProps> = ({
  orders = [],
  onOrderCreated,
  onOpenPayment,
  onOpenInvoice,
  onAiWarning,
  queuedExternalAudio,
  onConsumeQueuedAudio,
  onSendTranscriptToMusic,
}) => {
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [projectTitle, setProjectTitle] = useState('Prime X Studio Cut');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>('16:9');
  const [exportResolution, setExportResolution] = useState<ExportResolution>('1080p');
  const [filter, setFilter] = useState<StudioFilterPreset>(DEFAULT_STUDIO_FILTERS.filter);
  const [brightness, setBrightness] = useState(DEFAULT_STUDIO_FILTERS.brightness);
  const [contrast, setContrast] = useState(DEFAULT_STUDIO_FILTERS.contrast);
  const [saturation, setSaturation] = useState(DEFAULT_STUDIO_FILTERS.saturation);
  const [grayscale, setGrayscale] = useState(DEFAULT_STUDIO_FILTERS.grayscale);
  const [sepia, setSepia] = useState(DEFAULT_STUDIO_FILTERS.sepia);
  const [blur, setBlur] = useState(DEFAULT_STUDIO_FILTERS.blur);

  const [clips, setClips] = useState<StudioClip[]>([
    {
      id: 'intro_backdrop',
      track: 'video',
      kind: 'image',
      name: 'Studio Backdrop',
      src: '/src/assets/images/primex_studio_backdrop_1794619332809.jpg',
      startTime: 0,
      duration: 5,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
    },
    {
      id: 'intro_title',
      track: 'text',
      kind: 'text',
      name: 'Title Overlay',
      startTime: 0.4,
      duration: 4.2,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: true,
      fadeOut: true,
      textContent: 'PRIME X INNOVATION',
      textColor: '#F5C542',
      fontSize: 42,
      posX: 50,
      posY: 50,
    },
  ]);

  const [uploadedMedia, setUploadedMedia] = useState<UploadedMediaItem[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('intro_backdrop');
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStageLabel, setExportStageLabel] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<VideoExportFormat>('mp4');
  const [exportSourceId, setExportSourceId] = useState<string>('timeline');
  const [creating4kOrder, setCreating4kOrder] = useState(false);
  const [mediaLoadTick, setMediaLoadTick] = useState(0);

  const [savedProjects, setSavedProjects] = useState<StudioProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState<'timeline' | '3d' | 'ai_media' | 'voice' | 'chat'>(
    'timeline',
  );
  const [toolPanel, setToolPanel] = useState<'media' | 'audio' | 'text' | 'color' | 'capcut' | 'projects'>('media');

  const [videoEffect, setVideoEffect] = useState<StudioVideoEffectPreset>('none');
  const [effectIntensity, setEffectIntensity] = useState<number>(65);
  const [canvasBackground, setCanvasBackground] = useState<StudioCanvasBackground>('navy');
  const [beatMarkersEnabled, setBeatMarkersEnabled] = useState<boolean>(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumRequestedFeature, setPremiumRequestedFeature] = useState<string | null>(null);
  const [creatingPremiumOrder, setCreatingPremiumOrder] = useState(false);
  const [previewTrimStopAt, setPreviewTrimStopAt] = useState<number | null>(null);

  const [newText, setNewText] = useState('Studio Edition');
  const [newTextColor, setNewTextColor] = useState('#F5C542');
  const [showTimelineOverlayInput, setShowTimelineOverlayInput] = useState(false);
  const [timelineOverlayText, setTimelineOverlayText] = useState('');
  const [timelineOverlayColor, setTimelineOverlayColor] = useState('#F5C542');
  const [timelineOverlayPosY, setTimelineOverlayPosY] = useState(75);
  const [timelineOverlaySize, setTimelineOverlaySize] = useState(38);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chromaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLImageElement | HTMLVideoElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const dragClipRef = useRef<{ track: StudioClip['track']; index: number } | null>(null);
  const timelineOverlayInputRef = useRef<HTMLInputElement | null>(null);

  const totalDuration = useMemo(() => computeTimelineDuration(clips), [clips]);
  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) || null,
    [clips, selectedClipId],
  );

  // Track monthly ₹49 Premium Edits subscription & 4K export payment status
  const premiumStatus = useMemo(
    () => isPremiumSubscriptionActive(orders),
    [orders],
  );
  const isPremiumUnlocked = premiumStatus.unlocked;

  const studio4kOrders = useMemo(
    () => orders.filter((o) => o.type === 'studio_4k'),
    [orders],
  );
  const latest4kOrder = studio4kOrders[0] || null;
  const is4kUnlocked = useMemo(
    () =>
      isPremiumUnlocked ||
      studio4kOrders.some(
        (o) => o.status === 'Verified' || o.status === 'Completed',
      ),
    [studio4kOrders, isPremiumUnlocked],
  );
  const verified4kOrder = useMemo(
    () =>
      studio4kOrders.find(
        (o) => o.status === 'Verified' || o.status === 'Completed',
      ) || null,
    [studio4kOrders],
  );

  const uploadedVideos = useMemo(
    () => uploadedMedia.filter((m) => m.kind === 'video'),
    [uploadedMedia],
  );

  useEffect(() => {
    if (!queuedExternalAudio) return;
    setClips((prev) => {
      const audioTrack = prev.filter((c) => c.track === 'audio');
      const endCursor = audioTrack.reduce(
        (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
        0,
      );
      const clipId = `music_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const nextClip: StudioClip = {
        id: clipId,
        track: 'audio',
        kind: 'audio',
        name: queuedExternalAudio.title.slice(0, 28),
        src: queuedExternalAudio.audioUrl,
        startTime: endCursor,
        duration: Math.max(4, Math.round(queuedExternalAudio.durationSeconds || 10)),
        trimStart: 0,
        speed: 1,
        volume: 0.9,
        fadeIn: true,
        fadeOut: true,
      };
      setSelectedClipId(clipId);
      return [...prev, nextClip];
    });
    setStatusMessage(`Imported "${queuedExternalAudio.title}" from Music Studio to Audio Track.`);
    onConsumeQueuedAudio?.();
  }, [queuedExternalAudio, onConsumeQueuedAudio]);

  const previewVideoMetadata = useMemo(() => {
    if (uploadedVideos.length === 0) return null;
    if (selectedClipId) {
      const selectedMatch = uploadedVideos.find((v) => v.clipId === selectedClipId);
      if (selectedMatch) return selectedMatch;
    }
    const activeVideoClip = clips.find((c) => {
      if (c.track !== 'video' || c.kind !== 'video') return false;
      const effDur = c.duration / Math.max(0.25, c.speed || 1);
      return playhead >= c.startTime && playhead <= c.startTime + effDur;
    });
    if (activeVideoClip) {
      const activeMatch = uploadedVideos.find((v) => v.clipId === activeVideoClip.id);
      if (activeMatch) return activeMatch;
    }
    return uploadedVideos[0];
  }, [uploadedVideos, selectedClipId, clips, playhead]);

  const applyExtractedVideoMetadata = (
    mediaId: string,
    clipId: string,
    width: number,
    height: number,
    durationSec: number,
  ) => {
    const cleanWidth = width > 0 ? Math.round(width) : undefined;
    const cleanHeight = height > 0 ? Math.round(height) : undefined;
    const cleanDuration =
      Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined;

    setUploadedMedia((prev) =>
      prev.map((item) =>
        item.id === mediaId
          ? {
              ...item,
              width: cleanWidth ?? item.width,
              height: cleanHeight ?? item.height,
              durationSec: cleanDuration ?? item.durationSec,
              processed: true,
            }
          : item,
      ),
    );

    if (cleanDuration && cleanDuration >= 0.5) {
      const clamped = Math.min(180, Math.round(cleanDuration * 10) / 10);
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? {
                ...c,
                sourceDuration: c.sourceDuration ?? clamped,
                duration: c.trimStart > 0 ? c.duration : clamped,
              }
            : c,
        ),
      );
    }
  };

  const probeAndRecordVideoMetadata = (mediaId: string, clipId: string, objectUrl: string) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    probe.playsInline = true;

    let finished = false;
    const finalize = () => {
      if (finished) return;
      finished = true;
      applyExtractedVideoMetadata(
        mediaId,
        clipId,
        probe.videoWidth || 0,
        probe.videoHeight || 0,
        probe.duration,
      );
      probe.removeAttribute('src');
      probe.load();
    };

    probe.onloadedmetadata = finalize;
    probe.onerror = () => {
      if (finished) return;
      finished = true;
      setUploadedMedia((prev) =>
        prev.map((item) => (item.id === mediaId ? { ...item, processed: true } : item)),
      );
    };
    window.setTimeout(finalize, 3500);
    probe.src = objectUrl;
  };

  const probeAndRecordAudioDuration = (
    mediaId: string,
    clipId: string,
    objectUrl: string,
  ) => {
    const probe = new Audio();
    probe.preload = 'metadata';
    let finished = false;
    const finalize = () => {
      if (finished) return;
      finished = true;
      const dur = probe.duration;
      if (Number.isFinite(dur) && dur >= 0.5) {
        const clamped = Math.min(300, Math.round(dur * 10) / 10);
        setUploadedMedia((prev) =>
          prev.map((item) =>
            item.id === mediaId
              ? { ...item, durationSec: clamped, processed: true }
              : item,
          ),
        );
        setClips((prev) =>
          prev.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  sourceDuration: c.sourceDuration ?? clamped,
                  duration: clamped,
                }
              : c,
          ),
        );
      } else {
        setUploadedMedia((prev) =>
          prev.map((item) => (item.id === mediaId ? { ...item, processed: true } : item)),
        );
      }
      probe.src = '';
    };
    probe.onloadedmetadata = finalize;
    probe.onerror = finalize;
    window.setTimeout(finalize, 3000);
    probe.src = objectUrl;
  };

  // Load saved projects for user
  useEffect(() => {
    apiRequest<{ projects: StudioProject[] }>('/api/studio-projects')
      .then((res) => setSavedProjects(res.projects))
      .catch(() => {});
  }, []);

  // Preload media DOM elements for clips
  useEffect(() => {
    for (const clip of clips) {
      if ((clip.kind === 'image' || clip.kind === 'video') && clip.src) {
        if (!mediaElementsRef.current.has(clip.id)) {
          if (clip.kind === 'image') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => setMediaLoadTick((t) => t + 1);
            img.src = clip.src;
            mediaElementsRef.current.set(clip.id, img);
          } else {
            const vid = document.createElement('video');
            vid.onloadeddata = () => setMediaLoadTick((t) => t + 1);
            vid.onseeked = () => setMediaLoadTick((t) => t + 1);
            vid.src = clip.src;
            vid.muted = true;
            vid.playsInline = true;
            vid.preload = 'auto';
            mediaElementsRef.current.set(clip.id, vid);
          }
        }
      }
      if (clip.kind === 'audio' || clip.kind === 'sfx') {
        const srcUrl =
          clip.kind === 'sfx' && clip.sfxType
            ? getSynthesizedSfxUrl(clip.sfxType)
            : clip.src;
        if (srcUrl && !audioElementsRef.current.has(clip.id)) {
          const aud = new Audio(srcUrl);
          aud.preload = 'auto';
          audioElementsRef.current.set(clip.id, aud);
        }
      }
    }
  }, [clips]);

  // Render canvas frame at current playhead (scales to chosen export resolution during export)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = isExporting
      ? getExportDimensions(aspectRatio, exportResolution)
      : getCanvasDimensions(aspectRatio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Canvas Background Fill
    if (canvasBackground === 'black') {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, width, height);
    } else if (canvasBackground === 'sunset' && isPremiumUnlocked) {
      const sGrad = ctx.createLinearGradient(0, 0, width, height);
      sGrad.addColorStop(0, '#360F24');
      sGrad.addColorStop(0.55, '#9F3D19');
      sGrad.addColorStop(1, '#1B1E36');
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, 0, width, height);
    } else if (canvasBackground === 'studio_matte' && isPremiumUnlocked) {
      const mGrad = ctx.createLinearGradient(0, 0, 0, height);
      mGrad.addColorStop(0, '#1E293B');
      mGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = mGrad;
      ctx.fillRect(0, 0, width, height);
    } else {
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#071528');
      bgGrad.addColorStop(1, '#16325C');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    const filterCss = buildCanvasFilterString(filter, brightness, contrast, saturation, {
      grayscale,
      sepia,
      blur,
    });

    // Draw active video/image clip
    const activeVisuals = clips.filter((c) => {
      if (c.track !== 'video') return false;
      const effDur = c.duration / Math.max(0.25, c.speed || 1);
      const endT = c.startTime + effDur;
      return playhead >= c.startTime && (playhead < endT || (endT >= totalDuration - 0.05 && playhead <= endT));
    });

    for (const clip of activeVisuals) {
      const effDur = clip.duration / Math.max(0.25, clip.speed || 1);
      const localT = playhead - clip.startTime;
      const tr = computeClipTransformState(clip, localT, effDur);

      const el = mediaElementsRef.current.get(clip.id);
      if (el) {
        if (el instanceof HTMLVideoElement) {
          const speed = Math.max(0.25, clip.speed || 1);
          const targetVideoTime =
            clip.reverse && isPremiumUnlocked
              ? clip.trimStart + Math.max(0, clip.duration - localT * speed)
              : clip.trimStart + localT * speed;
          const seekThreshold = isPlaying ? 0.25 : 0.08;
          if (Math.abs(el.currentTime - targetVideoTime) > seekThreshold && el.readyState >= 1) {
            el.currentTime = targetVideoTime;
          }
        }

        const isVideoReady = el instanceof HTMLVideoElement ? el.readyState >= 2 : el.complete && el.naturalWidth > 0;
        if (isVideoReady) {
          // Optional Blurred Video Backdrop Fill
          if (canvasBackground === 'blur_fill' && isPremiumUnlocked) {
            ctx.save();
            ctx.filter = 'blur(18px) brightness(55%)';
            ctx.drawImage(el, -width * 0.08, -height * 0.08, width * 1.16, height * 1.16);
            ctx.restore();
          }

          // Optional Live Chroma Key Processing
          let sourceDrawable: CanvasImageSource = el;
          if (clip.chromaKeyEnabled && isPremiumUnlocked) {
            const cCanvas = chromaCanvasRef.current || document.createElement('canvas');
            chromaCanvasRef.current = cCanvas;
            const cw = Math.min(width, 480);
            const ch = Math.max(1, Math.round((cw * height) / width));
            if (cCanvas.width !== cw || cCanvas.height !== ch) {
              cCanvas.width = cw;
              cCanvas.height = ch;
            }
            const cCtx = cCanvas.getContext('2d');
            if (cCtx) {
              cCtx.clearRect(0, 0, cw, ch);
              cCtx.drawImage(el, 0, 0, cw, ch);
              const imgData = cCtx.getImageData(0, 0, cw, ch);
              const data = imgData.data;
              const tol = clip.chromaKeyTolerance ?? 48;
              const isBlue = clip.chromaKeyColor === 'blue';
              for (let p = 0; p < data.length; p += 4) {
                const r = data[p];
                const g = data[p + 1];
                const b = data[p + 2];
                if (isBlue) {
                  if (b > 95 && b - Math.max(r, g) > Math.max(12, 85 - tol)) {
                    data[p + 3] = 0;
                  }
                } else {
                  if (g > 95 && g - Math.max(r, b) > Math.max(12, 85 - tol)) {
                    data[p + 3] = 0;
                  }
                }
              }
              cCtx.putImageData(imgData, 0, 0);
              sourceDrawable = cCanvas;
            }
          }

          ctx.save();
          if (tr.wipeProgress !== null) {
            ctx.beginPath();
            ctx.rect(0, 0, width * tr.wipeProgress, height);
            ctx.clip();
          }
          ctx.globalAlpha = tr.alpha;
          ctx.filter = filterCss;

          let fxZoomBoost = 1;
          if (isPremiumUnlocked && videoEffect === 'zoom_pulse') {
            const pulse = Math.abs(Math.sin(playhead * Math.PI * 2.2));
            fxZoomBoost = 1 + pulse * (effectIntensity / 100) * 0.14;
          }

          ctx.translate(width / 2 + tr.translateXRatio * width, height / 2 + tr.translateYRatio * height);
          if (tr.rotationRad !== 0) {
            ctx.rotate(tr.rotationRad);
          }
          ctx.scale(tr.scaleX * fxZoomBoost, tr.scaleY * fxZoomBoost);
          ctx.drawImage(sourceDrawable, -width / 2, -height / 2, width, height);
          ctx.restore();

          if (tr.flashAlpha > 0) {
            ctx.save();
            ctx.fillStyle = `rgba(255,255,255,${tr.flashAlpha.toFixed(2)})`;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
          }
        }
      }
    }

    // Apply CapCut Pro Post-Process Video Effects (Live on Canvas)
    if (isPremiumUnlocked && videoEffect !== 'none') {
      const strength = Math.max(0.1, Math.min(1, effectIntensity / 100));
      if (videoEffect === 'mirror_split') {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(canvas, 0, 0, width / 2, height, 0, 0, width / 2, height);
        ctx.restore();
      } else if (videoEffect === 'vignette') {
        const vig = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.25,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.68,
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(0,0,0,${(0.75 * strength).toFixed(2)})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, width, height);
      } else if (videoEffect === 'vhs') {
        ctx.save();
        ctx.fillStyle = `rgba(255, 160, 80, ${(0.08 * strength).toFixed(2)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.22 * strength).toFixed(2)})`;
        for (let y = 0; y < height; y += 4) {
          ctx.fillRect(0, y, width, 1.5);
        }
        ctx.restore();
      } else if (videoEffect === 'glitch_rgb') {
        const offset = Math.round(14 * strength * Math.sin(playhead * 18));
        ctx.save();
        ctx.globalAlpha = 0.35 * strength;
        ctx.globalCompositeOperation = 'screen';
        const bandH = Math.max(12, Math.round(height * 0.16));
        const bandY = Math.round(((playhead * 140) % Math.max(1, height - bandH)));
        ctx.drawImage(canvas, 0, bandY, width, bandH, offset, bandY, width, bandH);
        ctx.restore();
      } else if (videoEffect === 'film_grain') {
        ctx.save();
        ctx.fillStyle = `rgba(255, 245, 220, ${(0.12 * strength).toFixed(2)})`;
        const count = Math.round(140 * strength);
        for (let i = 0; i < count; i++) {
          const gx = ((Math.sin(i * 12.9898 + playhead * 31) * 43758.5453) % 1 + 1) % 1;
          const gy = ((Math.cos(i * 78.233 + playhead * 17) * 23421.631) % 1 + 1) % 1;
          ctx.fillRect(gx * width, gy * height, 2, 2);
        }
        ctx.restore();
      } else if (videoEffect === 'dream_glow') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.28 * strength;
        ctx.filter = `blur(${Math.round(8 * strength)}px) brightness(120%)`;
        ctx.drawImage(canvas, 0, 0, width, height);
        ctx.restore();
      }
    }

    // Draw active text & sticker overlays (with Kinetic Styles & Animations)
    const previewBaseWidth = getCanvasDimensions(aspectRatio).width;
    const scaleFactor = width / Math.max(1, previewBaseWidth);

    const activeOverlays = clips.filter((c) => {
      if (c.track !== 'text') return false;
      const effDur = c.duration / Math.max(0.25, c.speed || 1);
      return playhead >= c.startTime && playhead <= c.startTime + effDur;
    });

    for (const ov of activeOverlays) {
      const effDur = ov.duration / Math.max(0.25, ov.speed || 1);
      const localT = playhead - ov.startTime;
      let alpha = ov.opacity ?? 1;
      if (ov.fadeIn && localT < 0.4) alpha *= Math.max(0.05, localT / 0.4);
      if (ov.fadeOut && effDur - localT < 0.4) {
        alpha *= Math.min(alpha, Math.max(0.05, (effDur - localT) / 0.4));
      }

      let rawText = ov.kind === 'sticker' ? ov.stickerSymbol || '★' : ov.textContent || '';
      let animScale = 1;
      let animOffsetY = 0;

      if (isPremiumUnlocked && ov.textAnimation && ov.textAnimation !== 'none') {
        if (ov.textAnimation === 'pop_in' && localT < 0.35) {
          animScale = 0.65 + (localT / 0.35) * 0.42;
        } else if (ov.textAnimation === 'slide_up' && localT < 0.35) {
          animOffsetY = (1 - localT / 0.35) * 28 * scaleFactor;
        } else if (ov.textAnimation === 'bounce') {
          animOffsetY = -Math.abs(Math.sin(localT * Math.PI * 3)) * 10 * scaleFactor;
        } else if (ov.textAnimation === 'typewriter') {
          const revealPct = Math.min(1, localT / Math.max(0.4, effDur * 0.65));
          rawText = rawText.slice(0, Math.max(1, Math.ceil(rawText.length * revealPct)));
        }
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      const x = ((ov.posX ?? 50) / 100) * width;
      const y = ((ov.posY ?? 50) / 100) * height + animOffsetY;
      const size = Math.round((ov.fontSize ?? 36) * scaleFactor * animScale);
      ctx.font = `700 ${size}px Poppins, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const tStyle = isPremiumUnlocked ? ov.textStyle || 'classic' : 'classic';
      const metrics = ctx.measureText(rawText);
      const padX = 18 * scaleFactor;
      const padY = 10 * scaleFactor;
      const boxW = metrics.width + padX * 2;
      const boxH = size + padY * 1.4;

      if (tStyle === 'karaoke') {
        ctx.fillStyle = 'rgba(11, 31, 58, 0.88)';
        ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
        ctx.strokeStyle = '#F5C542';
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
      } else if (tStyle === 'neon_box') {
        ctx.fillStyle = '#F5C542';
        ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
      } else if (tStyle === 'minimal_sub') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH);
      }

      if (tStyle === 'bold_yellow') {
        ctx.lineWidth = Math.max(3, 6 * scaleFactor);
        ctx.strokeStyle = '#050F1E';
        ctx.strokeText(rawText, x, y);
      }

      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = tStyle === 'neon_box' ? 0 : 12 * scaleFactor;
      ctx.fillStyle =
        tStyle === 'neon_box'
          ? '#0B1F3A'
          : tStyle === 'minimal_sub'
            ? '#FFFFFF'
            : ov.textColor || '#F5C542';
      ctx.fillText(rawText, x, y);
      ctx.restore();
    }
  }, [
    clips,
    playhead,
    aspectRatio,
    exportResolution,
    isExporting,
    filter,
    brightness,
    contrast,
    saturation,
    grayscale,
    sepia,
    blur,
    videoEffect,
    effectIntensity,
    canvasBackground,
    isPremiumUnlocked,
    isPlaying,
    totalDuration,
    mediaLoadTick,
  ]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      audioElementsRef.current.forEach((aud) => {
        if (!aud.paused) aud.pause();
      });
      return;
    }

    let last = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setPlayhead((prev) => {
        const next = prev + dt;
        // Sync audio playback
        for (const clip of clips) {
          if (clip.track !== 'audio') continue;
          const aud = audioElementsRef.current.get(clip.id);
          if (!aud) continue;
          const effDur = clip.duration / Math.max(0.25, clip.speed || 1);
          const inRange = next >= clip.startTime && next <= clip.startTime + effDur;
          if (inRange) {
            aud.volume = Math.max(0, Math.min(1, clip.volume));
            aud.playbackRate = Math.max(0.5, Math.min(2, clip.speed || 1));
            const targetAudioTime = clip.trimStart + (next - clip.startTime) * (clip.speed || 1);
            if (aud.paused) {
              aud.currentTime = targetAudioTime;
              aud.play().catch(() => {});
            }
          } else if (!aud.paused) {
            aud.pause();
          }
        }

        if (previewTrimStopAt !== null && next >= previewTrimStopAt) {
          setIsPlaying(false);
          setPreviewTrimStopAt(null);
          return Math.max(0, previewTrimStopAt - 0.05);
        }

        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration, clips, previewTrimStopAt]);

  const importFilesToTimeline = (files: File[]) => {
    if (files.length === 0) return;

    const newClips: StudioClip[] = [];
    const newMediaItems: UploadedMediaItem[] = [];
    const routeNotes: string[] = [];

    for (const file of files) {
      const classified = classifyTimelineMediaFile({ name: file.name, type: file.type });
      if (classified === 'unsupported') continue;

      const objectUrl = URL.createObjectURL(file);
      const id = `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      if (classified === 'video') {
        const trackClips = [...clips, ...newClips].filter((c) => c.track === 'video');
        const endCursor = trackClips.reduce(
          (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
          0,
        );
        newClips.push({
          id,
          track: 'video',
          kind: 'video',
          name: file.name.slice(0, 28),
          src: objectUrl,
          startTime: endCursor,
          duration: 6,
          trimStart: 0,
          speed: 1,
          volume: 1,
          fadeIn: false,
          fadeOut: false,
        });
        const mediaId = `med_${id}`;
        const formatLabel = extractVideoFormat(file.name, file.type);
        newMediaItems.push({
          id: mediaId,
          clipId: id,
          name: file.name,
          kind: 'video',
          url: objectUrl,
          fileSize: file.size,
          mimeType: file.type,
          formatLabel,
          processed: false,
        });
        probeAndRecordVideoMetadata(mediaId, id, objectUrl);
        routeNotes.push(`"${file.name}" → Video Track`);
      } else if (classified === 'image') {
        const trackClips = [...clips, ...newClips].filter((c) => c.track === 'video');
        const endCursor = trackClips.reduce(
          (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
          0,
        );
        newClips.push({
          id,
          track: 'video',
          kind: 'image',
          name: file.name.slice(0, 28),
          src: objectUrl,
          startTime: endCursor,
          duration: 4,
          trimStart: 0,
          speed: 1,
          volume: 1,
          fadeIn: true,
          fadeOut: false,
        });
        newMediaItems.push({
          id: `med_${id}`,
          clipId: id,
          name: file.name,
          kind: 'image',
          url: objectUrl,
          fileSize: file.size,
        });
        routeNotes.push(`"${file.name}" → Video Track`);
      } else if (classified === 'audio') {
        const audioTrack = [...clips, ...newClips].filter((c) => c.track === 'audio');
        const endCursor = audioTrack.reduce(
          (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
          0,
        );
        newClips.push({
          id,
          track: 'audio',
          kind: 'audio',
          name: file.name.slice(0, 28),
          src: objectUrl,
          startTime: endCursor,
          duration: 8,
          trimStart: 0,
          speed: 1,
          volume: 0.85,
          fadeIn: true,
          fadeOut: true,
        });
        const mediaId = `med_${id}`;
        newMediaItems.push({
          id: mediaId,
          clipId: id,
          name: file.name,
          kind: 'audio',
          url: objectUrl,
          fileSize: file.size,
          mimeType: file.type || 'audio/mpeg',
          formatLabel: file.name.split('.').pop()?.toUpperCase() || 'MP3',
          processed: false,
        });
        probeAndRecordAudioDuration(mediaId, id, objectUrl);
        routeNotes.push(`"${file.name}" → Audio Track`);
      }
    }

    if (newClips.length > 0) {
      setClips((prev) => [...prev, ...newClips]);
      setUploadedMedia((prev) => [...newMediaItems, ...prev]);
      setSelectedClipId(newClips[0].id);
      if (newClips[0].kind === 'video') {
        setPlayhead(newClips[0].startTime);
      }
      setStatusMessage(
        `Added ${routeNotes.join(', ')} on the timeline.`,
      );
    } else {
      onAiWarning?.(
        'Unsupported media format. Use MP4/WebM/MOV for video, PNG/JPG for images, or MP3/WAV for audio.',
      );
    }
  };

  const handleImportFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    importFilesToTimeline(files);
    e.target.value = '';
  };

  const handleAddBuiltInSfx = (sfx: (typeof BUILT_IN_SFX)[number]) => {
    const audioTrack = clips.filter((c) => c.track === 'audio');
    const endCursor = audioTrack.reduce(
      (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
      0,
    );
    const clip: StudioClip = {
      id: `sfx_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      track: 'audio',
      kind: 'sfx',
      name: sfx.label,
      sfxType: sfx.id,
      startTime: endCursor,
      duration: sfx.duration,
      trimStart: 0,
      speed: 1,
      volume: 0.8,
      fadeIn: false,
      fadeOut: true,
    };
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
    setStatusMessage(`Added "${sfx.label}" to Audio Track.`);
  };

  const handlePreviewSfx = (sfxId: NonNullable<StudioClip['sfxType']>) => {
    const url = getSynthesizedSfxUrl(sfxId);
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  };

  const handleAddTextOverlay = (
    overrideText?: string,
    overrideColor?: string,
    overridePosY?: number,
    overrideFontSize?: number,
  ) => {
    const targetText = overrideText !== undefined ? overrideText : newText;
    const clip = createTextOverlayClip(targetText, {
      startTime: playhead,
      duration: 3.5,
      textColor: overrideColor || newTextColor,
      fontSize: overrideFontSize ?? 38,
      posX: 50,
      posY: overridePosY ?? 75,
    });
    if (!clip) {
      onAiWarning?.('Please type overlay text before adding it to the timeline.');
      return;
    }
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
    setStatusMessage(`Added text overlay "${clip.textContent}" onto Overlay Track at ${clip.startTime.toFixed(1)}s.`);
  };

  const handleAddTimelineOverlay = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!timelineOverlayText.trim()) {
      onAiWarning?.('Type your overlay text first before adding to the Overlay track.');
      timelineOverlayInputRef.current?.focus();
      return;
    }
    handleAddTextOverlay(
      timelineOverlayText,
      timelineOverlayColor,
      timelineOverlayPosY,
      timelineOverlaySize,
    );
    setTimelineOverlayText('');
  };

  const handleAddSticker = (symbol: string, label: string) => {
    const clip: StudioClip = {
      id: `stk_${Date.now()}`,
      track: 'text',
      kind: 'sticker',
      name: label,
      startTime: Math.round(playhead * 10) / 10,
      duration: 3,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: true,
      fadeOut: true,
      stickerSymbol: symbol,
      textColor: '#F5C542',
      fontSize: 56,
      posX: 82,
      posY: 22,
    };
    setClips((prev) => [...prev, clip]);
    setSelectedClipId(clip.id);
  };

  const handleSplitSelected = () => {
    if (!selectedClipId) return;
    const next = splitClipAtTime(clips, selectedClipId, playhead);
    if (next.length === clips.length) {
      setStatusMessage('Move the playhead inside the selected clip to split it.');
    } else {
      setClips(next);
      setStatusMessage('Clip split at playhead.');
    }
  };

  const handleDeleteClip = (clipId: string) => {
    const target = clips.find((c) => c.id === clipId);
    const mediaEl = mediaElementsRef.current.get(clipId);
    if (mediaEl instanceof HTMLVideoElement) {
      try {
        mediaEl.pause();
        mediaEl.removeAttribute('src');
      } catch {
        // ignore
      }
    }
    mediaElementsRef.current.delete(clipId);

    const audioEl = audioElementsRef.current.get(clipId);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.src = '';
      } catch {
        // ignore
      }
    }
    audioElementsRef.current.delete(clipId);

    setClips((prev) => prev.filter((c) => c.id !== clipId));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
    if (target) {
      setStatusMessage(`Deleted "${target.name}" from timeline.`);
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedClipId) return;
    handleDeleteClip(selectedClipId);
  };

  const handleSaveProject = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const serializableClips = clips.map((c) => ({
        ...c,
        src: c.src?.startsWith('blob:') ? undefined : c.src,
      }));
      const res = await apiRequest<{ project: StudioProject }>('/api/studio-projects', {
        method: 'POST',
        body: JSON.stringify({
          id: projectId,
          title: projectTitle,
          aspectRatio,
          filter,
          brightness,
          contrast,
          saturation,
          grayscale,
          sepia,
          blur,
          videoEffect,
          effectIntensity,
          canvasBackground,
          clips: serializableClips,
        }),
      });
      setProjectId(res.project.id);
      setSavedProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== res.project.id);
        return [res.project, ...filtered];
      });
      setStatusMessage(`Saved "${res.project.title}" to your account.`);
    } catch (err) {
      onAiWarning?.(err instanceof ApiError ? err.message : 'Failed to save studio project.');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadProject = (proj: StudioProject) => {
    setProjectId(proj.id);
    setProjectTitle(proj.title);
    setAspectRatio(proj.aspectRatio);
    setFilter(proj.filter);
    setBrightness(proj.brightness);
    setContrast(proj.contrast);
    setSaturation(proj.saturation);
    setGrayscale(proj.grayscale ?? 0);
    setSepia(proj.sepia ?? 0);
    setBlur(proj.blur ?? 0);
    setVideoEffect(proj.videoEffect ?? 'none');
    setEffectIntensity(proj.effectIntensity ?? 65);
    setCanvasBackground(proj.canvasBackground ?? 'navy');
    setClips(proj.clips);
    setPlayhead(0);
    setStatusMessage(`Loaded project "${proj.title}".`);
  };

  const handleApplyFilterPreset = (preset: StudioFilterPreset) => {
    if (preset === 'none') {
      setFilter(DEFAULT_STUDIO_FILTERS.filter);
      setBrightness(DEFAULT_STUDIO_FILTERS.brightness);
      setContrast(DEFAULT_STUDIO_FILTERS.contrast);
      setSaturation(DEFAULT_STUDIO_FILTERS.saturation);
      setGrayscale(DEFAULT_STUDIO_FILTERS.grayscale);
      setSepia(DEFAULT_STUDIO_FILTERS.sepia);
      setBlur(DEFAULT_STUDIO_FILTERS.blur);
      return;
    }
    setFilter(preset);
    if (preset === 'grayscale') {
      setGrayscale(100);
      setSepia(0);
    } else if (preset === 'sepia') {
      setSepia(100);
      setGrayscale(0);
    } else {
      setGrayscale(0);
      setSepia(0);
    }
  };

  const handleResetFilters = () => {
    handleApplyFilterPreset('none');
    setStatusMessage('Image & video filters reset to Natural.');
  };

  const handlePayFor4k = async () => {
    const existingPending = studio4kOrders.find(
      (o) =>
        o.status !== 'Rejected' &&
        o.status !== 'Verified' &&
        o.status !== 'Completed',
    );
    if (existingPending) {
      onOpenPayment?.(existingPending);
      return;
    }

    setCreating4kOrder(true);
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'studio_4k',
          studioProjectTitle: projectTitle,
        }),
      });
      onOrderCreated?.(res.order);
      onOpenPayment?.(res.order);
    } catch (err) {
      onAiWarning?.(
        err instanceof ApiError
          ? err.message
          : 'Could not initiate ₹10 4K export checkout.',
      );
    } finally {
      setCreating4kOrder(false);
    }
  };

  const handleOpenPremiumModal = (featureLabel?: string) => {
    setPremiumRequestedFeature(featureLabel || null);
    setShowPremiumModal(true);
  };

  const handlePayPremiumMonthly = async () => {
    setCreatingPremiumOrder(true);
    try {
      const res = await apiRequest<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'studio_premium',
        }),
      });
      setShowPremiumModal(false);
      onOrderCreated?.(res.order);
      onOpenPayment?.(res.order);
    } catch (err) {
      onAiWarning?.(
        err instanceof ApiError
          ? err.message
          : `Could not initiate ₹${STUDIO_PREMIUM_MONTHLY_FEE_INR}/mo Premium Edits checkout.`,
      );
    } finally {
      setCreatingPremiumOrder(false);
    }
  };

  const handleApplyVideoTrim = (clipId: string, startSec: number, endSec: number) => {
    const target = clips.find((c) => c.id === clipId);
    if (!target) return;
    const maxSource = target.sourceDuration ?? Math.max(endSec, target.trimStart + target.duration);
    const trimmedWindow = clampTrimWindow(startSec, endSec, maxSource);
    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId
          ? {
              ...trimClip(c, trimmedWindow.startTime, trimmedWindow.duration),
              sourceDuration: c.sourceDuration ?? maxSource,
            }
          : c,
      ),
    );
    setSelectedClipId(clipId);
    setPlayhead(target.startTime);
    setPreviewTrimStopAt(null);
    setIsPlaying(false);
    setStatusMessage(
      `Trimmed "${target.name}" to ${formatTimestampMMSS(trimmedWindow.startTime)} – ${formatTimestampMMSS(trimmedWindow.endTime)} (${trimmedWindow.duration.toFixed(2)}s).`,
    );
  };

  const handlePreviewTrimRange = (clipId: string, startSec: number, endSec: number) => {
    const target = clips.find((c) => c.id === clipId);
    if (!target) return;
    handleApplyVideoTrim(clipId, startSec, endSec);
    const dur = Math.max(0.5, endSec - startSec);
    setPlayhead(target.startTime);
    setPreviewTrimStopAt(target.startTime + dur / Math.max(0.25, target.speed || 1));
    setIsPlaying(true);
  };

  const handleFreezeFrameAtPlayhead = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const id = `freeze_${Date.now()}`;
      const newClip: StudioClip = {
        id,
        track: 'video',
        kind: 'image',
        name: `Freeze @ ${playhead.toFixed(1)}s`,
        src: dataUrl,
        startTime: Math.round(playhead * 10) / 10,
        duration: 2.5,
        trimStart: 0,
        speed: 1,
        volume: 1,
        fadeIn: false,
        fadeOut: false,
      };
      setClips((prev) => [...prev, newClip]);
      setSelectedClipId(id);
      setStatusMessage(`Inserted Freeze Frame clip at ${playhead.toFixed(1)}s.`);
    } catch {
      onAiWarning?.('Unable to capture freeze frame from external video source.');
    }
  };

  const handleGenerateAutoCaptions = (
    script: string,
    style: StudioTextStyle,
    animation: StudioTextAnimation,
  ) => {
    const generated = generateTimedCaptionsFromScript(script, playhead, style, animation, 4);
    if (generated.length === 0) {
      setStatusMessage('Enter script text to generate timed kinetic captions.');
      return;
    }
    setClips((prev) => [...prev, ...generated]);
    setSelectedClipId(generated[0].id);
    setStatusMessage(`Generated ${generated.length} timed CapCut caption clips on Text Track.`);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
  };

  const transcodeVideoOnServer = async (
    rawBlob: Blob,
    targetFormat: VideoExportFormat,
    filename: string,
    trimWindow?: { start: number; duration: number },
  ): Promise<Blob> => {
    const token = getStoredAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': rawBlob.type || 'video/webm',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const qs = new URLSearchParams({
      format: targetFormat,
      filename,
    });
    if (trimWindow) {
      qs.set('trimStart', String(trimWindow.start));
      qs.set('trimDuration', String(trimWindow.duration));
    }
    const res = await fetch(
      `/api/studio/export-transcode?${qs.toString()}`,
      {
        method: 'POST',
        credentials: 'include',
        headers,
        body: rawBlob,
      },
    );
    if (!res.ok) {
      let errMsg = `Could not convert video to ${targetFormat.toUpperCase()}.`;
      try {
        const parsed = (await res.json()) as { error?: string };
        if (parsed.error) errMsg = parsed.error;
      } catch {
        // ignore JSON parse error
      }
      throw new Error(errMsg);
    }
    return await res.blob();
  };

  const openExportProjectDialog = (preferredSource = 'timeline') => {
    setExportSourceId(preferredSource);
    setShowExportModal(true);
  };

  const handleExportVideo = async (
    overrideFormat?: VideoExportFormat,
    overrideSourceId?: string,
  ) => {
    const chosenFormat = overrideFormat || exportFormat;
    const chosenSource = overrideSourceId || exportSourceId;

    const fee = getResolutionFeeINR(exportResolution);
    if (fee > 0 && !is4kUnlocked && chosenSource === 'timeline') {
      setShowExportModal(false);
      await handlePayFor4k();
      return;
    }

    const dims = getExportDimensions(aspectRatio, exportResolution);
    const baseTitle =
      chosenSource !== 'timeline'
        ? uploadedVideos.find((v) => v.id === chosenSource)?.name.replace(/\.[^.]+$/, '') ||
          projectTitle
        : projectTitle;
    const filename = buildExportFilename(baseTitle, exportResolution, chosenFormat);

    setIsPlaying(false);
    setIsExporting(true);
    setExportProgress(0);
    setExportStageLabel('');

    try {
      if (chosenSource !== 'timeline') {
        const targetVid = uploadedVideos.find((v) => v.id === chosenSource);
        if (!targetVid) {
          throw new Error('Selected uploaded video was not found.');
        }
        setExportStageLabel(`Preparing ${targetVid.name}...`);
        setExportProgress(25);
        const rawRes = await fetch(targetVid.url);
        const rawBlob = await rawRes.blob();
        const existingFmt = (
          targetVid.formatLabel || extractVideoFormat(targetVid.name, targetVid.mimeType)
        ).toLowerCase();

        const linkedClip = clips.find((c) => c.id === targetVid.clipId);
        const hasTrim =
          linkedClip &&
          (linkedClip.trimStart > 0.05 ||
            (linkedClip.sourceDuration &&
              linkedClip.duration < linkedClip.sourceDuration - 0.1));

        let finalBlob = rawBlob;
        if (existingFmt !== chosenFormat || hasTrim) {
          setExportStageLabel(
            hasTrim
              ? `Trimming & encoding ${chosenFormat.toUpperCase()}...`
              : `Converting to ${chosenFormat.toUpperCase()}...`,
          );
          setExportProgress(65);
          finalBlob = await transcodeVideoOnServer(
            rawBlob,
            chosenFormat,
            filename,
            hasTrim && linkedClip
              ? { start: linkedClip.trimStart, duration: linkedClip.duration }
              : undefined,
          );
        }
        setExportProgress(100);
        triggerBlobDownload(finalBlob, filename);
        setShowExportModal(false);
        setStatusMessage(
          `Exported "${filename}" as ${chosenFormat.toUpperCase()}.`,
        );
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas || typeof MediaRecorder === 'undefined') {
        onAiWarning?.('Video export requires a browser supporting MediaRecorder.');
        return;
      }

      setExportStageLabel('Rendering timeline frames...');
      // Allow React canvas resize effect to apply target resolution dimensions
      await new Promise((r) => setTimeout(r, 80));

      const stream = canvas.captureStream(30);
      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const exportDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });

      recorder.start(150);
      const durationToRender = Math.min(totalDuration, 20);
      const startTs = performance.now();

      await new Promise<void>((resolve) => {
        const step = () => {
          const elapsed = (performance.now() - startTs) / 1000;
          if (elapsed >= durationToRender) {
            setPlayhead(0);
            setExportProgress(chosenFormat === 'webm' ? 100 : 75);
            resolve();
            return;
          }
          setPlayhead(elapsed);
          const pct = Math.round((elapsed / durationToRender) * (chosenFormat === 'webm' ? 100 : 75));
          setExportProgress(pct);
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      recorder.stop();
      const recordedWebm = await exportDone;

      let outputBlob = recordedWebm;
      if (chosenFormat !== 'webm') {
        setExportStageLabel(`Encoding ${chosenFormat.toUpperCase()} file...`);
        setExportProgress(90);
        outputBlob = await transcodeVideoOnServer(recordedWebm, chosenFormat, filename);
      }

      setExportProgress(100);
      triggerBlobDownload(outputBlob, filename);
      setShowExportModal(false);
      setStatusMessage(
        `Exported "${filename}" in ${chosenFormat.toUpperCase()} (${exportResolution.toUpperCase()} · ${dims.width}×${dims.height}).`,
      );
    } catch (err) {
      onAiWarning?.(
        err instanceof Error
          ? err.message
          : 'Could not export video in this browser environment.',
      );
    } finally {
      setIsExporting(false);
      setExportStageLabel('');
    }
  };

  const updateSelectedClip = (patch: Partial<StudioClip>) => {
    if (!selectedClipId) return;
    setClips((prev) =>
      prev.map((c) => (c.id === selectedClipId ? { ...c, ...patch } : c)),
    );
  };

  const focusClipInTimeline = (clipId: string) => {
    const target = clips.find((c) => c.id === clipId);
    setSelectedClipId(clipId);
    if (target) {
      setPlayhead(target.startTime);
      setIsPlaying(false);
      setStatusMessage(`Editing "${target.name}" on timeline.`);
    }
  };

  const handleSwitchStudioMode = (mode: typeof studioMode) => {
    if (mode !== 'timeline' && isPlaying) {
      setIsPlaying(false);
    }
    setStudioMode(mode);
  };

  const handleAddAiImageClip = (dataUrl: string, name: string) => {
    const videoTrack = clips.filter((c) => c.track === 'video');
    const endCursor = videoTrack.reduce(
      (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
      0,
    );
    const id = `ai_img_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newClip: StudioClip = {
      id,
      track: 'video',
      kind: 'image',
      name: name.slice(0, 28),
      src: dataUrl,
      startTime: endCursor,
      duration: 4.5,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(id);
    setPlayhead(endCursor);
    setStudioMode('timeline');
    setStatusMessage(`Added "${name}" to the Video Timeline Track.`);
  };

  const handleAddAiVideoClip = (blobUrl: string, name: string) => {
    const videoTrack = clips.filter((c) => c.track === 'video');
    const endCursor = videoTrack.reduce(
      (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
      0,
    );
    const id = `ai_vid_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newClip: StudioClip = {
      id,
      track: 'video',
      kind: 'video',
      name: name.slice(0, 28),
      src: blobUrl,
      startTime: endCursor,
      duration: 6,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: false,
      fadeOut: false,
    };
    setClips((prev) => [...prev, newClip]);
    const aiMediaId = `med_${id}`;
    setUploadedMedia((prev) => [
      {
        id: aiMediaId,
        clipId: id,
        name,
        kind: 'video',
        url: blobUrl,
        formatLabel: extractVideoFormat(name, 'video/mp4'),
        processed: false,
      },
      ...prev,
    ]);
    probeAndRecordVideoMetadata(aiMediaId, id, blobUrl);
    setSelectedClipId(id);
    setPlayhead(endCursor);
    setStudioMode('timeline');
    setStatusMessage(`Added AI video "${name}" to Timeline & Uploaded Video Box.`);
  };

  const handleAddAiAudioClip = (blobUrl: string, name: string, durationSec = 10) => {
    const audioTrack = clips.filter((c) => c.track === 'audio');
    const endCursor = audioTrack.reduce(
      (acc, c) => Math.max(acc, c.startTime + c.duration / (c.speed || 1)),
      0,
    );
    const id = `ai_aud_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newClip: StudioClip = {
      id,
      track: 'audio',
      kind: 'audio',
      name: name.slice(0, 28),
      src: blobUrl,
      startTime: endCursor,
      duration: Math.max(2, durationSec),
      trimStart: 0,
      speed: 1,
      volume: 0.9,
      fadeIn: true,
      fadeOut: true,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(id);
    setStudioMode('timeline');
    setStatusMessage(`Added AI music track "${name}" to Audio Track.`);
  };

  const handleInsertAiTranscriptOverlay = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const id = `ai_txt_${Date.now()}`;
    const newClip: StudioClip = {
      id,
      track: 'text',
      kind: 'text',
      name: clean.slice(0, 20),
      startTime: Math.round(playhead * 10) / 10,
      duration: 4.5,
      trimStart: 0,
      speed: 1,
      volume: 1,
      fadeIn: true,
      fadeOut: true,
      textContent: clean.slice(0, 72),
      textColor: '#F5C542',
      fontSize: 32,
      posX: 50,
      posY: 82,
    };
    setClips((prev) => [...prev, newClip]);
    setSelectedClipId(id);
    setStudioMode('timeline');
    setStatusMessage('Inserted AI transcript caption into the Text Track.');
  };

  const tracks: { id: StudioClip['track']; label: string; badge: string; accent: string }[] = [
    { id: 'video', label: 'Video', badge: 'MP4 · Visuals', accent: 'bg-sky-500/25 border-sky-400/60' },
    { id: 'audio', label: 'Music', badge: 'MP3 · Audio', accent: 'bg-emerald-500/25 border-emerald-400/60' },
    { id: 'text', label: 'Overlay', badge: 'Text · Stickers', accent: 'bg-[#D4AF37]/25 border-[#F5C542]/70' },
  ];

  const targetDims = getExportDimensions(aspectRatio, exportResolution);
  const needs4kPayment = exportResolution === '4k' && !is4kUnlocked;

  const studioModeTabs: {
    id: typeof studioMode;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'timeline', label: 'Timeline Editor', subtitle: 'Cut · Filters · 4K', icon: Film },
    { id: '3d', label: '3D Scene Studio', subtitle: 'Three.js Models', icon: Box },
    { id: 'ai_media', label: 'AI Media Lab', subtitle: 'Nano · Omni · Lyria', icon: Wand2 },
    { id: 'voice', label: 'Audio Transcribe', subtitle: 'Mic & File STT', icon: Mic },
    { id: 'chat', label: 'Gemini Studio Chat', subtitle: '4.0 & Flash Lite', icon: Bot },
  ];

  return (
    <div className="space-y-5">
      {/* Studio Workspace Switcher */}
      <nav
        data-testid="studio-mode-switcher"
        aria-label="Prime X Studio Workspaces"
        className="rounded-2xl bg-[#071528] border border-[#D4AF37]/30 p-2 flex flex-wrap items-center gap-2"
      >
        {studioModeTabs.map((tab) => {
          const Icon = tab.icon;
          const active = studioMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`studio-mode-${tab.id}`}
              onClick={() => handleSwitchStudioMode(tab.id)}
              className={`flex-1 min-w-[145px] px-3.5 py-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                active
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] border-[#F5C542] shadow-md'
                  : 'bg-[#0B1F3A]/80 text-slate-200 border-white/10 hover:border-[#F5C542]/45 hover:bg-[#0E2647]'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#0B1F3A]' : 'text-[#F5C542]'}`} />
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight truncate">{tab.label}</div>
                <div
                  className={`text-[10px] leading-tight truncate ${
                    active ? 'text-[#0B1F3A]/80 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {tab.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {studioMode === '3d' && (
        <ThreeSceneStudio onCaptureFrameToTimeline={handleAddAiImageClip} />
      )}

      {studioMode === 'ai_media' && (
        <StudioMediaGenPanel
          onAddImageToTimeline={handleAddAiImageClip}
          onAddVideoToTimeline={handleAddAiVideoClip}
          onAddAudioToTimeline={handleAddAiAudioClip}
        />
      )}

      {studioMode === 'voice' && (
        <StudioVoiceAudioPanel
          onInsertTranscriptOverlay={handleInsertAiTranscriptOverlay}
          onSendToSunoLyrics={onSendTranscriptToMusic}
        />
      )}

      {studioMode === 'chat' && <StudioGeminiChatPanel />}

      {studioMode === 'timeline' && (
        <>
          {/* Studio Top Toolbar */}
          <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Film className="w-5 h-5 text-[#F5C542]" />
          <input
            type="text"
            aria-label="Studio project title"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="bg-transparent border-b border-white/20 focus:border-[#F5C542] text-white font-display font-bold text-base px-1 py-0.5 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Aspect Ratio Presets */}
          <div
            aria-label="Canvas aspect ratio"
            className="flex items-center gap-1 p-1 rounded-xl bg-[#08172C] border border-white/10"
          >
            {ASPECT_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                title={ratio.platformHint}
                onClick={() => setAspectRatio(ratio.id)}
                className={`px-2 py-1 rounded-lg text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
                  aspectRatio === ratio.id
                    ? 'bg-[#F5C542] text-[#0B1F3A]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          {/* Export Resolution Selector */}
          <div
            aria-label="Export resolution"
            className="flex items-center gap-1 p-1 rounded-xl bg-[#08172C] border border-white/10"
          >
            {RESOLUTION_OPTIONS.map((res) => {
              const active = exportResolution === res.id;
              return (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => setExportResolution(res.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#F5C542] text-[#0B1F3A]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {res.label}
                  {res.badge && !is4kUnlocked ? ` (${res.badge})` : ''}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="studio-premium-edits-btn"
            onClick={() => handleOpenPremiumModal()}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${
              isPremiumUnlocked
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-[#08172C] border-[#F5C542]/60 text-[#F5C542] hover:bg-[#16325C]'
            }`}
          >
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isPremiumUnlocked
                ? 'Premium Edits Active'
                : `Premium Edits (₹${STUDIO_PREMIUM_MONTHLY_FEE_INR}/mo)`}
            </span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>{saving ? 'Saving...' : 'Save Project'}</span>
          </button>

          {latest4kOrder && (
            <button
              type="button"
              onClick={() => onOpenInvoice?.(verified4kOrder || latest4kOrder)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#F5C542]/50 bg-[#0B1F3A] text-[#F5C542] text-xs font-bold hover:bg-[#16325C] whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>View 4K Bill</span>
            </button>
          )}

          <button
            type="button"
            data-testid="studio-export-project-btn"
            disabled={isExporting || creating4kOrder}
            onClick={() => openExportProjectDialog('timeline')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 disabled:opacity-60 whitespace-nowrap"
          >
            {needs4kPayment ? (
              <>
                <CreditCard className="w-3.5 h-3.5" />
                <span>
                  {creating4kOrder
                    ? 'Preparing 4K Checkout...'
                    : `Export Project (${formatINR(STUDIO_4K_FEE_INR)} 4K)`}
                </span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>
                  {isExporting ? `Exporting ${exportProgress}%` : 'Export Project'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4K Export Info Bar */}
      {exportResolution === '4k' && (
        <div className="rounded-xl bg-[#08172C]/90 border border-[#D4AF37]/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-200">
            {is4kUnlocked ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  4K Ultra HD Export unlocked ({targetDims.width}×{targetDims.height}). Ready to save or view your {formatINR(STUDIO_4K_FEE_INR)} bill.
                </span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-[#F5C542] shrink-0" />
                <span>
                  4K Ultra HD ({targetDims.width}×{targetDims.height}) requires a one-time payment of{' '}
                  <strong className="text-[#F5C542] font-mono">{formatINR(STUDIO_4K_FEE_INR)} INR</strong>. 1080p, 720p, and 480p exports are free.
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {latest4kOrder && (
              <button
                type="button"
                onClick={() => onOpenInvoice?.(verified4kOrder || latest4kOrder)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white hover:bg-white/10 font-semibold"
              >
                <FileText className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>View 4K Bill</span>
              </button>
            )}
            {!is4kUnlocked && (
              <button
                type="button"
                disabled={creating4kOrder}
                onClick={handlePayFor4k}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] font-bold"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>
                  {latest4kOrder ? 'Check / Upload 4K Payment' : `Pay ${formatINR(STUDIO_4K_FEE_INR)} INR`}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-xl bg-[#D4AF37]/15 border border-[#F5C542]/40 px-4 py-2 text-xs text-[#F5C542] font-medium">
          {statusMessage}
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Tool Shelf */}
        <div className="lg:col-span-4 rounded-2xl bg-[#091930]/90 border border-white/15 p-4 space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-xl bg-[#061121]">
            {[
              { id: 'media', label: 'Media', icon: ImageIcon },
              { id: 'audio', label: 'Audio', icon: Music },
              { id: 'text', label: 'Text', icon: TypeIcon },
              { id: 'color', label: 'Filters', icon: Sliders },
              { id: 'capcut', label: 'Pro FX', icon: Crown },
              { id: 'projects', label: 'Saved', icon: FolderOpen },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`tool-panel-tab-${t.id}`}
                  onClick={() => setToolPanel(t.id as typeof toolPanel)}
                  className={`py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
                    toolPanel === t.id
                      ? 'bg-[#D4AF37] text-[#0B1F3A]'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </div>

          {toolPanel === 'media' && (
            <div className="space-y-4">
              <label
                htmlFor="studio-media-upload"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#D4AF37]/40 hover:border-[#F5C542] rounded-xl p-5 cursor-pointer bg-[#0B1F3A]/60 text-center transition-colors"
              >
                <Upload className="w-6 h-6 text-[#F5C542]" />
                <span className="text-xs font-semibold text-white">
                  Import Video, Image, or Audio
                </span>
                <span className="text-[11px] text-slate-400">
                  MP4, WebM, PNG, JPG, MP3, WAV
                </span>
                <input
                  id="studio-media-upload"
                  type="file"
                  multiple
                  accept="video/*,image/*,audio/*"
                  onChange={handleImportFiles}
                  className="sr-only"
                />
              </label>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Quick Studio Visuals
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      name: 'Studio Suite',
                      src: '/src/assets/images/primex_studio_backdrop_1794619332809.jpg',
                    },
                    {
                      name: 'Prime Hardware',
                      src: '/src/assets/images/primex_hero_banner_1794619333485.jpg',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        const videoClips = clips.filter((c) => c.track === 'video');
                        const end = videoClips.reduce(
                          (acc, c) => Math.max(acc, c.startTime + c.duration),
                          0,
                        );
                        setClips((prev) => [
                          ...prev,
                          {
                            id: `vis_${Date.now()}`,
                            track: 'video',
                            kind: 'image',
                            name: preset.name,
                            src: preset.src,
                            startTime: end,
                            duration: 4,
                            trimStart: 0,
                            speed: 1,
                            volume: 1,
                            fadeIn: true,
                            fadeOut: false,
                          },
                        ]);
                      }}
                      className="rounded-xl overflow-hidden border border-white/15 hover:border-[#F5C542] text-left bg-[#0B1F3A] group"
                    >
                      <img
                        src={preset.src}
                        alt={preset.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-16 object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="p-2 text-[11px] font-semibold text-white">
                        + {preset.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {toolPanel === 'audio' && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-[#F5C542]">
                Built-in Royalty-Free Sound Effects
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {BUILT_IN_SFX.map((sfx) => (
                  <div
                    key={sfx.id}
                    className="rounded-xl bg-[#0B1F3A] border border-white/10 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {sfx.label}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {sfx.duration}s · {sfx.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label={`Preview ${sfx.label}`}
                        onClick={() => handlePreviewSfx(sfx.id)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddBuiltInSfx(sfx)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolPanel === 'text' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Add Text Overlay
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Overlay text..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#0B1F3A] border border-white/15 text-xs text-white"
                  />
                  <input
                    type="color"
                    aria-label="Text color"
                    value={newTextColor}
                    onChange={(e) => setNewTextColor(e.target.value)}
                    className="w-10 h-9 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTextOverlay()}
                  className="w-full py-2 rounded-xl bg-[#F5C542] text-[#0B1F3A] text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert Text at Playhead</span>
                </button>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-xs font-semibold text-slate-300">
                  Studio Stickers
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {STICKER_PRESETS.map((st) => (
                    <button
                      key={st.label}
                      type="button"
                      onClick={() => handleAddSticker(st.symbol, st.label)}
                      className="p-2.5 rounded-xl bg-[#0B1F3A] border border-white/10 hover:border-[#F5C542] text-center space-y-1"
                    >
                      <div className="text-lg text-[#F5C542]">{st.symbol}</div>
                      <div className="text-[10px] text-slate-300">{st.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {toolPanel === 'color' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-[#F5C542]">
                  Image &amp; Video Filter Studio
                </div>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white transition-colors"
                >
                  <RotateCcw className="w-3 h-3 text-[#F5C542]" />
                  <span>Reset</span>
                </button>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-300 mb-2">
                  Filter Presets
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'none', label: 'Natural' },
                    { id: 'grayscale', label: 'Grayscale' },
                    { id: 'sepia', label: 'Sepia' },
                    { id: 'cinema_gold', label: 'Cinema Gold' },
                    { id: 'midnight_noir', label: 'Midnight Noir' },
                    { id: 'warm_vintage', label: 'Warm Vintage' },
                    { id: 'crisp_vivid', label: 'Crisp Vivid' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleApplyFilterPreset(f.id as StudioFilterPreset)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        filter === f.id
                          ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                          : 'bg-[#0B1F3A] text-slate-200 border-white/10 hover:border-[#F5C542]/40'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-1 border-t border-white/10">
                {[
                  { label: 'Grayscale', value: grayscale, setter: setGrayscale, min: 0, max: 100, step: 1, unit: '%' },
                  { label: 'Sepia', value: sepia, setter: setSepia, min: 0, max: 100, step: 1, unit: '%' },
                  { label: 'Contrast', value: contrast, setter: setContrast, min: 40, max: 200, step: 1, unit: '%' },
                  { label: 'Brightness', value: brightness, setter: setBrightness, min: 40, max: 200, step: 1, unit: '%' },
                  { label: 'Saturation', value: saturation, setter: setSaturation, min: 0, max: 200, step: 1, unit: '%' },
                  { label: 'Blur', value: blur, setter: setBlur, min: 0, max: 10, step: 0.5, unit: 'px' },
                ].map((ctrl) => (
                  <div key={ctrl.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">{ctrl.label}</span>
                      <span className="font-mono text-[#F5C542]">
                        {ctrl.value}
                        {ctrl.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={`${ctrl.label} filter slider`}
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={ctrl.value}
                      onChange={(e) => ctrl.setter(Number(e.target.value))}
                      className="w-full accent-[#F5C542]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {toolPanel === 'capcut' && (
            <CapCutProToolsPanel
              isPremiumUnlocked={isPremiumUnlocked}
              selectedClip={selectedClip}
              videoEffect={videoEffect}
              effectIntensity={effectIntensity}
              canvasBackground={canvasBackground}
              beatMarkersEnabled={beatMarkersEnabled}
              onChangeVideoEffect={(fx) => {
                setVideoEffect(fx);
                setStatusMessage(`Applied video effect: ${fx.replace('_', ' ').toUpperCase()}.`);
              }}
              onChangeEffectIntensity={setEffectIntensity}
              onChangeCanvasBackground={(bg) => {
                setCanvasBackground(bg);
                setStatusMessage(`Canvas backdrop updated to ${bg.replace('_', ' ')}.`);
              }}
              onToggleBeatMarkers={() => setBeatMarkersEnabled((b) => !b)}
              onUpdateSelectedClip={updateSelectedClip}
              onFreezeFrameAtPlayhead={handleFreezeFrameAtPlayhead}
              onAddProSticker={(symbol, label) => {
                handleAddSticker(symbol, label);
                setStatusMessage(`Added CapCut Pro badge "${symbol}" to Text Track.`);
              }}
              onGenerateAutoCaptions={handleGenerateAutoCaptions}
              onOpenPremiumModal={handleOpenPremiumModal}
            />
          )}

          {toolPanel === 'projects' && (
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {savedProjects.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No saved studio projects yet. Click &quot;Save Project&quot; above to store one.
                </p>
              ) : (
                savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="rounded-xl bg-[#0B1F3A] border border-white/10 p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">
                        {proj.title}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {proj.aspectRatio} · {proj.clips.length} clips
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadProject(proj)}
                      className="px-3 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Center Preview Player & Inspector */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl bg-[#061121] border border-white/15 p-4 flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-center bg-black/40 rounded-xl p-3 min-h-[260px]">
              <canvas
                ref={canvasRef}
                data-testid="studio-preview-canvas"
                className="max-h-[340px] max-w-full rounded-lg border border-white/10 shadow-xl"
              />
            </div>

            {/* Playback & Scrubber Bar */}
            <div className="w-full flex items-center gap-4">
              <button
                type="button"
                aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                onClick={() => setIsPlaying((p) => !p)}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] flex items-center justify-center shrink-0 shadow"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <input
                type="range"
                aria-label="Timeline playhead"
                min={0}
                max={totalDuration}
                step={0.05}
                value={playhead}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlayhead(Number(e.target.value));
                }}
                className="flex-1 accent-[#F5C542]"
              />

              <span className="font-mono text-xs text-slate-200 tabular-nums shrink-0">
                {playhead.toFixed(1)}s / {totalDuration.toFixed(1)}s
              </span>
            </div>

            {/* Uploaded Video Metadata Strip inside Preview Area */}
            {previewVideoMetadata && (
              <div
                data-testid="studio-preview-metadata"
                className="w-full rounded-xl bg-[#091930] border border-[#D4AF37]/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Video className="w-4 h-4 text-[#F5C542] shrink-0" />
                  <span className="text-xs font-semibold text-white truncate max-w-[220px]">
                    {previewVideoMetadata.name}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border ${
                      previewVideoMetadata.processed
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                        : 'bg-[#F5C542]/15 border-[#F5C542]/40 text-[#F5C542]'
                    }`}
                  >
                    {previewVideoMetadata.processed ? 'Processed' : 'Processing...'}
                  </span>
                </div>

                <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <dt className="text-slate-400">Format:</dt>
                    <dd className="font-mono font-semibold text-[#F5C542]">
                      {previewVideoMetadata.formatLabel ||
                        extractVideoFormat(
                          previewVideoMetadata.name,
                          previewVideoMetadata.mimeType,
                        )}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="text-slate-400">Resolution:</dt>
                    <dd className="font-mono font-semibold text-white">
                      {formatVideoResolution(
                        previewVideoMetadata.width,
                        previewVideoMetadata.height,
                        previewVideoMetadata.processed,
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="text-slate-400">File Size:</dt>
                    <dd className="font-mono font-semibold text-white">
                      {formatMediaFileSize(previewVideoMetadata.fileSize)}
                    </dd>
                  </div>
                  {previewVideoMetadata.durationSec !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <dt className="text-slate-400">Duration:</dt>
                      <dd className="font-mono font-semibold text-slate-200">
                        {formatVideoDuration(previewVideoMetadata.durationSec)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Simple Start/End Video Timestamp Trimmer */}
            <VideoTrimPanel
              uploadedVideos={uploadedVideos}
              clips={clips}
              selectedClipId={selectedClipId}
              playhead={playhead}
              onSelectVideoClip={(cid) => focusClipInTimeline(cid)}
              onApplyTrim={handleApplyVideoTrim}
              onPreviewTrimRange={handlePreviewTrimRange}
              onExportTrimmedVideo={(vidId) => openExportProjectDialog(vidId)}
              onUploadFiles={handleImportFiles}
            />
          </div>

          {/* Selected Clip Inspector */}
          {selectedClip && (
            <div className="rounded-2xl bg-[#091930]/90 border border-[#D4AF37]/30 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#F5C542]" />
                  <span className="text-xs font-bold text-white">
                    Selected: {selectedClip.name}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Duration (s)</span>
                    <input
                      type="number"
                      min={0.5}
                      max={180}
                      step={0.5}
                      value={selectedClip.duration}
                      onChange={(e) =>
                        updateSelectedClip(
                          trimClip(selectedClip, selectedClip.trimStart, Number(e.target.value)),
                        )
                      }
                      className="w-16 px-2 py-1 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
                    />
                  </label>

                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Speed</span>
                    <select
                      value={selectedClip.speed}
                      onChange={(e) => {
                        const spd = Number(e.target.value);
                        if ((spd < 0.5 || spd > 2) && !isPremiumUnlocked) {
                          handleOpenPremiumModal(`Pro Speed Curve (${spd}x)`);
                          return;
                        }
                        updateSelectedClip({ speed: spd });
                      }}
                      className="px-2 py-1 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
                    >
                      <option value={0.25}>0.25x {isPremiumUnlocked ? '' : '(Pro)'}</option>
                      <option value={0.5}>0.5x</option>
                      <option value={1}>1x</option>
                      <option value={1.5}>1.5x</option>
                      <option value={2}>2x</option>
                      <option value={3}>3x {isPremiumUnlocked ? '' : '(Pro)'}</option>
                      <option value={4}>4x {isPremiumUnlocked ? '' : '(Pro)'}</option>
                    </select>
                  </label>

                  {selectedClip.track === 'audio' && (
                    <label className="flex items-center gap-1.5 text-slate-300">
                      <span>Vol</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selectedClip.volume}
                        onChange={(e) => updateSelectedClip({ volume: Number(e.target.value) })}
                        className="w-20 accent-[#F5C542]"
                      />
                    </label>
                  )}

                  <label className="inline-flex items-center gap-1 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedClip.fadeIn}
                      onChange={(e) => updateSelectedClip({ fadeIn: e.target.checked })}
                      className="accent-[#F5C542]"
                    />
                    <span>Fade In</span>
                  </label>

                  <label className="inline-flex items-center gap-1 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedClip.fadeOut}
                      onChange={(e) => updateSelectedClip({ fadeOut: e.target.checked })}
                      className="accent-[#F5C542]"
                    />
                    <span>Fade Out</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSplitSelected}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold"
                  >
                    <Scissors className="w-3.5 h-3.5 text-[#F5C542]" />
                    <span>Split</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/35 text-red-200 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {selectedClip.kind === 'text' && (
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex-1 min-w-[200px] flex items-center gap-2 text-slate-300">
                    <span className="font-semibold text-[#F5C542] shrink-0">Overlay Text</span>
                    <input
                      type="text"
                      aria-label="Edit selected overlay text"
                      value={selectedClip.textContent || ''}
                      onChange={(e) =>
                        updateSelectedClip({
                          textContent: e.target.value,
                          name: (e.target.value || 'Text Overlay').slice(0, 22),
                        })
                      }
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-white focus:outline-none focus:border-[#F5C542]"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Color</span>
                    <input
                      type="color"
                      aria-label="Selected overlay text color"
                      value={selectedClip.textColor || '#F5C542'}
                      onChange={(e) => updateSelectedClip({ textColor: e.target.value })}
                      className="w-8 h-7 rounded bg-transparent border border-white/15 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Size</span>
                    <input
                      type="number"
                      aria-label="Selected overlay text size"
                      min={18}
                      max={92}
                      value={selectedClip.fontSize ?? 38}
                      onChange={(e) => updateSelectedClip({ fontSize: Number(e.target.value) })}
                      className="w-16 px-2 py-1 rounded-lg bg-[#061121] border border-white/15 text-white font-mono"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300">
                    <span>Position</span>
                    <select
                      aria-label="Selected overlay vertical position"
                      value={selectedClip.posY ?? 75}
                      onChange={(e) => updateSelectedClip({ posY: Number(e.target.value) })}
                      className="px-2 py-1 rounded-lg bg-[#061121] border border-white/15 text-white"
                    >
                      <option value={20}>Top</option>
                      <option value={50}>Center</option>
                      <option value={75}>Lower Third</option>
                      <option value={86}>Bottom Subtitle</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Quick Image & Video Filter Controls */}
          <div
            data-testid="studio-filter-controls"
            className="rounded-2xl bg-[#091930]/90 border border-white/15 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#F5C542]" />
                <span className="text-xs font-bold text-white">
                  Image &amp; Video Filters
                </span>
                <span className="text-[11px] font-mono text-[#F5C542] px-2 py-0.5 rounded-md bg-[#061121] border border-[#D4AF37]/30">
                  {filter === 'none' ? 'Natural' : filter.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#F5C542]" />
                  <span>Reset Filters</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToolPanel('color')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#F5C542]/40 bg-[#061121] hover:bg-[#0B1F3A] text-[#F5C542] text-xs font-semibold transition-colors"
                >
                  All Filter Controls
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'none', label: 'Natural' },
                { id: 'grayscale', label: 'Grayscale' },
                { id: 'sepia', label: 'Sepia' },
                { id: 'cinema_gold', label: 'Cinema Gold' },
                { id: 'warm_vintage', label: 'Warm Vintage' },
                { id: 'crisp_vivid', label: 'Crisp Vivid' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyFilterPreset(preset.id as StudioFilterPreset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    filter === preset.id
                      ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                      : 'bg-[#061121] text-slate-200 border-white/10 hover:border-[#F5C542]/40'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[
                { label: 'Grayscale', value: grayscale, setter: setGrayscale, min: 0, max: 100 },
                { label: 'Sepia', value: sepia, setter: setSepia, min: 0, max: 100 },
                { label: 'Contrast', value: contrast, setter: setContrast, min: 40, max: 200 },
              ].map((ctrl) => (
                <label key={ctrl.label} className="space-y-1 block">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300 font-medium">{ctrl.label}</span>
                    <span className="font-mono text-[#F5C542]">{ctrl.value}%</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`Quick ${ctrl.label}`}
                    min={ctrl.min}
                    max={ctrl.max}
                    value={ctrl.value}
                    onChange={(e) => ctrl.setter(Number(e.target.value))}
                    className="w-full accent-[#F5C542]"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CapCut-Style NLE Multi-Track Timeline */}
      <CapCutTimeline
        clips={clips}
        totalDuration={totalDuration}
        playhead={playhead}
        isPlaying={isPlaying}
        selectedClipId={selectedClipId}
        beatMarkersEnabled={beatMarkersEnabled}
        isPremiumUnlocked={isPremiumUnlocked}
        showTimelineOverlayInput={showTimelineOverlayInput}
        timelineOverlayText={timelineOverlayText}
        timelineOverlayColor={timelineOverlayColor}
        timelineOverlayPosY={timelineOverlayPosY}
        timelineOverlaySize={timelineOverlaySize}
        timelineOverlayInputRef={timelineOverlayInputRef}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onChangePlayhead={(nextSec, pauseIfPlaying) => {
          if (pauseIfPlaying) setIsPlaying(false);
          setPlayhead(nextSec);
        }}
        onSelectClip={(cid) => setSelectedClipId(cid)}
        onChangeClips={setClips}
        onDeleteClip={handleDeleteClip}
        onSplitSelected={handleSplitSelected}
        onFreezeFrameAtPlayhead={handleFreezeFrameAtPlayhead}
        onImportFiles={handleImportFiles}
        onDropFiles={importFilesToTimeline}
        onToggleOverlayComposer={() => setShowTimelineOverlayInput((prev) => !prev)}
        onChangeOverlayText={setTimelineOverlayText}
        onChangeOverlayColor={setTimelineOverlayColor}
        onChangeOverlayPosY={setTimelineOverlayPosY}
        onChangeOverlaySize={setTimelineOverlaySize}
        onSubmitOverlay={handleAddTimelineOverlay}
      />

      {/* Bottom Section: Uploaded Video Box & Resolution Save Controls */}
      <section
        data-testid="studio-uploaded-videos-box"
        className="rounded-2xl bg-[#091930]/95 border border-[#D4AF37]/35 p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Video className="w-5 h-5 text-[#F5C542]" />
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Uploaded Video Viewer & Export Box
              </h2>
              <p className="text-xs text-slate-300">
                Watch your uploaded videos below, select one to edit on the timeline, and save in 4K (₹10 INR), 1080p, 720p, or 480p.
              </p>
            </div>
          </div>

          <label
            htmlFor="studio-bottom-video-upload"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5C542] text-[#0B1F3A] text-xs font-bold cursor-pointer hover:brightness-105"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Video</span>
            <input
              id="studio-bottom-video-upload"
              type="file"
              multiple
              accept="video/*"
              onChange={handleImportFiles}
              className="sr-only"
            />
          </label>
        </div>

        {uploadedVideos.length === 0 ? (
          <div className="rounded-xl bg-[#061121] border border-dashed border-white/15 p-8 text-center space-y-2">
            <Video className="w-8 h-8 text-[#F5C542]/70 mx-auto" />
            <p className="text-sm font-medium text-white">
              No uploaded video yet
            </p>
            <p className="text-xs text-slate-400">
              Upload a video file using the button above or the Media shelf to preview it here, edit it, and save as 4K, 1080p, 720p, or 480p.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {uploadedVideos.map((vid) => (
              <div
                key={vid.id}
                className="rounded-xl bg-[#061121] border border-white/15 p-4 space-y-3"
              >
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black border border-white/10">
                  <video
                    src={vid.url}
                    controls
                    playsInline
                    onLoadedMetadata={(e) => {
                      const el = e.currentTarget;
                      applyExtractedVideoMetadata(
                        vid.id,
                        vid.clipId,
                        el.videoWidth,
                        el.videoHeight,
                        el.duration,
                      );
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-bold text-white truncate">
                      {vid.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono text-slate-300">
                      <span className="text-[#F5C542] font-semibold">
                        {vid.formatLabel || extractVideoFormat(vid.name, vid.mimeType)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {formatVideoResolution(vid.width, vid.height, vid.processed)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMediaFileSize(vid.fileSize)}</span>
                      {vid.durationSec !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatVideoDuration(vid.durationSec)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => focusClipInTimeline(vid.clipId)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                    >
                      Edit in Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => openExportProjectDialog(vid.id)}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold"
                    >
                      Export Project
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </>
      )}

      {/* Export Project Modal (MP4 / WebM / MOV) */}
      {showExportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-project-title"
          data-testid="export-project-dialog"
          className="fixed inset-0 z-50 bg-[#050F1E]/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#091930] border border-[#D4AF37]/40 text-white shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h3
                  id="export-project-title"
                  className="font-display text-lg font-bold text-[#F5C542]"
                >
                  Export Project
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Download your processed video in MP4, WebM, or MOV format.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Export Project dialog"
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="export-source-select"
                className="block text-xs font-semibold text-slate-300"
              >
                Export Source
              </label>
              <select
                id="export-source-select"
                value={exportSourceId}
                disabled={isExporting}
                onChange={(e) => setExportSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#061121] border border-white/15 text-xs text-white focus:outline-none focus:border-[#F5C542]"
              >
                <option value="timeline">
                  Full Edited Timeline ({projectTitle} · {aspectRatio} · {totalDuration.toFixed(1)}s)
                </option>
                {uploadedVideos.map((vid) => (
                  <option key={vid.id} value={vid.id}>
                    Processed Video: {vid.name} ({vid.formatLabel || 'VIDEO'} · {formatMediaFileSize(vid.fileSize)})
                  </option>
                ))}
              </select>
            </div>

            {/* Format Options */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">Video Format</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EXPORT_FORMAT_OPTIONS.map((fmt) => {
                  const active = exportFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      data-testid={`export-format-${fmt.id}`}
                      disabled={isExporting}
                      onClick={() => setExportFormat(fmt.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                          : 'bg-[#061121] text-white border-white/15 hover:border-[#F5C542]/45'
                      }`}
                    >
                      <div className="text-xs font-bold">{fmt.label}</div>
                      <div
                        className={`text-[10px] mt-1 leading-snug ${
                          active ? 'text-[#0B1F3A]/85 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {fmt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resolution Selector (for Timeline renders) */}
            {exportSourceId === 'timeline' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Output Resolution</span>
                  <span className="font-mono text-[#F5C542]">
                    {targetDims.width}×{targetDims.height}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {RESOLUTION_OPTIONS.map((res) => {
                    const active = exportResolution === res.id;
                    return (
                      <button
                        key={res.id}
                        type="button"
                        disabled={isExporting}
                        onClick={() => setExportResolution(res.id)}
                        className={`py-2 px-2 rounded-xl border text-xs font-mono font-semibold transition-colors ${
                          active
                            ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                            : 'bg-[#061121] text-slate-200 border-white/15 hover:border-[#F5C542]/45'
                        }`}
                      >
                        {res.label}
                        {res.badge && !is4kUnlocked ? ` (${res.badge})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {isExporting && (
              <div className="rounded-xl bg-[#061121] border border-[#D4AF37]/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#F5C542] font-semibold">
                    {exportStageLabel || 'Processing export...'}
                  </span>
                  <span className="font-mono text-white">{exportProgress}%</span>
                </div>
                <progress
                  value={Math.min(100, Math.max(4, exportProgress))}
                  max={100}
                  aria-label="Export progress"
                  className="w-full h-2 rounded-full overflow-hidden accent-[#F5C542]"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-export-download-btn"
                disabled={isExporting || creating4kOrder}
                onClick={() => handleExportVideo()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 disabled:opacity-60"
              >
                {exportSourceId === 'timeline' && needs4kPayment ? (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Pay {formatINR(STUDIO_4K_FEE_INR)} for 4K</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {isExporting
                        ? `Exporting (${exportProgress}%)`
                        : `Download ${exportFormat.toUpperCase()}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Edits (Monthly ₹49 CapCut Pro) Modal */}
      <PremiumEditsModal
        isOpen={showPremiumModal}
        isUnlocked={isPremiumUnlocked}
        requestedFeature={premiumRequestedFeature}
        expiresAt={premiumStatus.expiresAt}
        latestOrder={premiumStatus.latestOrder}
        creatingOrder={creatingPremiumOrder}
        onClose={() => setShowPremiumModal(false)}
        onPayMonthly={handlePayPremiumMonthly}
        onOpenPayment={(ord) => onOpenPayment?.(ord)}
        onOpenInvoice={(ord) => onOpenInvoice?.(ord)}
      />
    </div>
  );
};
