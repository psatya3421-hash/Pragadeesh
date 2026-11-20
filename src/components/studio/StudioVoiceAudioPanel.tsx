import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileAudio,
  Loader2,
  Mic,
  Music,
  Plus,
  Square,
  Upload,
} from 'lucide-react';
import { ApiError, apiRequest } from '../../utils/api';

interface StudioVoiceAudioPanelProps {
  onInsertTranscriptOverlay: (text: string) => void;
  onSendToSunoLyrics?: (lyricsText: string) => void;
}

interface BrowserSpeechRecognitionAlternative {
  transcript?: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal?: boolean;
  0?: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex?: number;
  results?: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type BrowserSpeechConstructor = new () => BrowserSpeechRecognitionInstance;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to encode audio blob.'));
    reader.readAsDataURL(blob);
  });
}

export const StudioVoiceAudioPanel: React.FC<StudioVoiceAudioPanelProps> = ({
  onInsertTranscriptOverlay,
  onSendToSunoLyrics,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState('audio/webm');
  const [audioLabel, setAudioLabel] = useState('');
  const [formatMode, setFormatMode] = useState<'plain' | 'timestamps' | 'lyrics'>('plain');
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [copied, setCopied] = useState(false);
  const [liveSpeechSupported, setLiveSpeechSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordStartMsRef = useRef<number>(0);
  const recognitionRef = useRef<BrowserSpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const win = window as unknown as {
        SpeechRecognition?: BrowserSpeechConstructor;
        webkitSpeechRecognition?: BrowserSpeechConstructor;
      };
      setLiveSpeechSupported(Boolean(win.SpeechRecognition || win.webkitSpeechRecognition));
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleStartMicRecord = async () => {
    setTranscribeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      recordStartMsRef.current = Date.now();

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const elapsedSec = Math.max(
          1,
          Math.round((Date.now() - recordStartMsRef.current) / 1000),
        );
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const b64 = await blobToBase64(blob);
        setAudioDataUrl(b64);
        setAudioMime(mimeType);
        setAudioLabel(`Microphone Recording (${elapsedSec}s)`);
      };

      // Optional live Web Speech dictation preview while recording
      if (typeof window !== 'undefined') {
        const win = window as unknown as {
          SpeechRecognition?: BrowserSpeechConstructor;
          webkitSpeechRecognition?: BrowserSpeechConstructor;
        };
        const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
        if (SpeechCtor) {
          try {
            const speech = new SpeechCtor();
            speech.continuous = true;
            speech.interimResults = true;
            speech.lang = 'en-US';
            const baseSeed = transcriptText.trim();
            let accumulatedFinal = '';
            speech.onresult = (ev) => {
              const results = ev.results;
              if (!results) return;
              let interim = '';
              let finalChunk = '';
              for (let i = ev.resultIndex || 0; i < results.length; i++) {
                const res = results[i];
                const txt = res?.[0]?.transcript || '';
                if (res?.isFinal) finalChunk += `${txt} `;
                else interim += txt;
              }
              if (finalChunk) accumulatedFinal += finalChunk;
              const combined = [baseSeed, (accumulatedFinal + interim).trim()]
                .filter(Boolean)
                .join('\n');
              if (combined) setTranscriptText(combined);
            };
            speech.onerror = () => {
              // Silent fallback to server transcription
            };
            speech.start();
            recognitionRef.current = speech;
          } catch {
            // Silent fallback to audio file capture + gemini-3.5-transcribe
          }
        }
      }

      mediaRecorderRef.current = rec;
      rec.start(250);
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : 'Unable to access microphone for recording.',
      );
    }
  };

  const handleStopMicRecord = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleUploadAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTranscribeError(null);
    const dataUrl = await blobToBase64(file);
    setAudioDataUrl(dataUrl);
    setAudioMime(file.type || 'audio/mp3');
    setAudioLabel(file.name);
    e.target.value = '';
  };

  const handleRunTranscribe = async () => {
    if (!audioDataUrl) {
      setTranscribeError('Record microphone audio or upload an audio file first.');
      return;
    }
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await apiRequest<{ transcript: string }>('/api/ai/studio/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64: audioDataUrl,
          mimeType: audioMime,
          formatMode,
        }),
      });
      setTranscriptText(res.transcript || 'No speech detected in audio.');
    } catch (err) {
      setTranscribeError(err instanceof ApiError ? err.message : 'Audio transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopyTranscript = () => {
    if (!transcriptText) return;
    navigator.clipboard?.writeText(transcriptText).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      data-testid="studio-voice-audio-panel"
      className="max-w-4xl mx-auto"
    >
      <section className="rounded-2xl bg-[#091930]/95 border border-white/15 p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[#F5C542] text-xs font-mono uppercase tracking-wider">
              <FileAudio className="w-4 h-4" />
              <span>Voice Input &amp; Speech-to-Text</span>
            </div>
            <h3 className="font-display text-base font-bold text-white mt-0.5">
              Voice Recorder, Lyrics Dictation &amp; Transcription
            </h3>
          </div>
          <span className="px-2 py-1 rounded-md bg-[#061121] border border-white/10 text-[10px] font-mono text-slate-300">
            gemini-3.5-transcribe
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isRecording ? (
            <button
              type="button"
              data-testid="voice-mic-record-btn"
              onClick={handleStartMicRecord}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F5C542] text-[#0B1F3A] text-xs font-bold hover:brightness-105"
            >
              <Mic className="w-4 h-4" />
              <span>{liveSpeechSupported ? 'Live Voice Input' : 'Record Microphone'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopMicRecord}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Recording ({recordSeconds}s)</span>
            </button>
          )}

          <label
            htmlFor="studio-transcribe-upload"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Upload Audio</span>
            <input
              id="studio-transcribe-upload"
              type="file"
              accept="audio/*"
              onChange={handleUploadAudioFile}
              className="sr-only"
            />
          </label>

          <select
            aria-label="Transcription format"
            value={formatMode}
            onChange={(e) =>
              setFormatMode(e.target.value as 'plain' | 'timestamps' | 'lyrics')
            }
            className="px-2.5 py-2 rounded-xl bg-[#061121] border border-white/15 text-xs text-white"
          >
            <option value="plain">Clean Transcript</option>
            <option value="timestamps">Timestamped Subtitles</option>
            <option value="lyrics">Suno Song Lyrics Format</option>
          </select>
        </div>

        {audioDataUrl && (
          <div className="rounded-xl bg-[#061121] border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-200 font-semibold truncate">{audioLabel}</span>
              <button
                type="button"
                disabled={transcribing}
                onClick={handleRunTranscribe}
                className="px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#0B1F3A] font-bold inline-flex items-center gap-1 disabled:opacity-60"
              >
                {transcribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Transcribing...</span>
                  </>
                ) : (
                  <span>Transcribe via Gemini</span>
                )}
              </button>
            </div>
            <audio src={audioDataUrl} controls className="w-full h-9" />
          </div>
        )}

        {transcribeError && (
          <div className="rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-xs text-red-200">
            {transcribeError}
          </div>
        )}

        <div className="flex-1 flex flex-col gap-2">
          <label
            htmlFor="studio-transcript-output"
            className="text-xs font-semibold text-slate-300"
          >
            Voice Dictation &amp; Transcribed Output
          </label>
          <textarea
            id="studio-transcript-output"
            rows={7}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Click Live Voice Input to speak or upload an audio clip, then transcribe or send directly to Suno AI Lyrics..."
            className="w-full flex-1 rounded-xl bg-[#061121] border border-white/15 p-3 text-xs text-white focus:border-[#F5C542] focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!transcriptText.trim()}
              onClick={handleCopyTranscript}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold disabled:opacity-40"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            {onSendToSunoLyrics && (
              <button
                type="button"
                data-testid="send-voice-to-suno-btn"
                disabled={!transcriptText.trim()}
                onClick={() => onSendToSunoLyrics(transcriptText)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-bold disabled:opacity-40"
              >
                <Music className="w-3.5 h-3.5" />
                <span>Send to Suno AI Lyrics</span>
              </button>
            )}
            <button
              type="button"
              disabled={!transcriptText.trim()}
              onClick={() => onInsertTranscriptOverlay(transcriptText)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F5C542] text-[#0B1F3A] text-xs font-bold disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Insert as Text Overlay</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
