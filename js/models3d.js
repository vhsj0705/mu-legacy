// ---------------------------------------------------------------------
// 3D characters: procedural Three.js models (articulated rigs with PBR
// materials using CC0 photo textures) rendered in real time every frame.
// Each entity is drawn into a scissored region of one shared WebGL canvas
// and copied into the 2D scene at its depth-sorted position, so facing
// turns smoothly and animations blend continuously (idle / walk / run /
// attack / hit / death). Falls back to the 2D vector renderer without WebGL.
// ---------------------------------------------------------------------
const M3 = {
  ready: false, models: new Map(), mats: new Map(), tex: {},
  PPU: 46,      // screen pixels per 3D unit
  SS: 1.5,      // supersampling factor for crisp edges
  CS: 2048,     // shared GL canvas height
  CW: 2048,     // shared GL canvas width (entities are shelf-packed into it each frame)
  init() {
    if (!window.THREE) return;
    // treat hex colors as sRGB (otherwise they render washed out with sRGB output)
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    try {
      // no MSAA: SS supersampling + downscaled blit already smooths edges
      const R = this.R = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      R.setPixelRatio(1); R.setSize(this.CW, this.CS, false); R.setClearColor(0x000000, 0);
      R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
      R.autoClear = false;
    } catch (e) { return; }
    const S = this.scene = new THREE.Scene();
    S.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2e20, 0.55));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 6, 2.5); S.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(2.5, 3, -4); S.add(rim);
    const fill = new THREE.DirectionalLight(0xffd8a8, 0.3); fill.position.set(4, 1.5, 4); S.add(fill);
    // environment map for metallic reflections (sky gradient + bright panels)
    {
      const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#9ab8e8'); gr.addColorStop(0.45, '#f0e8d8'); gr.addColorStop(0.55, '#7a6a50'); gr.addColorStop(1, '#201810');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
      const env = new THREE.Scene();
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide })));
      for (const [x, y, z] of [[-6, 5, 3], [5, 6, -4], [0, 8, 6]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); }
      const pm = new THREE.PMREMGenerator(this.R);
      S.environment = pm.fromScene(env, 0.03).texture;
    }
    this.camDir = new THREE.Vector3(1, Math.tan(30 * Math.PI / 180) * Math.SQRT2, 1).normalize();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.cam.position.copy(this.camDir).multiplyScalar(30); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
    this.camRight = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0);
    this.camUp = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    // procedural bump textures
    ['metal', 'cloth', 'grain', 'scales', 'rock'].forEach(k => {
      const t = new THREE.CanvasTexture(TEX[k]); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); this.tex[k] = t;
    });
    // photo materials: grayscale detail map (tinted by material color) + normal map
    const photoMap = (name, rep, mean = 0.82) => {
      const im = Textures.photos[name]; if (!im) return null;
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 256, 256);
      const img = g.getImageData(0, 0, 256, 256), D = img.data; let sum = 0;
      for (let i = 0; i < D.length; i += 4) sum += D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11;
      const k = mean * 255 / (sum / (D.length / 4));
      for (let i = 0; i < D.length; i += 4) { const l = clamp((D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11) * k, 0, 255); D[i] = D[i + 1] = D[i + 2] = l; }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.encoding = THREE.sRGBEncoding; return t;
    };
    const photoNor = (name, rep) => {
      const im = Textures.photos[name]; if (!im) return null;
      const t = new THREE.Texture(im); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
    };
    this.photo = {
      grain: { map: photoMap('brown_leather', 2), nor: photoNor('brown_leather_nor', 2) },
      metal: { map: photoMap('metal_plate', 1.5, 0.9), nor: photoNor('metal_plate_nor', 1.5) },
      rock: { map: photoMap('lichen_rock', 1.5), nor: null }
    };
    this.ready = true;
  },
  mat(color, o = {}) {
    const k = color + JSON.stringify(o);
    if (this.mats.has(k)) return this.mats.get(k);
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), roughness: o.rough != null ? o.rough : 0.75, metalness: o.metal || 0,
      envMapIntensity: o.metal ? 1.0 : 0.25, flatShading: !!o.flat
    });
    const ph = o.bump && this.photo[o.bump];
    if (ph && ph.map) {
      m.map = ph.map;
      if (ph.nor) { m.normalMap = ph.nor; m.normalScale = new THREE.Vector2(0.7, 0.7); }
      else { m.bumpMap = ph.map; m.bumpScale = 0.02; }
    } else if (o.bump) { m.bumpMap = this.tex[o.bump]; m.bumpScale = o.bs || 0.015; }
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 1; }
    if (o.opacity != null) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = o.opacity > 0.8; }
    if (o.double) m.side = THREE.DoubleSide;
    this.mats.set(k, m);
    return m;
  },

  // ---------------------------------------------------------- live rendering
  // Model instances are pooled per look key; each visible entity holds one instance
  // and one persistent cell of the GL canvas. Cells keep their last image, so
  // distant entities can refresh every 2-3 frames while the player renders every frame.
  acquire(key, buildFn) {
    let pool = this.models.get(key);
    if (!pool) { pool = { free: [] }; this.models.set(key, pool); }
    if (pool.free.length) return pool.free.pop();
    const m = buildFn();
    mergeStatic(m.root);
    const s = m.size || 1;
    m.FW = Math.round(100 * s * (m.wide || 1));
    m.FH = Math.round(130 * s * (m.tall || 1));
    m.foot = Math.round(14 * s);
    return m;
  },
  release(key, m) {
    const pool = this.models.get(key);
    if (pool && pool.free.length < 12) pool.free.push(m);
    else m.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  },
  model(key, buildFn) { return this.acquire(key, buildFn); },
  // fixed-size cell classes laid out in the 2048x2048 GL canvas (GL bottom-left coordinates)
  initCells() {
    this.cells = [];
    const add = (w, h, y0, cols, rows) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.cells.push({ x: c * (w + 4), y: y0 + r * (h + 4), w, h, owner: null }); };
    add(160, 205, 0, 12, 4);        // regular characters
    add(270, 320, 840, 7, 2);       // winged / large monsters
    add(450, 480, 1490, 4, 1);      // bosses
    this.previewCell = this.cells[this.cells.length - 1]; this.previewCell.owner = 'preview';
  },
  allocCell(w, h, owner) {
    let best = null;
    for (const c of this.cells) if (!c.owner && c.w >= w && c.h >= h && (!best || c.w * c.h < best.w * best.h)) best = c;
    if (best) best.owner = owner;
    return best;
  },
  begin() {
    if (!this.cells) this.initCells();
    if (this.live) this.live.forEach(m => this.scene.remove(m.root));
    this.live = []; this.clears = [];
  },
  // place one entity in its cell (feet at the cell's bottom centre); returns its source rect (top-left origin)
  draw(m, angle, st, cell) {
    const P = this.PPU * this.SS, SS = this.SS;
    const w = Math.min(cell.w, Math.round(m.FW * SS)), h = Math.min(cell.h, Math.round(m.FH * SS)), foot = m.foot * SS;
    const cx = cell.x + cell.w / 2;
    const ox = (cx - this.CW / 2) / P, oy = (cell.y + foot - this.CS / 2) / P;
    m.root.position.copy(this.camRight).multiplyScalar(ox).addScaledVector(this.camUp, oy);
    m.root.rotation.y = Math.PI / 2 - angle;
    m.pose(st);
    this.scene.add(m.root); this.live.push(m); this.clears.push(cell);
    return this.rectOf(m, cell);
  },
  rectOf(m, cell) {
    const SS = this.SS, w = Math.min(cell.w, Math.round(m.FW * SS)), h = Math.min(cell.h, Math.round(m.FH * SS));
    return { sx: Math.round(cell.x + (cell.w - w) / 2), sy: this.CS - cell.y - h, sw: w, sh: h };
  },
  flush() {
    if (!this.live.length) return;
    const R = this.R, cam = this.cam, P = this.PPU * this.SS;
    cam.left = -this.CW / 2 / P; cam.right = this.CW / 2 / P; cam.top = this.CS / 2 / P; cam.bottom = -this.CS / 2 / P; cam.updateProjectionMatrix();
    R.setViewport(0, 0, this.CW, this.CS);
    R.setScissorTest(true);
    for (const c of this.clears) { R.setScissor(c.x, c.y, c.w, c.h); R.clear(true, true, false); }
    R.setScissorTest(false);
    R.render(this.scene, cam);
  }
};

// ---------------------------------------------------------------------
// animation helpers
// ---------------------------------------------------------------------
const TAU = Math.PI * 2;
const easeOut = t => 1 - (1 - t) * (1 - t), easeIn = t => t * t, easeIO = t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// piecewise keyframes [[t, v], ...] with smooth interpolation
function keys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return lerp(k[i - 1][1], k[i][1], easeIO(u)); }
  return k[k.length - 1][1];
}
// st: { t, ph (gait phase), mv (0..1 moving), run (0..1), atk (progress 0..1 or -1), kind, hurt (0..1), death (0..1) }

// ---------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(x, y);
function mk(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
const capsule = (r, len, seg = 12) => new THREE.CapsuleGeometry(r, len, 4, seg);
const sphere = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
function lathe(pts, seg = 20) { return new THREE.LatheGeometry(pts.map(p => V2(p[0], p[1])), seg); }
const animated = m => { m.userData.anim = true; return m; };
// Merge sibling meshes that share a material under the same bone group into one
// draw call (animation only moves groups, so their relative layout is fixed).
function mergeStatic(root) {
  const groups = [];
  root.traverse(o => { if (o.isGroup) groups.push(o); });
  for (const g of groups) {
    const byMat = new Map();
    for (const c of g.children) {
      const ge = c.geometry;
      if (!c.isMesh || c.children.length || c.userData.anim || !c.visible || !ge.attributes.uv || ge.attributes.color) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const parts = list.map(c => { c.updateMatrix(); const gg = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); gg.applyMatrix4(c.matrix); return gg; });
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const size = parts[0].attributes[name].itemSize;
        const arr = new Float32Array(parts.reduce((n, p) => n + p.attributes[name].count * size, 0));
        let off = 0;
        for (const p of parts) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      list.forEach(c => { g.remove(c); c.geometry.dispose(); });
      parts.forEach(p => p.dispose());
      g.add(new THREE.Mesh(out, mat));
    }
  }
}

function weaponMesh(kind, col, glow) {
  const g = new THREE.Group();
  const steel = M3.mat(col || '#d8dce8', { metal: 0.95, rough: 0.25, emissive: glow || null, ei: glow ? 0.45 : 0 });
  const wood = M3.mat('#5a3a1e', { rough: 0.8, bump: 'grain' }), gold = M3.mat('#d8a840', { metal: 1, rough: 0.3 });
  switch (kind) {
    case 'sword': case 'dagger': {
      const len = kind === 'dagger' ? 0.32 : 0.78;
      const bladeShape = new THREE.Shape(); bladeShape.moveTo(-0.035, 0); bladeShape.lineTo(0.035, 0); bladeShape.lineTo(0.028, len * 0.85); bladeShape.lineTo(0, len); bladeShape.lineTo(-0.028, len * 0.85); bladeShape.closePath();
      const bg = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
      bg.translate(0, 0.06, -0.006);
      mk(bg, steel, 0, 0, 0, g);
      mk(new THREE.BoxGeometry(0.2, 0.03, 0.04), gold, 0, 0.055, 0, g);
      mk(new THREE.CylinderGeometry(0.018, 0.02, 0.13, 8), M3.mat('#3a2414', { rough: 0.9, bump: 'grain' }), 0, -0.02, 0, g);
      mk(sphere(0.03, 10, 8), gold, 0, -0.095, 0, g);
      break;
    }
    case 'axe': case 'club': {
      mk(new THREE.CylinderGeometry(0.022, 0.026, 0.8, 8), wood, 0, 0.25, 0, g);
      if (kind === 'axe') {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.3, 0.02, 0.28, 0.24); s.quadraticCurveTo(0.12, 0.14, 0, 0.16); s.closePath();
        const ag = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 1 });
        ag.translate(0.01, 0.42, -0.01);
        mk(ag, steel, 0, 0, 0, g);
      } else {
        mk(new THREE.CylinderGeometry(0.09, 0.05, 0.32, 9), M3.mat('#6a4a2a', { rough: 0.95, bump: 'grain', bs: 0.03 }), 0, 0.6, 0, g);
        for (let i = 0; i < 6; i++) { const sp = mk(new THREE.ConeGeometry(0.02, 0.07, 5), M3.mat('#9a9aa0', { metal: 0.7, rough: 0.4 }), Math.cos(i) * 0.08, 0.62 + (i % 2) * 0.08, Math.sin(i) * 0.08, g); sp.rotation.z = -Math.cos(i) * 1.4; sp.rotation.x = Math.sin(i) * 1.4; }
      }
      break;
    }
    case 'spear': case 'trident': {
      mk(new THREE.CylinderGeometry(0.018, 0.02, 1.5, 8), wood, 0, 0.45, 0, g);
      const tips = kind === 'trident' ? [-0.07, 0, 0.07] : [0];
      tips.forEach(x => mk(new THREE.ConeGeometry(0.03, 0.18, 6), steel, x, 1.28, 0, g));
      if (kind === 'trident') mk(new THREE.BoxGeometry(0.17, 0.025, 0.025), steel, 0, 1.19, 0, g);
      break;
    }
    case 'staff': {
      mk(new THREE.CylinderGeometry(0.02, 0.025, 1.35, 8), wood, 0, 0.3, 0, g);
      const orb = glow || col || '#88b8ff';
      mk(sphere(0.07), M3.mat(orb, { emissive: orb, ei: 1.6, rough: 0.2 }), 0, 1.04, 0, g);
      const ring = mk(new THREE.TorusGeometry(0.085, 0.012, 6, 18), gold, 0, 1.04, 0, g); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const p = mk(new THREE.ConeGeometry(0.015, 0.12, 5), gold, Math.cos(i * 2.1) * 0.06, 0.96, Math.sin(i * 2.1) * 0.06, g); p.rotation.z = Math.cos(i * 2.1) * 0.5; p.rotation.x = -Math.sin(i * 2.1) * 0.5; }
      break;
    }
    case 'bow': {
      const arc = mk(new THREE.TorusGeometry(0.42, 0.018, 6, 24, Math.PI * 0.78), M3.mat(col || '#7a4a22', { rough: 0.6, bump: 'grain' }), 0, 0, 0, g);
      arc.rotation.z = Math.PI / 2 + Math.PI * 0.11; arc.position.z = -0.32; arc.rotation.y = Math.PI / 2;
      const top = new THREE.Vector3(0, Math.sin(Math.PI * 0.39) * 0.42, -0.32 + Math.cos(Math.PI * 0.39) * 0.42);
      const str = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, top.y, top.z), new THREE.Vector3(0, -top.y, top.z)]);
      g.add(new THREE.Line(str, new THREE.LineBasicMaterial({ color: 0xeeeeee })));
      break;
    }
  }
  return g;
}

function wingMesh(kind, c1, c2, tier, side) {
  const s = new THREE.Shape(), k = tier > 1 ? 1.2 : 1;
  if (kind === 'bat') {
    s.moveTo(0, 0); s.lineTo(0.25 * k, 0.55 * k); s.lineTo(0.85 * k, 0.6 * k);
    s.quadraticCurveTo(0.7 * k, 0.35 * k, 0.78 * k, 0.12 * k); s.quadraticCurveTo(0.58 * k, 0.18 * k, 0.52 * k, -0.08 * k);
    s.quadraticCurveTo(0.36 * k, 0.02 * k, 0.26 * k, -0.2 * k); s.lineTo(0.02, -0.1);
  } else {
    s.moveTo(0, 0); s.quadraticCurveTo(0.45 * k, 0.75 * k, 0.95 * k, 0.55 * k);
    for (let i = 0; i < 5; i++) s.quadraticCurveTo((0.88 - i * 0.16) * k, (0.32 - i * 0.12) * k, (0.8 - i * 0.17) * k, (0.2 - i * 0.12) * k);
    s.lineTo(0.02, -0.1);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  const pos = geo.attributes.position, cols = [], A = new THREE.Color(c1), B = new THREE.Color(c2);
  for (let i = 0; i < pos.count; i++) { const t = clamp(Math.hypot(pos.getX(i), pos.getY(i)) / (0.95 * k), 0, 1); const c = A.clone().lerp(B, t); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'bat' ? 0.55 : 0.45, metalness: tier > 1 ? 0.35 : 0.1, side: THREE.DoubleSide, envMapIntensity: 0.8 });
  if (tier > 1) { mat.emissive = new THREE.Color(c2); mat.emissiveIntensity = 0.35; }
  const m = new THREE.Mesh(geo, mat);
  m.scale.x = side;
  return m;
}

// ---------------------------------------------------------------------
// Humanoid rig (player, NPCs, humanoid monsters)
// ---------------------------------------------------------------------
function buildHuman(L) {
  const sc = L.scale || 1, root = new THREE.Group(), body = grp(root);
  body.scale.setScalar(sc);
  const big = L.furry || L.rocky ? 1.25 : L.goblin ? 0.9 : 1;
  const matKind = L.rocky ? 'rock' : L.scaly ? 'scales' : L.furry ? 'grain' : L.material || (L.armored ? 'metal' : 'cloth');
  const isMetal = matKind === 'metal';
  const skinC = L.skin || (L.bones ? '#e8e0c8' : L.goblin ? '#6a9a3a' : L.c2 || '#e0c0a0');
  const skin = M3.mat(skinC, { rough: L.bones ? 0.7 : 0.6, bump: L.rocky ? 'rock' : L.scaly ? 'scales' : L.furry ? 'grain' : null, bs: 0.03, flat: !!L.rocky, emissive: L.icy ? '#4a7aa0' : null, ei: 0.4 });
  const bodyC = L.body || L.c1 || '#555';
  const bodyM = M3.mat(bodyC, { metal: isMetal ? 0.85 : 0, rough: isMetal ? 0.35 : matKind === 'cloth' ? 0.85 : 0.7, bump: matKind, bs: isMetal ? 0.008 : 0.02, flat: !!L.rocky });
  const legM = M3.mat(L.legs || shade(bodyC, -0.25), { metal: isMetal ? 0.7 : 0, rough: isMetal ? 0.4 : 0.85, bump: isMetal ? 'metal' : matKind === 'grain' ? 'grain' : 'cloth', bs: 0.015 });
  const armM = M3.mat(L.arms || bodyC, { metal: isMetal && !L.arms ? 0.8 : 0, rough: isMetal ? 0.4 : 0.85, bump: L.arms ? 'cloth' : matKind, bs: 0.015 });
  const handM = M3.mat(L.hands || skinC, { metal: L.hands && isMetal ? 0.8 : 0, rough: 0.55, bump: L.hands ? (isMetal ? 'metal' : 'grain') : null });
  const footM = M3.mat(L.feet || shade(bodyC, -0.45), { metal: L.feet && isMetal ? 0.7 : 0, rough: 0.5, bump: L.feet ? (isMetal ? 'metal' : 'grain') : null });
  const trimM = M3.mat(L.trim || L.c2 || '#c8a040', { metal: 0.9, rough: 0.3 });

  const hips = grp(body, 0, 0.92, 0);
  mk(sphere(0.15), legM, 0, 0, 0, hips).scale.set(1.15 * big, 0.75, 0.85);
  const spine = grp(hips, 0, 0.04, 0);
  const torso = mk(lathe([[0.001, 0], [0.15, 0.0], [0.17, 0.12], [0.21, 0.34], [0.2, 0.46], [0.12, 0.54], [0.06, 0.57], [0.001, 0.57]], 24), bodyM, 0, 0, 0, spine);
  torso.scale.set(big, 1, 0.68 * big);
  if (L.armored || L.trim) {
    const belt = mk(new THREE.TorusGeometry(0.16, 0.025, 8, 24), trimM, 0, 0.06, 0, spine); belt.rotation.x = Math.PI / 2; belt.scale.set(big, 0.7 * big, 1);
    mk(new THREE.BoxGeometry(0.06, 0.3, 0.03), trimM, 0, 0.3, 0.14 * big, spine);
  }
  if (L.bones) for (let i = 0; i < 4; i++) { const rib = mk(new THREE.TorusGeometry(0.16 - i * 0.01, 0.012, 6, 18, Math.PI), skin, 0, 0.2 + i * 0.07, 0, spine); rib.scale.z = 0.7; }
  if (L.leafy) for (let i = 0; i < 9; i++) { const lf = mk(sphere(0.07, 8, 6), M3.mat('#3e7a24', { rough: 0.8 }), Math.cos(i) * 0.18, 0.42 + (i % 3) * 0.05, Math.sin(i) * 0.12, spine); lf.scale.set(1, 0.5, 1.4); }
  if (L.furry) for (let i = 0; i < 8; i++) mk(sphere(0.07, 8, 6), M3.mat(shade(bodyC, 0.15), { rough: 1, bump: 'grain', bs: 0.04 }), Math.cos(i * 0.8) * 0.17, 0.08 + (i % 2) * 0.05, Math.sin(i * 0.8) * 0.11, spine);
  let robe = null;
  if (L.robe) {
    robe = animated(mk(lathe([[0.17, 0.0], [0.2, -0.25], [0.27, -0.6], [0.33, -0.86], [0.001, -0.86]], 26), M3.mat(bodyC, { rough: 0.9, bump: 'cloth', bs: 0.02 }), 0, 0.1, 0, hips));
    robe.scale.z = 0.8;
    mk(new THREE.BoxGeometry(0.05, 0.9, 0.02), trimM, 0, -0.3, 0.2, robe).position.set(0, -0.4, 0.24);
  }
  // head
  const neck = grp(spine, 0, 0.56, 0);
  mk(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin, 0, 0.02, 0, neck);
  const head = grp(neck, 0, 0.14, 0);
  const hs = L.furry ? 1.2 : L.goblin ? 1.05 : 1;
  mk(sphere(0.115 * hs, 22, 16), skin, 0, 0, 0, head).scale.set(1, 1.1, 1.02);
  if (L.cyclops) {
    mk(sphere(0.05), M3.mat('#ffffff', { rough: 0.2 }), 0, 0.02, 0.095, head);
    mk(sphere(0.024), M3.mat('#c00000', { emissive: '#600', ei: 1 }), 0, 0.02, 0.135, head);
  } else {
    const eyeC = L.eye || (L.bones || L.glow ? (L.glow || '#ff3030') : '#1a1410');
    const eyeM = M3.mat(eyeC, { emissive: L.bones || L.glow ? eyeC : null, ei: 2, rough: 0.3 });
    [-0.042, 0.042].forEach(x => {
      if (!L.bones && !L.glow) mk(sphere(0.022, 8, 6), M3.mat('#f4f0ea', { rough: 0.3 }), x, 0.012, 0.094 * hs, head);
      mk(sphere(0.014, 8, 6), eyeM, x, 0.012, 0.108 * hs, head);
      if (!L.bones) mk(new THREE.BoxGeometry(0.045, 0.01, 0.015), M3.mat(L.hair || shade(skinC, -0.5), { rough: 0.8 }), x, 0.045, 0.105 * hs, head).rotation.z = x > 0 ? -0.15 : 0.15;
    });
    mk(new THREE.ConeGeometry(0.02, 0.055, 6), skin, 0, -0.02, 0.118 * hs, head).rotation.x = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.04, 0.008, 0.01), M3.mat(shade(skinC, -0.45), { rough: 0.8 }), 0, -0.06, 0.106 * hs, head);
    if (L.bones) mk(new THREE.BoxGeometry(0.07, 0.03, 0.02), M3.mat('#1a1410'), 0, -0.065, 0.1, head);
  }
  if (L.goblin) [-1, 1].forEach(s => { const e = mk(new THREE.ConeGeometry(0.035, 0.16, 6), skin, s * 0.12, 0.03, 0, head); e.rotation.z = -s * 1.2; });
  let hairTail = null;
  if (L.hair && !L.helm) {
    const hm = M3.mat(L.hair, { rough: 0.55, bump: 'grain', bs: 0.02 });
    const hair = mk(new THREE.SphereGeometry(0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hm, 0, 0.012, -0.02, head);
    hair.scale.set(1.06, 1.12, 1.1); hair.rotation.x = -0.75;
    const fr = mk(new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.3), hm, 0, 0.03, 0.0, head); fr.scale.set(1.05, 1.1, 1.08);
    if (L.longHair) { hairTail = grp(head, 0, 0.02, -0.09); const lh = mk(capsule(0.075, 0.26), hm, 0, -0.17, 0, hairTail); lh.scale.z = 0.6; }
  }
  if (L.hood) { const hd = mk(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65), M3.mat(L.c1, { rough: 0.95, bump: 'cloth' }), 0, 0.015, -0.02, head); hd.scale.set(1, 1.1, 1.1); }
  if (L.helm) {
    const hm = M3.mat(L.helm, { metal: 0.9, rough: 0.3, bump: 'metal', bs: 0.006 });
    const h = mk(new THREE.SphereGeometry(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hm, 0, 0.01, 0, head); h.scale.set(1, 1.1, 1.08);
    [-1, 1].forEach(s => mk(new THREE.BoxGeometry(0.03, 0.1, 0.1), hm, s * 0.115, -0.05, 0.02, head));
    if (L.helmTrim) mk(new THREE.BoxGeometry(0.025, 0.07, 0.24), M3.mat(L.helmTrim, { metal: 0.9, rough: 0.3 }), 0, 0.15, 0, head);
  }
  if (L.horns) [-1, 1].forEach(s => { const hn = mk(new THREE.ConeGeometry(0.035, 0.22, 8), M3.mat('#e8dcc0', { rough: 0.4 }), s * 0.1, 0.12, 0, head); hn.rotation.z = -s * 0.7; });
  if (L.crown) { const cm = M3.mat('#ffd040', { metal: 1, rough: 0.25 }); mk(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16, 1, true), cm, 0, 0.1, 0, head); for (let i = 0; i < 6; i++) mk(new THREE.ConeGeometry(0.02, 0.07, 5), cm, Math.cos(i * 1.047) * 0.12, 0.15, Math.sin(i * 1.047) * 0.12, head); }

  // collar + tunic skirt hide joints and read as clothing
  mk(new THREE.TorusGeometry(0.075, 0.03, 8, 18), armM, 0, 0.53, 0, spine).rotation.x = Math.PI / 2;
  let skirt = null;
  if (!L.robe && !L.bones && !L.rocky && !L.furry) {
    skirt = animated(mk(lathe([[0.16, 0.04], [0.19, -0.08], [0.23, -0.24], [0.001, -0.24]], 22), M3.mat(shade(bodyC, -0.12), { rough: 0.85, bump: isMetal ? 'metal' : matKind === 'grain' ? 'grain' : 'cloth', bs: 0.015, metal: isMetal ? 0.6 : 0 }), 0, 0.02, 0, hips));
    skirt.scale.set(big, 1, 0.8 * big);
  }
  // arms (left = +X since the model faces +Z)
  const arm = side => {
    const sh = grp(spine, side * 0.235 * big, 0.46, 0);
    mk(sphere(0.07 * big, 12, 10), armM, 0, -0.01, 0, sh);
    mk(capsule(0.062 * big, 0.19), armM, 0, -0.13, 0, sh);
    if (L.armored) {
      const pm = isMetal ? M3.mat(bodyC, { metal: 0.9, rough: 0.3, bump: 'metal', bs: 0.006 }) : M3.mat(shade(bodyC, 0.08), { rough: 0.65, bump: 'grain', bs: 0.02 });
      mk(new THREE.SphereGeometry(0.105 * big, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm, side * 0.015, 0.0, 0, sh).scale.set(1.15, 0.85, 1.05);
      mk(new THREE.SphereGeometry(0.11 * big, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm, side * 0.02, -0.04, 0, sh).scale.set(1.1, 0.6, 1);
    }
    const el = grp(sh, 0, -0.27, 0);
    mk(sphere(0.056 * big, 10, 8), armM, 0, 0, 0, el);
    mk(capsule(0.055 * big, 0.17), L.hands ? handM : armM, 0, -0.12, 0, el);
    if (L.hands) mk(new THREE.CylinderGeometry(0.068 * big, 0.06 * big, 0.08, 12), handM, 0, -0.17, 0, el);
    const hand = grp(el, 0, -0.27, 0);
    mk(sphere(0.05 * big, 10, 8), handM, 0, 0, 0, hand).scale.set(1, 1.1, 0.8);
    return { sh, el, hand };
  };
  const aL = arm(1), aR = arm(-1);
  const leg = side => {
    const th = grp(hips, side * 0.09 * big, -0.02, 0);
    const thigh = mk(capsule(0.085 * big, 0.26), legM, 0, -0.2, 0, th);
    const kn = grp(th, 0, -0.42, 0);
    mk(sphere(0.07 * big, 10, 8), L.feet ? footM : legM, 0, 0, 0.01, kn);
    mk(capsule(0.068 * big, 0.27), L.feet ? footM : legM, 0, -0.2, 0, kn);
    if (L.feet) mk(new THREE.CylinderGeometry(0.085 * big, 0.075 * big, 0.06, 12), footM, 0, -0.08, 0, kn);
    const an = grp(kn, 0, -0.42, 0);
    const ft = mk(capsule(0.055 * big, 0.12), footM, 0, 0, 0.05, an); ft.rotation.x = Math.PI / 2; ft.scale.set(1.1, 1, 0.75);
    if (L.robe) thigh.visible = false;
    return { th, kn, an };
  };
  const lL = leg(1), lR = leg(-1);
  const W = L.weapon;
  if (W && W !== 'bow') {
    const wpn = weaponMesh(W, L.weaponColor, L.weaponGlow); aR.hand.add(wpn);
    if (W === 'staff' || W === 'spear' || W === 'trident') wpn.position.y = -0.3;
    else wpn.rotation.x = 1.25;
  }
  if (W === 'bow') { const wpn = weaponMesh('bow', L.weaponColor); aL.hand.add(wpn); wpn.position.z = 0.3; }
  if (L.shield) {
    const s = new THREE.Shape(); s.moveTo(-0.15, 0.17); s.lineTo(0.15, 0.17); s.lineTo(0.15, -0.02); s.quadraticCurveTo(0.12, -0.2, 0, -0.27); s.quadraticCurveTo(-0.12, -0.2, -0.15, -0.02); s.closePath();
    const sg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
    const sm = mk(sg, M3.mat(L.shield, { metal: 0.6, rough: 0.45, bump: 'metal', bs: 0.01 }), 0.075, -0.13, 0.02, aL.el);
    sm.rotation.y = Math.PI / 2 - 0.25; sm.scale.setScalar(0.72);
    mk(sphere(0.05, 12, 8), M3.mat(L.shieldTrim || '#ccc', { metal: 1, rough: 0.25 }), 0, 0, 0.06, sm).scale.z = 0.5;
  }
  const wings = [];
  const wk = L.wingsKind || (L.wings ? (L.horns ? 'bat' : 'feather') : null);
  if (wk) {
    const c1 = L.wing1 || L.c2, c2 = L.wing2 || L.c1, tier = L.wingTier || 1;
    [1, -1].forEach(side => {
      const pv = grp(spine, side * 0.06, 0.4, -0.13);
      const w = wingMesh(wk, c1, c2, tier, side); pv.add(w);
      w.rotation.x = -0.1;
      wings.push({ pv, side });
    });
  }
  const atkStyle = W === 'bow' ? 'bow' : W === 'staff' || (!W && L.robe) ? 'cast' : W === 'spear' || W === 'trident' ? 'thrust' : 'slash';
  const baseY = 0.92;

  const pose = st => {
    const t = st.t, ph = st.ph, mv = st.mv, run = st.run, hurt = st.hurt || 0, death = st.death || 0;
    const s = Math.sin(ph), c = Math.cos(ph), br = Math.sin(t * 2.1);
    // ---- idle (breathing, weight shift)
    const sway = Math.sin(t * 0.6) * 0.5;
    let hy = baseY + br * 0.004, spX = 0.03 + br * 0.012, spY = sway * 0.05, spZ = sway * 0.02, hipZ = -sway * 0.025, hipY = 0;
    let shLx = 0.05 + br * 0.03, shRx = 0.05 - br * 0.02, shLz = 0.12, shRz = -0.12, elL = -0.22, elR = -0.28;
    let thLx = -0.02 + sway * 0.03, thRx = 0.02 - sway * 0.03, knL = 0.06, knR = 0.06, anL = 0, anR = 0, headX = -0.02, headY = -sway * 0.15;
    // ---- locomotion (walk -> run), blended by mv
    if (mv > 0.001) {
      const A = lerp(0.5, 0.82, run), K = lerp(0.75, 1.35, run), arm = lerp(0.42, 0.95, run);
      const L1 = {
        hy: baseY - Math.abs(s) * lerp(0.025, 0.06, run) + (run > 0.5 ? Math.abs(c) * 0.02 : 0),
        spX: lerp(0.07, 0.26, run), spY: -s * lerp(0.14, 0.22, run), spZ: 0, hipZ: c * 0.045, hipY: s * lerp(0.1, 0.16, run),
        thLx: -s * A, thRx: s * A,
        knL: 0.08 + Math.max(0, c) * K + Math.max(0, -s) * 0.15, knR: 0.08 + Math.max(0, -c) * K + Math.max(0, s) * 0.15,
        anL: -Math.max(0, c) * 0.4 + Math.max(0, -s) * 0.2, anR: -Math.max(0, -c) * 0.4 + Math.max(0, s) * 0.2,
        shLx: s * arm, shRx: -s * arm, shLz: 0.1, shRz: -0.1,
        elL: -0.25 - lerp(0.15, 1.1, run) - Math.max(0, -s) * 0.25, elR: -0.25 - lerp(0.15, 1.1, run) - Math.max(0, s) * 0.25,
        headX: -lerp(0.05, 0.18, run), headY: s * 0.08
      };
      hy = lerp(hy, L1.hy, mv); spX = lerp(spX, L1.spX, mv); spY = lerp(spY, L1.spY, mv); spZ = lerp(spZ, L1.spZ, mv);
      hipZ = lerp(hipZ, L1.hipZ, mv); hipY = lerp(hipY, L1.hipY, mv);
      thLx = lerp(thLx, L1.thLx, mv); thRx = lerp(thRx, L1.thRx, mv); knL = lerp(knL, L1.knL, mv); knR = lerp(knR, L1.knR, mv);
      anL = lerp(anL, L1.anL, mv); anR = lerp(anR, L1.anR, mv);
      shLx = lerp(shLx, L1.shLx, mv); shRx = lerp(shRx, L1.shRx, mv); shLz = lerp(shLz, L1.shLz, mv); shRz = lerp(shRz, L1.shRz, mv);
      elL = lerp(elL, L1.elL, mv); elR = lerp(elR, L1.elR, mv); headX = lerp(headX, L1.headX, mv); headY = lerp(headY, L1.headY, mv);
    }
    // weapon carry poses (layered on top of locomotion)
    if (W === 'bow') { shLx = lerp(shLx, -0.45, 0.7); elL = -0.45; }
    if (L.shield) { elL = Math.min(elL, -1.15); shLx = Math.min(shLx, -0.15); }
    if (W === 'staff') { shRx = lerp(shRx, -0.3, 0.6); elR = -0.85; }
    // ---- attack (anticipation -> strike -> follow-through -> recover)
    const p = st.atk;
    if (p >= 0) {
      const w = smooth01(0, 0.1, p) * (1 - smooth01(0.82, 1, p));
      const kind = st.kind === 'spin' ? 'spin' : st.kind === 'cast' ? 'cast' : atkStyle;
      let a = {};
      if (kind === 'slash') {
        a = { shRx: keys([[0, -0.3], [0.32, -2.75], [0.5, 0.35], [0.7, 0.1], [1, -0.3]], p), elR: keys([[0, -0.3], [0.32, -1.0], [0.5, -0.1], [1, -0.3]], p),
          spY: keys([[0, 0], [0.32, 0.45], [0.52, -0.42], [1, 0]], p), spX: keys([[0, 0.05], [0.32, -0.05], [0.52, 0.22], [1, 0.05]], p),
          thLx: -0.42, knL: 0.35, thRx: 0.28, knR: 0.15, hy: baseY - 0.05, shLx: L.shield ? -0.35 : -0.5, headX: 0.05 };
      } else if (kind === 'thrust') {
        a = { shRx: keys([[0, -1.1], [0.35, -0.9], [0.5, -1.45], [1, -1.1]], p), elR: keys([[0, -1.2], [0.35, -1.6], [0.5, -0.1], [1, -1.0]], p), spY: keys([[0, 0], [0.35, 0.3], [0.5, -0.3], [1, 0]], p), thLx: -0.4, knL: 0.3, thRx: 0.3 };
      } else if (kind === 'bow') {
        const draw = keys([[0, 0], [0.55, 1], [0.62, 0.05], [1, 0]], p);
        a = { shLx: -1.5, shLz: 0.18, elL: -0.05, shRx: -1.45, elR: -0.35 - draw * 1.9, spY: -0.32 - draw * 0.08, spX: 0.02, headY: 0.3 };
      } else if (kind === 'spin') {
        a = { shRx: -1.4, elR: -0.2, shLx: -1.0, shLz: 0.9, shRz: -0.9, hy: baseY - 0.06, knL: 0.35, knR: 0.35, thLx: -0.3, thRx: 0.2 };
      } else { // cast
        const k = keys([[0, 0], [0.35, 1], [0.6, 0.85], [1, 0]], p), thrust = keys([[0, 0], [0.4, 0], [0.55, 1], [1, 0]], p);
        a = { shRx: -0.3 - k * 1.6 - thrust * 0.3, elR: -0.8 + k * 0.5, shLx: -k * 1.25, elL: -0.25, shLz: 0.3 * k, spX: -k * 0.12 + thrust * 0.15, headX: -k * 0.12 };
      }
      const mix = (cur, key) => a[key] != null ? lerp(cur, a[key], w) : cur;
      shRx = mix(shRx, 'shRx'); elR = mix(elR, 'elR'); shLx = mix(shLx, 'shLx'); elL = mix(elL, 'elL'); shLz = mix(shLz, 'shLz'); shRz = mix(shRz, 'shRz');
      spY = mix(spY, 'spY'); spX = mix(spX, 'spX'); headX = mix(headX, 'headX'); headY = mix(headY, 'headY');
      const lw = 1 - mv * 0.7;  // legs follow the attack only when standing
      if (a.thLx != null) { thLx = lerp(thLx, a.thLx, w * lw); knL = lerp(knL, a.knL || knL, w * lw); thRx = lerp(thRx, a.thRx, w * lw); knR = lerp(knR, a.knR || knR, w * lw); }
      if (a.hy != null) hy = lerp(hy, a.hy, w * lw);
      if (kind === 'spin') spY += easeIO(p) * TAU;
    }
    // ---- hit reaction
    if (hurt > 0) { const h = easeOut(hurt); spX -= 0.32 * h; headX -= 0.35 * h; shLx += 0.35 * h; shRx += 0.35 * h; hy -= 0.03 * h; }
    // ---- apply
    hips.position.y = hy; hips.rotation.set(0, hipY, hipZ);
    spine.rotation.set(spX, spY, spZ);
    head.rotation.set(headX, headY, 0);
    aL.sh.rotation.set(shLx, 0, shLz); aR.sh.rotation.set(shRx, 0, shRz);
    aL.el.rotation.set(elL, 0, 0); aR.el.rotation.set(elR, 0, 0);
    lL.th.rotation.set(thLx, 0, 0); lR.th.rotation.set(thRx, 0, 0);
    lL.kn.rotation.set(knL, 0, 0); lR.kn.rotation.set(knR, 0, 0);
    lL.an.rotation.set(anL, 0, 0); lR.an.rotation.set(anR, 0, 0);
    if (robe) { robe.rotation.x = -spX * 0.2 - mv * 0.08 * (1 + run); robe.scale.x = 1 + Math.abs(s) * 0.06 * mv; }
    if (skirt) skirt.rotation.x = -mv * 0.12 * (1 + run);
    if (hairTail) hairTail.rotation.x = 0.15 + mv * 0.35 * (1 + run) + Math.sin(t * 3) * 0.04;
    wings.forEach(wg => { const f = Math.sin(t * (2 + mv * 4)) * (0.1 + mv * 0.2); wg.pv.rotation.set(0, wg.side * (0.42 + f), wg.side * 0.15); });
    // ---- death: knees buckle, then fall backwards onto the ground
    if (death > 0) {
      const k = smooth01(0, 0.45, death), f = easeIn(smooth01(0.2, 1, death));
      lL.kn.rotation.x += k * 0.9; lR.kn.rotation.x += k * 0.7; hips.position.y -= k * 0.15;
      aL.sh.rotation.z += f * 0.9; aR.sh.rotation.z -= f * 0.9; head.rotation.x -= f * 0.3;
      body.rotation.x = -f * 1.42; body.position.y = f * 0.12 * sc;
    } else { body.rotation.x = 0; body.position.y = 0; }
  };
  const winged = wings.length > 0;
  return { root, pose, size: Math.max(1, sc * 0.95), wide: winged ? 1.6 : 1.15, tall: (W === 'spear' || W === 'trident' || W === 'staff') ? 1.12 : 1.04 };
}

// ---------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------
function monMats(L) {
  const glow = L.glow;
  return {
    a: M3.mat(L.c1, { rough: 0.6, bump: L.scaly ? 'scales' : 'grain', bs: 0.025 }),
    b: M3.mat(L.c2, { rough: 0.5, bump: 'grain', bs: 0.015 }),
    shell: M3.mat(L.c1, { rough: 0.25, metal: 0.4, bump: 'scales', bs: 0.01 }),
    eye: M3.mat(glow || '#ffe040', { emissive: glow || '#ffb020', ei: 2.2 }),
    horn: M3.mat('#ece0c4', { rough: 0.4 })
  };
}
function deathRoll(b, death, sc) {
  if (death > 0) { const f = easeIn(smooth01(0, 0.8, death)); b.rotation.z = f * 1.5; b.position.y = f * 0.18 * sc; }
  else { b.rotation.z = 0; b.position.y = 0; }
}
function buildBeast(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  const body = grp(b, 0, 0.48, 0);
  const torso = mk(capsule(0.2, 0.42, 16), M.a, 0, 0, 0, body); torso.rotation.x = Math.PI / 2;
  mk(capsule(0.12, 0.3), M.b, 0, -0.1, 0.03, body).rotation.x = Math.PI / 2;
  const neck = grp(body, 0, 0.08, 0.32);
  const head = grp(neck, 0, 0.1, 0.12);
  mk(sphere(0.15), M.a, 0, 0, 0, head).scale.set(0.9, 0.85, 1.05);
  const snout = mk(capsule(0.08, 0.14), M.a, 0, -0.04, 0.15, head); snout.rotation.x = Math.PI / 2;
  const jaw = grp(head, 0, -0.07, 0.05);
  mk(new THREE.BoxGeometry(0.12, 0.03, 0.2), M.b, 0, 0, 0.08, jaw);
  for (let i = 0; i < 4; i++) mk(new THREE.ConeGeometry(0.01, 0.04, 4), M.horn, -0.04 + i * 0.027, 0.03, 0.16, jaw).rotation.x = Math.PI;
  const ears = [-1, 1].map(s => { mk(sphere(0.025, 8, 6), M.eye, s * 0.07, 0.04, 0.11, head); const e = animated(mk(new THREE.ConeGeometry(0.045, 0.13, 6), M.a, s * 0.08, 0.13, -0.03, head)); e.rotation.z = -s * 0.3; return e; });
  if (L.horns) [-1, 1].forEach(s => { const h = mk(new THREE.ConeGeometry(0.035, 0.22, 7), M.horn, s * 0.06, 0.17, 0.02, head); h.rotation.x = -0.6; h.rotation.z = -s * 0.3; });
  const legs = [];
  [[1, 0.2, 0], [-1, 0.2, Math.PI], [1, -0.22, Math.PI], [-1, -0.22, 0]].forEach(([s, z, off]) => {
    const up = grp(body, s * 0.13, -0.05, z);
    mk(capsule(0.065, 0.2), M.a, 0, -0.13, 0, up);
    const lo = grp(up, 0, -0.27, 0);
    mk(capsule(0.045, 0.16), M.a, 0, -0.1, 0, lo);
    mk(sphere(0.055, 10, 8), M.b, 0, -0.2, 0.03, lo).scale.set(1, 0.6, 1.3);
    legs.push({ up, lo, off, front: z > 0 });
  });
  const tail = []; let tp = grp(body, 0, 0.05, -0.38);
  for (let i = 0; i < 5; i++) { mk(capsule(0.04 - i * 0.006, 0.09), M.a, 0, 0, -0.055, tp).rotation.x = Math.PI / 2; tail.push(tp); tp = grp(tp, 0, 0, -0.11); }
  const pose = st => {
    const { t, ph, mv, run } = st, hurt = st.hurt || 0;
    legs.forEach(l => { const q = ph + l.off + (l.front ? 0 : 0.4); l.up.rotation.x = Math.sin(q) * lerp(0.45, 0.7, run) * mv; l.lo.rotation.x = Math.max(0, -Math.cos(q)) * 0.7 * mv + (l.front ? 0 : 0.1); });
    body.position.y = 0.48 + Math.abs(Math.cos(ph)) * 0.035 * mv + Math.sin(t * 2) * 0.006;
    body.rotation.x = Math.sin(ph * 2) * 0.03 * mv;
    tail.forEach((tt, i) => { tt.rotation.x = 0.25 + (i === 0 ? 0.3 : 0) - mv * 0.15; tt.rotation.y = Math.sin(t * 4 + i * 0.7) * (0.25 - mv * 0.1); });
    ears.forEach((e, i) => e.rotation.x = Math.sin(t * 3 + i) * 0.1 - mv * 0.3);
    let nz = 0.32, nx = Math.sin(ph) * 0.05 * mv, jx = 0;
    if (st.atk >= 0) { const p = st.atk, k = keys([[0, 0], [0.3, -0.4], [0.5, 1], [0.7, 0.8], [1, 0]], p); nz = 0.32 + Math.max(0, k) * 0.16; nx = k * 0.35; jx = Math.max(0, k) * 0.6; body.rotation.x -= Math.min(0, k) * 0.15; }
    neck.position.z = nz; neck.rotation.x = nx - hurt * 0.4; jaw.rotation.x = jx;
    deathRoll(b, st.death || 0, 1);
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.2 };
}
function buildFlyer(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  const body = grp(b, 0, 0.95, 0);
  mk(sphere(0.2), M.a, 0, 0, 0, body).scale.set(0.85, 0.75, 1.25);
  mk(sphere(0.13), M.b, 0, -0.06, 0.05, body).scale.set(0.9, 0.7, 1.2);
  const head = grp(body, 0, 0.1, 0.26);
  mk(sphere(0.12), M.a, 0, 0, 0, head).scale.set(0.9, 0.85, 1.1);
  mk(new THREE.ConeGeometry(0.06, 0.16, 8), M.b, 0, -0.02, 0.14, head).rotation.x = Math.PI / 2;
  [-1, 1].forEach(s => { mk(sphere(0.022, 8, 6), M.eye, s * 0.06, 0.04, 0.09, head); const h = mk(new THREE.ConeGeometry(0.025, 0.12, 6), M.horn, s * 0.05, 0.11, -0.04, head); h.rotation.x = -0.7; });
  const wings = [-1, 1].map(s => { const pv = grp(body, s * 0.12, 0.08, 0); const w = wingMesh('bat', L.c2, shade(L.c2, -0.3), 1, s); w.scale.multiplyScalar(0.9); w.rotation.y = -s * 0.2; w.rotation.x = -Math.PI / 2 + 0.3; pv.add(w); return { pv, s }; });
  const tail = []; let tp = grp(body, 0, 0, -0.25);
  for (let i = 0; i < 5; i++) { mk(capsule(0.04 - i * 0.006, 0.08), M.a, 0, 0, -0.05, tp).rotation.x = Math.PI / 2; tail.push(tp); tp = grp(tp, 0, 0, -0.1); }
  [-1, 1].forEach(s => mk(capsule(0.03, 0.12), M.a, s * 0.08, -0.17, 0.05, body));
  const pose = st => {
    const { t, mv } = st, death = st.death || 0;
    const flap = Math.sin(t * (9 + mv * 4));
    wings.forEach(w => { w.pv.rotation.z = w.s * (0.15 + flap * (death > 0 ? 0.2 * (1 - death) : 0.75)); });
    const bob = Math.sin(t * (9 + mv * 4) + 1.2) * 0.04;
    body.position.y = lerp(0.95 + bob, 0.15, easeIn(death));
    body.rotation.x = mv * 0.25 + (st.atk >= 0 ? Math.sin(st.atk * Math.PI) * 0.4 : 0) - (st.hurt || 0) * 0.4;
    body.rotation.z = death * 1.3;
    tail.forEach((tt, i) => { tt.rotation.x = -0.15 + Math.sin(t * 3 + i * 0.8) * 0.15; tt.rotation.y = Math.sin(t * 2 + i) * 0.12; });
    head.position.z = 0.26 + (st.atk >= 0 ? Math.sin(st.atk * Math.PI) * 0.12 : 0);
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.7, tall: 1.15 };
}
function buildBug(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const M = monMats(L);
  if (L.worm) {
    const segs = [];
    for (let i = 0; i < 8; i++) { const s = animated(mk(sphere(0.12 - i * 0.007, 16, 12), i % 2 ? M.a : M.b, 0, 0.12, 0.34 - i * 0.13, b)); s.scale.set(1, 0.9, 1.15); segs.push(s); }
    mk(sphere(0.03, 8, 6), M.eye, 0.05, 0.18, 0.44, b); mk(sphere(0.03, 8, 6), M.eye, -0.05, 0.18, 0.44, b);
    const pose = st => {
      const { t, ph, mv } = st, death = st.death || 0;
      segs.forEach((s, i) => {
        const wave = Math.sin(ph * 1.5 - i * 0.9);
        s.position.y = (0.12 + Math.max(0, wave) * 0.08 * mv + Math.sin(t * 2 + i) * 0.008 + (st.atk >= 0 && i < 3 ? Math.sin(st.atk * Math.PI) * (0.25 - i * 0.07) : 0)) * (1 - death * 0.6);
        s.position.x = Math.sin(t * 1.5 + i * 0.7) * 0.03 * (1 - mv * 0.5);
        s.scale.y = 0.9 * (1 - death * 0.5);
      });
    };
    return { root, pose, size: Math.max(1, sc), wide: 1.3 };
  }
  const body = grp(b, 0, 0.2, 0);
  const abd = mk(sphere(0.2, 20, 14), L.shell ? M.shell : M.a, 0, 0.04, -0.2, body); abd.scale.set(1, 0.75, 1.3);
  mk(sphere(0.12, 14, 10), M.a, 0, 0.02, 0.05, body).scale.set(1, 0.8, 1);
  const head = grp(body, 0, 0.02, 0.2);
  mk(sphere(0.09, 12, 10), M.b, 0, 0, 0, head);
  for (let i = 0; i < 4; i++) mk(sphere(0.016, 6, 5), M.eye, -0.045 + i * 0.03, 0.04, 0.07, head);
  const fangs = [-1, 1].map(s => { const f = animated(mk(new THREE.ConeGeometry(0.018, 0.1, 5), M.horn, s * 0.04, -0.04, 0.09, head)); f.rotation.x = Math.PI / 2 + 0.3; return f; });
  const n = (L.legs || 6) / 2, legs = [];
  for (let i = 0; i < n; i++) [-1, 1].forEach(s => {
    const z = 0.12 - i * (0.24 / Math.max(1, n - 1));
    const up = grp(body, s * 0.08, 0, z);
    const u = mk(new THREE.CylinderGeometry(0.018, 0.014, 0.22, 6), M.a, s * 0.1, 0.06, 0, up); u.rotation.z = s * 1.0;
    const lo = mk(new THREE.CylinderGeometry(0.014, 0.008, 0.26, 6), M.a, s * 0.25, -0.05, 0, up); lo.rotation.z = -s * 0.5;
    up.userData.base = s * (i - (n - 1) / 2) * -0.35;
    legs.push({ up, s, i });
  });
  const tail = [];
  if (L.tail) { let tp = grp(body, 0, 0.12, -0.42); for (let i = 0; i < 5; i++) { mk(sphere(0.06 - i * 0.006, 10, 8), M.a, 0, 0, 0, tp); tail.push(tp); tp = grp(tp, 0, 0.1, -0.02); } mk(new THREE.ConeGeometry(0.03, 0.12, 6), M.horn, 0, 0.05, 0.03, tp).rotation.x = 1.2; }
  const pose = st => {
    const { t, ph, mv } = st, death = st.death || 0;
    legs.forEach(l => {
      const tri = ((l.i + (l.s > 0 ? 0 : 1)) % 2) ? 0 : Math.PI;   // alternating tripod gait
      const q = ph * 1.6 + tri;
      l.up.rotation.y = l.up.userData.base + Math.sin(q) * 0.38 * mv;
      l.up.rotation.z = (Math.max(0, Math.cos(q)) * 0.25 * mv + Math.sin(t * 3 + l.i) * 0.02) * l.s - death * l.s * 0.9;
    });
    tail.forEach((tt, i) => { tt.rotation.x = -0.55 + (st.atk >= 0 ? -keys([[0, 0], [0.35, -0.2], [0.55, 0.5], [1, 0]], st.atk) : Math.sin(t * 2 + i) * 0.05); });
    head.position.z = 0.2 + (st.atk >= 0 ? Math.sin(st.atk * Math.PI) * 0.1 : 0);
    fangs.forEach((f, i) => f.rotation.z = (i ? 1 : -1) * (st.atk >= 0 ? Math.sin(st.atk * Math.PI) * 0.5 : Math.sin(t * 5) * 0.05));
    body.position.y = 0.2 + Math.abs(Math.sin(ph * 3.2)) * 0.012 * mv;
    b.rotation.z = easeIO(death) * Math.PI; b.position.y = easeIO(death) * 0.35;
  };
  return { root, pose, size: Math.max(1, sc), wide: 1.3 };
}
function buildGhost(L) {
  const sc = L.scale || 1, root = new THREE.Group(), b = grp(root); b.scale.setScalar(sc);
  const glow = L.glow || '#cff';
  const cloakM = M3.mat(L.c2, { emissive: glow, ei: 0.5, opacity: 0.72, rough: 0.9, double: true, bump: 'cloth', bs: 0.02 });
  const body = grp(b, 0, 0.45, 0);
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([0.08 + Math.sin(t * Math.PI * 0.9) * 0.22 + t * 0.06, 0.9 - t * 0.95]); }
  const cloak = animated(mk(lathe(pts, 24), cloakM, 0, 0, 0, body));
  mk(new THREE.SphereGeometry(0.17, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), cloakM, 0, 0.92, 0, body);
  mk(sphere(0.12), M3.mat('#050608', { rough: 1 }), 0, 0.88, 0.04, body);
  const eM = M3.mat(glow, { emissive: glow, ei: 3 });
  [-0.045, 0.045].forEach(x => mk(sphere(0.022, 8, 6), eM, x, 0.9, 0.14, body));
  const arms = [-1, 1].map(s => { const a = grp(body, s * 0.2, 0.62, 0.02); const m = mk(new THREE.ConeGeometry(0.06, 0.42, 8, 1, true), cloakM, 0, -0.2, 0, a); m.rotation.x = Math.PI; return a; });
  const pose = st => {
    const { t, mv } = st, death = st.death || 0;
    body.position.y = 0.45 + Math.sin(t * 1.8) * 0.06 - death * 0.4;
    cloak.scale.set(1 + Math.sin(t * 3) * 0.03, 1 - death * 0.5, 1 + Math.cos(t * 3) * 0.03);
    arms.forEach((a, i) => { a.rotation.x = st.atk >= 0 ? -keys([[0, 0.3], [0.4, 1.8], [0.6, 0.6], [1, 0.3]], st.atk) : -0.3 + Math.sin(t * 2 + i) * 0.15; a.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * 1.3 + i) * 0.08); });
    body.rotation.x = mv * 0.18 - (st.hurt || 0) * 0.3;
  };
  return { root, pose, size: Math.max(1, sc), tall: 1.2 };
}
function buildMonster(def) {
  const L = def.look;
  switch (def.shape) {
    case 'beast': return buildBeast(L);
    case 'flyer': return buildFlyer(L);
    case 'bug': return buildBug(L);
    case 'ghost': return buildGhost(L);
    default: return buildHuman(L);
  }
}

// ---------------------------------------------------------------------
// 2D integration
// ---------------------------------------------------------------------
function lookKey(L) { return JSON.stringify(L, (k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v); }
function animState(a) {
  return {
    t: a.t || 0, ph: a.walk || 0, mv: a.mv || 0, run: a.run || 0,
    atk: a.atk > 0 ? 1 - a.atk : -1, kind: a.atkKind, hurt: a.hurt || 0, death: a.death || 0
  };
}
function keyFor(e) {
  if (e instanceof Player) { const L = e.look(); return ['P' + lookKey(L), () => buildHuman(L)]; }
  if (e instanceof Monster) return ['M' + e.id, () => buildMonster(e.def)];
  return ['N' + e.id, () => buildHuman(Object.assign({ scale: e.look.goblin ? 0.85 : 1 }, e.look))];
}
const TRACKED = new Set();
let G3ID = 0;
// pass 1: give every visible entity a model instance + GL cell, re-render the ones that are due, in one render() call
function prepFrame3D(list) {
  if (!M3.ready) return;
  M3.begin();
  const p = G.player, SS = M3.SS;
  for (const e of list) {
    const [k, b] = keyFor(e);
    let g = e._g;
    if (g && g.key !== k) { freeG(g); g = null; }
    if (!g) { g = e._g = { key: k, m: M3.acquire(k, b), cell: null, last: -99, id: G3ID++, e }; TRACKED.add(g); }
    g.seen = G.frame;
    const m = g.m, w = Math.round(m.FW * SS), h = Math.round(m.FH * SS);
    if (!g.cell) { g.cell = M3.allocCell(w, h, g); g.last = -99; }
    if (!g.cell) { e._r3 = null; continue; }
    const a = e.anim;
    // refresh rate: player and anything mid-action every frame, nearby every 2nd, far every 3rd
    const busy = e === p || a.atk > 0 || a.hurt > 0 || (a.death > 0 && a.death < 1);
    const iv = busy ? 1 : dist(e.x, e.y, p.x, p.y) < 7 ? 2 : 3;
    if (G.frame - g.last >= iv && ((G.frame + g.id) % iv === 0 || G.frame - g.last > iv)) {
      const face = a.face != null ? a.face : a.ang != null ? a.ang : Math.PI / 4;
      M3.draw(m, face, animState(a), g.cell);
      g.last = G.frame;
    }
    e._r3 = { m, r: M3.rectOf(m, g.cell), f: G.frame };
  }
  M3.flush();
  // entities that left the screen give back their cell and model
  for (const g of TRACKED) if (G.frame - g.seen > 90) freeG(g);
}
function freeG(g) {
  if (g.cell) g.cell.owner = null;
  M3.release(g.key, g.m);
  if (g.e._g === g) g.e._g = null;
  TRACKED.delete(g);
}
// pass 2: copy the pre-rendered entity into the 2D scene at its depth-sorted turn
function draw3D(ctx, x, y, e, alpha) {
  const o = e._r3;
  if (!M3.ready || !o || o.f !== G.frame) return false;
  const { m, r } = o, anim = e.anim;
  const dx = Math.round(x - m.FW / 2), dy = Math.round(y - (m.FH - m.foot));
  if (alpha != null) { ctx.save(); ctx.globalAlpha = alpha; }
  ctx.drawImage(M3.R.domElement, r.sx, r.sy, r.sw, r.sh, dx, dy, m.FW, m.FH);
  if (anim.hurt > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = anim.hurt * 0.35;
    ctx.drawImage(M3.R.domElement, r.sx, r.sy, r.sw, r.sh, dx, dy, m.FW, m.FH); ctx.restore();
  }
  if (alpha != null) ctx.restore();
  return true;
}
function drawPlayer3D(ctx, x, y, p, anim) {
  const L = p.look();
  if (L.aura) glowAt(ctx, x, y - 34, 44, L.aura >= 13 ? `hsl(${(G.time * 120) % 360},100%,65%)` : L.aura >= 11 ? '#ffd860' : '#6aa8ff', 0.4);
  const ok = draw3D(ctx, x, y, p);
  if (ok && L.aura >= 11) { ctx.save(); ctx.translate(x, y); drawAura(ctx, L.aura, G.time, 1); ctx.restore(); }
  return ok;
}
function drawMonster3D(ctx, x, y, m, anim, alpha) { return draw3D(ctx, x, y, m, alpha); }
function drawNpc3D(ctx, x, y, n) { return draw3D(ctx, x, y, n); }
// static preview (character select / create screens), facing the camera
function drawPreview3D(g, x, y, L, scale) {
  if (!M3.ready) return false;
  const k = 'P' + lookKey(L), m = M3.acquire(k, () => buildHuman(L));
  M3.begin();
  const r = M3.draw(m, Math.PI / 4, { t: 1.2, ph: 0, mv: 0, run: 0, atk: -1, hurt: 0, death: 0 }, M3.previewCell);
  M3.flush();
  g.imageSmoothingQuality = 'high';
  g.drawImage(M3.R.domElement, r.sx, r.sy, r.sw, r.sh, x - m.FW / 2 * scale, y - (m.FH - m.foot) * scale, m.FW * scale, m.FH * scale);
  M3.release(k, m);
  return true;
}
// build model instances and compile shaders up front so entering a map does not hitch
function prewarm3D() {
  if (!M3.ready || !G.map) return;
  for (const g of [...TRACKED]) freeG(g);   // previous map's entities give back their cells
  M3.begin();
  const made = [];
  const warm = (k, b, n = 1) => { for (let i = 0; i < n; i++) { const m = M3.acquire(k, b); made.push([k, m]); M3.scene.add(m.root); } };
  const counts = new Map(); G.monsters.forEach(m => counts.set(m.id, (counts.get(m.id) || 0) + 1));
  // several of the same kind are usually on screen at once
  counts.forEach((c, id) => warm('M' + id, () => buildMonster(MONSTERS[id]), Math.min(c, MONSTERS[id].boss ? 1 : 5)));
  G.npcs.forEach(n => warm('N' + n.id, () => buildHuman(Object.assign({ scale: n.look.goblin ? 0.85 : 1 }, n.look))));
  const L = G.player.look(); warm('P' + lookKey(L), () => buildHuman(L));
  M3.R.compile(M3.scene, M3.cam);
  made.forEach(([k, m]) => { M3.scene.remove(m.root); M3.release(k, m); });
}
// per-frame animation bookkeeping (smooth turning, locomotion blend)
function tickAnim(e, dt, speed) {
  const a = e.anim;
  a.t = (a.t || 0) + dt;
  if (a.face == null) a.face = a.ang != null ? a.ang : Math.PI / 4;
  if (a.ang != null) {
    let d = a.ang - a.face; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    a.face += d * Math.min(1, dt * 11);
  }
  a.mv = lerp(a.mv || 0, a.moving ? 1 : 0, Math.min(1, dt * (a.moving ? 10 : 7)));
  a.run = lerp(a.run || 0, a.moving && speed > 3.4 ? 1 : 0, Math.min(1, dt * 6));
}
