export interface VoiceRecognitionCallbacks {
  onInterim?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (reason: string) => void;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isVoiceRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function startVoiceRecognition(
  callbacks: VoiceRecognitionCallbacks,
): { stop: () => void } | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    callbacks.onError?.(
      'Voice microphone input requires Chromium/Edge/Safari Speech Recognition support. You can also type commands directly below.',
    );
    return null;
  }

  try {
    const recognition = new Ctor();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalEmitted = false;

    recognition.onstart = () => {
      callbacks.onStart?.();
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        const text = res[0]?.transcript || '';
        if (res.isFinal) {
          finalChunk += `${text} `;
        } else {
          interim += `${text} `;
        }
      }
      const cleanInterim = interim.trim();
      const cleanFinal = finalChunk.trim();
      if (cleanInterim) {
        callbacks.onInterim?.(cleanInterim);
      }
      if (cleanFinal && !finalEmitted) {
        finalEmitted = true;
        callbacks.onFinal?.(cleanFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const msg =
        event.error === 'not-allowed'
          ? 'Microphone access was denied. Enable mic permission or type your command.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Tap the mic and speak clearly.'
            : `Voice recognition stopped (${event.error}).`;
      callbacks.onError?.(msg);
    };

    recognition.onend = () => {
      callbacks.onEnd?.();
    };

    recognition.start();
    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // Ignore stop errors if already ended
        }
      },
    };
  } catch {
    callbacks.onError?.('Unable to initialize microphone recognition in this browser.');
    return null;
  }
}
