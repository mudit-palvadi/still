type ToneOptions = {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
};

/**
 * Tiny Web Audio instrument. No audio files, no network, no excuses.
 * The context is created lazily on the first click so browsers stay happy.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private muted: boolean;

  constructor(muted = false) {
    this.muted = muted;
  }

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  calibration(): void {
    this.tone({ frequency: 520, duration: 0.08, type: 'sine', volume: 0.05 });
  }

  tick(): void {
    this.tone({ frequency: 1100, duration: 0.025, type: 'square', volume: 0.018 });
  }

  temptation(): void {
    this.tone({ frequency: 620, endFrequency: 660, duration: 0.14, type: 'triangle', volume: 0.06 });
    this.tone({
      frequency: 930,
      endFrequency: 990,
      duration: 0.22,
      type: 'triangle',
      volume: 0.045,
      delay: 0.13,
    });
  }

  betrayal(targeted = false): void {
    this.tone({
      frequency: targeted ? 150 : 190,
      endFrequency: 70,
      duration: targeted ? 0.5 : 0.3,
      type: 'sawtooth',
      volume: targeted ? 0.09 : 0.055,
    });
    if (targeted) {
      this.tone({
        frequency: 96,
        endFrequency: 48,
        duration: 0.6,
        type: 'square',
        volume: 0.05,
        delay: 0.12,
      });
    }
  }

  finish(): void {
    this.tone({ frequency: 130, endFrequency: 62, duration: 1.6, type: 'sine', volume: 0.1 });
    this.tone({
      frequency: 196,
      endFrequency: 98,
      duration: 1.4,
      type: 'triangle',
      volume: 0.05,
      delay: 0.05,
    });
  }

  close(): void {
    const context = this.context;
    this.context = null;
    if (context) void context.close();
  }

  private tone(options: ToneOptions): void {
    if (this.muted) return;
    const context = this.context;
    if (!context || context.state !== 'running') return;

    const {
      frequency,
      endFrequency = frequency,
      duration,
      type = 'sine',
      volume = 0.05,
      delay = 0,
    } = options;

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    });
  }
}
