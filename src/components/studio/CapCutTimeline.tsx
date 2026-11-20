import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  Magnet,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  clampTimelineZoom,
  computeRulerTicks,
  formatTimestampMMSS,
  getPixelsPerSecond,
  moveClipStartTime,
  reorderClipsInTrack,
  timelineXToTime,
  timeToTimelineX,
  trimClipEdges,
} from '../../lib/studioLogic';
import type { StudioClip } from '../../types';

interface CapCutTimelineProps {
  clips: StudioClip[];
  totalDuration: number;
  playhead: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  beatMarkersEnabled: boolean;
  isPremiumUnlocked: boolean;
  showTimelineOverlayInput: boolean;
  timelineOverlayText: string;
  timelineOverlayColor: string;
  timelineOverlayPosY: number;
  timelineOverlaySize: number;
  timelineOverlayInputRef: React.RefObject<HTMLInputElement | null>;
  onTogglePlay: () => void;
  onChangePlayhead: (nextSec: number, pauseIfPlaying?: boolean) => void;
  onSelectClip: (clipId: string | null) => void;
  onChangeClips: React.Dispatch<React.SetStateAction<StudioClip[]>>;
  onDeleteClip: (clipId: string) => void;
  onSplitSelected: () => void;
  onFreezeFrameAtPlayhead: () => void;
  onImportFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropFiles: (files: File[]) => void;
  onToggleOverlayComposer: () => void;
  onChangeOverlayText: (val: string) => void;
  onChangeOverlayColor: (val: string) => void;
  onChangeOverlayPosY: (val: number) => void;
  onChangeOverlaySize: (val: number) => void;
  onSubmitOverlay: (e?: React.FormEvent) => void;
}

type DragInteraction =
  | { kind: 'scrub' }
  | { kind: 'move'; clipId: string; originX: number; initialStartTime: number }
  | { kind: 'trim-right'; clipId: string; originX: number; initialDuration: number }
  | null;

const TRACK_META: {
  id: StudioClip['track'];
  label: string;
  badge: string;
  topY: number;
  height: number;
  accent: string;
}[] = [
  {
    id: 'text',
    label: 'Overlay',
    badge: 'Text · Stickers',
    topY: 32,
    height: 54,
    accent: 'bg-[#D4AF37]/20 border-[#F5C542]/60',
  },
  {
    id: 'video',
    label: 'Main Video',
    badge: 'MP4 · Visuals',
    topY: 86,
    height: 64,
    accent: 'bg-sky-500/20 border-sky-400/55',
  },
  {
    id: 'audio',
    label: 'Audio',
    badge: 'MP3 · Beat Sync',
    topY: 150,
    height: 56,
    accent: 'bg-emerald-500/20 border-emerald-400/55',
  },
];

const TIMELINE_CANVAS_HEIGHT = 208;

export const CapCutTimeline: React.FC<CapCutTimelineProps> = ({
  clips,
  totalDuration,
  playhead,
  isPlaying,
  selectedClipId,
  beatMarkersEnabled,
  isPremiumUnlocked,
  showTimelineOverlayInput,
  timelineOverlayText,
  timelineOverlayColor,
  timelineOverlayPosY,
  timelineOverlaySize,
  timelineOverlayInputRef,
  onTogglePlay,
  onChangePlayhead,
  onSelectClip,
  onChangeClips,
  onDeleteClip,
  onSplitSelected,
  onFreezeFrameAtPlayhead,
  onImportFiles,
  onDropFiles,
  onToggleOverlayComposer,
  onChangeOverlayText,
  onChangeOverlayColor,
  onChangeOverlayPosY,
  onChangeOverlaySize,
  onSubmitOverlay,
}) => {
  const [zoom, setZoom] = useState<number>(1.0);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [dragState, setDragState] = useState<DragInteraction>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const dragClipOrderRef = useRef<{ track: StudioClip['track']; index: number } | null>(null);

  const pixelsPerSecond = useMemo(() => getPixelsPerSecond(zoom), [zoom]);
  const rulerTicks = useMemo(
    () => computeRulerTicks(totalDuration, zoom),
    [totalDuration, zoom],
  );
  const canvasWidth = useMemo(
    () => Math.max(820, Math.ceil((totalDuration + 6) * pixelsPerSecond)),
    [totalDuration, pixelsPerSecond],
  );

  // Keep playhead in view when playing
  useEffect(() => {
    if (!isPlaying) return;
    const scroller = scrollWrapRef.current;
    if (!scroller) return;
    const px = timeToTimelineX(playhead, zoom);
    const viewRight = scroller.scrollLeft + scroller.clientWidth;
    if (px > viewRight - 60 || px < scroller.scrollLeft) {
      scroller.scrollLeft = Math.max(0, px - 120);
    }
  }, [playhead, isPlaying, zoom]);

  // Draw crisp CapCut NLE Multi-Track Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvasWidth;
    const h = TIMELINE_CANVAS_HEIGHT;

    // 1. Background Surface
    ctx.fillStyle = '#070B12';
    ctx.fillRect(0, 0, w, h);

    // 2. Time Ruler Header (0..32)
    ctx.fillStyle = '#0F1624';
    ctx.fillRect(0, 0, w, 32);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 31.5);
    ctx.lineTo(w, 31.5);
    ctx.stroke();

    // Vertical grid & ruler ticks
    for (const tick of rulerTicks) {
      const tx = Math.round(timeToTimelineX(tick.time, zoom)) + 0.5;
      if (tx < 0 || tx > w) continue;

      if (tick.isMajor) {
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.beginPath();
        ctx.moveTo(tx, 18);
        ctx.lineTo(tx, 31);
        ctx.stroke();

        // Subtle track vertical gridline
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(tx, 32);
        ctx.lineTo(tx, h);
        ctx.stroke();

        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(tick.label, tick.time === 0 ? tx + 6 : tx + 4, 12);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(tx, 24);
        ctx.lineTo(tx, 31);
        ctx.stroke();
      }
    }

    // 3. Track Lanes
    for (const tr of TRACK_META) {
      ctx.fillStyle = tr.id === 'video' ? '#0B1220' : '#080D18';
      ctx.fillRect(0, tr.topY, w, tr.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, tr.topY + tr.height - 0.5);
      ctx.lineTo(w, tr.topY + tr.height - 0.5);
      ctx.stroke();

      // Beat markers along audio lane when Beat Sync enabled
      if (tr.id === 'audio' && beatMarkersEnabled && isPremiumUnlocked) {
        const beatStep = 0.5;
        for (let b = 0; b <= totalDuration + 4; b += beatStep) {
          const bx = timeToTimelineX(b, zoom);
          ctx.fillStyle = 'rgba(245,197,66,0.45)';
          ctx.fillRect(bx - 1, tr.topY + 4, 2, 5);
        }
      }

      const laneClips = clips.filter((c) => c.track === tr.id);
      for (const clip of laneClips) {
        const effDur = Math.max(0.5, clip.duration / Math.max(0.25, clip.speed || 1));
        const x = timeToTimelineX(clip.startTime, zoom);
        const clipW = Math.max(28, effDur * pixelsPerSecond - 2);
        const y = tr.topY + 6;
        const blockH = tr.height - 12;
        const isSelected = clip.id === selectedClipId;

        // Clip rounded body
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, clipW, blockH, 7);
        ctx.clip();

        if (tr.id === 'text') {
          ctx.fillStyle = isSelected ? 'rgba(245,197,66,0.34)' : 'rgba(212,175,55,0.22)';
        } else if (tr.id === 'video') {
          ctx.fillStyle = isSelected ? 'rgba(56,189,248,0.32)' : 'rgba(14,165,233,0.18)';
        } else {
          ctx.fillStyle = isSelected ? 'rgba(52,211,153,0.30)' : 'rgba(16,185,129,0.18)';
        }
        ctx.fillRect(x, y, clipW, blockH);

        // Video filmstrip frame ticks
        if (tr.id === 'video') {
          ctx.fillStyle = 'rgba(255,255,255,0.14)';
          const frameStep = 28;
          for (let fx = x + 6; fx < x + clipW - 10; fx += frameStep) {
            ctx.fillRect(fx, y + 3, 2, 4);
            ctx.fillRect(fx, y + blockH - 7, 2, 4);
          }
          ctx.strokeStyle = 'rgba(56,189,248,0.22)';
          for (let fx = x + frameStep; fx < x + clipW; fx += frameStep) {
            ctx.beginPath();
            ctx.moveTo(fx, y + 10);
            ctx.lineTo(fx, y + blockH - 10);
            ctx.stroke();
          }
        }

        // Audio deterministic waveform bars
        if (tr.id === 'audio') {
          const seed = clip.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
          ctx.fillStyle = isSelected ? 'rgba(110,231,183,0.85)' : 'rgba(52,211,153,0.6)';
          const centerY = y + blockH / 2;
          for (let wx = x + 6; wx < x + clipW - 6; wx += 4) {
            const amp =
              0.22 +
              0.68 *
                Math.abs(Math.sin((wx - x) * 0.14 + seed * 0.3) * Math.cos((wx - x) * 0.05));
            const barH = Math.max(4, amp * (blockH - 14) * Math.max(0.25, clip.volume));
            ctx.fillRect(wx, centerY - barH / 2, 2, barH);
          }
        }

        // Clip label badge
        ctx.fillStyle = 'rgba(6, 12, 22, 0.72)';
        ctx.fillRect(x + 6, y + 5, Math.min(clipW - 14, 150), 17);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 10px Inter, system-ui, sans-serif';
        const prefix = tr.id === 'text' ? 'T · ' : tr.id === 'audio' ? '♪ ' : '';
        const textMaxW = Math.max(12, Math.min(clipW - 22, 140));
        ctx.fillText(
          `${prefix}${clip.name}`,
          x + 10,
          y + 16,
          textMaxW,
        );

        if (clip.speed !== 1 && clipW > 75) {
          ctx.fillStyle = '#F5C542';
          ctx.font = '700 9px ui-monospace, monospace';
          ctx.fillText(`${clip.speed}x`, x + clipW - 30, y + blockH - 7);
        }
        ctx.restore();

        // Outer border & CapCut trim handles when selected
        ctx.strokeStyle = isSelected
          ? '#F5C542'
          : tr.id === 'text'
            ? 'rgba(245,197,66,0.55)'
            : tr.id === 'video'
              ? 'rgba(56,189,248,0.55)'
              : 'rgba(52,211,153,0.55)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, y + 0.5, clipW - 1, blockH - 1, 7);
        ctx.stroke();

        if (isSelected) {
          ctx.fillStyle = '#F5C542';
          ctx.fillRect(x, y + 4, 5, blockH - 8);
          ctx.fillRect(x + clipW - 5, y + 4, 5, blockH - 8);
          ctx.fillStyle = '#08172C';
          ctx.fillRect(x + 2, y + blockH / 2 - 5, 1.5, 10);
          ctx.fillRect(x + clipW - 3.5, y + blockH / 2 - 5, 1.5, 10);
        }
      }
    }

    // 4. CapCut White/Gold Playhead Needle across all tracks
    const phX = Math.max(6, Math.min(w - 6, timeToTimelineX(playhead, zoom)));
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(phX, 24);
    ctx.lineTo(phX, h);
    ctx.stroke();

    ctx.fillStyle = '#F5C542';
    ctx.beginPath();
    ctx.moveTo(phX - 5, 16);
    ctx.lineTo(phX + 5, 16);
    ctx.lineTo(phX + 5, 24);
    ctx.lineTo(phX, 31);
    ctx.lineTo(phX - 5, 24);
    ctx.closePath();
    ctx.fill();
  }, [
    clips,
    playhead,
    selectedClipId,
    totalDuration,
    zoom,
    canvasWidth,
    pixelsPerSecond,
    rulerTicks,
    beatMarkersEnabled,
    isPremiumUnlocked,
  ]);

  const getLocalCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, e.clientX - rect.left),
      y: Math.max(0, e.clientY - rect.top),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getLocalCanvasCoords(e);
    e.currentTarget.setPointerCapture(e.pointerId);

    // Clicked ruler header -> scrub playhead
    if (y < 32) {
      setDragState({ kind: 'scrub' });
      onChangePlayhead(
        timelineXToTime(x, zoom, 0, snapEnabled ? 0.1 : 0),
        true,
      );
      return;
    }

    const hitTrack = TRACK_META.find((t) => y >= t.topY && y <= t.topY + t.height);
    if (hitTrack) {
      const laneClips = clips.filter((c) => c.track === hitTrack.id);
      const hitClip = laneClips.find((clip) => {
        const effDur = Math.max(0.5, clip.duration / Math.max(0.25, clip.speed || 1));
        const cx = timeToTimelineX(clip.startTime, zoom);
        const cw = Math.max(28, effDur * pixelsPerSecond - 2);
        return x >= cx - 4 && x <= cx + cw + 4;
      });

      if (hitClip) {
        onSelectClip(hitClip.id);
        const effDur = Math.max(0.5, hitClip.duration / Math.max(0.25, hitClip.speed || 1));
        const cx = timeToTimelineX(hitClip.startTime, zoom);
        const cw = Math.max(28, effDur * pixelsPerSecond - 2);
        if (x >= cx + cw - 10) {
          setDragState({
            kind: 'trim-right',
            clipId: hitClip.id,
            originX: x,
            initialDuration: hitClip.duration,
          });
        } else {
          setDragState({
            kind: 'move',
            clipId: hitClip.id,
            originX: x,
            initialStartTime: hitClip.startTime,
          });
        }
        return;
      }
    }

    // Empty track area click -> move playhead directly
    setDragState({ kind: 'scrub' });
    onChangePlayhead(
      timelineXToTime(x, zoom, 0, snapEnabled ? 0.25 : 0),
      true,
    );
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    const { x } = getLocalCanvasCoords(e);

    if (dragState.kind === 'scrub') {
      onChangePlayhead(
        timelineXToTime(x, zoom, 0, snapEnabled ? 0.1 : 0),
        true,
      );
      return;
    }

    const deltaSec = (x - dragState.originX) / Math.max(1, pixelsPerSecond);
    if (dragState.kind === 'move') {
      let nextStart = Math.max(0, dragState.initialStartTime + deltaSec);
      if (snapEnabled) {
        nextStart = Math.round(nextStart * 4) / 4;
      }
      onChangeClips((prev) => moveClipStartTime(prev, dragState.clipId, nextStart));
    } else if (dragState.kind === 'trim-right') {
      let targetDelta = deltaSec;
      if (snapEnabled) {
        targetDelta = Math.round(targetDelta * 4) / 4;
      }
      const nextDuration = Math.max(0.5, dragState.initialDuration + targetDelta);
      onChangeClips((prev) =>
        prev.map((c) =>
          c.id === dragState.clipId
            ? trimClipEdges({ ...c, duration: dragState.initialDuration }, nextDuration - dragState.initialDuration)
            : c,
        ),
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragState(null);
  };

  const handleFitZoom = () => {
    const viewW = scrollWrapRef.current?.clientWidth || 720;
    const idealPps = Math.max(24, (viewW - 40) / Math.max(4, totalDuration + 2));
    setZoom(clampTimelineZoom(idealPps / 64));
  };

  return (
    <div
      data-testid="studio-multi-track-timeline"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        const droppedFiles = Array.from(e.dataTransfer.files || []);
        if (droppedFiles.length > 0) {
          e.preventDefault();
          onDropFiles(droppedFiles);
        }
      }}
      className="rounded-2xl bg-[#070B12] border border-white/15 overflow-hidden shadow-2xl"
    >
      {/* CapCut NLE Top Toolbar */}
      <div className="bg-[#0E1525] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Playback & NLE Edit Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
            className="w-8 h-8 rounded-lg bg-[#F5C542] text-[#08172C] hover:brightness-105 flex items-center justify-center shrink-0"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <div className="px-2.5 py-1 rounded-lg bg-[#070B12] border border-white/10 font-mono text-xs text-white tabular-nums">
            <span className="text-[#F5C542] font-bold">{formatTimestampMMSS(playhead)}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-300">{formatTimestampMMSS(totalDuration)}</span>
          </div>

          <button
            type="button"
            disabled={!selectedClipId}
            onClick={onSplitSelected}
            title="Split selected clip at playhead"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold disabled:opacity-40"
          >
            <Scissors className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={onFreezeFrameAtPlayhead}
            title="Capture freeze frame at playhead"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F5C542]" />
            <span className="hidden sm:inline">Freeze</span>
          </button>

          <button
            type="button"
            disabled={!selectedClipId}
            onClick={() => selectedClipId && onDeleteClip(selectedClipId)}
            title="Delete selected clip"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-xs font-semibold disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>

        {/* Center/Right: 3-Option Timeline Media Routing + Snap + Zoom */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Option 1: Overlay (Text) */}
          <button
            type="button"
            data-testid="timeline-option-overlay-btn"
            onClick={() => {
              onToggleOverlayComposer();
              window.setTimeout(() => timelineOverlayInputRef.current?.focus(), 40);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
              showTimelineOverlayInput
                ? 'bg-[#F5C542] text-[#08172C] border-[#F5C542]'
                : 'bg-[#08172C] text-[#F5C542] border-[#D4AF37]/45 hover:bg-[#16325C]'
            }`}
          >
            <TypeIcon className="w-3.5 h-3.5" />
            <span>Overlay (Text)</span>
          </button>

          {/* Option 2: Music (MP3 -> Audio) */}
          <label
            htmlFor="timeline-music-mp3-input"
            data-testid="timeline-option-music-label"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold cursor-pointer transition-colors"
          >
            <Music className="w-3.5 h-3.5" />
            <span>Music (MP3 → Audio)</span>
            <input
              id="timeline-music-mp3-input"
              type="file"
              multiple
              accept=".mp3,audio/mpeg,audio/*"
              onChange={onImportFiles}
              className="sr-only"
            />
          </label>

          {/* Option 3: Video (MP4 -> Video) */}
          <label
            htmlFor="timeline-video-mp4-input"
            data-testid="timeline-option-video-label"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 text-xs font-bold cursor-pointer transition-colors"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Video (MP4 → Video)</span>
            <input
              id="timeline-video-mp4-input"
              type="file"
              multiple
              accept=".mp4,video/mp4,video/*"
              onChange={onImportFiles}
              className="sr-only"
            />
          </label>

          {/* Snap & Zoom controls */}
          <div className="flex items-center gap-1 ml-1 pl-2 border-l border-white/10">
            <button
              type="button"
              onClick={() => setSnapEnabled((s) => !s)}
              title="Toggle magnetic grid snapping"
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border ${
                snapEnabled
                  ? 'bg-[#F5C542]/20 border-[#F5C542]/50 text-[#F5C542]'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Snap</span>
            </button>

            <button
              type="button"
              onClick={() => setZoom((z) => clampTimelineZoom(z - 0.25))}
              aria-label="Zoom out timeline"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitZoom}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[11px] font-mono text-slate-200"
              title="Fit timeline"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampTimelineZoom(z + 0.25))}
              aria-label="Zoom in timeline"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Inline Overlay Text Composer */}
      {showTimelineOverlayInput && (
        <form
          data-testid="timeline-overlay-composer"
          onSubmit={onSubmitOverlay}
          className="bg-[#0B1F3A] border-b border-[#F5C542]/40 px-4 py-3 flex flex-wrap items-center gap-2.5"
        >
          <TypeIcon className="w-4 h-4 text-[#F5C542] shrink-0" />
          <input
            ref={timelineOverlayInputRef}
            type="text"
            aria-label="Type text to overlay on timeline"
            value={timelineOverlayText}
            onChange={(e) => onChangeOverlayText(e.target.value)}
            placeholder="Type your overlay text (e.g., PRIME X LAUNCH)..."
            className="flex-1 min-w-[210px] px-3 py-2 rounded-lg bg-[#061121] border border-white/15 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-[#F5C542]"
          />
          <input
            type="color"
            aria-label="Timeline overlay text color"
            value={timelineOverlayColor}
            onChange={(e) => onChangeOverlayColor(e.target.value)}
            className="w-9 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer"
          />
          <select
            aria-label="Timeline overlay vertical position"
            value={timelineOverlayPosY}
            onChange={(e) => onChangeOverlayPosY(Number(e.target.value))}
            className="px-2.5 py-2 rounded-lg bg-[#061121] border border-white/15 text-xs text-white"
          >
            <option value={20}>Top</option>
            <option value={50}>Center</option>
            <option value={75}>Lower Third</option>
            <option value={86}>Bottom</option>
          </select>
          <select
            aria-label="Timeline overlay font size"
            value={timelineOverlaySize}
            onChange={(e) => onChangeOverlaySize(Number(e.target.value))}
            className="px-2.5 py-2 rounded-lg bg-[#061121] border border-white/15 text-xs text-white font-mono"
          >
            <option value={28}>28px</option>
            <option value={38}>38px</option>
            <option value={48}>48px</option>
            <option value={60}>60px</option>
          </select>
          <button
            type="submit"
            data-testid="timeline-overlay-add-submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Overlay</span>
          </button>
        </form>
      )}

      {/* NLE Split Surface: Pinned Track Headers + Scrollable High-DPI Timeline Canvas */}
      <div className="flex items-stretch">
        {/* Left Pinned Track Headers */}
        <div className="w-36 sm:w-44 shrink-0 bg-[#0B111E] border-r border-white/15 flex flex-col">
          {/* Ruler Header Corner (32px) */}
          <div className="h-8 px-3 border-b border-white/10 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <span className="inline-flex items-center gap-1 text-[#F5C542] font-bold">
              <Layers className="w-3 h-3" />
              <span>Tracks</span>
            </span>
            <span>{clips.length} clips</span>
          </div>

          {/* Track 1: Overlay (54px) */}
          <div className="h-[54px] px-3 border-b border-white/10 flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#F5C542] truncate">Overlay</div>
              <div className="text-[10px] text-slate-400 truncate">Text · Stickers</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!showTimelineOverlayInput) onToggleOverlayComposer();
                window.setTimeout(() => timelineOverlayInputRef.current?.focus(), 40);
              }}
              className="px-1.5 py-0.5 rounded bg-[#F5C542]/20 hover:bg-[#F5C542]/35 border border-[#F5C542]/45 text-[10px] font-bold text-[#F5C542] shrink-0"
            >
              + Text
            </button>
          </div>

          {/* Track 2: Main Video (64px) */}
          <div className="h-[64px] px-3 border-b border-white/10 flex items-center justify-between gap-1 bg-[#0E1728]/50">
            <div className="min-w-0">
              <div className="text-xs font-bold text-sky-300 truncate">Main Video</div>
              <div className="text-[10px] text-slate-400 truncate">MP4 · Visuals</div>
            </div>
            <label
              htmlFor="track-video-mp4-input"
              className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/45 text-[10px] font-bold text-sky-200 cursor-pointer shrink-0"
            >
              + MP4
              <input
                id="track-video-mp4-input"
                type="file"
                multiple
                accept=".mp4,video/mp4,video/*"
                onChange={onImportFiles}
                className="sr-only"
              />
            </label>
          </div>

          {/* Track 3: Audio / Music (58px matches remainder) */}
          <div className="h-[58px] px-3 flex items-center justify-between gap-1">
            <div className="min-w-0">
              <div className="text-xs font-bold text-emerald-300 truncate">Audio</div>
              <div className="text-[10px] text-slate-400 truncate">
                {beatMarkersEnabled && isPremiumUnlocked ? 'Beat Sync ON' : 'MP3 · SFX'}
              </div>
            </div>
            <label
              htmlFor="track-music-mp3-input"
              className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/45 text-[10px] font-bold text-emerald-200 cursor-pointer shrink-0"
            >
              + MP3
              <input
                id="track-music-mp3-input"
                type="file"
                multiple
                accept=".mp3,audio/mpeg,audio/*"
                onChange={onImportFiles}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Scrollable High-DPI NLE Canvas Surface */}
        <div
          ref={scrollWrapRef}
          className="flex-1 overflow-x-auto bg-[#070B12]"
        >
          <canvas
            ref={canvasRef}
            data-testid="capcut-nle-canvas"
            width={canvasWidth}
            height={TIMELINE_CANVAS_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="block max-w-none shrink-0 cursor-crosshair select-none touch-none"
          />
        </div>
      </div>

      {/* Accessible Per-Track Clip Strip (Quick Delete, Reorder & Inspect) */}
      <div className="bg-[#0B1220] border-t border-white/10 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Drag clips left/right on canvas to move · Drag right gold grip to trim · Click ruler to scrub</span>
          <span className="font-mono text-[#F5C542]">CapCut NLE Workspace</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {TRACK_META.map((tr) => {
            const trackClips = clips.filter((c) => c.track === tr.id);
            return (
              <div
                key={tr.id}
                data-testid={`timeline-track-${tr.id}`}
                className="rounded-xl bg-[#070B12] border border-white/10 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  <span>{tr.label} ({trackClips.length})</span>
                  <span className="text-slate-500 font-mono">{tr.badge}</span>
                </div>

                {trackClips.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic py-1">
                    {tr.id === 'audio'
                      ? 'Drop MP3 or click + MP3'
                      : tr.id === 'text'
                        ? 'Click Overlay (Text) to type'
                        : 'Drop MP4 or click + MP4'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {trackClips.map((clip, idx) => (
                      <div
                        key={clip.id}
                        draggable
                        onDragStart={() => {
                          dragClipOrderRef.current = { track: tr.id, index: idx };
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const drag = dragClipOrderRef.current;
                          if (drag && drag.track === tr.id) {
                            onChangeClips((prev) =>
                              reorderClipsInTrack(prev, tr.id, drag.index, idx),
                            );
                          }
                          dragClipOrderRef.current = null;
                        }}
                        onClick={() => onSelectClip(clip.id)}
                        className={`px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1.5 cursor-pointer select-none transition-all ${tr.accent} ${
                          selectedClipId === clip.id
                            ? 'ring-2 ring-[#F5C542]'
                            : 'opacity-90 hover:opacity-100'
                        }`}
                      >
                        <span className="font-semibold text-white truncate max-w-[95px]">
                          {clip.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-200">
                          {clip.startTime.toFixed(1)}s·{clip.duration.toFixed(1)}s
                        </span>
                        <div className="flex items-center gap-0.5">
                          {idx > 0 && (
                            <button
                              type="button"
                              aria-label={`Move ${clip.name} earlier`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onChangeClips((prev) =>
                                  reorderClipsInTrack(prev, tr.id, idx, idx - 1),
                                );
                              }}
                              className="p-0.5 rounded hover:bg-white/20 text-white"
                            >
                              <ArrowLeft className="w-3 h-3" />
                            </button>
                          )}
                          {idx < trackClips.length - 1 && (
                            <button
                              type="button"
                              aria-label={`Move ${clip.name} later`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onChangeClips((prev) =>
                                  reorderClipsInTrack(prev, tr.id, idx, idx + 1),
                                );
                              }}
                              className="p-0.5 rounded hover:bg-white/20 text-white"
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`delete-clip-${clip.id}`}
                            aria-label={`Delete ${clip.name} from timeline`}
                            title={`Delete ${clip.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteClip(clip.id);
                            }}
                            className="p-0.5 rounded hover:bg-red-500/80 text-red-200 hover:text-white"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
