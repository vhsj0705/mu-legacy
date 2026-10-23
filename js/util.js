// ---------------------------------------------------------------------
// Utilities: RNG, math, isometric projection, pathfinding
// ---------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => Math.floor(n).toLocaleString('ko-KR');

// world (tile units) -> screen offset (pixels, before camera)
function iso(x, y) { return { x: (x - y) * TW / 2, y: (x + y) * TH / 2 }; }
function unIso(sx, sy) {
  const a = sx / (TW / 2), b = sy / (TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// A* on tile grid (8-directional), returns array of {x,y} tile centers
function findPath(map, sx, sy, tx, ty, maxNodes = 6000) {
  const N = map.size;
  sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
  if (!map.walk(tx, ty)) {
    // find nearest walkable around target
    let best = null, bd = 1e9;
    for (let r = 1; r <= 3 && !best; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (map.walk(tx + dx, ty + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [tx + dx, ty + dy]; } }
    if (!best) return null;
    tx = best[0]; ty = best[1];
  }
  const key = (x, y) => y * N + x;
  const open = [[sx, sy, 0, 0]];
  const g = new Map(); g.set(key(sx, sy), 0);
  const from = new Map();
  const closed = new Set();
  let nodes = 0;
  const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  open[0][3] = h(sx, sy);
  while (open.length && nodes++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][3] < open[bi][3]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    const ck = key(cur[0], cur[1]);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur[0] === tx && cur[1] === ty) {
      const path = []; let k = ck;
      while (k !== key(sx, sy)) { path.push({ x: k % N + 0.5, y: Math.floor(k / N) + 0.5 }); k = from.get(k); }
      return path.reverse();
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cur[0] + dx, ny = cur[1] + dy;
      if (!map.walk(nx, ny)) continue;
      if (dx && dy && (!map.walk(cur[0] + dx, cur[1]) || !map.walk(cur[0], cur[1] + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cur[2] + (dx && dy ? 1.414 : 1);
      if (g.has(nk) && g.get(nk) <= ng) continue;
      g.set(nk, ng); from.set(nk, ck);
      open.push([nx, ny, ng, ng + h(nx, ny)]);
    }
  }
  return null;
}

// line of walkability (for straight movement shortcut)
function clearLine(map, ax, ay, bx, by) {
  const d = dist(ax, ay, bx, by), steps = Math.ceil(d * 3);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!map.walk(Math.floor(lerp(ax, bx, t)), Math.floor(lerp(ay, by, t)))) return false;
  }
  return true;
}
