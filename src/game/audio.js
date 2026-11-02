/**
 * GameAudio — procedural Web Audio engine for the FPS.
 *
 * Everything is synthesized at runtime (no assets or network requests). The
 * graph is intentionally small: dry bus + generated-IR reverb send into a
 * master compressor/limiter. All one-shots are voice-capped and release their
 * nodes when finished. Every public method is safe to call before init().
 */

const MAX_VOICES = 32;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rand = (min, max) => min + Math.random() * (max - min);

const FOOTSTEP_SURFACES = {
  sand: { duration: 0.06, volume: 0.1, filter: "lowpass", frequency: 950, q: 0.5, tone: 72, toneVolume: 0.035 },
  dirt: { duration: 0.055, volume: 0.11, filter: "lowpass", frequency: 1200, q: 0.6, tone: 80, toneVolume: 0.035 },
  grass: { duration: 0.05, volume: 0.085, filter: "lowpass", frequency: 1850, q: 0.4, tone: 88, toneVolume: 0.02 },
  concrete: { duration: 0.038, volume: 0.14, filter: "bandpass", frequency: 1150, q: 0.9, tone: 118, toneVolume: 0.05 },
  wood: { duration: 0.052, volume: 0.125, filter: "bandpass", frequency: 620, q: 1.4, tone: 176, toneVolume: 0.05 },
  metal: { duration: 0.07, volume: 0.095, filter: "highpass", frequency: 2450, q: 1.1, tone: 1750, toneVolume: 0.03 },
  water: { duration: 0.09, volume: 0.115, filter: "bandpass", frequency: 480, q: 0.5, tone: 0, toneVolume: 0 },
};

export class GameAudio {
  constructor() {
    this._ctx = null;
    this._initPromise = null;

    this._dryBus = null;
    this._mixBus = null;
    this._reverbSend = null;
    this._convolver = null;
    this._reverbReturn = null;
    this._compressor = null;
    this._limiter = null;
    this._master = null;
    this._noiseBuffer = null;

    this._volume = 0.8;
    this._muted = false;

    this._activeVoices = 0;
    this._maxVoices = MAX_VOICES;
    this._footstepFlip = false;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle and master controls
  // ---------------------------------------------------------------------------

  async init() {
    if (this._initPromise) {
      await this._initPromise;
      await this._resumeContext();
      return;
    }

    if (this._ctx && this._ctx.state !== "closed") {
      await this._resumeContext();
      return;
    }

    if (this._ctx) this._clearGraph();

    this._initPromise = this._buildGraphSafe();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
    await this._resumeContext();
  }

  resume() {
    void this._resumeContext();
  }

  setVolume(v) {
    const value = Number(v);
    if (!Number.isFinite(value)) return;
    this._volume = clamp(value, 0, 1);
    this._applyVolume();
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    this._applyVolume();
  }

  async _resumeContext() {
    const ctx = this._ctx;
    if (!ctx || ctx.state !== "suspended") return;
    try {
      await ctx.resume();
    } catch {
      // Autoplay policy or a closed device; callers will retry on a gesture.
    }
  }

  async _buildGraphSafe() {
    try {
      this._buildGraph();
    } catch {
      this._clearGraph();
    }
  }

  _buildGraph() {
    const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioCtor !== "function") return;

    let ctx;
    try {
      ctx = new AudioCtor({ latencyHint: "interactive" });
    } catch {
      ctx = new AudioCtor();
    }
    this._ctx = ctx;

    const dryBus = ctx.createGain();
    dryBus.gain.value = 0.92;

    const mixBus = ctx.createGain();
    mixBus.gain.value = 0.95;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 16;
    compressor.ratio.value = 7;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.24;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.07;

    const dcGuard = ctx.createBiquadFilter();
    dcGuard.type = "highpass";
    dcGuard.frequency.value = 24;
    dcGuard.Q.value = 0.7;

    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : this._volume;

    dryBus.connect(mixBus);
    mixBus.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(dcGuard);
    dcGuard.connect(master);
    master.connect(ctx.destination);

    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 1;

    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = this._makeImpulseResponse(ctx);

    const reverbHighpass = ctx.createBiquadFilter();
    reverbHighpass.type = "highpass";
    reverbHighpass.frequency.value = 170;

    const reverbLowpass = ctx.createBiquadFilter();
    reverbLowpass.type = "lowpass";
    reverbLowpass.frequency.value = 6200;

    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.55;

    reverbSend.connect(convolver);
    convolver.connect(reverbHighpass);
    reverbHighpass.connect(reverbLowpass);
    reverbLowpass.connect(reverbReturn);
    reverbReturn.connect(mixBus);

    this._dryBus = dryBus;
    this._mixBus = mixBus;
    this._reverbSend = reverbSend;
    this._convolver = convolver;
    this._reverbReturn = reverbReturn;
    this._compressor = compressor;
    this._limiter = limiter;
    this._master = master;
    this._noiseBuffer = this._makeNoiseBuffer(ctx);

    this._applyVolume();
  }

  _clearGraph() {
    const ctx = this._ctx;
    try {
      if (ctx && ctx.state !== "closed") ctx.close();
    } catch {
      // Already closed.
    }

    this._ctx = null;
    this._dryBus = null;
    this._mixBus = null;
    this._reverbSend = null;
    this._convolver = null;
    this._reverbReturn = null;
    this._compressor = null;
    this._limiter = null;
    this._master = null;
    this._noiseBuffer = null;
    this._activeVoices = 0;
  }

  _applyVolume() {
    if (!this._ctx || !this._master) return;
    try {
      const now = this._ctx.currentTime;
      const gain = this._master.gain;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(this._muted ? 0 : this._volume, now, 0.015);
    } catch {
      // Ignore automation failures on partially torn-down graphs.
    }
  }

  _makeNoiseBuffer(ctx) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _makeImpulseResponse(ctx) {
    const seconds = 1.35;
    const decay = 3.2;
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = ctx.createBuffer(2, length, rate);
    const preDelay = Math.floor(rate * 0.012);

    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      let smoothed = 0;

      for (let i = 0; i < length; i += 1) {
        const noise = Math.random() * 2 - 1;
        smoothed = smoothed * 0.66 + noise * 0.34;
        const falloff = Math.pow(1 - i / length, decay);
        data[i] = i < preDelay ? 0 : smoothed * falloff;
      }

      // A few decorrelated early reflections make the tail feel like a room.
      const taps = [0.009, 0.017, 0.029, 0.043, 0.061];
      for (let i = 0; i < taps.length; i += 1) {
        const index = preDelay + Math.floor(rate * taps[i]);
        if (index < length) {
          data[index] += (Math.random() * 2 - 1) * (0.4 - i * 0.055);
        }
      }
    }

    return impulse;
  }

  // ---------------------------------------------------------------------------
  // Voice management
  // ---------------------------------------------------------------------------

  _canPlay() {
    return Boolean(
      this._ctx &&
        this._ctx.state === "running" &&
        this._dryBus &&
        this._reverbSend &&
        this._master &&
        this._noiseBuffer,
    );
  }

  _createVoice(duration, level, pan, wet) {
    if (!this._canPlay() || this._activeVoices >= this._maxVoices) return null;

    const ctx = this._ctx;
    const now = ctx.currentTime;

    const mix = ctx.createGain();
    mix.gain.value = level;

    let panner = null;
    if (typeof ctx.createStereoPanner === "function") {
      panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      mix.connect(panner);
      panner.connect(this._dryBus);
    } else {
      mix.connect(this._dryBus);
    }

    const wetGain = ctx.createGain();
    wetGain.gain.value = clamp(wet, 0, 1);
    if (panner) panner.connect(wetGain);
    else mix.connect(wetGain);
    wetGain.connect(this._reverbSend);

    const nodes = [mix, wetGain];
    if (panner) nodes.push(panner);

    const voice = {
      ctx,
      now,
      endTime: now + Math.max(0.02, duration),
      mix,
      panner,
      nodes,
      sources: [],
      primary: null,
      primaryStop: -Infinity,
      done: false,
      cleanup: null,
    };

    this._activeVoices += 1;
    return voice;
  }

  _source(voice, source, start, stop) {
    source.start(start);
    source.stop(stop);
    voice.sources.push(source);
    if (stop >= voice.primaryStop) {
      voice.primaryStop = stop;
      voice.primary = source;
    }
    if (stop > voice.endTime) voice.endTime = stop;
    return source;
  }

  _finishVoice(voice) {
    if (!voice || voice.done) return;
    voice.done = true;

    let cleaned = false;
    let timer = 0;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timer) clearTimeout(timer);

      for (const source of voice.sources) {
        try {
          source.disconnect();
        } catch {
          // Node may already be disconnected by the browser.
        }
      }
      for (const node of voice.nodes) {
        try {
          node.disconnect();
        } catch {
          // Node may already be disconnected by the browser.
        }
      }

      voice.sources.length = 0;
      voice.nodes.length = 0;
      voice.primary = null;
      voice.cleanup = null;
      this._activeVoices = Math.max(0, this._activeVoices - 1);
    };

    voice.cleanup = cleanup;

    if (voice.primary) {
      try {
        voice.primary.addEventListener("ended", cleanup, { once: true });
      } catch {
        voice.primary.onended = cleanup;
      }
    }

    // Fallback for browsers that do not fire "ended" reliably after suspend.
    const delay = Math.max(80, (voice.endTime - voice.ctx.currentTime + 0.35) * 1000);
    timer = setTimeout(cleanup, delay);
  }

  _play(options, build) {
    const { duration = 0.3, level = 1, pan = 0, wet = 0.16 } = options || {};
    let voice = null;
    try {
      voice = this._createVoice(duration, level, pan, wet);
      if (!voice) return;
      build(voice);
    } catch {
      // Audio must never break gameplay.
    } finally {
      if (voice) this._finishVoice(voice);
    }
  }

  // ---------------------------------------------------------------------------
  // Synthesis primitives
  // ---------------------------------------------------------------------------

  _addNoise(voice, options = {}) {
    const {
      start = voice.now,
      duration = 0.08,
      volume = 0.25,
      filter = "bandpass",
      frequency = 1500,
      frequencyEnd = null,
      q = 0.8,
      rate = 1,
      attack = 0.001,
    } = options;

    const ctx = voice.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.playbackRate.value = Math.max(0.25, rate);

    const filterNode = ctx.createBiquadFilter();
    filterNode.type = filter;
    filterNode.Q.value = Math.max(0.0001, q);

    const startFrequency = clamp(frequency, 20, ctx.sampleRate * 0.45);
    filterNode.frequency.setValueAtTime(startFrequency, start);
    if (frequencyEnd) {
      const endFrequency = clamp(frequencyEnd, 20, ctx.sampleRate * 0.45);
      filterNode.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + Math.max(0.005, duration * 0.9),
      );
    }

    const gain = ctx.createGain();
    const peak = Math.max(0.0002, volume);
    const attackTime = Math.min(Math.max(0.0005, attack), duration * 0.5);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filterNode);
    filterNode.connect(gain);
    gain.connect(voice.mix);
    voice.nodes.push(filterNode, gain);

    const safeDuration = Math.max(0.005, duration);
    const maxOffset = Math.max(
      0,
      this._noiseBuffer.duration - safeDuration * source.playbackRate.value - 0.02,
    );
    const offset = Math.random() * maxOffset;
    this._source(voice, source, start, start + safeDuration + 0.03);
  }

  _addTone(voice, options = {}) {
    const {
      start = voice.now,
      duration = 0.15,
      volume = 0.2,
      type = "sine",
      frequency = 200,
      frequencyEnd = null,
      attack = 0.001,
      detune = 0,
    } = options;

    const ctx = voice.ctx;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.detune.setValueAtTime(detune, start);

    const startFrequency = Math.max(10, frequency);
    oscillator.frequency.setValueAtTime(startFrequency, start);
    if (frequencyEnd) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(10, frequencyEnd),
        start + Math.max(0.005, duration * 0.82),
      );
    }

    const gain = ctx.createGain();
    const peak = Math.max(0.0002, volume);
    const attackTime = Math.min(Math.max(0.0005, attack), duration * 0.5);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(voice.mix);
    voice.nodes.push(gain);

    this._source(voice, oscillator, start, start + duration + 0.03);
  }

  // ---------------------------------------------------------------------------
  // Weapons and combat
  // ---------------------------------------------------------------------------

  shoot(kind = "rifle") {
    const type = typeof kind === "string" ? kind.toLowerCase() : "rifle";
    const pitch = rand(0.93, 1.07);

    // Enemy fire gets a deliberately wide, random stereo position.
    const pan =
      type === "enemy"
        ? (Math.random() < 0.5 ? -1 : 1) * rand(0.42, 0.9)
        : rand(-0.18, 0.18);

    if (type === "pistol") {
      this._play({ duration: 0.26, level: 0.74, pan, wet: 0.22 }, (voice) => {
        const t = voice.now;
        this._addNoise(voice, {
          start: t,
          duration: 0.04,
          volume: 0.56,
          filter: "highpass",
          frequency: 2400 * pitch,
          q: 0.7,
          rate: rand(0.9, 1.15),
        });
        this._addNoise(voice, {
          start: t + 0.003,
          duration: 0.055,
          volume: 0.23,
          filter: "bandpass",
          frequency: 1050 * pitch,
          q: 1.2,
        });
        this._addTone(voice, {
          start: t + 0.002,
          duration: 0.085,
          volume: 0.27,
          type: "triangle",
          frequency: 285 * pitch,
          frequencyEnd: 108 * pitch,
        });
        this._addTone(voice, {
          start: t,
          duration: 0.11,
          volume: 0.33,
          type: "sine",
          frequency: 132 * pitch,
          frequencyEnd: 68,
        });
        this._addNoise(voice, {
          start: t,
          duration: 0.009,
          volume: 0.14,
          filter: "highpass",
          frequency: 6000,
          q: 0.7,
          rate: 1.4,
          attack: 0.0005,
        });
      });
      return;
    }

    if (type === "heavy") {
      this._play({ duration: 0.6, level: 0.96, pan, wet: 0.38 }, (voice) => {
        const t = voice.now;
        this._addTone(voice, {
          start: t,
          duration: 0.4,
          volume: 0.8,
          type: "sine",
          frequency: 68 * pitch,
          frequencyEnd: 28,
        });
        this._addTone(voice, {
          start: t + 0.003,
          duration: 0.3,
          volume: 0.5,
          type: "triangle",
          frequency: 112 * pitch,
          frequencyEnd: 36,
        });
        this._addNoise(voice, {
          start: t,
          duration: 0.25,
          volume: 0.55,
          filter: "lowpass",
          frequency: 2400 * pitch,
          frequencyEnd: 340,
          q: 0.8,
          rate: rand(0.85, 1.05),
        });
        this._addNoise(voice, {
          start: t,
          duration: 0.085,
          volume: 0.45,
          filter: "highpass",
          frequency: 1250 * pitch,
          q: 0.7,
          rate: rand(0.9, 1.1),
        });
        this._addNoise(voice, {
          start: t,
          duration: 0.018,
          volume: 0.18,
          filter: "highpass",
          frequency: 4800,
          q: 0.6,
          rate: 1.3,
          attack: 0.0005,
        });
      });
      return;
    }

    if (type === "enemy") {
      const enemyPitch = rand(0.84, 1.16);
      this._play({ duration: 0.48, level: 0.68, pan, wet: 0.5 }, (voice) => {
        const t = voice.now;
        this._addNoise(voice, {
          start: t,
          duration: 0.052,
          volume: 0.36,
          filter: "bandpass",
          frequency: 2300 * enemyPitch,
          q: 1.6,
          rate: rand(0.85, 1.2),
        });
        this._addNoise(voice, {
          start: t + 0.006,
          duration: 0.14,
          volume: 0.2,
          filter: "bandpass",
          frequency: 820 * enemyPitch,
          frequencyEnd: 420,
          q: 2.2,
          rate: rand(0.9, 1.1),
        });
        this._addTone(voice, {
          start: t + 0.002,
          duration: 0.15,
          volume: 0.23,
          type: "sawtooth",
          frequency: 330 * enemyPitch,
          frequencyEnd: 92,
        });
        this._addTone(voice, {
          start: t + 0.005,
          duration: 0.2,
          volume: 0.12,
          type: "triangle",
          frequency: 1380 * enemyPitch,
          frequencyEnd: 710,
        });
        this._addNoise(voice, {
          start: t,
          duration: 0.008,
          volume: 0.08,
          filter: "highpass",
          frequency: 5200,
          q: 0.8,
          rate: 1.5,
          attack: 0.0005,
        });
      });
      return;
    }

    // Rifle: hard noise crack, filtered mid snap, triangle body, sub thump.
    this._play({ duration: 0.36, level: 0.9, pan, wet: 0.3 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.06,
        volume: 0.62,
        filter: "highpass",
        frequency: 1500 * pitch,
        q: 0.65,
        rate: rand(0.85, 1.15),
      });
      this._addNoise(voice, {
        start: t + 0.004,
        duration: 0.085,
        volume: 0.3,
        filter: "bandpass",
        frequency: 650 * pitch,
        q: 1.2,
        rate: rand(0.9, 1.1),
      });
      this._addTone(voice, {
        start: t + 0.002,
        duration: 0.17,
        volume: 0.4,
        type: "triangle",
        frequency: 175 * pitch,
        frequencyEnd: 52,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.23,
        volume: 0.55,
        type: "sine",
        frequency: 90 * pitch,
        frequencyEnd: 38,
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.012,
        volume: 0.18,
        filter: "highpass",
        frequency: 5200,
        q: 0.7,
        rate: 1.4,
        attack: 0.0005,
      });
    });
  }

  reload(stage = "out") {
    const type = typeof stage === "string" ? stage.toLowerCase() : "out";
    const pan = rand(-0.12, 0.12);

    if (type === "in") {
      this._play({ duration: 0.34, level: 0.52, pan, wet: 0.14 }, (voice) => {
        const t = voice.now;
        this._addNoise(voice, {
          start: t,
          duration: 0.052,
          volume: 0.2,
          filter: "bandpass",
          frequency: 520,
          q: 1.1,
          rate: rand(0.9, 1.1),
        });
        this._addTone(voice, {
          start: t,
          duration: 0.11,
          volume: 0.34,
          type: "sine",
          frequency: 126,
          frequencyEnd: 58,
        });
        this._addNoise(voice, {
          start: t + 0.028,
          duration: 0.012,
          volume: 0.12,
          filter: "highpass",
          frequency: 4100,
          q: 0.8,
          rate: 1.25,
          attack: 0.0005,
        });
        this._addTone(voice, {
          start: t + 0.045,
          duration: 0.045,
          volume: 0.06,
          type: "triangle",
          frequency: 1250,
          frequencyEnd: 940,
        });
      });
      return;
    }

    if (type === "bolt") {
      this._play({ duration: 0.44, level: 0.5, pan, wet: 0.16 }, (voice) => {
        const t = voice.now;
        this._addNoise(voice, {
          start: t,
          duration: 0.13,
          volume: 0.1,
          filter: "bandpass",
          frequency: 1500,
          frequencyEnd: 4300,
          q: 2.4,
          rate: rand(0.85, 1.1),
        });
        this._addTone(voice, {
          start: t + 0.01,
          duration: 0.08,
          volume: 0.045,
          type: "triangle",
          frequency: 1900,
          frequencyEnd: 1450,
        });
        this._addNoise(voice, {
          start: t + 0.135,
          duration: 0.014,
          volume: 0.14,
          filter: "highpass",
          frequency: 3600,
          q: 0.8,
          rate: 1.2,
          attack: 0.0005,
        });
        this._addTone(voice, {
          start: t + 0.138,
          duration: 0.055,
          volume: 0.06,
          type: "square",
          frequency: 1650,
          frequencyEnd: 980,
        });
        this._addNoise(voice, {
          start: t + 0.23,
          duration: 0.012,
          volume: 0.1,
          filter: "highpass",
          frequency: 4400,
          q: 0.9,
          rate: 1.4,
          attack: 0.0005,
        });
      });
      return;
    }

    // Magazine release / generic reload "out" click.
    this._play({ duration: 0.26, level: 0.5, pan, wet: 0.12 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.013,
        volume: 0.15,
        filter: "highpass",
        frequency: 3600,
        q: 0.8,
        rate: 1.3,
        attack: 0.0005,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.04,
        volume: 0.075,
        type: "square",
        frequency: 1050,
        frequencyEnd: 720,
      });
      this._addTone(voice, {
        start: t + 0.012,
        duration: 0.07,
        volume: 0.16,
        type: "sine",
        frequency: 150,
        frequencyEnd: 84,
      });
      this._addNoise(voice, {
        start: t + 0.062,
        duration: 0.011,
        volume: 0.09,
        filter: "highpass",
        frequency: 3000,
        q: 0.8,
        rate: 1.2,
        attack: 0.0005,
      });
    });
  }

  impact() {
    this._play({ duration: 0.2, level: 0.52, pan: rand(-0.3, 0.3), wet: 0.2 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.06,
        volume: 0.35,
        filter: "bandpass",
        frequency: 1350,
        frequencyEnd: 320,
        q: 1.1,
        rate: rand(0.85, 1.15),
      });
      this._addTone(voice, {
        start: t,
        duration: 0.08,
        volume: 0.3,
        type: "sine",
        frequency: 150,
        frequencyEnd: 64,
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.01,
        volume: 0.1,
        filter: "highpass",
        frequency: 3800,
        q: 0.7,
        attack: 0.0005,
      });
    });
  }

  headshot() {
    this._play({ duration: 0.34, level: 0.72, pan: rand(-0.12, 0.12), wet: 0.28 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.026,
        volume: 0.3,
        filter: "highpass",
        frequency: 3600,
        q: 0.7,
        rate: rand(0.95, 1.15),
      });
      this._addTone(voice, {
        start: t,
        duration: 0.11,
        volume: 0.16,
        type: "triangle",
        frequency: 1420,
        frequencyEnd: 810,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.13,
        volume: 0.36,
        type: "sine",
        frequency: 185,
        frequencyEnd: 62,
      });
      this._addNoise(voice, {
        start: t + 0.005,
        duration: 0.05,
        volume: 0.18,
        filter: "bandpass",
        frequency: 920,
        q: 1.4,
      });
    });
  }

  kill() {
    this._play({ duration: 0.55, level: 0.7, pan: rand(-0.08, 0.08), wet: 0.3 }, (voice) => {
      const t = voice.now;
      this._addTone(voice, {
        start: t,
        duration: 0.18,
        volume: 0.38,
        type: "sine",
        frequency: 100,
        frequencyEnd: 54,
      });
      this._addTone(voice, {
        start: t + 0.04,
        duration: 0.13,
        volume: 0.12,
        type: "triangle",
        frequency: 660,
        frequencyEnd: 650,
      });
      this._addTone(voice, {
        start: t + 0.11,
        duration: 0.17,
        volume: 0.1,
        type: "sine",
        frequency: 990,
        frequencyEnd: 985,
      });
    });
  }

  hurt() {
    this._play({ duration: 0.38, level: 0.7, pan: rand(-0.18, 0.18), wet: 0.18 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.16,
        volume: 0.34,
        filter: "lowpass",
        frequency: 900,
        frequencyEnd: 260,
        q: 0.8,
        rate: rand(0.8, 1.05),
      });
      this._addTone(voice, {
        start: t,
        duration: 0.22,
        volume: 0.52,
        type: "sine",
        frequency: 96,
        frequencyEnd: 42,
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.014,
        volume: 0.1,
        filter: "highpass",
        frequency: 1900,
        q: 0.7,
        attack: 0.0005,
      });
    });
  }

  explosion() {
    this._play({ duration: 1.6, level: 0.98, pan: rand(-0.45, 0.45), wet: 0.68 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 1.1,
        volume: 0.72,
        filter: "lowpass",
        frequency: 3600,
        frequencyEnd: 130,
        q: 0.8,
        rate: rand(0.75, 0.95),
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.36,
        volume: 0.42,
        filter: "bandpass",
        frequency: 720,
        frequencyEnd: 240,
        q: 0.7,
        rate: rand(0.8, 1.0),
      });
      this._addTone(voice, {
        start: t,
        duration: 0.9,
        volume: 0.82,
        type: "sine",
        frequency: 62,
        frequencyEnd: 24,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.36,
        volume: 0.38,
        type: "triangle",
        frequency: 108,
        frequencyEnd: 40,
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.045,
        volume: 0.36,
        filter: "highpass",
        frequency: 1800,
        q: 0.6,
        rate: 1.1,
        attack: 0.0005,
      });
    });
  }

  shellDrop() {
    const pitch = rand(0.88, 1.18);
    this._play({ duration: 0.24, level: 0.32, pan: rand(-0.6, 0.6), wet: 0.12 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.015,
        volume: 0.06,
        filter: "highpass",
        frequency: 4600,
        q: 0.8,
        rate: 1.4,
        attack: 0.0005,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.09,
        volume: 0.055,
        type: "triangle",
        frequency: 2600 * pitch,
        frequencyEnd: 1680 * pitch,
      });
      this._addTone(voice, {
        start: t + 0.062,
        duration: 0.07,
        volume: 0.032,
        type: "triangle",
        frequency: 2050 * pitch,
        frequencyEnd: 1420 * pitch,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  footstep(surface = "sand") {
    const key = typeof surface === "string" ? surface.toLowerCase() : "sand";
    const preset = FOOTSTEP_SURFACES[key] || FOOTSTEP_SURFACES.sand;

    this._footstepFlip = !this._footstepFlip;
    const pitch = this._footstepFlip ? 1.07 : 0.91;
    const pan = (this._footstepFlip ? 1 : -1) * rand(0.02, 0.08);

    this._play(
      { duration: Math.max(0.15, preset.duration + 0.1), level: 0.36, pan, wet: 0.08 },
      (voice) => {
        const t = voice.now;
        this._addNoise(voice, {
          start: t,
          duration: preset.duration,
          volume: preset.volume,
          filter: preset.filter,
          frequency: preset.frequency * pitch,
          q: preset.q,
          rate: rand(0.9, 1.1),
          attack: 0.002,
        });

        if (preset.tone > 0) {
          this._addTone(voice, {
            start: t,
            duration: preset.duration + 0.035,
            volume: preset.toneVolume,
            type: "sine",
            frequency: preset.tone * pitch,
            frequencyEnd: preset.tone * 0.7,
          });
        }
      },
    );
  }

  jump() {
    this._play({ duration: 0.26, level: 0.48, pan: rand(-0.08, 0.08), wet: 0.12 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.16,
        volume: 0.15,
        filter: "bandpass",
        frequency: 600,
        frequencyEnd: 1900,
        q: 0.8,
        rate: rand(0.9, 1.1),
        attack: 0.012,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.12,
        volume: 0.07,
        type: "sine",
        frequency: 170,
        frequencyEnd: 260,
        attack: 0.01,
      });
    });
  }

  land() {
    this._play({ duration: 0.32, level: 0.68, pan: rand(-0.1, 0.1), wet: 0.18 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.1,
        volume: 0.3,
        filter: "lowpass",
        frequency: 760,
        frequencyEnd: 210,
        q: 0.7,
        rate: rand(0.85, 1.05),
      });
      this._addTone(voice, {
        start: t,
        duration: 0.18,
        volume: 0.6,
        type: "sine",
        frequency: 118,
        frequencyEnd: 42,
      });
      this._addNoise(voice, {
        start: t,
        duration: 0.012,
        volume: 0.1,
        filter: "highpass",
        frequency: 2700,
        q: 0.7,
        attack: 0.0005,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Pickups and round-flow stingers
  // ---------------------------------------------------------------------------

  pickup() {
    this._play({ duration: 0.48, level: 0.58, pan: rand(-0.1, 0.1), wet: 0.26 }, (voice) => {
      const t = voice.now;
      this._addTone(voice, {
        start: t,
        duration: 0.1,
        volume: 0.14,
        type: "sine",
        frequency: 880,
        frequencyEnd: 878,
      });
      this._addTone(voice, {
        start: t + 0.07,
        duration: 0.15,
        volume: 0.12,
        type: "sine",
        frequency: 1320,
        frequencyEnd: 1318,
      });
      this._addTone(voice, {
        start: t + 0.13,
        duration: 0.1,
        volume: 0.05,
        type: "triangle",
        frequency: 1760,
        frequencyEnd: 1755,
      });
    });
  }

  waveStart() {
    this._play({ duration: 0.85, level: 0.6, pan: 0, wet: 0.24 }, (voice) => {
      const t = voice.now;
      this._addTone(voice, {
        start: t,
        duration: 0.3,
        volume: 0.24,
        type: "sine",
        frequency: 110,
        frequencyEnd: 108,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.34,
        volume: 0.14,
        type: "triangle",
        frequency: 165,
        frequencyEnd: 163,
      });
      this._addTone(voice, {
        start: t + 0.14,
        duration: 0.46,
        volume: 0.1,
        type: "sine",
        frequency: 220,
        frequencyEnd: 218,
      });
    });
  }

  waveClear() {
    this._play({ duration: 1.1, level: 0.66, pan: 0, wet: 0.32 }, (voice) => {
      const t = voice.now;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i += 1) {
        this._addTone(voice, {
          start: t + i * 0.11,
          duration: 0.3,
          volume: 0.14,
          type: "triangle",
          frequency: notes[i],
          frequencyEnd: notes[i] * 0.995,
        });
      }
      this._addTone(voice, {
        start: t,
        duration: 0.55,
        volume: 0.07,
        type: "sine",
        frequency: 130.81,
        frequencyEnd: 130,
      });
    });
  }

  victory() {
    this._play({ duration: 1.9, level: 0.7, pan: 0, wet: 0.38 }, (voice) => {
      const t = voice.now;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const starts = [0, 0.12, 0.24, 0.37];
      for (let i = 0; i < notes.length; i += 1) {
        this._addTone(voice, {
          start: t + starts[i],
          duration: i === notes.length - 1 ? 0.9 : 0.5,
          volume: 0.13,
          type: "triangle",
          frequency: notes[i],
          frequencyEnd: notes[i],
        });
        this._addTone(voice, {
          start: t + starts[i],
          duration: i === notes.length - 1 ? 0.9 : 0.5,
          volume: 0.04,
          type: "sine",
          frequency: notes[i] * 2,
          frequencyEnd: notes[i] * 2,
        });
      }
      this._addTone(voice, {
        start: t,
        duration: 1.2,
        volume: 0.1,
        type: "sine",
        frequency: 130.81,
        frequencyEnd: 130.5,
      });
    });
  }

  defeat() {
    this._play({ duration: 1.8, level: 0.64, pan: 0, wet: 0.38 }, (voice) => {
      const t = voice.now;
      const notes = [392, 329.63, 261.63, 196];
      const starts = [0, 0.16, 0.33, 0.54];
      for (let i = 0; i < notes.length; i += 1) {
        this._addTone(voice, {
          start: t + starts[i],
          duration: 0.5,
          volume: 0.13,
          type: "triangle",
          frequency: notes[i],
          frequencyEnd: notes[i] * 0.985,
        });
      }
      this._addTone(voice, {
        start: t + 0.18,
        duration: 1.1,
        volume: 0.15,
        type: "sine",
        frequency: 98,
        frequencyEnd: 72,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  uiClick() {
    this._play({ duration: 0.1, level: 0.34, pan: 0, wet: 0.04 }, (voice) => {
      const t = voice.now;
      this._addNoise(voice, {
        start: t,
        duration: 0.012,
        volume: 0.075,
        filter: "highpass",
        frequency: 3200,
        q: 0.7,
        rate: 1.25,
        attack: 0.0005,
      });
      this._addTone(voice, {
        start: t,
        duration: 0.026,
        volume: 0.035,
        type: "square",
        frequency: 1500,
        frequencyEnd: 1080,
      });
    });
  }

  uiHover() {
    this._play({ duration: 0.08, level: 0.3, pan: 0, wet: 0.03 }, (voice) => {
      this._addTone(voice, {
        start: voice.now,
        duration: 0.028,
        volume: 0.026,
        type: "sine",
        frequency: 620,
        frequencyEnd: 610,
      });
    });
  }
}
