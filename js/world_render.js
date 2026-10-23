// ---------------------------------------------------------------------
// Ground rendering: texture splatting in world space with noisy soft
// transitions, ambient occlusion, then affine-projected to isometric.
// Static objects are pre-rendered into textured sprites.
// ---------------------------------------------------------------------
const PXT = 48; // texture texels per tile
const GROUND = {
  [T.WATER]: { tex: 'water', pri: 0, soft: 0.5 },
  [T.SEA]: { tex: 'sea', pri: 1, soft: 0.6 },
  [T.SAND]: { tex: 'sand', pri: 2, soft: 0.7 },
  [T.SNOW]: { tex: 'snow', pri: 3, soft: 0.8 },
  [T.FGRASS]: { tex: 'fgrass', pri: 4, soft: 0.8 },
  [T.GRASS]: { tex: 'grass', pri: 5, soft: 0.8 },
  [T.DFLOOR]: { tex: 'dfloor', pri: 3, soft: 0.2 },
  [T.TFLOOR]: { tex: 'tfloor', pri: 3, soft: 0.1 },
  [T.ICE]: { tex: 'ice', pri: 6, soft: 0.45 },
  [T.ROAD]: { tex: 'road', pri: 7, soft: 0.7 },
  [T.PLAZA]: { tex: 'plaza', pri: 8, soft: 0.18 },
  [T.STONE]: { tex: 'stone', pri: 9, soft: 0.08 },
  [T.DWALL]: { fill: '#0d0b09', pri: 10, soft: 0.05 },
  [T.TWALL]: { fill: '#0a0710', pri: 10, soft: 0.05 }
};
const SCR = {};
function scratch(name, w, h) {
  let c = SCR[name];
  if (!c) { c = SCR[name] = document.createElement('canvas'); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.clearRect(0, 0, w, h);
  return c;
}

Object.assign(GameMap.prototype, {
  renderChunk(cx, cy) {
    const x0 = cx * CHUNK, y0 = cy * CHUNK, SP = (CHUNK + 1) * PXT, NB = CHUNK + 4;
    const wc = scratch('world', SP, SP), g = wc.getContext('2d');
    const ox0 = (x0 - 0.5) * PXT, oy0 = (y0 - 0.5) * PXT;
    const tileAt = (i, j) => this.tile(x0 - 2 + i, y0 - 2 + j);
    // ground types present
    const present = new Set();
    for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) present.add(tileAt(i, j));
    const types = [...present].filter(t => GROUND[t]).sort((a, b) => GROUND[a].pri - GROUND[b].pri);
    const paint = (ctx, t) => {
      const G0 = GROUND[t];
      if (G0.fill) { ctx.fillStyle = G0.fill; ctx.fillRect(0, 0, SP, SP); return; }
      const S0 = TEX[G0.tex].width;
      ctx.save(); ctx.translate(-(((ox0 % S0) + S0) % S0), -(((oy0 % S0) + S0) % S0));
      ctx.fillStyle = Textures.pat(ctx, G0.tex); ctx.fillRect(0, 0, SP + S0, SP + S0); ctx.restore();
    };
    const indicator = (pred, col = [255, 255, 255]) => {
      const sm = scratch('small', NB, NB), sg = sm.getContext('2d'), img = sg.createImageData(NB, NB);
      for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
        const k = (j * NB + i) * 4, on = pred(x0 - 2 + i, y0 - 2 + j);
        img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = on ? 255 : 0;
      }
      sg.putImageData(img, 0, 0);
      return sm;
    };
    types.forEach((t, n) => {
      if (n === 0) { paint(g, t); return; }
      const soft = GROUND[t].soft;
      const sm = indicator((x, y) => this.tile(x, y) === t);
      const mc = scratch('mask', SP, SP), mg = mc.getContext('2d');
      mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high';
      mg.drawImage(sm, -1.5 * PXT, -1.5 * PXT, NB * PXT, NB * PXT);
      const img = mg.getImageData(0, 0, SP, SP), D = img.data, N = TEX_NOISE;
      const lo = 0.5 - soft * 0.45, hi = 0.5 + soft * 0.45, amp = 0.15 + soft * 0.55;
      for (let y = 0; y < SP; y++) {
        const ny = ((((oy0 + y) | 0) % TS) + TS) % TS * TS;
        for (let x = 0; x < SP; x++) {
          const k = (y * SP + x) * 4 + 3;
          const a = D[k] / 255;
          if (a === 0) continue;
          const nz = N[ny + (((((ox0 + x) | 0) % TS) + TS) % TS)];
          // noise only perturbs the transition band so tile interiors stay solid
          const v = a + (nz - 0.5) * amp * Math.min(1, 6 * a * (1 - a));
          D[k] = v <= lo ? 0 : v >= hi ? 255 : 255 * sstep(lo, hi, v);
        }
      }
      mg.putImageData(img, 0, 0);
      const lc = scratch('layer', SP, SP), lg = lc.getContext('2d');
      paint(lg, t);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(mc, 0, 0);
      g.drawImage(lc, 0, 0);
    });
    // large-scale tonal variation (breaks texture repetition)
    {
      const sm = scratch('tint', NB, NB), sg = sm.getContext('2d'), img = sg.createImageData(NB, NB);
      for (let j = 0; j < NB; j++) for (let i = 0; i < NB; i++) {
        const v = vnoise(x0 - 2 + i, y0 - 2 + j, 7, this.def.seed + 5) * 0.65 + vnoise(x0 - 2 + i, y0 - 2 + j, 3, this.def.seed + 6) * 0.35;
        const k = (j * NB + i) * 4, c = 128 + (v - 0.5) * 120;
        img.data[k] = c; img.data[k + 1] = c; img.data[k + 2] = c * 0.96; img.data[k + 3] = 255;
      }
      sg.putImageData(img, 0, 0);
      g.save(); g.globalCompositeOperation = 'soft-light'; g.imageSmoothingEnabled = true;
      g.drawImage(sm, -1.5 * PXT, -1.5 * PXT, NB * PXT, NB * PXT); g.restore();
    }
    // ambient occlusion: walls (strong) and blocking objects (soft)
    {
      const dark = this.theme === 'dungeon' || this.theme === 'tower';
      const sm = indicator((x, y) => BLOCK_TILES.has(this.tile(x, y)) && this.tile(x, y) !== T.WATER, [0, 0, 0]);
      g.save(); g.filter = `blur(${dark ? 18 : 12}px)`; g.globalAlpha = dark ? 0.85 : 0.5; g.imageSmoothingEnabled = true;
      g.drawImage(sm, -1.5 * PXT, -1.5 * PXT, NB * PXT, NB * PXT); g.restore();
      const sm2 = indicator((x, y) => this.inb(x, y) && !!this.block[this.idx(x, y)], [0, 0, 0]);
      g.save(); g.filter = 'blur(15px)'; g.globalAlpha = 0.35;
      g.drawImage(sm2, -1.5 * PXT, -1.5 * PXT, NB * PXT, NB * PXT); g.restore();
    }
    // project to isometric
    const out = document.createElement('canvas');
    out.width = (CHUNK + 1) * TW; out.height = (CHUNK + 1) * TH;
    const og = out.getContext('2d');
    og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
    og.setTransform(TW / 2 / PXT, TH / 2 / PXT, -TW / 2 / PXT, TH / 2 / PXT, (CHUNK + 1) * TW / 2, 0);
    og.drawImage(wc, 0, 0);
    og.setTransform(1, 0, 0, 1, 0, 0);
    const ox = (x0 - y0 - CHUNK - 1) * TW / 2, oy = (x0 + y0 - 1) * TH / 2;
    // screen-space decals (grass tufts, pebbles)
    const rr = mulberry32(cx * 7919 + cy * 104729 + this.def.seed);
    for (let y = y0; y < y0 + CHUNK; y++) for (let x = x0; x < x0 + CHUNK; x++) {
      if (!this.inb(x, y) || this.block[this.idx(x, y)]) continue;
      const t = this.tile(x, y);
      const kinds = t === T.GRASS ? ['g', 4] : t === T.FGRASS ? ['f', 4] : t === T.ROAD ? ['p', 2] : t === T.SNOW ? ['s', 1] : t === T.SEA ? ['w', 1] : t === T.DFLOOR ? ['r', 1] : null;
      if (!kinds) continue;
      for (let k = 0; k < kinds[1]; k++) {
        if (rr() > 0.7) continue;
        const u = x + rr(), v = y + rr(), p = iso(u, v), sx = p.x - ox, sy = p.y - oy;
        const kind = kinds[0];
        if (kind === 'g' || kind === 'f' || kind === 'w') {
          const set = DECALS[kind]; const spr = set[Math.floor(rr() * set.length)];
          og.drawImage(spr, sx - spr.width / 2, sy - spr.height + 2);
        } else if (kind === 'p') {
          const r0 = 1.5 + rr() * 2.5;
          og.fillStyle = 'rgba(0,0,0,0.35)'; og.beginPath(); og.ellipse(sx + 1, sy + 1, r0 + 1, r0 * 0.6, 0, 0, 7); og.fill();
          const gr = og.createRadialGradient(sx - r0 * 0.4, sy - r0 * 0.4, 0, sx, sy, r0 * 1.2);
          gr.addColorStop(0, '#c8c0b0'); gr.addColorStop(1, '#5a5248');
          og.fillStyle = gr; og.beginPath(); og.ellipse(sx, sy, r0, r0 * 0.62, rr(), 0, 7); og.fill();
        } else if (kind === 's') {
          const gr = og.createRadialGradient(sx - 3, sy - 2, 0, sx, sy, 9);
          gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(200,215,235,0)');
          og.fillStyle = gr; og.beginPath(); og.ellipse(sx, sy, 10, 5, 0, 0, 7); og.fill();
        } else if (kind === 'r') {
          for (let q = 0; q < 3; q++) { og.fillStyle = q % 2 ? '#3a342c' : '#5a5246'; og.beginPath(); og.ellipse(sx + (rr() - 0.5) * 10, sy + (rr() - 0.5) * 5, 1.5 + rr() * 2, 1 + rr(), 0, 0, 7); og.fill(); }
        }
      }
    }
    return { can: out, ox, oy };
  },
  getChunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.chunkCache.get(k);
    if (!c) {
      c = this.renderChunk(cx, cy); this.chunkCache.set(k, c);
      if (this.chunkCache.size > 44) this.chunkCache.delete(this.chunkCache.keys().next().value);
    } else { this.chunkCache.delete(k); this.chunkCache.set(k, c); }
    return c;
  },
  visibleChunks(cam, W, H, margin = 1) {
    const out = [];
    const corners = [unIso(cam.x - W / 2, cam.y - H / 2), unIso(cam.x + W / 2, cam.y - H / 2), unIso(cam.x - W / 2, cam.y + H / 2), unIso(cam.x + W / 2, cam.y + H / 2)];
    const minX = Math.min(...corners.map(c => c.x)), maxX = Math.max(...corners.map(c => c.x));
    const minY = Math.min(...corners.map(c => c.y)), maxY = Math.max(...corners.map(c => c.y));
    const nC = Math.ceil(this.size / CHUNK);
    for (let cy = Math.max(0, Math.floor(minY / CHUNK) - margin); cy <= Math.min(nC - 1, Math.floor(maxY / CHUNK) + margin); cy++)
      for (let cx = Math.max(0, Math.floor(minX / CHUNK) - margin); cx <= Math.min(nC - 1, Math.floor(maxX / CHUNK) + margin); cx++)
        out.push([cx, cy]);
    return out;
  },
  prefetch(cam, W, H) {
    for (const [cx, cy] of this.visibleChunks(cam, W, H, 2)) if (!this.chunkCache.has(cx + ',' + cy)) { this.getChunk(cx, cy); return; }
  },
  drawGround(ctx, cam, W, H) {
    for (const [cx, cy] of this.visibleChunks(cam, W, H, 1)) {
      const k = cx + ',' + cy;
      const c0 = this.chunkCache.get(k);
      const ox = (cx * CHUNK - cy * CHUNK - CHUNK - 1) * TW / 2, oy = (cx * CHUNK + cy * CHUNK - 1) * TH / 2;
      const sx = ox - cam.x + W / 2, sy = oy - cam.y + H / 2;
      if (sx > W || sy > H || sx + (CHUNK + 1) * TW < 0 || sy + (CHUNK + 1) * TH < 0) continue;
      const c = c0 || this.getChunk(cx, cy);
      ctx.drawImage(c.can, Math.round(sx), Math.round(sy));
    }
  },
  drawWaterFX(ctx, cam, W, H, t) {
    if (!this.waterList) { this.waterList = []; for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (this.tile(x, y) === T.WATER) this.waterList.push([x, y]); }
    if (!this.waterList.length) return;
    ctx.save();
    ctx.setTransform(TW / 2, TH / 2, -TW / 2, TH / 2, -cam.x + W / 2, -cam.y + H / 2);
    const p = Textures.pat(ctx, 'waterSpec');
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, dy, a] of [[t * 0.25, t * 0.12, 0.8], [-t * 0.18, t * 0.22, 0.6]]) {
      p.setTransform(new DOMMatrix().translate(dx, dy).scale(5 / TS));
      ctx.fillStyle = p; ctx.globalAlpha = a; ctx.beginPath();
      for (const [x, y] of this.waterList) { const s = iso(x + 0.5, y + 0.5); const sx = s.x - cam.x + W / 2, sy = s.y - cam.y + H / 2; if (sx < -64 || sx > W + 64 || sy < -64 || sy > H + 64) continue; ctx.rect(x, y, 1, 1); }
      ctx.fill();
    }
    ctx.restore();
  },
  drawClouds(ctx, cam, W, H, t) {
    if (!['grass', 'forest', 'snow'].includes(this.theme)) return;
    ctx.save();
    ctx.setTransform(TW / 2, TH / 2, -TW / 2, TH / 2, -cam.x + W / 2, -cam.y + H / 2);
    const p = Textures.pat(ctx, 'clouds');
    p.setTransform(new DOMMatrix().translate(t * 0.6, t * 0.25).scale(48 / TS));
    ctx.fillStyle = p; ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = this.theme === 'forest' ? 0.6 : 0.45;
    const c = unIso(cam.x, cam.y), R = Math.max(W, H) / TH;
    ctx.fillRect(c.x - R, c.y - R, R * 2, R * 2);
    ctx.restore();
  },
  visibleObjects(cam, W, H) {
    const out = [];
    for (const [cx, cy] of this.visibleChunks(cam, W, H, 1)) {
      const l = this.chunkObjs.get(cx + ',' + cy);
      if (l) for (const o of l) out.push(o);
    }
    return out;
  }
});

// grass tufts etc. (screen-space sprites)
const DECALS = {};
function buildDecals() {
  const mk = (cols, n, h, seed) => {
    const r = mulberry32(seed), list = [];
    for (let v = 0; v < 8; v++) {
      const c = document.createElement('canvas'); c.width = 18; c.height = h + 2; const g = c.getContext('2d');
      const blades = n + Math.floor(r() * n);
      for (let b = 0; b < blades; b++) {
        const bx = 9 + (r() - 0.5) * 10, len = h * (0.5 + r() * 0.5), bend = (r() - 0.5) * 8;
        const gr = g.createLinearGradient(0, h, 0, h - len);
        gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1 + Math.floor(r() * (cols.length - 1))]);
        g.strokeStyle = gr; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx, h + 1); g.quadraticCurveTo(bx + bend * 0.3, h - len * 0.6, bx + bend, h - len); g.stroke();
      }
      list.push(c);
    }
    return list;
  };
  DECALS.g = mk(['#1e3a10', '#6a9a34', '#8ab848', '#5a8a2a', '#a8b860'], 6, 10, 5);
  DECALS.f = mk(['#122a0a', '#3e6a24', '#5a8a30', '#6a5a2a'], 6, 12, 6);
  DECALS.w = mk(['#0a3a2a', '#2a8a5a', '#3aa070'], 4, 14, 7);
}
let TEX_NOISE = null;

// ---------------------------------------------------------------------
// Static object sprites
// ---------------------------------------------------------------------
const SPRITES = new Map();
const LIGHT = [-0.55, -0.65, 0.52];
function boxFaces(g, cam, W2, H2, x, y, w, h, H, texL, texR, texTop, uScale = PXT) {
  const P = (a, b) => { const p = iso(a, b); return [p.x - cam.x + W2, p.y - cam.y + H2]; };
  const A = P(x, y), B = P(x + w, y), C = P(x + w, y + h), D = P(x, y + h);
  const up = (p, k = H) => [p[0], p[1] - k];
  texQuad(g, texL, up(D), up(C), D, w * uScale, H, [D, C, up(C), up(D)]);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(...D); g.lineTo(...C); g.lineTo(...up(C)); g.lineTo(...up(D)); g.fill();
  texQuad(g, texR, up(C), up(B), C, h * uScale, H, [C, B, up(B), up(C)]);
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.moveTo(...C); g.lineTo(...B); g.lineTo(...up(B)); g.lineTo(...up(C)); g.fill();
  if (texTop) {
    texQuad(g, texTop, up(A), up(B), up(D), w * uScale, h * uScale, [up(A), up(B), up(C), up(D)]);
    g.fillStyle = 'rgba(255,240,210,0.08)'; g.beginPath(); g.moveTo(...up(A)); g.lineTo(...up(B)); g.lineTo(...up(C)); g.lineTo(...up(D)); g.fill();
  }
  // ground contact darkening along the base
  const gr = g.createLinearGradient(0, C[1] - 14, 0, C[1]);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(...D); g.lineTo(...C); g.lineTo(...B); g.lineTo(B[0], B[1] - 14); g.lineTo(C[0], C[1] - 14); g.lineTo(D[0], D[1] - 14); g.fill();
  return { A, B, C, D, up };
}
function contactShadow(g, x, y, rx, ry, a = 0.45) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}
function foliage(g, cx, cy, rx, ry, count, pal, r, leaf = 5) {
  const pts = [];
  for (let k = 0; k < count; k++) {
    let dx, dy; do { dx = r() * 2 - 1; dy = r() * 2 - 1; } while (dx * dx + dy * dy > 1);
    const dz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    pts.push([dx, dy, dz]);
  }
  pts.sort((a, b) => a[2] - b[2]);
  for (const [dx, dy, dz] of pts) {
    const lit = clamp(dx * LIGHT[0] + dy * LIGHT[1] + dz * LIGHT[2], 0, 1) * 0.85 + 0.15 * dz + (r() - 0.5) * 0.15;
    const ci = clamp(Math.floor(lit * pal.length), 0, pal.length - 1);
    const px = cx + dx * rx, py = cy + dy * ry - dz * ry * 0.25;
    g.fillStyle = pal[ci];
    const n = 3 + Math.floor(r() * 3);
    for (let q = 0; q < n; q++) {
      g.beginPath(); g.ellipse(px + (r() - 0.5) * leaf * 1.6, py + (r() - 0.5) * leaf * 1.2, leaf * (0.6 + r() * 0.6), leaf * (0.35 + r() * 0.35), r() * 3.14, 0, 7); g.fill();
    }
  }
}
function trunk(g, x, y, w0, w1, h, r) {
  g.save();
  g.beginPath(); g.moveTo(x - w0, y); g.quadraticCurveTo(x - w1 * 1.1, y - h * 0.5, x - w1, y - h); g.lineTo(x + w1, y - h); g.quadraticCurveTo(x + w1 * 1.1, y - h * 0.5, x + w0, y); g.closePath();
  g.fillStyle = Textures.pat(g, 'bark'); g.fill();
  const gr = g.createLinearGradient(x - w0, 0, x + w0, 0);
  gr.addColorStop(0, 'rgba(255,220,170,0.12)'); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = gr; g.fill();
  // roots
  g.fillStyle = 'rgba(40,26,16,0.9)';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * w0 * 0.4, y - 4); g.quadraticCurveTo(x + s * w0 * 1.3, y - 1, x + s * w0 * 2, y + 1); g.lineTo(x + s * w0 * 0.6, y + 1); g.fill(); }
  g.restore();
}

function makeSprite(o, theme) {
  const v = Math.floor((o.v || 0) * 4);
  const key = o.type + '|' + v + '|' + theme + '|' + (o.var || 0);
  if (SPRITES.has(key)) return SPRITES.get(key);
  const size = {
    tree: [180, 210, 90, 196], mushtree: [110, 120, 55, 108], pine: [130, 200, 65, 188], rock: [90, 70, 45, 52],
    coral: [80, 70, 40, 60], ruin: [70, 120, 35, 108], house: [230, 240, 115, 122], wall: [80, 120, 40, 76],
    dwall: [80, 120, 40, 76], pillar: [60, 120, 30, 108], statue: [90, 120, 45, 64], fountain: [220, 150, 110, 52], bigtree: [320, 340, 160, 270]
  }[o.type];
  if (!size) return null;
  const c = document.createElement('canvas'); c.width = size[0]; c.height = size[1];
  const g = c.getContext('2d');
  const ax = size[2], ay = size[3], r = mulberry32(((o.v || 0) * 1e6) | 0 + v * 31);
  const fakeCam = iso(o.x, o.y), meta = {};
  switch (o.type) {
    case 'tree': {
      contactShadow(g, ax + 6, ay, 44, 18, 0.5);
      trunk(g, ax, ay, 7, 4.5, 70, r);
      const pal = v % 2 ? ['#0f2a0c', '#1c4214', '#2c5a1c', '#3e7426', '#5a9034', '#82b048'] : ['#122a0a', '#22440e', '#365e16', '#4e7a20', '#6e9a2c', '#a0c050'];
      foliage(g, ax - 14, ay - 86, 26, 22, 55, pal, r, 5);
      foliage(g, ax + 16, ay - 82, 26, 22, 55, pal, r, 5);
      foliage(g, ax, ay - 106, 38, 34, 130, pal, r, 5.5);
      foliage(g, ax - 4, ay - 132, 24, 20, 55, pal, r, 5);
      break;
    }
    case 'mushtree': {
      contactShadow(g, ax + 4, ay, 30, 12, 0.5);
      g.save(); g.beginPath(); g.moveTo(ax - 7, ay); g.quadraticCurveTo(ax - 4, ay - 30, ax - 5, ay - 52); g.lineTo(ax + 5, ay - 52); g.quadraticCurveTo(ax + 4, ay - 30, ax + 8, ay); g.closePath();
      const sg = g.createLinearGradient(ax - 8, 0, ax + 8, 0); sg.addColorStop(0, '#f0e8d0'); sg.addColorStop(1, '#8a826a'); g.fillStyle = sg; g.fill();
      g.globalCompositeOperation = 'soft-light'; g.fillStyle = Textures.pat(g, 'grain'); g.fill(); g.restore();
      const capC = v % 2 ? ['#5a1a3a', '#a03a6a', '#e070a0'] : ['#1a3a5a', '#3a6a9a', '#70a8e0'];
      const cg = g.createRadialGradient(ax - 12, ay - 70, 2, ax, ay - 58, 42); cg.addColorStop(0, capC[2]); cg.addColorStop(0.5, capC[1]); cg.addColorStop(1, capC[0]);
      g.fillStyle = cg; g.beginPath(); g.ellipse(ax, ay - 54, 38, 24, 0, Math.PI, 0); g.quadraticCurveTo(ax, ay - 46, ax - 38, ay - 54); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(ax, ay - 53, 36, 6, 0, 0, Math.PI); g.fill();
      for (let i = 0; i < 9; i++) { const a = Math.PI + r() * Math.PI, d = r() * 0.8; g.fillStyle = 'rgba(255,250,235,0.85)'; g.beginPath(); g.ellipse(ax + Math.cos(a) * 34 * d, ay - 54 + Math.sin(a) * 22 * d, 2 + r() * 3, 1.5 + r() * 2, 0, 0, 7); g.fill(); }
      break;
    }
    case 'pine': {
      contactShadow(g, ax + 5, ay, 34, 13, 0.5);
      trunk(g, ax, ay, 5, 3.5, 40, r);
      const snow = theme === 'snow';
      for (let i = 0; i < 5; i++) {
        const yy = ay - 26 - i * 26, ww = 40 - i * 7, hh = 40;
        for (let k = 0; k < 90; k++) {
          const t = r(), side = r() * 2 - 1, px = ax + side * ww * (1 - t * 0.9) * 1.0, py = yy - t * hh;
          const lit = clamp(0.5 - side * 0.45 + t * 0.2 + (r() - 0.5) * 0.2, 0, 1);
          g.strokeStyle = shade('#1e3a26', lit * 0.55 - 0.2); g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + side * 7, py + 6 + r() * 3); g.stroke();
        }
        if (snow) {
          g.fillStyle = 'rgba(245,250,255,0.95)';
          for (let k = 0; k < 18; k++) { const t = r() * 0.8, side = (r() * 2 - 1) * 0.8; g.beginPath(); g.ellipse(ax + side * ww * (1 - t * 0.9), yy - t * hh - 2, 5 + r() * 4, 2 + r() * 1.5, side * 0.4, 0, 7); g.fill(); }
        }
      }
      break;
    }
    case 'rock': {
      contactShadow(g, ax + 4, ay, 32, 12, 0.55);
      const pts = []; const n = 9;
      for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI; const rr2 = 0.75 + r() * 0.35; pts.push([ax + Math.cos(a) * 26 * rr2, ay - 4 + Math.sin(a) * 24 * rr2]); }
      g.save(); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.quadraticCurveTo(ax, ay + 6, pts[0][0], pts[0][1]); g.closePath();
      g.fillStyle = Textures.pat(g, 'rock'); g.fill();
      const lg = g.createLinearGradient(ax - 26, ay - 28, ax + 20, ay + 4); lg.addColorStop(0, 'rgba(255,250,230,0.3)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = lg; g.fill(); g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ax - 8, ay - 26); g.lineTo(ax - 2, ay - 10); g.lineTo(ax + 10, ay - 4); g.stroke();
      if (theme === 'snow') { g.fillStyle = 'rgba(245,250,255,0.95)'; g.beginPath(); g.ellipse(ax - 4, ay - 24, 20, 7, -0.1, 0, 7); g.fill(); }
      g.restore();
      break;
    }
    case 'coral': {
      const cols = v % 2 ? ['#a02a4a', '#e0607a', '#ffb0c0'] : ['#a0581a', '#f0a050', '#ffd8a0'];
      for (let i = 0; i < 9; i++) {
        const bx = ax + (r() - 0.5) * 36, h = 14 + r() * 26, wv = (r() - 0.5) * 10;
        const gr = g.createLinearGradient(bx, ay, bx + wv, ay - h); gr.addColorStop(0, cols[0]); gr.addColorStop(0.7, cols[1]); gr.addColorStop(1, cols[2]);
        g.strokeStyle = gr; g.lineWidth = 3 + r() * 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx, ay - 2); g.quadraticCurveTo(bx + wv, ay - h * 0.5, bx + wv * 1.5, ay - h); g.stroke();
      }
      break;
    }
    case 'ruin': {
      contactShadow(g, ax + 4, ay, 26, 10, 0.5);
      g.save(); g.beginPath(); g.rect(ax - 10, ay - 78, 20, 78); g.fillStyle = Textures.pat(g, 'townwall'); g.fill();
      const cg = g.createLinearGradient(ax - 10, 0, ax + 10, 0); cg.addColorStop(0, 'rgba(255,255,255,0.15)'); cg.addColorStop(0.4, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = cg; g.fill();
      g.fillStyle = 'rgba(40,120,110,0.35)'; g.fill();
      g.restore();
      g.fillStyle = '#7a8a88'; g.fillRect(ax - 15, ay - 86, 30, 9);
      break;
    }
    case 'house': {
      const roofTex = theme === 'snow' ? 'roofSnow' : theme === 'forest' ? 'roofMoss' : ['roofRed', 'roofBlue', 'roofBrown'][o.var % 3];
      const b = boxFaces(g, fakeCam, ax, ay, o.x + 0.15, o.y + 0.15, o.w - 0.3, o.h - 0.3, 56, 'plaster', 'plaster', null, 40);
      const { A, B, C, D, up } = b;
      // stone foundation
      texQuad(g, 'townwall', up(D, 10), up(C, 10), D, 120, 10, [D, C, up(C, 10), up(D, 10)]);
      texQuad(g, 'townwall', up(C, 10), up(B, 10), C, 120, 10, [C, B, up(B, 10), up(C, 10)]);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(...C); g.lineTo(...B); g.lineTo(...up(B, 10)); g.lineTo(...up(C, 10)); g.fill();
      // timber framing
      const beam = (p, q, w = 4) => { g.save(); g.strokeStyle = '#3a2414'; g.lineWidth = w; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); g.strokeStyle = 'rgba(255,220,170,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p[0] - 1, p[1] - 1); g.lineTo(q[0] - 1, q[1] - 1); g.stroke(); g.restore(); };
      beam(up(D), up(C)); beam(up(C), up(B)); beam(up(D, 10), up(C, 10), 3); beam(up(C, 10), up(B, 10), 3);
      beam(D, up(D)); beam(C, up(C), 5); beam(B, up(B));
      const L = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
      beam(L(D, C, 0.5), L(up(D), up(C), 0.5), 3);
      beam(L(C, B, 0.33), L(up(C), up(B), 0.33), 3); beam(L(C, B, 0.66), L(up(C), up(B), 0.66), 3);
      beam(L(up(C, 10), up(B, 10), 0.33), L(up(C), up(B), 0.66), 2);
      // door
      const dA = L(D, C, 0.18), dB = L(D, C, 0.42);
      texQuad(g, 'wood', up(dA, 34), up(dB, 34), dA, 24, 34, [dA, dB, up(dB, 34), up(dA, 34)]);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(...dA); g.lineTo(...dB); g.lineTo(...up(dB, 34)); g.lineTo(...up(dA, 34)); g.fill();
      g.fillStyle = '#c8a040'; const kn = L(dA, dB, 0.8); g.beginPath(); g.arc(kn[0], kn[1] - 16, 1.5, 0, 7); g.fill();
      // windows
      const win = (p, q, lit) => {
        const pts = [up(p, 22), up(q, 22), up(q, 38), up(p, 38)];
        g.fillStyle = lit ? '#ffcf70' : '#2a3a4a'; g.beginPath(); pts.forEach((s, i) => i ? g.lineTo(...s) : g.moveTo(...s)); g.closePath(); g.fill();
        if (lit) { const m = L(pts[0], pts[2], 0.5); const gg = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], 22); gg.addColorStop(0, 'rgba(255,200,100,0.35)'); gg.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gg; g.fillRect(m[0] - 22, m[1] - 22, 44, 44); }
        g.strokeStyle = '#3a2414'; g.lineWidth = 2; g.beginPath(); pts.forEach((s, i) => i ? g.lineTo(...s) : g.moveTo(...s)); g.closePath(); g.stroke();
        const mt = L(pts[0], pts[1], 0.5), mb = L(pts[3], pts[2], 0.5); g.beginPath(); g.moveTo(...mt); g.lineTo(...mb); g.stroke();
      };
      win(L(D, C, 0.6), L(D, C, 0.82), true);
      win(L(C, B, 0.12), L(C, B, 0.28), true); win(L(C, B, 0.45), L(C, B, 0.58), false); win(L(C, B, 0.75), L(C, B, 0.9), true);
      // gable roof with overhang
      const top = p => [p[0], p[1] - 56];
      const ov = 8;
      const Ar = top(A), Br = top(B), Cr = top(C), Dr = top(D);
      const Do = [Dr[0] - ov, Dr[1] + ov * 0.5], Co = [Cr[0], Cr[1] + ov], Ao = [Ar[0] - ov, Ar[1] - ov * 0.5 + 2], Bo = [Br[0], Br[1]];
      const r1 = [(Ao[0] + Do[0]) / 2, (Ao[1] + Do[1]) / 2 - 42], r2 = [(Br[0] + Cr[0]) / 2 + ov * 0.5, (Br[1] + Cr[1]) / 2 - 42];
      texQuad(g, roofTex, r1, r2, Ao, 140, 60, [Ao, Bo, r2, r1]);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.moveTo(...Ao); g.lineTo(...Bo); g.lineTo(...r2); g.lineTo(...r1); g.fill();
      // gable wall
      texQuad(g, 'plaster', Cr, Br, C, 60, 56, [Cr, Br, r2]);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(...Cr); g.lineTo(...Br); g.lineTo(...r2); g.fill();
      beam(Cr, r2, 3); beam(Br, r2, 3); beam(L(Cr, Br, 0.5), r2, 3);
      // front roof plane
      texQuad(g, roofTex, r1, r2, Do, 140, 60, [Do, Co, r2, r1]);
      const rg = g.createLinearGradient(r1[0], r1[1], Do[0], Do[1]); rg.addColorStop(0, 'rgba(255,240,200,0.15)'); rg.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = rg; g.beginPath(); g.moveTo(...Do); g.lineTo(...Co); g.lineTo(...r2); g.lineTo(...r1); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(...Do); g.lineTo(...Co); g.stroke();
      g.strokeStyle = '#2a1a0e'; g.lineWidth = 4; g.beginPath(); g.moveTo(...r1); g.lineTo(...r2); g.stroke();
      g.strokeStyle = '#2a1a0e'; g.lineWidth = 3; g.beginPath(); g.moveTo(...Co); g.lineTo(...r2); g.stroke();
      // chimney
      const ch = L(r1, r2, 0.72);
      const cb = [ch[0] + 4, ch[1] + 22];
      g.save(); g.beginPath(); g.rect(cb[0] - 6, cb[1] - 34, 12, 30); g.fillStyle = Textures.pat(g, 'townwall'); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cb[0], cb[1] - 34, 6, 30); g.restore();
      g.fillStyle = '#3a342c'; g.fillRect(cb[0] - 7, cb[1] - 37, 14, 4);
      meta.smoke = [cb[0] - ax, cb[1] - 38 - ay];
      break;
    }
    case 'wall': {
      const tex = theme === 'snow' ? 'snowwall' : theme === 'forest' ? 'forestwall' : 'townwall';
      const b = boxFaces(g, fakeCam, ax, ay, o.x, o.y, 1, 1, 46, tex, tex, tex);
      // crenellation
      boxFaces(g, fakeCam, ax, ay - 46, o.x + 0.3, o.y + 0.3, 0.4, 0.4, 12, tex, tex, tex);
      if (theme === 'snow') { g.fillStyle = 'rgba(250,252,255,0.9)'; g.beginPath(); g.moveTo(...b.up(b.A)); g.lineTo(...b.up(b.B)); g.lineTo(...b.up(b.C)); g.lineTo(...b.up(b.D)); g.fill(); }
      break;
    }
    case 'dwall': {
      const tex = theme === 'tower' ? 'twall' : 'dwall';
      const b = boxFaces(g, fakeCam, ax, ay, o.x, o.y, 1, 1, 52, tex, tex, null);
      g.fillStyle = theme === 'tower' ? '#140e1c' : '#1a1612';
      g.beginPath(); g.moveTo(...b.up(b.A)); g.lineTo(...b.up(b.B)); g.lineTo(...b.up(b.C)); g.lineTo(...b.up(b.D)); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.moveTo(...b.up(b.D)); g.lineTo(...b.up(b.C)); g.lineTo(...b.up(b.B)); g.stroke();
      if (v === 3) { // moss / crystal streak
        const m = [(b.C[0] + b.D[0]) / 2, (b.C[1] + b.D[1]) / 2];
        const gg = g.createLinearGradient(0, m[1] - 52, 0, m[1]); gg.addColorStop(0, theme === 'tower' ? 'rgba(180,100,255,0.5)' : 'rgba(60,110,30,0.6)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gg; g.fillRect(m[0] - 8, m[1] - 52, 12, 46);
      }
      break;
    }
    case 'pillar': {
      const tex = theme === 'tower' ? 'twall' : 'townwall';
      contactShadow(g, ax + 4, ay, 22, 9, 0.6);
      g.save(); g.beginPath(); g.rect(ax - 10, ay - 84, 20, 80); g.fillStyle = Textures.pat(g, tex); g.fill();
      const cg = g.createLinearGradient(ax - 10, 0, ax + 10, 0); cg.addColorStop(0, 'rgba(255,240,220,0.25)'); cg.addColorStop(0.35, 'rgba(255,255,255,0.05)'); cg.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = cg; g.fill();
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ax - 10 + k * 5 + 2, ay - 84, 1, 80); }
      g.restore();
      const cap = (y, h) => { g.save(); g.beginPath(); g.rect(ax - 15, y, 30, h); g.fillStyle = Textures.pat(g, tex); g.fill(); const k = g.createLinearGradient(ax - 15, 0, ax + 15, 0); k.addColorStop(0, 'rgba(255,255,255,0.2)'); k.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = k; g.fill(); g.restore(); };
      cap(ay - 92, 9); cap(ay - 8, 8);
      break;
    }
    case 'statue': {
      const b = boxFaces(g, fakeCam, ax, ay, o.x + 0.1, o.y + 0.1, 0.8, 0.8, 16, 'townwall', 'townwall', 'stone');
      const q = iso(o.x + 0.5, o.y + 0.5); const qx = q.x - fakeCam.x + ax, qy = q.y - fakeCam.y + ay - 16;
      g.save();
      g.beginPath(); g.moveTo(qx - 7, qy); g.lineTo(qx - 6, qy - 30); g.lineTo(qx - 10, qy - 32); g.lineTo(qx - 8, qy - 42); g.lineTo(qx + 8, qy - 42); g.lineTo(qx + 10, qy - 32); g.lineTo(qx + 6, qy - 30); g.lineTo(qx + 7, qy); g.closePath();
      g.arc(qx, qy - 48, 6, 0, 7);
      g.fillStyle = '#a8a49c'; g.fill(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = Textures.pat(g, 'grain'); g.fill(); g.globalCompositeOperation = 'source-over';
      const mg = g.createLinearGradient(qx - 10, 0, qx + 10, 0); mg.addColorStop(0, 'rgba(255,255,255,0.3)'); mg.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = mg; g.fill();
      g.restore();
      g.strokeStyle = '#8a867e'; g.lineWidth = 3; g.beginPath(); g.moveTo(qx + 9, qy - 34); g.lineTo(qx + 12, qy - 80); g.stroke();
      g.fillStyle = '#c8c4bc'; g.beginPath(); g.moveTo(qx + 12, qy - 80); g.lineTo(qx + 9, qy - 92); g.lineTo(qx + 15, qy - 80); g.fill();
      break;
    }
    case 'fountain': {
      const b = boxFaces(g, fakeCam, ax, ay, o.x + 0.1, o.y + 0.1, 2.8, 2.8, 14, 'townwall', 'townwall', 'plaza');
      // inner pool (filled with water live) - dark recess
      const P = (a, c2) => { const p = iso(a, c2); return [p.x - fakeCam.x + ax, p.y - fakeCam.y + ay - 14]; };
      const pts = [P(o.x + 0.45, o.y + 0.45), P(o.x + 2.55, o.y + 0.45), P(o.x + 2.55, o.y + 2.55), P(o.x + 0.45, o.y + 2.55)];
      g.fillStyle = '#10202a'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.closePath(); g.fill();
      meta.pool = pts.map(p => [p[0] - ax, p[1] - ay]);
      break;
    }
    case 'bigtree': {
      const q = iso(o.x + 1.5, o.y + 1.5); const qx = q.x - fakeCam.x + ax, qy = q.y - fakeCam.y + ay;
      contactShadow(g, qx + 10, qy, 100, 40, 0.55);
      trunk(g, qx, qy, 26, 14, 140, r);
      const pal = ['#0c240c', '#163a14', '#22521c', '#326a24', '#4a8630', '#6aa43e', '#98c85a'];
      foliage(g, qx - 60, qy - 150, 45, 36, 120, pal, r, 7);
      foliage(g, qx + 62, qy - 158, 45, 36, 120, pal, r, 7);
      foliage(g, qx, qy - 200, 90, 70, 380, pal, r, 7.5);
      foliage(g, qx - 10, qy - 250, 52, 40, 140, pal, r, 7);
      break;
    }
  }
  const s = { can: c, ax, ay, meta };
  SPRITES.set(key, s);
  return s;
}

function drawStatic(ctx, o, cam, W2, H2, time) {
  const p = iso(o.x, o.y); const sx = p.x - cam.x + W2, sy = p.y - cam.y + H2;
  const theme = o.theme || G.map.theme;
  const spr = makeSprite(o, theme);
  if (spr) {
    const s = (o.type === 'tree' || o.type === 'pine' || o.type === 'mushtree' || o.type === 'rock' || o.type === 'coral') ? (o.s || 1) : 1;
    if (o.type === 'tree' || o.type === 'pine' || o.type === 'bigtree') {
      const k = Math.sin(time * 1.1 + o.x * 0.7 + o.y) * 0.018;
      ctx.save(); ctx.translate(sx, sy); ctx.transform(1, 0, k, 1, 0, 0);
      ctx.drawImage(spr.can, -spr.ax * s, -spr.ay * s, spr.can.width * s, spr.can.height * s); ctx.restore();
    } else ctx.drawImage(spr.can, sx - spr.ax * s, sy - spr.ay * s, spr.can.width * s, spr.can.height * s);
    // animated parts
    if (o.type === 'house' && spr.meta.smoke) {
      const [mx, my] = spr.meta.smoke;
      for (let i = 0; i < 6; i++) {
        const t = (time * 0.25 + i / 6) % 1;
        ctx.fillStyle = `rgba(190,190,195,${0.3 * (1 - t)})`; ctx.beginPath(); ctx.arc(sx + mx + t * 18 + Math.sin(t * 6 + i) * 3, sy + my - t * 55, 4 + t * 12, 0, 7); ctx.fill();
      }
    }
    if (o.type === 'fountain' && spr.meta.pool) {
      const pts = spr.meta.pool.map(q => [sx + q[0], sy + q[1]]);
      ctx.save(); ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(...q) : ctx.moveTo(...q)); ctx.closePath(); ctx.clip();
      const frozen = theme === 'snow';
      ctx.fillStyle = Textures.pat(ctx, frozen ? 'ice' : 'water'); ctx.fillRect(sx - 120, sy - 80, 240, 120);
      if (!frozen) {
        const sp = Textures.pat(ctx, 'waterSpec'); sp.setTransform(new DOMMatrix().translate(time * 12, time * 5).scale(0.5));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = sp; ctx.fillRect(sx - 120, sy - 80, 240, 120);
      }
      ctx.restore();
      const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
      const cg = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0); cg.addColorStop(0, '#d8d0c0'); cg.addColorStop(1, '#6a645a');
      ctx.fillStyle = cg; ctx.fillRect(cx - 5, cy - 42, 10, 42);
      ctx.fillStyle = '#b8b0a0'; ctx.beginPath(); ctx.ellipse(cx, cy - 42, 16, 6, 0, 0, 7); ctx.fill();
      if (!frozen) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 24; i++) {
          const t = (time * 1.1 + i / 24) % 1, ang = i / 24 * Math.PI * 2;
          ctx.fillStyle = `rgba(190,225,255,${0.7 * (1 - t)})`;
          ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 30 * t, cy - 46 + Math.sin(ang) * 11 * t - Math.sin(t * Math.PI) * 22 + 42 * t * t, 1.6, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }
    if (o.type === 'bigtree') {
      const q = iso(o.x + 1.5, o.y + 1.5); const qx = q.x - cam.x + W2, qy = q.y - cam.y + H2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const a = time * 0.5 + i * 0.45, rr = 70 + Math.sin(time + i) * 25;
        ctx.fillStyle = `rgba(200,255,150,${0.35 + Math.sin(time * 3 + i) * 0.25})`;
        ctx.beginPath(); ctx.arc(qx + Math.cos(a) * rr, qy - 150 + Math.sin(a * 1.3) * 60, 2, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    return;
  }
  switch (o.type) {
    case 'kelp': {
      const s = o.s || 1;
      for (let i = -1; i <= 1; i++) {
        const gr = ctx.createLinearGradient(0, sy, 0, sy - 50 * s); gr.addColorStop(0, '#0e4a2a'); gr.addColorStop(1, '#4ab07a');
        ctx.strokeStyle = gr; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx + i * 6, sy); ctx.quadraticCurveTo(sx + i * 6 + Math.sin(time * 2 + o.x + i) * 8, sy - 25 * s, sx + i * 6 + Math.sin(time * 2 + i) * 4, sy - 50 * s); ctx.stroke();
      }
      break;
    }
    case 'flower': {
      const c = ['#ffe866', '#ff8aaa', '#ffffff', '#a8d0ff'][Math.floor(o.v * 4)];
      for (let i = 0; i < 3; i++) { const fx = sx + (i - 1) * 4, fy = sy - 3 - (i % 2) * 2; ctx.strokeStyle = '#2a5a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx, fy + 4); ctx.lineTo(fx, fy); ctx.stroke(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, 7); ctx.fill(); }
      break;
    }
    case 'snowtuft': { const gr = ctx.createRadialGradient(sx - 2, sy - 2, 0, sx, sy, 8); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(210,225,240,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(sx, sy, 9, 4, 0, 0, 7); ctx.fill(); break; }
    case 'shell': { const gr = ctx.createRadialGradient(sx - 1, sy - 2, 0, sx, sy, 4); gr.addColorStop(0, '#fff4e8'); gr.addColorStop(1, '#c0907a'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy, 3.5, Math.PI, 0); ctx.fill(); break; }
    case 'bones': {
      ctx.strokeStyle = '#d8d0b8'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx - 6, sy - 2); ctx.lineTo(sx + 6, sy + 2); ctx.moveTo(sx - 5, sy + 3); ctx.lineTo(sx + 4, sy - 3); ctx.stroke();
      if (o.v > 0.6) { const gr = ctx.createRadialGradient(sx + 6, sy - 5, 0, sx + 8, sy - 3, 5); gr.addColorStop(0, '#f0ead8'); gr.addColorStop(1, '#8a8270'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx + 8, sy - 3, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1410'; ctx.fillRect(sx + 6, sy - 4, 1.6, 1.6); ctx.fillRect(sx + 9, sy - 4, 1.6, 1.6); }
      break;
    }
    case 'crystal': {
      const gl = 0.6 + Math.sin(time * 2 + o.x) * 0.3;
      glowAt(ctx, sx, sy - 10, 24, '#b070ff', gl * 0.5);
      const gr = ctx.createLinearGradient(sx - 6, sy - 22, sx + 6, sy);
      gr.addColorStop(0, '#f0d8ff'); gr.addColorStop(0.5, `rgba(170,90,255,${0.6 + gl * 0.3})`); gr.addColorStop(1, '#3a1a6a');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy - 24); ctx.lineTo(sx + 6, sy - 7); ctx.lineTo(sx, sy); ctx.lineTo(sx - 6, sy - 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,255,0.8)'; ctx.beginPath(); ctx.moveTo(sx, sy - 24); ctx.lineTo(sx - 2, sy - 9); ctx.lineTo(sx - 5, sy - 7); ctx.fill();
      break;
    }
    case 'torch': {
      const h = o.onWall ? 50 : 40;
      const pg = ctx.createLinearGradient(sx - 2, 0, sx + 2, 0); pg.addColorStop(0, '#6a4a2a'); pg.addColorStop(1, '#2a1a0a');
      ctx.fillStyle = pg; ctx.fillRect(sx - 2, sy - h, 4, h);
      ctx.fillStyle = '#4a3e30'; ctx.fillRect(sx - 5, sy - h - 4, 10, 5);
      const f = Math.sin(time * 15 + o.x * 3) * 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy - h - 10, 0, sx, sy - h - 10, 34);
      g.addColorStop(0, 'rgba(255,200,100,0.6)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - h - 10, 34, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff9a30'; ctx.beginPath(); ctx.moveTo(sx - 5, sy - h - 3); ctx.quadraticCurveTo(sx + f, sy - h - 26, sx + 5, sy - h - 3); ctx.fill();
      ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.moveTo(sx - 2, sy - h - 3); ctx.quadraticCurveTo(sx + f * 0.5, sy - h - 14, sx + 2, sy - h - 3); ctx.fill();
      ctx.restore();
      break;
    }
  }
}
function staticDepth(o) {
  if (o.w) return o.x + o.w / 2 + o.y + o.h / 2;
  if (o.type === 'wall' || o.type === 'dwall') return o.x + o.y + 1;
  if (o.deco) return o.x + o.y - 2;
  return o.x + o.y;
}
