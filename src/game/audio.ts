export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.bus = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.bus.connect(this.master);
      this.master.connect(this.ctx.destination);
      const samples = this.ctx.sampleRate * 1;
      const buf = this.ctx.createBuffer(1, samples, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  playShoot(): void {
    const rate = 0.92 + Math.random() * 0.16;
    this.tone(640 * rate, 0.055, "square", 0.045, -280);
    this.noise(0.04, 0.05, 1800);
  }

  playHit(): void {
    this.noise(0.07, 0.08, 900);
    this.tone(220, 0.06, "triangle", 0.04, -80);
  }

  playExplode(): void {
    this.noise(0.28, 0.16, 420);
    this.tone(90, 0.22, "sawtooth", 0.05, -40);
  }

  playHurt(): void {
    this.tone(140, 0.14, "sawtooth", 0.06, -70);
    this.noise(0.12, 0.07, 500);
  }

  playShield(): void {
    this.tone(420, 0.1, "sine", 0.05, 180);
    this.tone(640, 0.12, "triangle", 0.03, 80);
  }

  playPickup(): void {
    this.tone(660, 0.08, "triangle", 0.05);
    this.tone(880, 0.1, "triangle", 0.045);
    this.tone(1180, 0.14, "sine", 0.04);
  }

  playWave(): void {
    this.tone(392, 0.12, "square", 0.035, 80);
    this.tone(588, 0.16, "triangle", 0.03, 40);
  }

  playUi(): void {
    this.tone(740, 0.04, "square", 0.03);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slide = 0,
  ): void {
    if (!this.ctx || !this.bus || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(48, freq + slide), t + dur);
    }
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private noise(dur: number, gain: number, freq: number): void {
    if (!this.ctx || !this.bus || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.bus);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }
}
