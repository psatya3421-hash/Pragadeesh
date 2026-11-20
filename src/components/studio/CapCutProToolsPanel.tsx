import React, { useState } from 'react';
import {
  Camera,
  Captions,
  Crown,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Lock,
  RotateCw,
  Scissors,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  CANVAS_BACKGROUND_OPTIONS,
  KEYFRAME_MOTION_OPTIONS,
  PRO_STICKER_PRESETS,
  STUDIO_PREMIUM_MONTHLY_FEE_INR,
  TEXT_ANIMATION_OPTIONS,
  TEXT_STYLE_OPTIONS,
  TRANSITION_OPTIONS,
  VIDEO_EFFECT_OPTIONS,
} from '../../lib/studioLogic';
import type {
  StudioCanvasBackground,
  StudioClip,
  StudioKeyframeMotion,
  StudioTextAnimation,
  StudioTextStyle,
  StudioTransitionPreset,
  StudioVideoEffectPreset,
} from '../../types';

interface CapCutProToolsPanelProps {
  isPremiumUnlocked: boolean;
  selectedClip: StudioClip | null;
  videoEffect: StudioVideoEffectPreset;
  effectIntensity: number;
  canvasBackground: StudioCanvasBackground;
  beatMarkersEnabled: boolean;
  onChangeVideoEffect: (effect: StudioVideoEffectPreset) => void;
  onChangeEffectIntensity: (val: number) => void;
  onChangeCanvasBackground: (bg: StudioCanvasBackground) => void;
  onToggleBeatMarkers: () => void;
  onUpdateSelectedClip: (patch: Partial<StudioClip>) => void;
  onFreezeFrameAtPlayhead: () => void;
  onAddProSticker: (symbol: string, label: string) => void;
  onGenerateAutoCaptions: (
    script: string,
    style: StudioTextStyle,
    animation: StudioTextAnimation,
  ) => void;
  onOpenPremiumModal: (featureName?: string) => void;
}

export const CapCutProToolsPanel: React.FC<CapCutProToolsPanelProps> = ({
  isPremiumUnlocked,
  selectedClip,
  videoEffect,
  effectIntensity,
  canvasBackground,
  beatMarkersEnabled,
  onChangeVideoEffect,
  onChangeEffectIntensity,
  onChangeCanvasBackground,
  onToggleBeatMarkers,
  onUpdateSelectedClip,
  onFreezeFrameAtPlayhead,
  onAddProSticker,
  onGenerateAutoCaptions,
  onOpenPremiumModal,
}) => {
  const [captionScript, setCaptionScript] = useState(
    'Prime X Studio brings cinema transitions, dynamic effects, and 4K editing to your browser.',
  );
  const [captionStyle, setCaptionStyle] = useState<StudioTextStyle>('bold_yellow');
  const [captionAnim, setCaptionAnim] = useState<StudioTextAnimation>('pop_in');

  const requirePro = (featureLabel: string, action: () => void) => {
    if (!isPremiumUnlocked) {
      onOpenPremiumModal(featureLabel);
      return;
    }
    action();
  };

  return (
    <div data-testid="capcut-pro-tools-panel" className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
      {/* Subscription Banner */}
      <div className="rounded-xl bg-[#0B1F3A] border border-[#D4AF37]/40 p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#F5C542]">
            <Crown className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isPremiumUnlocked
                ? 'Premium Edits Active'
                : `Premium Edits (₹${STUDIO_PREMIUM_MONTHLY_FEE_INR}/mo)`}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5">
            {isPremiumUnlocked
              ? 'All CapCut FX, transitions, keyframes, chroma key & 4K active.'
              : 'Unlock FX, transitions, chroma key, auto-captions & 4K.'}
          </p>
        </div>
        {!isPremiumUnlocked && (
          <button
            type="button"
            data-testid="pro-panel-unlock-btn"
            onClick={() => onOpenPremiumModal('All CapCut Premium Edits')}
            className="px-3 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold shrink-0 whitespace-nowrap"
          >
            Unlock ₹{STUDIO_PREMIUM_MONTHLY_FEE_INR}
          </button>
        )}
      </div>

      {/* Section 1: Transform & Cut (Free + Pro Freeze/Reverse) */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5 text-[#F5C542]" />
          <span>Transform, Freeze &amp; Speed</span>
        </div>
        {!selectedClip ? (
          <p className="text-[11px] text-slate-400">
            Select any clip on the timeline to rotate, flip, freeze frame, or apply motion.
          </p>
        ) : (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateSelectedClip({
                    rotation: ((selectedClip.rotation || 0) + 90) % 360,
                  })
                }
                className="px-2 py-2 rounded-lg bg-[#0B1F3A] border border-white/10 hover:border-[#F5C542]/50 text-[11px] font-semibold text-white flex items-center justify-center gap-1"
              >
                <RotateCw className="w-3 h-3 text-[#F5C542]" />
                <span>Rotate 90°</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedClip({ flipH: !selectedClip.flipH })}
                className={`px-2 py-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  selectedClip.flipH
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-white border-white/10'
                }`}
              >
                <FlipHorizontal className="w-3 h-3" />
                <span>Flip H</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSelectedClip({ flipV: !selectedClip.flipV })}
                className={`px-2 py-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                  selectedClip.flipV
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-white border-white/10'
                }`}
              >
                <FlipVertical className="w-3 h-3" />
                <span>Flip V</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="pro-freeze-frame-btn"
                onClick={() =>
                  requirePro('Freeze Frame Snapshot', onFreezeFrameAtPlayhead)
                }
                className="px-2.5 py-2 rounded-lg bg-[#0B1F3A] border border-white/15 hover:border-[#F5C542] text-[11px] font-semibold text-white flex items-center justify-center gap-1.5"
              >
                {!isPremiumUnlocked && <Lock className="w-3 h-3 text-[#F5C542]" />}
                <Camera className="w-3 h-3 text-[#F5C542]" />
                <span>Freeze Frame</span>
              </button>

              <button
                type="button"
                data-testid="pro-reverse-clip-btn"
                onClick={() =>
                  requirePro('Reverse Video Playback', () =>
                    onUpdateSelectedClip({ reverse: !selectedClip.reverse }),
                  )
                }
                className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 ${
                  selectedClip.reverse && isPremiumUnlocked
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-white border-white/15 hover:border-[#F5C542]'
                }`}
              >
                {!isPremiumUnlocked && <Lock className="w-3 h-3 text-[#F5C542]" />}
                <span>Reverse {selectedClip.reverse ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {/* Opacity & Scale */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="space-y-1 block">
                <div className="flex justify-between text-slate-300">
                  <span>Scale</span>
                  <span className="font-mono text-[#F5C542] tabular-nums">
                    {Math.round((selectedClip.scale ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={selectedClip.scale ?? 1}
                  onChange={(e) => onUpdateSelectedClip({ scale: Number(e.target.value) })}
                  className="w-full accent-[#F5C542]"
                />
              </label>

              <label className="space-y-1 block">
                <div className="flex justify-between text-slate-300">
                  <span>Opacity</span>
                  <span className="font-mono text-[#F5C542] tabular-nums">
                    {Math.round((selectedClip.opacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={selectedClip.opacity ?? 1}
                  onChange={(e) => onUpdateSelectedClip({ opacity: Number(e.target.value) })}
                  className="w-full accent-[#F5C542]"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: CapCut Video Effects (Premium FX) */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Video Effects (FX)</span>
          </div>
          <span className="text-[10px] font-mono text-[#F5C542]">{effectIntensity}%</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {VIDEO_EFFECT_OPTIONS.map((fx) => {
            const locked = fx.premium && !isPremiumUnlocked;
            const active = videoEffect === fx.id && !locked;
            return (
              <button
                key={fx.id}
                type="button"
                data-testid={`video-fx-${fx.id}`}
                onClick={() =>
                  fx.premium
                    ? requirePro(`Video Effect: ${fx.label}`, () => onChangeVideoEffect(fx.id))
                    : onChangeVideoEffect(fx.id)
                }
                className={`px-2.5 py-2 rounded-lg border text-left text-[11px] font-semibold flex items-center justify-between gap-1 transition-colors ${
                  active
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-slate-200 border-white/10 hover:border-[#F5C542]/50'
                }`}
              >
                <span className="truncate">{fx.label}</span>
                {locked && <Lock className="w-3 h-3 text-[#F5C542] shrink-0" />}
              </button>
            );
          })}
        </div>
        <input
          type="range"
          aria-label="Video effect intensity"
          min={10}
          max={100}
          value={effectIntensity}
          onChange={(e) =>
            requirePro('Effect Intensity Control', () =>
              onChangeEffectIntensity(Number(e.target.value)),
            )
          }
          className="w-full accent-[#F5C542]"
        />
      </div>

      {/* Section 3: Clip Transitions & Keyframe Motion */}
      <div className="space-y-2.5 border-t border-white/10 pt-3">
        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#F5C542]" />
          <span>Clip Transitions &amp; Keyframes</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {TRANSITION_OPTIONS.map((tr) => {
            const locked = tr.premium && !isPremiumUnlocked;
            const active = (selectedClip?.transition || 'none') === tr.id && !locked;
            return (
              <button
                key={tr.id}
                type="button"
                data-testid={`transition-${tr.id}`}
                onClick={() => {
                  if (!selectedClip) return;
                  if (tr.premium) {
                    requirePro(`Transition: ${tr.label}`, () =>
                      onUpdateSelectedClip({ transition: tr.id }),
                    );
                  } else {
                    onUpdateSelectedClip({ transition: tr.id });
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between gap-1 ${
                  active
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-slate-200 border-white/10 hover:border-[#F5C542]/50'
                }`}
              >
                <span className="truncate">{tr.label}</span>
                {locked && <Lock className="w-3 h-3 text-[#F5C542] shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-semibold text-slate-300 pt-1">Keyframe Camera Motion</div>
        <div className="grid grid-cols-2 gap-1.5">
          {KEYFRAME_MOTION_OPTIONS.map((kf) => {
            const locked = kf.premium && !isPremiumUnlocked;
            const active = (selectedClip?.keyframeMotion || 'none') === kf.id && !locked;
            return (
              <button
                key={kf.id}
                type="button"
                data-testid={`keyframe-${kf.id}`}
                onClick={() => {
                  if (!selectedClip) return;
                  if (kf.premium) {
                    requirePro(`Keyframe: ${kf.label}`, () =>
                      onUpdateSelectedClip({ keyframeMotion: kf.id }),
                    );
                  } else {
                    onUpdateSelectedClip({ keyframeMotion: kf.id });
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between gap-1 ${
                  active
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-slate-200 border-white/10 hover:border-[#F5C542]/50'
                }`}
              >
                <span className="truncate">{kf.label}</span>
                {locked && <Lock className="w-3 h-3 text-[#F5C542] shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 4: Cutout / Chroma Key (Green & Blue Screen) */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Cutout &amp; Chroma Key</span>
          </div>
          {!isPremiumUnlocked && <Lock className="w-3 h-3 text-[#F5C542]" />}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: 'off', label: 'Off' },
            { id: 'green', label: 'Green Screen' },
            { id: 'blue', label: 'Blue Screen' },
          ].map((opt) => {
            const isCurrent =
              opt.id === 'off'
                ? !selectedClip?.chromaKeyEnabled
                : selectedClip?.chromaKeyEnabled && selectedClip?.chromaKeyColor === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`chroma-${opt.id}`}
                onClick={() => {
                  if (!selectedClip) return;
                  if (opt.id === 'off') {
                    onUpdateSelectedClip({ chromaKeyEnabled: false });
                  } else {
                    requirePro(`Chroma Key: ${opt.label}`, () =>
                      onUpdateSelectedClip({
                        chromaKeyEnabled: true,
                        chromaKeyColor: opt.id as 'green' | 'blue',
                        chromaKeyTolerance: selectedClip.chromaKeyTolerance ?? 48,
                      }),
                    );
                  }
                }}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold ${
                  isCurrent
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-slate-200 border-white/10'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 5: Auto-Captions & Kinetic Styles */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Captions className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Auto-Captions &amp; Kinetic Subtitles</span>
          </div>
          {!isPremiumUnlocked && <Lock className="w-3 h-3 text-[#F5C542]" />}
        </div>

        <textarea
          rows={2}
          aria-label="Caption script text"
          value={captionScript}
          onChange={(e) => setCaptionScript(e.target.value)}
          placeholder="Paste voiceover script or speech text..."
          className="w-full px-2.5 py-2 rounded-lg bg-[#061121] border border-white/15 text-xs text-white focus:outline-none focus:border-[#F5C542]"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Caption kinetic style"
            value={captionStyle}
            onChange={(e) => setCaptionStyle(e.target.value as StudioTextStyle)}
            className="px-2 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-[11px] text-white"
          >
            {TEXT_STYLE_OPTIONS.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Caption animation"
            value={captionAnim}
            onChange={(e) => setCaptionAnim(e.target.value as StudioTextAnimation)}
            className="px-2 py-1.5 rounded-lg bg-[#061121] border border-white/15 text-[11px] text-white"
          >
            {TEXT_ANIMATION_OPTIONS.map((an) => (
              <option key={an.id} value={an.id}>
                {an.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          data-testid="generate-auto-captions-btn"
          onClick={() =>
            requirePro('Auto-Captions & Kinetic Subtitles', () =>
              onGenerateAutoCaptions(captionScript, captionStyle, captionAnim),
            )
          }
          className="w-full py-2 rounded-lg bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold flex items-center justify-center gap-1.5"
        >
          {!isPremiumUnlocked && <Lock className="w-3.5 h-3.5" />}
          <span>Generate Timed Captions on Timeline</span>
        </button>
      </div>

      {/* Section 6: Canvas Background, Beat Sync & Pro Badges */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white">Canvas Backdrop &amp; Beats</span>
          <button
            type="button"
            onClick={() => requirePro('Beat Sync Markers', onToggleBeatMarkers)}
            className={`px-2 py-1 rounded text-[10px] font-bold border ${
              beatMarkersEnabled && isPremiumUnlocked
                ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                : 'bg-[#0B1F3A] text-slate-300 border-white/15'
            }`}
          >
            Beat Markers {beatMarkersEnabled && isPremiumUnlocked ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {CANVAS_BACKGROUND_OPTIONS.map((bg) => {
            const locked = bg.premium && !isPremiumUnlocked;
            const active = canvasBackground === bg.id && !locked;
            return (
              <button
                key={bg.id}
                type="button"
                onClick={() =>
                  bg.premium
                    ? requirePro(`Canvas Backdrop: ${bg.label}`, () =>
                        onChangeCanvasBackground(bg.id),
                      )
                    : onChangeCanvasBackground(bg.id)
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between ${
                  active
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#0B1F3A] text-slate-200 border-white/10'
                }`}
              >
                <span>{bg.label}</span>
                {locked && <Lock className="w-3 h-3 text-[#F5C542]" />}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-semibold text-slate-300 pt-1">CapCut Pro Callouts</div>
        <div className="grid grid-cols-3 gap-1.5">
          {PRO_STICKER_PRESETS.map((st) => (
            <button
              key={st.label}
              type="button"
              onClick={() =>
                requirePro(`Pro Overlay: ${st.label}`, () =>
                  onAddProSticker(st.symbol, st.label),
                )
              }
              className="px-2 py-1.5 rounded-lg bg-[#0B1F3A] border border-white/10 hover:border-[#F5C542] text-[10px] font-bold text-[#F5C542] flex items-center justify-center gap-1"
            >
              {!isPremiumUnlocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
              <span className="truncate">{st.symbol}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
