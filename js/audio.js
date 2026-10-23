// ---------------------------------------------------------------------
// Audio: everything is synthesized with WebAudio (no sound files).
//  - SFX: hits, swings, spells, monsters, footsteps, UI (with stereo position)
//  - Music: generative per-map soundtrack (chords, arpeggios, melody, drums)
//  - Ambience: birds, wind, drips, bubbles ...
// ---------------------------------------------------------------------
const AUDIO_KEY = 'MU_LEGACY_AUDIO';
const SFX = {
  ctx: null, muted: false, vol: { music: 0.45, sfx: 0.8, amb: 0.5 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(AUDIO_KEY)) || {}); this.muted = !!this.vol.muted; } catch (e) { }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = c.createGain(); this.master.connect(this.comp); this.comp.connect(c.destination);
    this.bus = {};
    ['music', 'sfx', 'amb'].forEach(k => { const g = c.createGain(); g.connect(this.master); this.bus[k] = g; });
    // shared reverb (generated impulse response)
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.6, 2.2);
    this.verbOut = c.createGain(); this.verbOut.gain.value = 0.9;
    this.verb.connect(this.verbOut); this.verbOut.connect(this.master);
    this.noiseBuf = (() => { const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; })();
    this.applyVolumes();
    Music.start(); Ambience.start();
  },
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    for (const k in this.bus) this.bus[k].gain.setTargetAtTime(this.vol[k], t, 0.05);
  },
  saveVolumes() { try { localStorage.setItem(AUDIO_KEY, JSON.stringify(Object.assign({}, this.vol, { muted: this.muted }))); } catch (e) { } },
  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },
  // ---------- building blocks: each returns nothing, schedules nodes at time t
  // out(): chain end for a voice -> pan -> bus (+ reverb send)
  out(bus = 'sfx', pan = 0, verb = 0) {
    const c = this.ctx, g = c.createGain();
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(this.bus[bus]);
    if (verb > 0) { const s = c.createGain(); s.gain.value = verb; node.connect(s); s.connect(this.verb); }
    return g;
  },
  osc(t, type, f0, f1, dur, vol, o = {}) {
    const c = this.ctx, os = c.createOscillator(), g = c.createGain();
    os.type = type; os.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (o.slide || dur));
    if (o.detune) os.detune.value = o.detune;
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = os;
    if (o.lp || o.bp || o.hp) {
      const fl = c.createBiquadFilter(); fl.type = o.lp ? 'lowpass' : o.bp ? 'bandpass' : 'highpass';
      fl.frequency.value = o.lp || o.bp || o.hp; if (o.q) fl.Q.value = o.q;
      if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      os.connect(fl); node = fl;
    }
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + 0.05); }
    if (o.am) { const l = c.createOscillator(), lg = c.createGain(), ag = c.createGain(); l.frequency.value = o.am[0]; lg.gain.value = o.am[1]; ag.gain.value = 1 - o.am[1]; l.connect(lg); lg.connect(ag.gain); node.connect(ag); node = ag; l.start(t); l.stop(t + dur + 0.05); }
    node.connect(g); g.connect(o.dest || this.out(o.bus, o.pan, o.verb));
    os.start(t); os.stop(t + dur + 0.05);
  },
  noise(t, dur, vol, o = {}) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), fl = c.createBiquadFilter();
    s.buffer = this.noiseBuf; s.loop = true;
    fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1000, t); fl.Q.value = o.q || 1;
    if (o.fTo) fl.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    const a = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = fl;
    if (o.am) { const l = c.createOscillator(), lg = c.createGain(), ag = c.createGain(); l.frequency.value = o.am[0]; lg.gain.value = o.am[1]; ag.gain.value = 1 - o.am[1]; l.connect(lg); lg.connect(ag.gain); fl.connect(ag); node = ag; l.start(t); l.stop(t + dur + 0.05); }
    s.connect(fl); node.connect(g); g.connect(o.dest || this.out(o.bus, o.pan, o.verb));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  // stereo position + distance attenuation relative to the player
  spatial(x, y) {
    if (x == null || !G.player) return { k: 1, pan: 0 };
    const d = dist(x, y, G.player.x, G.player.y);
    const sx = iso(x, y).x - iso(G.player.x, G.player.y).x;
    return { k: clamp(1.15 - d / 13, 0, 1), pan: clamp(sx / 420, -0.85, 0.85) };
  },
  now() { return this.ctx.currentTime; },
  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; },

  // ---------- named effects (legacy API)
  play(n, x, y) {
    if (!this.ok()) return;
    const { k, pan } = this.spatial(x, y); if (k <= 0.01) return;
    const t = this.now(), O = (o = {}) => Object.assign({ pan }, o);
    switch (n) {
      case 'swing': this.noise(t, 0.2, 0.32 * k, O({ f: 500, fTo: 2600, q: 1.2, attack: 0.03 })); this.osc(t, 'sine', 1800, 900, 0.12, 0.03 * k, O()); break;
      case 'swingHeavy': this.noise(t, 0.3, 0.38 * k, O({ f: 260, fTo: 1300, q: 1.4, attack: 0.05 })); break;
      case 'hit': return this.hit('flesh', x, y);
      case 'crit': this.hit('flesh', x, y, 1.2); this.osc(t, 'sine', 1760, 1760, 0.5, 0.08 * k, O({ verb: 0.4 })); this.osc(t, 'triangle', 2640, 2400, 0.35, 0.05 * k, O({ verb: 0.4 })); break;
      case 'arrow':
        this.osc(t, 'triangle', 280, 140, 0.18, 0.25 * k, O({ lp: 1800 })); this.noise(t, 0.05, 0.25 * k, O({ type: 'highpass', f: 3000 }));
        this.noise(t + 0.02, 0.25, 0.12 * k, O({ f: 3000, fTo: 1200, q: 3 })); break;
      case 'magic': // energy ball
        this.osc(t, 'sine', 300, 1300, 0.35, 0.18 * k, O({ verb: 0.35 })); this.osc(t, 'triangle', 600, 2400, 0.3, 0.06 * k, O({ verb: 0.35, vib: [12, 30] })); break;
      case 'fire':
        this.noise(t, 0.55, 0.45 * k, O({ type: 'lowpass', f: 600, fTo: 2200, attack: 0.05 }));
        for (let i = 0; i < 8; i++) this.noise(t + Math.random() * 0.5, 0.025, 0.25 * k, O({ type: 'highpass', f: 2500 }));
        this.osc(t, 'sawtooth', 90, 50, 0.5, 0.08 * k, O({ lp: 400 })); break;
      case 'bolt':
        this.noise(t, 0.08, 0.7 * k, O({ type: 'highpass', f: 2000 })); this.osc(t, 'square', 1400, 300, 0.12, 0.12 * k, O({ lp: 3000 }));
        this.noise(t + 0.05, 0.9, 0.4 * k, O({ type: 'lowpass', f: 220, fTo: 80, verb: 0.5 })); break;
      case 'boom':
        this.osc(t, 'sine', 80, 28, 0.9, 0.7 * k, O({ verb: 0.4 })); this.noise(t, 1.1, 0.6 * k, O({ type: 'lowpass', f: 900, fTo: 90, verb: 0.5 }));
        this.noise(t, 0.12, 0.4 * k, O({ type: 'highpass', f: 1500 })); break;
      case 'ice':
        for (let i = 0; i < 9; i++) this.osc(t + i * 0.035, 'sine', 2200 + Math.random() * 2200, 0, 0.3, 0.06 * k, O({ verb: 0.5 }));
        this.noise(t + 0.25, 0.3, 0.35 * k, O({ type: 'highpass', f: 3500 })); break;
      case 'whirl':
        this.noise(t, 0.6, 0.4 * k, O({ f: 400, fTo: 2200, q: 2, attack: 0.05, am: [9, 0.7] })); break;
      case 'spirit':
        for (let i = 0; i < 4; i++) this.osc(t + i * 0.08, 'sine', 500 + i * 120, 260, 0.9, 0.07 * k, O({ verb: 0.7, vib: [6, 25] }));
        this.noise(t, 0.9, 0.18 * k, O({ f: 900, fTo: 300, q: 3, verb: 0.5 })); break;
      case 'hurt': break; // handled by playerHurt()
      case 'die': break;  // handled by monsterDie()
      case 'pickup': this.osc(t, 'triangle', 880, 880, 0.08, 0.14, O({ bus: 'sfx' })); this.osc(t + 0.06, 'triangle', 1320, 1320, 0.12, 0.12); break;
      case 'zen': for (let i = 0; i < 4; i++) { const f = 2400 + Math.random() * 1200; this.osc(t + i * 0.05, 'sine', f, f * 1.01, 0.18, 0.06); this.osc(t + i * 0.05, 'sine', f * 2.76, f * 2.7, 0.1, 0.02); } break;
      case 'levelup':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this.osc(t + i * 0.08, 'triangle', f, f, 0.9, 0.12, { verb: 0.5 }); this.osc(t + i * 0.08, 'sine', f * 2, f * 2, 0.5, 0.04, { verb: 0.5 }); });
        [262, 330, 392].forEach(f => this.osc(t + 0.4, 'sawtooth', f, f, 1.6, 0.04, { lp: 1400, attack: 0.2, verb: 0.6 })); break;
      case 'success': [784, 988, 1175, 1568].forEach((f, i) => this.osc(t + i * 0.07, 'sine', f, f, 0.7, 0.14, { verb: 0.6 })); this.play('zen'); break;
      case 'fail': [392, 370, 311, 233].forEach((f, i) => this.osc(t + i * 0.1, 'sawtooth', f, f * 0.97, 0.3, 0.07, { lp: 1200 })); this.noise(t + 0.35, 0.25, 0.3, { type: 'highpass', f: 1800 }); break;
      case 'potion': for (let i = 0; i < 3; i++) this.osc(t + i * 0.11, 'sine', 260 + i * 40, 520 + i * 60, 0.1, 0.16, { lp: 1500 }); break;
      case 'click': this.osc(t, 'triangle', 1500, 900, 0.035, 0.08); this.noise(t, 0.02, 0.05, { type: 'highpass', f: 4000 }); break;
      case 'equipMetal': this.osc(t, 'square', 900, 700, 0.08, 0.05, { lp: 2500 }); [1250, 1890, 2710].forEach(f => this.osc(t, 'sine', f, f * 0.99, 0.35, 0.03)); break;
      case 'equipCloth': this.noise(t, 0.15, 0.15, { f: 1800, q: 0.8, attack: 0.03 }); break;
      case 'warp': this.osc(t, 'sine', 200, 1600, 0.8, 0.15, { verb: 0.7, vib: [7, 20] }); this.noise(t, 0.8, 0.2, { f: 800, fTo: 5000, q: 2, verb: 0.6 }); break;
      case 'buff': [523, 784, 1047, 1319].forEach((f, i) => this.osc(t + i * 0.06, 'sine', f, f, 0.8, 0.09, { verb: 0.7, vib: [5, 6] })); this.noise(t, 0.6, 0.06, { type: 'highpass', f: 6000, verb: 0.5 }); break;
      case 'heal': [659, 880, 1109].forEach((f, i) => this.osc(t + i * 0.09, 'sine', f, f * 1.01, 1.0, 0.1, { verb: 0.8 })); break;
      case 'teleport': this.osc(t, 'sine', 1800, 300, 0.4, 0.14, O({ verb: 0.6 })); this.noise(t, 0.4, 0.2 * k, O({ f: 5000, fTo: 600, q: 2, verb: 0.5 })); break;
      case 'drop': this.osc(t, 'sine', 300, 120, 0.12, 0.12 * k, O({ lp: 900 })); this.noise(t, 0.06, 0.1 * k, O({ type: 'lowpass', f: 1200 })); break;
    }
  },
  // impact sounds by target material
  hit(mat, x, y, power = 1) {
    if (!this.ok()) return;
    const { k, pan } = this.spatial(x, y); if (k <= 0.01) return;
    const t = this.now(), v = k * power;
    this.osc(t, 'sine', 140, 48, 0.16, 0.45 * v, { pan, lp: 600 });
    if (mat === 'metal') {
      this.noise(t, 0.04, 0.4 * v, { pan, type: 'highpass', f: 2500 });
      [1180, 1720, 2630, 3410].forEach((f, i) => this.osc(t, 'sine', f * (0.97 + Math.random() * 0.06), f, 0.35 - i * 0.05, 0.05 * v, { pan, verb: 0.25 }));
    } else if (mat === 'bone') {
      for (let i = 0; i < 3; i++) this.noise(t + i * 0.025, 0.04, 0.3 * v, { pan, f: 1600 + i * 500, q: 5 });
    } else if (mat === 'shell') {
      this.noise(t, 0.06, 0.35 * v, { pan, f: 2200, q: 3 }); this.osc(t, 'square', 600, 300, 0.05, 0.05 * v, { pan, lp: 2000 });
    } else if (mat === 'ghost') {
      this.osc(t, 'sine', 700, 350, 0.3, 0.1 * v, { pan, verb: 0.6, vib: [9, 30] });
    } else {
      this.noise(t, 0.12, 0.42 * v, { pan, type: 'lowpass', f: 1100, fTo: 400 });
      this.noise(t, 0.05, 0.12 * v, { pan, f: 2500, q: 1 });
    }
  },
  matOf(def) {
    const L = def.look;
    return L.armored || L.icy || L.rocky ? 'metal' : L.bones ? 'bone' : def.shape === 'bug' ? 'shell' : def.shape === 'ghost' ? 'ghost' : 'flesh';
  },
  // monster voices: kind = 'attack' | 'die' | 'aggro'
  monster(def, kind, x, y) {
    if (!this.ok()) return;
    const { k, pan } = this.spatial(x, y); if (k <= 0.01) return;
    const t = this.now(), L = def.look, s = L.scale || 1, P = 1 / Math.sqrt(s), boss = def.boss;
    const len = kind === 'die' ? 0.9 : kind === 'aggro' ? 0.6 : 0.35, v = k * (boss ? 1.3 : 1), verb = boss ? 0.5 : 0.15;
    switch (def.shape) {
      case 'beast':
        this.osc(t, 'sawtooth', 110 * P, (kind === 'die' ? 50 : 85) * P, len, 0.22 * v, { pan, lp: 700, am: [28, 0.6], verb });
        if (kind === 'attack') { this.noise(t + 0.12, 0.05, 0.35 * v, { pan, type: 'highpass', f: 1800 }); }
        break;
      case 'flyer':
        this.osc(t, 'sawtooth', 900 * P, kind === 'die' ? 300 * P : 1300 * P, len, 0.1 * v, { pan, bp: 1400, q: 3, vib: [22, 60], verb });
        this.noise(t, len, 0.12 * v, { pan, f: 700, q: 1, am: [16, 0.8] });
        break;
      case 'bug':
        if (L.worm) this.noise(t, len * 1.3, 0.25 * v, { pan, type: 'lowpass', f: 500, am: [11, 0.7] });
        else { this.noise(t, len, 0.22 * v, { pan, type: 'highpass', f: 3500, am: [38, 0.85] }); for (let i = 0; i < 4; i++) this.noise(t + i * 0.05, 0.015, 0.25 * v, { pan, f: 2500, q: 6 }); }
        if (kind === 'die') this.osc(t, 'square', 500, 120, 0.4, 0.06 * v, { pan, lp: 1500 });
        break;
      case 'ghost':
        this.osc(t, 'sine', 520, kind === 'die' ? 180 : 380, len * 1.6, 0.16 * v, { pan, vib: [5, 40], verb: 0.8 });
        this.osc(t, 'sine', 780, 560, len * 1.4, 0.06 * v, { pan, vib: [6, 50], verb: 0.8 });
        break;
      default: { // humanoid
        if (L.bones) { for (let i = 0; i < 6; i++) this.noise(t + i * 0.04 + Math.random() * 0.02, 0.03, 0.22 * v, { pan, f: 1800 + Math.random() * 1500, q: 7 }); if (kind === 'die') this.noise(t + 0.25, 0.4, 0.3 * v, { pan, f: 1500, q: 2, am: [30, 0.7] }); break; }
        const f = (L.robe ? 170 : 120) * P;
        this.osc(t, 'sawtooth', f, f * (kind === 'die' ? 0.55 : 0.8), len, 0.16 * v, { pan, bp: 650 * P + 200, q: 2.5, verb });
        this.osc(t, 'sawtooth', f * 1.01, f * 0.8, len, 0.06 * v, { pan, lp: 400 });
        if (boss || s > 1.4) this.noise(t, len, 0.25 * v, { pan, type: 'lowpass', f: 400, am: [24, 0.5], verb });
      }
    }
    if (kind === 'die') { this.osc(t + len * 0.6, 'sine', 90 * P, 40, 0.3, 0.4 * k, { pan, lp: 400 }); this.noise(t + len * 0.6, 0.25, 0.3 * k, { pan, type: 'lowpass', f: 500 }); }
    if (kind === 'attack' && def.ranged) this.play('magic', x, y);
  },
  playerHurt(cls) {
    if (!this.ok()) return;
    const t = this.now(), f = cls === 'FE' ? 300 : cls === 'DW' ? 160 : 125;
    this.osc(t, 'sawtooth', f, f * 0.75, 0.2, 0.13, { bp: cls === 'FE' ? 1200 : 750, q: 3 });
    this.osc(t, 'sawtooth', f * 2, f * 1.5, 0.15, 0.04, { bp: 2200, q: 4 });
    this.hit('flesh', null, null, 0.8);
  },
  // footsteps (surface from the tile under the walker)
  step(x, y, heavy = 1) {
    if (!this.ok()) return;
    const { k, pan } = this.spatial(x, y); if (k <= 0.05) return;
    const t = this.now(), tile = G.map.tile(Math.floor(x), Math.floor(y)), v = 0.6 * k * heavy;
    if (tile === T.SNOW || tile === T.ICE) { for (let i = 0; i < 4; i++) this.noise(t + i * 0.012, 0.05, 0.12 * v, { pan, f: 2800 + Math.random() * 1500, q: 2 }); }
    else if (tile === T.STONE || tile === T.PLAZA || tile === T.DFLOOR || tile === T.TFLOOR) { this.noise(t, 0.04, 0.18 * v, { pan, f: 1800, q: 1.5, verb: G.map.theme === 'dungeon' || G.map.theme === 'tower' ? 0.3 : 0 }); this.osc(t, 'sine', 120, 60, 0.06, 0.12 * v, { pan }); }
    else if (tile === T.SEA || tile === T.SAND) { this.noise(t, 0.09, 0.12 * v, { pan, type: 'lowpass', f: 600 }); }
    else { this.noise(t, 0.07, 0.14 * v, { pan, type: 'lowpass', f: 900 }); this.noise(t + 0.01, 0.05, 0.05 * v, { pan, f: 3000, q: 1 }); }
    if (heavy > 1.3) this.osc(t, 'sine', 70, 35, 0.25, 0.25 * k, { pan });
  }
};

// ---------------------------------------------------------------------
// Generative music
// ---------------------------------------------------------------------
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
const SCALES = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11] };
// chord progressions as scale degrees (0-based)
const THEMES = {
  title:   { root: 50, scale: 'harmonic', bpm: 66, prog: [0, 5, 3, 4], lead: 'horn', arp: 'harp', pad: 'choir', drum: 'taiko', density: 0.45 },
  town:    { root: 50, scale: 'dorian', bpm: 88, prog: [0, 6, 3, 0, 4, 3, 6, 0], lead: 'flute', arp: 'lute', pad: 'strings', drum: 'hand', density: 0.6 },
  field:   { root: 57, scale: 'aeolian', bpm: 100, prog: [0, 5, 2, 6, 0, 3, 4, 4], lead: 'horn', arp: 'lute', pad: 'strings', drum: 'frame', density: 0.55 },
  noria:   { root: 52, scale: 'lydian', bpm: 78, prog: [0, 1, 4, 0, 5, 1, 4, 4], lead: 'flute', arp: 'harp', pad: 'strings', drum: null, density: 0.55, bells: true },
  devias:  { root: 59, scale: 'aeolian', bpm: 70, prog: [0, 5, 3, 4], lead: 'bell', arp: 'harp', pad: 'strings', drum: null, density: 0.35, bells: true },
  dungeon: { root: 49, scale: 'phrygian', bpm: 58, prog: [0, 1, 0, 6], lead: null, arp: null, pad: 'drone', drum: 'heart', density: 0.2, bells: true },
  atlans:  { root: 53, scale: 'lydian', bpm: 72, prog: [0, 1, 3, 2], lead: 'bell', arp: 'epiano', pad: 'strings', drum: null, density: 0.4 },
  tower:   { root: 50, scale: 'harmonic', bpm: 62, prog: [0, 5, 1, 4], lead: 'organ', arp: null, pad: 'choir', drum: 'taiko', density: 0.3, bells: true }
};
const Music = {
  theme: null, want: null, step: 0, next: 0, timer: null, gain: null, seed: 1,
  start() {
    if (this.timer || !SFX.ctx) return;
    this.timer = setInterval(() => this.tick(), 40);
    if (this.want) { const w = this.want; this.want = null; this.set(w); }  // requested before audio was unlocked
  },
  set(name) {
    if (this.want === name && (this.theme || !SFX.ctx)) return;
    this.want = name;
    if (!SFX.ctx) return;
    const c = SFX.ctx, t = c.currentTime;
    if (this.gain) { const old = this.gain; old.gain.setTargetAtTime(0, t, 0.6); setTimeout(() => old.disconnect(), 4000); }
    this.gain = c.createGain(); this.gain.gain.setValueAtTime(0, t); this.gain.gain.linearRampToValueAtTime(1, t + 2.5);
    this.gain.connect(SFX.bus.music);
    this.send = c.createGain(); this.send.gain.value = 0.35; this.gain.connect(this.send); this.send.connect(SFX.verb);
    this.theme = THEMES[name]; this.step = 0; this.next = t + 0.3;
    this.rng = mulberry32(name.length * 7919 + 13);
    this.motif = this.makeMotif();
  },
  makeMotif() {
    // a short melodic idea (scale steps + rhythm) that the lead develops each phrase
    const r = this.rng, m = [];
    let d = 4 + Math.floor(r() * 3);
    for (let i = 0; i < 8; i++) { d += Math.floor(r() * 5) - 2; d = clamp(d, 0, 11); m.push({ d, on: r() < 0.72 || i % 4 === 0, len: r() < 0.3 ? 2 : 1 }); }
    return m;
  },
  deg(d, oct = 0) { const th = this.theme, sc = SCALES[th.scale]; const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return th.root + sc[i] + 12 * (o + oct); },
  tick() {
    if (!this.theme || !SFX.ctx || SFX.ctx.state !== 'running') return;
    const c = SFX.ctx, th = this.theme, spb = 60 / th.bpm / 4; // seconds per 16th
    // background tabs throttle timers to ~1s, so schedule further ahead there to avoid gaps
    const ahead = document.hidden ? 1.6 : 0.15;
    if (this.next < c.currentTime - 0.5) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + ahead) { this.play16(this.step, this.next, spb); this.step++; this.next += spb; }
  },
  play16(s, t, spb) {
    const th = this.theme, r = this.rng, bar = Math.floor(s / 16), beat = s % 16;
    const chord = th.prog[bar % th.prog.length], dest = this.gain;
    const tri = [chord, chord + 2, chord + 4];
    // pad: whole-bar chord
    if (beat === 0) {
      const dur = spb * 16 + 0.4;
      tri.forEach((d, i) => this.inst(th.pad, t, NOTE(this.deg(d, i === 0 ? -1 : 0)), dur, 0.05));
      this.inst('bass', t, NOTE(this.deg(chord, -2)), spb * 8, 0.16);
      if (bar % 2 === 1) this.inst('bass', t + spb * 8, NOTE(this.deg(chord + (r() < 0.5 ? 4 : 0), -2)), spb * 8, 0.12);
      if (bar % 8 === 0) this.motif = r() < 0.4 ? this.makeMotif() : this.motif;
    }
    // arpeggio
    if (th.arp && beat % 2 === 0) {
      const pattern = [0, 1, 2, 1, 3, 2, 1, 2];
      const k = pattern[(beat / 2) % 8], d = k === 3 ? chord + 7 : tri[k];
      if (r() < 0.92) this.inst(th.arp, t, NOTE(this.deg(d, 0)), spb * 6, 0.07);
    }
    // lead: develops the motif, rests on alternate phrases
    if (th.lead && beat % 4 === 0 && Math.floor(bar / 2) % 2 === 1 && r() < th.density + 0.3) {
      const n = this.motif[(beat / 4 + (bar % 2) * 4) % 8];
      if (n.on) {
        let d = n.d + (bar % 4 === 3 ? -1 : 0);
        if (beat === 0) d = chord + 7 + (r() < 0.5 ? 2 : 0); // land on chord tones on downbeats
        this.inst(th.lead, t, NOTE(this.deg(d, 1)), spb * 4 * n.len * 0.95, 0.07);
      }
    }
    // bells sprinkle
    if (th.bells && r() < 0.035) this.inst('bell', t, NOTE(this.deg(tri[Math.floor(r() * 3)] + 7, 1)), 3, 0.035);
    // percussion
    if (th.drum === 'frame') { if (beat === 0 || beat === 10) this.drum('low', t, 0.3); if (beat === 4 || beat === 12) this.drum('slap', t, 0.12); if (beat % 2 === 1 && r() < 0.3) this.drum('tick', t, 0.04); }
    if (th.drum === 'hand') { if (beat === 0 || beat === 6) this.drum('low', t, 0.2); if (beat === 8 || beat === 14) this.drum('slap', t, 0.1); }
    if (th.drum === 'taiko') { if (beat === 0) this.drum('taiko', t, 0.35); if (bar % 4 === 3 && (beat === 8 || beat === 12 || beat === 14)) this.drum('taiko', t, 0.25); }
    if (th.drum === 'heart') { if (beat === 0) this.drum('low', t, 0.18); if (beat === 3) this.drum('low', t, 0.12); }
  },
  inst(kind, t, f, dur, vol) {
    const S = SFX, dest = this.gain;
    switch (kind) {
      case 'lute': S.osc(t, 'triangle', f, f, Math.min(dur, 1.2), vol, { dest, lp: 2600, lpTo: 600 }); S.osc(t, 'sawtooth', f * 2, f * 2, 0.25, vol * 0.12, { dest, lp: 3000 }); break;
      case 'harp': S.osc(t, 'triangle', f, f, Math.min(dur * 1.6, 2), vol, { dest, lp: 3200, lpTo: 900 }); S.osc(t, 'sine', f * 2, f * 2, 0.8, vol * 0.3, { dest }); break;
      case 'epiano': S.osc(t, 'sine', f, f, 1.6, vol, { dest }); S.osc(t, 'sine', f * 4, f * 4, 0.3, vol * 0.25, { dest }); break;
      case 'flute': S.osc(t, 'sine', f, f, dur, vol, { dest, attack: 0.07, vib: [5.2, f * 0.006] }); S.noise(t, 0.08, vol * 0.25, { dest, f: f * 2, q: 8 }); break;
      case 'horn': S.osc(t, 'sawtooth', f, f, dur, vol * 0.8, { dest, attack: 0.09, lp: 900, lpTo: 600, vib: [4.5, f * 0.004] }); S.osc(t, 'sine', f / 2, f / 2, dur, vol * 0.4, { dest, attack: 0.09 }); break;
      case 'organ': [1, 2, 3].forEach((h, i) => S.osc(t, 'sine', f * h, f * h, dur, vol / (i + 1.5), { dest, attack: 0.05 })); break;
      case 'bell': S.osc(t, 'sine', f, f, dur, vol, { dest }); S.osc(t, 'sine', f * 2.76, f * 2.76, dur * 0.5, vol * 0.4, { dest }); S.osc(t, 'sine', f * 5.4, f * 5.4, dur * 0.25, vol * 0.2, { dest }); break;
      case 'strings': [-7, 7].forEach(dt => S.osc(t, 'sawtooth', f, f, dur, vol, { dest, attack: 1.2, lp: 1100, detune: dt })); break;
      case 'choir': [-6, 6].forEach(dt => S.osc(t, 'sawtooth', f, f, dur, vol * 0.9, { dest, attack: 1.4, bp: 900, q: 1.5, detune: dt, vib: [5, 2] })); break;
      case 'drone': S.osc(t, 'sawtooth', f / 2, f / 2, dur, vol * 1.3, { dest, attack: 2, lp: 380 }); S.osc(t, 'sine', f, f * 1.003, dur, vol, { dest, attack: 2 }); break;
      case 'bass': S.osc(t, 'triangle', f, f, dur, vol, { dest, lp: 500 }); break;
    }
  },
  drum(kind, t, vol) {
    const S = SFX, dest = this.gain;
    if (kind === 'low') { S.osc(t, 'sine', 110, 55, 0.35, vol, { dest }); S.noise(t, 0.08, vol * 0.3, { dest, type: 'lowpass', f: 600 }); }
    if (kind === 'slap') { S.noise(t, 0.08, vol, { dest, f: 1400, q: 1 }); S.osc(t, 'sine', 240, 180, 0.08, vol * 0.6, { dest }); }
    if (kind === 'tick') S.noise(t, 0.03, vol, { dest, type: 'highpass', f: 5000 });
    if (kind === 'taiko') { S.osc(t, 'sine', 75, 40, 0.9, vol * 1.4, { dest }); S.noise(t, 0.25, vol * 0.5, { dest, type: 'lowpass', f: 400 }); }
  }
};

// ---------------------------------------------------------------------
// Ambience per map (layered random events + continuous beds)
// ---------------------------------------------------------------------
const Ambience = {
  kind: null, timer: null, bed: null,
  start() {
    if (this.timer || !SFX.ctx) return;
    this.timer = setInterval(() => this.tick(), 250);
    if (this.kind) { const k = this.kind; this.kind = null; this.set(k); }
  },
  set(kind) {
    if (this.kind === kind || !SFX.ctx) { this.kind = kind; return; }
    this.kind = kind;
    const c = SFX.ctx, t = c.currentTime;
    if (this.bed) { const b = this.bed; b.g.gain.setTargetAtTime(0, t, 0.5); setTimeout(() => { try { b.src.stop(); } catch (e) { } b.g.disconnect(); }, 3000); this.bed = null; }
    const cfg = { field: [380, 0.04, 'lowpass'], town: [1300, 0.02, 'bandpass'], snow: [700, 0.1, 'bandpass'], dungeon: [140, 0.08, 'lowpass'], water: [260, 0.1, 'lowpass'], tower: [500, 0.07, 'bandpass'], forest: [420, 0.04, 'lowpass'] }[kind];
    if (!cfg) return;
    const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = SFX.noiseBuf; src.loop = true; fl.type = cfg[2]; fl.frequency.value = cfg[0]; fl.Q.value = 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(cfg[1], t + 2);
    // slow gusts
    const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.07; lg.gain.value = cfg[0] * 0.45; l.connect(lg); lg.connect(fl.frequency); l.start();
    src.connect(fl); fl.connect(g); g.connect(SFX.bus.amb); src.start();
    this.bed = { src, g, l };
  },
  tick() {
    if (!SFX.ok() || !G.running || !this.kind) return;
    const S = SFX, t = S.now(), r = Math.random, pan = (r() - 0.5) * 1.4, A = { bus: 'amb', pan };
    switch (this.kind) {
      case 'field': case 'forest':
        if (r() < 0.06) { const f = 2600 + r() * 2200, n = 2 + Math.floor(r() * 4); for (let i = 0; i < n; i++) S.osc(t + i * 0.11, 'sine', f, f * (1.2 + r() * 0.3), 0.08, 0.035, Object.assign({ verb: 0.2 }, A)); }
        if (this.kind === 'forest' && r() < 0.05) S.osc(t, 'sine', 5200, 5200, 1.2, 0.006, Object.assign({ am: [42, 0.9] }, A));
        break;
      case 'town':
        if (r() < 0.03) { const f = 3000 + r() * 1500; S.osc(t, 'sine', f, f * 1.3, 0.07, 0.025, A); S.osc(t + 0.12, 'sine', f * 1.1, f * 1.4, 0.07, 0.025, A); }
        if (r() < 0.25) S.noise(t, 0.3, 0.012, Object.assign({ f: 1500 + r() * 1500, q: 3 }, A)); // fountain splashes
        break;
      case 'snow':
        if (r() < 0.02) S.noise(t, 2.5, 0.05, Object.assign({ f: 500, fTo: 1400, q: 4, attack: 0.8 }, A)); // howling gust
        break;
      case 'dungeon':
        if (r() < 0.05) { const f = 1200 + r() * 900; S.osc(t, 'sine', f, f * 0.55, 0.12, 0.05, Object.assign({ verb: 0.9 }, A)); }
        if (r() < 0.006) S.noise(t, 1.5, 0.06, Object.assign({ type: 'lowpass', f: 200, verb: 0.6, attack: 0.3 }, A)); // distant rumble
        break;
      case 'water':
        if (r() < 0.12) { const f = 400 + r() * 700; S.osc(t, 'sine', f, f * 2.2, 0.06 + r() * 0.05, 0.03, A); }
        break;
      case 'tower':
        if (r() < 0.015) S.noise(t, 1.8, 0.04, Object.assign({ f: 600 + r() * 600, fTo: 300, q: 6, verb: 0.8, attack: 0.6 }, A)); // whisper
        if (r() < 0.01) S.osc(t, 'sine', 180, 175, 3, 0.03, Object.assign({ verb: 0.9 }, A));
        break;
    }
  }
};
// pick music + ambience for the current place (called on map change and every second)
function updateSoundscape() {
  if (!G.map || !G.player) return;
  const id = G.map.id, town = G.map.inTown(Math.floor(G.player.x), Math.floor(G.player.y));
  const music = id === 'lorencia' ? (town ? 'town' : 'field') : id === 'noria' ? 'noria' : id === 'devias' ? 'devias' : id === 'dungeon' ? 'dungeon' : id === 'atlans' ? 'atlans' : 'tower';
  Music.set(music);
  const th = G.map.theme;
  Ambience.set(town ? 'town' : th === 'grass' ? 'field' : th === 'forest' ? 'forest' : th === 'snow' ? 'snow' : th === 'dungeon' ? 'dungeon' : th === 'water' ? 'water' : 'tower');
}
