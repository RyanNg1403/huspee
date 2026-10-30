/** Stateful RMS detector; feed samples using a monotonic clock. */
export class InterruptionDetector {
  private startedAt?: number;
  private floor = 0;
  private samples = 0;
  private aboveSince?: number;
  private reported = false;

  sample(now: number, mic: number, remote: number, assistantPlaying: boolean): number | undefined {
    this.startedAt ??= now;
    if (now - this.startedAt < 1000) {
      if (!assistantPlaying && remote < 0.01) {
        this.floor = (this.floor * this.samples + mic) / (this.samples + 1);
        this.samples++;
      }
      return undefined;
    }
    const speech = assistantPlaying && mic > Math.max(0.015, this.floor * 2.5 + 0.008) && mic > remote * 0.8;
    if (!speech) {
      this.aboveSince = undefined;
      this.reported = false;
      return undefined;
    }
    this.aboveSince ??= now;
    if (!this.reported && now - this.aboveSince >= 300) {
      this.reported = true;
      return this.aboveSince;
    }
    return undefined;
  }
}
