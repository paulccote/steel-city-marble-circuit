import type { PowerupType } from './types';

/**
 * Procedural audio. Every sound is synthesised from oscillators and noise
 * buffers, so the game has a full soundscape with zero audio downloads.
 *
 * Signal flow:
 *
 *   continuous voices (roll, skid) ─┐
 *   one-shot SFX ───────────────────┼─> sfx ─> compressor ─┐
 *                                   └─> reverb send ───────┤
 *   music ─> duck ─> musicFilter ─> musicGain ─────────────┴─> master ─> out
 *
 * The compressor sits on SFX only. Music is already mixed by hand and would
 * pump against itself if it shared a limiter with the impacts.
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

/**
 * How a surface sounds under a rolling marble. The rolling voice is three
 * layers — a low resonant body, a high grain, and an optional pitched ring —
 * plus an amplitude rattle whose *rate* is derived from speed, so cobblestone
 * clatters faster as you accelerate instead of just getting louder.
 */
interface RollProfile {
  /** Bandpass centre of the body layer at rest, and its climb per m/s. */
  bodyHz: number;
  bodyPerSpeed: number;
  bodyQ: number;
  bodyGain: number;
  /** The high, textural layer: grit, hiss, brush. */
  grainHz: number;
  grainPerSpeed: number;
  grainQ: number;
  grainGain: number;
  /** Bumps per metre travelled. Rattle rate = speed * this, so it tracks pace. */
  bumpsPerMetre: number;
  /** 0..1 fraction of the grain layer that the rattle chews away. */
  rattleDepth: number;
  rattleWave: OscillatorType;
  /** Surfaces that ring like a struck plate (steel deck, ice sheet). */
  ringHz: number;
  ringGain: number;
  /** Overall trim, so sand is quiet and cobblestone is loud. */
  level: number;
  /** Skidding: how loud, how bright, and how much tonal squeal it has. */
  skidGain: number;
  skidHz: number;
  skidQ: number;
  squeal: number;
}

const DEFAULT_ROLL: RollProfile = {
  bodyHz: 260,
  bodyPerSpeed: 13,
  bodyQ: 1.0,
  bodyGain: 0.5,
  grainHz: 1300,
  grainPerSpeed: 42,
  grainQ: 0.7,
  grainGain: 0.34,
  bumpsPerMetre: 3,
  rattleDepth: 0.25,
  rattleWave: 'sine',
  ringHz: 0,
  ringGain: 0,
  level: 1,
  skidGain: 1,
  skidHz: 2600,
  skidQ: 1.2,
  squeal: 0.1,
};

const roll = (p: Partial<RollProfile>): RollProfile => ({ ...DEFAULT_ROLL, ...p });

/**
 * One entry per `SurfaceMaterial.kind` in engine/physics. The values are tuned
 * by ear against the physical intuition of each surface rather than derived
 * from the friction number: grass has more friction than steel but is far
 * quieter, because what you hear is hardness, not grip.
 */
const ROLL_PROFILES: Record<string, RollProfile> = {
  default: DEFAULT_ROLL,

  // Hard, irregular, loud. The defining "street" sound of the game: a fast
  // square-wave rattle at ~4.5 bumps/m is roughly one stone every 22 cm.
  cobblestone: roll({
    bodyHz: 175,
    bodyPerSpeed: 16,
    bodyQ: 1.7,
    bodyGain: 0.85,
    grainHz: 850,
    grainPerSpeed: 55,
    grainQ: 1.2,
    grainGain: 0.6,
    bumpsPerMetre: 4.5,
    rattleDepth: 0.85,
    rattleWave: 'square',
    level: 1.25,
    skidGain: 0.9,
    skidHz: 1700,
    skidQ: 0.9,
    squeal: 0.05,
  }),

  // Smooth but resonant: little rattle, a lot of high grain, and a sustained
  // ring an octave up that makes a steel catwalk read as hollow metal.
  steel: roll({
    bodyHz: 420,
    bodyPerSpeed: 18,
    bodyQ: 2.4,
    bodyGain: 0.42,
    grainHz: 2500,
    grainPerSpeed: 72,
    grainQ: 3,
    grainGain: 0.5,
    bumpsPerMetre: 1.6,
    rattleDepth: 0.15,
    ringHz: 1450,
    ringGain: 0.055,
    level: 1.05,
    skidGain: 1.35,
    skidHz: 4200,
    skidQ: 6,
    squeal: 0.55,
  }),

  // Almost frictionless, so almost no roll: a thin glassy hiss high in the
  // spectrum. Ice is mostly heard when you *stop* rolling and start sliding.
  ice: roll({
    bodyHz: 700,
    bodyPerSpeed: 22,
    bodyQ: 1,
    bodyGain: 0.18,
    grainHz: 4200,
    grainPerSpeed: 95,
    grainQ: 0.6,
    grainGain: 0.46,
    bumpsPerMetre: 0.6,
    rattleDepth: 0.05,
    ringHz: 2700,
    ringGain: 0.03,
    level: 0.7,
    skidGain: 1.6,
    skidHz: 5400,
    skidQ: 2,
    squeal: 0.02,
  }),

  // Soft and broadband, with a fast shallow rustle instead of a rattle. No
  // body resonance at all — turf does not ring.
  grass: roll({
    bodyHz: 150,
    bodyPerSpeed: 8,
    bodyQ: 0.8,
    bodyGain: 0.45,
    grainHz: 2100,
    grainPerSpeed: 26,
    grainQ: 0.45,
    grainGain: 0.32,
    bumpsPerMetre: 9,
    rattleDepth: 0.5,
    level: 0.82,
    skidGain: 0.85,
    skidHz: 3000,
    skidQ: 0.7,
    squeal: 0,
  }),

  sand: roll({
    bodyHz: 130,
    bodyPerSpeed: 6,
    bodyQ: 0.7,
    bodyGain: 0.4,
    grainHz: 1500,
    grainPerSpeed: 20,
    grainQ: 0.4,
    grainGain: 0.3,
    bumpsPerMetre: 12,
    rattleDepth: 0.35,
    level: 0.72,
    skidGain: 0.7,
    skidHz: 2200,
    skidQ: 0.5,
    squeal: 0,
  }),

  carpet: roll({
    bodyHz: 120,
    bodyPerSpeed: 5,
    bodyQ: 0.7,
    bodyGain: 0.38,
    grainHz: 900,
    grainPerSpeed: 14,
    grainQ: 0.4,
    grainGain: 0.2,
    bumpsPerMetre: 10,
    rattleDepth: 0.3,
    level: 0.55,
    skidGain: 0.5,
    skidHz: 1600,
    skidQ: 0.5,
    squeal: 0,
  }),

  // Shallow water: a low burble plus a wet, slow-modulated splash layer.
  water: roll({
    bodyHz: 115,
    bodyPerSpeed: 9,
    bodyQ: 1.4,
    bodyGain: 0.55,
    grainHz: 620,
    grainPerSpeed: 48,
    grainQ: 0.9,
    grainGain: 0.5,
    bumpsPerMetre: 2.2,
    rattleDepth: 0.65,
    level: 0.95,
    skidGain: 1.1,
    skidHz: 1200,
    skidQ: 0.6,
    squeal: 0,
  }),

  tarmac: roll({
    bodyHz: 230,
    bodyPerSpeed: 12,
    bodyQ: 1.1,
    bodyGain: 0.55,
    grainHz: 1700,
    grainPerSpeed: 46,
    grainQ: 0.6,
    grainGain: 0.4,
    bumpsPerMetre: 6,
    rattleDepth: 0.35,
    level: 1,
    skidGain: 1.15,
    skidHz: 2400,
    skidQ: 1.4,
    squeal: 0.3,
  }),

  slick: roll({
    bodyHz: 380,
    bodyPerSpeed: 16,
    bodyQ: 1.2,
    bodyGain: 0.25,
    grainHz: 3000,
    grainPerSpeed: 70,
    grainQ: 0.8,
    grainGain: 0.34,
    bumpsPerMetre: 1,
    rattleDepth: 0.1,
    level: 0.8,
    skidGain: 1.35,
    skidHz: 4200,
    skidQ: 1.6,
    squeal: 0.08,
  }),

  lowFriction: roll({
    bodyHz: 330,
    bodyPerSpeed: 15,
    bodyQ: 1.1,
    bodyGain: 0.3,
    grainHz: 2600,
    grainPerSpeed: 62,
    grainQ: 0.8,
    grainGain: 0.32,
    bumpsPerMetre: 1.4,
    rattleDepth: 0.12,
    level: 0.85,
    skidGain: 1.25,
    skidHz: 3600,
    skidQ: 1.5,
    squeal: 0.06,
  }),

  // Rubber: dull body, no grit, and a pronounced squeal when scrubbed.
  highFriction: roll({
    bodyHz: 200,
    bodyPerSpeed: 10,
    bodyQ: 1.3,
    bodyGain: 0.55,
    grainHz: 1100,
    grainPerSpeed: 30,
    grainQ: 0.7,
    grainGain: 0.26,
    bumpsPerMetre: 5,
    rattleDepth: 0.35,
    level: 1.05,
    skidGain: 1.3,
    skidHz: 1900,
    skidQ: 4,
    squeal: 0.8,
  }),

  rampYellow: roll({
    bodyHz: 210,
    bodyPerSpeed: 11,
    bodyQ: 1.3,
    bodyGain: 0.55,
    grainHz: 1200,
    grainPerSpeed: 32,
    grainQ: 0.7,
    grainGain: 0.28,
    bumpsPerMetre: 4,
    rattleDepth: 0.3,
    level: 1.05,
    skidGain: 1.25,
    skidHz: 2000,
    skidQ: 3.5,
    squeal: 0.7,
  }),

  bounceFloor: roll({
    bodyHz: 170,
    bodyPerSpeed: 9,
    bodyQ: 1.5,
    bodyGain: 0.5,
    grainHz: 800,
    grainPerSpeed: 22,
    grainQ: 0.6,
    grainGain: 0.2,
    bumpsPerMetre: 3,
    rattleDepth: 0.3,
    ringHz: 300,
    ringGain: 0.03,
    level: 0.95,
    skidGain: 0.9,
    skidHz: 1600,
    skidQ: 3,
    squeal: 0.5,
  }),
};

/** What a marble landing on this surface sounds like. */
interface ImpactProfile {
  /** Thump pitch and how far it drops; the body of the hit. */
  thumpHz: number;
  thumpDrop: number;
  thumpLevel: number;
  thumpDecay: number;
  /** The transient noise: bright for stone, dull for turf. */
  noiseHz: number;
  noiseQ: number;
  noiseLevel: number;
  noiseDecay: number;
  /** Inharmonic partials for surfaces that ring after the hit. */
  ring: number[];
  ringLevel: number;
  ringDecay: number;
  /** Water sweeps its noise downwards, which is what makes a splash a splash. */
  splash: boolean;
}

const DEFAULT_IMPACT: ImpactProfile = {
  thumpHz: 180,
  thumpDrop: 70,
  thumpLevel: 0.34,
  thumpDecay: 0.16,
  noiseHz: 1000,
  noiseQ: 0.9,
  noiseLevel: 0.16,
  noiseDecay: 0.06,
  ring: [],
  ringLevel: 0,
  ringDecay: 0.2,
  splash: false,
};

const imp = (p: Partial<ImpactProfile>): ImpactProfile => ({ ...DEFAULT_IMPACT, ...p });

const IMPACT_PROFILES: Record<string, ImpactProfile> = {
  default: DEFAULT_IMPACT,
  cobblestone: imp({ thumpHz: 160, thumpDrop: 62, thumpLevel: 0.38, noiseHz: 1500, noiseQ: 1.2, noiseLevel: 0.2 }),
  // Ratios 1 : 2.76 : 5.4 are the classic inharmonic bell set; on a short
  // decay they read as "struck metal" rather than as a musical note.
  steel: imp({
    thumpHz: 220,
    thumpDrop: 90,
    thumpLevel: 0.24,
    noiseHz: 3200,
    noiseQ: 2,
    noiseLevel: 0.14,
    ring: [1, 2.76, 5.4],
    ringLevel: 0.12,
    ringDecay: 0.5,
  }),
  ice: imp({
    thumpHz: 260,
    thumpDrop: 140,
    thumpLevel: 0.14,
    thumpDecay: 0.07,
    noiseHz: 5000,
    noiseQ: 1.4,
    noiseLevel: 0.22,
    noiseDecay: 0.035,
    ring: [1, 3.1],
    ringLevel: 0.05,
    ringDecay: 0.22,
  }),
  grass: imp({ thumpHz: 130, thumpDrop: 55, thumpLevel: 0.3, thumpDecay: 0.11, noiseHz: 600, noiseQ: 0.5, noiseLevel: 0.09 }),
  sand: imp({ thumpHz: 110, thumpDrop: 48, thumpLevel: 0.26, thumpDecay: 0.09, noiseHz: 900, noiseQ: 0.4, noiseLevel: 0.11, noiseDecay: 0.09 }),
  carpet: imp({ thumpHz: 105, thumpDrop: 45, thumpLevel: 0.22, thumpDecay: 0.08, noiseHz: 500, noiseQ: 0.4, noiseLevel: 0.05 }),
  water: imp({ thumpHz: 120, thumpDrop: 60, thumpLevel: 0.12, noiseHz: 2400, noiseQ: 0.5, noiseLevel: 0.3, noiseDecay: 0.28, splash: true }),
  tarmac: imp({ thumpHz: 170, thumpDrop: 66, noiseHz: 1200, noiseLevel: 0.15 }),
  slick: imp({ thumpHz: 200, thumpDrop: 80, thumpLevel: 0.24, noiseHz: 2600, noiseLevel: 0.13 }),
  lowFriction: imp({ thumpHz: 195, thumpDrop: 78, thumpLevel: 0.26, noiseHz: 2200, noiseLevel: 0.13 }),
  highFriction: imp({ thumpHz: 150, thumpDrop: 58, noiseHz: 800, noiseLevel: 0.1 }),
  rampYellow: imp({ thumpHz: 155, thumpDrop: 60, noiseHz: 900, noiseLevel: 0.11 }),
  bounceFloor: imp({ thumpHz: 140, thumpDrop: 52, thumpLevel: 0.36, thumpDecay: 0.22, noiseHz: 700, noiseLevel: 0.08, ring: [1], ringLevel: 0.06, ringDecay: 0.3 }),
};

// ------------------------------------------------------------------- music

const BPM = 124;
/** 16th-note grid: fine enough for hats and syncopated bass, cheap to schedule. */
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS = 32;
const LOOP_STEPS = BARS * STEPS_PER_BAR;

/**
 * A minor, i-VI-III-VII. It is the progression every driving game theme lands
 * on for a reason: it never resolves hard, so a 60-second loop does not
 * announce its own seam.
 */
const CHORD_ROOTS = [-12, -16, -21, -14]; // A2, F2, C2, G2 as semitones from A3
const CHORD_TONES = [
  [0, 3, 7], // Am
  [-4, 0, 3], // F
  [-9, -5, 0], // C
  [-2, 2, 5], // G
];

/**
 * Two singable phrases in A minor pentatonic, as [step, semitone, lengthSteps]
 * over two bars. The lead alternates them so the melody asks and answers
 * instead of arpeggiating in place.
 */
const PHRASE_A: number[][] = [
  [0, 0, 3],
  [3, 3, 3],
  [6, 7, 2],
  [8, 5, 2],
  [10, 3, 5],
  [16, -2, 3],
  [19, 0, 3],
  [22, 3, 4],
  [26, 5, 2],
  [28, 7, 6],
];
const PHRASE_B: number[][] = [
  [0, 12, 3],
  [3, 10, 3],
  [6, 7, 3],
  [10, 5, 2],
  [12, 3, 4],
  [16, 0, 4],
  [20, 3, 4],
  [24, 7, 3],
  [27, 5, 2],
  [29, 3, 4],
];

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Rolling voice.
  private rollGain: GainNode | null = null;
  private rollBody: BiquadFilterNode | null = null;
  private rollBodyGain: GainNode | null = null;
  private rollGrain: BiquadFilterNode | null = null;
  private rollGrainGain: GainNode | null = null;
  private rattleOsc: OscillatorNode | null = null;
  private rattleDepth: GainNode | null = null;
  private ringOsc: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;

  // Skid voice, deliberately a separate chain so it can be bright and
  // resonant while the roll underneath stays dark.
  private skidGain: GainNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;

  private rollSources: AudioBufferSourceNode[] = [];

  // Music.
  private musicGain: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private musicTone: GainNode | null = null;
  private musicDrums: GainNode | null = null;
  private leadDelay: DelayNode | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private musicNextTime = 0;
  private musicPlaying = false;

  /** Cache of the last value written to each smoothed param, to avoid
   *  stacking 60 automation events per second per param for no audible gain. */
  private lastParam: number[] = new Array(12).fill(-1);

  private gemStreak = 0;

  volume = 0.55;
  musicVolume = 0.34;
  muted = false;
  musicMuted = false;
  /** Music follows the first user gesture so no call site has to start it. */
  autoMusic = true;

  /** Must be called from a user gesture; browsers block audio otherwise. */
  resume() {
    if (!this.ctx) this.init();
    void this.ctx?.resume();
    if (this.autoMusic && !this.musicPlaying) this.startMusic();
  }

  private init() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    // A gentle limiter on SFX only. Explosions, impacts and a full gem run can
    // land in the same 50 ms and would otherwise clip the output.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(comp);

    // 2 s of white noise, looped. One buffer feeds every noise voice in the
    // game; separate sources read it at different offsets so they decorrelate.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.buildReverb();
    this.buildRollVoice();
    this.buildSkidVoice();
    this.buildMusicBuses();
  }

  /**
   * A synthesised impulse response: exponentially decaying noise. Only the
   * "pretty" sounds (gems, powerups, the fanfare) and the music lead are sent
   * to it — reverb on the rolling loop would smear the speed cue.
   */
  private buildReverb() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const dur = 1.1;
    const n = Math.floor(ctx.sampleRate * dur);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // A short silent head reads as distance; the ^3 tail keeps it from
        // sounding like a cathedral in what is meant to be a street.
        const head = i < ctx.sampleRate * 0.012 ? 0 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * head;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    conv.connect(wet).connect(this.master);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(conv);
  }

  private newNoiseSource(loop: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = loop;
    return src;
  }

  /**
   * The rolling sound is the single most important sound in a marble game: it
   * is the only continuous feedback the player gets about how fast they are
   * actually going, and the only cue for what they are rolling on.
   */
  private buildRollVoice() {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;

    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.rollGain.connect(this.sfx);

    // Body: low resonant rumble.
    const bodySrc = this.newNoiseSource(true);
    this.rollBody = ctx.createBiquadFilter();
    this.rollBody.type = 'bandpass';
    this.rollBody.frequency.value = DEFAULT_ROLL.bodyHz;
    this.rollBody.Q.value = DEFAULT_ROLL.bodyQ;
    this.rollBodyGain = ctx.createGain();
    this.rollBodyGain.gain.value = DEFAULT_ROLL.bodyGain;
    bodySrc?.connect(this.rollBody).connect(this.rollBodyGain).connect(this.rollGain);

    // Grain: the high texture, and the layer the rattle modulates.
    const grainSrc = this.newNoiseSource(true);
    this.rollGrain = ctx.createBiquadFilter();
    this.rollGrain.type = 'bandpass';
    this.rollGrain.frequency.value = DEFAULT_ROLL.grainHz;
    this.rollGrain.Q.value = DEFAULT_ROLL.grainQ;
    this.rollGrainGain = ctx.createGain();
    this.rollGrainGain.gain.value = DEFAULT_ROLL.grainGain;
    grainSrc?.connect(this.rollGrain).connect(this.rollGrainGain).connect(this.rollGain);

    // The rattle is an oscillator wired into the grain gain, so its rate is
    // "bumps per second" = speed * bumps per metre. That is why cobblestone
    // clatters faster when you accelerate rather than merely louder.
    this.rattleOsc = ctx.createOscillator();
    this.rattleOsc.type = DEFAULT_ROLL.rattleWave;
    this.rattleOsc.frequency.value = 8;
    this.rattleDepth = ctx.createGain();
    this.rattleDepth.gain.value = 0;
    this.rattleOsc.connect(this.rattleDepth).connect(this.rollGrainGain.gain);
    this.rattleOsc.start();

    // Ring: a pitched partial for surfaces that resonate.
    this.ringOsc = ctx.createOscillator();
    this.ringOsc.type = 'triangle';
    this.ringOsc.frequency.value = 1400;
    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 0;
    this.ringOsc.connect(this.ringGain).connect(this.rollGain);
    this.ringOsc.start();

    if (bodySrc) {
      bodySrc.start();
      this.rollSources.push(bodySrc);
    }
    if (grainSrc) {
      // Offset the second read so the two layers are not the same noise twice.
      grainSrc.start(0, 0.7);
      this.rollSources.push(grainSrc);
    }
  }

  /**
   * Skidding is its own voice rather than a tilt on the roll: the marble
   * scrubbing sideways is a different physical event from it rolling, and the
   * player needs to hear the difference to know they have lost grip.
   */
  private buildSkidVoice() {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;

    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidGain.connect(this.sfx);

    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 2600;
    this.skidFilter.Q.value = 1.2;
    this.skidFilter.connect(this.skidGain);

    const src = this.newNoiseSource(true);
    src?.connect(this.skidFilter);
    if (src) {
      src.start(0, 1.3);
      this.rollSources.push(src);
    }

    // A tonal squeal riding the same filter. On rubber and steel this is what
    // turns "noise" into "tyres protesting".
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'sawtooth';
    this.squealOsc.frequency.value = 200;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealOsc.connect(this.squealGain).connect(this.skidFilter);
    this.squealOsc.start();
  }

  /** setTargetAtTime is cheap, but 60 Hz x 12 params is not free; skip no-ops. */
  private smooth(param: AudioParam, slot: number, value: number, tau: number, t: number) {
    const prev = this.lastParam[slot];
    if (prev >= 0 && Math.abs(value - prev) < Math.max(0.0008, Math.abs(prev) * 0.004)) return;
    this.lastParam[slot] = value;
    param.setTargetAtTime(value, t, tau);
  }

  /**
   * Called every frame with the marble's contact state.
   * `surface` is `Marble.lastContactMaterial.kind`.
   */
  setRolling(speed: number, onGround: boolean, slip: number, surface = 'default') {
    const ctx = this.ctx;
    if (!ctx || !this.rollGain || !this.rollBody || !this.rollGrain) return;
    const p = ROLL_PROFILES[surface] ?? DEFAULT_ROLL;
    const t = ctx.currentTime;

    // Roll level saturates around maxRollVelocity so a speed powerup does not
    // simply get louder; the pitch keeps climbing instead.
    const norm = Math.min(1, speed / 16);
    const active = onGround ? Math.min(1, speed / 0.6) : 0;
    const rollLevel = 0.3 * p.level * Math.pow(norm, 0.7) * active;

    this.smooth(this.rollGain.gain, 0, rollLevel, 0.05, t);
    this.smooth(this.rollBody.frequency, 1, p.bodyHz + speed * p.bodyPerSpeed, 0.07, t);
    this.smooth(this.rollGrain.frequency, 2, p.grainHz + speed * p.grainPerSpeed, 0.07, t);
    this.rollBody.Q.value = p.bodyQ;
    this.rollGrain.Q.value = p.grainQ;

    if (this.rollBodyGain) this.smooth(this.rollBodyGain.gain, 3, p.bodyGain, 0.12, t);
    if (this.rollGrainGain) {
      // Bias the grain so the rattle oscillator, which swings +/-, sums into
      // a gain that stays in [grainGain*(1-depth), grainGain]. Letting it go
      // negative would invert the noise instead of gating it.
      this.smooth(this.rollGrainGain.gain, 4, p.grainGain * (1 - p.rattleDepth * 0.5), 0.12, t);
    }
    if (this.rattleOsc) {
      // Clamped so a stationary marble does not emit a sub-audio thud and a
      // very fast one does not turn the rattle into a whining tone.
      const rate = Math.min(150, Math.max(2, speed * p.bumpsPerMetre));
      this.smooth(this.rattleOsc.frequency, 5, rate, 0.05, t);
      if (this.rattleOsc.type !== p.rattleWave) this.rattleOsc.type = p.rattleWave;
    }
    if (this.rattleDepth) {
      this.smooth(this.rattleDepth.gain, 6, p.grainGain * p.rattleDepth * 0.5, 0.12, t);
    }
    if (this.ringOsc && this.ringGain) {
      this.smooth(this.ringOsc.frequency, 7, p.ringHz + speed * 5, 0.1, t);
      this.smooth(this.ringGain.gain, 8, p.ringGain * norm, 0.12, t);
    }

    // Skid: only the scrub that is genuinely above rolling contact. Below
    // ~1.5 m/s of slip every marble is technically scrubbing a little and
    // gating it there keeps the sound meaningful.
    if (this.skidGain && this.skidFilter) {
      const scrub = onGround ? Math.min(1, Math.max(0, (slip - 1.5) / 9)) : 0;
      this.smooth(this.skidGain.gain, 9, 0.26 * p.skidGain * Math.pow(scrub, 1.3), 0.05, t);
      this.smooth(this.skidFilter.frequency, 10, p.skidHz + slip * 60, 0.07, t);
      this.skidFilter.Q.value = p.skidQ;
      if (this.squealGain && this.squealOsc) {
        this.squealGain.gain.setTargetAtTime(0.09 * p.squeal * scrub * scrub, t, 0.06);
        this.smooth(this.squealOsc.frequency, 11, 110 + slip * 34, 0.08, t);
      }
    }
  }

  // ------------------------------------------------------------- primitives

  private now(at = 0) {
    return (this.ctx?.currentTime ?? 0) + at;
  }

  /** Exponential AD envelope. Exponential because linear fades sound like
   *  someone turning a knob, not like something decaying. */
  private env(g: GainNode, t: number, level: number, attack: number, decay: number) {
    const peak = Math.max(level, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.max(attack, 0.001));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, 0.001) + decay);
  }

  private osc(
    type: OscillatorType,
    freq: number,
    t: number,
    level: number,
    attack: number,
    decay: number,
    dest?: AudioNode,
    sendReverb = 0,
  ) {
    const ctx = this.ctx;
    const out = dest ?? this.sfx;
    if (!ctx || !out) return null;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    this.env(g, t, level, attack, decay);
    o.connect(g).connect(out);
    if (sendReverb > 0 && this.reverbSend) {
      const s = ctx.createGain();
      s.gain.value = sendReverb;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  private noiseHit(
    t: number,
    level: number,
    freq: number,
    q: number,
    decay: number,
    type: BiquadFilterType = 'bandpass',
    dest?: AudioNode,
    sweepTo = 0,
  ) {
    const ctx = this.ctx;
    const out = dest ?? this.sfx;
    if (!ctx || !out) return;
    const src = this.newNoiseSource(false);
    if (!src) return;
    // Random read offset so repeated hits are not literally the same sample.
    const offset = Math.random() * 1.5;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, level, 0.003, decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, offset);
    src.stop(t + decay + 0.08);
  }

  // ----------------------------------------------------------------- impact

  /**
   * Marble Blast ramps impact volume between 2.5 and 12 m/s: below that a
   * landing is inaudible, above it everything is already at full weight.
   * `surface` is `Marble.lastContactMaterial.kind`.
   */
  impact(speed: number, surface = 'default') {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.muted) return;
    const v = Math.min(1, Math.max(0, (speed - 2.5) / 9.5));
    if (v <= 0.02) return;
    // ^1.6 so a light tap is nearly silent while a full-height drop is heavy.
    const amp = Math.pow(v, 1.6);
    const p = IMPACT_PROFILES[surface] ?? DEFAULT_IMPACT;
    const t = ctx.currentTime;

    if (!p.splash) {
      // Body: a pitch drop, higher and shorter on a harder hit.
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(p.thumpHz * (1 + v * 0.35), t);
      o.frequency.exponentialRampToValueAtTime(p.thumpDrop, t + p.thumpDecay);
      const g = ctx.createGain();
      g.gain.setValueAtTime(p.thumpLevel * amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.thumpDecay + 0.03);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + p.thumpDecay + 0.06);
    }

    this.noiseHit(
      t,
      p.noiseLevel * amp,
      p.noiseHz * (0.85 + v * 0.4),
      p.noiseQ,
      p.noiseDecay * (p.splash ? 1 : 0.6 + v * 0.6),
      'bandpass',
      undefined,
      p.splash ? 300 : 0,
    );

    for (const r of p.ring) {
      // Only hard landings excite the ring; a resting nudge should not chime.
      this.osc('sine', p.thumpHz * 3.2 * r, t, p.ringLevel * amp * amp, 0.004, p.ringDecay, undefined, 0.08);
    }
  }

  // -------------------------------------------------------------- pickups

  /**
   * Gem pitch climbs with the count, so collecting a run is a melodic phrase
   * rather than the same beep n times. Pentatonic, because every interval in
   * it sounds intentional no matter what order the player grabs them in.
   */
  gem(collected: number, total = 0) {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.gemStreak = collected;

    if (total > 0 && collected >= total) {
      this.allGems();
      return;
    }

    const idx = Math.max(0, collected - 1);
    const scale = [0, 2, 4, 7, 9];
    // Roll over into the next octave after five gems and cap at two, past
    // which the chime would be shrill rather than exciting.
    const oct = Math.min(2, Math.floor(idx / scale.length));
    const semi = scale[idx % scale.length] + oct * 12;
    const f = 880 * Math.pow(2, semi / 12);
    const t = ctx.currentTime;

    // A bell is its fundamental plus an inharmonic partial; 2.76 is the ratio
    // that stops it sounding like a plain sine beep.
    this.osc('sine', f, t, 0.2, 0.004, 0.34, undefined, 0.3);
    this.osc('sine', f * 2.76, t, 0.06, 0.003, 0.18, undefined, 0.3);
    this.osc('triangle', f * 2, t + 0.02, 0.07, 0.004, 0.16, undefined, 0.25);
    this.noiseHit(t, 0.05, f * 3, 6, 0.05);
  }

  /**
   * The last gem has to resolve, not just be higher: a rising tonic arpeggio
   * capped with an octave, so it tells the player "go to the pad" without a
   * word of UI.
   */
  private allGems() {
    const t = this.now();
    const root = 523.25; // C5
    const notes = [1, 1.25, 1.5, 2]; // major triad + octave
    notes.forEach((r, i) => {
      const at = t + i * 0.075;
      this.osc('triangle', root * r, at, 0.2, 0.006, 0.3 + i * 0.12, undefined, 0.4);
      this.osc('sine', root * r * 2, at, 0.05, 0.006, 0.2, undefined, 0.4);
    });
    // A sustained fifth underneath turns the arpeggio into a cadence.
    this.osc('sine', root / 2, t, 0.14, 0.02, 0.9, undefined, 0.3);
    this.osc('sine', (root / 2) * 1.5, t + 0.2, 0.1, 0.03, 0.75, undefined, 0.3);
    this.noiseHit(t + 0.22, 0.07, 6000, 0.8, 0.5, 'highpass');
  }

  /** Reset between levels so gem 1 of the next level starts low again. */
  resetGemPitch() {
    this.gemStreak = 0;
  }

  /**
   * Per-powerup stingers. Each one uses a different synthesis gesture — sweep,
   * bend, bounce, damp, chop, drop — so they are told apart by shape, not by
   * pitch alone. `type` is the PowerupType about to be used.
   */
  powerup(type: PowerupType | string) {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;

    switch (type) {
      case 'superSpeed': {
        // A jet: noise sweeping up hard, with a pitch-rising body under it.
        this.noiseHit(t, 0.16, 400, 1.2, 0.34, 'bandpass', undefined, 5000);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(1400, t + 0.28);
        const g = ctx.createGain();
        this.env(g, t, 0.14, 0.01, 0.3);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(6000, t + 0.28);
        o.connect(f).connect(g).connect(this.sfx!);
        o.start(t);
        o.stop(t + 0.36);
        break;
      }
      case 'superJump': {
        // A boing: one octave-and-a-half bend up, with vibrato on the tail.
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(780, t + 0.22);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 14;
        const lfoAmt = ctx.createGain();
        lfoAmt.gain.setValueAtTime(0, t);
        lfoAmt.gain.linearRampToValueAtTime(45, t + 0.24);
        lfo.connect(lfoAmt).connect(o.frequency);
        const g = ctx.createGain();
        this.env(g, t, 0.22, 0.008, 0.36);
        o.connect(g).connect(this.sfx!);
        this.sendReverb(g, 0.2);
        o.start(t);
        lfo.start(t);
        o.stop(t + 0.42);
        lfo.stop(t + 0.42);
        break;
      }
      case 'superBounce': {
        // Four pings, accelerating and rising — a ball settling, run backwards.
        let at = t;
        let gap = 0.12;
        for (let i = 0; i < 5; i++) {
          this.osc('square', 300 * Math.pow(1.26, i), at, 0.12 - i * 0.012, 0.004, 0.1, undefined, 0.2);
          at += gap;
          gap *= 0.72;
        }
        break;
      }
      case 'shockAbsorber': {
        // The opposite gesture: a thud whose filter slams shut. It should
        // sound like something being swallowed.
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(2400, t);
        f.frequency.exponentialRampToValueAtTime(160, t + 0.26);
        f.Q.value = 6;
        const g = ctx.createGain();
        this.env(g, t, 0.24, 0.006, 0.34);
        o.connect(f).connect(g).connect(this.sfx!);
        o.start(t);
        o.stop(t + 0.44);
        this.noiseHit(t, 0.1, 900, 0.6, 0.1, 'lowpass');
        break;
      }
      case 'gyrocopter': {
        // Rotor chop: a square LFO gating a noise band, spinning up.
        const src = this.newNoiseSource(false);
        if (!src) break;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 420;
        f.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        const chop = ctx.createOscillator();
        chop.type = 'square';
        chop.frequency.setValueAtTime(9, t);
        chop.frequency.linearRampToValueAtTime(26, t + 0.5);
        const chopAmt = ctx.createGain();
        chopAmt.gain.value = 0.09;
        chop.connect(chopAmt).connect(g.gain);
        src.connect(f).connect(g).connect(this.sfx!);
        src.start(t);
        src.stop(t + 0.62);
        chop.start(t);
        chop.stop(t + 0.62);
        this.osc('triangle', 300, t, 0.1, 0.05, 0.5);
        this.osc('triangle', 452, t + 0.05, 0.07, 0.05, 0.45);
        break;
      }
      case 'megaMarble': {
        // Big and low: a sub drop plus a fifth, so it feels like mass.
        this.osc('sine', 160, t, 0.3, 0.01, 0.5);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.5);
        const g = ctx.createGain();
        this.env(g, t, 0.34, 0.01, 0.55);
        o.connect(g).connect(this.sfx!);
        o.start(t);
        o.stop(t + 0.7);
        this.osc('sawtooth', 90, t + 0.04, 0.1, 0.02, 0.4);
        this.noiseHit(t, 0.14, 260, 0.7, 0.4, 'lowpass');
        break;
      }
      default:
        this.osc('sawtooth', 440, t, 0.16, 0.008, 0.12);
        this.osc('sawtooth', 880, t + 0.05, 0.14, 0.008, 0.16);
    }
  }

  private sendReverb(from: AudioNode, amount: number) {
    if (!this.ctx || !this.reverbSend) return;
    const s = this.ctx.createGain();
    s.gain.value = amount;
    from.connect(s).connect(this.reverbSend);
  }

  // ------------------------------------------------------------- countdown

  /** n = 3, 2, 1 for the beeps; n = 0 for GO. */
  countdown(n: number) {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    if (n > 0) {
      // Same pitch each beep so the GO an octave up lands as a release.
      this.osc('square', 660, t, 0.16, 0.004, 0.1);
      this.noiseHit(t, 0.05, 2400, 3, 0.03);
    } else {
      this.osc('square', 880, t, 0.2, 0.004, 0.24, undefined, 0.2);
      this.osc('square', 1320, t, 0.12, 0.004, 0.28, undefined, 0.2);
      this.osc('sine', 440, t, 0.16, 0.004, 0.3);
      this.noiseHit(t, 0.1, 5000, 0.7, 0.22, 'highpass');
    }
  }

  /** Triumphant finish. Ducks the music so the fanfare is not fighting it. */
  private fanfare() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.duckMusic(0.35, 2.4);

    // Brass is a sawtooth through a filter that opens on the attack; stacking
    // two detuned ones is what stops it sounding like a single synth note.
    const brass = (freq: number, at: number, dur: number, level: number) => {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = detune;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(700, at);
        f.frequency.exponentialRampToValueAtTime(4200, at + 0.06);
        f.frequency.exponentialRampToValueAtTime(1400, at + dur);
        f.Q.value = 2;
        const g = ctx.createGain();
        this.env(g, at, level, 0.02, dur);
        o.connect(f).connect(g).connect(this.sfx!);
        this.sendReverb(g, 0.45);
        o.start(at);
        o.stop(at + dur + 0.1);
      }
    };

    // I - V - I over an octave, then the full triad held.
    brass(523.25, t, 0.22, 0.12);
    brass(659.25, t + 0.14, 0.22, 0.12);
    brass(783.99, t + 0.28, 0.24, 0.13);
    brass(1046.5, t + 0.44, 1.3, 0.14);
    brass(659.25, t + 0.44, 1.3, 0.09);
    brass(392.0, t + 0.44, 1.4, 0.09);
    this.osc('sine', 130.81, t + 0.44, 0.22, 0.02, 1.5);
    // A noise swell instead of a cymbal sample: highpassed noise with a slow
    // attack reads as a crash well enough at this level.
    this.noiseHit(t + 0.4, 0.12, 7000, 0.5, 1.2, 'highpass');
  }

  /** Falling out of the world: a doppler drop into a muffled landing. */
  private fallSound() {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.7);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    const g = ctx.createGain();
    this.env(g, t, 0.2, 0.02, 0.72);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.85);
    // Wind past the marble on the way down.
    this.noiseHit(t, 0.09, 900, 0.8, 0.7, 'bandpass', undefined, 160);
    // The muffled "gone" at the bottom.
    this.osc('sine', 70, t + 0.66, 0.2, 0.01, 0.3);
    this.noiseHit(t + 0.66, 0.08, 220, 0.6, 0.25, 'lowpass');
  }

  // ---------------------------------------------------------- named sounds

  play(name: SoundName) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;

    switch (name) {
      case 'gem':
        this.gem(this.gemStreak + 1);
        break;
      case 'gemAll':
        this.allGems();
        break;
      case 'pickup':
        // Grabbing a powerup is a short confirm; using it is the stinger.
        this.osc('square', 660, t, 0.12, 0.004, 0.08);
        this.osc('square', 990, t + 0.05, 0.1, 0.004, 0.1, undefined, 0.15);
        break;
      case 'powerup':
        this.powerup('default');
        break;
      case 'finish':
        this.fanfare();
        break;
      case 'fall':
        this.fallSound();
        break;
      case 'go':
        this.countdown(0);
        break;
      case 'ready':
        this.countdown(1);
        break;
      case 'bumper':
        // Sprung and rubbery: a fast upward bend plus a body thump.
        this.osc('sine', 220, t, 0.22, 0.004, 0.14);
        this.osc('square', 330, t, 0.1, 0.004, 0.1);
        this.noiseHit(t, 0.1, 1400, 1.4, 0.09);
        this.osc('triangle', 520, t + 0.03, 0.1, 0.004, 0.14, undefined, 0.2);
        break;
      case 'explode': {
        // Layered: a crack, a body boom, and a long low rumble tail.
        this.noiseHit(t, 0.3, 2600, 0.6, 0.08, 'highpass');
        this.noiseHit(t, 0.34, 320, 0.5, 0.55, 'lowpass', undefined, 90);
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
        const g = this.ctx.createGain();
        this.env(g, t, 0.32, 0.004, 0.6);
        o.connect(g).connect(this.sfx!);
        o.start(t);
        o.stop(t + 0.72);
        this.noiseHit(t + 0.05, 0.12, 180, 0.4, 0.9, 'lowpass');
        break;
      }
      case 'trapdoor':
        // Latch click, then hinge creak.
        this.noiseHit(t, 0.14, 2200, 4, 0.04);
        this.osc('sawtooth', 150, t + 0.04, 0.07, 0.02, 0.3);
        this.noiseHit(t + 0.05, 0.07, 700, 3, 0.28);
        break;
      case 'timeTravel':
        // Rewind: two tones sliding in opposite directions.
        {
          const up = this.osc('sine', 700, t, 0.14, 0.01, 0.5, undefined, 0.4);
          up?.frequency.exponentialRampToValueAtTime(1900, t + 0.45);
          const down = this.osc('sine', 1500, t, 0.1, 0.01, 0.5, undefined, 0.4);
          down?.frequency.exponentialRampToValueAtTime(600, t + 0.45);
          this.noiseHit(t, 0.06, 3000, 2, 0.4, 'bandpass', undefined, 8000);
        }
        break;
      case 'menu':
        this.osc('square', 700, t, 0.09, 0.003, 0.05);
        break;
    }
  }

  // ------------------------------------------------------------------ music

  private buildMusicBuses() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicMuted ? 0 : this.musicVolume;
    this.musicGain.connect(this.master);

    // One filter across the whole bed, so an intro can open up and the fanfare
    // can pull it back without touching the individual voices.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 16000;
    this.musicFilter.Q.value = 0.7;
    this.musicFilter.connect(this.musicGain);

    this.musicDrums = ctx.createGain();
    this.musicDrums.connect(this.musicFilter);

    // Everything except the drums passes through the duck, which the kick
    // pulls down on every beat. That pump is the pulse of the track.
    this.musicDuck = ctx.createGain();
    this.musicDuck.gain.value = 1;
    this.musicDuck.connect(this.musicFilter);

    this.musicTone = ctx.createGain();
    this.musicTone.connect(this.musicDuck);

    // Dotted-eighth delay at 124 BPM. It is the single cheapest trick for
    // making a two-note melody sound arranged.
    this.leadDelay = ctx.createDelay(1);
    this.leadDelay.delayTime.value = (60 / BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2600;
    this.leadDelay.connect(damp).connect(fb).connect(this.leadDelay);
    this.leadDelay.connect(this.musicDuck);
  }

  startMusic() {
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (!ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicStep = 0;
    this.musicNextTime = ctx.currentTime + 0.12;
    // 60 ms tick with 300 ms of lookahead: survives the timer throttling a
    // background tab applies without needing a worker.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
    this.scheduleMusic();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicPlaying) return;
    const horizon = ctx.currentTime + 0.3;
    let guard = 0;
    while (this.musicNextTime < horizon && guard++ < 64) {
      this.musicStep16(this.musicStep, this.musicNextTime);
      this.musicNextTime += STEP;
      this.musicStep = (this.musicStep + 1) % LOOP_STEPS;
    }
  }

  /**
   * The arrangement. Four eight-bar sections that add a layer each time —
   * drums, then pad, then lead, then counter-melody — so the 62-second loop
   * has an arc instead of being one bar repeated 32 times.
   */
  private musicStep16(step: number, t: number) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const section = Math.floor(bar / 8);
    const chord = bar % 4;
    const drums = this.musicDrums!;
    const tone = this.musicTone!;

    // Open the filter across the intro so the loop point sounds like a build,
    // not a restart.
    if (s === 0 && this.musicFilter) {
      const open = section === 0 ? 900 + bar * 900 : 16000;
      this.musicFilter.frequency.setTargetAtTime(open, t, 0.4);
    }

    // --- drums
    const fourOnFloor = section > 0;
    if (s === 0 || (fourOnFloor && s % 4 === 0) || (section >= 2 && s === 10)) {
      this.kick(t, drums);
    }
    if (s === 4 || s === 12) this.snare(t, drums, section);
    if (section > 0 && s % 2 === 1) this.hat(t, drums, s === 7 || s === 15 ? 0.16 : 0.035);
    if (section >= 3 && s % 4 === 2) this.hat(t, drums, 0.02);

    // --- bass: syncopated root, with the fifth on the pushes
    const root = CHORD_ROOTS[chord];
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) {
      const fifth = s === 6 || s === 14;
      this.bass(t, tone, this.hz(root + (fifth ? 7 : 0)), s === 0 ? 0.22 : 0.15);
    }

    // --- pad from bar 4 onwards
    if (s === 0 && (section > 0 || bar >= 4)) {
      for (const semi of CHORD_TONES[chord]) this.pad(t, tone, this.hz(semi), section >= 2 ? 0.05 : 0.065);
    }

    // --- lead melody, sections 2 and 3
    if (section >= 2) {
      const phraseStep = step % 32;
      const phrase = ((bar >> 1) & 3) >= 2 ? PHRASE_B : PHRASE_A;
      for (const [ps, semi, dur] of phrase) {
        if (ps === phraseStep) this.lead(t, this.hz(semi), dur * STEP, 0.11);
      }
    }

    // --- counter pluck in the final section, off the grid from the lead
    if (section >= 3 && s % 4 === 1) {
      const tones = CHORD_TONES[chord];
      const semi = tones[(s >> 2) % tones.length] + 12;
      this.pluck(t, tone, this.hz(semi), 0.045);
    }
  }

  /** Semitones relative to A3 (220 Hz), the key centre of the track. */
  private hz(semi: number) {
    return 220 * Math.pow(2, semi / 12);
  }

  private kick(t: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
    this.noiseHit(t, 0.05, 3000, 1, 0.008, 'highpass', dest);

    // Sidechain: everything but the drums drops and recovers over 180 ms.
    if (this.musicDuck) {
      this.musicDuck.gain.cancelScheduledValues(t);
      this.musicDuck.gain.setValueAtTime(0.5, t);
      this.musicDuck.gain.linearRampToValueAtTime(1, t + 0.18);
    }
  }

  private snare(t: number, dest: AudioNode, section: number) {
    // Body plus noise. The 190 Hz triangle is what stops it being a hiss.
    this.osc('triangle', 190, t, 0.09, 0.002, 0.09, dest);
    this.noiseHit(t, section > 0 ? 0.13 : 0.08, 1900, 0.9, 0.13, 'bandpass', dest);
    this.noiseHit(t, 0.05, 5200, 0.6, 0.06, 'highpass', dest);
  }

  private hat(t: number, dest: AudioNode, decay: number) {
    this.noiseHit(t, 0.035, 8500, 0.7, decay, 'highpass', dest);
  }

  private bass(t: number, dest: AudioNode, freq: number, level: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    // The filter envelope is the whole character of a synth bass: it opens on
    // the attack and shuts inside 150 ms, which is what makes it pluck.
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(320, t + 0.15);
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(f).connect(g).connect(dest);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(level * 0.7, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    sub.connect(sg).connect(dest);
    o.start(t);
    sub.start(t);
    o.stop(t + 0.3);
    sub.stop(t + 0.3);
  }

  private pad(t: number, dest: AudioNode, freq: number, level: number) {
    const ctx = this.ctx!;
    const dur = (60 / BPM) * 4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    f.Q.value = 1;
    const g = ctx.createGain();
    // Long attack so the pad swells under the bar rather than stabbing.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(dest);
    // Three detuned saws: two is a chorus, three is a pad.
    for (const detune of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private lead(t: number, freq: number, dur: number, level: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3600, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.012);
    g.gain.setValueAtTime(level, t + Math.max(0.02, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o.connect(f);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o2.connect(g2).connect(f);
    f.connect(g).connect(this.musicTone!);
    if (this.leadDelay) {
      const send = ctx.createGain();
      send.gain.value = 0.3;
      g.connect(send).connect(this.leadDelay);
    }
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.12);
    o2.stop(t + dur + 0.12);
  }

  private pluck(t: number, dest: AudioNode, freq: number, level: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(dest);
    if (this.leadDelay) {
      const send = ctx.createGain();
      send.gain.value = 0.22;
      g.connect(send).connect(this.leadDelay);
    }
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Pull the music down for `hold` seconds so a stinger reads clearly. */
  private duckMusic(to: number, hold: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || this.musicMuted) return;
    const t = ctx.currentTime;
    const full = this.musicVolume;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
    this.musicGain.gain.linearRampToValueAtTime(full * to, t + 0.08);
    this.musicGain.gain.setValueAtTime(full * to, t + hold * 0.6);
    this.musicGain.gain.linearRampToValueAtTime(full, t + hold);
  }

  // ------------------------------------------------------------------ mixer

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  setMusicVolume(v: number) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = this.musicMuted ? 0 : v;
  }

  setMusicMuted(m: boolean) {
    this.musicMuted = m;
    if (this.musicGain) this.musicGain.gain.value = m ? 0 : this.musicVolume;
  }

  toggleMusic() {
    this.setMusicMuted(!this.musicMuted);
    return !this.musicMuted;
  }

  dispose() {
    this.stopMusic();
    for (const s of this.rollSources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.rollSources.length = 0;
    try {
      this.rattleOsc?.stop();
      this.ringOsc?.stop();
      this.squealOsc?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close();
    this.ctx = null;
  }
}
