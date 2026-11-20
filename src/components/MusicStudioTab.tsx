import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from 'lucide-react';
import musicCoverImg from '../assets/images/music_studio_cover_1794710117442.jpg';
import {
  LYRIC_STRUCTURE_TAGS,
  MUSIC_GENRE_CHIPS,
  MUSIC_MOOD_CHIPS,
  VOCAL_STYLE_OPTIONS,
  normalizeMusicDownloadFilename,
  splitLyricsForTimedPlayback,
} from '../lib/musicStudioLogic';
import type { MusicCreationMode, TimedLyricCue } from '../lib/musicStudioLogic';
import type { StudioMusicModelId } from '../lib/aiStudioLogic';
import { apiRequest, ApiError, getStoredAuthToken } from '../utils/api';
import type { GeneratedMusicTrack } from '../types';

interface MusicStudioTabProps {
  tracks: GeneratedMusicTrack[];
  onTrackCreated: (track: GeneratedMusicTrack) => void;
  onTrackDeleted: (id: string) => void;
  onSendToStudio: (track: GeneratedMusicTrack) => void;
  onAiWarning?: (msg: string) => void;
  externalLyricsDraft?: { id: number; text: string } | null;
  onConsumeExternalLyricsDraft?: () => void;
}

interface SpeechAlt {
  transcript?: string;
}
interface SpeechRes {
  isFinal?: boolean;
  0?: SpeechAlt;
}
interface SpeechEvt {
  resultIndex?: number;
  results?: ArrayLike<SpeechRes>;
}
interface SpeechInst {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechEvt) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const DEFAULT_CUSTOM_LYRICS = `[Intro]
(Warm analog synth pads rising in 4/4)

[Verse]
Neon reflections across midnight steel
Built with precision, every circuit is real

[Chorus]
Turn up the signal, let the horizon glow
Prime X frequencies moving the show`;

function formatSeconds(sec: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to encode recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

export const MusicStudioTab: React.FC<MusicStudioTabProps> = ({
  tracks,
  onTrackCreated,
  onTrackDeleted,
  onSendToStudio,
  onAiWarning,
  externalLyricsDraft,
  onConsumeExternalLyricsDraft,
}) => {
  const [mode, setMode] = useState<MusicCreationMode>('custom');
  const [title, setTitle] = useState('Midnight Telemetry');
  const [prompt, setPrompt] = useState(
    'Anthemic synthwave anthem with punchy arpeggiated bassline, shimmering lead synths, and euphoric chorus drop.',
  );
  const [lyrics, setLyrics] = useState(DEFAULT_CUSTOM_LYRICS);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([
    'Synthwave',
    'Future Bass',
  ]);
  const [customStyleTag, setCustomStyleTag] = useState('');
  const [mood, setMood] = useState<string>('Anthemic');
  const [vocalStyle, setVocalStyle] = useState<string>('Melodic Vocal');
  const [bpm, setBpm] = useState<number>(122);
  const [instrumental, setInstrumental] = useState<boolean>(false);
  const [model, setModel] = useState<StudioMusicModelId>('lyria-3-clip-preview');

  const [coverFileName, setCoverFileName] = useState<string | null>(null);
  const [coverImageBase64, setCoverImageBase64] = useState<string | null>(null);
  const [coverImageMimeType, setCoverImageMimeType] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [expandedLyricsId, setExpandedLyricsId] = useState<string | null>(null);
  const [singVocalsAloud, setSingVocalsAloud] = useState<boolean>(true);

  // Voice Input to Suno AI state
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [voiceMemoUrl, setVoiceMemoUrl] = useState<string | null>(null);
  const [voiceMemoMime, setVoiceMemoMime] = useState<string>('audio/webm');
  const [voiceMemoLabel, setVoiceMemoLabel] = useState<string>('');
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);

  const voiceRecRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceSpeechRef = useRef<SpeechInst | null>(null);

  // Audio player state
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement | null>(null);
  const spokenCueIdsRef = useRef<Set<string>>(new Set());

  const stopVocalSpeech = () => {
    spokenCueIdsRef.current.clear();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Safe guard for headless/non-TTS environments
      }
    }
  };

  useEffect(() => {
    if (!externalLyricsDraft) return;
    setMode('custom');
    setInstrumental(false);
    setLyrics(externalLyricsDraft.text);
    setStatusBanner('Loaded voice transcript into Suno AI Lyrics composer.');
    onConsumeExternalLyricsDraft?.();
  }, [externalLyricsDraft, onConsumeExternalLyricsDraft]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMeta = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      stopVocalSpeech();
      setPlayingTrackId(null);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMeta);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      stopVocalSpeech();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMeta);
      audio.removeEventListener('ended', onEnded);
      if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
      if (voiceRecRef.current && voiceRecRef.current.state !== 'inactive') {
        voiceRecRef.current.stop();
      }
      if (voiceSpeechRef.current) {
        try {
          voiceSpeechRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const playingTrack = useMemo(
    () => tracks.find((t) => t.id === playingTrackId) || null,
    [tracks, playingTrackId],
  );

  const activeLyricCues: TimedLyricCue[] = useMemo(() => {
    if (!playingTrack || playingTrack.instrumental || !playingTrack.lyrics) return [];
    return splitLyricsForTimedPlayback(
      playingTrack.lyrics,
      Math.max(duration || 0, playingTrack.durationSeconds || 12),
    );
  }, [playingTrack, duration]);

  const currentCue = useMemo(() => {
    if (activeLyricCues.length === 0) return null;
    return (
      activeLyricCues.find((c) => currentTime >= c.startSec && currentTime <= c.endSec) ||
      activeLyricCues[0]
    );
  }, [activeLyricCues, currentTime]);

  // Synchronized live singing cue articulation during playback for synthesized tracks
  useEffect(() => {
    if (!playingTrack || playingTrack.instrumental || !singVocalsAloud) return;
    const hasEmbeddedAiVocals =
      playingTrack.engine === 'lyria-3' ||
      Boolean(playingTrack.engineNote?.includes('Sung vocal performance'));
    if (hasEmbeddedAiVocals) return;
    if (!currentCue) return;
    if (spokenCueIdsRef.current.has(currentCue.id)) return;
    spokenCueIdsRef.current.add(currentCue.id);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utter = new SpeechSynthesisUtterance(currentCue.text);
        utter.rate = Math.max(0.88, Math.min(1.25, (playingTrack.bpm || 118) / 118));
        utter.pitch = playingTrack.vocalStyle?.toLowerCase().includes('male') ? 0.92 : 1.15;
        utter.volume = 0.92;
        window.speechSynthesis.speak(utter);
      } catch {
        // Safe guard if speechSynthesis is blocked
      }
    }
  }, [playingTrack, currentCue, singVocalsAloud]);

  const handleTogglePlay = (track: GeneratedMusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingTrackId === track.id) {
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
        stopVocalSpeech();
        setPlayingTrackId(null);
      }
      return;
    }

    stopVocalSpeech();
    audio.src = track.audioUrl;
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(track.durationSeconds || 12);
    setPlayingTrackId(track.id);
    audio.play().catch((err) => {
      stopVocalSpeech();
      setPlayingTrackId(null);
      onAiWarning?.(
        err instanceof Error ? err.message : 'Unable to play generated track audio.',
      );
    });
  };

  const handleSeek = (val: number) => {
    const audio = audioRef.current;
    if (!audio || !playingTrackId) return;
    stopVocalSpeech();
    audio.currentTime = val;
    setCurrentTime(val);
  };

  const handleDownloadMp3 = async (track: GeneratedMusicTrack) => {
    setDownloadingId(track.id);
    const filename = normalizeMusicDownloadFilename(track.title);
    try {
      const token = getStoredAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/music/tracks/${track.id}/download`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      if (!res.ok) {
        throw new Error('Server download fallback');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatusBanner(`Downloaded "${filename}" in MP3 format.`);
    } catch {
      const a = document.createElement('a');
      a.href = track.audioUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStartVoiceInput = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      const startMs = Date.now();
      voiceChunksRef.current = [];

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const elapsed = Math.max(1, Math.round((Date.now() - startMs) / 1000));
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        const b64 = await blobToDataUrl(blob);
        setVoiceMemoUrl(b64);
        setVoiceMemoMime(mimeType);
        setVoiceMemoLabel(`Voice Input (${elapsed}s)`);
      };

      // Live Web Speech API dictation directly into Lyrics (custom mode) or Song Description (simple mode)
      if (typeof window !== 'undefined') {
        const win = window as unknown as {
          SpeechRecognition?: new () => SpeechInst;
          webkitSpeechRecognition?: new () => SpeechInst;
        };
        const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
        if (SpeechCtor) {
          try {
            const speech = new SpeechCtor();
            speech.continuous = true;
            speech.interimResults = true;
            speech.lang = 'en-US';
            const priorText = mode === 'custom' ? lyrics : prompt;
            let finalAccum = '';
            speech.onresult = (ev) => {
              if (!ev.results) return;
              let interim = '';
              let finalChunk = '';
              for (let i = ev.resultIndex || 0; i < ev.results.length; i++) {
                const res = ev.results[i];
                const txt = res?.[0]?.transcript || '';
                if (res?.isFinal) finalChunk += `${txt} `;
                else interim += txt;
              }
              if (finalChunk) finalAccum += finalChunk;
              const spoken = (finalAccum + interim).trim();
              if (!spoken) return;
              if (mode === 'custom') {
                setInstrumental(false);
                setLyrics(priorText.trim() ? `${priorText.trim()}\n${spoken}` : `[Verse]\n${spoken}`);
              } else {
                setPrompt(priorText.trim() ? `${priorText.trim()} ${spoken}` : spoken);
              }
            };
            speech.onerror = () => {};
            speech.start();
            voiceSpeechRef.current = speech;
          } catch {
            // Audio capture continues cleanly for Gemini transcribe
          }
        }
      }

      voiceRecRef.current = rec;
      rec.start(250);
      setIsVoiceRecording(true);
      setVoiceSeconds(0);
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Microphone unavailable. You can also upload a voice recording file to convert to lyrics.',
      );
    }
  };

  const handleStopVoiceInput = () => {
    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceSpeechRef.current) {
      try {
        voiceSpeechRef.current.stop();
      } catch {
        // ignore
      }
      voiceSpeechRef.current = null;
    }
    if (voiceRecRef.current && voiceRecRef.current.state !== 'inactive') {
      voiceRecRef.current.stop();
    }
    setIsVoiceRecording(false);
  };

  const handleUploadVoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    const dataUrl = await blobToDataUrl(file);
    setVoiceMemoUrl(dataUrl);
    setVoiceMemoMime(file.type || 'audio/mp3');
    setVoiceMemoLabel(file.name);
    e.target.value = '';
  };

  const handleTranscribeVoiceIntoComposer = async () => {
    if (!voiceMemoUrl) return;
    setVoiceTranscribing(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ transcript: string }>('/api/ai/studio/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64: voiceMemoUrl,
          mimeType: voiceMemoMime,
          formatMode: mode === 'custom' ? 'lyrics' : 'plain',
        }),
      });
      const text = (res.transcript || '').trim();
      if (!text) {
        setErrorMsg('No speech detected in voice recording.');
        return;
      }
      if (mode === 'custom') {
        setInstrumental(false);
        setLyrics(text);
        setStatusBanner('Voice recording transcribed into Custom Lyrics!');
      } else {
        setPrompt(text);
        setStatusBanner('Voice recording transcribed into Song Description!');
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to transcribe voice audio.');
    } finally {
      setVoiceTranscribing(false);
    }
  };

  const toggleStyleChip = (chip: string) => {
    setSelectedStyles((prev) =>
      prev.includes(chip)
        ? prev.filter((item) => item !== chip)
        : prev.length >= 6
          ? [...prev.slice(1), chip]
          : [...prev, chip],
    );
  };

  const handleAddCustomTag = () => {
    const clean = customStyleTag.trim();
    if (!clean) return;
    if (!selectedStyles.includes(clean)) {
      setSelectedStyles((prev) => [...prev.slice(0, 5), clean]);
    }
    setCustomStyleTag('');
  };

  const insertStructureTag = (tag: string) => {
    setMode('custom');
    const textarea = lyricsRef.current;
    if (!textarea) {
      setLyrics((prev) => `${prev.trimEnd()}\n\n${tag}\n`);
      return;
    }
    const start = textarea.selectionStart ?? lyrics.length;
    const end = textarea.selectionEnd ?? lyrics.length;
    const prefix = start > 0 && lyrics[start - 1] !== '\n' ? '\n\n' : '';
    const insertion = `${prefix}${tag}\n`;
    const next = lyrics.slice(0, start) + insertion + lyrics.slice(end);
    setLyrics(next);
    setTimeout(() => {
      textarea.focus();
      const cursor = start + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 10);
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Cover reference must be a PNG, JPG, or WEBP image.');
      return;
    }
    setCoverFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx > -1) {
        setCoverPreviewUrl(dataUrl);
        setCoverImageBase64(dataUrl.slice(commaIdx + 1));
        setCoverImageMimeType(file.type || 'image/png');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusBanner(null);

    if (mode === 'simple' && !prompt.trim()) {
      setErrorMsg('Describe your song idea or use Voice Input first.');
      return;
    }
    if (mode === 'custom' && !instrumental && !lyrics.trim() && !prompt.trim()) {
      setErrorMsg('Enter custom lyrics, dictate with Voice Input, or enter a song description.');
      return;
    }

    setGenerating(true);
    try {
      const res = await apiRequest<{ track: GeneratedMusicTrack }>('/api/music/generate', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          title: title.trim() || undefined,
          prompt: prompt.trim() || lyrics.trim().slice(0, 120),
          lyrics: mode === 'custom' && !instrumental ? lyrics : '',
          styles: selectedStyles,
          mood,
          vocalStyle: instrumental ? 'Instrumental Only' : vocalStyle,
          bpm,
          instrumental,
          model,
          imageBase64: coverImageBase64 || undefined,
          imageMimeType: coverImageMimeType || undefined,
        }),
      });
      onTrackCreated(res.track);
      setExpandedLyricsId(res.track.id);
      setStatusBanner(
        res.track.engine === 'lyria-3'
          ? `Generated "${res.track.title}" as sung MP3 via Google Lyria 3 AI!`
          : `Created "${res.track.title}" sung MP3 master (${res.track.bpm} BPM · MP3 ready).`,
      );
      handleTogglePlay(res.track);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Unable to compose music track.';
      setErrorMsg(msg);
      onAiWarning?.(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleRemixTrack = (track: GeneratedMusicTrack) => {
    setMode(track.mode);
    setTitle(`${track.title} (Remix)`);
    setPrompt(track.prompt);
    if (track.lyrics) setLyrics(track.lyrics);
    setSelectedStyles(track.styles.length > 0 ? track.styles : ['Synthwave']);
    if (track.mood) setMood(track.mood);
    if (track.vocalStyle) setVocalStyle(track.vocalStyle);
    setBpm(track.bpm || 120);
    setInstrumental(Boolean(track.instrumental));
    setStatusBanner(`Loaded "${track.title}" into composer for Remix.`);
  };

  const handleExtendTrack = (track: GeneratedMusicTrack) => {
    setMode('custom');
    setTitle(`${track.title} (Extended)`);
    setModel('lyria-3-pro-preview');
    setLyrics(
      `${track.lyrics.trim()}\n\n[Bridge]\n(Build energy with sweeping risers and open hi-hats)\n\n[Drop]\n(Full peak anthem reprise)`,
    );
    setSelectedStyles(track.styles.length > 0 ? track.styles : ['Cinematic Orchestral']);
    setBpm(track.bpm || 120);
    setStatusBanner(`Prepared Extended arrangement for "${track.title}". Click Create Music to render.`);
  };

  const handleDeleteTrack = async (id: string) => {
    if (playingTrackId === id) {
      audioRef.current?.pause();
      stopVocalSpeech();
      setPlayingTrackId(null);
    }
    try {
      await apiRequest(`/api/music/tracks/${id}`, { method: 'DELETE' });
      onTrackDeleted(id);
    } catch (err) {
      onAiWarning?.(err instanceof ApiError ? err.message : 'Unable to delete track.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Banner Header */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-r from-[#0B1C36] via-[#0F2749] to-[#0B1C36] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shadow-xl">
        <div className="flex items-center gap-4">
          <img
            src={musicCoverImg}
            alt="Prime X Music Studio Cover"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-[#F5C542]/40 shrink-0 shadow-lg"
          />
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#F5C542] mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Song, Vocals &amp; Suno Creation Studio</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              PRIME X MUSIC STUDIO
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              Speak or type lyrics, generate sung vocal + instrumental songs in genuine MP3 format,
              control BPM &amp; genre tags, listen live with synced lyrics, and export directly to Prime X Studio.
            </p>
          </div>
        </div>

        {/* Active Playback Bar + Sing Vocals Toggle */}
        <div className="w-full lg:w-96 space-y-2 shrink-0">
          {playingTrack ? (
            <div className="rounded-xl bg-[#071222]/90 border border-[#F5C542]/45 px-3.5 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <AudioLines className="w-4 h-4 text-[#F5C542] shrink-0 animate-pulse" />
                  <span className="font-semibold text-white truncate">{playingTrack.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!playingTrack.instrumental && (
                    <button
                      type="button"
                      onClick={() => {
                        setSingVocalsAloud((v) => !v);
                        stopVocalSpeech();
                      }}
                      title="Toggle vocal cue performance"
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border ${
                        singVocalsAloud
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                          : 'bg-white/10 border-white/15 text-slate-300'
                      }`}
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{singVocalsAloud ? 'Vocals ON' : 'Vocals OFF'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleTogglePlay(playingTrack)}
                    className="p-1.5 rounded-lg bg-[#F5C542] text-[#08172C] hover:bg-[#D4AF37]"
                    aria-label="Pause track"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-300 tabular-nums">
                <span>{formatSeconds(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration || playingTrack.durationSeconds || 12)}
                  step={0.1}
                  value={Math.min(currentTime, duration || 12)}
                  onChange={(e) => handleSeek(Number(e.target.value))}
                  aria-label="Track seek bar"
                  className="flex-1 accent-[#F5C542] cursor-pointer"
                />
                <span>{formatSeconds(duration || playingTrack.durationSeconds || 12)}</span>
              </div>
              {currentCue && !playingTrack.instrumental && (
                <div
                  data-testid="active-sung-lyric-cue"
                  className="rounded-lg bg-[#0D213F] border border-[#F5C542]/30 px-2.5 py-1.5 text-[11px] text-[#F5C542] font-medium truncate"
                >
                  {currentCue.section ? (
                    <span className="font-mono text-slate-400 mr-1.5">{currentCue.section}</span>
                  ) : null}
                  <span>♪ {currentCue.text}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSingVocalsAloud((v) => !v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
                  singVocalsAloud
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    : 'bg-white/10 border-white/15 text-slate-300'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Sing Lyrics Aloud: {singVocalsAloud ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Suno-Style Composer Controls + Voice Input (5 cols) */}
        <form
          onSubmit={handleCreateMusic}
          className="xl:col-span-5 rounded-2xl border border-white/15 bg-[#0D213F] p-5 space-y-4 shadow-xl"
        >
          {/* Mode + Instrumental Header Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-[#08172C] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setMode('simple')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'simple'
                    ? 'bg-[#F5C542] text-[#08172C]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Simple Mode
              </button>
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'custom'
                    ? 'bg-[#F5C542] text-[#08172C]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Custom Lyrics &amp; Tags
              </button>
            </div>

            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200 bg-[#08172C] px-3 py-1.5 rounded-xl border border-white/10">
              <input
                type="checkbox"
                checked={instrumental}
                onChange={(e) => setInstrumental(e.target.checked)}
                className="accent-[#F5C542] rounded"
              />
              <span>Instrumental Only</span>
            </label>
          </div>

          {/* Voice Input Bar inside Suno AI */}
          <div
            data-testid="suno-voice-input-bar"
            className="rounded-xl bg-[#08172C] border border-[#D4AF37]/35 p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#F5C542] inline-flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>Voice Input to Suno AI</span>
              </span>
              <div className="flex items-center gap-1.5">
                {!isVoiceRecording ? (
                  <button
                    type="button"
                    data-testid="suno-voice-record-btn"
                    onClick={handleStartVoiceInput}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F5C542] text-[#08172C] text-[11px] font-bold hover:brightness-105"
                  >
                    <Mic className="w-3 h-3" />
                    <span>Speak Lyrics / Prompt</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopVoiceInput}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500 text-white text-[11px] font-bold"
                  >
                    <Square className="w-3 h-3" />
                    <span>Stop ({voiceSeconds}s)</span>
                  </button>
                )}

                <label
                  htmlFor="suno-voice-file-upload"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-[#F5C542]" />
                  <span>Voice File</span>
                  <input
                    id="suno-voice-file-upload"
                    type="file"
                    accept="audio/*"
                    onChange={handleUploadVoiceFile}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {voiceMemoUrl && (
              <div className="space-y-1.5 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-300 truncate">{voiceMemoLabel}</span>
                  <button
                    type="button"
                    disabled={voiceTranscribing}
                    onClick={handleTranscribeVoiceIntoComposer}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-bold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {voiceTranscribing ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Converting...</span>
                      </>
                    ) : (
                      <span>Convert Voice to {mode === 'custom' ? 'Lyrics' : 'Prompt'}</span>
                    )}
                  </button>
                </div>
                <audio src={voiceMemoUrl} controls className="w-full h-8" />
              </div>
            )}
          </div>

          {/* Track Title */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Track Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Solar Horizon Anthem"
              maxLength={64}
              className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#F5C542]"
            />
          </div>

          {/* Simple Prompt OR Custom Lyrics */}
          {mode === 'simple' ? (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Song Description / Story
              </label>
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what your song is about, the instruments, tempo, and vocal feel..."
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-[#F5C542]"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  {instrumental ? 'Arrangement Cue Notes' : 'Lyrics & Section Structure (Sung Aloud)'}
                </label>
                <span className="text-[10px] text-slate-400">Tap a section tag to insert</span>
              </div>

              {/* Suno Structure Tag Toolbar */}
              <div className="flex flex-wrap gap-1.5">
                {LYRIC_STRUCTURE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertStructureTag(tag)}
                    className="px-2 py-1 rounded-lg bg-[#08172C] hover:bg-[#D4AF37]/20 border border-white/10 hover:border-[#F5C542]/50 text-[11px] font-mono text-[#F5C542] transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <textarea
                ref={lyricsRef}
                data-testid="music-lyrics-textarea"
                rows={6}
                disabled={instrumental}
                value={
                  instrumental
                    ? '[Instrumental Mode Active — Vocals disabled, pure arrangement & melody focus]'
                    : lyrics
                }
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="[Verse]\nWrite or speak your lyrics here to hear the song sing them..."
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3.5 py-2.5 text-xs font-mono leading-relaxed text-white placeholder-slate-400 focus:outline-none focus:border-[#F5C542] disabled:opacity-60"
              />

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Sonic Direction Prompt
                </label>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Optional instrumentation & mix cues..."
                  className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#F5C542]"
                />
              </div>
            </div>
          )}

          {/* Style of Music Tag Builder */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Style of Music ({selectedStyles.length}/6 selected)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_GENRE_CHIPS.map((genre) => {
                const active = selectedStyles.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleStyleChip(genre)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'bg-[#F5C542] text-[#08172C] border-[#F5C542]'
                        : 'bg-[#08172C] text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customStyleTag}
                onChange={(e) => setCustomStyleTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="Add custom tag (e.g. Electric Sitar, 808 Glide)"
                className="flex-1 rounded-xl bg-[#08172C] border border-white/15 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#F5C542]"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Mood + Vocal + BPM Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Mood
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F5C542]"
              >
                {MUSIC_MOOD_CHIPS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Vocal Style
              </label>
              <select
                value={instrumental ? 'Instrumental Only' : vocalStyle}
                disabled={instrumental}
                onChange={(e) => setVocalStyle(e.target.value)}
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F5C542] disabled:opacity-60"
              >
                {VOCAL_STYLE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* BPM Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold uppercase tracking-wider text-[11px] text-slate-300">
                Tempo
              </span>
              <span className="font-mono font-bold text-[#F5C542] tabular-nums">{bpm} BPM</span>
            </div>
            <input
              type="range"
              min={65}
              max={175}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              aria-label="Tempo BPM slider"
              className="w-full accent-[#F5C542] cursor-pointer"
            />
          </div>

          {/* Model Toggle + Cover Image Optional Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Audio Engine Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as StudioMusicModelId)}
                className="w-full rounded-xl bg-[#08172C] border border-white/15 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#F5C542]"
              >
                <option value="lyria-3-clip-preview">Lyria 3 Clip (Fast Preview)</option>
                <option value="lyria-3-pro-preview">Lyria 3 Pro (Full Track)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                Cover Art Mood (Optional)
              </label>
              <label className="flex items-center justify-between gap-2 rounded-xl bg-[#08172C] border border-dashed border-white/25 hover:border-[#F5C542] px-3 py-2 text-xs text-slate-300 cursor-pointer">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <ImagePlus className="w-3.5 h-3.5 text-[#F5C542] shrink-0" />
                  <span className="truncate">{coverFileName || 'Upload Cover Image'}</span>
                </span>
                {coverPreviewUrl && (
                  <img
                    src={coverPreviewUrl}
                    alt="Cover preview"
                    className="w-5 h-5 rounded object-cover shrink-0"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {statusBanner && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusBanner}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={generating}
            data-testid="create-music-submit-btn"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] hover:brightness-105 text-[#08172C] font-display font-bold text-sm tracking-wide inline-flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Rendering Song &amp; Vocals (.MP3)...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Create Music (.MP3)</span>
              </>
            )}
          </button>
        </form>

        {/* RIGHT COLUMN: Created Tracks Library & Song Workspace (7 cols) */}
        <section className="xl:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Music className="w-5 h-5 text-[#F5C542]" />
                <span>My Created Tracks</span>
              </h2>
              <p className="text-xs text-slate-400">
                Play with sung vocals, inspect lyrics, remix settings, send to Studio, or download MP3.
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-white/10 text-xs font-mono font-bold text-[#F5C542] tabular-nums">
              {tracks.length} {tracks.length === 1 ? 'Track' : 'Tracks'}
            </span>
          </div>

          {tracks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-[#0D213F]/60 p-10 text-center space-y-3">
              <Music className="w-10 h-10 text-[#F5C542]/70 mx-auto" />
              <div className="font-display text-base font-bold text-white">
                No tracks generated yet
              </div>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                Write or speak lyrics via Voice Input, pick your genres, and press Create Music to compose and download an MP3 track.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {tracks.map((track) => {
                const isPlayingThis = playingTrackId === track.id;
                const lyricsOpen = expandedLyricsId === track.id;

                return (
                  <article
                    key={track.id}
                    data-testid={`music-track-card-${track.id}`}
                    className={`rounded-2xl border transition-colors bg-[#0D213F] p-4 space-y-3 ${
                      isPlayingThis
                        ? 'border-[#F5C542] shadow-lg shadow-[#F5C542]/10'
                        : 'border-white/15 hover:border-white/30'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-white/15 shrink-0 bg-[#08172C]">
                          <img
                            src={track.coverUrl || musicCoverImg}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleTogglePlay(track)}
                            aria-label={isPlayingThis ? `Pause ${track.title}` : `Play ${track.title}`}
                            className="absolute inset-0 bg-[#08172C]/55 hover:bg-[#08172C]/35 flex items-center justify-center text-[#F5C542] transition-colors"
                          >
                            {isPlayingThis ? (
                              <Pause className="w-6 h-6 fill-current" />
                            ) : (
                              <Play className="w-6 h-6 fill-current" />
                            )}
                          </button>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-bold text-white truncate">
                              {track.title}
                            </h3>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5C542]/15 border border-[#F5C542]/30 text-[10px] font-bold text-[#F5C542]">
                              <Cpu className="w-3 h-3" />
                              {track.engine === 'lyria-3' ? 'Lyria 3 AI' : 'Studio Master'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-mono font-bold text-emerald-300">
                              MP3 · 192kbps
                            </span>
                            {track.instrumental && (
                              <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/30 text-[10px] font-bold text-sky-300">
                                Instrumental
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-300">
                            <span className="font-mono text-[#F5C542]">{track.bpm} BPM</span>
                            <span>·</span>
                            <span>{formatSeconds(track.durationSeconds)}</span>
                            {track.mood && (
                              <>
                                <span>·</span>
                                <span>{track.mood}</span>
                              </>
                            )}
                            {track.styles.slice(0, 4).map((s) => (
                              <span
                                key={s}
                                className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-slate-200"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Track Action Strip */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePlay(track)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                            isPlayingThis
                              ? 'bg-[#F5C542] text-[#08172C]'
                              : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {isPlayingThis ? (
                            <>
                              <Pause className="w-3.5 h-3.5" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" /> Play Song
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemixTrack(track)}
                          title="Reuse prompt & tags"
                          className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Remix
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExtendTrack(track)}
                          title="Extend arrangement"
                          className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Extend
                        </button>

                        <button
                          type="button"
                          onClick={() => onSendToStudio(track)}
                          title="Send audio to Prime X Studio timeline"
                          className="px-2.5 py-1.5 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#F5C542]/40 text-xs font-bold text-[#F5C542] inline-flex items-center gap-1"
                        >
                          <Film className="w-3.5 h-3.5" /> Use in Studio
                        </button>

                        <button
                          type="button"
                          data-testid={`download-mp3-${track.id}`}
                          disabled={downloadingId === track.id}
                          onClick={() => handleDownloadMp3(track)}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-xs font-bold text-emerald-300 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {downloadingId === track.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>Download MP3</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTrack(track.id)}
                          aria-label={`Delete ${track.title}`}
                          className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {track.engineNote && (
                      <div className="text-[11px] text-slate-400 italic">
                        {track.engineNote}
                      </div>
                    )}

                    {/* Expandable Lyrics Sheet */}
                    {track.lyrics && (
                      <div className="border-t border-white/10 pt-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLyricsId(lyricsOpen ? null : track.id)
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F5C542] hover:underline"
                        >
                          {lyricsOpen ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Hide Lyrics &amp; Structure
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> View Lyrics &amp; Structure
                            </>
                          )}
                        </button>

                        {lyricsOpen && (
                          <pre className="mt-2 p-3 rounded-xl bg-[#08172C] border border-white/10 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {track.lyrics}
                          </pre>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
