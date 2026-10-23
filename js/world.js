// ---------------------------------------------------------------------
// World: procedural map generation + ground / static-object rendering
// ---------------------------------------------------------------------
const T = { GRASS: 0, ROAD: 1, STONE: 2, WATER: 3, SAND: 4, DFLOOR: 5, DWALL: 6, SNOW: 7, ICE: 8, FGRASS: 9, TFLOOR: 10, SEA: 11, TWALL: 12, PLAZA: 13 };
const BLOCK_TILES = new Set([T.WATER, T.DWALL, T.TWALL]);
const CHUNK = 16;

function hash2(x, y, s) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
function vnoise(x, y, scale, s) {
  x /= scale; y /= scale;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

class GameMap {
  constructor(id) {
    this.id = id; this.def = MAPS[id]; this.size = this.def.size; this.theme = this.def.theme;
    const N = this.size;
    this.tiles = new Uint8Array(N * N);
    this.block = new Uint8Array(N * N);
    this.objects = []; this.chunkObjs = new Map(); this.chunkCache = new Map();
    this.lights = [];
    this.rng = mulberry32(this.def.seed);
    this.generate();
    this.buildChunks();
  }
  idx(x, y) { return y * this.size + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.size && y < this.size; }
  tile(x, y) { return this.inb(x, y) ? this.tiles[this.idx(x, y)] : T.DWALL; }
  setT(x, y, t) { if (this.inb(x, y)) this.tiles[this.idx(x, y)] = t; }
  walk(x, y) { return this.inb(x, y) && !this.block[this.idx(x, y)] && !BLOCK_TILES.has(this.tiles[this.idx(x, y)]); }
  blockRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.inb(i, j)) this.block[this.idx(i, j)] = 1; }
  free(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!this.walk(i, j)) return false;
    return true;
  }
  inTown(x, y) { const t = this.def.town; return t && Math.abs(x - t.x) <= t.r && Math.abs(y - t.y) <= t.r; }
  addObj(o) { this.objects.push(o); return o; }

  // -------------------------------------------------------------- generation
  generate() {
    const N = this.size, r = this.rng, s = this.def.seed;
    const th = this.theme;
    if (th === 'dungeon' || th === 'tower') return this.genDungeon();
    const base = th === 'grass' ? T.GRASS : th === 'forest' ? T.FGRASS : th === 'snow' ? T.SNOW : T.SEA;
    this.tiles.fill(base);
    // patches
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = vnoise(x, y, 9, s), m = vnoise(x, y, 5, s + 9);
      if (th === 'grass') { if (n > 0.78) this.setT(x, y, T.ROAD); if (m < 0.08 && n < 0.4) this.setT(x, y, T.WATER); }
      if (th === 'forest') { if (n > 0.8) this.setT(x, y, T.GRASS); if (m < 0.07) this.setT(x, y, T.WATER); }
      if (th === 'snow') { if (n > 0.74) this.setT(x, y, T.ICE); }
      if (th === 'water') { if (n > 0.7) this.setT(x, y, T.SAND); }
    }
    // border walls of the world: trees / rocks
    const c = this.def.center;
    // roads from center to edges
    if (th !== 'water') {
      const roadT = th === 'snow' ? T.ROAD : T.ROAD;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let x = c.x, y = c.y, wob = 0;
        while (x > 1 && y > 1 && x < N - 2 && y < N - 2) {
          wob += (r() - 0.5) * 0.6; wob = clamp(wob, -3, 3);
          const px = Math.round(x + (dy ? wob : 0)), py = Math.round(y + (dx ? wob : 0));
          for (let k = -1; k <= 1; k++) { this.setT(px + (dy ? k : 0), py + (dx ? k : 0), roadT); }
          x += dx; y += dy;
        }
      }
    }
    // town
    const t = this.def.town;
    if (t) {
      for (let y = t.y - t.r; y <= t.y + t.r; y++) for (let x = t.x - t.r; x <= t.x + t.r; x++) this.setT(x, y, T.PLAZA);
      for (let y = t.y - 2; y <= t.y + 2; y++) for (let x = t.x - 2; x <= t.x + 2; x++) this.setT(x, y, T.STONE);
      // walls
      const R = t.r + 1;
      for (let k = -R; k <= R; k++) {
        for (const [wx, wy] of [[t.x + k, t.y - R], [t.x + k, t.y + R], [t.x - R, t.y + k], [t.x + R, t.y + k]]) {
          if (Math.abs(k) <= 1) { this.setT(wx, wy, T.STONE); continue; } // gates
          this.addObj({ type: 'wall', x: wx, y: wy, theme: th }); this.blockRect(wx, wy, 1, 1); this.setT(wx, wy, T.STONE);
        }
      }
      for (const [gx, gy] of [[t.x, t.y - R], [t.x, t.y + R], [t.x - R, t.y], [t.x + R, t.y]]) {
        for (const o of [-2, 2]) {
          const tx = gx + (gy === t.y ? 0 : o), ty = gy + (gy === t.y ? o : 0);
          this.addObj({ type: 'torch', x: tx + 0.5, y: ty + 0.5, onWall: true });
          this.lights.push({ x: tx + 0.5, y: ty + 0.5, r: 5, c: '#ffb060' });
        }
      }
      // center piece
      if (th === 'forest') { this.addObj({ type: 'bigtree', x: t.x - 1, y: t.y - 1, w: 3, h: 3 }); this.blockRect(t.x - 1, t.y - 1, 3, 3); }
      else { this.addObj({ type: 'fountain', x: t.x - 1, y: t.y - 1, w: 3, h: 3, theme: th }); this.blockRect(t.x - 1, t.y - 1, 3, 3); }
      // houses in corners
      const hs = [[-t.r + 1, -t.r + 1], [t.r - 4, -t.r + 1], [-t.r + 1, t.r - 4], [t.r - 4, t.r - 4], [-t.r + 1, -2], [t.r - 4, 1]];
      hs.forEach(([ox, oy], i) => {
        const hx = t.x + ox, hy = t.y + oy;
        if (this.def.npcs && this.def.npcs.some(n => n.x >= hx - 1 && n.x <= hx + 4 && n.y >= hy - 1 && n.y <= hy + 4)) return;
        this.addObj({ type: 'house', x: hx, y: hy, w: 3, h: 3, theme: th, var: i });
        this.blockRect(hx, hy, 3, 3);
      });
      // benches / statues
      this.addObj({ type: 'statue', x: t.x - 5, y: t.y - 5, w: 1, h: 1 }); this.blockRect(t.x - 5, t.y - 5, 1, 1);
      this.addObj({ type: 'statue', x: t.x + 5, y: t.y + 5, w: 1, h: 1 }); this.blockRect(t.x + 5, t.y + 5, 1, 1);
    }
    // scatter vegetation & rocks
    const dens = th === 'forest' ? 0.075 : th === 'grass' ? 0.04 : th === 'snow' ? 0.035 : 0.03;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const tt = this.tile(x, y);
      if (tt === T.ROAD || tt === T.PLAZA || tt === T.STONE || tt === T.WATER || this.block[this.idx(x, y)]) continue;
      if (t && Math.abs(x - t.x) <= t.r + 3 && Math.abs(y - t.y) <= t.r + 3) continue;
      if (this.def.entry && dist(x, y, this.def.entry.x, this.def.entry.y) < 4) continue;
      const edge = x < 3 || y < 3 || x > N - 4 || y > N - 4;
      const roll = r();
      if (edge ? roll < 0.6 : roll < dens * (0.6 + vnoise(x, y, 7, s + 3))) {
        let type = th === 'snow' ? 'pine' : th === 'water' ? (r() < 0.5 ? 'coral' : 'kelp') : th === 'forest' ? (r() < 0.25 ? 'mushtree' : 'tree') : 'tree';
        if (r() < 0.15 && th !== 'water') type = 'rock';
        if (th === 'water' && r() < 0.08) type = 'ruin';
        this.addObj({ type, x: x + 0.5, y: y + 0.5, s: 0.8 + r() * 0.5, v: r() });
        this.blockRect(x, y, 1, 1);
      } else if (r() < 0.06) {
        this.addObj({ type: th === 'water' ? 'shell' : th === 'snow' ? 'snowtuft' : 'flower', x: x + r(), y: y + r(), v: r(), deco: true });
      }
    }
  }

  genDungeon() {
    const N = this.size, r = this.rng;
    const wall = this.theme === 'tower' ? T.TWALL : T.DWALL, floor = this.theme === 'tower' ? T.TFLOOR : T.DFLOOR;
    this.tiles.fill(wall);
    const rooms = [];
    const e = this.def.entry;
    rooms.push({ x: Math.floor(e.x) - 4, y: Math.floor(e.y) - 4, w: 9, h: 9 });
    for (let tries = 0; tries < 400 && rooms.length < 26; tries++) {
      const w = 6 + Math.floor(r() * 9), h = 6 + Math.floor(r() * 9);
      const x = 2 + Math.floor(r() * (N - w - 4)), y = 2 + Math.floor(r() * (N - h - 4));
      if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
      rooms.push({ x, y, w, h });
    }
    const carve = (x, y) => { if (x > 0 && y > 0 && x < N - 1 && y < N - 1) this.setT(x, y, floor); };
    rooms.forEach(o => { for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) carve(x, y); });
    // connect: each room to nearest already-connected room
    const conn = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let bi = 0, bj = 0, bd = 1e9;
      rest.forEach((a, i) => conn.forEach((b, j) => { const d = dist(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2); if (d < bd) { bd = d; bi = i; bj = j; } }));
      const a = rest.splice(bi, 1)[0], b = conn[bj];
      let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
      const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
      const hFirst = r() < 0.5;
      const stepX = () => { while (x !== tx) { carve(x, y); carve(x, y + 1); carve(x, y - 1); x += Math.sign(tx - x); } };
      const stepY = () => { while (y !== ty) { carve(x, y); carve(x + 1, y); carve(x - 1, y); y += Math.sign(ty - y); } };
      if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
      conn.push(a);
    }
    // extra loops
    for (let k = 0; k < 6; k++) {
      const a = pick(rooms), b = pick(rooms);
      let x = Math.floor(a.x + a.w / 2), y = Math.floor(a.y + a.h / 2);
      const tx = Math.floor(b.x + b.w / 2), ty = Math.floor(b.y + b.h / 2);
      while (x !== tx) { carve(x, y); carve(x, y + 1); x += Math.sign(tx - x); }
      while (y !== ty) { carve(x, y); carve(x + 1, y); y += Math.sign(ty - y); }
    }
    this.rooms = rooms;
    // wall objects only on edges facing floor
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.tile(x, y) !== wall) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inb(x + dx, y + dy) && this.tile(x + dx, y + dy) === floor) { edge = true; break; }
      if (edge) this.addObj({ type: 'dwall', x, y, theme: this.theme, v: hash2(x, y, 3) });
    }
    // decorations: pillars, torches, crystals, bones
    rooms.forEach((o, i) => {
      if (o.w >= 8 && o.h >= 8 && i > 0) {
        for (const [px, py] of [[o.x + 2, o.y + 2], [o.x + o.w - 3, o.y + 2], [o.x + 2, o.y + o.h - 3], [o.x + o.w - 3, o.y + o.h - 3]]) {
          this.addObj({ type: 'pillar', x: px + 0.5, y: py + 0.5, theme: this.theme }); this.blockRect(px, py, 1, 1);
        }
      }
      const lx = o.x + Math.floor(o.w / 2), ly = o.y;
      this.addObj({ type: 'torch', x: lx + 0.5, y: ly + 0.5, onWall: false });
      this.lights.push({ x: lx + 0.5, y: ly + 0.5, r: 6, c: this.theme === 'tower' ? '#c070ff' : '#ff9a40' });
      for (let k = 0; k < 3; k++) {
        const dx = o.x + 1 + Math.floor(r() * (o.w - 2)), dy = o.y + 1 + Math.floor(r() * (o.h - 2));
        this.addObj({ type: this.theme === 'tower' ? 'crystal' : 'bones', x: dx + r(), y: dy + r(), v: r(), deco: true });
      }
    });
  }

  buildChunks() {
    for (const o of this.objects) {
      const k = Math.floor(o.x / CHUNK) + ',' + Math.floor(o.y / CHUNK);
      if (!this.chunkObjs.has(k)) this.chunkObjs.set(k, []);
      this.chunkObjs.get(k).push(o);
    }
  }

  randomFloor(cx, cy, dmin, dmax) {
    for (let i = 0; i < 200; i++) {
      const a = Math.random() * Math.PI * 2, d = rand(dmin, dmax);
      const x = Math.floor(cx + Math.cos(a) * d), y = Math.floor(cy + Math.sin(a) * d);
      if (this.walk(x, y) && !this.inTown(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    for (let i = 0; i < 2000; i++) {
      const x = randi(1, this.size - 2), y = randi(1, this.size - 2);
      if (this.walk(x, y) && !this.inTown(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    return { x: cx, y: cy };
  }

}
