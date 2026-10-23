// ---------------------------------------------------------------------
// UI: inventory grids, windows, HUD, input, title / character select
// ---------------------------------------------------------------------
const $ = id => document.getElementById(id);
const CELL = 32;

// ----------------------------------------------------- grid inventory logic
const Inv = {
  occ(grid, w, h, ignore) {
    const o = new Array(w * h).fill(null);
    for (const e of grid) { if (e === ignore) continue; const d = idef(e.item); for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) o[(e.y + j) * w + e.x + i] = e; }
    return o;
  },
  fits(grid, item, x, y, gw = INV_W, gh = INV_H, ignore) {
    const d = idef(item); if (x < 0 || y < 0 || x + d.w > gw || y + d.h > gh) return false;
    const o = this.occ(grid, gw, gh, ignore);
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (o[(y + j) * gw + x + i]) return false;
    return true;
  },
  findSpace(grid, item, gw = INV_W, gh = INV_H) {
    const d = idef(item);
    if (d.stack) { const s = grid.find(e => e.item.id === item.id && e.item.qty + item.qty <= d.stack); if (s) return { stack: s }; }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (this.fits(grid, item, x, y, gw, gh)) return { x, y };
    return null;
  },
  add(grid, item, gw = INV_W, gh = INV_H) {
    const sp = this.findSpace(grid, item, gw, gh); if (!sp) return false;
    if (sp.stack) sp.stack.item.qty += item.qty; else grid.push({ item, x: sp.x, y: sp.y });
    return true;
  },
  at(grid, x, y, gw = INV_W, gh = INV_H) { return this.occ(grid, gw, gh)[y * gw + x] || null; }
};

// ----------------------------------------------------- icon painter
const ICON_CACHE = new Map();
function paintIcon(it) {
  const d = idef(it), w = d.w * CELL, h = d.h * CELL;
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  const col = d.color || '#ccc', exc = it.exc && it.exc.length;
  const metal = exc ? '#b8ffc0' : it.lvl >= 7 ? '#ffe6a0' : '#d8dce8';
  g.lineJoin = 'round';
  const grad = (a, b, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  switch (d.kind) {
    case 'sword': {
      g.save(); g.translate(w / 2, h / 2); g.rotate(0.0);
      g.fillStyle = grad(metal, shade('#9098a8', -0.2), -4, 0, 4, 0);
      g.beginPath(); g.moveTo(-4, h / 2 - 22); g.lineTo(4, h / 2 - 22); g.lineTo(3, -h / 2 + 10); g.lineTo(0, -h / 2 + 3); g.lineTo(-3, -h / 2 + 10); g.fill();
      g.fillStyle = '#c8a040'; g.fillRect(-10, h / 2 - 23, 20, 4);
      g.fillStyle = '#5a3a1a'; g.fillRect(-2.5, h / 2 - 19, 5, 13);
      g.fillStyle = '#c8a040'; g.beginPath(); g.arc(0, h / 2 - 5, 3.5, 0, 7); g.fill();
      g.restore(); break;
    }
    case 'axe': {
      g.fillStyle = '#5a3a1a'; g.fillRect(w / 2 - 2, 6, 4, h - 10);
      g.fillStyle = grad(metal, '#707888', 0, 0, w, 0);
      g.beginPath(); g.moveTo(w / 2, 10); g.quadraticCurveTo(w - 2, 4, w - 4, 34); g.quadraticCurveTo(w / 2 + 6, 28, w / 2, 32); g.fill();
      if (d.dmax > 60) { g.beginPath(); g.moveTo(w / 2, 10); g.quadraticCurveTo(2, 4, 4, 34); g.quadraticCurveTo(w / 2 - 6, 28, w / 2, 32); g.fill(); }
      break;
    }
    case 'staff': {
      g.fillStyle = grad('#6a4a2a', '#3a2414', w / 2 - 3, 0, w / 2 + 3, 0); g.fillRect(w / 2 - 2.5, 18, 5, h - 22);
      const orb = exc ? '#7f7' : d.wiz > 30 ? '#f8c' : d.wiz > 18 ? '#fc6' : '#8cf';
      const rg = g.createRadialGradient(w / 2 - 2, 10, 1, w / 2, 12, 9); rg.addColorStop(0, '#fff'); rg.addColorStop(1, orb);
      g.fillStyle = rg; g.beginPath(); g.arc(w / 2, 12, 8, 0, 7); g.fill();
      g.strokeStyle = '#c8a040'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, 12, 9, 0.3, Math.PI - 0.3); g.stroke();
      break;
    }
    case 'bow': {
      g.strokeStyle = grad('#c08a4a', '#5a3a1a', 0, 0, w, h); g.lineWidth = 5;
      g.beginPath(); g.moveTo(w - 14, 6); g.quadraticCurveTo(-6, h / 2, w - 14, h - 6); g.stroke();
      g.strokeStyle = '#eee'; g.lineWidth = 1; g.beginPath(); g.moveTo(w - 14, 6); g.lineTo(w - 14, h - 6); g.stroke();
      if (exc || it.lvl >= 7) { g.strokeStyle = metal; g.lineWidth = 2; g.beginPath(); g.moveTo(w - 14, 6); g.quadraticCurveTo(-6, h / 2, w - 14, h - 6); g.stroke(); }
      break;
    }
    case 'shield': {
      g.fillStyle = grad('#9a8a7a', '#4a3a2a', 0, 0, w, h); g.strokeStyle = metal; g.lineWidth = 3;
      g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, 6); g.lineTo(w - 6, h / 2); g.quadraticCurveTo(w / 2, h, w / 2, h - 4); g.quadraticCurveTo(w / 2, h, 6, h / 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = metal; g.beginPath(); g.arc(w / 2, h / 2 - 4, 6, 0, 7); g.fill();
      break;
    }
    case 'helm': {
      g.fillStyle = grad(shade(col, 0.3), shade(col, -0.4), 0, 0, w, h);
      g.beginPath(); g.arc(w / 2, h / 2 + 4, 24, Math.PI, 0); g.lineTo(w / 2 + 24, h - 8); g.lineTo(w / 2 + 10, h - 8); g.lineTo(w / 2 + 10, h / 2 + 8); g.lineTo(w / 2 - 10, h / 2 + 8); g.lineTo(w / 2 - 10, h - 8); g.lineTo(w / 2 - 24, h - 8); g.fill();
      g.fillStyle = d.trim; g.fillRect(w / 2 - 2, h / 2 - 20, 4, 26);
      break;
    }
    case 'armor': {
      g.fillStyle = grad(shade(col, 0.3), shade(col, -0.45), 0, 0, w, 0);
      g.beginPath(); g.moveTo(10, 10); g.lineTo(w / 2 - 8, 6); g.quadraticCurveTo(w / 2, 14, w / 2 + 8, 6); g.lineTo(w - 10, 10); g.lineTo(w - 4, 30); g.lineTo(w - 14, 32); g.lineTo(w - 14, h - 8); g.lineTo(14, h - 8); g.lineTo(14, 32); g.lineTo(4, 30); g.closePath(); g.fill();
      g.fillStyle = d.trim; g.fillRect(w / 2 - 2, 14, 4, h - 24); g.fillRect(14, h - 22, w - 28, 4);
      break;
    }
    case 'pants': {
      g.fillStyle = grad(shade(col, 0.2), shade(col, -0.45), 0, 0, w, 0);
      g.beginPath(); g.moveTo(10, 6); g.lineTo(w - 10, 6); g.lineTo(w - 6, h - 4); g.lineTo(w / 2 + 3, h - 4); g.lineTo(w / 2, 24); g.lineTo(w / 2 - 3, h - 4); g.lineTo(6, h - 4); g.closePath(); g.fill();
      g.fillStyle = d.trim; g.fillRect(10, 6, w - 20, 4);
      break;
    }
    case 'gloves': {
      g.fillStyle = grad(shade(col, 0.2), shade(col, -0.45), 0, 0, w, h);
      g.beginPath(); g.moveTo(16, h - 6); g.lineTo(14, 26); g.lineTo(18, 10); g.lineTo(26, 8); g.lineTo(34, 8); g.lineTo(44, 14); g.lineTo(52, 28); g.lineTo(46, 32); g.lineTo(42, 26); g.lineTo(44, h - 6); g.closePath(); g.fill();
      g.fillStyle = d.trim; g.fillRect(16, h - 16, 28, 5);
      break;
    }
    case 'boots': {
      g.fillStyle = grad(shade(col, 0.2), shade(col, -0.45), 0, 0, w, h);
      g.beginPath(); g.moveTo(18, 6); g.lineTo(38, 6); g.lineTo(38, 38); g.lineTo(56, 46); g.lineTo(56, h - 6); g.lineTo(14, h - 6); g.lineTo(18, 40); g.closePath(); g.fill();
      g.fillStyle = d.trim; g.fillRect(18, 6, 20, 5); g.fillRect(14, h - 12, 42, 4);
      break;
    }
    case 'wings': {
      for (const sd of [-1, 1]) {
        g.save(); g.translate(w / 2, h / 2 + 6); g.scale(sd, 1);
        g.fillStyle = grad(d.color, d.trim, 0, -20, 44, 10);
        g.beginPath(); g.moveTo(2, -4); g.quadraticCurveTo(20, -36, 46, -28);
        if (d.cls[0] === 'DK') { g.lineTo(40, -14); g.lineTo(42, 0); g.lineTo(30, -4); g.lineTo(28, 12); g.lineTo(16, 4); } else { for (let i = 0; i < 4; i++) g.quadraticCurveTo(44 - i * 9, -10 + i * 6, 38 - i * 10, -6 + i * 7); }
        g.lineTo(2, 6); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke(); g.restore();
      }
      break;
    }
    case 'ring': {
      g.strokeStyle = grad('#ffe080', '#a07020', 0, 0, w, h); g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2 + 3, 9, 0, 7); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(w / 2, h / 2 - 7, 5, 0, 7); g.fill();
      break;
    }
    case 'pendant': {
      g.strokeStyle = '#d8b060'; g.lineWidth = 1.5; g.beginPath(); g.arc(w / 2, 6, 10, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w / 2 + 7, 21); g.lineTo(w / 2, 29); g.lineTo(w / 2 - 7, 21); g.fill();
      break;
    }
    case 'potion': {
      if (it.id === 'apple') { g.fillStyle = '#d22'; g.beginPath(); g.arc(w / 2, h / 2 + 2, 10, 0, 7); g.fill(); g.fillStyle = '#4a2'; g.fillRect(w / 2, 4, 3, 7); g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(w / 2 - 4, h / 2 - 2, 3, 0, 7); g.fill(); break; }
      const sz = it.id.endsWith('large') ? 1.15 : it.id.endsWith('small') ? 0.8 : 1;
      g.save(); g.translate(w / 2, h / 2 + 2); g.scale(sz, sz);
      g.fillStyle = 'rgba(220,240,255,0.5)'; g.fillRect(-3, -14, 6, 6);
      g.fillStyle = '#8a5a2a'; g.fillRect(-3.5, -16, 7, 3);
      const rg = g.createRadialGradient(-3, -2, 1, 0, 2, 11); rg.addColorStop(0, '#fff'); rg.addColorStop(0.3, col); rg.addColorStop(1, shade(col, -0.5));
      g.fillStyle = rg; g.beginPath(); g.arc(0, 2, 10, 0, 7); g.fill(); g.restore();
      break;
    }
    case 'scroll': {
      g.fillStyle = '#e8dcb0'; g.fillRect(6, 8, w - 12, h - 16); g.fillStyle = '#a08050'; g.fillRect(4, 6, w - 8, 4); g.fillRect(4, h - 10, w - 8, 4);
      g.fillStyle = '#5a3'; g.fillRect(w / 2 - 4, h / 2 - 3, 8, 6);
      break;
    }
    case 'jewel': {
      const rg = g.createRadialGradient(w / 2 - 3, h / 2 - 4, 1, w / 2, h / 2, 13); rg.addColorStop(0, '#fff'); rg.addColorStop(0.35, col); rg.addColorStop(1, shade(col, -0.55));
      g.fillStyle = rg; g.beginPath();
      if (it.id === 'jewel_chaos') { g.moveTo(w / 2, 3); g.lineTo(w - 6, h / 2); g.lineTo(w / 2, h - 3); g.lineTo(6, h / 2); }
      else if (it.id === 'jewel_soul') { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; g.lineTo(w / 2 + Math.cos(a) * 12, h / 2 + Math.sin(a) * 12); } }
      else if (it.id === 'jewel_life') { g.arc(w / 2, h / 2, 11, 0, 7); }
      else { g.moveTo(w / 2, 4); g.lineTo(w - 5, h / 2 - 3); g.lineTo(w / 2 + 6, h - 4); g.lineTo(w / 2 - 6, h - 4); g.lineTo(5, h / 2 - 3); }
      g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.stroke();
      break;
    }
    case 'misc': {
      g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2 - 6, h - 4); g.lineTo(w / 2 + 6, 6); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(w / 2 + 2, h / 2 - 4, 7, 22, 0.35, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,200,80,0.6)'; g.beginPath(); g.ellipse(w / 2 + 4, h / 2 - 8, 3, 12, 0.35, 0, 7); g.fill();
      break;
    }
  }
  return c;
}

// ----------------------------------------------------- UI
const UI = {
  dirty: true, open: {}, shop: null, chaosBox: [], tipFor: null, mm: null,
  iconFor(it) {
    const k = it.id + (it.exc && it.exc.length ? 'e' : '') + (it.lvl >= 7 ? 'g' : '');
    if (!ICON_CACHE.has(k)) { const c = paintIcon(it); ICON_CACHE.set(k, c); c.url = c.toDataURL(); }
    return ICON_CACHE.get(k);
  },
  init() {
    if (this.inited) { this.dirty = true; return; }
    this.inited = true;
    document.querySelectorAll('.win .close').forEach(b => b.onclick = () => this.toggle(b.closest('.win').dataset.w, false));
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => this.toggle(b.dataset.open));
    $('btn-helper').onclick = () => toggleHelper();
    $('btn-quit').onclick = () => quitToSelect();
    $('btn-sound').onclick = () => { SFX.muted = !SFX.muted; $('btn-sound').textContent = SFX.muted ? '🔇' : '🔊'; };
    $('chaos-mix').onclick = () => this.mixChaos();
    $('vault-dep').onclick = () => this.vaultZen(1);
    $('vault-wd').onclick = () => this.vaultZen(-1);
    $('chatInput').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = e.target.value.trim(); e.target.value = ''; e.target.blur(); $('chatInput').style.display = 'none'; if (v) chatCommand(v); }
      if (e.key === 'Escape') { e.target.blur(); $('chatInput').style.display = 'none'; }
    });
    document.querySelectorAll('.win').forEach(w => w.addEventListener('mousedown', e => e.stopPropagation()));
    bindGrid($('inv-grid'), () => G.player.inv, INV_W, INV_H, 'inv');
    bindGrid($('chaos-grid'), () => this.chaosBox, 8, 4, 'chaos');
    bindGrid($('vault-grid'), () => G.player.vault, 8, 10, 'vault');
    document.querySelectorAll('.eq').forEach(el => {
      el.addEventListener('mousedown', e => { e.preventDefault(); clickEquip(el.dataset.slot, e.button); });
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('mousemove', e => { const it = G.player.equip[el.dataset.slot]; if (it && !G.held) this.showTip(it, e); else this.hideTip(); });
      el.addEventListener('mouseleave', () => this.hideTip());
    });
    $('shop-list').addEventListener('mousedown', e => {
      if (G.held && G.held.item) { sellHeld(); e.stopPropagation(); }
    });
  },
  toggle(w, force) {
    const el = $('win-' + w); if (!el) return;
    const on = force != null ? force : el.style.display !== 'block';
    if (!on && w === 'chaos') this.returnChaos();
    if (!on && (w === 'shop' || w === 'vault' || w === 'chaos')) this.shop = null;
    el.style.display = on ? 'block' : 'none';
    if (on && (w === 'shop' || w === 'chaos' || w === 'vault')) $('win-inv').style.display = 'block';
    SFX.play('click'); this.dirty = true;
  },
  isOpen(w) { return $('win-' + w).style.display === 'block'; },
  closeAll() { document.querySelectorAll('.win').forEach(w => { if (w.dataset.w === 'chaos' && w.style.display === 'block') this.returnChaos(); w.style.display = 'none'; }); this.shop = null; },
  openNpc(n) {
    if (!n.shop) { this.msg(`${n.name}: "로랜시아를 지키는 것이 나의 임무다."`, 'npc'); return; }
    if (n.shop === 'chaos') { this.toggle('chaos', true); this.msg('카오스 고블린: "크크크... 무엇을 조합해볼까?"', 'npc'); return; }
    if (n.shop === 'vault') { this.toggle('vault', true); return; }
    this.shop = n.shop; $('shop-title').textContent = n.name + ' - ' + SHOPS[n.shop].title;
    this.toggle('shop', true); this.renderShop();
  },
  msg(t, cls = '') {
    const box = $('chat'); const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = t; box.appendChild(d);
    while (box.children.length > 60) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  },
  mapBanner(n) { const b = $('banner'); b.textContent = n; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); },
  levelUp(l) { const b = $('lvup'); b.innerHTML = 'LEVEL UP!<small>Lv. ' + l + '</small>'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); },

  // --------------- HUD per frame
  update(dt) {
    const p = G.player;
    $('hp-fill').style.height = (p.hp / p.maxHp * 100) + '%';
    $('mp-fill').style.height = (p.mp / p.maxMp * 100) + '%';
    $('hp-txt').textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
    $('mp-txt').textContent = Math.floor(p.mp) + ' / ' + p.maxMp;
    const e0 = expTotal(p.lvl), e1 = p.expNeeded(), pr = p.lvl >= MAX_LEVEL ? 1 : (p.exp - e0) / (e1 - e0);
    $('exp-fill').style.width = (pr * 100) + '%';
    $('exp-txt').textContent = `Lv.${p.lvl}  EXP ${fmt(p.exp)} / ${fmt(e1)}  (${(pr * 100).toFixed(2)}%)`;
    $('loc').textContent = `${G.map.def.name} (${Math.floor(p.x)}, ${Math.floor(p.y)})${inTown(p.x, p.y) ? ' · 안전지대' : ''}`;
    const tg = p.target instanceof Monster ? p.target : G.hover && G.hover.kind === 'mon' ? G.hover.ref : null;
    const tf = $('target');
    if (tg && !tg.dead) { tf.style.display = 'block'; $('t-name').textContent = `${tg.def.name}  Lv.${tg.def.lv}`; $('t-fill').style.width = (tg.hp / tg.def.hp * 100) + '%'; $('t-hp').textContent = `${Math.ceil(tg.hp)} / ${tg.def.hp}`; }
    else tf.style.display = 'none';
    // buffs
    const bs = Object.values(p.buffs).map(b => `<span title="${b.name}">${b.icon}<i>${Math.ceil(b.t)}</i></span>`).join('');
    if ($('buffs').innerHTML !== bs) $('buffs').innerHTML = bs;
    $('helper-ind').style.display = G.helper ? 'block' : 'none';
    // cooldown overlay on skillbar
    const cdk = p.cd > 0 ? clamp(p.cd / p.attackInterval(), 0, 1) : 0;
    document.querySelectorAll('#skillbar .sk').forEach(el => { el.querySelector('.cdv').style.height = (cdk * 100) + '%'; el.classList.toggle('nomp', SKILLS[el.dataset.s] && p.mp < SKILLS[el.dataset.s].mp); });
    // potions count
    const cnt = ids => p.inv.filter(e => ids.includes(e.item.id)).reduce((a, e) => a + e.item.qty, 0);
    $('q-cnt').textContent = cnt(['hp_small', 'hp_medium', 'hp_large', 'apple']);
    $('w-cnt').textContent = cnt(['mp_small', 'mp_medium', 'mp_large']);
    this.drawMinimap();
    // held item follows cursor
    const hd = $('held');
    if (G.held) { hd.style.display = 'block'; hd.style.left = (G.mouse.x - idef(G.held.item).w * CELL / 2) + 'px'; hd.style.top = (G.mouse.y - idef(G.held.item).h * CELL / 2) + 'px'; }
    else hd.style.display = 'none';
    if (this.dirty) { this.dirty = false; this.renderAll(); }
  },
  renderAll() {
    const p = G.player;
    renderGrid($('inv-grid'), p.inv, INV_W, INV_H);
    document.querySelectorAll('.eq').forEach(el => {
      const it = p.equip[el.dataset.slot];
      el.innerHTML = it ? `<img src="${this.iconFor(it).url}"><b style="color:${itemColor(it)}">${it.lvl ? '+' + it.lvl : ''}</b>` : `<span>${el.dataset.label}</span>`;
      el.classList.toggle('exc', !!(it && it.exc.length));
    });
    $('zen').textContent = fmt(p.zen);
    if (this.isOpen('char')) this.renderChar();
    if (this.isOpen('chaos')) { renderGrid($('chaos-grid'), this.chaosBox, 8, 4); this.renderChaosInfo(); }
    if (this.isOpen('vault')) { renderGrid($('vault-grid'), p.vault, 8, 10); $('vault-zen').textContent = fmt(p.vaultZen); }
    if (this.isOpen('shop')) this.renderShop();
    if (this.isOpen('warp')) this.renderWarp();
    this.renderSkillbar();
    $('held').innerHTML = G.held ? `<img src="${this.iconFor(G.held.item).url}" style="width:${idef(G.held.item).w * CELL}px;height:${idef(G.held.item).h * CELL}px">` : '';
    $('pts-badge').style.display = p.pts > 0 ? 'block' : 'none';
  },
  renderSkillbar() {
    const p = G.player;
    const html = p.hotbar.map((k, i) => { const s = SKILLS[k]; return `<div class="sk ${p.activeSkill === k ? 'on' : ''}" data-s="${k}" title="${s.name} (MP ${s.mp})"><span class="ic" style="color:${s.color}">${s.icon}</span><i>${i + 1}</i><em>${s.name}</em><div class="cdv"></div></div>`; }).join('');
    const sb = $('skillbar');
    if (sb.dataset.h !== html) {
      sb.dataset.h = html; sb.innerHTML = html;
      sb.querySelectorAll('.sk').forEach(el => el.onmousedown = e => { e.stopPropagation(); p.activeSkill = el.dataset.s; SFX.play('click'); this.dirty = true; });
    }
  },
  renderChar() {
    const p = G.player, C = p.C, s = p.stats;
    const row = (k, n) => `<div class="st"><span>${n}</span><b>${s[k]}</b>${p.pts > 0 ? `<button data-k="${k}">+</button>` : ''}</div>`;
    const dmg = p.cls === 'DW' ? `<div class="kv"><span>마력</span><b>${p.wizMin} ~ ${p.wizMax}</b></div>` : '';
    $('char-body').innerHTML = `
      <div class="ch-head"><b>${p.name}</b><span>${C.name} · Lv.${p.lvl}</span></div>
      <div class="kv"><span>경험치</span><b>${fmt(p.exp)} / ${fmt(p.expNeeded())}</b></div>
      <div class="pts">남은 포인트: <b>${p.pts}</b> <small>(Shift+클릭: 10씩)</small></div>
      ${row('str', '힘')}
      <div class="kv"><span>공격력</span><b>${p.minDmg} ~ ${p.maxDmg}</b></div>${dmg}
      <div class="kv"><span>공격 성공률</span><b>${p.atkRate}</b></div>
      ${row('agi', '민첩')}
      <div class="kv"><span>방어력</span><b>${p.def}</b></div>
      <div class="kv"><span>방어율</span><b>${p.defRate}</b></div>
      <div class="kv"><span>공격 속도</span><b>${p.atkSpd}</b></div>
      ${row('vit', '체력')}
      <div class="kv"><span>생명</span><b>${Math.ceil(p.hp)} / ${p.maxHp}</b></div>
      ${row('ene', '에너지')}
      <div class="kv"><span>마나</span><b>${Math.floor(p.mp)} / ${p.maxMp}</b></div>
      <div class="kv"><span>크리티컬 / 엑설런트</span><b>${Math.round(p.statsCache.crit * 100)}% / ${Math.round(p.statsCache.excRate * 100)}%</b></div>
      <div class="kv"><span>데미지 흡수/감소</span><b>${Math.round((p.statsCache.absorb + p.statsCache.reduce) * 100)}%</b></div>`;
    $('char-body').querySelectorAll('button').forEach(b => b.onmousedown = e => {
      const n = Math.min(p.pts, e.shiftKey ? 10 : 1); p.stats[b.dataset.k] += n; p.pts -= n; p.calc(); SFX.play('click'); this.dirty = true;
    });
  },
  renderShop() {
    const p = G.player, sh = SHOPS[this.shop]; if (!sh) return;
    const ids = (sh.items || []).slice();
    (sh.sets || []).forEach(set => ['helm', 'armor', 'pants', 'gloves', 'boots'].forEach(k => { if (ITEMS[set + '_' + k]) ids.push(set + '_' + k); }));
    const list = ids.map(id => makeItem(id)).sort((a, b) => (idef(b).cls || []).includes(p.cls) - (idef(a).cls || []).includes(p.cls));
    this.shopItems = list;
    $('shop-list').innerHTML = list.map((it, i) => {
      const d = idef(it), price = d.price || Math.floor(itemValue(it) * 1.2), ok = !d.cls || d.cls.includes(p.cls);
      return `<div class="si ${ok ? '' : 'dim'}" data-i="${i}"><img src="${this.iconFor(it).url}"><div><b>${d.name}</b><small>${fmt(price)} 젠</small></div></div>`;
    }).join('') + '<div class="shop-hint">아이템을 들고 이 창을 클릭하면 판매 · 우클릭 판매</div>';
    $('shop-list').querySelectorAll('.si').forEach(el => {
      const it = list[+el.dataset.i];
      el.onmousedown = e => { e.stopPropagation(); if (G.held) { sellHeld(); return; } buyItem(it); };
      el.onmousemove = e => this.showTip(it, e); el.onmouseleave = () => this.hideTip();
    });
  },
  renderWarp() {
    const p = G.player;
    $('warp-list').innerHTML = WARP_ORDER.map(id => {
      const m = MAPS[id], ok = p.lvl >= m.warpLv;
      return `<div class="wp ${ok ? '' : 'dim'} ${p.map === id ? 'cur' : ''}" data-m="${id}"><b>${m.name}</b><span>Lv.${m.warpLv}+</span><small>${m.warpCost ? fmt(m.warpCost) + ' 젠' : '무료'}</small></div>`;
    }).join('');
    $('warp-list').querySelectorAll('.wp').forEach(el => el.onmousedown = e => {
      e.stopPropagation();
      const m = MAPS[el.dataset.m];
      if (p.lvl < m.warpLv) return this.msg(`레벨 ${m.warpLv} 이상만 이동할 수 있습니다.`, 'warn');
      if (p.zen < m.warpCost) return this.msg('젠이 부족합니다.', 'warn');
      if (p.dead) return;
      p.zen -= m.warpCost; SFX.play('warp'); this.toggle('warp', false); loadMap(el.dataset.m); saveGame();
    });
  },
  renderChaosInfo() {
    const a = analyzeChaos(this.chaosBox.map(e => e.item), G.player);
    $('chaos-info').innerHTML = `<b>${a.name}</b>${a.need ? `<small>필요: ${a.need}</small>` : ''}<div>성공 확률: <em>${Math.round(a.rate * 100)}%</em>${a.zen ? ` · 필요 젠: ${fmt(a.zen)}` : ''}</div>`;
    $('chaos-mix').disabled = !a.ok;
  },
  mixChaos() {
    const p = G.player, items = this.chaosBox.map(e => e.item);
    const r = doChaos(items, p);
    if (!r.ok) { this.msg(r.msg, 'warn'); return; }
    this.chaosBox = [];
    r.result.forEach(it => Inv.add(this.chaosBox, it, 8, 4));
    SFX.play(r.success ? 'success' : 'fail');
    this.msg(r.msg + (r.success && r.result[0] ? ` → ${itemName(r.result[0])}` : ''), r.success ? 'gold' : 'warn');
    const el = $('chaos-grid'); el.classList.remove('flash-ok', 'flash-no'); void el.offsetWidth; el.classList.add(r.success ? 'flash-ok' : 'flash-no');
    this.dirty = true; saveGame();
  },
  returnChaos() {
    const p = G.player; if (!p) return;
    for (const e of this.chaosBox) if (!Inv.add(p.inv, e.item)) G.drops.push({ x: p.x, y: p.y, item: e.item, t: G.time });
    this.chaosBox = []; this.dirty = true;
  },
  vaultZen(dir) {
    const p = G.player, v = parseInt(prompt(dir > 0 ? '보관할 젠' : '찾을 젠', '0'), 10);
    if (!(v > 0)) return;
    if (dir > 0 && p.zen >= v) { p.zen -= v; p.vaultZen += v; }
    else if (dir < 0 && p.vaultZen >= v) { p.vaultZen -= v; p.zen += v; }
    else this.msg('젠이 부족합니다.', 'warn');
    this.dirty = true;
  },
  showTip(it, e) {
    const t = $('tooltip');
    if (this.tipFor !== it) { this.tipFor = it; t.innerHTML = tooltipLines(it, G.player).map(l => `<div style="color:${l[1]}" class="${l[2] ? 'tn' : ''}">${l[0]}</div>`).join(''); }
    t.style.display = 'block';
    const x = Math.min(e.clientX + 18, window.innerWidth - t.offsetWidth - 8), y = Math.min(e.clientY + 12, window.innerHeight - t.offsetHeight - 8);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  },
  hideTip() { $('tooltip').style.display = 'none'; this.tipFor = null; },

  // --------------- minimap
  buildMinimap(m) {
    const N = m.size, c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = m.tile(x, y), i = (y * N + x) * 4;
      let col = [0, 0, 0];
      const cs = { [T.GRASS]: [70, 110, 40], [T.FGRASS]: [40, 80, 34], [T.ROAD]: [140, 115, 80], [T.STONE]: [150, 150, 140], [T.PLAZA]: [170, 160, 140], [T.WATER]: [40, 90, 150], [T.SAND]: [190, 175, 120], [T.DFLOOR]: [100, 92, 80], [T.DWALL]: [20, 16, 12], [T.SNOW]: [225, 235, 245], [T.ICE]: [160, 205, 230], [T.TFLOOR]: [80, 64, 104], [T.TWALL]: [16, 10, 24], [T.SEA]: [40, 110, 125] };
      col = cs[t] || col;
      if (m.block[y * N + x] && !BLOCK_TILES.has(t)) col = col.map(v => v * 0.55);
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mm = c;
  },
  drawMinimap() {
    const mc = $('minimap'), g = mc.getContext('2d'), big = mc.classList.contains('big');
    const S = mc.width, m = G.map, N = m.size, p = G.player;
    g.clearRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); g.scale(1, 0.5); g.rotate(Math.PI / 4);
    const k = big ? S / N * 0.7 : 2.2;
    g.scale(k, k);
    g.translate(big ? -N / 2 : -p.x, big ? -N / 2 : -p.y);
    g.imageSmoothingEnabled = false; g.drawImage(this.mm, 0, 0);
    for (const mo of G.monsters) if (!mo.dead) { g.fillStyle = mo.def.boss ? '#f0f' : '#f33'; g.fillRect(mo.x - 0.6, mo.y - 0.6, 1.2, 1.2); }
    for (const n of G.npcs) { g.fillStyle = '#5ef'; g.fillRect(n.x - 0.8, n.y - 0.8, 1.6, 1.6); }
    g.fillStyle = '#ff0'; g.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    g.restore();
  }
};

// ----------------------------------------------------- grid rendering / interaction
function renderGrid(el, grid, gw, gh) {
  el.style.width = gw * CELL + 'px'; el.style.height = gh * CELL + 'px';
  el.innerHTML = grid.map((e, i) => {
    const d = idef(e.item);
    return `<div class="gi ${e.item.exc.length ? 'exc' : ''} ${d.kind === 'jewel' ? 'jw' : ''}" data-i="${i}" style="left:${e.x * CELL}px;top:${e.y * CELL}px;width:${d.w * CELL}px;height:${d.h * CELL}px"><img src="${UI.iconFor(e.item).url}">${e.item.lvl ? `<b style="color:${itemColor(e.item)}">+${e.item.lvl}</b>` : ''}${d.stack && e.item.qty > 1 ? `<i>${e.item.qty}</i>` : ''}</div>`;
  }).join('');
}
function bindGrid(el, getGrid, gw, gh, name) {
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const grid = getGrid(), r = el.getBoundingClientRect();
    const cx = Math.floor((e.clientX - r.left) / CELL), cy = Math.floor((e.clientY - r.top) / CELL);
    const under = Inv.at(grid, clamp(cx, 0, gw - 1), clamp(cy, 0, gh - 1), gw, gh);
    if (e.button === 2) { if (under && !G.held) rightClickItem(under, grid, name); return; }
    if (G.held) {
      const it = G.held.item, d = idef(it);
      // jewel onto gear
      if (under && d.kind === 'jewel' && isGear(under.item) && ['jewel_bless', 'jewel_soul', 'jewel_life'].includes(it.id)) {
        const res = applyJewel(it, under.item);
        UI.msg(res.msg, res.ok ? (res.success ? 'gold' : 'warn') : 'warn');
        if (res.consumed) { G.held = null; SFX.play(res.success ? 'success' : 'fail'); G.player.calc(); saveGame(); }
        UI.dirty = true; return;
      }
      // stack merge
      if (under && d.stack && under.item.id === it.id && under.item.qty < d.stack) {
        const n = Math.min(d.stack - under.item.qty, it.qty); under.item.qty += n; it.qty -= n; if (it.qty <= 0) G.held = null; UI.dirty = true; return;
      }
      const x = clamp(cx - Math.floor((d.w - 1) / 2), 0, gw - d.w), y = clamp(cy - Math.floor((d.h - 1) / 2), 0, gh - d.h);
      if (Inv.fits(grid, it, x, y, gw, gh)) { grid.push({ item: it, x, y }); G.held = null; SFX.play('click'); }
      else if (under) { // swap
        grid.splice(grid.indexOf(under), 1);
        if (Inv.fits(grid, it, x, y, gw, gh)) { grid.push({ item: it, x, y }); G.held = { item: under.item }; }
        else grid.push(under);
      }
      UI.dirty = true; return;
    }
    if (under) { grid.splice(grid.indexOf(under), 1); G.held = { item: under.item, from: name }; UI.hideTip(); UI.dirty = true; SFX.play('click'); }
  });
  el.addEventListener('mousemove', e => {
    if (G.held) return UI.hideTip();
    const grid = getGrid(), r = el.getBoundingClientRect();
    const cx = Math.floor((e.clientX - r.left) / CELL), cy = Math.floor((e.clientY - r.top) / CELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return UI.hideTip();
    const u = Inv.at(grid, cx, cy, gw, gh);
    if (u) UI.showTip(u.item, e); else UI.hideTip();
  });
  el.addEventListener('mouseleave', () => UI.hideTip());
}
function rightClickItem(entry, grid, name) {
  const p = G.player, d = idef(entry.item);
  if (name === 'inv') {
    if (UI.isOpen('shop')) { grid.splice(grid.indexOf(entry), 1); G.held = { item: entry.item }; sellHeld(); return; }
    if (UI.isOpen('chaos')) { if (Inv.add(UI.chaosBox, entry.item, 8, 4)) grid.splice(grid.indexOf(entry), 1); UI.dirty = true; return; }
    if (UI.isOpen('vault')) { if (Inv.add(p.vault, entry.item, 8, 10)) grid.splice(grid.indexOf(entry), 1); UI.dirty = true; return; }
    if (d.kind === 'potion' || d.kind === 'scroll') { consume(entry); return; }
    if (d.slot) {
      let slot = d.slot === 'ring' ? (p.equip.ring1 ? (p.equip.ring2 ? 'ring1' : 'ring2') : 'ring1') : d.slot;
      grid.splice(grid.indexOf(entry), 1);
      G.held = { item: entry.item };
      clickEquip(slot, 0);
      if (G.held) { // could not equip or swapped: put back
        if (!Inv.add(grid, G.held.item)) G.drops.push({ x: p.x, y: p.y, item: G.held.item, t: G.time });
        G.held = null;
      }
      UI.dirty = true;
    }
  } else { // chaos / vault -> inventory
    if (Inv.add(p.inv, entry.item)) grid.splice(grid.indexOf(entry), 1);
    UI.dirty = true;
  }
}
function clickEquip(slot, btn) {
  const p = G.player;
  if (G.held) {
    const it = G.held.item, d = idef(it);
    const want = slot.startsWith('ring') ? 'ring' : slot;
    if (d.slot !== want) { UI.msg('그 위치에는 장착할 수 없습니다.', 'warn'); return; }
    const err = canEquip(p, it); if (err) { UI.msg(err, 'warn'); return; }
    if (slot === 'shield' && p.equip.weapon && idef(p.equip.weapon).twoHand) { UI.msg('양손 무기를 사용 중입니다.', 'warn'); return; }
    if (slot === 'weapon' && d.twoHand && p.equip.shield) { UI.msg('방패를 먼저 해제하세요.', 'warn'); return; }
    const old = p.equip[slot]; p.equip[slot] = it; G.held = old ? { item: old } : null;
    p.calc(); SFX.play('click'); UI.dirty = true; return;
  }
  if (p.equip[slot]) { G.held = { item: p.equip[slot] }; delete p.equip[slot]; p.calc(); UI.hideTip(); UI.dirty = true; SFX.play('click'); }
}
function buyItem(it) {
  const p = G.player, d = idef(it), price = d.price || Math.floor(itemValue(it) * 1.2);
  if (p.zen < price) return UI.msg('젠이 부족합니다.', 'warn');
  const n = makeItem(it.id);
  if (!Inv.add(p.inv, n)) return UI.msg('인벤토리 공간이 부족합니다.', 'warn');
  p.zen -= price; SFX.play('zen'); UI.msg(`${d.name}을(를) ${fmt(price)} 젠에 구입했습니다.`, 'zen'); UI.dirty = true;
}
function sellHeld() {
  const p = G.player, it = G.held.item, v = Math.max(1, Math.floor((idef(it).price ? idef(it).price * it.qty / 3 : sellPrice(it))));
  p.zen += v; G.held = null; SFX.play('zen'); UI.msg(`${itemName(it)}을(를) ${fmt(v)} 젠에 판매했습니다.`, 'zen'); UI.dirty = true;
}
function toggleHelper() {
  const p = G.player;
  if (G.helper) { G.helper = null; p.target = null; p.pendingSkill = null; UI.msg('MU 헬퍼를 종료했습니다.', 'sys'); }
  else { if (inTown(p.x, p.y)) return UI.msg('안전지대에서는 헬퍼를 사용할 수 없습니다.', 'warn'); G.helper = { x: p.x, y: p.y }; UI.msg('MU 헬퍼 시작: 주변 몬스터 자동 사냥 · 자동 물약 · 자동 줍기 (H로 종료)', 'gold'); }
}
function chatCommand(v) {
  const p = G.player;
  const m = v.match(/^\/(str|agi|vit|ene|힘|민첩|체력|에너지)\s+(\d+)/);
  if (m) {
    const k = { 힘: 'str', 민첩: 'agi', 체력: 'vit', 에너지: 'ene' }[m[1]] || m[1];
    const n = Math.min(p.pts, parseInt(m[2], 10));
    if (n <= 0) return UI.msg('남은 포인트가 없습니다.', 'warn');
    p.stats[k] += n; p.pts -= n; p.calc(); UI.dirty = true; return UI.msg(`${k.toUpperCase()} +${n} (남은 포인트 ${p.pts})`, 'sys');
  }
  if (v === '/help' || v === '/도움말') return UI.toggle('help', true);
  if (v === '/pos') return UI.msg(`${G.map.def.name} ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`, 'sys');
  if (v.startsWith('/move ') || v.startsWith('/이동 ')) {
    const name = v.split(' ')[1]; const id = WARP_ORDER.find(k => MAPS[k].name === name || k === name);
    if (!id) return UI.msg('알 수 없는 지역입니다.', 'warn');
    const mm = MAPS[id]; if (p.lvl < mm.warpLv) return UI.msg(`레벨 ${mm.warpLv} 이상만 이동할 수 있습니다.`, 'warn');
    if (p.zen < mm.warpCost) return UI.msg('젠이 부족합니다.', 'warn');
    p.zen -= mm.warpCost; SFX.play('warp'); return loadMap(id);
  }
  UI.msg(`[${p.name}] ${v}`, 'chat');
}

// ----------------------------------------------------- input
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('mousemove', e => {
  G.mouse.x = e.clientX; G.mouse.y = e.clientY;
  if (G.running && G.held) $('held').style.left = (e.clientX - idef(G.held.item).w * CELL / 2) + 'px';
});
canvas.addEventListener('mousedown', e => {
  SFX.init();
  if (!G.running) return;
  const p = G.player; if (p.dead) return;
  const w = worldOf(e.clientX, e.clientY);
  if (e.button === 2) { G.mouse.right = true; useActive(w); return; }
  if (e.button !== 0) return;
  G.mouse.down = true;
  if (G.held) { // drop on ground
    G.drops.push({ x: p.x + rand(-0.4, 0.4), y: p.y + rand(-0.4, 0.4), item: G.held.item, t: G.time });
    UI.msg(`${itemName(G.held.item)}을(를) 버렸습니다.`, 'sys'); G.held = null; UI.dirty = true; return;
  }
  const h = G.hover;
  p.pendingSkill = null;
  if (h && h.kind === 'mon') { p.target = h.ref; return; }
  if (h && h.kind === 'npc') { p.target = { kind: 'npc', ref: h.ref }; pathTo(p, h.ref.x, h.ref.y + 1); return; }
  if (h && h.kind === 'drop') { p.target = { kind: 'drop', ref: h.ref }; pathTo(p, h.ref.x, h.ref.y); return; }
  p.target = null;
  if (pathTo(p, w.x, w.y)) G.moveMarker = { x: w.x, y: w.y, t: 1 };
  G.moveHoldT = 0.3;
});
window.addEventListener('mouseup', e => { if (e.button === 0) G.mouse.down = false; if (e.button === 2) G.mouse.right = false; });
window.addEventListener('keydown', e => {
  if (!G.running) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const p = G.player, k = e.key.toLowerCase();
  if (e.key === 'F1') { e.preventDefault(); UI.toggle('help'); return; }
  if (e.key === 'Tab') { e.preventDefault(); $('minimap').classList.toggle('big'); const mc = $('minimap'); mc.width = mc.height = mc.classList.contains('big') ? 420 : 170; return; }
  if (e.key === 'Enter') { const c = $('chatInput'); c.style.display = 'block'; c.focus(); return; }
  if (e.key === 'Escape') {
    if (G.held) { if (!Inv.add(p.inv, G.held.item)) G.drops.push({ x: p.x, y: p.y, item: G.held.item, t: G.time }); G.held = null; UI.dirty = true; return; }
    UI.closeAll(); return;
  }
  if (k === 'i' || k === 'v') UI.toggle('inv');
  else if (k === 'c') UI.toggle('char');
  else if (k === 'm') UI.toggle('warp');
  else if (k === 'h') toggleHelper();
  else if (k === 'q') usePotion('hp') || UI.msg('치유 물약이 없습니다.', 'warn');
  else if (k === 'w') usePotion('mp') || UI.msg('마나 물약이 없습니다.', 'warn');
  else if (k === ' ') {
    e.preventDefault();
    const d = G.drops.filter(d => dist(d.x, d.y, p.x, p.y) < 3).sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
    if (d) { p.target = { kind: 'drop', ref: d }; pathTo(p, d.x, d.y); }
  } else if (/^[1-9]$/.test(k)) {
    const s = p.hotbar[+k - 1]; if (s) { p.activeSkill = s; UI.dirty = true; SFX.play('click'); }
  }
});

// ----------------------------------------------------- title / select / create
const Title = {
  t: 0, embers: [], sel: 0, newCls: 'DK',
  show(scr) {
    ['scr-title', 'scr-select', 'scr-create'].forEach(s => $(s).style.display = s === 'scr-' + scr ? 'flex' : 'none');
    if (scr === 'select') this.renderSelect();
    if (scr === 'create') this.renderCreate();
  },
  renderSelect() {
    const s = loadSaves();
    const slots = [];
    for (let i = 0; i < 5; i++) {
      const c = s.chars[i];
      slots.push(c ? `<div class="slot ${this.sel === i ? 'on' : ''}" data-i="${i}"><canvas width="120" height="150" data-c="${i}"></canvas><b>${c.name}</b><span>${CLASSES[c.cls].name}</span><small>Lv.${c.lvl} · ${MAPS[c.map].name}</small></div>`
        : `<div class="slot empty" data-i="${i}"><div class="plus">+</div><span>캐릭터 생성</span></div>`);
    }
    $('slots').innerHTML = slots.join('');
    $('slots').querySelectorAll('.slot').forEach(el => {
      el.onclick = () => { SFX.init(); SFX.play('click'); const i = +el.dataset.i; if (!s.chars[i]) { this.sel = i; this.show('create'); } else { this.sel = i; this.renderSelect(); } };
      el.ondblclick = () => { if (s.chars[+el.dataset.i]) startGame(+el.dataset.i); };
    });
    $('slots').querySelectorAll('canvas').forEach(cv => {
      const c = s.chars[+cv.dataset.c], pl = new Player(c), g = cv.getContext('2d');
      if (!drawPreview3D(g, 60, 140, pl.look(), 1.45)) drawHumanoid(g, 60, 135, Object.assign(pl.look(), { scale: 1.6 }), { t: 0, dir: 1 });
    });
  },
  renderCreate() {
    $('cls-cards').innerHTML = Object.values(CLASSES).map(c => `<div class="card ${this.newCls === c.id ? 'on' : ''}" data-c="${c.id}"><canvas width="140" height="170"></canvas><b>${c.name}</b><small>${c.en}</small><p>${c.desc}</p><div class="cst">힘 ${c.str} · 민첩 ${c.agi} · 체력 ${c.vit} · 에너지 ${c.ene}</div></div>`).join('');
    $('cls-cards').querySelectorAll('.card').forEach(el => {
      el.onclick = () => { this.newCls = el.dataset.c; SFX.play('click'); this.renderCreate(); };
      const g = el.querySelector('canvas').getContext('2d');
      const pl = new Player({ name: 'x', cls: el.dataset.c });
      starterGear(pl);
      if (!drawPreview3D(g, 70, 162, pl.look(), 1.6)) drawHumanoid(g, 70, 160, Object.assign(pl.look(), { scale: 1.8 }), { t: 0, dir: 1 });
    });
  },
  draw(dt) {
    this.t += dt;
    const g = ctx;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a0604'); bg.addColorStop(0.6, '#2a0e06'); bg.addColorStop(1, '#4a1a08');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // castle silhouette
    g.fillStyle = '#060302';
    g.beginPath(); g.moveTo(0, H);
    const base = H * 0.78;
    for (let x = 0; x <= W; x += 40) { const tw = (Math.sin(x * 0.013) + Math.sin(x * 0.031)) * 0.5; g.lineTo(x, base - (tw > 0.4 ? 140 : tw > 0 ? 70 : 30) - (x % 120 < 20 ? 30 : 0)); }
    g.lineTo(W, H); g.fill();
    if (this.embers.length < 120) this.embers.push({ x: rand(0, W), y: H + 10, v: rand(30, 90), s: rand(1, 3), w: rand(0, 6) });
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const e of this.embers) { e.y -= e.v * dt; e.x += Math.sin(this.t + e.w) * 0.5; g.fillStyle = `rgba(255,${120 + e.s * 30 | 0},40,${clamp((e.y / H), 0, 1)})`; g.beginPath(); g.arc(e.x, e.y, e.s, 0, 7); g.fill(); }
    g.restore();
    this.embers = this.embers.filter(e => e.y > -10);
    const fg = g.createRadialGradient(W / 2, H, 0, W / 2, H, H * 0.8); fg.addColorStop(0, 'rgba(255,90,20,0.25)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fg; g.fillRect(0, 0, W, H);
  }
};
function starterGear(pl) {
  const set = pl.cls === 'DK' ? 'leather' : pl.cls === 'DW' ? 'pad' : 'vine';
  pl.equip.weapon = makeItem(pl.cls === 'DK' ? 'short_sword' : pl.cls === 'DW' ? 'skull_staff' : 'short_bow');
  ['armor', 'pants', 'boots'].forEach(k => pl.equip[k] = makeItem(set + '_' + k));
  if (pl.cls !== 'FE') pl.equip.shield = makeItem('small_shield');
  pl.calc();
}
function createCharacter() {
  const name = $('new-name').value.trim();
  if (!name || name.length > 10) return alert('이름은 1~10자로 입력하세요.');
  const s = loadSaves();
  if (s.chars.some(c => c && c.name === name)) return alert('이미 존재하는 이름입니다.');
  const pl = new Player({ name, cls: Title.newCls });
  starterGear(pl);
  pl.inv = [];
  Inv.add(pl.inv, makeItem('hp_small', { qty: 10 })); Inv.add(pl.inv, makeItem('mp_small', { qty: 10 })); Inv.add(pl.inv, makeItem('apple', { qty: 5 }));
  pl.hp = pl.maxHp; pl.mp = pl.maxMp;
  pl.x = 0; pl.y = 0;
  s.chars[Title.sel] = pl.save();
  writeSaves(s);
  Title.show('select');
}
function deleteCharacter() {
  const s = loadSaves(); const c = s.chars[Title.sel];
  if (!c) return;
  if (!confirm(`${c.name} 캐릭터를 삭제하시겠습니까?`)) return;
  s.chars[Title.sel] = null; writeSaves(s); Title.renderSelect();
}
