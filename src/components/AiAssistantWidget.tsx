import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Keyboard,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../utils/api';
import { speakText, stopSpeaking } from '../utils/speech';
import {
  isVoiceRecognitionSupported,
  startVoiceRecognition,
} from '../utils/voiceControl';
import { describeJarvisAction } from '../lib/jarvisLogic';
import {
  DEFAULT_SHORTCUT_PRESET_ID,
  SHORTCUT_PRESETS,
  SHORTCUT_STORAGE_KEY,
  detectApplePlatform,
  formatShortcutBadge,
  getAriaKeyShortcuts,
  getAssistantShortcutHints,
  getShortcutPreset,
  matchAssistantShortcutAction,
  type ShortcutPresetId,
} from '../lib/keyboardShortcuts';
import type { JarvisAction } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  executedTasks?: string[];
}

type JarvisPhase = 'standby' | 'listening' | 'thinking' | 'executing' | 'speaking';

interface AiAssistantWidgetProps {
  activeTabLabel: string;
  warnings: string[];
  onClearWarnings: () => void;
  onExecuteActions?: (actions: JarvisAction[]) => Promise<string[]>;
}

export const AiAssistantWidget: React.FC<AiAssistantWidgetProps> = ({
  activeTabLabel,
  warnings,
  onClearWarnings,
  onExecuteActions,
}) => {
  const [open, setOpen] = useState(false);
  const [liveHudExpanded, setLiveHudExpanded] = useState(true);
  const [showShortcutsPanel, setShowShortcutsPanel] = useState(false);
  const [shortcutPreset, setShortcutPreset] = useState<ShortcutPresetId>(() => {
    if (typeof window === 'undefined') return DEFAULT_SHORTCUT_PRESET_ID;
    try {
      const saved = window.localStorage.getItem(SHORTCUT_STORAGE_KEY);
      return getShortcutPreset(saved).id;
    } catch {
      return DEFAULT_SHORTCUT_PRESET_ID;
    }
  });
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<JarvisPhase>('standby');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [handsFreeLoop, setHandsFreeLoop] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micFeedback, setMicFeedback] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_widget',
      role: 'model',
      text: 'JARVIS online. Ask any question or give a voice command like "Open project store and order human following bot".',
    },
  ]);

  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFreeLoop;
  const openRef = useRef(false);
  openRef.current = open;
  const phaseRef = useRef<JarvisPhase>('standby');
  phaseRef.current = phase;
  const micSupported = isVoiceRecognitionSupported();
  const isApplePlatform =
    typeof navigator !== 'undefined' &&
    detectApplePlatform(navigator.platform || navigator.userAgent);
  const shortcutLabel = formatShortcutBadge(shortcutPreset, isApplePlatform);
  const shortcutHints = getAssistantShortcutHints(shortcutPreset, isApplePlatform);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, phase]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterimTranscript('');
    setPhase((cur) => (cur === 'listening' ? 'standby' : cur));
  }, []);

  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const beginListening = useCallback(() => {
    stopSpeaking();
    setSpeakingMsgId(null);
    setMicFeedback(null);
    setInterimTranscript('');

    const handle = startVoiceRecognition({
      onStart: () => setPhase('listening'),
      onInterim: (text) => setInterimTranscript(text),
      onFinal: (finalText) => {
        recognitionRef.current = null;
        setInterimTranscript('');
        if (finalText.trim()) {
          void sendMessageRef.current(finalText.trim());
        } else {
          setPhase('standby');
        }
      },
      onError: (reason) => {
        recognitionRef.current = null;
        setInterimTranscript('');
        setMicFeedback(reason);
        setPhase('standby');
      },
      onEnd: () => {
        recognitionRef.current = null;
        setPhase((cur) => (cur === 'listening' ? 'standby' : cur));
      },
    });

    if (handle) {
      recognitionRef.current = handle;
      setPhase('listening');
    }
  }, []);

  const closeAssistant = useCallback(() => {
    stopListening();
    stopSpeaking();
    setSpeakingMsgId(null);
    setPhase('standby');
    setOpen(false);
  }, [stopListening]);

  const focusAssistantInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      return;
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHORTCUT_STORAGE_KEY, shortcutPreset);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [shortcutPreset]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const action = matchAssistantShortcutAction(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          repeat: e.repeat,
        },
        {
          open: openRef.current,
          isInputFocused: document.activeElement === inputRef.current,
        },
        shortcutPreset,
      );

      if (!action) return;

      e.preventDefault();
      e.stopPropagation();

      if (action === 'open') {
        setOpen(true);
        focusAssistantInput();
      } else if (action === 'focus_input') {
        focusAssistantInput();
      } else if (action === 'close') {
        closeAssistant();
      } else if (action === 'toggle_voice') {
        if (phaseRef.current === 'listening') {
          stopListening();
        } else {
          beginListening();
        }
      } else if (action === 'toggle_hud') {
        setLiveHudExpanded((prev) => !prev);
      } else if (action === 'toggle_shortcuts_help') {
        setShowShortcutsPanel((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [shortcutPreset, closeAssistant, focusAssistantInput, stopListening, beginListening]);

  const speakWithHud = useCallback(
    (msgId: string, text: string) => {
      if (!voiceEnabled) {
        setPhase('standby');
        return;
      }
      speakText(text, {
        onStart: () => {
          setSpeakingMsgId(msgId);
          setPhase('speaking');
        },
        onEnd: () => {
          setSpeakingMsgId((cur) => (cur === msgId ? null : cur));
          setPhase('standby');
          if (handsFreeRef.current && openRef.current && micSupported) {
            window.setTimeout(() => {
              if (handsFreeRef.current && openRef.current) {
                beginListening();
              }
            }, 350);
          }
        },
      });
    },
    [voiceEnabled, micSupported, beginListening],
  );

  const handleToggleSpeakMessage = (msg: ChatMessage) => {
    if (speakingMsgId === msg.id) {
      stopSpeaking();
      setSpeakingMsgId(null);
      setPhase('standby');
      return;
    }
    speakText(msg.text, {
      onStart: () => {
        setSpeakingMsgId(msg.id);
        setPhase('speaking');
      },
      onEnd: () => {
        setSpeakingMsgId((cur) => (cur === msg.id ? null : cur));
        setPhase('standby');
      },
    });
  };

  const sendMessage = useCallback(
    async (textToSend: string) => {
      const clean = textToSend.trim();
      if (!clean || phase === 'thinking' || phase === 'executing') return;

      recognitionRef.current?.stop();
      recognitionRef.current = null;
      stopSpeaking();
      setMicFeedback(null);

      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: clean,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setPhase('thinking');

      try {
        const res = await apiRequest<{
          reply: string;
          actions?: JarvisAction[];
        }>('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            message: clean,
            history: messages.map((m) => ({ role: m.role, text: m.text })),
            context: {
              activeTab: activeTabLabel,
              recentWarnings: warnings,
            },
          }),
        });

        let executedTasks: string[] = [];
        if (Array.isArray(res.actions) && res.actions.length > 0) {
          setPhase('executing');
          if (onExecuteActions) {
            executedTasks = await onExecuteActions(res.actions);
          } else {
            executedTasks = res.actions.map(describeJarvisAction);
          }
        }

        const replyMsg: ChatMessage = {
          id: `m_${Date.now()}`,
          role: 'model',
          text: res.reply,
          executedTasks: executedTasks.length > 0 ? executedTasks : undefined,
        };
        setMessages((prev) => [...prev, replyMsg]);
        speakWithHud(replyMsg.id, res.reply);
      } catch (err) {
        const errText =
          err instanceof ApiError
            ? err.message
            : 'Could not reach the JARVIS assistant right now.';
        const errMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          role: 'model',
          text: errText,
        };
        setMessages((prev) => [...prev, errMsg]);
        speakWithHud(errMsg.id, errText);
      }
    },
    [phase, messages, activeTabLabel, warnings, onExecuteActions, speakWithHud],
  );

  sendMessageRef.current = sendMessage;

  const isBusy = phase === 'thinking' || phase === 'executing';
  const statusLabel: Record<JarvisPhase, string> = {
    standby: 'STANDBY · READY FOR VOICE OR TEXT',
    listening: 'LISTENING · SPEAK YOUR COMMAND',
    thinking: 'ANALYZING INTENT & QUESTION',
    executing: 'EXECUTING APP TASK...',
    speaking: 'SPEAKING VOICE RESPONSE',
  };

  return (
    <>
      {/* Floating Gold JARVIS Launcher + Keyboard Shortcut Hint */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5">
        {!open && (
          <kbd
            data-testid="ai-launcher-shortcut-badge"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0B1F3A]/95 text-[#F5C542] border border-[#F5C542]/45 shadow-lg font-mono text-[10px] font-bold tracking-wide pointer-events-none select-none"
          >
            {shortcutLabel}
          </kbd>
        )}
        <button
          type="button"
          aria-label="Open PRIME X AI Assistant"
          aria-keyshortcuts={getAriaKeyShortcuts(shortcutPreset)}
          title={`Open PRIME X AI Assistant (${shortcutLabel})`}
          onClick={() => {
            if (open) {
              closeAssistant();
            } else {
              setOpen(true);
            }
          }}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] shadow-2xl border-2 border-white/70 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {(phase === 'listening' || phase === 'speaking') && (
            <span className="absolute inset-0 rounded-full border-2 border-[#F5C542] animate-ping opacity-60 pointer-events-none" />
          )}
          {open ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
          {warnings.length > 0 && !open && (
            <span
              aria-label={`${warnings.length} active assistant alerts`}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border border-white"
            >
              {warnings.length}
            </span>
          )}
        </button>
      </div>

      {/* JARVIS Live View AI Chat Drawer */}
      {open && (
        <aside
          role="dialog"
          aria-label="PRIME X JARVIS Live AI Assistant"
          className="fixed bottom-22 right-4 sm:right-5 z-40 w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-white text-slate-900 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
        >
          {/* Header */}
          <div className="bg-[#0B1F3A] text-white px-4 py-3 flex items-center justify-between gap-2 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#F5C542]/15 border border-[#F5C542]/40 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[#F5C542]" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-xs sm:text-sm text-[#F5C542] truncate flex items-center gap-1.5">
                  <span>JARVIS LIVE AI</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-[10px] text-slate-300 truncate">
                  Active: {activeTabLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label="Keyboard shortcuts"
                aria-expanded={showShortcutsPanel}
                data-testid="ai-shortcuts-toggle"
                onClick={() => setShowShortcutsPanel((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  showShortcutsPanel
                    ? 'bg-[#F5C542]/20 text-[#F5C542] border border-[#F5C542]/40'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                <Keyboard className="w-3 h-3" />
                <kbd className="font-mono">{shortcutLabel}</kbd>
              </button>

              <button
                type="button"
                aria-label={liveHudExpanded ? 'Hide Live View HUD' : 'Show Live View HUD'}
                onClick={() => setLiveHudExpanded((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  liveHudExpanded
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>HUD</span>
              </button>

              <button
                type="button"
                aria-label={voiceEnabled ? 'Mute AI voice replies' : 'Enable AI voice replies'}
                data-testid="widget-voice-toggle"
                onClick={() => {
                  const next = !voiceEnabled;
                  setVoiceEnabled(next);
                  if (!next) {
                    stopSpeaking();
                    setSpeakingMsgId(null);
                    setPhase((cur) => (cur === 'speaking' ? 'standby' : cur));
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                  voiceEnabled
                    ? 'bg-[#F5C542]/20 text-[#F5C542] border border-[#F5C542]/40'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {voiceEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                <span>{voiceEnabled ? 'Voice' : 'Muted'}</span>
              </button>

              <button
                type="button"
                aria-label="Close AI Assistant"
                onClick={closeAssistant}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible Keyboard Shortcuts Bar & Binding Selector */}
          {showShortcutsPanel && (
            <div
              data-testid="ai-shortcuts-panel"
              className="bg-slate-900 text-slate-100 px-3.5 py-2.5 border-b border-white/10 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#F5C542]">
                  Keyboard Shortcuts
                </span>
                <div className="flex items-center gap-1" role="group" aria-label="Primary shortcut preset">
                  {SHORTCUT_PRESETS.map((preset) => {
                    const active = preset.id === shortcutPreset;
                    const badge = formatShortcutBadge(preset.id, isApplePlatform);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={active}
                        data-testid={`shortcut-preset-${preset.id}`}
                        onClick={() => setShortcutPreset(preset.id)}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold transition-colors ${
                          active
                            ? 'bg-[#F5C542] text-[#0B1F3A]'
                            : 'bg-white/10 text-slate-300 hover:bg-white/20'
                        }`}
                      >
                        {badge}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {shortcutHints.map((hint) => (
                  <div
                    key={hint.id}
                    className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white/5 text-[10px]"
                  >
                    <span className="text-slate-300 truncate">{hint.action}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 font-mono text-[10px] font-bold text-[#F5C542] shrink-0">
                      {hint.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* JARVIS Live View HUD Visualizer */}
          {liveHudExpanded && (
            <div
              data-testid="jarvis-live-hud"
              className="bg-gradient-to-r from-[#071529] via-[#0D2748] to-[#071529] text-white px-4 py-3 border-b border-cyan-400/20 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Animated Orb + Telemetry */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[#08172C] border border-cyan-400/40 shadow-[0_0_18px_rgba(34,211,238,0.22)]">
                    <div
                      className={`absolute inset-1 rounded-full border-2 border-dashed ${
                        phase === 'listening'
                          ? 'border-emerald-400 animate-spin'
                          : phase === 'thinking' || phase === 'executing'
                            ? 'border-[#F5C542] animate-spin'
                            : phase === 'speaking'
                              ? 'border-cyan-300 animate-pulse'
                              : 'border-cyan-500/40'
                      }`}
                    />
                    <Cpu
                      className={`w-4 h-4 ${
                        phase === 'listening'
                          ? 'text-emerald-300'
                          : phase === 'executing' || phase === 'thinking'
                            ? 'text-[#F5C542]'
                            : 'text-cyan-300'
                      }`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="font-mono text-[10px] tracking-wider font-bold text-cyan-300 truncate">
                      {statusLabel[phase]}
                    </div>
                    <div className="text-[11px] text-slate-200 truncate">
                      {interimTranscript
                        ? `"${interimTranscript}"`
                        : 'Say or type: "Open project store & order human following bot"'}
                    </div>
                    {/* Equalizer Visualizer Bars */}
                    <div className="flex items-center gap-1 mt-1 h-2.5" aria-hidden="true">
                      {[1, 2, 3, 4, 5, 6, 7].map((bar) => (
                        <span
                          key={bar}
                          className={`w-1 rounded-full transition-all duration-200 ${
                            phase === 'listening'
                              ? 'bg-emerald-400 animate-pulse h-2.5'
                              : phase === 'speaking'
                                ? 'bg-[#F5C542] animate-pulse h-2.5'
                                : phase === 'executing' || phase === 'thinking'
                                  ? 'bg-cyan-300 animate-bounce h-2'
                                  : 'bg-cyan-500/40 h-1'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Voice Controls */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    data-testid="jarvis-mic-btn"
                    aria-label={phase === 'listening' ? 'Stop voice listening' : 'Start voice command'}
                    onClick={() => {
                      if (phase === 'listening') {
                        stopListening();
                      } else {
                        beginListening();
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow ${
                      phase === 'listening'
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-[#071529] hover:brightness-105'
                    }`}
                  >
                    {phase === 'listening' ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        <span>Speak</span>
                      </>
                    )}
                  </button>

                  {micSupported && (
                    <button
                      type="button"
                      onClick={() => setHandsFreeLoop((v) => !v)}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
                        handsFreeLoop
                          ? 'text-emerald-300 bg-emerald-500/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Hands-Free: {handsFreeLoop ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
              </div>

              {micFeedback && (
                <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 px-2.5 py-1.5 text-[11px] text-amber-200">
                  {micFeedback}
                </div>
              )}
            </div>
          )}

          {/* Proactive Warning Banner */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Attention</span>
                </span>
                <button
                  type="button"
                  onClick={onClearWarnings}
                  className="text-[11px] font-semibold text-amber-700 hover:underline"
                >
                  Dismiss
                </button>
              </div>
              {warnings.slice(-2).map((w, i) => (
                <p key={i} className="text-xs text-amber-900 leading-snug">
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Chat Transcript */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-2 ${
                    msg.role === 'user'
                      ? 'bg-[#0B1F3A] text-white'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                  }`}
                >
                  <div>{msg.text}</div>

                  {msg.executedTasks && msg.executedTasks.length > 0 && (
                    <div
                      data-testid="jarvis-executed-tasks"
                      className="pt-1.5 border-t border-slate-100 flex flex-wrap gap-1.5"
                    >
                      {msg.executedTasks.map((task, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold"
                        >
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>{task}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.role === 'model' && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        aria-label={speakingMsgId === msg.id ? 'Stop speaking response' : 'Speak response aloud'}
                        onClick={() => handleToggleSpeakMessage(msg)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#0B1F3A]/75 hover:text-[#0B1F3A]"
                      >
                        <Volume2 className="w-3 h-3 text-[#D4AF37]" />
                        <span>{speakingMsgId === msg.id ? 'Speaking...' : 'Listen'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isBusy && (
              <div className="text-xs text-slate-500 italic">
                {phase === 'executing' ? 'JARVIS is executing your task...' : 'JARVIS is thinking...'}
              </div>
            )}
          </div>

          {/* Quick Action & Q&A Prompts */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex flex-nowrap sm:flex-wrap overflow-x-auto gap-1.5">
            {[
              'Open project store and order human following bot',
              'Search Obstacle Avoiding kit',
              'Open Music Studio',
              'What kits are available?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void sendMessage(q)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#D4AF37]/20 text-[11px] font-medium text-slate-700 transition-colors text-left whitespace-nowrap sm:whitespace-normal shrink-0 sm:shrink"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              aria-label="Ask PRIME X AI Assistant"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask a question or give a JARVIS command... (${shortcutLabel})`}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              aria-label="Send message"
              className="p-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
};
