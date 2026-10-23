// ---------------------------------------------------------------------
// Synthesized sound effects (WebAudio, no external assets)
// ---------------------------------------------------------------------
const SFX = {
  ctx: null, vol: 0.35, muted: false,
  init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } },
  tone(f, d, type = 'sine', v = 1, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(this.vol * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, v = 1, hp = 800, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay, len = Math.floor(c.sampleRate * d);
    const b = c.createBuffer(1, len, c.sampleRate), data = b.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = this.vol * v;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  },
  play(n) {
    switch (n) {
      case 'swing': this.noise(0.12, 0.5, 2500); break;
      case 'hit': this.noise(0.08, 0.8, 400); this.tone(140, 0.08, 'square', 0.3, 0.5); break;
      case 'crit': this.noise(0.12, 0.9, 300); this.tone(520, 0.15, 'triangle', 0.4, 2); break;
      case 'magic': this.tone(300, 0.3, 'sawtooth', 0.25, 3); this.tone(600, 0.25, 'sine', 0.3, 2); break;
      case 'fire': this.noise(0.4, 0.6, 200); this.tone(200, 0.35, 'sawtooth', 0.2, 0.4); break;
      case 'bolt': this.noise(0.25, 0.9, 1500); this.tone(900, 0.2, 'square', 0.25, 0.2); break;
      case 'arrow': this.tone(900, 0.1, 'triangle', 0.3, 0.4); break;
      case 'hurt': this.tone(220, 0.12, 'sawtooth', 0.35, 0.6); break;
      case 'die': this.tone(300, 0.5, 'sawtooth', 0.3, 0.3); break;
      case 'pickup': this.tone(880, 0.07, 'square', 0.25); this.tone(1320, 0.09, 'square', 0.25, 1, 0.06); break;
      case 'zen': this.tone(1500, 0.05, 'triangle', 0.3); this.tone(2000, 0.07, 'triangle', 0.3, 1, 0.05); break;
      case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.4, 1, i * 0.09)); break;
      case 'success': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.45, 1, i * 0.08)); break;
      case 'fail': [400, 300, 200].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.3, 1, i * 0.1)); break;
      case 'potion': this.tone(400, 0.15, 'sine', 0.4, 2); break;
      case 'click': this.tone(1200, 0.03, 'square', 0.15); break;
      case 'warp': this.tone(200, 0.6, 'sine', 0.4, 6); this.noise(0.5, 0.3, 3000); break;
      case 'buff': this.tone(500, 0.4, 'sine', 0.4, 1.5); this.tone(750, 0.4, 'sine', 0.3, 1.5, 0.1); break;
    }
  }
};
