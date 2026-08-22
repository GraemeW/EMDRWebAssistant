// Tunables
const DEFAULT_BEEP_FREQUENCY_HZ = 440;
const BEEP_PEAK_GAIN = 0.15;
const BEEP_ATTACK_SECONDS = 0.005;
const BEEP_DURATION_SECONDS = 0.09;

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// Browsers only allow audio to start once a user - call `unlock()` synchronously from within a click handler
export class BeepPlayer {
  private ctx: AudioContext | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') { void this.ctx.resume(); }
      return;
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) { return; } // unsupported browser — play() will just no-op
    this.ctx = new Ctor();
  }

  play(frequencyHz: number = DEFAULT_BEEP_FREQUENCY_HZ): void {
    const ctx = this.ctx;
    if (!ctx) { return; }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequencyHz;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(BEEP_PEAK_GAIN, now + BEEP_ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + BEEP_DURATION_SECONDS);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + BEEP_DURATION_SECONDS + 0.02);
  }
}
