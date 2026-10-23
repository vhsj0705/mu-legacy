// ---------------------------------------------------------------------
// MU 도우미: an in-game guide chatbot that answers from the game's own data
// (monsters, items, maps, skills, formulas) and the player's current state.
// Runs fully offline: intent keywords + name matching, no external AI service.
// ---------------------------------------------------------------------
const Guide = {
  norm: s => s.toLowerCase().replace(/[\s·.,!?~()\[\]'"]/g, ''),
  index: null,
  buildIndex() {
    const idx = [];
    const add = (name, type, ref) => idx.push({ key: this.norm(name), name, type, ref });
    Object.entries(MONSTERS).forEach(([id, m]) => add(m.name, 'monster', id));
    Object.entries(ITEMS).forEach(([id, it]) => add(it.name, 'item', id));
    ARMOR_SETS.forEach(s => { add(s[1] + '세트', 'set', s[0]); add(s[1] + ' 세트', 'set', s[0]); });
    Object.entries(MAPS).forEach(([id, m]) => { add(m.name, 'map', id); add(id, 'map', id); });
    Object.entries(SKILLS).forEach(([id, s]) => add(s.name, 'skill', id));
    // NPCs by full name and by their personal name (generic job words would hijack questions like "물약 어디서 사?")
    const generic = new Set(['물약', '상인', '포션', '소녀', '마법사', '대장장이', '방어구상', '무기상', '요정', '창고지기', '경비병', '로랜시아', '고블린', '안내원']);
    Object.entries(MAPS).forEach(([mid, m]) => (m.npcs || []).forEach(n => { add(n.name, 'npc', [mid, n]); n.name.split(' ').forEach(w => w.length >= 2 && !generic.has(w) && add(w, 'npc', [mid, n])); }));
    Object.values(CLASSES).forEach(c => add(c.name, 'class', c.id));
    // common aliases
    [['흑마', 'class', 'DW'], ['법사', 'class', 'DW'], ['기사', 'class', 'DK'], ['엘프', 'class', 'FE'], ['요정', 'class', 'FE'],
     ['로랜', 'map', 'lorencia'], ['데비', 'map', 'devias'], ['아틀', 'map', 'atlans'], ['로타', 'map', 'losttower'], ['로스트타워', 'map', 'losttower'],
     ['축석', 'item', 'jewel_bless'], ['영석', 'item', 'jewel_soul'], ['생석', 'item', 'jewel_life'], ['혼석', 'item', 'jewel_chaos'], ['깃털', 'item', 'feather_loch']]
      .forEach(([n, t, r]) => add(n, t, r));
    idx.sort((a, b) => b.key.length - a.key.length);
    this.index = idx;
  },
  // all distinct entities mentioned in the question (longest names win)
  entities(q) {
    if (!this.index) this.buildIndex();
    const n = this.norm(q), found = [];
    let rest = n;
    for (const e of this.index) {
      if (e.key.length < 2) continue;
      if (rest.includes(e.key)) { found.push(e); rest = rest.split(e.key).join('|'); }
    }
    return found;
  },
  has(q, words) { const n = this.norm(q); return words.some(w => n.includes(w)); },

  // ---------------------------------------------------------- answering
  answer(q) {
    const p = G.player, ents = this.entities(q);
    const H = (...w) => this.has(q, w);
    if (!q.trim()) return this.help();
    if (H('안녕', '하이', 'hello', 'hi', '반가')) return { html: `안녕하세요, ${esc(p.name)}님! 저는 <b>MU 도우미</b>예요. 사냥터, 몬스터, 아이템, 보석 강화, 스탯 같은 게 궁금하면 편하게 물어보세요.`, chips: this.defaultChips() };
    if (H('도움말', '뭐할수', '뭘물어', '무엇을', '기능', 'help')) return this.help();
    // entity-driven answers first (most specific)
    const pickE = t => ents.find(e => e.type === t);
    const mon = pickE('monster'), item = pickE('item'), set = pickE('set'), map = pickE('map'), skill = pickE('skill'), npc = pickE('npc'), cls = pickE('class');
    if (item && /jewel_|feather/.test(item.ref) && !H('어디서', '드랍', '얻')) return this.jewel(item.ref);
    if (npc && !H('조합', '확률')) return this.npc(npc.ref);
    if (H('카오스', '조합', '날개만들', '날개조합', '+10', '+11', '+12', '+13', '+14', '+15')) return this.chaos();
    if (H('보석', '강화', '인챈트', '업그레이드', '+7', '+8', '+9')) return this.enchant();
    if (mon) return this.monster(mon.ref);
    if (set) return this.armorSet(set.ref);
    if (item) return this.item(item.ref);
    if (skill) return this.skill(skill.ref);
    if (npc) return this.npc(npc.ref);
    if (map && !H('사냥터', '추천')) return this.mapInfo(map.ref);
    // topic answers
    if (H('사냥', '사냥터', '레벨업', '렙업', '경험치', '어디가', '어디로')) return this.hunting(map && map.ref);
    if (H('스탯', '포인트', '능력치', '찍', '힘', '민첩', '체력', '에너지')) return this.stats(cls ? cls.ref : p.cls);
    if (H('장비', '무기', '갑옷', '방어구', '템', '아이템추천', '살만한', '구매')) return this.gear();
    if (H('스킬', '기술', '마법')) return this.skills(cls ? cls.ref : p.cls);
    if (H('엑설런트', '엑셀', '행운', '추가옵션', '옵션')) return this.options();
    if (H('날개')) return this.chaos();
    if (H('내정보', '상태', '내캐릭', '나어때', '진단')) return this.status();
    if (H('물약', '포션', '상점', '파는곳', '창고', 'npc', '엔피씨')) return this.shops();
    if (H('조작', '단축키', '키', '이동법', '사용법', '조종')) return this.controls();
    if (H('헬퍼', '자동사냥', '오토')) return { html: `<b>MU 헬퍼</b>는 <kbd>H</kbd> 키로 켜고 끕니다. 켠 자리 주변(약 9칸)의 몬스터를 자동으로 공격하고, 생명이 절반 아래로 떨어지면 치유 물약을, 마나가 20% 아래면 마나 물약을 마셔요. 근처 아이템도 자동으로 주워요.<br>※ 안전지대(마을)에서는 켤 수 없어요. 선택한 스킬(1~9)을 우선 사용하니 범위 스킬을 골라 두면 효율이 좋아요.` };
    if (H('죽', '사망', '패널티', '부활')) return { html: `죽으면 3초 뒤 가까운 마을에서 부활하고, 현재 레벨 구간 경험치의 <b>2%</b>를 잃어요. 레벨이 내려가지는 않아요.<br>생명이 위험할 때는 <kbd>Q</kbd>로 치유 물약을 마시고, 물약은 마을 상점에서 살 수 있어요.` };
    if (H('젠', '돈', '골드')) return { html: `젠은 몬스터 처치(약 36% 확률), 아이템 판매로 벌 수 있어요.<br>· 상점 창을 연 채 인벤토리 아이템을 <b>우클릭</b>하면 바로 판매돼요.<br>· 갑옷 엑설런트 옵션 <b>"몬스터 사냥시 젠 증가 +40%"</b>가 있으면 획득량이 늘어요.<br>· 보석은 비싸게 팔리지만 강화에 쓰는 게 더 이득일 때가 많아요. 현재 보유 젠: <b>${fmt(p.zen)}</b>` };
    if (H('이동', '워프', '맵')) return this.maps();
    if (cls) return this.stats(cls.ref);
    return this.fallback(q);
  },

  help() {
    return { html: `저에게 이런 걸 물어볼 수 있어요:<ul>
      <li><b>사냥터 추천</b> — "어디서 사냥해?"</li><li><b>몬스터</b> — "고르곤 어디 있어?", "리치 잡을 만해?"</li>
      <li><b>아이템</b> — "카타나 어디서 구해?", "드래곤 세트"</li><li><b>보석·강화</b> — "영혼의 보석 확률", "+10 조합"</li>
      <li><b>스탯·장비</b> — "스탯 어떻게 찍어?", "장비 추천"</li><li><b>지역·NPC·조작</b> — "데비아스", "카오스 고블린", "단축키"</li></ul>`, chips: this.defaultChips() };
  },
  defaultChips() { return ['사냥터 추천', '스탯 추천', '장비 추천', '보석 강화', '카오스 조합', '내 정보']; },

  expPerKill(lv) {
    const p = G.player; let exp = (lv + 25) * lv / 3; const diff = p.lvl - lv - 10;
    if (diff > 0) exp *= Math.max(0.08, 1 - diff * 0.05);
    return Math.max(1, Math.floor(exp * EXP_RATE));
  },
  // rough fight estimate: hits needed and damage taken per hit
  fight(def) {
    const p = G.player;
    const magic = p.cls === 'DW' && p.activeSkill && SKILLS[p.activeSkill].type !== 'melee';
    const lo = magic ? p.wizMin : p.minDmg, hi = magic ? p.wizMax : p.maxDmg;
    const add = magic && p.activeSkill ? (SKILLS[p.activeSkill].add || 0) : 0;
    const raw = (lo + hi) / 2 + add, dmg = Math.max(raw * 0.1, raw - def.def);
    const hitRate = clamp(p.atkRate / (p.atkRate + def.dr * 0.6 + 1), 0.15, 0.97);
    const hits = Math.ceil(def.hp / Math.max(1, dmg * hitRate));
    const mraw = (def.min + def.max) / 2, taken = Math.max(1, mraw * 0.08, mraw - p.def);
    return { hits, taken: Math.round(taken), hitsToDie: Math.ceil(p.maxHp / taken) };
  },
  hitsText(f) { return f.hits >= 100 ? '<b>100회 이상</b>(지금은 사실상 불가)' : `약 <b>${f.hits}회</b>`; },
  verdict(f) {
    if (f.hitsToDie <= 3) return '<span class="g-bad">매우 위험</span>';
    if (f.hits > f.hitsToDie * 1.2) return '<span class="g-bad">아직 어려움</span>';
    if (f.hits > 12) return '<span class="g-warn">오래 걸림</span>';
    if (f.hits <= 2 && f.hitsToDie > 12) return '<span class="g-ok">너무 쉬움 (경험치 적음)</span>';
    return '<span class="g-ok">사냥하기 좋음</span>';
  },
  whereIs(monId) { return WARP_ORDER.filter(mid => MAPS[mid].spawns.some(s => s[0] === monId)); },

  hunting(onlyMap) {
    const p = G.player, rows = [];
    for (const mid of WARP_ORDER) {
      if (onlyMap && mid !== onlyMap) continue;
      const M = MAPS[mid];
      for (const [id] of M.spawns) {
        const d = MONSTERS[id]; if (d.boss) continue;
        const f = this.fight(d), xp = this.expPerKill(d.lv);
        const ok = p.lvl >= M.warpLv && f.hitsToDie > Math.max(4, f.hits * 0.8);
        // score: exp per hit taken, penalize danger and level gap
        const score = ok ? xp / Math.max(1, f.hits) * Math.min(1, f.hitsToDie / 8) : -1;
        rows.push({ id, d, mid, f, xp, score, lock: p.lvl < M.warpLv });
      }
    }
    const best = rows.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    if (!best.length) return { html: `지금 레벨(${p.lvl})에 맞는 곳을 찾지 못했어요. 장비를 강화하거나 스탯을 정리한 뒤 다시 물어봐 주세요.`, chips: ['장비 추천', '스탯 추천'] };
    const li = best.map(r => `<li><b>${MAPS[r.mid].name}</b> — ${r.d.name} (Lv.${r.d.lv}) · 처치당 경험치 약 <b>${fmt(r.xp)}</b> · ${r.f.hits}회 공격 · 받는 피해 ${r.f.taken} · ${this.verdict(r.f)}</li>`).join('');
    const next = rows.filter(r => r.lock).sort((a, b) => MAPS[a.mid].warpLv - MAPS[b.mid].warpLv)[0];
    const tip = next ? `<br>Lv.${MAPS[next.mid].warpLv}이 되면 <b>${MAPS[next.mid].name}</b>(으)로 갈 수 있어요.` : '';
    const need = p.expNeeded() - p.exp;
    return { html: `Lv.${p.lvl} ${CLASSES[p.cls].name} 기준 추천 사냥터예요:<ul>${li}</ul>다음 레벨까지 경험치 <b>${fmt(need)}</b> 남았어요. 지역 이동은 <kbd>M</kbd> 키.${tip}`, chips: ['장비 추천', '스탯 추천', best[0].d.name + ' 정보'] };
  },
  monster(id) {
    const d = MONSTERS[id], where = this.whereIs(id), f = this.fight(d);
    const maps = where.map(m => `${MAPS[m].name}(Lv.${MAPS[m].warpLv}+)`).join(', ') || '알 수 없음';
    const drops = DROPPABLE.filter(it => it.dl <= d.lv + 4 && it.dl >= d.lv - 22).sort((a, b) => b.dl - a.dl).slice(0, 4).map(it => it.name).join(', ');
    return { html: `<b>${d.name}</b> ${d.boss ? '<span class="g-bad">[보스]</span>' : ''} — Lv.${d.lv}<br>
      위치: ${maps}<br>생명 ${fmt(d.hp)} · 공격력 ${d.min}~${d.max} · 방어력 ${d.def}${d.ranged ? ' · <b>원거리 공격</b>' : ''}${d.boss ? ` · 리스폰 약 ${d.respawn}초` : ''}<br>
      내 기준: ${this.hitsText(f)} 공격해야 잡고, 한 대에 <b>${f.taken}</b> 피해 (${f.hitsToDie}대 맞으면 위험) → ${this.verdict(f)}<br>
      처치당 경험치 약 ${fmt(this.expPerKill(d.lv) * (d.boss ? 4 : 1))}${drops ? `<br>주요 드랍: ${drops}${d.boss ? ', 보석 다수, 로크의 깃털' : ''}` : ''}`, chips: where[0] ? [MAPS[where[0]].name + ' 정보', '사냥터 추천'] : ['사냥터 추천'] };
  },
  sources(itId) {
    const d = ITEMS[itId], out = [];
    const shops = Object.entries(SHOPS).filter(([k, s]) => (s.items || []).includes(itId) || (d.set && (s.sets || []).includes(d.set)));
    shops.forEach(([k]) => { const where = []; Object.entries(MAPS).forEach(([mid, m]) => (m.npcs || []).forEach(n => n.shop === k && where.push(`${m.name} ${n.name}`))); if (where.length) out.push('상점: ' + where.join(', ')); });
    if (d.dl === 999) out.push('카오스 고블린(노리아) 조합으로만 얻을 수 있어요');
    else if (d.dl != null && GEAR_KINDS.has(d.kind)) {
      const mons = Object.entries(MONSTERS).filter(([, m]) => !m.boss && m.lv >= d.dl - 4 && m.lv <= d.dl + 22).sort((a, b) => a[1].lv - b[1].lv).slice(0, 4);
      if (mons.length) out.push('드랍: ' + mons.map(([id, m]) => `${m.name}(Lv.${m.lv}, ${this.whereIs(id).map(x => MAPS[x].name)[0] || '?'})`).join(', '));
    }
    return out;
  },
  item(id) {
    const it = makeItem(id), d = ITEMS[id], p = G.player;
    const lines = tooltipLines(it, p).slice(1).filter(l => !l[0].startsWith('판매가')).map(l => l[0]);
    const src = this.sources(id);
    const err = d.slot ? canEquip(p, it) : null;
    return { html: `<b>${d.name}</b><br>${lines.join('<br>')}${src.length ? '<br><br>' + src.join('<br>') : ''}${d.slot ? `<br><br>${err ? '<span class="g-warn">지금은 착용 불가: ' + err + '</span>' : '<span class="g-ok">지금 착용할 수 있어요</span>'}` : ''}`, chips: ['장비 추천', '보석 강화'] };
  },
  armorSet(setId) {
    const s = ARMOR_SETS.find(a => a[0] === setId);
    const pieces = ['helm', 'armor', 'pants', 'gloves', 'boots'].map(k => ITEMS[setId + '_' + k]).filter(Boolean);
    const total = pieces.reduce((a, d) => a + d.def, 0);
    const src = this.sources(pieces[0].id);
    return { html: `<b>${s[1]} 세트</b> (${CLASSES[s[2]].name} 전용, 드랍 레벨 ${s[3]}+)<br>구성: ${pieces.map(d => `${d.name.split(' ').pop()} 방어 ${d.def}`).join(', ')}<br>세트 합계 방어력 <b>${total}</b> (+강화 수치 별도)<br>필요 능력치: ${[pieces[1].rStr && '힘 ' + pieces[1].rStr, pieces[1].rAgi && '민첩 ' + pieces[1].rAgi, pieces[1].rEne && '에너지 ' + pieces[1].rEne].filter(Boolean).join(', ')}${src.length ? '<br>' + src.join('<br>') : ''}<br>※ 세트를 모두 <b>+7 이상</b>으로 맞추면 캐릭터가 빛나요.` };
  },
  skill(id) {
    const s = SKILLS[id], p = G.player, desc = { melee: '근접 단일 공격', proj: '원거리 투사체', bolt: '즉시 적중 번개', aoe_self: '자신 주변 범위 공격', aoe_target: '지정 위치 범위 공격', buff: '자신 강화', heal: '생명 회복', teleport: '지정 위치로 순간이동', multi: '부채꼴 3발 사격' }[s.type];
    const mine = s.cls === p.cls;
    return { html: `<b>${s.name}</b> — ${CLASSES[s.cls].name} · Lv.${s.lv} 습득 · 마나 ${s.mp}<br>${desc}${s.add ? ` · 추가 공격력 +${s.add}` : ''}${s.radius ? ` · 범위 ${s.radius}칸` : ''}${s.dur ? ` · 지속 ${s.dur}초` : ''}${s.freeze ? ' · 적을 얼림' : ''}${s.pierce ? ' · 관통' : ''}<br>${mine ? (p.lvl >= s.lv ? '이미 배웠어요. 숫자 키로 선택하고 <b>우클릭</b>으로 사용해요.' : `<span class="g-warn">Lv.${s.lv}에 배워요 (앞으로 ${s.lv - p.lvl}레벨)</span>`) : '다른 직업의 스킬이에요.'}`, chips: ['스킬 목록'] };
  },
  skills(cls) {
    const p = G.player, list = Object.entries(SKILLS).filter(([, s]) => s.cls === cls).sort((a, b) => a[1].lv - b[1].lv);
    return { html: `<b>${CLASSES[cls].name} 스킬</b><ul>${list.map(([id, s]) => `<li>${cls === p.cls && p.lvl >= s.lv ? '✅' : '🔒'} <b>${s.name}</b> Lv.${s.lv} · 마나 ${s.mp}</li>`).join('')}</ul>레벨이 오르면 자동으로 배우고 스킬바(1~9)에 추가돼요. 선택 후 <b>우클릭</b>으로 사용, 누르고 있으면 연속 사용해요.` };
  },
  jewel(id) {
    const t = {
      jewel_bless: '<b>축복의 보석</b>: 장비 위에 놓으면 <b>+0 → +6</b>까지 한 단계씩, <b>100% 성공</b>해요. 판매가도 높아요.',
      jewel_soul: '<b>영혼의 보석</b>: <b>+6 → +9</b> 강화에 사용. 성공률 <b>50%</b>(행운 옵션이 있으면 <b>75%</b>). 실패하면 +7 이상은 <b>+0으로 초기화</b>, +6은 +5로 떨어져요.',
      jewel_life: '<b>생명의 보석</b>: 추가 옵션을 +4씩 올려요(최대 +16). 성공률 <b>50%</b>, 실패하면 추가 옵션이 사라져요.',
      jewel_chaos: '<b>혼돈의 보석</b>: 노리아 <b>카오스 고블린</b>의 조합 재료예요. +10~+15 조합, 날개·카오스 무기 조합에 필요해요.',
      feather_loch: '<b>로크의 깃털</b>: 2차 날개 조합 재료. 데비아스 아이스 퀸 같은 보스나 Lv.40+ 몬스터에게서 드물게 나와요.'
    }[id];
    return { html: t + '<br>사용법: 인벤토리에서 보석을 클릭해 집은 뒤, 강화할 장비 위에 놓아요.', chips: ['보석 강화', '카오스 조합'] };
  },
  enchant() {
    return { html: `<b>장비 강화 단계</b><ul><li>+0 → +6: <b>축복의 보석</b> (100%)</li><li>+6 → +9: <b>영혼의 보석</b> (50%, 행운 75%) — 실패 시 +7 이상은 +0으로</li><li>+9 → +15: 노리아 <b>카오스 고블린</b> 조합 (60%→35%, 행운 +20%) — 실패 시 <b>아이템 소멸</b></li><li>추가 옵션: <b>생명의 보석</b> (50%)</li></ul>팁: <b>행운</b> 옵션이 붙은 장비에 영혼의 보석을 쓰면 훨씬 안전해요. 레벨이 높을수록 공격력·방어력 보너스가 크게 늘어요(+15는 기본값보다 +66).`, chips: ['카오스 조합', '영혼의 보석'] };
  },
  chaos() {
    const rows = Object.entries(PLUS_MIX).map(([lv, [n, r]]) => `<li>+${lv}: 축복 ${n} + 영혼 ${n} + 혼돈 1 · 성공 ${Math.round(r * 100)}% · ${fmt(50000 * (lv - 9))} 젠</li>`).join('');
    return { html: `<b>카오스 조합</b> (노리아 <b>카오스 고블린</b>)<ul>${rows}</ul><b>1차 날개 / 카오스 무기</b>: +4 이상 장비 여러 개 + 혼돈의 보석 (장비 가치가 높을수록 성공률↑, 최대 80%)<br><b>2차 날개</b>: 1차 날개 + 로크의 깃털 + 엑설런트 아이템 + 혼돈의 보석<br>※ 실패하면 재료가 모두 사라지니 주의하세요.`, chips: ['노리아 정보', '보석 강화'] };
  },
  options() {
    return { html: `<b>아이템 옵션</b><ul><li><span style="color:#86b4ff">행운</span>: 크리티컬 확률 +5%, 영혼의 보석 성공률 +25%</li><li><span style="color:#86b4ff">스킬</span>: 스킬 공격력 +15%</li><li><span style="color:#86b4ff">추가 옵션</span>: 공격력/방어력 +4 단위 (생명의 보석으로 상승)</li><li><span style="color:#3dff6a">엑설런트</span>(초록 이름): 공격력 +2%, 엑설런트 데미지 +10%, 사냥시 생명/마나 회복, 데미지 감소/반사, 최대 생명 +4% 등 — 드랍 확률 약 1.2%, 보스는 더 높아요</li></ul>`, chips: ['장비 추천'] };
  },
  stats(cls) {
    const p = G.player, C = CLASSES[cls];
    const plan = { DK: [['힘', 'str', 0.5, '공격력'], ['체력', 'vit', 0.25, '생명'], ['민첩', 'agi', 0.2, '방어·공속'], ['에너지', 'ene', 0.05, '스킬 공격력']],
      DW: [['에너지', 'ene', 0.6, '마력·마나'], ['체력', 'vit', 0.2, '생명'], ['민첩', 'agi', 0.2, '방어·시전속도'], ['힘', 'str', 0, '장비 요구치만']],
      FE: [['민첩', 'agi', 0.55, '활 공격력·방어'], ['체력', 'vit', 0.25, '생명'], ['힘', 'str', 0.15, '공격력 보조·요구치'], ['에너지', 'ene', 0.05, '치료·버프 효과']] }[cls];
    let html = `<b>${C.name} 추천 스탯</b><ul>${plan.map(([n, , r, why]) => `<li>${n} ${Math.round(r * 100)}% — ${why}</li>`).join('')}</ul>`;
    if (cls === p.cls && p.pts > 0) {
      let left = p.pts; const give = plan.map(([n, k, r]) => { const v = Math.floor(p.pts * r); left -= v; return [n, k, v]; }); give[0][2] += left;
      html += `지금 남은 포인트 <b>${p.pts}</b> → ${give.filter(g => g[2] > 0).map(g => `${g[0]} ${g[2]}`).join(', ')} 추천<br>채팅 명령으로 한 번에: ${give.filter(g => g[2] > 0).map(g => `<code>/${g[1]} ${g[2]}</code>`).join(' ')}`;
    } else if (cls === p.cls) html += '지금은 남은 포인트가 없어요. 레벨업마다 5포인트를 받아요.';
    html += '<br>※ 장비의 필요 능력치(힘·민첩·에너지)는 먼저 맞춰 두세요.';
    return { html, chips: ['장비 추천', '사냥터 추천'] };
  },
  gear() {
    const p = G.player, recs = [];
    const score = (it) => { const d = idef(it); if (WEAPON_KINDS.has(d.kind)) { const [a, b] = weaponDamage(it); return (a + b) / 2 + (d.wiz || 0) * 1.5; } return armorDef(it); };
    const shopIds = new Set(); Object.values(SHOPS).forEach(s => { (s.items || []).forEach(i => shopIds.add(i)); (s.sets || []).forEach(set => ['helm', 'armor', 'pants', 'gloves', 'boots'].forEach(k => ITEMS[set + '_' + k] && shopIds.add(set + '_' + k))); });
    for (const slot of ['weapon', 'shield', 'helm', 'armor', 'pants', 'gloves', 'boots']) {
      const cur = p.equip[slot], cs = cur ? score(cur) : 0;
      const cands = [...shopIds].map(id => makeItem(id)).filter(it => idef(it).slot === slot && !canEquip(p, it) && score(it) > cs);
      if (slot === 'shield' && p.equip.weapon && idef(p.equip.weapon).twoHand) continue;
      if (!cands.length) continue;
      const best = cands.sort((a, b) => score(b) - score(a))[0], price = Math.floor(itemValue(best) * 1.2);
      const where = this.sources(best.id).find(s => s.startsWith('상점')) || '';
      recs.push(`<li><b>${idef(best).name}</b> (${cur ? itemName(cur) : '없음'} → 성능 ${Math.round(cs)}→${Math.round(score(best))}) · ${fmt(price)} 젠 ${p.zen >= price ? '' : '<span class="g-warn">(젠 부족)</span>'}<br><small>${where}</small></li>`);
    }
    const unmet = [...shopIds].map(id => makeItem(id)).filter(it => idef(it).cls && idef(it).cls.includes(p.cls) && canEquip(p, it) && /부족/.test(canEquip(p, it))).length;
    return { html: recs.length ? `지금 착용 가능하고 더 좋은 상점 장비예요:<ul>${recs.join('')}</ul>${unmet ? `능력치가 모자라서 못 입는 장비도 ${unmet}개 있어요. 스탯을 올리면 선택지가 늘어요.` : ''}` : `상점 장비 중에는 지금보다 좋은 착용 가능한 장비가 없어요. 사냥으로 드랍되는 장비를 노리거나, 보석으로 강화해 보세요.`, chips: ['보석 강화', '스탯 추천', '사냥터 추천'] };
  },
  status() {
    const p = G.player, tips = [];
    const pots = p.inv.filter(e => /^hp_|apple/.test(e.item.id)).reduce((a, e) => a + e.item.qty, 0);
    if (p.pts > 0) tips.push(`남은 스탯 포인트가 <b>${p.pts}</b> 있어요 — "스탯 추천"이라고 물어보세요.`);
    if (pots < 5) tips.push(`치유 물약이 <b>${pots}개</b>뿐이에요. 마을 포션 상점에서 사 두세요.`);
    const free = INV_W * INV_H - p.inv.reduce((a, e) => a + idef(e.item).w * idef(e.item).h, 0);
    if (free < 10) tips.push('인벤토리가 거의 찼어요. 상점에서 팔거나 창고에 맡기세요.');
    ['weapon', 'armor', 'pants', 'boots', 'helm', 'gloves'].forEach(k => { if (!p.equip[k]) tips.push(`${{ weapon: '무기', armor: '갑옷', pants: '바지', boots: '부츠', helm: '투구', gloves: '장갑' }[k]} 칸이 비어 있어요.`); });
    const nextSkill = Object.values(SKILLS).filter(s => s.cls === p.cls && s.lv > p.lvl).sort((a, b) => a.lv - b.lv)[0];
    return { html: `<b>${esc(p.name)}</b> — ${CLASSES[p.cls].name} Lv.${p.lvl}<br>생명 ${Math.ceil(p.hp)}/${p.maxHp} · 마나 ${Math.floor(p.mp)}/${p.maxMp} · 공격력 ${p.minDmg}~${p.maxDmg}${p.wizMin != null ? ` · 마력 ${p.wizMin}~${p.wizMax}` : ''} · 방어력 ${p.def}<br>다음 레벨까지 ${fmt(p.expNeeded() - p.exp)} · 젠 ${fmt(p.zen)}${nextSkill ? `<br>다음 스킬: <b>${nextSkill.name}</b> (Lv.${nextSkill.lv})` : ''}${tips.length ? '<ul>' + tips.map(t => `<li>${t}</li>`).join('') + '</ul>' : '<br>준비 상태가 좋아요! 사냥하러 가볼까요?'}`, chips: ['사냥터 추천', '장비 추천'] };
  },
  npc([mid, n]) {
    const roles = { potions: '물약·마을 귀환 문서', weapons: '무기·방패', armors: '방어구', weapons2: '중급 무기', armors2: '중급 방어구', elfshop: '활·요정 방어구·물약', vault: '창고(아이템·젠 보관)', chaos: '카오스 조합(+10~+15, 날개)' };
    return { html: `<b>${n.name}</b>은(는) <b>${MAPS[mid].name}</b> 마을(좌표 ${Math.floor(n.x)}, ${Math.floor(n.y)})에 있어요.${n.shop ? `<br>역할: ${roles[n.shop] || n.shop}` : ''}<br>NPC를 <b>좌클릭</b>하면 걸어가서 대화해요.${G.map.id !== mid ? `<br>지금은 다른 지역이에요 — <kbd>M</kbd>으로 ${MAPS[mid].name}에 갈 수 있어요.` : ''}` };
  },
  shops() {
    const list = [];
    Object.entries(MAPS).forEach(([mid, m]) => (m.npcs || []).filter(n => n.shop).forEach(n => list.push(`<li>${m.name}: <b>${n.name}</b> — ${{ potions: '물약', weapons: '무기', armors: '방어구', weapons2: '무기(중급)', armors2: '방어구(중급)', elfshop: '요정 상점', vault: '창고', chaos: '카오스 조합', guide: '안내' }[n.shop] || ''}</li>`)));
    return { html: `<b>마을 NPC</b><ul>${list.join('')}</ul>`, chips: ['카오스 고블린', '보석 강화'] };
  },
  mapInfo(mid) {
    const m = MAPS[mid], p = G.player;
    const mons = m.spawns.map(([id]) => MONSTERS[id]).map(d => `${d.name}(Lv.${d.lv})${d.boss ? ' [보스]' : ''}`).join(', ');
    return { html: `<b>${m.name}</b> — 입장 Lv.${m.warpLv}+ · 이동 비용 ${m.warpCost ? fmt(m.warpCost) + ' 젠' : '무료'}${p.lvl < m.warpLv ? ` <span class="g-warn">(앞으로 ${m.warpLv - p.lvl}레벨)</span>` : ''}<br>몬스터: ${mons}${m.npcs ? '<br>NPC: ' + m.npcs.map(n => n.name).join(', ') : '<br>마을이 없는 사냥 지역이에요. 물약을 넉넉히 챙기세요.'}`, chips: [m.name + ' 사냥터', '사냥터 추천'] };
  },
  maps() {
    const p = G.player;
    return { html: `<b>지역 이동</b>은 <kbd>M</kbd> 키 (또는 <code>/move 지역이름</code>)<ul>${WARP_ORDER.map(mid => `<li>${p.lvl >= MAPS[mid].warpLv ? '✅' : '🔒'} ${MAPS[mid].name} — Lv.${MAPS[mid].warpLv}+, ${MAPS[mid].warpCost ? fmt(MAPS[mid].warpCost) + ' 젠' : '무료'}</li>`).join('')}</ul>` };
  },
  controls() {
    return { html: `<ul><li>좌클릭: 이동(누르고 있으면 계속) · 공격 · NPC 대화 · 줍기</li><li>우클릭: 선택한 스킬 사용 (누르면 연속)</li><li>1~9 스킬 선택 · <kbd>Q</kbd>/<kbd>W</kbd> 물약 · <kbd>Space</kbd> 줍기</li><li><kbd>I</kbd> 인벤토리 · <kbd>C</kbd> 캐릭터 · <kbd>M</kbd> 이동 · <kbd>H</kbd> 헬퍼 · <kbd>G</kbd> 도우미 · <kbd>Tab</kbd> 큰 지도 · <kbd>Enter</kbd> 채팅</li><li>인벤토리: 클릭으로 집기/놓기, 우클릭으로 사용·장착·판매</li></ul>` };
  },
  fallback(q) {
    // try loose matching on single words
    const words = q.split(/\s+/).filter(w => w.length >= 2);
    for (const w of words) for (const e of this.index) if (e.key.includes(this.norm(w)) && e.key.length <= this.norm(w).length + 4) {
      const r = { monster: () => this.monster(e.ref), item: () => this.item(e.ref), map: () => this.mapInfo(e.ref), skill: () => this.skill(e.ref), npc: () => this.npc(e.ref), set: () => this.armorSet(e.ref), class: () => this.stats(e.ref) }[e.type];
      if (r) { const a = r(); a.html = `혹시 <b>${e.name}</b>을(를) 찾으셨나요?<br>` + a.html; return a; }
    }
    return { html: '음, 잘 모르겠어요. 아래처럼 물어봐 주세요!', chips: this.defaultChips().concat(['단축키']) };
  }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------
// chat window
// ---------------------------------------------------------------------
const GuideUI = {
  inited: false,
  init() {
    if (this.inited) return; this.inited = true;
    const inp = $('guide-input');
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.send(); if (e.key === 'Escape') UI.toggle('guide', false); });
    $('guide-send').onclick = () => this.send();
  },
  open() {
    this.init();
    UI.toggle('guide', true);
    if (!$('guide-log').children.length) this.bot(Guide.answer('안녕'));
    setTimeout(() => $('guide-input').focus(), 30);
  },
  send(text) {
    const inp = $('guide-input'), q = (text != null ? text : inp.value).trim();
    if (!q) return;
    inp.value = '';
    this.add('me', esc(q));
    let a;
    try { a = Guide.answer(q); } catch (e) { a = { html: '앗, 답을 만드는 중에 문제가 생겼어요. 다르게 물어봐 주세요.' }; }
    setTimeout(() => { this.bot(a); SFX.play('click'); }, 220);
  },
  bot(a) { this.add('bot', a.html, a.chips); },
  add(who, html, chips) {
    const log = $('guide-log'), d = document.createElement('div');
    d.className = 'g-msg ' + who; d.innerHTML = html;
    if (chips && chips.length) {
      const c = document.createElement('div'); c.className = 'g-chips';
      chips.forEach(t => { const b = document.createElement('button'); b.textContent = t; b.onmousedown = e => { e.stopPropagation(); this.send(t); }; c.appendChild(b); });
      d.appendChild(c);
    }
    log.appendChild(d);
    while (log.children.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
};
