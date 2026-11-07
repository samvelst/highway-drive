// Every sound is synthesized with Web Audio, so there are no audio files to load.

function makeNoiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buffer;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOn = false;
    const unlock = () => this.unlock();
    // iOS only allows audio to start from some of these, so listen for them all.
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, unlock);
  }

  get blocked() {
    return !this.ctx || this.ctx.state !== 'running';
  }

  unlock() {
    if (!this.ctx) this.build();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);

    this.noise = makeNoiseBuffer(ctx, 2);

    // A long, open reverb for howls and sad notes.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 3.2, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    // Engine: two detuned saws through a lowpass that opens with speed.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc = [0, 7].map((detune, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'square';
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.32 : 0.1;
      osc.connect(g).connect(this.engineFilter);
      osc.start();
      return osc;
    });

    // Road and wind: looped noise.
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'bandpass';
    this.roadFilter.frequency.value = 700;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    const road = ctx.createBufferSource();
    road.buffer = this.noise;
    road.loop = true;
    road.connect(this.roadFilter).connect(this.roadGain).connect(this.master);
    road.start();

    // Fire crackle: noise that gets gated by random bursts.
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'bandpass';
    fireFilter.frequency.value = 1200;
    fireFilter.Q.value = 0.6;
    const fire = ctx.createBufferSource();
    fire.buffer = this.noise;
    fire.loop = true;
    fire.connect(fireFilter).connect(this.fireGain).connect(this.master);
    fire.start();
    this.fireLevel = 0;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    return this.muted;
  }

  /** Called each frame. speedRatio is 0..1, shoulder adds gravel rumble. */
  updateDriving({ active, electric, speed, speedRatio, throttle, shoulder, dt }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Fake gears: revs climb then drop within each band.
    const gears = 5;
    const band = Math.min(gears - 1, Math.floor(speedRatio * gears));
    const within = speedRatio * gears - band;
    const rpm = 70 + band * 8 + within * 62;
    this.engineOsc[0].frequency.setTargetAtTime(rpm, t, 0.05);
    this.engineOsc[1].frequency.setTargetAtTime(rpm * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + speedRatio * 800 + Math.max(0, throttle) * 500, t, 0.08);
    const engineOn = active && !electric; // electric cars only make road and wind noise
    this.engineGain.gain.setTargetAtTime(engineOn ? 0.13 + Math.max(0, throttle) * 0.05 : 0, t, 0.12);
    this.roadFilter.frequency.setTargetAtTime(shoulder ? 260 : 600 + Math.min(speed, 90) * 12, t, 0.1);
    this.roadGain.gain.setTargetAtTime(active ? (shoulder ? 0.5 : 0.03 + speedRatio * 0.09) : 0, t, 0.1);

    // Crackle the fire by jittering its level.
    if (this.fireLevel > 0) {
      const jitter = Math.random() < dt * 28 ? 0.2 + Math.random() * 0.55 : 0.06;
      this.fireGain.gain.setTargetAtTime(this.fireLevel * jitter, t, 0.012);
    } else {
      this.fireGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  setFire(level) {
    this.fireLevel = level;
  }

  noiseBurst({ duration, freq, q = 0.7, gain, type = 'lowpass', sweepTo, delay = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.noiseBurst({ duration: 1.1, freq: 3200, sweepTo: 180, gain: 1.1 });
    // Low body thump.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(1.2, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.65);
    // Falling glass and metal.
    for (let i = 0; i < 14; i++) {
      this.noiseBurst({
        duration: 0.05 + Math.random() * 0.1,
        freq: 3500 + Math.random() * 5000,
        q: 12,
        type: 'bandpass',
        gain: 0.8 * Math.random() + 0.2,
        delay: 0.1 + Math.random() * 0.9,
      });
    }
  }

  scrape() {
    this.noiseBurst({ duration: 0.16, freq: 2600, q: 5, type: 'bandpass', gain: 0.32 });
  }

  /** A falling minor phrase on a soft, muted brass voice. */
  sadPhrase() {
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.05;
    const notes = [
      [392.0, 0.3], // G4
      [369.99, 0.3], // F#4
      [349.23, 0.3], // F4
      [329.63, 1.3], // E4, held with a sagging vibrato
    ];
    let t = start;
    for (const [freq, len] of notes) {
      const last = len > 1;
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        osc.detune.value = detune;
        if (last) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = 5.5;
          depth.gain.setValueAtTime(0, t);
          depth.gain.linearRampToValueAtTime(10, t + 0.4);
          lfo.connect(depth).connect(osc.frequency);
          osc.frequency.linearRampToValueAtTime(freq * 0.93, t + len);
          lfo.start(t);
          lfo.stop(t + len);
        }
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(350, t);
        f.frequency.linearRampToValueAtTime(1100, t + 0.09);
        f.frequency.linearRampToValueAtTime(420, t + len);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.05);
        g.gain.setValueAtTime(0.2, t + len * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        osc.connect(f).connect(g);
        g.connect(this.master);
        g.connect(this.reverb);
        osc.start(t);
        osc.stop(t + len + 0.02);
      }
      t += len + 0.03;
    }
  }

  /** Short pained voice that differs for dogs and cats, followed by the sad phrase. */
  petHit(kind) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.noiseBurst({ duration: 0.14, freq: 500, gain: 0.45 });
    const pts = kind === 'cat'
      ? [[720, 0], [1020, 0.12], [640, 0.5]]
      : [[1050, 0], [720, 0.18], [860, 0.27], [420, 0.62]];
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    pts.forEach(([f, at], i) => {
      if (i === 0) osc.frequency.setValueAtTime(f, t);
      else osc.frequency.exponentialRampToValueAtTime(f, t + at);
    });
    const end = pts[pts.length - 1][1];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + end);
    osc.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    osc.start(t);
    osc.stop(t + end + 0.02);
    this.sadPhrase();
  }

  /** Two soft, rising chirps for a penguin. */
  penguinHit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.noiseBurst({ duration: 0.1, freq: 700, gain: 0.3 });
    [0, 0.13].forEach((delay, i) => {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 1250 : 1600, t);
      osc.frequency.exponentialRampToValueAtTime(i === 0 ? 1900 : 2500, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  /** A falling whistle timed to the orca's descent. */
  orcaFall(seconds) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + seconds * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** Wet impact with a rising whale call. Quieter when the orca lands far away. */
  orcaLand(volume = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.noiseBurst({ duration: 0.55, freq: 1800, sweepTo: 200, gain: 0.9 * volume });
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(95, t);
    thump.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(1.1 * volume, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.47);

    const call = ctx.createOscillator();
    call.type = 'triangle';
    call.frequency.setValueAtTime(520, t + 0.1);
    call.frequency.exponentialRampToValueAtTime(1500, t + 0.65);
    call.frequency.exponentialRampToValueAtTime(760, t + 1.1);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t + 0.1);
    cg.gain.linearRampToValueAtTime(0.2 * volume, t + 0.3);
    cg.gain.linearRampToValueAtTime(0.0001, t + 1.1);
    call.connect(cg);
    cg.connect(this.master);
    cg.connect(this.reverb);
    call.start(t + 0.1);
    call.stop(t + 1.15);
  }

  /** A pack-free single wolf: a rising, wavering howl with a formant filter. */
  howl() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const dur = 3.1;
    this.noiseBurst({ duration: 0.14, freq: 500, gain: 0.35 });

    const voice = (base, level, delay) => {
      const s = t + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 0.62, s);
      osc.frequency.exponentialRampToValueAtTime(base, s + 0.55);
      osc.frequency.setValueAtTime(base, s + 1.7);
      osc.frequency.linearRampToValueAtTime(base * 1.05, s + 2.1);
      osc.frequency.exponentialRampToValueAtTime(base * 0.68, s + dur);

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4.6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, s);
      depth.gain.linearRampToValueAtTime(base * 0.012, s + 1);
      lfo.connect(depth).connect(osc.frequency);

      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 3.2;
      formant.frequency.setValueAtTime(base * 1.2, s);
      formant.frequency.linearRampToValueAtTime(base * 2.3, s + 0.8);
      formant.frequency.linearRampToValueAtTime(base * 1.1, s + dur);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(level, s + 0.5);
      g.gain.setValueAtTime(level, s + 2.1);
      g.gain.exponentialRampToValueAtTime(0.001, s + dur);

      osc.connect(formant).connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      osc.start(s);
      lfo.start(s);
      osc.stop(s + dur + 0.05);
      lfo.stop(s + dur + 0.05);
    };
    voice(520, 0.75, 0);
    voice(525, 0.28, 0.12);
    voice(1040, 0.08, 0.05);
  }
}
