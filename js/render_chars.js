// ---------------------------------------------------------------------
// Procedural character / monster drawing (all original vector art)
// a = { t: time, walk: phase, atk: 0..1, hurt: 0..1, dir: 1|-1, alpha }
// ---------------------------------------------------------------------
function shadowAt(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, 7); ctx.fill();
}
function glowAt(ctx, x, y, r, col, a = 0.5) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
}
// blend a grayscale material texture into the current path (cloth weave, brushed metal, fur, scales)
function matOverlay(ctx, name, a) {
  if (!Textures.ready) return;
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = a;
  ctx.fillStyle = Textures.pat(ctx, name); ctx.fill(); ctx.restore();
}
function limb(ctx, x1, y1, x2, y2, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawWings(ctx, kind, c1, c2, t, s, tier) {
  const flap = Math.sin(t * 3) * 0.12;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1); ctx.rotate(flap * side * 0);
    ctx.rotate(-flap);
    const g = ctx.createLinearGradient(0, -40 * s, 50 * s, 0);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.strokeStyle = shade(c2.startsWith('#') ? c2 : '#888888', -0.3); ctx.lineWidth = 1;
    ctx.beginPath();
    if (kind === 'feather') {
      ctx.moveTo(2 * s, -38 * s);
      ctx.quadraticCurveTo(40 * s, -78 * s, 62 * s * (tier > 1 ? 1.15 : 1), -60 * s);
      for (let i = 0; i < 5; i++) ctx.quadraticCurveTo((58 - i * 9) * s, (-40 + i * 9) * s, (50 - i * 10) * s, (-30 + i * 9) * s);
      ctx.lineTo(4 * s, -26 * s);
    } else { // bat / demon
      ctx.moveTo(2 * s, -40 * s);
      ctx.lineTo(30 * s, -72 * s); ctx.lineTo(64 * s * (tier > 1 ? 1.15 : 1), -66 * s);
      ctx.quadraticCurveTo(54 * s, -50 * s, 58 * s, -30 * s);
      ctx.quadraticCurveTo(44 * s, -36 * s, 40 * s, -16 * s);
      ctx.quadraticCurveTo(28 * s, -26 * s, 20 * s, -10 * s);
      ctx.lineTo(4 * s, -28 * s);
    }
    ctx.closePath(); ctx.globalAlpha *= 0.92; ctx.fill(); ctx.stroke();
    if (tier > 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1; ctx.fill(); }
    ctx.restore();
  }
}

// generic humanoid used for player, NPCs and most monsters
function drawHumanoid(ctx, x, y, L, a) {
  const s = (L.scale || 1);
  const t = a.t, wk = a.walk || 0;
  const bob = Math.abs(Math.sin(wk)) * 2 * s;
  const legSw = Math.sin(wk) * 7 * s;
  const atk = a.atk || 0;
  shadowAt(ctx, x, y, 16 * s);
  ctx.save(); ctx.translate(x, y - bob); ctx.scale(a.dir || 1, 1);
  if (a.alpha != null) ctx.globalAlpha = a.alpha;
  if (L.glow) glowAt(ctx, 0, -32 * s, 34 * s, L.glow, 0.35 + Math.sin(t * 3) * 0.1);
  if (L.aura) drawAura(ctx, L.aura, t, s);
  if (L.wingsKind) drawWings(ctx, L.wingsKind, L.wing1, L.wing2, t, s, L.wingTier);
  else if (L.wings) drawWings(ctx, L.horns ? 'bat' : 'feather', L.c2, L.c1, t, s, 1);

  const skin = L.skin || (L.bones ? '#e8e2d0' : L.goblin ? '#7aa040' : L.c2);
  const body = L.body || L.c1, legs = L.legs || shade(L.c1, -0.25), arms = L.arms || L.c1, feet = L.feet || shade(L.c1, -0.45), hands = L.hands || skin;
  const big = L.furry || L.rocky ? 1.25 : 1;
  // legs
  if (!L.robe) {
    limb(ctx, -4 * s, -18 * s, -5 * s + legSw, -2 * s, 6 * s * big, legs);
    limb(ctx, 4 * s, -18 * s, 5 * s - legSw, -2 * s, 6 * s * big, legs);
    ctx.fillStyle = feet; ctx.fillRect(-9 * s + legSw, -4 * s, 8 * s, 4 * s); ctx.fillRect(1 * s - legSw, -4 * s, 8 * s, 4 * s);
  }
  // back arm
  const armSw = atk > 0 ? -Math.sin(atk * Math.PI) * 1.6 : Math.sin(wk) * 0.4;
  ctx.save(); ctx.translate(-8 * s, -34 * s); ctx.rotate(-armSw * 0.4 + 0.15);
  limb(ctx, 0, 0, 0, 15 * s, 5 * s * big, shade(arms, -0.2)); ctx.restore();
  // torso
  if (L.robe) {
    const g = ctx.createLinearGradient(-12 * s, 0, 12 * s, 0);
    g.addColorStop(0, shade(body, -0.3)); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -0.4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8 * s, -40 * s); ctx.lineTo(8 * s, -40 * s); ctx.lineTo(13 * s + Math.sin(wk) * 2, 0); ctx.lineTo(-13 * s - Math.sin(wk) * 2, 0); ctx.fill();
    matOverlay(ctx, L.material || 'cloth', 0.8);
    ctx.fillStyle = L.c2; ctx.fillRect(-1.5 * s, -38 * s, 3 * s, 37 * s);
  } else {
    const g = ctx.createLinearGradient(-10 * s, 0, 10 * s, 0);
    g.addColorStop(0, shade(body, -0.35)); g.addColorStop(0.45, shade(body, 0.15)); g.addColorStop(1, shade(body, -0.45));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-10 * s * big, -40 * s); ctx.lineTo(10 * s * big, -40 * s); ctx.lineTo(8 * s, -18 * s); ctx.lineTo(-8 * s, -18 * s); ctx.fill();
    const mat = L.material || (L.armored ? 'metal' : L.scaly ? 'scales' : L.bones ? 'grain' : 'cloth');
    matOverlay(ctx, mat, 0.85);
    if (mat === 'metal') { const sp = ctx.createLinearGradient(-6 * s, -40 * s, 2 * s, -20 * s); sp.addColorStop(0, 'rgba(255,255,255,0)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.35)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sp; ctx.fill(); }
    if (L.bones) { ctx.strokeStyle = '#8a8270'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-7 * s, (-36 + i * 4.5) * s); ctx.lineTo(7 * s, (-36 + i * 4.5) * s); ctx.stroke(); } }
    if (L.armored || L.trim) { ctx.fillStyle = L.trim || L.c2; ctx.fillRect(-10 * s, -22 * s, 20 * s, 3 * s); ctx.fillRect(-2 * s, -39 * s, 4 * s, 18 * s); }
    if (L.armored) { // pauldrons
      ctx.fillStyle = shade(body, 0.1); ctx.beginPath(); ctx.ellipse(-11 * s, -38 * s, 6 * s, 4 * s, 0, 0, 7); ctx.ellipse(11 * s, -38 * s, 6 * s, 4 * s, 0, 0, 7); ctx.fill();
    }
    if (L.furry) { ctx.fillStyle = shade(body, 0.2); for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc((i - 2.5) * 4 * s, -20 * s, 3 * s, 0, 7); ctx.fill(); } }
    if (L.leafy) { ctx.fillStyle = '#4a8a2a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse((i - 2) * 5 * s, -40 * s, 4 * s, 7 * s, i, 0, 7); ctx.fill(); } }
    if (L.scaly) { ctx.fillStyle = 'rgba(255,255,255,0.15)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(((i % 3) - 1) * 5 * s, (-34 + Math.floor(i / 3) * 7) * s, 2.5 * s, 0, Math.PI); ctx.fill(); } }
  }
  // head
  const hy = -48 * s;
  if (L.cyclops) {
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, hy, 9 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2 * s, hy - 1 * s, 4 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#c00'; ctx.beginPath(); ctx.arc(3 * s, hy - 1 * s, 2 * s, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, hy, 7.5 * s * (L.furry ? 1.2 : 1), 0, 7); ctx.fill();
    { const hg = ctx.createRadialGradient(-2 * s, hy - 3 * s, 0, 0, hy, 8 * s); hg.addColorStop(0, 'rgba(255,240,220,0.25)'); hg.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = hg; ctx.fill(); }
    if (L.hair && !L.helm) { ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(-1 * s, hy - 2 * s, 8 * s, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); if (L.longHair) ctx.fillRect(-8 * s, hy - 2 * s, 5 * s, 18 * s); }
    if (L.hood) { ctx.fillStyle = L.c1; ctx.beginPath(); ctx.arc(0, hy - 1 * s, 9.5 * s, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(-9 * s, hy + 6 * s); ctx.fill(); }
    if (L.helm) {
      ctx.fillStyle = L.helm; ctx.beginPath(); ctx.arc(0, hy - 1 * s, 8.6 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.fillRect(-8.6 * s, hy - 2 * s, 4 * s, 8 * s);
      if (L.helmTrim) { ctx.fillStyle = L.helmTrim; ctx.fillRect(-1.2 * s, hy - 10 * s, 2.4 * s, 7 * s); }
    }
    // eyes
    const eye = L.eye || (L.bones || L.glow ? (L.glow || '#f33') : '#111');
    ctx.fillStyle = eye; ctx.fillRect(2 * s, hy - 1.5 * s, 2.2 * s, 2 * s); ctx.fillRect(5.5 * s, hy - 1.5 * s, 1.8 * s, 2 * s);
  }
  if (L.horns) { ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(-5 * s, hy - 5 * s); ctx.quadraticCurveTo(-14 * s, hy - 10 * s, -10 * s, hy - 20 * s); ctx.lineTo(-3 * s, hy - 7 * s); ctx.fill(); ctx.beginPath(); ctx.moveTo(5 * s, hy - 5 * s); ctx.quadraticCurveTo(14 * s, hy - 10 * s, 10 * s, hy - 20 * s); ctx.lineTo(3 * s, hy - 7 * s); ctx.fill(); }
  if (L.crown) { ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.moveTo(-7 * s, hy - 6 * s); for (let i = 0; i < 5; i++) { ctx.lineTo((-7 + i * 3.5) * s, hy - (i % 2 ? 9 : 15) * s); } ctx.lineTo(7 * s, hy - 6 * s); ctx.fill(); }
  if (L.goblin) { ctx.fillStyle = skin; ctx.beginPath(); ctx.moveTo(-6 * s, hy); ctx.lineTo(-15 * s, hy - 6 * s); ctx.lineTo(-5 * s, hy - 4 * s); ctx.fill(); }

  // front arm + weapon
  ctx.save(); ctx.translate(8 * s, -34 * s);
  const swing = atk > 0 ? (L.weapon === 'bow' || L.weapon === 'staff' ? -0.9 : -2.2 + Math.sin(atk * Math.PI) * 3.2) : 0.25 + Math.sin(wk) * -0.4;
  ctx.rotate(swing);
  limb(ctx, 0, 0, 0, 15 * s, 5 * s * big, arms);
  ctx.fillStyle = hands; ctx.beginPath(); ctx.arc(0, 16 * s, 3 * s, 0, 7); ctx.fill();
  ctx.translate(0, 16 * s);
  drawWeapon(ctx, L.weapon, s, L.weaponColor, L.weaponGlow, t);
  ctx.restore();
  // shield on back arm side (drawn in front for readability)
  if (L.shield) {
    ctx.fillStyle = L.shield; ctx.strokeStyle = L.shieldTrim || '#ccc'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(-14 * s, -38 * s); ctx.lineTo(-4 * s, -38 * s); ctx.lineTo(-4 * s, -24 * s); ctx.quadraticCurveTo(-9 * s, -16 * s, -14 * s, -24 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (a.hurt > 0) glowAt(ctx, 0, -24 * s, 30 * s, '#ff2a1a', a.hurt * 0.7);
  ctx.restore();
}

function drawWeapon(ctx, w, s, col, glow, t) {
  if (!w) return;
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  switch (w) {
    case 'sword': case 'dagger': {
      const len = (w === 'dagger' ? 14 : 30) * s;
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-1.5 * s, -2 * s, 3 * s, 6 * s);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(-5 * s, 3 * s, 10 * s, 2.5 * s);
      const g = ctx.createLinearGradient(-2 * s, 0, 2 * s, 0); g.addColorStop(0, col || '#d8dce8'); g.addColorStop(1, shade(col || '#d8dce8', -0.4));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-2.4 * s, 5 * s); ctx.lineTo(2.4 * s, 5 * s); ctx.lineTo(0, 5 * s + len); ctx.fill();
      break;
    }
    case 'axe': case 'club': {
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-1.8 * s, -4 * s, 3.6 * s, 30 * s);
      if (w === 'axe') { ctx.fillStyle = col || '#b8bcc8'; ctx.beginPath(); ctx.moveTo(0, 16 * s); ctx.quadraticCurveTo(16 * s, 18 * s, 14 * s, 30 * s); ctx.lineTo(0, 26 * s); ctx.fill(); }
      else { ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.ellipse(0, 24 * s, 5 * s, 9 * s, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'spear': case 'trident': {
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-1.2 * s, -24 * s, 2.4 * s, 54 * s);
      ctx.fillStyle = '#ccd'; ctx.beginPath(); ctx.moveTo(-3 * s, -24 * s); ctx.lineTo(3 * s, -24 * s); ctx.lineTo(0, -36 * s); ctx.fill();
      break;
    }
    case 'staff': {
      ctx.fillStyle = '#4a2e18'; ctx.fillRect(-1.5 * s, -30 * s, 3 * s, 50 * s);
      ctx.fillStyle = col || '#8af'; ctx.beginPath(); ctx.arc(0, -32 * s, 4.5 * s, 0, 7); ctx.fill();
      glowAt(ctx, 0, -32 * s, 14 * s, col || '#8af', 0.6 + Math.sin(t * 5) * 0.2);
      break;
    }
    case 'bow': {
      ctx.strokeStyle = col || '#8a5a2a'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(-6 * s, 2 * s, 20 * s, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-6 * s + Math.cos(-1.1) * 20 * s, 2 * s + Math.sin(-1.1) * 20 * s); ctx.lineTo(-6 * s + Math.cos(1.1) * 20 * s, 2 * s + Math.sin(1.1) * 20 * s); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawAura(ctx, lvl, t, s) {
  // MU-style glowing equipment: +7 blue sheen, +9 brighter, +11 gold sparks, +13 rainbow
  const col = lvl >= 13 ? `hsl(${(t * 120) % 360},100%,65%)` : lvl >= 11 ? '#ffd860' : lvl >= 9 ? '#7fc8ff' : '#5a8aff';
  glowAt(ctx, 0, -28 * s, (lvl >= 11 ? 40 : 30) * s, col, lvl >= 9 ? 0.45 : 0.28);
  if (lvl >= 11) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = t * 2 + i * 0.785, r = 16 * s;
      ctx.fillStyle = col; ctx.globalAlpha = 0.6 + Math.sin(t * 6 + i) * 0.3;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, -28 * s + Math.sin(a) * r * 1.6, 1.8 * s, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

function drawBeast(ctx, x, y, L, a) {
  const s = L.scale || 1, wk = a.walk || 0, t = a.t;
  shadowAt(ctx, x, y, 22 * s);
  ctx.save(); ctx.translate(x, y); ctx.scale(a.dir || 1, 1);
  if (a.alpha != null) ctx.globalAlpha = a.alpha;
  if (L.glow) glowAt(ctx, 0, -18 * s, 30 * s, L.glow, 0.35);
  const lg = Math.sin(wk) * 6 * s;
  [[-12, lg], [-6, -lg], [8, -lg], [14, lg]].forEach(([lx, sw]) => limb(ctx, lx * s, -14 * s, lx * s + sw, -1 * s, 4.5 * s, shade(L.c1, -0.3)));
  ctx.strokeStyle = L.c1; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-18 * s, -20 * s); ctx.quadraticCurveTo(-28 * s, -26 * s + Math.sin(t * 6) * 4, -30 * s, -34 * s); ctx.stroke();
  const g = ctx.createLinearGradient(0, -30 * s, 0, -8 * s); g.addColorStop(0, shade(L.c1, 0.2)); g.addColorStop(1, shade(L.c1, -0.3));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -19 * s, 20 * s, 9 * s, 0, 0, 7); ctx.fill();
  matOverlay(ctx, 'grain', 0.9);
  const atk = a.atk || 0, hx = 20 * s + atk * 8 * s;
  ctx.fillStyle = L.c1; ctx.beginPath(); ctx.ellipse(hx, -25 * s, 9 * s, 7 * s, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = L.c2; ctx.beginPath(); ctx.moveTo(hx + 4 * s, -24 * s); ctx.lineTo(hx + 15 * s, -21 * s + atk * 4); ctx.lineTo(hx + 4 * s, -18 * s); ctx.fill();
  ctx.fillStyle = L.glow || '#ff3'; ctx.fillRect(hx + 2 * s, -28 * s, 2.5 * s, 2 * s);
  ctx.fillStyle = shade(L.c1, -0.2); ctx.beginPath(); ctx.moveTo(hx - 5 * s, -30 * s); ctx.lineTo(hx - 2 * s, -38 * s); ctx.lineTo(hx + 1 * s, -30 * s); ctx.fill();
  if (L.horns) { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.moveTo(hx, -31 * s); ctx.lineTo(hx + 6 * s, -42 * s); ctx.lineTo(hx + 3 * s, -30 * s); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(-2 * s, -24 * s, 14 * s, 3 * s, 0, 0, 7); ctx.fill();
  if (a.hurt > 0) glowAt(ctx, 0, -24 * s, 30 * s, '#ff2a1a', a.hurt * 0.7);
  ctx.restore();
}

function drawFlyer(ctx, x, y, L, a) {
  const s = L.scale || 1, t = a.t;
  const hover = 18 * s + Math.sin(t * 3 + x) * 4;
  shadowAt(ctx, x, y, 14 * s);
  ctx.save(); ctx.translate(x, y - hover); ctx.scale(a.dir || 1, 1);
  if (a.alpha != null) ctx.globalAlpha = a.alpha;
  const flap = Math.sin(t * 12) * 0.6;
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.rotate(sd * flap * 0.5);
    ctx.fillStyle = shade(L.c2, -0.1); ctx.beginPath();
    ctx.moveTo(0, -14 * s); ctx.quadraticCurveTo(sd * 10 * s, -42 * s, sd * 28 * s, -36 * s); ctx.quadraticCurveTo(sd * 18 * s, -24 * s, sd * 4 * s, -10 * s); ctx.fill();
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, -24 * s, 0, 0); g.addColorStop(0, shade(L.c1, 0.2)); g.addColorStop(1, shade(L.c1, -0.3));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -12 * s, 13 * s, 9 * s, 0, 0, 7); ctx.fill();
  matOverlay(ctx, 'scales', 0.7);
  ctx.beginPath(); ctx.ellipse(12 * s + (a.atk || 0) * 6 * s, -18 * s, 7 * s, 6 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff3'; ctx.fillRect(14 * s, -21 * s, 2.5 * s, 2.5 * s);
  ctx.strokeStyle = L.c1; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-12 * s, -10 * s); ctx.quadraticCurveTo(-22 * s, -4 * s, -26 * s + Math.sin(t * 5) * 3, -14 * s); ctx.stroke();
  if (a.hurt > 0) glowAt(ctx, 0, -24 * s, 30 * s, '#ff2a1a', a.hurt * 0.7);
  ctx.restore();
}

function drawBug(ctx, x, y, L, a) {
  const s = L.scale || 1, wk = a.walk || 0, t = a.t;
  shadowAt(ctx, x, y, 18 * s);
  ctx.save(); ctx.translate(x, y); ctx.scale(a.dir || 1, 1);
  if (a.alpha != null) ctx.globalAlpha = a.alpha;
  if (L.worm) {
    for (let i = 5; i >= 0; i--) {
      const ox = -i * 6 * s, oy = -6 * s - Math.abs(Math.sin(wk * 0.7 + i * 0.8)) * 4 * s - (i === 0 ? (a.atk || 0) * 8 : 0);
      ctx.fillStyle = i % 2 ? L.c1 : L.c2; ctx.beginPath(); ctx.ellipse(ox + 10 * s, oy, 7 * s, 6 * s, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#300'; ctx.beginPath(); ctx.arc(15 * s, -8 * s, 2.5 * s, 0, 7); ctx.fill();
  } else {
    const n = (L.legs || 6) / 2;
    for (let i = 0; i < n; i++) {
      const lx = (-8 + i * (16 / Math.max(1, n - 1))) * s, sw = Math.sin(wk * 2 + i) * 3 * s;
      ctx.strokeStyle = shade(L.c1, -0.3); ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(lx, -8 * s); ctx.lineTo(lx - 6 * s + sw, -14 * s); ctx.lineTo(lx - 10 * s + sw, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, -8 * s); ctx.lineTo(lx + 6 * s - sw, -14 * s); ctx.lineTo(lx + 10 * s - sw, 0); ctx.stroke();
    }
    const g = ctx.createRadialGradient(-4 * s, -14 * s, 2, 0, -10 * s, 16 * s); g.addColorStop(0, L.c2); g.addColorStop(1, L.c1);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-4 * s, -10 * s, 12 * s, 8 * s, 0, 0, 7); ctx.fill();
    matOverlay(ctx, 'scales', 0.8);
    { const sp = ctx.createRadialGradient(-8 * s, -15 * s, 0, -8 * s, -15 * s, 6 * s); sp.addColorStop(0, 'rgba(255,255,255,0.45)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sp; ctx.fill(); }
    ctx.fillStyle = L.c1; ctx.beginPath(); ctx.ellipse(9 * s + (a.atk || 0) * 5 * s, -9 * s, 6 * s, 5 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f22'; ctx.fillRect(11 * s, -11 * s, 2 * s, 2 * s); ctx.fillRect(13 * s, -10 * s, 1.5 * s, 1.5 * s);
    if (L.shell) { ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.moveTo(-4 * s, -18 * s); ctx.lineTo(-4 * s, -2 * s); ctx.stroke(); }
    if (L.tail) { ctx.strokeStyle = L.c2; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(-14 * s, -10 * s); ctx.quadraticCurveTo(-26 * s, -30 * s, -8 * s + Math.sin(t * 4) * 2, -32 * s); ctx.stroke(); }
  }
  if (a.hurt > 0) glowAt(ctx, 0, -24 * s, 30 * s, '#ff2a1a', a.hurt * 0.7);
  ctx.restore();
}

function drawGhost(ctx, x, y, L, a) {
  const s = L.scale || 1, t = a.t;
  const fl = 10 * s + Math.sin(t * 2.5 + x) * 4;
  shadowAt(ctx, x, y, 12 * s);
  ctx.save(); ctx.translate(x, y - fl); ctx.scale(a.dir || 1, 1);
  ctx.globalAlpha = (a.alpha != null ? a.alpha : 1) * 0.78;
  glowAt(ctx, 0, -26 * s, 32 * s, L.glow || '#cff', 0.4);
  const g = ctx.createLinearGradient(0, -50 * s, 0, 0); g.addColorStop(0, L.c2); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-12 * s, -30 * s); ctx.arc(0, -36 * s, 12 * s, Math.PI, 0);
  for (let i = 0; i <= 6; i++) ctx.lineTo(12 * s - i * 4 * s, (i % 2 ? -4 : 2) * s + Math.sin(t * 6 + i) * 2);
  ctx.fill();
  ctx.fillStyle = L.c1 === '#c8f0ff' ? '#124' : L.c2; ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(-3 * s, -38 * s, 2.5 * s, 3.5 * s, 0, 0, 7); ctx.ellipse(5 * s, -38 * s, 2.5 * s, 3.5 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = L.glow || '#f00'; ctx.fillRect(-3.5 * s, -39 * s, 1.5 * s, 1.5 * s); ctx.fillRect(4.5 * s, -39 * s, 1.5 * s, 1.5 * s);
  ctx.restore();
}

function drawMonsterShape(ctx, x, y, def, a) {
  const L = def.look;
  switch (def.shape) {
    case 'beast': return drawBeast(ctx, x, y, L, a);
    case 'flyer': return drawFlyer(ctx, x, y, L, a);
    case 'bug': return drawBug(ctx, x, y, L, a);
    case 'ghost': return drawGhost(ctx, x, y, L, a);
    default: return drawHumanoid(ctx, x, y, L, a);
  }
}
const SHAPE_HEIGHT = { beast: 40, flyer: 55, bug: 26, ghost: 62, humanoid: 66 };
