/**
 * Simple client-side TTS wrapper using Web Speech API for immediate announcements.
 * Uses existing audio context? No, native SpeechSynthesis is standalone.
 * Falls back if not supported.
 */
export async function speakText(text: string): Promise<void> {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // natural for glasses
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    // Use glasses-friendly voice if available
    const voices = speechSynthesis.getVoices();
    const glassesVoice = voices.find(v => v.name.toLowerCase().includes('aoede') || v.lang.startsWith('en-IN')) || voices.find(v => v.lang.startsWith('en-'));
    if (glassesVoice) utterance.voice = glassesVoice;
    
    return new Promise((resolve) => {
      utterance.onend = () => resolve();
      speechSynthesis.speak(utterance);
    });
  } else {
    console.warn('SpeechSynthesis not supported');
  }
}

// Load voices async
export function loadVoicesWhenReady(onReady: () => void): void {
  speechSynthesis.onvoiceschanged = () => {
    if (speechSynthesis.getVoices().length) {
      onReady();
      speechSynthesis.onvoiceschanged = null;
    }
  };
}
