// ---------------------------------------------------------------------
// Core game: loop, map loading, combat, AI, rendering
// ---------------------------------------------------------------------
const G = {
  running: false, time: 0, map: null, maps: {}, player: null, monsters: [], npcs: [], drops: [],
  cam: { x: 0, y: 0 }, mouse: { x: 0, y: 0, down: false, right: false }, hover: null,
  held: null, helper: null, autosaveT: 0, slot: 0, moveMarker: null, weather: []
};
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- map
function loadMap(id, x, y) {
  if (!G.maps[id]) G.maps[id] = new GameMap(id);
  const m = G.maps[id]; G.map = m;
  const p = G.player; p.map = id;
  const def = m.def;
  if (x == null) {
    const s = def.town ? { x: def.town.x + 0.5, y: def.town.y + 3.5 } : def.entry;
    x = s.x; y = s.y;
  }
  if (!m.walk(Math.floor(x), Math.floor(y))) { const f = m.randomFloor(x, y, 0, 4); x = f.x; y = f.y; }
  p.x = x; p.y = y; p.path = null; p.target = null;
  G.npcs = (def.npcs || []).map(n => new NPC(n));
  G.monsters = [];
  for (const [mid, cnt, dmin, dmax] of def.spawns) {
    for (let i = 0; i < cnt; i++) {
      const pt = m.randomFloor(def.center.x, def.center.y, dmin, dmax);
      G.monsters.push(new Monster(mid, pt.x, pt.y, m));
    }
  }
  G.drops = []; FX.parts = []; FX.projs = []; FX.texts = []; FX.rings = [];
  G.weather = [];
  UI.buildMinimap(m);
  UI.msg(`${def.name}에 입장했습니다.`, 'sys');
  UI.mapBanner(def.name);
  G.cam = iso(p.x, p.y);
  for (const [cx, cy] of m.visibleChunks(G.cam, W, H, 0)) m.getChunk(cx, cy);
  prewarm3D();
}
function returnToTown() {
  const p = G.player;
  const home = MAPS[p.map].town ? p.map : (p.cls === 'FE' ? 'noria' : p.map === 'devias' ? 'devias' : 'lorencia');
  SFX.play('warp'); loadMap(home);
}

// ---------------------------------------------------------------- helpers
function inTown(x, y) { return G.map.inTown(Math.floor(x), Math.floor(y)); }
function monstersNear(x, y, r) { return G.monsters.filter(m => !m.dead && dist(m.x, m.y, x, y) <= r); }
function screenOf(x, y, z = 0) { const p = iso(x, y); return { x: p.x - G.cam.x + W / 2, y: p.y - G.cam.y + H / 2 - z }; }
function worldOf(sx, sy) { return unIso(sx - W / 2 + G.cam.x, sy - H / 2 + G.cam.y); }

function pathTo(p, tx, ty) {
  if (clearLine(G.map, p.x, p.y, tx, ty)) { p.path = [{ x: tx, y: ty }]; return true; }
  const path = findPath(G.map, p.x, p.y, tx, ty);
  if (path && path.length) {
    path[path.length - 1] = G.map.walk(Math.floor(tx), Math.floor(ty)) ? { x: tx, y: ty } : path[path.length - 1];
    // string-pulling: skip waypoints that are directly reachable, so paths are straight lines instead of tile zig-zags
    const pts = [{ x: p.x, y: p.y }, ...path], out = [];
    for (let i = 0; i < pts.length - 1;) {
      let j = pts.length - 1;
      while (j > i + 1 && !clearLine(G.map, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]); i = j;
    }
    p.path = out; return true;
  }
  return false;
}

// ---------------------------------------------------------------- combat
function hitChance(ar, dr) { return clamp(ar / (ar + dr * 0.6 + 1), 0.15, 0.97); }

function playerDamage(m, skill) {
  const p = G.player, r = p.statsCache, d = m.def;
  if (!chance(hitChance(p.atkRate, d.dr))) { FX.text(m.x, m.y, 'MISS', '#bbb'); return 0; }
  const magic = skill && p.cls === 'DW' && skill.type !== 'melee';
  let lo = magic ? p.wizMin : p.minDmg, hi = magic ? p.wizMax : p.maxDmg;
  let base = rand(lo, hi), kind = 'n';
  if (chance(r.excRate)) { base = hi * 1.2; kind = 'e'; }
  else if (chance(r.crit)) { base = hi; kind = 'c'; }
  if (skill) {
    base += skill.add || 0;
    if (p.cls === 'DK') base *= p.C.skillMult(p.stats);
    base *= 1 + r.skillBonus;
  }
  let dmg = base - d.def;
  if (dmg < base * 0.1) dmg = Math.max(1, base * 0.1);
  dmg = Math.round(dmg);
  if (chance(0.04) && p.lvl >= 30) { dmg *= 2; kind = 'd'; }
  applyMonsterDamage(m, dmg, kind);
  return dmg;
}
function applyMonsterDamage(m, dmg, kind) {
  if (m.dead) return;
  m.hp -= dmg; m.anim.hurt = 1; m.lastHit = G.time; m.state = 'chase';
  const col = kind === 'e' ? '#4cff9a' : kind === 'c' ? '#6ab8ff' : kind === 'd' ? '#ff66ff' : '#ffb347';
  FX.text(m.x, m.y, (kind === 'd' ? '더블 ' : '') + dmg, col, kind !== 'n');
  FX.spark(m.x, m.y, 30, kind === 'e' ? '#7f7' : '#fc6', 6, 1.5, 0.35, 2);
  SFX.play(kind === 'n' ? 'hit' : 'crit');
  if (m.hp <= 0) killMonster(m);
}
function killMonster(m) {
  const p = G.player, d = m.def;
  m.hp = 0; m.dead = true; m.respawnT = d.respawn || rand(8, 14); m.fade = 1;
  SFX.play('die');
  // exp
  let exp = (d.lv + 25) * d.lv / 3;
  const diff = p.lvl - d.lv - 10;
  if (diff > 0) exp *= Math.max(0.08, 1 - diff * 0.05);
  exp = Math.max(1, Math.floor(exp * EXP_RATE * (d.boss ? 4 : 1)));
  gainExp(exp);
  if (p.statsCache.hpKill) p.hp = Math.min(p.maxHp, p.hp + p.maxHp / 8);
  if (p.statsCache.mpKill) p.mp = Math.min(p.maxMp, p.mp + p.maxMp / 8);
  // drops
  for (const dr of rollDrops(m, p)) {
    const a = Math.random() * 6.28, rr = Math.random() * (d.boss ? 2.5 : 0.8);
    let x = m.x + Math.cos(a) * rr, y = m.y + Math.sin(a) * rr;
    if (!G.map.walk(Math.floor(x), Math.floor(y))) { x = m.x; y = m.y; }
    G.drops.push({ x, y, zen: dr.zen, item: dr.zen ? null : dr, t: G.time });
    if (!dr.zen && (dr.exc && dr.exc.length || idef(dr).kind === 'jewel')) FX.pillar(x, y, dr.exc && dr.exc.length ? '#6f6' : '#ffd36a', 25);
  }
  if (d.boss) UI.msg(`★ ${d.name}(을)를 처치했습니다! ★`, 'gold');
  if (p.target === m) p.target = null;
}
function gainExp(n) {
  const p = G.player;
  if (p.lvl >= MAX_LEVEL) return;
  p.exp += n;
  UI.msg(`경험치 ${fmt(n)}을(를) 획득했습니다.`, 'exp');
  let up = false;
  while (p.exp >= p.expNeeded() && p.lvl < MAX_LEVEL) {
    p.lvl++; p.pts += 5; up = true;
    const fresh = Object.keys(SKILLS).filter(k => SKILLS[k].cls === p.cls && SKILLS[k].lv === p.lvl);
    fresh.forEach(k => { if (!p.hotbar.includes(k)) p.hotbar.push(k); UI.msg(`새로운 스킬 [${SKILLS[k].name}]을(를) 습득했습니다!`, 'gold'); });
  }
  if (up) {
    p.calc(); p.hp = p.maxHp; p.mp = p.maxMp;
    FX.pillar(p.x, p.y, '#ffd860', 60); FX.ring(p.x, p.y, '#ffd860', 2.5, 0.8, 5);
    SFX.play('levelup');
    UI.msg(`레벨 업! 현재 레벨 ${p.lvl} (스탯 포인트 +5)`, 'gold');
    UI.levelUp(p.lvl);
    saveGame();
  }
  UI.dirty = true;
}
function playerHurt(raw, src) {
  const p = G.player; if (p.dead) return;
  const r = p.statsCache;
  let dmg = raw - p.def;
  if (dmg < raw * 0.08) dmg = Math.max(1, raw * 0.08);
  dmg *= 1 - Math.min(0.6, r.reduce) - r.absorb;
  if (p.buffs.barrier) dmg *= 1 - p.buffs.barrier.v;
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg; p.anim.hurt = 1;
  FX.text(p.x, p.y, dmg, '#ff4040');
  SFX.play('hurt');
  if (r.reflect && src && !src.dead) applyMonsterDamage(src, Math.max(1, Math.round(raw * r.reflect)), 'n');
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.deadT = 3; p.target = null; p.path = null;
    const loss = Math.floor((p.expNeeded() - expTotal(p.lvl)) * 0.02);
    p.exp = Math.max(expTotal(p.lvl), p.exp - loss);
    UI.msg(`사망했습니다. 경험치 ${fmt(loss)}을(를) 잃었습니다.`, 'warn');
  }
  if (G.helper && p.hp < p.maxHp * 0.5) usePotion('hp');
}

// ---------------- skills / attacks
function canUseSkill(id) {
  const p = G.player, s = SKILLS[id];
  if (!s || s.lv > p.lvl) return false;
  if (p.mp < s.mp) { UI.msg('마나가 부족합니다.', 'warn'); return false; }
  return true;
}
function skillRange(s) {
  const p = G.player;
  if (!s) return p.C.range;
  return s.range || (s.type === 'aoe_self' ? s.radius * 0.8 : p.C.range);
}
function faceTo(p, x, y) {
  const sx = iso(x, y).x - iso(p.x, p.y).x; if (Math.abs(sx) > 1) p.anim.dir = sx > 0 ? 1 : -1;
  if (Math.abs(x - p.x) + Math.abs(y - p.y) > 0.01) p.anim.ang = Math.atan2(y - p.y, x - p.x);
}

function doAttack(targetMon, skillId, point) {
  const p = G.player, s = skillId ? SKILLS[skillId] : null;
  if (s && !canUseSkill(skillId)) return false;
  if (s) p.mp -= s.mp;
  p.cd = p.attackInterval(); p.anim.atk = 1;
  p.anim.atkKind = s && s.type === 'aoe_self' && p.cls === 'DK' ? 'spin' : s && (p.cls === 'DW' || ['buff', 'heal'].includes(s.type)) ? 'cast' : null;
  const tx = targetMon ? targetMon.x : point.x, ty = targetMon ? targetMon.y : point.y;
  faceTo(p, tx, ty);
  if (!s) {
    if (p.cls === 'FE') { spawnProj(p.x, p.y, targetMon, '#fff1a8', 'arrow', m => playerDamage(m, null)); SFX.play('arrow'); }
    else { SFX.play('swing'); setTimeout(() => targetMon && !targetMon.dead && playerDamage(targetMon, null), 120); }
    return true;
  }
  switch (s.type) {
    case 'melee':
      SFX.play('swing');
      FX.spark(tx, ty, 40, s.color, 14, 2.5, 0.4, 3);
      if (skillId === 'death_stab') FX.ring(tx, ty, s.color, 1.5, 0.4, 6);
      setTimeout(() => targetMon && !targetMon.dead && playerDamage(targetMon, s), 120);
      break;
    case 'proj':
      SFX.play(skillId === 'fire_ball' ? 'fire' : skillId === 'energy_ball' ? 'magic' : 'arrow');
      spawnProj(p.x, p.y, targetMon || point, s.color, skillId, m => { playerDamage(m, s); if (s.freeze) m.frozen = 2; }, s.pierce);
      break;
    case 'multi':
      SFX.play('arrow');
      for (const off of [-0.25, 0, 0.25]) {
        const ang = Math.atan2(ty - p.y, tx - p.x) + off;
        spawnProj(p.x, p.y, { x: p.x + Math.cos(ang) * 7, y: p.y + Math.sin(ang) * 7 }, s.color, 'arrow', m => playerDamage(m, s));
      }
      break;
    case 'bolt':
      SFX.play('bolt');
      FX.projs.push({ type: 'bolt', x: p.x, y: p.y, tx, ty, life: 0.25, col: s.color });
      if (targetMon) setTimeout(() => !targetMon.dead && playerDamage(targetMon, s), 60);
      break;
    case 'aoe_self':
      SFX.play(skillId === 'twisting' ? 'swing' : 'fire');
      FX.ring(p.x, p.y, s.color, s.radius, 0.6, 8);
      if (skillId === 'evil_spirit') for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; FX.projs.push({ type: 'spirit', x: p.x, y: p.y, a, life: 0.9, col: s.color }); }
      if (skillId === 'hellfire') for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, d = Math.random() * s.radius; FX.parts.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, z: 0, vx: 0, vy: 0, vz: rand(60, 140), life: rand(0.4, 0.9), max: 0.9, col: pick(['#ff4a1a', '#ffb030', '#ff7a2a']), size: rand(3, 6), g: 0 }); }
      if (skillId === 'twisting') for (let i = 0; i < 3; i++) FX.ring(p.x, p.y, '#cfefff', s.radius * (0.4 + i * 0.3), 0.3 + i * 0.12, 3);
      monstersNear(p.x, p.y, s.radius).forEach((m, i) => setTimeout(() => !m.dead && playerDamage(m, s), 80 + i * 30));
      break;
    case 'aoe_target':
      if (skillId === 'meteorite') {
        FX.projs.push({ type: 'meteor', x: tx + 1.5, y: ty - 1.5, tx, ty, z: 260, life: 0.45, max: 0.45, col: s.color });
        setTimeout(() => { SFX.play('fire'); FX.ring(tx, ty, '#ff9a3a', s.radius, 0.5, 7); FX.spark(tx, ty, 10, '#ffb050', 30, 3, 0.7, 4); monstersNear(tx, ty, s.radius).forEach(m => playerDamage(m, s)); }, 450);
      } else if (skillId === 'ice_storm') {
        for (let i = 0; i < 14; i++) setTimeout(() => FX.projs.push({ type: 'meteor', x: tx + rand(-2, 2) + 1, y: ty + rand(-2, 2) - 1, tx: tx + rand(-1.5, 1.5), ty: ty + rand(-1.5, 1.5), z: 200, life: 0.3, max: 0.3, col: '#cff', small: true }), i * 40);
        setTimeout(() => { SFX.play('bolt'); FX.ring(tx, ty, '#aef3ff', s.radius, 0.6, 6); monstersNear(tx, ty, s.radius).forEach(m => { playerDamage(m, s); m.frozen = 1.5; }); }, 450);
      } else { // rageful blow
        SFX.play('crit');
        for (let i = 0; i < 3; i++) setTimeout(() => { FX.ring(tx, ty, '#ff6a2b', s.radius * (0.5 + i * 0.25), 0.4, 7); FX.spark(tx, ty, 0, '#a86a3a', 18, 3, 0.6, 4); }, i * 120);
        setTimeout(() => monstersNear(tx, ty, s.radius).forEach(m => playerDamage(m, s)), 200);
      }
      break;
    case 'buff': {
      SFX.play('buff');
      const e = p.stats.ene;
      const v = s.buff === 'gdef' ? 2 + Math.floor(e / 8) : s.buff === 'gdmg' ? 3 + Math.floor(e / 7) : s.buff === 'barrier' ? Math.min(0.5, 0.1 + e / 2000) : Math.min(1, 0.12 + p.stats.vit / 1000 + e / 2000);
      p.buffs[s.buff] = { v, t: s.dur, name: s.name, icon: s.icon };
      p.calc(); FX.pillar(p.x, p.y, s.color, 30); UI.msg(`${s.name} 효과가 적용되었습니다.`, 'sys');
      break;
    }
    case 'heal':
      SFX.play('buff');
      p.hp = Math.min(p.maxHp, p.hp + 5 + p.stats.ene / 5 * 1.0 + p.maxHp * 0.08);
      FX.pillar(p.x, p.y, s.color, 25);
      break;
    case 'teleport':
      if (point && G.map.walk(Math.floor(point.x), Math.floor(point.y)) && dist(p.x, p.y, point.x, point.y) <= s.range) {
        SFX.play('warp'); FX.pillar(p.x, p.y, s.color, 25); p.x = point.x; p.y = point.y; p.path = null; FX.pillar(p.x, p.y, s.color, 25);
      } else { p.mp += s.mp; UI.msg('그곳으로 이동할 수 없습니다.', 'warn'); }
      break;
  }
  return true;
}
function spawnProj(x, y, target, col, kind, onHit, pierce) {
  const isMon = target instanceof Monster;
  const tx = target.x, ty = target.y;
  const a = Math.atan2(ty - y, tx - x);
  FX.projs.push({ type: 'proj', kind, x, y, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, target: isMon ? target : null, col, onHit, pierce, hit: new Set(), life: 0.8 });
}

// ---------------- player input actions
function useActive(point) {
  const p = G.player;
  const sid = p.activeSkill;
  if (!sid) return;
  const s = SKILLS[sid];
  if (['buff', 'heal'].includes(s.type)) { if (p.cd <= 0) doAttack(null, sid, { x: p.x, y: p.y }); return; }
  if (s.type === 'aoe_self') { if (p.cd <= 0) doAttack(null, sid, { x: p.x, y: p.y }); return; }
  if (s.type === 'teleport') { if (p.cd <= 0) doAttack(null, sid, point); return; }
  const m = G.hover && G.hover.kind === 'mon' ? G.hover.ref : null;
  if (m) { p.target = m; p.pendingSkill = sid; return; }
  if (p.cd <= 0 && ['proj', 'multi', 'aoe_target', 'bolt'].includes(s.type) && s.type !== 'bolt') {
    const d = dist(p.x, p.y, point.x, point.y);
    if (s.type === 'aoe_target' && d > s.range) return;
    p.path = null; doAttack(null, sid, point);
  }
}
function usePotion(kind) {
  const p = G.player;
  const order = kind === 'hp' ? ['hp_large', 'hp_medium', 'hp_small', 'apple'] : ['mp_large', 'mp_medium', 'mp_small'];
  for (const id of order) {
    const e = p.inv.find(s => s.item.id === id);
    if (e) { consume(e); return true; }
  }
  return false;
}
function consume(entry) {
  const p = G.player, d = idef(entry.item);
  if (d.kind === 'potion') {
    if (d.heal) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * d.heal + 10);
    if (d.mana) p.mp = Math.min(p.maxMp, p.mp + p.maxMp * d.mana + 5);
    SFX.play('potion');
    FX.spark(p.x, p.y, 30, d.heal ? '#f66' : '#6af', 10, 1, 0.5, 2.5);
  } else if (d.kind === 'scroll') { returnToTown(); }
  else return false;
  entry.item.qty--;
  if (entry.item.qty <= 0) p.inv.splice(p.inv.indexOf(entry), 1);
  UI.dirty = true;
  return true;
}
function pickupDrop(dr) {
  const p = G.player;
  if (dr.zen) { p.zen += dr.zen; SFX.play('zen'); UI.msg(`${fmt(dr.zen)} 젠을 획득했습니다.`, 'zen'); }
  else {
    if (!Inv.add(p.inv, dr.item)) { UI.msg('인벤토리 공간이 부족합니다.', 'warn'); return false; }
    SFX.play('pickup'); UI.msg(`${itemName(dr.item)}을(를) 획득했습니다.`, dr.item.exc.length ? 'exc' : idef(dr.item).kind === 'jewel' ? 'gold' : 'item');
  }
  G.drops.splice(G.drops.indexOf(dr), 1);
  UI.dirty = true;
  return true;
}

// ---------------------------------------------------------------- update
function moveAlong(e, speed, dt) {
  if (!e.path || !e.path.length) return false;
  const n = e.path[0];
  const d = dist(e.x, e.y, n.x, n.y), step = speed * dt;
  faceTo(e, n.x, n.y);
  const moved = Math.min(d, step);
  if (d <= step) { e.x = n.x; e.y = n.y; e.path.shift(); if (!e.path.length) e.path = null; }
  else { e.x += (n.x - e.x) / d * step; e.y += (n.y - e.y) / d * step; }
  // gait phase advances with distance travelled so feet don't slide
  const before = e.anim.walk || 0;
  e.anim.walk = before + moved / 2.1 * Math.PI * 2; e.anim.moving = true;
  if (e === G.player && Math.floor(before / Math.PI) !== Math.floor(e.anim.walk / Math.PI) && G.map.theme !== 'water') {
    const dc = { snow: '#e8f0ff', dungeon: '#6a5a4a', tower: '#5a4a6a' }[G.map.theme] || '#9a8462';
    for (let i = 0; i < 3; i++) FX.parts.push({ x: e.x + rand(-0.15, 0.15), y: e.y + rand(-0.15, 0.15), z: 2, vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: rand(8, 20), life: 0.5, max: 0.5, col: dc, size: rand(1.5, 3), g: 20, dust: true });
  }
  return true;
}
function updatePlayer(dt) {
  const p = G.player;
  p.cd -= dt; p.anim.atk = Math.max(0, p.anim.atk - dt * 2.2); p.anim.hurt = Math.max(0, p.anim.hurt - dt * 3);
  if (p.dead) {
    p.deadT -= dt; p.anim.moving = false;
    p.anim.death = Math.min(1, (p.anim.death || 0) + dt * 1.4);
    tickAnim(p, dt, 0);
    if (p.deadT <= 0) { p.dead = false; p.anim.death = 0; p.calc(); p.hp = p.maxHp; p.mp = p.maxMp; returnToTown(); }
    return;
  }
  // buffs
  let changed = false;
  for (const k in p.buffs) { p.buffs[k].t -= dt; if (p.buffs[k].t <= 0) { delete p.buffs[k]; changed = true; UI.msg('버프 효과가 사라졌습니다.', 'sys'); } }
  if (changed) p.calc();
  // regen
  const town = inTown(p.x, p.y);
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * (town ? 0.04 : 0.004) * dt);
  p.mp = Math.min(p.maxMp, p.mp + p.maxMp * (town ? 0.06 : 0.025) * dt + 0.3 * dt);
  // hold-to-move
  if (G.mouse.down && !p.target && !G.held && !G.mouse.onUI && G.moveHoldT !== undefined) {
    G.moveHoldT -= dt;
    if (G.moveHoldT <= 0) { G.moveHoldT = 0.22; const w = worldOf(G.mouse.x, G.mouse.y); pathTo(p, w.x, w.y); }
  }
  // targets
  const t = p.target;
  if (t) {
    if (t instanceof Monster) {
      if (t.dead) { p.target = null; p.pendingSkill = null; }
      else if (inTown(p.x, p.y) && inTown(t.x, t.y)) { p.target = null; }
      else {
        const s = p.pendingSkill ? SKILLS[p.pendingSkill] : null;
        const rng = skillRange(s);
        const d = dist(p.x, p.y, t.x, t.y);
        if (d > rng) { if (!p.path || (p.repathT = (p.repathT || 0) - dt) <= 0) { pathTo(p, t.x, t.y); p.repathT = 0.4; } }
        else {
          p.path = null;
          if (p.cd <= 0) {
            const ok = doAttack(t, p.pendingSkill, null);
            if (!ok) p.pendingSkill = null;
            // a single right-click casts once; holding it (or the helper) keeps casting
            else if (s && !G.mouse.right && !G.helper) { p.pendingSkill = null; p.target = null; }
          }
        }
      }
    } else if (t.kind === 'npc') {
      if (dist(p.x, p.y, t.ref.x, t.ref.y) < 2) { p.path = null; p.target = null; UI.openNpc(t.ref); faceTo(p, t.ref.x, t.ref.y); }
    } else if (t.kind === 'drop') {
      if (!G.drops.includes(t.ref)) p.target = null;
      else if (dist(p.x, p.y, t.ref.x, t.ref.y) < 0.9) { p.path = null; p.target = null; pickupDrop(t.ref); }
    }
  }
  p.anim.moving = false;
  moveAlong(p, 4.6, dt);
  tickAnim(p, dt, 4.6);
  // auto zen pickup
  for (const dr of G.drops) if (dr.zen && dist(p.x, p.y, dr.x, dr.y) < 0.8) { pickupDrop(dr); break; }
  updateHelper(dt);
}

function updateHelper(dt) {
  const h = G.helper, p = G.player;
  if (!h || p.dead) return;
  if (p.mp < p.maxMp * 0.2) usePotion('mp');
  if (dist(p.x, p.y, h.x, h.y) > 12 && !p.target) { pathTo(p, h.x, h.y); return; }
  if (!p.target && !p.path) {
    const it = G.drops.filter(d => d.item && dist(d.x, d.y, p.x, p.y) < 5).sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
    if (it && Inv.findSpace(p.inv, it.item)) { p.target = { kind: 'drop', ref: it }; pathTo(p, it.x, it.y); return; }
    const ms = monstersNear(h.x, h.y, 9).filter(m => !inTown(m.x, m.y)).sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y));
    if (ms.length) {
      p.target = ms[0];
      const s = p.activeSkill && SKILLS[p.activeSkill];
      if (s && ['melee', 'proj', 'multi', 'bolt', 'aoe_target'].includes(s.type) && p.mp >= s.mp) p.pendingSkill = p.activeSkill;
      else if (s && s.type === 'aoe_self' && p.mp >= s.mp && monstersNear(p.x, p.y, s.radius).length >= 2 && p.cd <= 0) doAttack(null, p.activeSkill, { x: p.x, y: p.y });
    }
  }
}

function updateMonsters(dt) {
  const p = G.player, map = G.map;
  for (const m of G.monsters) {
    const d = m.def;
    m.anim.atk = Math.max(0, m.anim.atk - dt * 2.2); m.anim.hurt = Math.max(0, m.anim.hurt - dt * 3); m.anim.moving = false;
    tickAnim(m, dt, 0);
    if (m.dead) {
      // play the death animation first, then fade the corpse out
      m.anim.death = Math.min(1, (m.anim.death || 0) + dt * 1.6);
      if (m.anim.death >= 1) m.fade = Math.max(0, m.fade - dt * 0.7);
      m.respawnT -= dt;
      if (m.respawnT <= 0) {
        const pt = map.randomFloor(m.sx, m.sy, 0, 3);
        m.spawn(pt.x, pt.y);
        if (d.boss) UI.msg(`${d.name}(이)가 ${map.def.name}에 나타났습니다!`, 'warn');
      }
      continue;
    }
    if (m.frozen > 0) { m.frozen -= dt; continue; }
    m.cd -= dt;
    const dp = dist(m.x, m.y, p.x, p.y);
    const pTown = inTown(p.x, p.y);
    const passive = d.lv <= 4 && G.time - m.lastHit > 8;
    const leash = dist(m.x, m.y, m.sx, m.sy);
    if (m.state === 'return') {
      if (leash < 1) { m.state = 'idle'; m.hp = d.hp; }
    } else if (!p.dead && !pTown && (dp < d.view && !passive || m.state === 'chase')) {
      m.state = 'chase';
      if (leash > 14 || dp > 16) m.state = 'return';
    } else if (m.state === 'chase') m.state = 'return';
    let tx = null, ty = null, spd = d.speed;
    if (m.state === 'chase') {
      if (dp <= d.range + 0.3) {
        faceTo(m, p.x, p.y);
        if (m.cd <= 0) {
          m.cd = d.delay / 1000; m.anim.atk = 1;
          const raw = randi(d.min, d.max);
          const hit = chance(hitChance(d.ar, p.defRate));
          if (d.ranged) FX.projs.push({ type: 'mproj', x: m.x, y: m.y, tx: p.x, ty: p.y, t: 0, dur: dp / 10, col: d.ranged });
          const later = d.ranged ? dp / 10 * 1000 : 150;
          setTimeout(() => { if (G.player === p && !m.dead && !p.dead) { if (hit) playerHurt(raw, m); else FX.text(p.x, p.y, 'MISS', '#bbb'); } }, later);
        }
      } else { tx = p.x; ty = p.y; }
    } else if (m.state === 'return') { tx = m.sx; ty = m.sy; spd *= 1.4; m.hp = Math.min(d.hp, m.hp + d.hp * 0.2 * dt); }
    else {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = rand(2, 6); m.wx = m.sx + rand(-3, 3); m.wy = m.sy + rand(-3, 3); }
      if (dist(m.x, m.y, m.wx, m.wy) > 0.3) { tx = m.wx; ty = m.wy; spd *= 0.4; }
    }
    if (tx != null) {
      const dd = dist(m.x, m.y, tx, ty);
      if (dd > 0.05) {
        const vx = (tx - m.x) / dd * spd * dt, vy = (ty - m.y) / dd * spd * dt;
        const nx = m.x + vx, ny = m.y + vy;
        if (map.walk(Math.floor(nx), Math.floor(ny)) && !map.inTown(Math.floor(nx), Math.floor(ny))) { m.x = nx; m.y = ny; }
        else if (map.walk(Math.floor(nx), Math.floor(m.y)) && !map.inTown(Math.floor(nx), Math.floor(m.y))) m.x = nx;
        else if (map.walk(Math.floor(m.x), Math.floor(ny)) && !map.inTown(Math.floor(m.x), Math.floor(ny))) m.y = ny;
        else if (m.state === 'idle') m.wander = 0;
        faceTo(m, tx, ty);
        const moved = Math.hypot(vx, vy);
        m.anim.walk += moved / (1.25 * (m.def.look.scale || 1)) * Math.PI * 2; m.anim.moving = true;
      }
    }
  }
  // soft separation
  for (let i = 0; i < G.monsters.length; i++) {
    const a = G.monsters[i]; if (a.dead || a.state !== 'chase') continue;
    for (let j = i + 1; j < G.monsters.length; j++) {
      const b = G.monsters[j]; if (b.dead) continue;
      const dx = a.x - b.x, dy = a.y - b.y, dd = dx * dx + dy * dy;
      if (dd < 0.36 && dd > 0.0001) {
        const f = (0.6 - Math.sqrt(dd)) * 0.5, l = Math.sqrt(dd);
        const ax = a.x + dx / l * f, ay = a.y + dy / l * f;
        if (map.walk(Math.floor(ax), Math.floor(ay))) { a.x = ax; a.y = ay; }
      }
    }
  }
}

function updateProjectiles(dt) {
  for (const pr of FX.projs) {
    pr.life -= dt;
    if (pr.type === 'proj') {
      if (pr.target && !pr.target.dead) {
        const d = dist(pr.x, pr.y, pr.target.x, pr.target.y);
        const a = Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x);
        pr.vx = Math.cos(a) * 14; pr.vy = Math.sin(a) * 14;
        if (d < 0.5) { pr.onHit(pr.target); pr.hit.add(pr.target); if (!pr.pierce) { pr.life = 0; continue; } pr.target = null; }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (!G.map.walk(Math.floor(pr.x), Math.floor(pr.y))) { pr.life = 0; continue; }
      if (!pr.target) {
        for (const m of G.monsters) {
          if (m.dead || pr.hit.has(m)) continue;
          if (dist(m.x, m.y, pr.x, pr.y) < 0.6) { pr.onHit(m); pr.hit.add(m); if (!pr.pierce) { pr.life = 0; break; } }
        }
      }
      if (pr.kind === 'fire_ball' && Math.random() < 0.6) FX.parts.push({ x: pr.x, y: pr.y, z: 30, vx: 0, vy: 0, vz: 20, life: 0.3, max: 0.3, col: '#ff8a2a', size: 4, g: 0 });
    } else if (pr.type === 'mproj') pr.t += dt;
  }
  FX.projs = FX.projs.filter(p => p.life > 0 && !(p.type === 'mproj' && p.t >= p.dur));
}

function update(dt) {
  G.time += dt;
  updatePlayer(dt);
  updateMonsters(dt);
  for (const n of G.npcs) { n.anim.moving = false; tickAnim(n, dt, 0); }
  updateProjectiles(dt);
  FX.update(dt);
  G.drops = G.drops.filter(d => G.time - d.t < 90);
  // camera
  const tgt = iso(G.player.x, G.player.y);
  G.cam.x = lerp(G.cam.x, tgt.x, Math.min(1, dt * 10)); G.cam.y = lerp(G.cam.y, tgt.y - 30, Math.min(1, dt * 10));
  G.map.prefetch(G.cam, W, H);
  // hover
  updateHover();
  // weather
  const th = G.map.theme;
  if (th === 'snow' && G.weather.length < 160) G.weather.push({ x: rand(0, W), y: -10, v: rand(30, 70), s: rand(1, 3), w: rand(0, 6) });
  if (th === 'water' && G.weather.length < 50) G.weather.push({ x: rand(0, W), y: H + 10, v: -rand(20, 50), s: rand(2, 5), w: rand(0, 6) });
  if (th === 'tower' && G.weather.length < 40) G.weather.push({ x: rand(0, W), y: rand(0, H), v: -rand(5, 15), s: rand(1, 2.5), w: rand(0, 6), a: 0 });
  for (const f of G.weather) { f.y += f.v * dt; f.x += Math.sin(G.time + f.w) * 0.3; }
  G.weather = G.weather.filter(f => f.y < H + 20 && f.y > -20);
  G.autosaveT += dt;
  if (G.autosaveT > 20) { G.autosaveT = 0; saveGame(); }
  UI.update(dt);
}

function updateHover() {
  const mx = G.mouse.x, my = G.mouse.y;
  let best = null, bd = 1e9;
  for (const m of G.monsters) {
    if (m.dead) continue;
    const s = screenOf(m.x, m.y), h = SHAPE_HEIGHT[m.def.shape] * (m.def.look.scale || 1);
    const dx = mx - s.x, dy = my - (s.y - h / 2);
    const r = Math.max(22, h * 0.55);
    if (Math.abs(dx) < r && Math.abs(dy) < h / 2 + 8) { const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = { kind: 'mon', ref: m }; } }
  }
  if (!best) for (const n of G.npcs) {
    const s = screenOf(n.x, n.y);
    if (Math.abs(mx - s.x) < 20 && my < s.y + 6 && my > s.y - 70) { best = { kind: 'npc', ref: n }; break; }
  }
  if (!best) for (const d of G.drops) {
    const s = screenOf(d.x, d.y);
    if (Math.abs(mx - s.x) < 40 && Math.abs(my - (s.y - 14)) < 14) { best = { kind: 'drop', ref: d }; break; }
  }
  G.hover = best;
  canvas.style.cursor = best ? (best.kind === 'mon' ? 'crosshair' : 'pointer') : 'default';
}

// ---------------------------------------------------------------- render
function render() {
  const map = G.map, p = G.player, t = G.time;
  ctx.fillStyle = map.theme === 'dungeon' ? '#0c0a08' : map.theme === 'tower' ? '#08060c' : map.theme === 'water' ? '#0a2a3a' : '#1a2a10';
  ctx.fillRect(0, 0, W, H);
  map.drawGround(ctx, G.cam, W, H);
  map.drawWaterFX(ctx, G.cam, W, H, t);
  const W2 = W / 2, H2 = H / 2;
  // ground layer effects
  if (G.moveMarker && G.moveMarker.t > 0) {
    const s = screenOf(G.moveMarker.x, G.moveMarker.y);
    ctx.strokeStyle = `rgba(255,230,120,${G.moveMarker.t})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 14 * (1.5 - G.moveMarker.t), 7 * (1.5 - G.moveMarker.t), 0, 0, 7); ctx.stroke();
    G.moveMarker.t -= 0.03;
  }
  const tg = p.target instanceof Monster ? p.target : G.hover && G.hover.kind === 'mon' ? G.hover.ref : null;
  if (tg) { const s = screenOf(tg.x, tg.y); ctx.strokeStyle = p.target === tg ? 'rgba(255,80,60,0.9)' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(s.x, s.y, 22, 10, 0, 0, 7); ctx.stroke(); }
  for (const r of FX.rings) {
    const s = screenOf(r.x, r.y), k = 1 - r.life / r.max;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = r.life / r.max;
    ctx.strokeStyle = r.col; ctx.lineWidth = r.w;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, r.r * TW / 2 * (0.3 + k * 0.7), r.r * TH / 2 * (0.3 + k * 0.7), 0, 0, 7); ctx.stroke(); ctx.restore();
  }
  // drops
  for (const d of G.drops) drawDrop(d);
  // 3D pass: render every on-screen character into the GL batch first (one GPU sync per frame)
  G.frame = (G.frame || 0) + 1;
  const onScreen = e => { const s = screenOf(e.x, e.y); return s.x > -160 && s.x < W + 160 && s.y > -60 && s.y < H + 260; };
  prepFrame3D([p, ...G.npcs.filter(onScreen), ...G.monsters.filter(m => (!m.dead || m.fade > 0) && onScreen(m))]);
  // sorted drawables
  const list = [];
  for (const o of map.visibleObjects(G.cam, W, H)) list.push({ d: staticDepth(o), o, k: 's' });
  for (const n of G.npcs) list.push({ d: n.x + n.y, o: n, k: 'n' });
  for (const m of G.monsters) if (!m.dead || m.fade > 0) list.push({ d: m.x + m.y, o: m, k: 'm' });
  list.push({ d: p.x + p.y, o: p, k: 'p' });
  list.sort((a, b) => a.d - b.d);
  for (const e of list) {
    if (e.k === 's') {
      const s = screenOf(e.o.x, e.o.y);
      if (s.x < -200 || s.x > W + 200 || s.y < -60 || s.y > H + 260) continue;
      drawStatic(ctx, e.o, G.cam, W2, H2, t);
    } else if (e.k === 'n') {
      const s = screenOf(e.o.x, e.o.y), n = e.o;
      n.anim.dir = p.x + p.y > 0 && iso(p.x, p.y).x > iso(n.x, n.y).x ? 1 : -1;
      n.anim.ang = dist(p.x, p.y, n.x, n.y) < 6 ? Math.atan2(p.y - n.y, p.x - n.x) : Math.PI / 4;
      shadowAt(ctx, s.x, s.y, 16);
      if (!drawNpc3D(ctx, s.x, s.y, n, n.anim))
        drawHumanoid(ctx, s.x, s.y, Object.assign({ scale: 1 }, n.look, n.look.goblin ? { scale: 0.85 } : {}), { t, walk: 0, dir: n.anim.dir });
    } else if (e.k === 'm') {
      const m = e.o, s = screenOf(m.x, m.y);
      if (s.x < -100 || s.x > W + 100 || s.y < -50 || s.y > H + 150) continue;
      if (M3.ready && m._r3 && m._r3.f === G.frame) {
        if (m.def.look.glow) glowAt(ctx, s.x, s.y - 30 * (m.def.look.scale || 1), 40 * (m.def.look.scale || 1), m.def.look.glow, 0.25);
        ctx.save(); if (m.dead) ctx.globalAlpha = m.fade; shadowAt(ctx, s.x, s.y, 18 * (m.def.look.scale || 1)); ctx.restore();
        drawMonster3D(ctx, s.x, s.y, m, m.anim, m.dead ? m.fade : null);
      } else drawMonsterShape(ctx, s.x, s.y, m.def, { t, walk: m.anim.walk, atk: m.anim.atk, hurt: m.anim.hurt, dir: m.anim.dir, alpha: m.dead ? m.fade : null });
      if (m.frozen > 0) glowAt(ctx, s.x, s.y - 20, 30, '#9cf', 0.5);
    } else {
      const s = screenOf(p.x, p.y);
      if (p.dead) { ctx.save(); ctx.globalAlpha = 0.5; }
      shadowAt(ctx, s.x, s.y, 17);
      if (!drawPlayer3D(ctx, s.x, s.y, p, p.anim))
        drawHumanoid(ctx, s.x, s.y, p.look(), { t, walk: p.anim.walk, atk: p.anim.atk, hurt: p.anim.hurt, dir: p.anim.dir });
      if (p.buffs.barrier) glowAt(ctx, s.x, s.y - 30, 38, '#6af', 0.35);
      if (p.buffs.gdef || p.buffs.gdmg) glowAt(ctx, s.x, s.y - 4, 26, p.buffs.gdmg ? '#f96' : '#7cf', 0.35);
      if (p.dead) ctx.restore();
    }
  }
  map.drawClouds(ctx, G.cam, W, H, t);
  drawProjectiles();
  // particles
  for (const q of FX.parts) {
    if (!q.dust) continue;
    const s = screenOf(q.x, q.y, q.z);
    ctx.globalAlpha = Math.max(0, q.life / q.max) * 0.45; ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(s.x, s.y, q.size * (1.6 - q.life / q.max), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const q of FX.parts) {
    if (q.dust) continue;
    const s = screenOf(q.x, q.y, q.z);
    ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(s.x, s.y, q.size, 0, 7); ctx.fill();
  }
  ctx.restore();
  // lighting / atmosphere
  drawAtmosphere();
  // overhead labels
  ctx.textAlign = 'center'; ctx.font = 'bold 12px "Malgun Gothic", sans-serif';
  for (const n of G.npcs) { const s = screenOf(n.x, n.y); label(n.name, s.x, s.y - 80, '#9fe8ff'); }
  for (const m of G.monsters) {
    if (m.dead) continue;
    const hov = G.hover && G.hover.ref === m;
    if (hov || G.time - m.lastHit < 4 || m.def.boss) {
      const s = screenOf(m.x, m.y), h = SHAPE_HEIGHT[m.def.shape] * (m.def.look.scale || 1) + 18;
      if (hov || m.def.boss) label(m.def.name + (m.def.boss ? ' [보스]' : ''), s.x, s.y - h - 8, m.def.boss ? '#ff6a6a' : '#fff');
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(s.x - 22, s.y - h, 44, 5);
      ctx.fillStyle = '#e02020'; ctx.fillRect(s.x - 21, s.y - h + 1, 42 * m.hp / m.def.hp, 3);
    }
  }
  { const s = screenOf(p.x, p.y); label(p.name, s.x, s.y - 82, '#ffe8a0'); }
  for (const d of G.drops) {
    const s = screenOf(d.x, d.y);
    const hov = G.hover && G.hover.ref === d;
    const txt = d.zen ? fmt(d.zen) + ' 젠' : itemName(d.item);
    const col = d.zen ? '#ffd860' : itemColor(d.item);
    ctx.font = (hov ? 'bold ' : '') + '11px "Malgun Gothic", sans-serif';
    const w = ctx.measureText(txt).width + 8;
    ctx.fillStyle = hov ? 'rgba(60,40,10,0.85)' : 'rgba(0,0,0,0.55)'; ctx.fillRect(s.x - w / 2, s.y - 27, w, 15);
    ctx.fillStyle = col; ctx.fillText(txt, s.x, s.y - 16);
  }
  // damage numbers
  for (const tx of FX.texts) {
    const s = screenOf(tx.x, tx.y, tx.z);
    ctx.globalAlpha = Math.min(1, tx.life * 2);
    ctx.font = `bold ${tx.big ? 22 : 17}px Impact, "Malgun Gothic", sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(tx.str, s.x, s.y); ctx.fillStyle = tx.col; ctx.fillText(tx.str, s.x, s.y);
    ctx.globalAlpha = 1;
  }
  if (p.dead) {
    ctx.fillStyle = 'rgba(80,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 28px "Malgun Gothic"'; ctx.fillStyle = '#ff6a6a'; ctx.fillText('사망했습니다... 잠시 후 마을에서 부활합니다', W / 2, H / 2 - 60);
  }
}
function label(txt, x, y, col) {
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function drawDrop(d) {
  const s = screenOf(d.x, d.y);
  if (d.zen) {
    for (let i = 0; i < Math.min(6, 2 + Math.log10(d.zen + 1)); i++) {
      ctx.fillStyle = i % 2 ? '#ffd860' : '#d8a830'; ctx.beginPath(); ctx.ellipse(s.x + (i % 3 - 1) * 5, s.y - 3 - Math.floor(i / 3) * 3, 5, 2.5, 0, 0, 7); ctx.fill();
    }
  } else {
    const d0 = idef(d.item);
    const sparkle = d.item.exc.length || d0.kind === 'jewel' || d.item.lvl >= 7;
    if (sparkle) glowAt(ctx, s.x, s.y - 4, 22, d.item.exc.length ? '#5f5' : '#fd6', 0.5 + Math.sin(G.time * 5) * 0.2);
    const ic = UI.iconFor(d.item);
    ctx.save(); ctx.translate(s.x, s.y - 6); ctx.scale(1, 0.6); ctx.rotate(0.6);
    ctx.drawImage(ic, -ic.width / 4, -ic.height / 4, ic.width / 2, ic.height / 2);
    ctx.restore();
  }
}
function drawProjectiles() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const pr of FX.projs) {
    if (pr.type === 'proj') {
      const s = screenOf(pr.x, pr.y, 30);
      if (pr.kind === 'arrow' || pr.kind === 'penetration' || pr.kind === 'ice_arrow') {
        const s2 = screenOf(pr.x - pr.vx * 0.04, pr.y - pr.vy * 0.04, 30);
        ctx.strokeStyle = pr.col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(s2.x, s2.y); ctx.lineTo(s.x, s.y); ctx.stroke();
        glowAt(ctx, s.x, s.y, 10, pr.col, 0.6);
      } else {
        glowAt(ctx, s.x, s.y, pr.kind === 'fire_ball' ? 26 : 18, pr.col, 0.9);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
      }
    } else if (pr.type === 'bolt') {
      const a = screenOf(pr.x, pr.y, 50), b = screenOf(pr.tx, pr.ty, 25);
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? '#fff' : pr.col; ctx.lineWidth = k ? 1.5 : 4; ctx.beginPath(); ctx.moveTo(a.x, a.y);
        for (let i = 1; i < 8; i++) { const t = i / 8; ctx.lineTo(lerp(a.x, b.x, t) + rand(-12, 12), lerp(a.y, b.y, t) + rand(-12, 12)); }
        ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      glowAt(ctx, b.x, b.y, 40, pr.col, 0.8);
    } else if (pr.type === 'meteor') {
      const k = 1 - pr.life / pr.max;
      const x = lerp(pr.x, pr.tx, k), y = lerp(pr.y, pr.ty, k), z = pr.z * (1 - k);
      const s = screenOf(x, y, z);
      glowAt(ctx, s.x, s.y, pr.small ? 12 : 34, pr.col, 1);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, pr.small ? 2 : 7, 0, 7); ctx.fill();
      if (!pr.small) FX.parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, col: '#ff7a2a', size: 5, g: 0 });
    } else if (pr.type === 'spirit') {
      const k = 1 - pr.life / 0.9, a = pr.a + k * 4, r = k * 4.2;
      const s = screenOf(pr.x + Math.cos(a) * r, pr.y + Math.sin(a) * r, 40);
      glowAt(ctx, s.x, s.y, 26, pr.col, 0.9 * (1 - k));
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, 7); ctx.fill();
    } else if (pr.type === 'mproj') {
      const k = Math.min(1, pr.t / pr.dur);
      const s = screenOf(lerp(pr.x, pr.tx, k), lerp(pr.y, pr.ty, k), 34);
      glowAt(ctx, s.x, s.y, 16, pr.col, 0.9);
    }
  }
  ctx.restore();
}
let lightCan = document.createElement('canvas'), lightCtx = lightCan.getContext('2d');
function drawAtmosphere() {
  const th = G.map.theme;
  if (th === 'dungeon' || th === 'tower') {
    if (lightCan.width !== W || lightCan.height !== H) { lightCan.width = W; lightCan.height = H; }
    const g = lightCtx;
    g.globalCompositeOperation = 'source-over'; g.fillStyle = th === 'tower' ? 'rgba(10,0,25,0.72)' : 'rgba(5,3,0,0.7)'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    const ps = screenOf(G.player.x, G.player.y, 30); hole(ps.x, ps.y, 300);
    for (const l of G.map.lights) { const s = screenOf(l.x, l.y, 40); if (s.x > -300 && s.x < W + 300 && s.y > -300 && s.y < H + 300) hole(s.x, s.y, 170 + Math.sin(G.time * 8 + l.x) * 8, 0.9); }
    for (const pr of FX.projs) if (pr.type !== 'mproj') { const s = screenOf(pr.x, pr.y, 30); hole(s.x, s.y, 120, 0.7); }
    ctx.drawImage(lightCan, 0, 0);
  }
  if (th === 'water') {
    ctx.fillStyle = 'rgba(20,90,140,0.22)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.05;
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#aef'; ctx.beginPath(); ctx.ellipse((Math.sin(G.time * 0.3 + i) * 0.5 + 0.5) * W, (i / 6) * H, 300, 60, 0.3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (th === 'snow') { ctx.fillStyle = 'rgba(200,220,255,0.08)'; ctx.fillRect(0, 0, W, H); }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  for (const f of G.weather) {
    if (th === 'snow') { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 7); ctx.fill(); }
    else if (th === 'water') { ctx.strokeStyle = 'rgba(200,240,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 7); ctx.stroke(); }
    else if (th === 'tower') { ctx.fillStyle = 'rgba(200,120,255,0.6)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.s, 0, 7); ctx.fill(); }
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.running) { update(dt); render(); }
  else Title.draw(dt);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- save / load
const SAVE_KEY = 'MU_LEGACY_SAVE_V1';
function loadSaves() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || { chars: [] }; } catch (e) { return { chars: [] }; } }
function writeSaves(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { } }
function saveGame() {
  if (!G.player) return;
  const s = loadSaves();
  s.chars[G.slot] = G.player.save();
  writeSaves(s);
}
function startGame(slot) {
  const s = loadSaves();
  G.slot = slot;
  const sv = s.chars[slot];
  G.player = new Player(sv);
  const sx = sv.x, sy = sv.y;
  G.running = true;
  document.getElementById('screens').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  UI.init();
  loadMap(G.player.map, sx || null, sy || null);
  UI.msg('MU LEGACY에 오신 것을 환영합니다! (도움말: F1)', 'gold');
  UI.dirty = true;
}
function quitToSelect() {
  saveGame(); G.running = false; G.player = null; G.helper = null;
  UI.closeAll();
  document.getElementById('hud').style.display = 'none';
  document.getElementById('screens').style.display = 'flex';
  Title.show('select');
}
window.addEventListener('beforeunload', saveGame);
