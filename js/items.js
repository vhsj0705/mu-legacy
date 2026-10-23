// ---------------------------------------------------------------------
// Items: instances, names, tooltips, drops, jewels, chaos machine
// ---------------------------------------------------------------------
let UID = Date.now() % 100000;
const GEAR_KINDS = new Set(['sword', 'axe', 'staff', 'bow', 'shield', 'helm', 'armor', 'pants', 'gloves', 'boots', 'wings', 'ring', 'pendant']);
const WEAPON_KINDS = new Set(['sword', 'axe', 'staff', 'bow']);

function makeItem(id, o = {}) {
  const d = ITEMS[id];
  const it = { uid: ++UID, id, lvl: o.lvl || 0, luck: !!o.luck, skill: !!o.skill, opt: o.opt || 0, exc: o.exc || [], qty: o.qty || 1 };
  if (d.stack && !o.qty) it.qty = 1;
  return it;
}
const idef = it => ITEMS[it.id];
const isGear = it => GEAR_KINDS.has(idef(it).kind);
const isWeapon = it => WEAPON_KINDS.has(idef(it).kind);
const isArmorPiece = it => ['shield', 'helm', 'armor', 'pants', 'gloves', 'boots'].includes(idef(it).kind);

function itemName(it) {
  const d = idef(it);
  let n = (it.exc.length ? '엑설런트 ' : '') + d.name;
  if (isGear(it) && it.lvl > 0) n += ' +' + it.lvl;
  if (d.stack && it.qty > 1) n += ' x' + it.qty;
  return n;
}
function itemColor(it) {
  const d = idef(it);
  if (it.exc.length) return '#3dff6a';
  if (d.kind === 'jewel' || d.kind === 'misc') return '#ffd36a';
  if (d.kind === 'wings') return '#ffd36a';
  if (it.lvl >= 7) return '#ffcc33';
  if (it.luck || it.opt || it.skill) return '#86b4ff';
  return '#ffffff';
}

// --- stats contributed by an item
function weaponDamage(it) {
  const d = idef(it);
  let mn = d.dmin + LEVEL_BONUS[it.lvl], mx = d.dmax + LEVEL_BONUS[it.lvl];
  if (it.exc.length) { mn += 15 + Math.floor((d.dl === 999 ? 80 : d.dl) / 4); mx += 15 + Math.floor((d.dl === 999 ? 80 : d.dl) / 4); }
  mn += it.opt * 4; mx += it.opt * 4;
  return [mn, mx];
}
function staffWiz(it) { const d = idef(it); return d.wiz ? d.wiz + it.lvl * 3 + (it.exc.length ? 6 : 0) + it.opt * 4 * 0.5 : 0; }
function armorDef(it) {
  const d = idef(it);
  if (!d.def) return 0;
  return d.def + LEVEL_BONUS[it.lvl] + (it.exc.length ? 10 + Math.floor((d.dl === 999 ? 50 : d.dl) / 5) : 0) + (d.kind === 'shield' ? 0 : it.opt * 4) + (d.kind === 'wings' ? it.lvl : 0);
}
function reqOf(it) {
  const d = idef(it), m = 1 + it.lvl * 0.04 + (it.exc.length ? 0.15 : 0);
  return { str: Math.round((d.rStr || 0) * m), agi: Math.round((d.rAgi || 0) * m), ene: Math.round((d.rEne || 0) * m) };
}
function canEquip(p, it) {
  const d = idef(it); if (!d.slot) return '장착할 수 없는 아이템입니다.';
  if (d.cls && !d.cls.includes(p.cls)) return CLASSES[p.cls].name + '(은)는 착용할 수 없습니다.';
  const r = reqOf(it), s = p.totalStats();
  if (s.str < r.str) return '힘이 부족합니다.';
  if (s.agi < r.agi) return '민첩이 부족합니다.';
  if (s.ene < r.ene) return '에너지가 부족합니다.';
  return null;
}

function itemValue(it) {
  const d = idef(it);
  if (d.price) return d.price * (it.qty || 1);
  if (d.value) return d.value;
  const dl = d.dl === 999 ? 90 : d.dl || 1;
  let v = (dl + 5) * (dl + 5) * 12;
  if (d.kind === 'wings') v = 800000 * d.tier;
  v *= 1 + it.lvl * it.lvl * 0.18;
  if (it.luck) v *= 1.4; if (it.skill) v *= 1.2; v *= 1 + it.opt * 0.3;
  if (it.exc.length) v *= 3 + it.exc.length;
  return Math.floor(v);
}
const sellPrice = it => Math.max(1, Math.floor(itemValue(it) / 3));

// --- tooltip lines: [text, color]
function tooltipLines(it, p) {
  const d = idef(it), L = [];
  L.push([itemName(it), itemColor(it), true]);
  if (d.kind === 'potion') {
    L.push([d.heal ? `생명력 ${Math.round(d.heal * 100)}% 회복` : `마나 ${Math.round(d.mana * 100)}% 회복`, '#ccc']);
    L.push(['개수: ' + it.qty + ' / ' + d.stack, '#aaa']);
  }
  if (d.kind === 'scroll') L.push(['가장 가까운 마을로 이동합니다', '#ccc']);
  if (d.desc) L.push([d.desc, '#ccc']);
  if (d.kind === 'jewel') L.push(['아이템 위로 끌어다 놓아 사용', '#9ab']);
  if (WEAPON_KINDS.has(d.kind)) {
    const [mn, mx] = weaponDamage(it);
    L.push([(d.twoHand ? '양손' : '한손') + ' 공격력: ' + mn + ' ~ ' + mx, '#fff']);
    L.push(['공격속도: ' + d.spd, '#fff']);
    if (d.wiz) L.push(['마력 상승 ' + Math.round(staffWiz(it)) + '%', '#fff']);
  }
  if (d.def) L.push(['방어력: ' + armorDef(it), '#fff']);
  if (d.kind === 'shield') L.push(['방어율: ' + (d.block + it.lvl * 2), '#fff']);
  if (d.kind === 'wings') {
    L.push(['공격력 증가 ' + (d.dmgPct + it.lvl * 2) + '%', '#fff']);
    L.push(['데미지 흡수 ' + (d.absorb + it.lvl) + '%', '#fff']);
  }
  if (d.hp) L.push(['최대 생명 +' + (d.hp + it.lvl * 10), '#fff']);
  if (d.dmg) L.push(['공격력 +' + (d.dmg + it.lvl * 2), '#fff']);
  if (d.dmgPct && d.kind !== 'wings') L.push(['공격력 증가 +' + d.dmgPct + '%', '#86b4ff']);
  if (isGear(it)) {
    const r = reqOf(it), s = p ? p.totalStats() : null;
    if (r.str) L.push(['필요 힘: ' + r.str, s && s.str < r.str ? '#ff4040' : '#fff']);
    if (r.agi) L.push(['필요 민첩: ' + r.agi, s && s.agi < r.agi ? '#ff4040' : '#fff']);
    if (r.ene) L.push(['필요 에너지: ' + r.ene, s && s.ene < r.ene ? '#ff4040' : '#fff']);
    if (d.cls) d.cls.forEach(c => L.push([CLASSES[c].name + ' 착용 가능', p && p.cls !== c ? '#ff4040' : '#fff']));
  }
  if (it.skill) L.push(['스킬 공격력 +15% (스킬 사용 가능)', '#86b4ff']);
  if (it.luck) { L.push(['행운 (영혼의 보석 성공확률 +25%)', '#86b4ff']); L.push(['행운 (크리티컬 데미지 확률 +5%)', '#86b4ff']); }
  if (it.opt) {
    if (WEAPON_KINDS.has(d.kind)) L.push([(d.kind === 'staff' ? '추가 마력 +' : '추가 공격력 +') + it.opt * 4, '#86b4ff']);
    else if (d.kind === 'shield') L.push(['추가 방어율 +' + it.opt * 5, '#86b4ff']);
    else if (d.kind === 'wings') L.push(['추가 공격력 +' + it.opt * 4, '#86b4ff']);
    else L.push(['추가 방어력 +' + it.opt * 4, '#86b4ff']);
  }
  const ex = WEAPON_KINDS.has(d.kind) || d.kind === 'pendant' ? EXC_WEAPON : EXC_ARMOR;
  it.exc.forEach(e => { const o = ex.find(x => x.id === e); if (o) L.push([o.text, '#86b4ff']); });
  if (isGear(it) || d.kind === 'jewel' || d.kind === 'misc') L.push(['판매가: ' + fmt(sellPrice(it)) + ' 젠', '#d8c070']);
  return L;
}

// --- drops -------------------------------------------------------------
const DROPPABLE = Object.values(ITEMS).filter(d => GEAR_KINDS.has(d.kind) && d.dl < 999);
function rollItemDrop(mon, excBoost = 0) {
  const lv = mon.def.lv;
  const exc = chance(0.012 + excBoost);
  const maxDl = lv + (exc ? 22 : 4), minDl = Math.max(0, lv - 22);
  const pool = DROPPABLE.filter(d => d.dl <= maxDl && d.dl >= minDl);
  if (!pool.length) return null;
  const d = pick(pool);
  let lvl = 0;
  if (!exc) { const room = Math.max(0, maxDl - d.dl); lvl = Math.min(6, Math.floor(Math.random() * (room / 4 + 1))); if (lvl > 4 && chance(0.6)) lvl -= 2; }
  const o = { lvl, luck: chance(exc ? 0.25 : 0.1), skill: WEAPON_KINDS.has(d.kind) && chance(0.4), opt: chance(0.18) ? randi(1, Math.min(3, 1 + Math.floor(lv / 30))) : 0, exc: [] };
  if (exc && d.kind !== 'ring' || exc && d.rare) {
    const list = (WEAPON_KINDS.has(d.kind) || d.kind === 'pendant' ? EXC_WEAPON : EXC_ARMOR).map(x => x.id);
    const n = chance(0.25) ? 2 : 1;
    while (o.exc.length < n) { const e = pick(list); if (!o.exc.includes(e)) o.exc.push(e); }
  }
  return makeItem(d.id, o);
}
function rollDrops(mon, player) {
  const out = [];
  const lv = mon.def.lv, boss = mon.def.boss;
  const rolls = boss ? 8 : 1;
  for (let r = 0; r < rolls; r++) {
    const x = rand(0, 1);
    if (x < 0.36) {
      let z = Math.floor(lv * rand(6, 16) * (1 + lv / 40));
      if (player.statsCache && player.statsCache.zenPct) z = Math.floor(z * (1 + player.statsCache.zenPct));
      out.push({ zen: z });
    } else if (x < 0.36 + 0.14) {
      const tier = lv < 15 ? ['apple', 'hp_small', 'mp_small'] : lv < 40 ? ['hp_small', 'hp_medium', 'mp_small', 'mp_medium'] : ['hp_medium', 'hp_large', 'mp_medium', 'mp_large'];
      out.push(makeItem(pick(tier)));
    } else if (x < 0.5 + 0.075 * DROP_RATE) {
      const it = rollItemDrop(mon, boss ? 0.15 : 0); if (it) out.push(it);
    }
    const jm = boss ? 6 : 1;
    if (chance(0.0065 * jm * DROP_RATE)) out.push(makeItem('jewel_bless'));
    if (chance(0.005 * jm * DROP_RATE)) out.push(makeItem('jewel_soul'));
    if (chance(0.006 * jm * DROP_RATE)) out.push(makeItem('jewel_chaos'));
    if (chance(0.0025 * jm * DROP_RATE) && lv >= 15) out.push(makeItem('jewel_life'));
    if (chance(0.0015 * jm) && lv >= 20) out.push(makeItem('town_portal'));
    if (lv >= 40 && chance(0.0012 * jm)) out.push(makeItem('feather_loch'));
  }
  if (boss) { out.push(makeItem('feather_loch')); out.push(rollItemDrop(mon, 1) || makeItem('jewel_bless')); }
  return out;
}

// --- Jewels ------------------------------------------------------------
// returns {ok, msg, consumed}
function applyJewel(jewel, target) {
  const j = jewel.id, d = idef(target);
  if (!isGear(target) || d.kind === 'ring' || d.kind === 'pendant') return { ok: false, msg: '이 아이템에는 사용할 수 없습니다.' };
  if (j === 'jewel_bless') {
    if (target.lvl >= 6) return { ok: false, msg: '축복의 보석은 +6까지 사용할 수 있습니다.' };
    target.lvl++; return { ok: true, consumed: true, success: true, msg: `${d.name} +${target.lvl} 강화에 성공했습니다!` };
  }
  if (j === 'jewel_soul') {
    if (target.lvl < 6 || target.lvl >= 9) return { ok: false, msg: '영혼의 보석은 +6 ~ +8 아이템에 사용합니다.' };
    const rate = 0.5 + (target.luck ? 0.25 : 0);
    if (Math.random() < rate) { target.lvl++; return { ok: true, consumed: true, success: true, msg: `${d.name} +${target.lvl} 강화에 성공했습니다!` }; }
    target.lvl = target.lvl >= 7 ? 0 : target.lvl - 1;
    return { ok: true, consumed: true, success: false, msg: `강화에 실패하여 아이템 레벨이 +${target.lvl}(으)로 떨어졌습니다.` };
  }
  if (j === 'jewel_life') {
    if (target.opt >= 4) return { ok: false, msg: '더 이상 추가 옵션을 올릴 수 없습니다.' };
    if (Math.random() < 0.5) { target.opt++; return { ok: true, consumed: true, success: true, msg: `추가 옵션이 +${target.opt * 4}(으)로 상승했습니다!` }; }
    target.opt = 0;
    return { ok: true, consumed: true, success: false, msg: '생명의 보석 사용에 실패하여 추가 옵션이 사라졌습니다.' };
  }
  return { ok: false, msg: '사용할 수 없습니다.' };
}

// --- Chaos machine ----------------------------------------------------
// items: array of item instances in the mix box. Returns recipe analysis.
const PLUS_MIX = { 10: [1, 0.6], 11: [2, 0.55], 12: [3, 0.5], 13: [4, 0.45], 14: [5, 0.4], 15: [6, 0.35] };
function analyzeChaos(items, p) {
  const by = id => items.filter(i => i.id === id).length;
  const gear = items.filter(isGear);
  const bless = by('jewel_bless'), soul = by('jewel_soul'), chaos = by('jewel_chaos'), feather = by('feather_loch');
  const other = items.length - bless - soul - chaos - feather - gear.length;
  if (!items.length) return { name: '조합할 아이템을 넣어주세요', rate: 0, ok: false };
  // +10~15 item mix
  if (gear.length === 1 && gear[0].lvl >= 9 && gear[0].lvl <= 14 && !feather && !other) {
    const next = gear[0].lvl + 1, [n, rate] = PLUS_MIX[next];
    const ok = bless === n && soul === n && chaos === 1;
    const r = Math.min(0.75, rate + (gear[0].luck ? 0.2 : 0));
    return { name: `+${next} 아이템 조합`, need: `축복 ${n} · 영혼 ${n} · 혼돈 1`, rate: r, zen: 50000 * (next - 9), ok, type: 'plus', target: gear[0], next };
  }
  // 2nd wings: 1st wing + feather + exc item + chaos
  const w1 = gear.find(g => idef(g).kind === 'wings' && idef(g).tier === 1);
  if (feather >= 1 && w1) {
    const excItem = gear.find(g => g !== w1 && g.exc.length);
    const ok = chaos === 1 && feather === 1 && !!excItem;
    let r = 0.2 + (w1.lvl * 0.03) + (excItem ? Math.min(0.3, excItem.lvl * 0.03) : 0);
    return { name: '2차 날개 조합', need: '1차 날개 + 로크의 깃털 + 엑설런트 아이템 + 혼돈의 보석', rate: Math.min(0.9, r), zen: 5000000 / 10, ok, type: 'wing2' };
  }
  // 1st wings / chaos weapon: chaos + gear (+4 or more)
  if (chaos >= 1 && gear.length >= 1 && !bless && !soul && !feather) {
    const valid = gear.every(g => g.lvl >= 4 && idef(g).kind !== 'wings');
    let score = gear.reduce((a, g) => a + itemValue(g), 0);
    const r = Math.min(0.8, score / 600000 + (chaos - 1) * 0.1);
    return { name: '1차 날개 / 카오스 무기 조합', need: '+4 이상 장비 + 혼돈의 보석 (장비 가치가 높을수록 성공률 상승)', rate: valid ? Math.max(0.05, r) : 0, zen: 100000, ok: valid, type: 'wing1' };
  }
  return { name: '알 수 없는 조합입니다', rate: 0, ok: false };
}
function doChaos(items, p) {
  const a = analyzeChaos(items, p);
  if (!a.ok) return { ok: false, msg: '조합 조건이 맞지 않습니다.' };
  if (p.zen < a.zen) return { ok: false, msg: '젠이 부족합니다.' };
  p.zen -= a.zen;
  const success = Math.random() < a.rate;
  let result = [];
  if (a.type === 'plus') {
    if (success) { a.target.lvl = a.next; result = [a.target]; }
    else result = [];
  } else if (a.type === 'wing1') {
    if (success) {
      const wingFor = { DK: 'wings_satan', DW: 'wings_heaven', FE: 'wings_elf' }, chaosW = { DK: 'chaos_dragon_axe', DW: 'chaos_lightning', FE: 'chaos_nature' };
      const cls = pick(['DK', 'DW', 'FE', p.cls, p.cls]);
      const id = chance(0.55) ? wingFor[cls] : chaosW[cls];
      result = [makeItem(id, { luck: chance(0.2), skill: !id.startsWith('wings'), opt: chance(0.3) ? 1 : 0 })];
    }
  } else if (a.type === 'wing2') {
    if (success) {
      const wing2 = { DK: 'wings_dragon', DW: 'wings_soul', FE: 'wings_spirit' };
      const cls = idef(items.find(g => idef(g).kind === 'wings')).cls[0];
      result = [makeItem(wing2[cls], { luck: chance(0.2), opt: chance(0.3) ? 1 : 0 })];
    }
  }
  return { ok: true, success, result, msg: success ? '조합에 성공했습니다!' : '조합에 실패했습니다... 아이템이 사라졌습니다.' };
}
