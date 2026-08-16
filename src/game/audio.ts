/**
 * Procedural audio. Every sound is synthesised from oscillators and noise
 * buffers, so the game has a full soundscape with zero audio downloads.
 */

type SoundName =
  | 'gem'
  | 'gemAll'
  | 'pickup'
  | 'powerup'
  | 'finish'
  | 'fall'
  | 'go'
  | 'ready'
  | 'bumper'
  | 'explode'
  | 'trapdoor'
  | 'timeTravel'
  | 'menu';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollSource: AudioBufferSourceNode | null = null;

  volume = 0.55;
  muted = false;

  /** Must be called from a user gesture; browsers block audio otherwise. */
  resume() {
    if (!this.ctx) this.init();
    void this.ctx?.resume();
  }

  private init() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.startRollLoop();
  }

  /**
   * The rolling sound is filtered noise whose cutoff and gain track speed.
   * This is the single most important sound in a marble game: it is the only
   * continuous feedback the player gets about how fast they are actually going.
   */
  private startRollLoop() {
    if (!this.ctx || !this.noiseBuffer || !this.master) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.9;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    src.connect(filter).connect(gain).connect(this.master);
    src.start();

    this.rollSource = src;
    this.rollFilter = filter;
    this.rollGain = gain;
  }

  /** Called every frame with the marble's contact state. */
  setRolling(speed: number, onGround: boolean, slip: number) {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const t = this.ctx.currentTime;
    const target = onGround ? Math.min(0.32, speed / 42) * (this.muted ? 0 : 1) : 0;
    this.rollGain.gain.setTargetAtTime(target, t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(220 + Math.min(speed, 30) * 55 + slip * 14, t, 0.08);
  }

  impact(speed: number) {
    if (!this.ctx || !this.master || this.muted) return;
    // Marble Blast ramps impact volume between 2.5 and 12 m/s.
    const v = Math.min(1, Math.max(0, (speed - 2.5) / 9.5)) ** 1.5;
    if (v <= 0.02) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180 + speed * 6, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28 * v, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);

    this.noise(0.05, 900 + speed * 90, 0.12 * v);
  }

  private noise(duration: number, freq: number, level: number) {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private tone(freq: number, duration: number, level: number, type: OscillatorType = 'triangle', at = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  play(name: SoundName) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.muted) return;

    switch (name) {
      case 'gem':
        this.tone(1046, 0.13, 0.2, 'triangle');
        this.tone(1568, 0.11, 0.12, 'sine', 0.04);
        break;
      case 'gemAll':
        // The "all gems" chime is a rising major triad: unmistakable, and it
        // tells the player to head for the pad without a word of UI.
        this.tone(784, 0.15, 0.2, 'triangle');
        this.tone(988, 0.15, 0.2, 'triangle', 0.08);
        this.tone(1319, 0.3, 0.22, 'triangle', 0.16);
        break;
      case 'pickup':
        this.tone(660, 0.1, 0.16, 'square');
        this.tone(880, 0.12, 0.12, 'square', 0.05);
        break;
      case 'powerup':
        this.tone(440, 0.1, 0.16, 'sawtooth');
        this.tone(880, 0.16, 0.14, 'sawtooth', 0.05);
        break;
      case 'finish':
        this.tone(523, 0.18, 0.22, 'triangle');
        this.tone(659, 0.18, 0.22, 'triangle', 0.12);
        this.tone(784, 0.18, 0.22, 'triangle', 0.24);
        this.tone(1046, 0.45, 0.24, 'triangle', 0.36);
        break;
      case 'fall':
        this.tone(320, 0.5, 0.18, 'sawtooth');
        break;
      case 'go':
        this.tone(880, 0.22, 0.24, 'square');
        break;
      case 'ready':
        this.tone(587, 0.14, 0.18, 'square');
        break;
      case 'bumper':
        this.tone(300, 0.12, 0.2, 'square');
        this.noise(0.08, 1400, 0.1);
        break;
      case 'explode':
        this.noise(0.4, 260, 0.32);
        this.tone(90, 0.35, 0.24, 'sawtooth');
        break;
      case 'trapdoor':
        this.noise(0.18, 500, 0.14);
        break;
      case 'timeTravel':
        this.tone(1200, 0.2, 0.16, 'sine');
        this.tone(900, 0.24, 0.14, 'sine', 0.06);
        break;
      case 'menu':
        this.tone(700, 0.06, 0.1, 'square');
        break;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  dispose() {
    this.rollSource?.stop();
    void this.ctx?.close();
  }
}
