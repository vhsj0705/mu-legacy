// ---------------------------------------------------------------------
// Procedural realistic textures (seamless 256x256), generated at startup.
// Height maps are lit with a top-left light so stone, bark and shingles
// get real relief instead of flat fills.
// ---------------------------------------------------------------------
const TS = 256;
const TEX = {};

const RGB = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// periodic value noise (quintic interpolation)
function pnoise(period, r) {
  period = Math.min(period, TS);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const out = new Float32Array(TS * TS), sc = period / TS;
  for (let y = 0; y < TS; y++) {
    const fy = y * sc, yi = Math.floor(fy); let ty = fy - yi; ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const y0 = (yi % period) * period, y1 = ((yi + 1) % period) * period;
    for (let x = 0; x < TS; x++) {
      const fx = x * sc, xi = Math.floor(fx); let tx = fx - xi; tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const x0 = xi % period, x1 = (xi + 1) % period;
      const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * tx, b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * tx;
      out[y * TS + x] = a + (b - a) * ty;
    }
  }
  return out;
}
function fbm(period, oct, r, gain = 0.5) {
  const out = new Float32Array(TS * TS); let amp = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    const n = pnoise(period << o, r);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}
// periodic voronoi: f1, f2 (in cell units) and cell id
function voronoi(cells, r, jit = 1, sx = 1) {
  const cw = TS / cells, ch = TS / cells, pts = [];
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) pts.push([(cx + 0.5 + (r() - 0.5) * jit) * cw, (cy + 0.5 + (r() - 0.5) * jit) * ch, r()]);
  const f1 = new Float32Array(TS * TS), f2 = new Float32Array(TS * TS), id = new Float32Array(TS * TS);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const cx = Math.floor(x / cw), cy = Math.floor(y / ch);
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, nx = (gx + cells) % cells, ny = (gy + cells) % cells;
      const p = pts[ny * cells + nx];
      const px = p[0] + Math.floor(gx / cells) * TS, py = p[1] + Math.floor(gy / cells) * TS;
      const d = Math.hypot((x - px) * sx, y - py) / cw;
      if (d < d1) { d2 = d1; d1 = d; best = p[2]; } else if (d < d2) d2 = d;
    }
    const i = y * TS + x; f1[i] = d1; f2[i] = d2; id[i] = best;
  }
  return { f1, f2, id };
}
// height -> diffuse lighting factor (~1.0 on flat ground)
function lightH(h, k) {
  const s = new Float32Array(TS * TS);
  let L = [-0.7, -0.45, 0.8]; const ll = Math.hypot(...L); L = L.map(v => v / ll);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const xl = (x + TS - 1) % TS, xr = (x + 1) % TS, yu = (y + TS - 1) % TS, yd = (y + 1) % TS;
    const dx = (h[y * TS + xr] - h[y * TS + xl]) * k, dy = (h[yd * TS + x] - h[yu * TS + x]) * k;
    const n = Math.hypot(dx, dy, 1);
    const d = Math.max(0, (-dx * L[0] - dy * L[1] + L[2]) / n);
    s[y * TS + x] = 0.3 + 0.88 * d;
  }
  return s;
}
function build(fn) {
  const c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d'), img = g.createImageData(TS, TS), D = img.data;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const i = y * TS + x, col = fn(i, x, y);
    D[i * 4] = clamp(col[0], 0, 255); D[i * 4 + 1] = clamp(col[1], 0, 255); D[i * 4 + 2] = clamp(col[2], 0, 255); D[i * 4 + 3] = col[3] == null ? 255 : col[3];
  }
  g.putImageData(img, 0, 0);
  return c;
}
// draw wrapped strokes/blobs onto a texture canvas so they tile seamlessly
function wrapDraw(c, fn) {
  const g = c.getContext('2d');
  for (const ox of [-TS, 0, TS]) for (const oy of [-TS, 0, TS]) { g.save(); g.translate(ox, oy); fn(g); g.restore(); }
}

const Textures = {
  ready: false,
  gen() {
    const t0 = performance.now();
    const R = s => mulberry32(s);

    // ---------- grass
    const mkGrass = (seed, dark, mid, light, dry, density) => {
      const r = R(seed), n1 = fbm(4, 5, r), n2 = fbm(32, 3, r), n3 = fbm(8, 3, r);
      const hgt = n2.map((v, i) => v * 0.7 + n1[i] * 0.3), sh = lightH(hgt, 9);
      const A = RGB(dark), B = RGB(mid), C = RGB(light), Dr = RGB(dry);
      const c = build(i => {
        let col = mixc(A, B, sstep(0.3, 0.7, n1[i]));
        col = mixc(col, C, sstep(0.55, 0.9, n2[i]) * 0.6);
        col = mixc(col, Dr, sstep(0.62, 0.8, n3[i]) * 0.45);
        return mulc(col, sh[i] * (0.86 + n2[i] * 0.28));
      });
      const rr = R(seed + 1);
      const blades = [];
      for (let k = 0; k < density; k++) blades.push([rr() * TS, rr() * TS, 2 + rr() * 5, (rr() - 0.5) * 1.2, rr()]);
      wrapDraw(c, g => {
        for (const [x, y, l, a, v] of blades) {
          g.strokeStyle = v < 0.35 ? 'rgba(20,40,8,0.55)' : v < 0.8 ? `rgba(${shade(mid, 0.1).slice(4, -1)},0.6)` : 'rgba(200,230,120,0.5)';
          g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); g.stroke();
        }
      });
      return c;
    };
    TEX.grass = mkGrass(11, '#2c4d16', '#4f7a26', '#78a23a', '#8a8a42', 2600);
    TEX.fgrass = mkGrass(12, '#1a3410', '#2f5520', '#47702a', '#5a4a26', 2000);
    { // leaf litter on forest grass
      const r = R(13);
      const leaves = []; for (let k = 0; k < 260; k++) leaves.push([r() * TS, r() * TS, r() * 6.28, r()]);
      wrapDraw(TEX.fgrass, g => leaves.forEach(([x, y, a, v]) => { g.fillStyle = v < 0.5 ? 'rgba(110,70,30,0.7)' : 'rgba(150,110,40,0.6)'; g.beginPath(); g.ellipse(x, y, 2.6, 1.2, a, 0, 7); g.fill(); }));
    }

    // ---------- dirt road with pebbles and ruts
    {
      const r = R(21), n1 = fbm(4, 5, r), n2 = fbm(32, 3, r), vo = voronoi(22, r, 0.9);
      const hgt = new Float32Array(TS * TS);
      for (let i = 0; i < hgt.length; i++) { const peb = vo.id[i] > 0.55 ? sstep(0.42, 0.2, vo.f1[i]) : 0; hgt[i] = n2[i] * 0.5 + n1[i] * 0.3 + peb * 0.9; }
      const sh = lightH(hgt, 12);
      const A = RGB('#5e4630'), B = RGB('#8a6c4a'), P = RGB('#8a8478'), P2 = RGB('#6a5e50');
      TEX.road = build(i => {
        let col = mixc(A, B, n1[i]);
        const peb = vo.id[i] > 0.55 ? sstep(0.42, 0.25, vo.f1[i]) : 0;
        if (peb > 0) col = mixc(col, mixc(P, P2, vo.id[i] * 2 - 1.1), peb);
        return mulc(col, sh[i] * (0.9 + n2[i] * 0.2));
      });
    }

    // ---------- cobblestone plaza
    const mkCobble = (seed, cells, palette, mortar, jit = 0.85, sx = 1) => {
      const r = R(seed), vo = voronoi(cells, r, jit, sx), n = fbm(16, 4, r), n2 = fbm(4, 3, r);
      const hgt = new Float32Array(TS * TS);
      for (let i = 0; i < hgt.length; i++) { const e = vo.f2[i] - vo.f1[i]; hgt[i] = sstep(0.0, 0.22, e) * (0.75 + vo.id[i] * 0.25) + n[i] * 0.18; }
      const sh = lightH(hgt, 14);
      const pal = palette.map(RGB), M = RGB(mortar);
      return build(i => {
        const e = vo.f2[i] - vo.f1[i];
        const k = Math.floor(vo.id[i] * pal.length * 0.999);
        let col = mixc(pal[k], pal[(k + 1) % pal.length], n2[i] * 0.5);
        col = mulc(col, 0.85 + n[i] * 0.3);
        col = mixc(M, col, sstep(0.02, 0.07, e));
        return mulc(col, sh[i]);
      });
    };
    TEX.plaza = mkCobble(31, 18, ['#9a9284', '#8a8274', '#a8a090', '#7e7668', '#b0a694'], '#3a342c');
    TEX.dfloor = mkCobble(32, 5, ['#4a443c', '#3e3a34', '#544c42', '#46403a'], '#141210', 0.5);
    { // moss + grime in dungeon crevices
      const r = R(33), n = fbm(8, 4, r);
      const g = TEX.dfloor.getContext('2d'), img = g.getImageData(0, 0, TS, TS), D = img.data;
      for (let i = 0; i < TS * TS; i++) { const m = sstep(0.62, 0.8, n[i]) * 0.5; D[i * 4] *= 1 - m * 0.4; D[i * 4 + 1] *= 1 + m * 0.25; D[i * 4 + 2] *= 1 - m * 0.5; }
      g.putImageData(img, 0, 0);
    }

    // ---------- square flagstones (town center)
    {
      const r = R(41), n = fbm(16, 4, r), n2 = fbm(4, 4, r);
      const cell = 64, ids = []; for (let k = 0; k < 64; k++) ids.push(r());
      const hgt = new Float32Array(TS * TS);
      const edgeOf = (x, y) => { const off = Math.floor(y / cell) % 2 ? cell / 2 : 0; const lx = (x + off) % cell, ly = y % cell; return Math.min(lx, cell - lx, ly, cell - ly); };
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const i = y * TS + x; hgt[i] = sstep(0, 6, edgeOf(x, y)) * 0.9 + n[i] * 0.25; }
      const sh = lightH(hgt, 10);
      const A = RGB('#8c8a82'), B = RGB('#a8a498'), M = RGB('#3a3832');
      TEX.stone = build((i, x, y) => {
        const off = Math.floor(y / cell) % 2 ? cell / 2 : 0, id = ids[(Math.floor((x + off) / cell) % 4) + Math.floor(y / cell) * 4];
        let col = mulc(mixc(A, B, id), 0.85 + n2[i] * 0.3);
        col = mixc(M, col, sstep(0.5, 2.5, edgeOf(x, y)));
        return mulc(col, sh[i]);
      });
    }

    // ---------- sand with ripples
    {
      const r = R(51), n = fbm(4, 4, r), g = fbm(64, 2, r);
      const hgt = new Float32Array(TS * TS);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const i = y * TS + x; hgt[i] = Math.sin((x + y * 0.3 + n[i] * 60) * (Math.PI * 2 / 32)) * 0.25 + g[i] * 0.15; }
      const sh = lightH(hgt, 8);
      const A = RGB('#a8946a'), B = RGB('#c8b488');
      TEX.sand = build(i => mulc(mixc(A, B, n[i]), sh[i] * (0.92 + g[i] * 0.16)));
    }
    // ---------- sea floor
    {
      const r = R(55), n = fbm(4, 5, r), g = fbm(32, 3, r), vo = voronoi(18, r, 1);
      const hgt = n.map((v, i) => v * 0.4 + (vo.id[i] > 0.7 ? sstep(0.4, 0.2, vo.f1[i]) : 0));
      const sh = lightH(hgt, 10);
      const A = RGB('#2a5a58'), B = RGB('#4a807a'), W = RGB('#1e4a30');
      TEX.sea = build(i => { let col = mixc(A, B, n[i]); col = mixc(col, W, sstep(0.6, 0.78, g[i]) * 0.6); return mulc(col, sh[i]); });
    }

    // ---------- snow (soft drifts, blue shadows, sparkle)
    {
      const r = R(61), n = fbm(4, 5, r), g = fbm(64, 2, r), sp = pnoise(256, r);
      const sh = lightH(n.map((v, i) => v + g[i] * 0.4), 22);
      const A = RGB('#a8bad4'), B = RGB('#f6f9fc');
      TEX.snow = build(i => {
        const l = sh[i];
        let col = mixc(A, B, sstep(0.75, 1.1, l));
        col = mulc(col, 0.94 + g[i] * 0.08);
        if (sp[i] > 0.985) col = [255, 255, 255];
        return col;
      });
    }
    // ---------- ice with cracks
    {
      const r = R(65), n = fbm(4, 4, r), vo = voronoi(6, r, 1);
      const A = RGB('#7ab0d0'), B = RGB('#c8e6f6');
      TEX.ice = build(i => {
        let col = mixc(A, B, n[i]);
        const e = vo.f2[i] - vo.f1[i];
        col = mixc([240, 250, 255], col, sstep(0.0, 0.05, e));
        return col;
      });
    }
    // ---------- water base
    {
      const r = R(71), n = fbm(4, 5, r);
      const A = RGB('#12324e'), B = RGB('#2a5a7a');
      TEX.water = build(i => mixc(A, B, n[i]));
      const s = fbm(8, 3, R(72));
      TEX.waterSpec = build(i => { const v = sstep(0.62, 0.78, s[i]) * 0.5; return [200, 230, 255, v * 255]; });
    }
    // ---------- polished tower marble tiles
    {
      const r = R(81), n = fbm(4, 5, r), n2 = fbm(16, 3, r);
      const cell = 128;
      const hgt = new Float32Array(TS * TS);
      const edgeOf = (x, y) => Math.min(x % cell, cell - x % cell, y % cell, cell - y % cell);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) hgt[y * TS + x] = sstep(0, 5, edgeOf(x, y));
      const sh = lightH(hgt, 8);
      const A = RGB('#221a2e'), B = RGB('#3e3050'), V = RGB('#8a70b0');
      TEX.tfloor = build((i, x, y) => {
        const vein = Math.pow(Math.abs(Math.sin((x * 0.03 + y * 0.02 + n[i] * 9))), 0.15);
        let col = mixc(A, B, n2[i]);
        col = mixc(V, col, vein);
        col = mixc([12, 8, 18], col, sstep(0.5, 2, edgeOf(x, y)));
        return mulc(col, sh[i]);
      });
    }

    // ---------- walls (brick / ashlar)
    const mkBlocks = (seed, rowH, minW, maxW, palette, mortar, rough) => {
      const r = R(seed), n = fbm(16, 4, r), n2 = fbm(4, 3, r);
      const rows = TS / rowH, blocks = [];
      for (let ry = 0; ry < rows; ry++) { let x = r() * maxW, list = []; while (list.length === 0 || x < TS + list[0][0]) { const w = minW + r() * (maxW - minW); list.push([x, w, r()]); x += w; } blocks.push(list); }
      const cellAt = (x, y) => {
        const ry = Math.floor(y / rowH), ly = y % rowH;
        for (const [bx, w, id] of blocks[ry]) {
          let lx = ((x - bx) % TS + TS) % TS;
          if (lx < w) return [Math.min(lx, w - lx, ly, rowH - ly), id];
        }
        return [0, 0];
      };
      const E = new Float32Array(TS * TS), I = new Float32Array(TS * TS);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const [e, id] = cellAt(x, y); E[y * TS + x] = e; I[y * TS + x] = id; }
      const hgt = E.map((e, i) => sstep(0, 4, e) * 0.9 + n[i] * rough);
      const sh = lightH(hgt, 12);
      const pal = palette.map(RGB), M = RGB(mortar);
      return build(i => {
        const k = Math.floor(I[i] * pal.length * 0.999);
        let col = mulc(pal[k], 0.82 + n2[i] * 0.36);
        col = mixc(M, col, sstep(0.3, 2, E[i]));
        return mulc(col, sh[i]);
      });
    };
    TEX.townwall = mkBlocks(91, 32, 40, 80, ['#a89a80', '#988a70', '#b4a68c', '#8e8068'], '#4a4236', 0.35);
    TEX.snowwall = mkBlocks(92, 32, 40, 80, ['#b8bcc8', '#a8acb8', '#c8ccd8'], '#5a5e6a', 0.3);
    TEX.forestwall = mkBlocks(93, 32, 40, 80, ['#7a8068', '#6a7058', '#868c72'], '#3a3e30', 0.4);
    TEX.dwall = mkBlocks(94, 26, 34, 60, ['#4e463c', '#443d34', '#585044', '#3c362e'], '#16130f', 0.5);
    TEX.twall = mkBlocks(95, 40, 60, 120, ['#3a2c4e', '#30243f', '#45365a'], '#0c0812', 0.3);

    // ---------- house materials
    {
      const r = R(101), n = fbm(8, 5, r), g = fbm(64, 2, r);
      const A = RGB('#c8b896'), B = RGB('#e0d4b4'), S = RGB('#9a8a6a');
      TEX.plaster = build(i => mulc(mixc(mixc(A, B, n[i]), S, sstep(0.68, 0.85, g[i]) * 0.4), 0.92 + n[i] * 0.12));
    }
    {
      const r = R(102), n = fbm(4, 4, r);
      const A = RGB('#4a3020'), B = RGB('#7a5236');
      TEX.wood = build((i, x, y) => { const grain = Math.sin(x * 0.35 + n[i] * 14) * 0.5 + 0.5; return mulc(mixc(A, B, grain * 0.6 + n[i] * 0.4), 0.85 + grain * 0.2); });
      TEX.bark = build((i, x, y) => { const grain = Math.pow(Math.abs(Math.sin(x * 0.22 + n[i] * 10)), 0.4); return mulc(mixc(RGB('#2a1c12'), RGB('#6a4a30'), grain * 0.8 + n[i] * 0.2), 0.8 + n[i] * 0.3); });
    }
    const mkShingles = (seed, base, var2) => {
      const r = R(seed), n = fbm(16, 3, r), rowH = 16, w = 22, ids = [];
      for (let k = 0; k < 400; k++) ids.push(r());
      const A = RGB(base), B = RGB(var2);
      return build((i, x, y) => {
        const row = Math.floor(y / rowH), off = row % 2 ? w / 2 : 0, col = Math.floor((x + off) / w), lx = (x + off) % w, ly = y % rowH;
        const id = ids[(row * 13 + col) % 400];
        let c = mixc(A, B, id);
        const t = ly / rowH;
        c = mulc(c, 0.7 + t * 0.45 + n[i] * 0.15);
        if (lx < 1.2 || ly > rowH - 2) c = mulc(c, 0.45);
        return c;
      });
    };
    TEX.roofRed = mkShingles(111, '#7a2a1a', '#a84a30');
    TEX.roofBlue = mkShingles(112, '#24305a', '#3e5088');
    TEX.roofBrown = mkShingles(113, '#5a3e18', '#86602a');
    TEX.roofSnow = mkShingles(114, '#d8e0ec', '#f4f8ff');
    TEX.roofMoss = mkShingles(115, '#344a22', '#56723a');

    // ---------- rock + generic material grains for characters
    {
      const r = R(121), n = fbm(8, 5, r), l = fbm(16, 3, r);
      const sh = lightH(n, 16);
      TEX.rock = build(i => { let c = mixc(RGB('#5a5852'), RGB('#8e8a80'), n[i]); c = mixc(c, RGB('#7a8a4a'), sstep(0.7, 0.85, l[i]) * 0.5); return mulc(c, sh[i]); });
      const m = fbm(64, 2, R(122));
      TEX.grain = build(i => { const v = 128 + (m[i] - 0.5) * 90; return [v, v, v]; });
      const w = fbm(32, 2, R(123));
      TEX.cloth = build((i, x, y) => { const v = 128 + ((x + y) % 4 < 2 ? 18 : -18) + (w[i] - 0.5) * 50; return [v, v, v]; });
      TEX.metal = build((i, x, y) => { const v = 128 + Math.sin(y * 0.9 + m[i] * 4) * 14 + (m[i] - 0.5) * 60; return [v, v, v]; });
      const vs = voronoi(24, R(124), 1);
      TEX.scales = build(i => { const v = 90 + sstep(0, 0.3, vs.f2[i] - vs.f1[i]) * 90; return [v, v, v]; });
    }
    // ---------- cloud shadow map
    {
      const n = fbm(2, 5, R(131));
      TEX.clouds = build(i => { const v = 255 - sstep(0.5, 0.75, n[i]) * 110; return [v, v, v]; });
    }
    TEX_NOISE = fbm(8, 4, R(141));
    this.applyPhotos();
    buildDecals();
    this.ready = true;
    this.ms = Math.round(performance.now() - t0);
  },
  // ---------- photo textures (Poly Haven CC0, embedded in texdata.js)
  photos: {},
  loadPhotos() {
    if (typeof PHOTO_TEX === 'undefined') return Promise.resolve();
    return Promise.all(Object.entries(PHOTO_TEX).map(([k, url]) => new Promise(res => {
      const im = new Image(); im.onload = () => { this.photos[k] = im; res(); }; im.onerror = res; im.src = url;
    })));
  },
  // resample a photo to 256, add relief lighting from its luminance, tint, then size it to `size`
  photo(name, size, o = {}) {
    const im = this.photos[name]; if (!im) return null;
    const c = document.createElement('canvas'); c.width = c.height = TS;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, TS, TS);
    const img = g.getImageData(0, 0, TS, TS), D = img.data;
    const lum = new Float32Array(TS * TS);
    for (let i = 0; i < TS * TS; i++) lum[i] = (D[i * 4] * 0.3 + D[i * 4 + 1] * 0.59 + D[i * 4 + 2] * 0.11) / 255;
    const sh = o.relief ? lightH(lum, o.relief) : null;
    const tint = o.tint ? RGB(o.tint) : null, sat = o.sat != null ? o.sat : 1, br = o.bright || 1, ct = o.contrast || 1;
    for (let i = 0; i < TS * TS; i++) {
      let r = D[i * 4], gg = D[i * 4 + 1], b = D[i * 4 + 2];
      const l = r * 0.3 + gg * 0.59 + b * 0.11;
      r = l + (r - l) * sat; gg = l + (gg - l) * sat; b = l + (b - l) * sat;
      if (tint) { r = r * tint[0] / 255 * 1.6; gg = gg * tint[1] / 255 * 1.6; b = b * tint[2] / 255 * 1.6; }
      const k = (sh ? sh[i] : 1) * br;
      r = ((r / 255 - 0.5) * ct + 0.5) * 255 * k; gg = ((gg / 255 - 0.5) * ct + 0.5) * 255 * k; b = ((b / 255 - 0.5) * ct + 0.5) * 255 * k;
      D[i * 4] = clamp(r, 0, 255); D[i * 4 + 1] = clamp(gg, 0, 255); D[i * 4 + 2] = clamp(b, 0, 255);
    }
    g.putImageData(img, 0, 0);
    if (size === TS) return c;
    const out = document.createElement('canvas'); out.width = out.height = size;
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(c, 0, 0, size, size);
    return out;
  },
  applyPhotos() {
    const set = (key, name, size, o) => { const c = this.photo(name, size, o); if (c) TEX[key] = c; };
    // ground (texture size in texels; PXT texels = 1 tile)
    set('grass', 'leafy_grass', 160, { relief: 5, sat: 1.25, tint: '#b4e478', bright: 1.08 });
    set('fgrass', 'forest_ground_04', 176, { relief: 6, bright: 0.95, sat: 1.15 });
    set('road', 'stony_dirt_path', 176, { relief: 8, bright: 1.3 });
    set('plaza', 'cobblestone_floor_08', 192, { relief: 9, bright: 1.0, sat: 0.8 });
    set('stone', 'stone_tiles', 160, { relief: 6, bright: 1.0 });
    set('sand', 'aerial_sand', 192, { relief: 6 });
    set('sea', 'aerial_sand', 192, { relief: 6, tint: '#3a8a86', sat: 0.4, bright: 0.75 });
    set('snow', 'snow_02', 192, { relief: 10, bright: 1.08, sat: 0.6, tint: '#e8f0ff' });
    set('dfloor', 'rock_tile_floor', 176, { relief: 9, bright: 0.62, sat: 0.7 });
    set('tfloor', 'rock_tile_floor', 176, { relief: 9, bright: 0.5, sat: 0.3, tint: '#7a5aa8', contrast: 1.15 });
    // walls / buildings (texture units: ~40 per tile horizontally, 1 per px vertically)
    set('townwall', 'medieval_wall_01', 128, { relief: 7 });
    set('snowwall', 'medieval_wall_01', 128, { relief: 7, sat: 0.3, tint: '#c8d4e8', bright: 1.05 });
    set('forestwall', 'medieval_wall_01', 128, { relief: 7, tint: '#8a9a6a', sat: 0.6 });
    set('dwall', 'castle_brick_07', 128, { relief: 8, bright: 0.6, sat: 0.7 });
    set('twall', 'castle_brick_07', 128, { relief: 8, bright: 0.5, sat: 0.25, tint: '#6a4a9a' });
    set('plaster', 'plastered_wall_02', 160, { relief: 4, bright: 1.05 });
    set('wood', 'dark_wooden_planks', 96, { relief: 4, bright: 1.1 });
    set('roofRed', 'clay_roof_tiles_02', 128, { relief: 8 });
    set('roofBlue', 'clay_roof_tiles_02', 128, { relief: 8, sat: 0.2, tint: '#5a70b8', bright: 0.9 });
    set('roofBrown', 'clay_roof_tiles_02', 128, { relief: 8, sat: 0.3, tint: '#a07840' });
    set('roofMoss', 'clay_roof_tiles_02', 128, { relief: 8, sat: 0.2, tint: '#6a8a4a', bright: 0.9 });
    set('roofSnow', 'clay_roof_tiles_02', 128, { relief: 8, sat: 0.05, tint: '#f0f4ff', bright: 1.25, contrast: 0.6 });
    set('bark', 'bark_brown_02', 96, { relief: 6, bright: 0.9 });
    set('rock', 'lichen_rock', 128, { relief: 7 });
  },
  pat(ctx, name) {
    const k = '_p_' + name;
    if (!ctx[k]) ctx[k] = ctx.createPattern(TEX[name], 'repeat');
    return ctx[k];
  }
};

// fill a parallelogram (p0 -> p1 along u, p0 -> p3 along v) with a texture
function texQuad(ctx, name, p0, p1, p3, uLen, vLen, clip) {
  ctx.save();
  if (clip) { ctx.beginPath(); clip.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip(); }
  ctx.transform((p1[0] - p0[0]) / uLen, (p1[1] - p0[1]) / uLen, (p3[0] - p0[0]) / vLen, (p3[1] - p0[1]) / vLen, p0[0], p0[1]);
  ctx.fillStyle = Textures.pat(ctx, name);
  ctx.fillRect(0, 0, uLen, vLen);
  ctx.restore();
}
