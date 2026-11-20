import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Play,
  RotateCcw,
  Scissors,
  Upload,
} from 'lucide-react';
import { clampTrimWindow, formatTimestampMMSS } from '../../lib/studioLogic';
import type { StudioClip } from '../../types';

export interface TrimmableVideoItem {
  id: string;
  clipId: string;
  name: string;
  url: string;
  durationSec?: number;
  formatLabel?: string;
}

interface VideoTrimPanelProps {
  uploadedVideos: TrimmableVideoItem[];
  clips: StudioClip[];
  selectedClipId: string | null;
  playhead: number;
  onSelectVideoClip: (clipId: string) => void;
  onApplyTrim: (clipId: string, startTime: number, endTime: number) => void;
  onPreviewTrimRange: (clipId: string, startTime: number, endTime: number) => void;
  onExportTrimmedVideo: (videoId: string) => void;
  onUploadFiles: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const VideoTrimPanel: React.FC<VideoTrimPanelProps> = ({
  uploadedVideos,
  clips,
  selectedClipId,
  playhead,
  onSelectVideoClip,
  onApplyTrim,
  onPreviewTrimRange,
  onExportTrimmedVideo,
  onUploadFiles,
}) => {
  const [targetVideoId, setTargetVideoId] = useState<string>('');

  const activeVideo = useMemo(() => {
    if (uploadedVideos.length === 0) return null;
    if (targetVideoId) {
      const explicit = uploadedVideos.find((v) => v.id === targetVideoId);
      if (explicit) return explicit;
    }
    if (selectedClipId) {
      const fromClip = uploadedVideos.find((v) => v.clipId === selectedClipId);
      if (fromClip) return fromClip;
    }
    return uploadedVideos[0];
  }, [uploadedVideos, targetVideoId, selectedClipId]);

  const activeClip = useMemo(() => {
    if (!activeVideo) return null;
    return clips.find((c) => c.id === activeVideo.clipId) || null;
  }, [activeVideo, clips]);

  const maxDuration = useMemo(() => {
    const raw =
      activeVideo?.durationSec ||
      activeClip?.sourceDuration ||
      (activeClip ? activeClip.trimStart + activeClip.duration : 10);
    return Math.max(0.5, Math.round(raw * 100) / 100);
  }, [activeVideo, activeClip]);

  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(maxDuration);
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    if (!activeClip) {
      setStartSec(0);
      setEndSec(maxDuration);
      return;
    }
    const clamped = clampTrimWindow(
      activeClip.trimStart || 0,
      Math.min(maxDuration, (activeClip.trimStart || 0) + (activeClip.duration || maxDuration)),
      maxDuration,
    );
    setStartSec(clamped.startTime);
    setEndSec(clamped.endTime);
  }, [activeClip?.id, activeClip?.trimStart, activeClip?.duration, maxDuration]);

  const normalized = useMemo(
    () => clampTrimWindow(startSec, endSec, maxDuration),
    [startSec, endSec, maxDuration],
  );

  const handleStartChange = (rawVal: number) => {
    const next = clampTrimWindow(rawVal, endSec, maxDuration);
    setStartSec(next.startTime);
    setEndSec(next.endTime);
    setJustApplied(false);
  };

  const handleEndChange = (rawVal: number) => {
    const next = clampTrimWindow(startSec, rawVal, maxDuration);
    setStartSec(next.startTime);
    setEndSec(next.endTime);
    setJustApplied(false);
  };

  const handleSnapStartToPlayhead = () => {
    if (!activeClip) return;
    const localPlayhead = (activeClip.trimStart || 0) + Math.max(0, playhead - activeClip.startTime);
    handleStartChange(localPlayhead);
  };

  const handleSnapEndToPlayhead = () => {
    if (!activeClip) return;
    const localPlayhead = (activeClip.trimStart || 0) + Math.max(0, playhead - activeClip.startTime);
    handleEndChange(localPlayhead);
  };

  const handleReset = () => {
    setStartSec(0);
    setEndSec(maxDuration);
    if (activeClip) {
      onApplyTrim(activeClip.id, 0, maxDuration);
      setJustApplied(true);
    }
  };

  const handleCommitTrim = () => {
    if (!activeClip) return;
    onApplyTrim(activeClip.id, normalized.startTime, normalized.endTime);
    setJustApplied(true);
  };

  return (
    <section
      data-testid="video-trim-panel"
      aria-label="Uploaded Video Timestamp Trimmer"
      className="w-full rounded-xl bg-[#091930] border border-[#D4AF37]/30 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-[#F5C542]" />
          <h3 className="text-xs font-bold text-white">
            Video Trimmer (Start &amp; End Timestamps)
          </h3>
        </div>

        {activeVideo && uploadedVideos.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="trim-video-select" className="text-[11px] text-slate-400">
              Video:
            </label>
            <select
              id="trim-video-select"
              data-testid="trim-video-select"
              value={activeVideo.id}
              onChange={(e) => {
                const nextId = e.target.value;
                setTargetVideoId(nextId);
                const found = uploadedVideos.find((v) => v.id === nextId);
                if (found) onSelectVideoClip(found.clipId);
                setJustApplied(false);
              }}
              className="px-2.5 py-1 rounded-lg bg-[#061121] border border-white/15 text-xs text-white max-w-[200px]"
            >
              {uploadedVideos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({formatTimestampMMSS(v.durationSec || maxDuration)})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!activeVideo || !activeClip ? (
        <div className="rounded-lg bg-[#061121] border border-dashed border-white/15 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-white">
              Upload a video to set exact Start &amp; End trim timestamps
            </div>
            <p className="text-[11px] text-slate-400">
              Trim any uploaded MP4, WebM, or MOV video before timeline mixing or exporting.
            </p>
          </div>
          <label
            htmlFor="trim-panel-upload-input"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold cursor-pointer hover:brightness-105"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Video</span>
            <input
              id="trim-panel-upload-input"
              type="file"
              accept="video/*"
              onChange={onUploadFiles}
              className="sr-only"
            />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#061121] border border-white/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-[#F5C542]" />
              <span>Source:</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {formatTimestampMMSS(maxDuration)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
              <span className="text-slate-300">
                In:{' '}
                <strong className="text-[#F5C542]" data-testid="trim-start-display">
                  {formatTimestampMMSS(normalized.startTime)}
                </strong>
              </span>
              <span className="text-slate-300">
                Out:{' '}
                <strong className="text-[#F5C542]" data-testid="trim-end-display">
                  {formatTimestampMMSS(normalized.endTime)}
                </strong>
              </span>
              <span className="text-emerald-300 font-semibold" data-testid="trim-duration-display">
                Kept: {normalized.duration.toFixed(2)}s
              </span>
            </div>
          </div>

          {/* Start & End Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-[#061121] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="trim-start-input" className="text-xs font-semibold text-slate-200">
                  Start Timestamp (sec)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSnapStartToPlayhead}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-slate-200"
                  >
                    Use Playhead
                  </button>
                  <input
                    id="trim-start-input"
                    data-testid="trim-start-input"
                    type="number"
                    min={0}
                    max={Math.max(0, Number((normalized.endTime - 0.5).toFixed(2)))}
                    step={0.1}
                    value={normalized.startTime}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded bg-[#091930] border border-white/15 text-xs font-mono text-[#F5C542] tabular-nums"
                  />
                </div>
              </div>
              <input
                type="range"
                aria-label="Start timestamp slider"
                data-testid="trim-start-slider"
                min={0}
                max={maxDuration}
                step={0.05}
                value={normalized.startTime}
                onChange={(e) => handleStartChange(Number(e.target.value))}
                className="w-full accent-[#F5C542]"
              />
            </div>

            <div className="rounded-lg bg-[#061121] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="trim-end-input" className="text-xs font-semibold text-slate-200">
                  End Timestamp (sec)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSnapEndToPlayhead}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-slate-200"
                  >
                    Use Playhead
                  </button>
                  <input
                    id="trim-end-input"
                    data-testid="trim-end-input"
                    type="number"
                    min={Math.min(maxDuration, Number((normalized.startTime + 0.5).toFixed(2)))}
                    max={maxDuration}
                    step={0.1}
                    value={normalized.endTime}
                    onChange={(e) => handleEndChange(Number(e.target.value))}
                    className="w-20 px-2 py-1 rounded bg-[#091930] border border-white/15 text-xs font-mono text-[#F5C542] tabular-nums"
                  />
                </div>
              </div>
              <input
                type="range"
                aria-label="End timestamp slider"
                data-testid="trim-end-slider"
                min={0.5}
                max={maxDuration}
                step={0.05}
                value={normalized.endTime}
                onChange={(e) => handleEndChange(Number(e.target.value))}
                className="w-full accent-[#F5C542]"
              />
            </div>
          </div>

          {/* Actions Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>Reset Full Length</span>
              </button>
              <button
                type="button"
                data-testid="preview-trim-btn"
                onClick={() =>
                  onPreviewTrimRange(activeClip.id, normalized.startTime, normalized.endTime)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-xs font-semibold text-white"
              >
                <Play className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>Preview Trimmed Cut</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="apply-video-trim-btn"
                onClick={handleCommitTrim}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105"
              >
                {justApplied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Trim Applied</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Apply Trim to Timeline</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyTrim(activeClip.id, normalized.startTime, normalized.endTime);
                  onExportTrimmedVideo(activeVideo.id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#F5C542]/50 bg-[#061121] hover:bg-[#0B1F3A] text-[#F5C542] text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Trimmed</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
