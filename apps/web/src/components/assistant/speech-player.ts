export type SpeechItem = { id: string; text: string; lang: 'vi' | 'en'; audio?: string; mime?: string };

/**
 * Plays checked assistant speech in order. Server audio goes through the page's AudioContext so
 * the interruption detector can compare it with the microphone and the browser's echo
 * cancellation removes it; without server audio the browser's own speech synthesis is used.
 */
export class SpeechPlayer {
  private queue: SpeechItem[] = [];
  private element?: HTMLAudioElement;
  private utterance?: SpeechSynthesisUtterance;
  private playing = false;
  readonly analyser?: AnalyserNode;

  constructor(private readonly context?: AudioContext) {
    if (context) {
      try {
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.connect(context.destination);
      } catch {
        this.analyser = undefined;
      }
    }
  }

  get speaking(): boolean {
    return this.playing;
  }

  enqueue(item: SpeechItem): void {
    this.queue.push(item);
    if (!this.playing) this.next();
  }

  /** Barge-in: drop the current sentence and everything queued after it. */
  stop(): void {
    this.queue = [];
    this.playing = false;
    if (this.element) {
      this.element.onended = null;
      this.element.onerror = null;
      this.element.pause();
      this.element.removeAttribute('src');
    }
    if (this.utterance && typeof window !== 'undefined' && window.speechSynthesis) {
      this.utterance.onend = null;
      this.utterance.onerror = null;
      window.speechSynthesis.cancel();
    }
    this.utterance = undefined;
  }

  private next(): void {
    const item = this.queue.shift();
    this.playing = !!item;
    if (!item) return;
    const done = () => this.next();
    if (item.audio) {
      if (!this.element) {
        this.element = new Audio();
        if (this.context && this.analyser) {
          try {
            this.context.createMediaElementSource(this.element).connect(this.analyser);
          } catch {
            // Plays directly when the element cannot be routed through the context.
          }
        }
      }
      const element = this.element;
      element.onended = done;
      element.onerror = done;
      element.src = `data:${item.mime || 'audio/mp4'};base64,${item.audio}`;
      void this.context?.resume().catch(() => undefined);
      void element.play().catch(done);
      return;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis) return done();
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang === 'en' ? 'en-US' : 'vi-VN';
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-') === utterance.lang);
    if (voice) utterance.voice = voice;
    utterance.onend = done;
    utterance.onerror = done;
    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }
}
