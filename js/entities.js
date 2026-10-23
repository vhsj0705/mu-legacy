// ---------------------------------------------------------------------
// Entities: Player, Monster, NPC, ground drops, projectiles, particles
// ---------------------------------------------------------------------
const EQUIP_SLOTS = ['pendant', 'helm', 'wings', 'weapon', 'armor', 'shield', 'gloves', 'pants', 'boots', 'ring1', 'ring2'];
const INV_W = 8, INV_H = 8;

function expTotal(lv) { return lv <= 1 ? 0 : 10 * (lv + 8) * (lv - 1) * (lv - 1); }

class Player {
  constructor(sv) {
    Object.assign(this, {
      name: sv.name, cls: sv.cls, lvl: sv.lvl || 1, exp: sv.exp || 0, pts: sv.pts || 0,
      stats: sv.stats || { str: CLASSES[sv.cls].str, agi: CLASSES[sv.cls].agi, vit: CLASSES[sv.cls].vit, ene: CLASSES[sv.cls].ene },
      zen: sv.zen != null ? sv.zen : 2000, inv: sv.inv || [], equip: sv.equip || {}, vault: sv.vault || [], vaultZen: sv.vaultZen || 0,
      map: sv.map || CLASSES[sv.cls].home, hotbar: sv.hotbar || null, resets: sv.resets || 0
    });
    this.x = sv.x || 0; this.y = sv.y || 0;
    this.path = null; this.target = null; this.pendingSkill = null;
    this.cd = 0; this.anim = { walk: 0, atk: 0, hurt: 0, dir: 1 };
    this.buffs = {}; this.dead = false; this.deadT = 0; this.regenT = 0;
    this.calc();
    this.hp = sv.hp != null ? Math.min(sv.hp, this.maxHp) : this.maxHp;
    this.mp = sv.mp != null ? Math.min(sv.mp, this.maxMp) : this.maxMp;
    if (!this.hotbar) this.hotbar = this.knownSkills().slice(0, 1);
    this.activeSkill = this.hotbar[0] || null;
  }
  save() {
    const o = {};
    ['name', 'cls', 'lvl', 'exp', 'pts', 'stats', 'zen', 'inv', 'equip', 'vault', 'vaultZen', 'map', 'x', 'y', 'hp', 'mp', 'hotbar', 'resets'].forEach(k => o[k] = this[k]);
    return JSON.parse(JSON.stringify(o));
  }
  get C() { return CLASSES[this.cls]; }
  totalStats() { return this.stats; }
  knownSkills() { return Object.keys(SKILLS).filter(k => SKILLS[k].cls === this.cls && SKILLS[k].lv <= this.lvl); }
  expNeeded() { return expTotal(this.lvl + 1); }

  calc() {
    const s = this.stats, C = this.C, e = this.equip, lv = this.lvl;
    const r = { dmgPct: 0, excRate: 0, crit: 0, reduce: 0, reflect: 0, absorb: 0, zenPct: 0, hpKill: 0, mpKill: 0, spdBonus: 0, drBonus: 0, hpPct: 0, mpPct: 0, flatDmg: 0, skillBonus: 0, hpFlat: 0 };
    let def = C.defense(s), dr = C.defRate(s);
    let mn = C.minDmg(s), mx = C.maxDmg(s), wspd = 0, wiz = 0;
    const W = e.weapon;
    if (W) {
      const [a, b] = weaponDamage(W); mn += a; mx += b; wspd = idef(W).spd;
      wiz = staffWiz(W);
      if (W.luck) r.crit += 0.05; if (W.skill) r.skillBonus = 0.15;
      W.exc.forEach(x => { if (x === 'dmgPct') r.dmgPct += 0.02; if (x === 'dmgLv') r.flatDmg += lv / 20; if (x === 'excRate') r.excRate += 0.1; if (x === 'spd') r.spdBonus += 7; if (x === 'hpKill') r.hpKill = 1; if (x === 'mpKill') r.mpKill = 1; });
    }
    ['shield', 'helm', 'armor', 'pants', 'gloves', 'boots', 'wings'].forEach(k => {
      const it = e[k]; if (!it) return;
      def += armorDef(it);
      if (k === 'shield') dr += idef(it).block + it.lvl * 2 + it.opt * 5;
      if (k === 'wings') { r.dmgPct += (idef(it).dmgPct + it.lvl * 2) / 100; r.absorb += (idef(it).absorb + it.lvl) / 100; r.flatDmg += it.opt * 4; }
      if (it.luck) r.crit += 0.01;
      it.exc.forEach(x => { if (x === 'zen') r.zenPct += 0.4; if (x === 'dr') r.drBonus += 0.1; if (x === 'reflect') r.reflect += 0.05; if (x === 'reduce') r.reduce += 0.04; if (x === 'mpPct') r.mpPct += 0.04; if (x === 'hpPct') r.hpPct += 0.04; });
    });
    ['ring1', 'ring2', 'pendant'].forEach(k => {
      const it = e[k]; if (!it) return; const d = idef(it);
      if (d.hp) r.hpFlat += d.hp + it.lvl * 10;
      if (d.dmg) r.flatDmg += d.dmg + it.lvl * 2;
      if (d.dmgPct) r.dmgPct += d.dmgPct / 100;
      it.exc.forEach(x => { if (x === 'dmgPct') r.dmgPct += 0.02; if (x === 'excRate') r.excRate += 0.1; if (x === 'hpPct') r.hpPct += 0.04; });
    });
    if (this.buffs.gdef) def += this.buffs.gdef.v;
    if (this.buffs.gdmg) r.flatDmg += this.buffs.gdmg.v;
    mn += r.flatDmg; mx += r.flatDmg;
    if (mn > mx) mn = mx;
    this.minDmg = Math.floor(mn * (1 + r.dmgPct)); this.maxDmg = Math.floor(mx * (1 + r.dmgPct));
    if (C.wizMin) {
      this.wizMin = Math.floor((C.wizMin(s) + r.flatDmg) * (1 + wiz / 100) * (1 + r.dmgPct));
      this.wizMax = Math.floor((C.wizMax(s) + r.flatDmg) * (1 + wiz / 100) * (1 + r.dmgPct));
    }
    this.def = Math.floor(def); this.defRate = Math.floor(dr * (1 + r.drBonus));
    this.atkRate = Math.floor(5 * lv + 1.5 * s.agi + 0.25 * s.str);
    this.atkSpd = Math.floor(C.atkSpd(s) + wspd + r.spdBonus);
    let hp = C.maxHp(s, lv) + r.hpFlat;
    if (this.buffs.swell) hp *= 1 + this.buffs.swell.v;
    this.maxHp = Math.floor(hp * (1 + r.hpPct));
    this.maxMp = Math.floor(C.maxMp(s, lv) * (1 + r.mpPct));
    this.statsCache = r;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mp > this.maxMp) this.mp = this.maxMp;
  }
  attackInterval() { return Math.max(0.2, 1.4 * 60 / (60 + this.atkSpd)); }

  look() {
    const e = this.equip, C = this.cls;
    const col = k => e[k] ? idef(e[k]).color : null;
    const base = C === 'DK' ? { c1: '#5a4a3a', c2: '#e8c8a8', hair: '#3a2a1a' } : C === 'DW' ? { c1: '#3a2a5a', c2: '#e8d0b8', hair: '#c8c8d8', robe: !e.pants } : { c1: '#3a6a3a', c2: '#f0d8c0', hair: '#f0d060', longHair: true };
    const L = Object.assign({ scale: 1 }, base);
    L.skin = base.c2;
    if (e.armor) { L.body = col('armor'); L.trim = idef(e.armor).trim; L.armored = C === 'DK'; }
    else L.body = base.c1;
    const set = e.armor ? idef(e.armor).set : null;
    L.material = !set ? 'cloth' : C === 'DK' ? (set === 'leather' ? 'grain' : 'metal') : C === 'FE' && set === 'vine' ? 'grain' : set === 'guardian' || set === 'spirit' ? 'metal' : 'cloth';
    const under = C === 'DK' ? '#3a3028' : C === 'DW' ? '#2a2238' : '#2e4a2a';
    L.legs = col('pants') ? shade(col('pants'), -0.12) : shade(base.c1, -0.3);
    L.arms = col('gloves') ? shade(col('armor') || base.c1, -0.1) : under;
    L.hands = col('gloves') || L.skin;
    L.feet = col('boots') ? shade(col('boots'), -0.25) : '#3a2a1a';
    if (e.helm) { L.helm = col('helm'); L.helmTrim = idef(e.helm).trim; }
    if (C === 'DW' && e.armor && ['pad', 'bone', 'sphinx', 'legendary', 'grand_soul'].includes(idef(e.armor).set)) L.robe = true;
    if (e.weapon) {
      const d = idef(e.weapon);
      L.weapon = d.kind === 'axe' ? 'axe' : d.kind === 'staff' ? 'staff' : d.kind === 'bow' ? 'bow' : 'sword';
      L.weaponColor = e.weapon.exc.length ? '#9effa0' : d.kind === 'staff' ? (e.weapon.lvl >= 7 ? '#ffd060' : '#88b8ff') : d.kind === 'bow' ? '#9a6a3a' : '#d8dce8';
      if (e.weapon.lvl >= 7) L.weaponGlow = e.weapon.lvl >= 11 ? '#ffd860' : '#7fc8ff';
    }
    if (e.shield) { L.shield = '#7a6a5a'; L.shieldTrim = e.shield.lvl >= 7 ? '#ffd860' : '#c8c0b0'; }
    if (e.wings) { const d = idef(e.wings); L.wingsKind = this.cls === 'DK' ? 'bat' : 'feather'; L.wing1 = d.color; L.wing2 = d.trim; L.wingTier = d.tier; }
    const pieces = ['helm', 'armor', 'pants', 'gloves', 'boots'].map(k => e[k]).filter(Boolean);
    if (pieces.length >= 4) { const m = Math.min(...pieces.map(i => i.lvl)); if (m >= 7) L.aura = m; }
    return L;
  }
}

class Monster {
  constructor(id, x, y, map) {
    this.id = id; this.def = MONSTERS[id]; this.map = map;
    this.sx = x; this.sy = y; this.respawnT = 0;
    this.spawn(x, y);
  }
  spawn(x, y) {
    this.x = x; this.y = y; this.hp = this.def.hp; this.dead = false; this.fade = 1;
    this.state = 'idle'; this.cd = rand(0, 1); this.wander = rand(1, 4); this.wx = x; this.wy = y;
    this.anim = { walk: 0, atk: 0, hurt: 0, dir: chance(0.5) ? 1 : -1 }; this.frozen = 0; this.lastHit = -99;
  }
}

class NPC {
  constructor(d) { Object.assign(this, d); this.anim = { walk: 0, atk: 0, hurt: 0, dir: 1 }; this.x = d.x; this.y = d.y; }
}

// ---------------- particles / floating text ----------------
const FX = {
  parts: [], texts: [], projs: [], rings: [],
  spark(x, y, z, col, n = 8, spd = 2, life = 0.5, size = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * spd;
      this.parts.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(20, 80), life, max: life, col, size, g: 160 });
    }
  },
  pillar(x, y, col, n = 40) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + rand(-0.4, 0.4), y: y + rand(-0.4, 0.4), z: rand(0, 20), vx: 0, vy: 0, vz: rand(60, 160), life: rand(0.6, 1.4), max: 1.4, col, size: rand(2, 4), g: -20 });
  },
  ring(x, y, col, r = 3, life = 0.5, w = 4) { this.rings.push({ x, y, col, r, life, max: life, w }); },
  text(x, y, str, col, big = false) { this.texts.push({ x, y, z: 70, str, col, life: 1.1, big, vx: rand(-0.3, 0.3) }); },
  update(dt) {
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.3; } p.life -= dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const t of this.texts) { t.z += 40 * dt; t.x += t.vx * dt; t.life -= dt; }
    this.texts = this.texts.filter(t => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
  }
};
