import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, Trash2, Volume2, VolumeX } from 'lucide-react';
import { ApiError, apiRequest } from '../../utils/api';
import { speakText, stopSpeaking } from '../../utils/speech';
import {
  STUDIO_CHAT_MODELS,
  STUDIO_CHAT_PERSONAS,
} from '../../lib/aiStudioLogic';
import type { StudioChatModelId } from '../../lib/aiStudioLogic';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
}

export const StudioGeminiChatPanel: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState<StudioChatModelId>('gemini-4-hydrogen');
  const [personaId, setPersonaId] = useState<string>(STUDIO_CHAT_PERSONAS[0].id);
  const [systemInstruction, setSystemInstruction] = useState<string>(
    STUDIO_CHAT_PERSONAS[0].instruction,
  );
  const [input, setInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      id: 'welcome_studio_chat',
      role: 'model',
      model: 'gemini-4-hydrogen',
      text: 'Welcome to PRIME X Studio Chat. Choose a specialized Gemini model (Hydrogen, Carbon, Argon, or 3.1 Flash Lite) and set a system role above to plan scripts, color grades, 3D rigs, or soundtracks.',
    },
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const handleSelectPersona = (id: string) => {
    setPersonaId(id);
    const found = STUDIO_CHAT_PERSONAS.find((p) => p.id === id);
    if (found) setSystemInstruction(found.instruction);
  };

  const handleToggleSpeak = (m: ChatTurn) => {
    if (speakingMsgId === m.id) {
      stopSpeaking();
      setSpeakingMsgId(null);
      return;
    }
    speakText(m.text, {
      onStart: () => setSpeakingMsgId(m.id),
      onEnd: () => setSpeakingMsgId((cur) => (cur === m.id ? null : cur)),
    });
  };

  const handleSend = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || sending) return;

    const userMsg: ChatTurn = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textOverride) setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await apiRequest<{ reply: string; model: string }>('/api/ai/studio/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          systemInstruction,
          message: trimmed,
          history: messages
            .filter((m) => m.id !== 'welcome_studio_chat')
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const replyTurn: ChatTurn = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: res.reply,
        model: res.model,
      };
      setMessages((prev) => [...prev, replyTurn]);
      if (voiceEnabled) {
        speakText(res.reply, {
          onStart: () => setSpeakingMsgId(replyTurn.id),
          onEnd: () => setSpeakingMsgId((cur) => (cur === replyTurn.id ? null : cur)),
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chat request failed.');
    } finally {
      setSending(false);
    }
  };

  const activeModelMeta =
    STUDIO_CHAT_MODELS.find((m) => m.id === selectedModel) || STUDIO_CHAT_MODELS[0];

  return (
    <div
      data-testid="studio-gemini-chat-panel"
      className="grid grid-cols-1 lg:grid-cols-12 gap-5"
    >
      {/* Left Configuration Column */}
      <aside className="lg:col-span-4 rounded-2xl bg-[#091930]/95 border border-white/15 p-5 space-y-4">
        <div className="border-b border-white/10 pb-3">
          <div className="flex items-center gap-2 text-[#F5C542] text-xs font-mono uppercase tracking-wider">
            <Bot className="w-4 h-4" />
            <span>Multi-Model Studio Chat</span>
          </div>
          <h3 className="font-display text-base font-bold text-white mt-0.5">
            Model &amp; Role Settings
          </h3>
        </div>

        {/* Model Picker */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-200">Select Gemini Model</div>
          <div className="space-y-1.5">
            {STUDIO_CHAT_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                  selectedModel === m.id
                    ? 'bg-[#D4AF37]/20 border-[#F5C542] text-white'
                    : 'bg-[#061121] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{m.label}</span>
                  <span className="text-[10px] font-mono text-[#F5C542]">{m.tierHint}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Role / System Instruction */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="text-xs font-semibold text-slate-200">Assistant Role Preset</div>
          <div className="grid grid-cols-2 gap-1.5">
            {STUDIO_CHAT_PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPersona(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  personaId === p.id
                    ? 'bg-[#F5C542] text-[#0B1F3A] border-[#F5C542]'
                    : 'bg-[#061121] text-slate-300 border-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label className="block space-y-1 pt-1">
            <span className="text-[11px] font-semibold text-slate-300">
              System Instruction
            </span>
            <textarea
              aria-label="Chat system instruction"
              rows={4}
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              className="w-full rounded-xl bg-[#061121] border border-white/15 p-2.5 text-xs text-white focus:border-[#F5C542] focus:outline-none"
            />
          </label>
        </div>
      </aside>

      {/* Right Scrollable Conversation Thread */}
      <section className="lg:col-span-8 rounded-2xl bg-[#091930]/95 border border-white/15 flex flex-col h-[600px]">
        <div className="px-5 py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F5C542]" />
              <span>{activeModelMeta.label}</span>
              <span className="px-2 py-0.5 rounded-md bg-[#061121] border border-[#D4AF37]/30 font-mono text-[10px] text-[#F5C542]">
                {selectedModel}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate max-w-md">
              Role: {systemInstruction}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="studio-chat-voice-toggle"
              aria-label={voiceEnabled ? 'Mute Studio voice replies' : 'Enable Studio voice replies'}
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
                if (!next) {
                  stopSpeaking();
                  setSpeakingMsgId(null);
                }
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                voiceEnabled
                  ? 'bg-[#D4AF37]/20 border-[#F5C542] text-[#F5C542]'
                  : 'bg-white/10 border-white/10 text-slate-300'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{voiceEnabled ? 'Voice On' : 'Muted'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setSpeakingMsgId(null);
                setMessages([
                  {
                    id: 'welcome_studio_chat',
                    role: 'model',
                    model: selectedModel,
                    text: 'Conversation cleared. Ready for your next prompt.',
                  },
                ]);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-slate-200 font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Thread</span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#F5C542] text-[#0B1F3A] font-medium rounded-br-sm'
                    : 'bg-[#061121] border border-white/10 text-slate-100 rounded-bl-sm'
                }`}
              >
                {m.role === 'model' && m.model && (
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[10px] font-mono text-[#F5C542]">{m.model}</span>
                    <button
                      type="button"
                      aria-label={speakingMsgId === m.id ? 'Stop speaking response' : 'Speak response aloud'}
                      onClick={() => handleToggleSpeak(m)}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-300 hover:text-[#F5C542]"
                    >
                      <Volume2 className="w-3 h-3 text-[#F5C542]" />
                      <span>{speakingMsgId === m.id ? 'Speaking...' : 'Listen'}</span>
                    </button>
                  </div>
                )}
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-[#061121] border border-white/10 px-4 py-2.5 text-xs text-slate-300 inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F5C542]" />
                <span>Thinking with {selectedModel}...</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="px-5 pt-2 flex flex-wrap gap-1.5">
          {[
            'Write a 15-second launch trailer script',
            'Suggest a Lyria music prompt for a luxury tech reveal',
            'Design a 3-point lighting shot list for 9:16 video',
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => handleSend(q)}
              className="px-2.5 py-1 rounded-lg bg-[#061121] border border-white/10 hover:border-[#F5C542]/40 text-[11px] text-slate-300"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-4 flex gap-2.5"
        >
          <input
            type="text"
            aria-label="Studio chat message"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask ${activeModelMeta.label}...`}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#061121] border border-white/15 text-xs text-white focus:border-[#F5C542] focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>
      </section>
    </div>
  );
};
