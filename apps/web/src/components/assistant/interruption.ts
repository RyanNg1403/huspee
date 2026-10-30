/**
 * Detects the buyer talking over the assistant; feed samples using a monotonic clock. With a Silero
 * speech probability only speech counts, so noise does not; without one, loudness alone is used.
 */
export class InterruptionDetector {
  private startedAt?: number;
  private floor = 0;
  private samples = 0;
  private aboveSince?: number;
  private reported = false;
  /** Speech over the assistant has lasted long enough to turn it down while we wait to be sure. */
  ducking = false;

  sample(
    now: number,
    mic: number,
    remote: number,
    assistantPlaying: boolean,
    speechProbability?: number,
  ): number | undefined {
    this.startedAt ??= now;
    if (now - this.startedAt < 1000) {
      if (!assistantPlaying && remote < 0.01) {
        this.floor = (this.floor * this.samples + mic) / (this.samples + 1);
        this.samples++;
      }
      return undefined;
    }
    const voiced =
      speechProbability === undefined
        ? mic > Math.max(0.015, this.floor * 2.5 + 0.008)
        : speechProbability >= 0.6 && mic > Math.max(0.008, this.floor * 1.5);
    // The echo guard stays: Silero would also call the assistant's own voice leaking into the mic speech.
    const speech = assistantPlaying && voiced && mic > remote * 0.8;
    if (!speech) {
      this.aboveSince = undefined;
      this.reported = false;
      this.ducking = false;
      return undefined;
    }
    this.aboveSince ??= now;
    this.ducking = now - this.aboveSince >= 120;
    if (!this.reported && now - this.aboveSince >= 300) {
      this.reported = true;
      return this.aboveSince;
    }
    return undefined;
  }
}

/**
 * Cuts the assistant's audio in the browser as soon as the buyer talks over it, without waiting for
 * the server to notice: turned down after ~120 ms of speech, muted once speech is sustained. Sound
 * returns with the assistant's next turn, once the cut-off speech has gone quiet for 600 ms (whatever
 * plays next is new), or after 2 s if no buyer turn followed (a cough, a bump).
 */
export class BargeInGate {
  private mutedAt?: number;
  private heardBuyer = false;
  private quietSince?: number;

  /** Output volume (0 to 1) for this sample; `remoteQuiet` means the assistant's stream is silent. */
  sample(now: number, ducking: boolean, detected: boolean, remoteQuiet: boolean): number {
    if (detected) {
      this.mutedAt = now;
      this.heardBuyer = false;
    }
    this.quietSince = remoteQuiet ? (this.quietSince ?? now) : undefined;
    if (this.mutedAt !== undefined) {
      const cutOffEnded = this.quietSince !== undefined && now - this.quietSince >= 600;
      const falseAlarm = !this.heardBuyer && now - this.mutedAt >= 2000;
      if (!cutOffEnded && !falseAlarm) return 0;
      this.mutedAt = undefined;
    }
    return ducking ? 0.2 : 1;
  }
  buyerTurn(): void {
    this.heardBuyer = true;
  }
  assistantTurn(): void {
    this.mutedAt = undefined;
    this.heardBuyer = false;
  }
}
