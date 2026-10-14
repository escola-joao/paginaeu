// Simple procedural grunge audio using Web Audio API — no external files.
const MASTER_VOLUME = 0.72;
const MUSIC_TICK_MS = 136;

let ctx = null;
let master = null;
let compressor = null;
let musicBus = null;
let musicCompressor = null;
let roomDelay = null;
let roomFilter = null;
let roomFeedback = null;
let roomWet = null;
let cachedNoise = [];
let noiseCursor = 0;
const guitarBuffers = new Map();
let muted = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    // Keep the music warm and forward without changing gameplay sound levels.
    musicBus = ctx.createGain();
    musicBus.gain.value = 1.05;
    musicCompressor = ctx.createDynamicsCompressor();
    musicCompressor.threshold.value = -20;
    musicCompressor.knee.value = 18;
    musicCompressor.ratio.value = 2.8;
    musicCompressor.attack.value = 0.012;
    musicCompressor.release.value = 0.24;
    musicBus.connect(musicCompressor);
    musicCompressor.connect(master);

    // Short, dark room reflections give the synthetic guitar a small-venue feel.
    roomDelay = ctx.createDelay(0.4);
    roomDelay.delayTime.value = 0.078;
    roomFilter = ctx.createBiquadFilter();
    roomFilter.type = "lowpass";
    roomFilter.frequency.value = 2100;
    roomFeedback = ctx.createGain();
    roomFeedback.gain.value = 0.13;
    roomWet = ctx.createGain();
    roomWet.gain.value = 0.16;
    roomDelay.connect(roomFilter);
    roomFilter.connect(roomFeedback);
    roomFeedback.connect(roomDelay);
    roomFilter.connect(roomWet);
    roomWet.connect(musicBus);
  }
  return ctx;
}

export function resumeAudio() {
  const c = ac();
  if (c && c.state === "suspended") c.resume();
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, ctx.currentTime, 0.025);
  }
}
export function isMuted() {
  return muted;
}

// distorted power-chord style riff shot
export function playRiff(power = 1) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const root = 82.4 * (power > 1 ? 1 : 1); // low E
  const freqs = [root, root * 1.5, root * 2];
  freqs.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const shaper = c.createWaveShaper();
    shaper.curve = distortionCurve(120);
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 / (i + 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(shaper);
    shaper.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.25);
  });
}

/** Sustained beam voices: chorus = shimmering pair, fuzz = one hard gritty zap. */
export function playBeam(kind) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  if (kind === "chorus") {
    [329.6, 331.4].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      const lfo = c.createOscillator();
      const lfoG = c.createGain();
      o.type = i ? "triangle" : "sine";
      o.frequency.setValueAtTime(f, t);
      lfo.frequency.value = 5.5;
      lfoG.gain.value = 6;
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(master);
      o.start(t); lfo.start(t);
      o.stop(t + 0.3); lfo.stop(t + 0.3);
    });
    return;
  }
  const o = c.createOscillator();
  const g = c.createGain();
  const shaper = c.createWaveShaper();
  shaper.curve = distortionCurve(400);
  o.type = "square";
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.34);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(shaper); shaper.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.42);
}

export function playDoubleJump() {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(1040, t + 0.09);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.13);
}

export function playHit() {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(300, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

export function playJump() {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(440, t + 0.12);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.16);
}

export function playPickup() {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  [660, 880, 1100].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t + i * 0.05);
    g.gain.setValueAtTime(0.15, t + i * 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + 0.15);
    o.connect(g);
    g.connect(master);
    o.start(t + i * 0.05);
    o.stop(t + i * 0.05 + 0.16);
  });
}

export function playDeath() {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  const shaper = c.createWaveShaper();
  shaper.curve = distortionCurve(200);
  o.type = "sawtooth";
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(shaper);
  shaper.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 1);
}

function distortionCurve(amount) {
  const n = 44100;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function getNoiseBuffer(c) {
  if (!cachedNoise.length || cachedNoise[0].sampleRate !== c.sampleRate) {
    cachedNoise = Array.from({ length: 8 }, () => {
      const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.35), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    });
  }
  const buffer = cachedNoise[noiseCursor % cachedNoise.length];
  noiseCursor++;
  return buffer;
}

/**
 * Generate a plucked-string sample with a musical harmonic spectrum, then run it
 * through a short feedback string model. This avoids stepped/chiptune waveforms.
 */
function getGuitarBuffer(freq) {
  const c = ctx;
  if (!c) return null;
  const key = `${c.sampleRate}:${Math.round(freq * 10)}`;
  if (guitarBuffers.has(key)) return guitarBuffers.get(key);

  const sampleCount = Math.floor(c.sampleRate * 0.85);
  const period = Math.max(2, Math.round(c.sampleRate / freq));
  const string = new Float32Array(period);
  const pickPoint = 0.17 + Math.random() * 0.045;
  for (let i = 0; i < period; i++) {
    const phase = (i / period) * Math.PI * 2;
    let sample = 0;
    // A picked string has a rich but uneven harmonic stack, not a square wave.
    for (let harmonic = 1; harmonic <= 24; harmonic++) {
      const pickNull = Math.sin(Math.PI * harmonic * pickPoint);
      const phaseDrift = harmonic > 7 ? Math.sin(harmonic * 1.73) * 0.055 : 0;
      sample += Math.sin(phase * harmonic + phaseDrift) * pickNull / Math.pow(harmonic, 1.05);
    }
    sample += (Math.random() - 0.5) * 0.04;
    string[i] = sample;
  }

  const buffer = c.createBuffer(1, sampleCount, c.sampleRate);
  const samples = buffer.getChannelData(0);
  let cursor = 0;
  let lowPassState = 0;
  for (let i = 0; i < sampleCount; i++) {
    const current = string[cursor];
    const next = string[(cursor + 1) % period];
    lowPassState = (current + next) * 0.5;
    // Gentle damping with a little bridge/pick transient in the first cycles.
    string[cursor] = lowPassState * 0.99945;
    const attack = Math.exp(-i / (c.sampleRate * 0.009));
    samples[i] = current * (0.94 + attack * 0.06);
    cursor = (cursor + 1) % period;
  }

  guitarBuffers.set(key, buffer);
  return buffer;
}

function softClipCurve() {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(2.8);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * 2.8) / norm;
  }
  return curve;
}

const guitarClip = softClipCurve();

function musicGuitar(freq, velocity = 1, pan = 0, duration = 0.58, bass = false, startOffset = 0) {
  if (!ctx || !master || muted) return;
  const buffer = getGuitarBuffer(freq);
  if (!buffer) return;

  const t = ctx.currentTime + startOffset;
  const source = ctx.createBufferSource();
  const preamp = ctx.createGain();
  const saturation = ctx.createWaveShaper();
  const highPass = ctx.createBiquadFilter();
  const cabinet = ctx.createBiquadFilter();
  const body = ctx.createBiquadFilter();
  const presence = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const send = ctx.createGain();

  source.buffer = buffer;
  // Tiny double-track drift makes the chord breathe instead of sounding quantized.
  source.playbackRate.setValueAtTime(0.998 + Math.random() * 0.004, t);
  preamp.gain.value = bass ? 2 : 3.7;
  saturation.curve = guitarClip;
  saturation.oversample = "4x";
  highPass.type = "highpass";
  highPass.frequency.value = bass ? 28 : 68;
  cabinet.type = "lowpass";
  cabinet.frequency.value = bass ? 440 : 2850;
  cabinet.Q.value = 0.72;
  body.type = "peaking";
  body.frequency.value = bass ? 110 : 1050;
  body.Q.value = 0.8;
  body.gain.value = bass ? 2.5 : 2.4;
  presence.type = "peaking";
  presence.frequency.value = bass ? 220 : 1850;
  presence.Q.value = 0.72;
  presence.gain.value = bass ? 1.2 : 1.2;
  panner.pan.value = pan;
  send.gain.value = bass ? 0.018 : 0.11;

  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime((bass ? 0.15 : 0.13) * velocity, t + 0.009);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  source.connect(preamp);
  preamp.connect(saturation);
  saturation.connect(highPass);
  highPass.connect(cabinet);
  cabinet.connect(body);
  body.connect(presence);
  presence.connect(envelope);
  envelope.connect(panner);
  panner.connect(musicBus);
  panner.connect(send);
  send.connect(roomDelay);
  source.start(t);
  source.stop(t + duration + 0.01);

  // Soft pick scrape at the note attack.
  if (!bass) {
    const pick = ctx.createBufferSource();
    const pickFilter = ctx.createBiquadFilter();
    const pickGain = ctx.createGain();
    pick.buffer = getNoiseBuffer(ctx);
    pickFilter.type = "highpass";
    pickFilter.frequency.value = 2600;
    pickGain.gain.setValueAtTime(0.022 * velocity, t);
    pickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    pick.connect(pickFilter);
    pickFilter.connect(pickGain);
    pickGain.connect(musicBus);
    pick.start(t);
    pick.stop(t + 0.035);
  }
}

function musicBass(freq, accent = 1) {
  if (!ctx || !musicBus || muted) return;
  musicGuitar(freq / 2, accent * 0.9, 0, 0.62, true);
  musicGuitar(freq, accent * 0.22, 0, 0.32, true);
}

function musicPowerChord(freq, accent = 1) {
  if (!ctx || !musicBus || muted) return;
  // Loose double-tracked root/fifth chord; tiny strum delays avoid a rigid chip sound.
  musicGuitar(freq, accent * 0.92, -0.2, 0.64);
  musicGuitar(freq * 1.003, accent * 0.72, 0.2, 0.6, false, 0.012);
  musicGuitar(freq * 1.5, accent * 0.68, 0.05, 0.58, false, 0.024);
}

function musicKick(accent = 1) {
  if (!ctx || !musicBus || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(126, t);
  osc.frequency.exponentialRampToValueAtTime(43, t + 0.14);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25 * accent, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(gain); gain.connect(musicBus);
  osc.start(t); osc.stop(t + 0.19);
}

function musicSnare(accent = 1) {
  if (!ctx || !musicBus || muted) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = getNoiseBuffer(ctx);
  filter.type = "highpass";
  filter.frequency.setValueAtTime(950, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12 * accent, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  source.connect(filter); filter.connect(gain); gain.connect(musicBus);
  source.start(t); source.stop(t + 0.14);

  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(185, t);
  body.frequency.exponentialRampToValueAtTime(95, t + 0.09);
  bodyGain.gain.setValueAtTime(0.09 * accent, t);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  body.connect(bodyGain); bodyGain.connect(musicBus);
  body.start(t); body.stop(t + 0.12);
}

function musicHat(open = false) {
  if (!ctx || !musicBus || muted) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = getNoiseBuffer(ctx);
  filter.type = "highpass";
  filter.frequency.setValueAtTime(6800, t);
  gain.gain.setValueAtTime(open ? 0.045 : 0.022, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.11 : 0.045));
  source.connect(filter); filter.connect(gain); gain.connect(musicBus);
  source.start(t); source.stop(t + (open ? 0.12 : 0.05));
}

// Original downtuned, stop-start grunge pulse with rough drums and power chords.
// The changing intervals and rhythm are original; only the broad Bleach-era
// texture (low tuning, dry attack, ragged dynamics) is the reference.
let musicTimer = null;
export function startMusic() {
  const c = ac();
  if (!c || !master || musicTimer !== null) return;
  const d2 = 73.416;
  const semitone = (n) => d2 * Math.pow(2, n / 12);
  const riffBars = [
    [0, null, 0, null, 0, null, -5, null, 0, null, 0, null, -2, null, 0, null],
    [0, null, 0, null, -5, null, -5, null, 0, null, 3, null, 0, null, -2, null],
    [0, null, 0, null, 0, null, -5, null, 3, null, 3, null, 5, null, 3, null],
    [0, null, null, 0, -5, null, -2, null, 0, null, -5, null, -2, null, 0, null],
  ];
  let step = 0;
  const tick = () => {
    const i = step % 64;
    const bar = Math.floor(i / 16);
    const beat = i % 16;
    const section = Math.floor(step / 64) % 4;
    const chorus = section === 3;
    if (!muted) {
      let offset = riffBars[bar][beat];
      // A small lift in the loud pass keeps the riff original while preserving its low center.
      if (chorus && offset !== null && (beat === 6 || beat === 14)) offset += 2;
      if (offset !== null) {
        const f = semitone(offset);
        const accent = beat === 0 ? 1.16 : beat % 4 === 2 ? 0.78 : 0.94;
        musicBass(f, accent);
        const chordHit = section === 0
          ? (bar === 1 && beat === 0) || (bar === 3 && beat === 8)
          : section === 1
            ? (beat === 0 && bar % 2 === 0) || (beat === 8 && bar % 2 === 1) || (bar === 3 && beat === 14)
            : section === 2
              ? (bar === 0 && beat === 0) || (bar === 2 && beat === 0) || (bar === 3 && beat === 8)
              : beat === 0 || beat === 8 || (beat === 14 && bar % 2 === 1);
        if (chordHit) musicPowerChord(f, accent * (chorus ? 1.04 : 0.95));
      }
      const kick = beat === 0 || (section > 0 && beat === 8) || (section === 1 && bar === 2 && beat === 14);
      if (kick) musicKick(beat === 0 ? 1.08 : 0.82);
      if (section > 0 && (beat === 4 || beat === 12)) musicSnare(chorus ? 0.92 : 0.76);
      if (section > 0 && (beat === 2 || beat === 6 || beat === 10 || beat === 14)) {
        musicHat(chorus && (beat === 6 || beat === 14));
      }
    }
    step++;
    // A slight long-short pulse keeps the loop from feeling rigidly sequenced.
    const swing = step % 2 === 0 ? 7 : -7;
    musicTimer = window.setTimeout(tick, MUSIC_TICK_MS + swing);
  };
  tick();
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}
