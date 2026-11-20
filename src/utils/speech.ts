export interface SpeakTextOptions {
  rate?: number;
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function stripSpeechFormatting(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore browser speech cancellation failures
  }
}

export function speakText(rawText: string, options?: SpeakTextOptions): boolean {
  const clean = stripSpeechFormatting(rawText);
  if (!clean) return false;

  if (!isSpeechSynthesisSupported()) {
    options?.onStart?.();
    window.setTimeout(() => options?.onEnd?.(), 150);
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-IN';
    utterance.rate = options?.rate ?? 1.02;
    utterance.pitch = options?.pitch ?? 1.0;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const preferredVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('en-in')) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('en-'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };
    utterance.onend = () => {
      options?.onEnd?.();
    };
    utterance.onerror = () => {
      options?.onEnd?.();
    };

    options?.onStart?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    options?.onEnd?.();
    return false;
  }
}
