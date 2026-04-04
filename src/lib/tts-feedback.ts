/**
 * TTS Feedback Service using browser's SpeechSynthesis API.
 * Provides instant audio feedback independent of Gemini responses.
 */
export class TTSFeedback {
  private synth: SpeechSynthesis;
  private enabled: boolean = true;
  private defaultRate: number = 1.1;
  private defaultLang: string = "en-IN";

  constructor() {
    this.synth = window.speechSynthesis;
  }

  /**
   * Enable or disable TTS feedback
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.synth.cancel();
    }
  }

  /**
   * Check if TTS is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Speak text with optional priority
   * @param text - Text to speak
   * @param priority - 'high' interrupts current speech, 'low' queues
   */
  speak(text: string, priority: "low" | "high" = "low"): void {
    if (!this.enabled) return;

    if (priority === "high") {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.defaultRate;
    utterance.lang = this.defaultLang;
    this.synth.speak(utterance);
  }

  /**
   * Stop all speech
   */
  stop(): void {
    this.synth.cancel();
  }

  // ─────────────────────────────────────────────────────────────
  // QR Scanner specific messages
  // ─────────────────────────────────────────────────────────────

  scanningStart(): void {
    this.speak("Scanning for QR code");
  }

  qrDetected(): void {
    this.speak("QR code detected", "high");
  }

  noQrFound(): void {
    this.speak("No QR code found. Please point camera at QR code.", "high");
  }

  invalidQr(): void {
    this.speak("This is not a valid UPI QR code", "high");
  }

  // ─────────────────────────────────────────────────────────────
  // Payment specific messages
  // ─────────────────────────────────────────────────────────────

  paymentInfo(merchant: string, amount?: number): void {
    const merchantName = merchant || "Unknown";
    const amtText = amount ? `for ${amount} rupees` : "";
    this.speak(`Payment to ${merchantName} ${amtText}`.trim(), "high");
  }

  openingApp(): void {
    this.speak("Opening payment app");
  }

  paymentSuccess(): void {
    this.speak("Payment initiated successfully", "high");
  }

  paymentError(message: string): void {
    this.speak(message || "Payment failed", "high");
  }

  // ─────────────────────────────────────────────────────────────
  // Generic feedback
  // ─────────────────────────────────────────────────────────────

  error(message: string): void {
    this.speak(message, "high");
  }

  success(message: string): void {
    this.speak(message, "high");
  }

  info(message: string): void {
    this.speak(message, "low");
  }
}

// Singleton instance for app-wide use
export const tts = new TTSFeedback();
