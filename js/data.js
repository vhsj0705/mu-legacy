// =====================================================================
//  MU LEGACY - game data
//  Class formulas and Lorencia monster stats follow the MIT-licensed
//  OpenMU project (github.com/MUnique/OpenMU). Other values are
//  approximations of classic MU Online (Season 1~2 era) behaviour.
// =====================================================================

const TW = 64, TH = 32;           // isometric tile size
const EXP_RATE = 4;               // server exp rate (x4)
const DROP_RATE = 1.0;
const MAX_LEVEL = 400;

// ---------------------------------------------------------------------
// Character classes (OpenMU: ClassDarkKnight / ClassDarkWizard / ClassFairyElf)
// ---------------------------------------------------------------------
const CLASSES = {
  DK: {
    id: 'DK', name: '다크나이트', en: 'Dark Knight', home: 'lorencia',
    str: 28, agi: 20, vit: 25, ene: 10, startHp: 110, startMp: 20,
    maxHp: (s, lv) => 35 + 2 * lv + 3 * s.vit,
    maxMp: (s, lv) => 10 + 1 * s.ene + 0.5 * lv,
    minDmg: s => s.str / 6, maxDmg: s => s.str / 4,
    defense: s => s.agi / 3, defRate: s => s.agi / 3,
    atkSpd: s => s.agi / 15, skillMult: s => 2 + s.ene * 0.001,
    range: 1.5, desc: '강인한 체력과 근접 전투에 특화된 전사. 높은 힘과 체력으로 적을 베어낸다.',
    weaponKinds: ['sword', 'axe'], shield: true
  },
  DW: {
    id: 'DW', name: '흑마법사', en: 'Dark Wizard', home: 'lorencia',
    str: 18, agi: 18, vit: 15, ene: 30, startHp: 60, startMp: 60,
    maxHp: (s, lv) => 30 + 1 * lv + 2 * s.vit,
    maxMp: (s, lv) => 2 * s.ene + 2 * lv,
    minDmg: s => s.str / 8, maxDmg: s => s.str / 4,
    wizMin: s => s.ene / 9, wizMax: s => s.ene / 4,
    defense: s => s.agi / 4, defRate: s => s.agi / 3,
    atkSpd: s => s.agi / 10, skillMult: s => 1,
    range: 1.5, desc: '강력한 마법으로 원거리의 적을 섬멸하는 마법사. 에너지가 마력의 근원이다.',
    weaponKinds: ['staff'], shield: true
  },
  FE: {
    id: 'FE', name: '요정', en: 'Fairy Elf', home: 'noria',
    str: 22, agi: 25, vit: 20, ene: 15, startHp: 80, startMp: 30,
    maxHp: (s, lv) => 39 + 1 * lv + 2 * s.vit,
    maxMp: (s, lv) => 6 + 1.5 * s.ene + 1.5 * lv,
    minDmg: s => s.agi / 7 + s.str / 14, maxDmg: s => s.agi / 4 + s.str / 8,
    defense: s => s.agi / 10, defRate: s => s.agi / 4,
    atkSpd: s => s.agi / 50 * 2.2, skillMult: s => 1,
    range: 6, desc: '활과 보조 마법을 다루는 엘프. 민첩한 원거리 공격과 치유·강화 마법을 사용한다.',
    weaponKinds: ['bow'], shield: false
  }
};

// ---------------------------------------------------------------------
// Skills
// type: melee | proj | bolt | aoe_self | aoe_target | buff | heal | teleport | multi
// ---------------------------------------------------------------------
const SKILLS = {
  // Dark Knight
  falling_slash: { cls: 'DK', name: '내려찍기', lv: 1, mp: 3, add: 4, type: 'melee', range: 1.8, icon: '⚔', color: '#ffb35c' },
  lunge:         { cls: 'DK', name: '찌르기', lv: 8, mp: 6, add: 10, type: 'melee', range: 2.2, icon: '➹', color: '#ffd27a' },
  twisting:      { cls: 'DK', name: '회오리베기', lv: 25, mp: 12, add: 16, type: 'aoe_self', radius: 2.8, icon: '🌀', color: '#8fd3ff' },
  rageful:       { cls: 'DK', name: '분노의 일격', lv: 55, mp: 22, add: 34, type: 'aoe_target', radius: 2.6, range: 4, icon: '💥', color: '#ff6a2b' },
  death_stab:    { cls: 'DK', name: '데스 스탭', lv: 80, mp: 16, add: 70, type: 'melee', range: 2.4, icon: '🗡', color: '#c58bff' },
  swell_life:    { cls: 'DK', name: '스웰 라이프', lv: 120, mp: 40, type: 'buff', buff: 'swell', dur: 60, icon: '❤', color: '#ff5555' },
  // Dark Wizard
  energy_ball:   { cls: 'DW', name: '에너지볼', lv: 1, mp: 1, add: 3, type: 'proj', range: 6, icon: '●', color: '#7ad7ff' },
  fire_ball:     { cls: 'DW', name: '파이어볼', lv: 5, mp: 3, add: 8, type: 'proj', range: 6, icon: '🔥', color: '#ff7b2a' },
  lightning:     { cls: 'DW', name: '라이트닝', lv: 13, mp: 15, add: 17, type: 'bolt', range: 6, icon: '⚡', color: '#bfe4ff' },
  teleport:      { cls: 'DW', name: '순간이동', lv: 17, mp: 30, type: 'teleport', range: 7, icon: '✧', color: '#c9a7ff' },
  meteorite:     { cls: 'DW', name: '메테오', lv: 21, mp: 12, add: 40, type: 'aoe_target', radius: 1.6, range: 6, icon: '☄', color: '#ff9a3a' },
  hellfire:      { cls: 'DW', name: '헬파이어', lv: 40, mp: 30, add: 60, type: 'aoe_self', radius: 3.4, icon: '♨', color: '#ff4a1a' },
  evil_spirit:   { cls: 'DW', name: '악령', lv: 60, mp: 40, add: 45, type: 'aoe_self', radius: 4.2, icon: '👻', color: '#b4ffd2' },
  soul_barrier:  { cls: 'DW', name: '소울 바리어', lv: 80, mp: 70, type: 'buff', buff: 'barrier', dur: 60, icon: '🛡', color: '#88aaff' },
  ice_storm:     { cls: 'DW', name: '아이스 스톰', lv: 100, mp: 60, add: 80, type: 'aoe_target', radius: 2.4, range: 6, icon: '❄', color: '#aef3ff' },
  // Fairy Elf
  heal:          { cls: 'FE', name: '치료', lv: 1, mp: 20, type: 'heal', icon: '✚', color: '#9dff9d' },
  triple_shot:   { cls: 'FE', name: '트리플 샷', lv: 10, mp: 5, add: 2, type: 'multi', range: 6, icon: '⋔', color: '#fff1a8' },
  greater_def:   { cls: 'FE', name: '방어력 향상', lv: 15, mp: 30, type: 'buff', buff: 'gdef', dur: 60, icon: '⛨', color: '#7fc2ff' },
  greater_dmg:   { cls: 'FE', name: '공격력 향상', lv: 25, mp: 40, type: 'buff', buff: 'gdmg', dur: 60, icon: '✦', color: '#ff9d6b' },
  penetration:   { cls: 'FE', name: '관통', lv: 50, mp: 9, add: 30, type: 'proj', pierce: true, range: 7, icon: '➶', color: '#ffe066' },
  ice_arrow:     { cls: 'FE', name: '아이스 애로우', lv: 70, mp: 12, add: 50, type: 'proj', freeze: true, range: 7, icon: '❆', color: '#9cf' }
};

// ---------------------------------------------------------------------
// Monsters. Lorencia values = OpenMU Version075/Maps/Lorencia.cs
// fields: lv, hp, min, max, def, ar(attack rate), dr(defense rate), delay(ms)
// ---------------------------------------------------------------------
function M(name, lv, hp, min, max, def, ar, dr, delay, shape, look, extra) {
  return Object.assign({ name, lv, hp, min, max, def, ar, dr, delay, shape, look, range: 1.3, speed: 2.4, view: 5 }, extra || {});
}
const MONSTERS = {
  // --- Lorencia (OpenMU values)
  spider:       M('거미', 2, 30, 4, 7, 1, 8, 1, 1800, 'bug', { c1: '#3b3027', c2: '#7a5a3a', scale: 0.7, legs: 8 }),
  budge_dragon: M('버지 드래곤', 4, 60, 10, 13, 3, 18, 3, 2000, 'flyer', { c1: '#b5482c', c2: '#e8a050', scale: 0.8 }),
  bull_fighter: M('불 파이터', 6, 100, 16, 20, 6, 28, 6, 1600, 'humanoid', { c1: '#7a4a2a', c2: '#c9a27a', horns: true, scale: 1.0, weapon: 'axe' }),
  hound:        M('하운드', 9, 140, 22, 27, 9, 39, 9, 1600, 'beast', { c1: '#4a4a52', c2: '#8b8b95', scale: 0.95 }),
  elite_bull:   M('엘리트 불 파이터', 12, 190, 31, 36, 12, 50, 12, 1400, 'humanoid', { c1: '#5a2a1a', c2: '#e0b080', horns: true, scale: 1.15, weapon: 'axe' }),
  lich:         M('리치', 14, 255, 41, 46, 14, 62, 14, 2000, 'humanoid', { c1: '#3a2a55', c2: '#9a7aff', robe: true, scale: 1.0, glow: '#a080ff' }, { range: 4, ranged: '#a070ff' }),
  giant:        M('자이언트', 17, 400, 57, 62, 18, 80, 18, 2200, 'humanoid', { c1: '#6a5a40', c2: '#b09870', scale: 1.6, weapon: 'club' }, { range: 1.7, speed: 1.8 }),
  skel_warrior: M('해골 전사', 19, 525, 68, 74, 22, 93, 22, 1400, 'humanoid', { c1: '#d8d2c0', c2: '#9a9480', bones: true, scale: 1.0, weapon: 'sword' }),
  // --- Noria
  goblin:       M('고블린', 3, 45, 7, 10, 2, 12, 2, 1700, 'humanoid', { c1: '#4f7a2a', c2: '#a0c060', scale: 0.75, weapon: 'club' }),
  chain_scorp:  M('체인 스콜피온', 5, 80, 13, 17, 4, 22, 4, 1700, 'bug', { c1: '#8a3a1a', c2: '#d07a3a', scale: 0.8, legs: 6, tail: true }),
  elite_goblin: M('엘리트 고블린', 8, 120, 19, 23, 8, 34, 8, 1600, 'humanoid', { c1: '#2f5a1a', c2: '#c0d080', scale: 0.85, weapon: 'sword' }),
  beetle:       M('비틀 몬스터', 10, 165, 26, 31, 10, 44, 10, 1700, 'bug', { c1: '#1a3a5a', c2: '#4a8ac0', scale: 0.95, legs: 6, shell: true }),
  hunter:       M('헌터', 13, 220, 36, 41, 13, 56, 13, 1800, 'humanoid', { c1: '#5a4a2a', c2: '#a08a50', scale: 1.0, weapon: 'bow' }, { range: 5, ranged: '#d0b070' }),
  forest_mon:   M('포레스트 몬스터', 15, 295, 46, 51, 15, 66, 15, 1800, 'humanoid', { c1: '#2a4a1a', c2: '#6a9a3a', scale: 1.25, leafy: true }),
  agon:         M('아곤', 16, 325, 51, 56, 16, 72, 16, 1600, 'beast', { c1: '#6a3a6a', c2: '#c080c0', scale: 1.1, horns: true }),
  stone_golem:  M('스톤 골렘', 18, 465, 62, 68, 20, 85, 20, 2400, 'humanoid', { c1: '#6a6a6a', c2: '#a0a0a0', scale: 1.5, rocky: true }, { speed: 1.6 }),
  // --- Devias
  worm:         M('웜', 20, 600, 75, 80, 24, 100, 24, 1700, 'bug', { c1: '#9a7a5a', c2: '#d8c0a0', scale: 1.0, legs: 0, worm: true }),
  ice_monster:  M('아이스 몬스터', 22, 650, 80, 86, 26, 106, 26, 1700, 'humanoid', { c1: '#7ab8e0', c2: '#d8f4ff', scale: 1.1, icy: true, glow: '#bdf' }),
  hommerd:      M('호머드', 24, 700, 85, 92, 28, 112, 28, 1600, 'beast', { c1: '#e0e0e8', c2: '#9aa0b0', scale: 1.1 }),
  assassin:     M('어쌔신', 26, 800, 92, 100, 30, 122, 30, 1200, 'humanoid', { c1: '#20202a', c2: '#5a5a6a', scale: 1.0, weapon: 'dagger', hood: true }, { speed: 3.2 }),
  yeti:         M('예티', 30, 900, 105, 112, 34, 135, 34, 1700, 'humanoid', { c1: '#e8eef4', c2: '#a8b8c8', scale: 1.45, furry: true }),
  elite_yeti:   M('엘리트 예티', 36, 1200, 125, 135, 40, 158, 40, 1600, 'humanoid', { c1: '#c8d8ff', c2: '#7a90c0', scale: 1.6, furry: true }),
  ice_queen:    M('아이스 퀸', 52, 6500, 180, 210, 60, 230, 60, 1800, 'humanoid', { c1: '#a8e0ff', c2: '#ffffff', robe: true, crown: true, scale: 1.5, glow: '#9ef' }, { boss: true, range: 4, ranged: '#aef', respawn: 120 }),
  // --- Dungeon
  skeleton:     M('스켈레톤', 21, 560, 72, 78, 24, 98, 24, 1500, 'humanoid', { c1: '#e8e2d0', c2: '#a8a090', bones: true, scale: 0.95, weapon: 'sword' }),
  larva:        M('라바', 25, 750, 84, 90, 28, 116, 28, 1600, 'bug', { c1: '#6a8a2a', c2: '#c0e060', scale: 0.8, legs: 0, worm: true }),
  hell_spider:  M('헬 스파이더', 28, 820, 95, 102, 31, 128, 31, 1500, 'bug', { c1: '#4a0a0a', c2: '#d02a2a', scale: 1.15, legs: 8 }),
  ghost:        M('고스트', 32, 1000, 110, 118, 35, 142, 35, 1600, 'ghost', { c1: '#c8f0ff', c2: '#ffffff', scale: 1.0, glow: '#cff' }),
  cyclops:      M('사이클롭스', 35, 1250, 120, 130, 38, 155, 38, 1800, 'humanoid', { c1: '#7a5a3a', c2: '#c8a070', scale: 1.6, cyclops: true, weapon: 'club' }),
  hell_hound:   M('헬 하운드', 38, 1400, 130, 140, 42, 165, 42, 1400, 'beast', { c1: '#3a0a0a', c2: '#ff4a1a', scale: 1.15, glow: '#f62' }),
  thunder_lich: M('썬더 리치', 44, 1900, 150, 160, 48, 190, 48, 1800, 'humanoid', { c1: '#1a2a5a', c2: '#7ab8ff', robe: true, scale: 1.1, glow: '#7af' }, { range: 4.5, ranged: '#9cf' }),
  dark_knight_m:M('다크 나이트', 48, 2300, 165, 178, 54, 205, 54, 1500, 'humanoid', { c1: '#1a1a22', c2: '#6a2a8a', scale: 1.25, armored: true, weapon: 'sword', glow: '#a4f' }),
  gorgon:       M('고르곤', 55, 9000, 200, 240, 66, 250, 66, 1700, 'humanoid', { c1: '#3a5a2a', c2: '#b8d070', scale: 2.0, horns: true, armored: true, weapon: 'axe', glow: '#cf6' }, { boss: true, respawn: 150, range: 2 }),
  // --- Atlans
  bahamut:      M('바하무트', 43, 1800, 145, 155, 47, 185, 47, 1600, 'flyer', { c1: '#1a6a8a', c2: '#6ad0e0', scale: 1.1 }),
  vepar:        M('베파', 46, 2050, 155, 165, 50, 196, 50, 1600, 'humanoid', { c1: '#2a6a7a', c2: '#8ae0d0', scale: 1.15, scaly: true, weapon: 'trident' }),
  valkyrie:     M('발키리', 50, 2400, 170, 182, 55, 210, 55, 1700, 'humanoid', { c1: '#c8c8e0', c2: '#ffffff', scale: 1.1, wings: true, weapon: 'bow' }, { range: 5, ranged: '#fff' }),
  great_bahamut:M('그레이트 바하무트', 56, 2900, 190, 205, 62, 235, 62, 1600, 'flyer', { c1: '#0a3a6a', c2: '#3aa0ff', scale: 1.4 }),
  lizard_king:  M('리자드 킹', 64, 3800, 215, 232, 70, 262, 70, 1500, 'humanoid', { c1: '#2a5a1a', c2: '#d0a030', scale: 1.5, scaly: true, crown: true, weapon: 'axe' }),
  hydra:        M('히드라', 74, 5200, 250, 270, 80, 300, 80, 1700, 'beast', { c1: '#1a4a3a', c2: '#4ad0a0', scale: 1.7, glow: '#4fa' }),
  // --- Lost Tower
  shadow:       M('쉐도우', 62, 3500, 210, 225, 68, 255, 68, 1400, 'ghost', { c1: '#1a1a2a', c2: '#6a6aaa', scale: 1.1, glow: '#88f' }),
  poison_shadow:M('포이즌 쉐도우', 66, 3900, 222, 238, 72, 268, 72, 1400, 'ghost', { c1: '#1a3a1a', c2: '#6aff6a', scale: 1.15, glow: '#6f6' }),
  cursed_wizard:M('저주받은 마법사', 70, 4300, 235, 252, 76, 282, 76, 1800, 'humanoid', { c1: '#3a0a3a', c2: '#ff6aff', robe: true, scale: 1.1, glow: '#f6f' }, { range: 4.5, ranged: '#f6f' }),
  death_knight: M('데스 나이트', 76, 5200, 258, 278, 82, 306, 82, 1500, 'humanoid', { c1: '#2a0a0a', c2: '#c02020', scale: 1.35, armored: true, weapon: 'sword', glow: '#f22' }),
  devil:        M('데빌', 80, 5800, 270, 292, 86, 320, 86, 1500, 'humanoid', { c1: '#5a0a0a', c2: '#ff5a2a', scale: 1.3, horns: true, wings: true, glow: '#f52' }),
  death_gorgon: M('데스 고르곤', 86, 6800, 290, 315, 92, 340, 92, 1600, 'humanoid', { c1: '#2a2a0a', c2: '#f0d040', scale: 1.8, horns: true, armored: true, weapon: 'axe', glow: '#fd4' }),
  balrog:       M('발록', 98, 22000, 360, 420, 110, 420, 110, 1600, 'humanoid', { c1: '#3a0a00', c2: '#ff7a00', scale: 2.3, horns: true, wings: true, armored: true, weapon: 'axe', glow: '#f80' }, { boss: true, respawn: 180, range: 2.2 })
};

// ---------------------------------------------------------------------
// Maps
// spawns: [monsterId, count, minDist, maxDist] distance from map "center"
// ---------------------------------------------------------------------
const MAPS = {
  lorencia: {
    name: '로랜시아', theme: 'grass', size: 96, warpLv: 1, warpCost: 0, seed: 101,
    town: { x: 48, y: 48, r: 9 }, center: { x: 48, y: 48 }, bgm: 'town',
    npcs: [
      { id: 'potion_girl', name: '포션 소녀 에이미', x: 44.5, y: 45.5, shop: 'potions', look: { c1: '#d05a8a', c2: '#ffd0e0', robe: true, hair: '#e8c070' } },
      { id: 'hanzo', name: '대장장이 한조', x: 52.5, y: 44.5, shop: 'weapons', look: { c1: '#6a4a2a', c2: '#c09060', armored: true, hair: '#222' } },
      { id: 'pasi', name: '마법사 파시', x: 44.5, y: 52.5, shop: 'armors', look: { c1: '#2a3a8a', c2: '#a0b0ff', robe: true, hair: '#ddd' } },
      { id: 'vault', name: '창고지기 리아', x: 52.5, y: 52.5, shop: 'vault', look: { c1: '#3a6a3a', c2: '#c0e0a0', robe: true, hair: '#8a4a2a' } },
      { id: 'guide', name: '안내원 엘리스', x: 51.5, y: 48.5, shop: 'guide', look: { c1: '#2a5a9a', c2: '#ffe8c0', robe: true, hair: '#f0d060', longHair: true } },
      { id: 'guard1', name: '로랜시아 경비병', x: 48.5, y: 38.5, look: { c1: '#555', c2: '#ccc', armored: true, weapon: 'spear' } },
      { id: 'guard2', name: '로랜시아 경비병', x: 48.5, y: 58.5, look: { c1: '#555', c2: '#ccc', armored: true, weapon: 'spear' } }
    ],
    spawns: [
      ['spider', 22, 11, 22], ['budge_dragon', 18, 14, 27], ['bull_fighter', 16, 22, 33], ['hound', 14, 28, 38],
      ['elite_bull', 12, 33, 42], ['lich', 9, 37, 46], ['giant', 8, 40, 60], ['skel_warrior', 8, 44, 64]
    ]
  },
  noria: {
    name: '노리아', theme: 'forest', size: 80, warpLv: 1, warpCost: 500, seed: 202,
    town: { x: 40, y: 40, r: 8 }, center: { x: 40, y: 40 },
    npcs: [
      { id: 'chaos_goblin', name: '카오스 고블린', x: 43.5, y: 40.5, shop: 'chaos', look: { c1: '#4a7a2a', c2: '#e0c040', robe: true, goblin: true } },
      { id: 'elf_lala', name: '요정 라라', x: 40.5, y: 43.5, shop: 'elfshop', look: { c1: '#3a8a5a', c2: '#c0ffd0', robe: true, hair: '#ffe080' } },
      { id: 'potion_noria', name: '물약 상인 엘리', x: 37.5, y: 43.5, shop: 'potions', look: { c1: '#8a5aa0', c2: '#f0d0ff', robe: true, hair: '#c07030' } },
      { id: 'vault_n', name: '창고지기', x: 43.5, y: 37.5, shop: 'vault', look: { c1: '#3a6a3a', c2: '#c0e0a0', robe: true, hair: '#8a4a2a' } }
    ],
    spawns: [
      ['goblin', 20, 10, 20], ['chain_scorp', 16, 14, 24], ['elite_goblin', 14, 18, 28], ['beetle', 12, 22, 32],
      ['hunter', 10, 25, 36], ['forest_mon', 9, 28, 40], ['agon', 8, 30, 44], ['stone_golem', 7, 33, 50]
    ]
  },
  devias: {
    name: '데비아스', theme: 'snow', size: 96, warpLv: 20, warpCost: 2000, seed: 303,
    town: { x: 24, y: 24, r: 8 }, center: { x: 24, y: 24 },
    npcs: [
      { id: 'potion_dev', name: '물약 상인 마르쿠스', x: 21.5, y: 21.5, shop: 'potions', look: { c1: '#6a4a8a', c2: '#e0d0ff', robe: true, hair: '#eee' } },
      { id: 'smith_dev', name: '무기상 카를', x: 27.5, y: 21.5, shop: 'weapons2', look: { c1: '#5a3a1a', c2: '#d0a070', armored: true, hair: '#a33' } },
      { id: 'armor_dev', name: '방어구상 엘레나', x: 21.5, y: 27.5, shop: 'armors2', look: { c1: '#2a5a8a', c2: '#b0e0ff', robe: true, hair: '#fff0a0' } },
      { id: 'vault_d', name: '창고지기', x: 27.5, y: 27.5, shop: 'vault', look: { c1: '#3a6a3a', c2: '#c0e0a0', robe: true, hair: '#8a4a2a' } }
    ],
    spawns: [
      ['worm', 20, 12, 30], ['ice_monster', 18, 18, 38], ['hommerd', 16, 26, 46], ['assassin', 14, 34, 56],
      ['yeti', 14, 42, 66], ['elite_yeti', 12, 52, 80], ['ice_queen', 1, 70, 90]
    ]
  },
  dungeon: {
    name: '던전', theme: 'dungeon', size: 90, warpLv: 30, warpCost: 3000, seed: 404,
    town: null, center: { x: 8, y: 8 }, entry: { x: 6.5, y: 6.5 },
    spawns: [
      ['skeleton', 18, 6, 30], ['larva', 16, 12, 40], ['hell_spider', 16, 20, 55], ['ghost', 14, 30, 70],
      ['cyclops', 12, 40, 85], ['hell_hound', 12, 50, 95], ['thunder_lich', 10, 60, 110], ['dark_knight_m', 9, 70, 120], ['gorgon', 1, 100, 125]
    ]
  },
  atlans: {
    name: '아틀란스', theme: 'water', size: 96, warpLv: 50, warpCost: 5000, seed: 505,
    town: null, center: { x: 10, y: 48 }, entry: { x: 8.5, y: 48.5 },
    spawns: [
      ['bahamut', 22, 6, 30], ['vepar', 20, 16, 42], ['valkyrie', 16, 26, 56], ['great_bahamut', 16, 36, 70],
      ['lizard_king', 12, 50, 84], ['hydra', 10, 62, 100]
    ]
  },
  losttower: {
    name: '로스트 타워', theme: 'tower', size: 90, warpLv: 70, warpCost: 8000, seed: 606,
    town: null, center: { x: 45, y: 84 }, entry: { x: 45.5, y: 85.5 },
    spawns: [
      ['shadow', 20, 6, 30], ['poison_shadow', 18, 14, 42], ['cursed_wizard', 16, 24, 52], ['death_knight', 14, 34, 62],
      ['devil', 12, 44, 72], ['death_gorgon', 10, 54, 80], ['balrog', 1, 70, 84]
    ]
  }
};
const WARP_ORDER = ['lorencia', 'noria', 'devias', 'dungeon', 'atlans', 'losttower'];

// ---------------------------------------------------------------------
// Items
// kind: sword axe staff bow shield helm armor pants gloves boots wings ring pendant potion jewel misc
// dl = drop level
// ---------------------------------------------------------------------
const ITEMS = {};
function defItem(id, o) { o.id = id; ITEMS[id] = o; return o; }

// --- Dark Knight weapons
[
  ['kris', '크리스', 'sword', 6, 11, 50, 10, 8, 2, 1, 2],
  ['short_sword', '쇼트 소드', 'sword', 3, 7, 30, 8, 0, 1, 1, 3],
  ['rapier', '레이피어', 'sword', 9, 15, 40, 50, 40, 9, 1, 3],
  ['katana', '카타나', 'sword', 16, 26, 35, 80, 40, 16, 1, 3],
  ['gladius', '글라디우스', 'sword', 20, 30, 30, 110, 0, 20, 1, 3],
  ['falchion', '펄션', 'sword', 24, 34, 30, 120, 0, 24, 1, 3],
  ['serpent_sword', '서펀트 소드', 'sword', 30, 42, 30, 130, 0, 30, 1, 3],
  ['blade', '블레이드', 'sword', 36, 47, 30, 80, 50, 36, 1, 3],
  ['salamander', '살라맨더 소드', 'sword', 40, 52, 25, 150, 0, 42, 2, 3],
  ['light_saber', '라이트 세이버', 'sword', 47, 61, 25, 140, 70, 50, 1, 4],
  ['legend_sword', '레전드 소드', 'sword', 56, 72, 20, 168, 0, 56, 2, 3],
  ['giant_sword', '자이언트 소드', 'sword', 64, 82, 20, 200, 0, 62, 2, 4],
  ['heliacal', '헬리컬 소드', 'sword', 73, 98, 25, 230, 0, 72, 2, 4],
  ['sword_destruction', '파괴의 검', 'sword', 82, 112, 30, 260, 100, 86, 1, 4],
  ['small_axe', '스몰 액스', 'axe', 1, 6, 20, 18, 0, 1, 1, 3],
  ['double_axe', '더블 액스', 'axe', 15, 22, 20, 60, 0, 13, 1, 3],
  ['tomahawk', '토마호크', 'axe', 18, 26, 30, 70, 30, 18, 1, 3],
  ['crescent_axe', '크레센트 액스', 'axe', 38, 54, 25, 140, 0, 46, 2, 3],
  ['chaos_dragon_axe', '카오스 드래곤 액스', 'axe', 75, 130, 25, 140, 50, 999, 2, 4]
].forEach(a => defItem(a[0], { name: a[1], kind: a[2], dmin: a[3], dmax: a[4], spd: a[5], rStr: a[6], rAgi: a[7], dl: a[8], w: a[9], h: a[10], cls: ['DK'], slot: 'weapon' }));

// --- Dark Wizard staffs (wiz = magic damage %)
[
  ['skull_staff', '스컬 스태프', 3, 4, 20, 40, 6, 3],
  ['angelic_staff', '엔젤릭 스태프', 10, 12, 20, 60, 10, 14],
  ['serpent_staff', '서펀트 스태프', 17, 18, 25, 80, 15, 26],
  ['thunder_staff', '썬더 스태프', 22, 23, 30, 100, 20, 38],
  ['gorgon_staff', '고르곤 스태프', 28, 30, 35, 120, 24, 48],
  ['legend_staff', '레전드 스태프', 33, 35, 40, 140, 28, 58],
  ['staff_resurrection', '부활의 지팡이', 40, 42, 45, 160, 33, 70],
  ['chaos_lightning', '카오스 번개 지팡이', 50, 54, 50, 160, 38, 999],
  ['staff_destruction', '파괴의 지팡이', 56, 60, 60, 220, 43, 88]
].forEach(a => defItem(a[0], { name: a[1], kind: 'staff', dmin: a[2], dmax: a[3], spd: a[4], rStr: Math.round(a[5] * 0.25), rEne: a[5], wiz: a[6], dl: a[7], w: 1, h: 4, cls: ['DW'], slot: 'weapon' }));

// --- Fairy Elf bows
[
  ['short_bow', '쇼트 보우', 3, 5, 30, 20, 2],
  ['bow', '보우', 9, 13, 30, 40, 8],
  ['elven_bow', '엘븐 보우', 17, 24, 30, 60, 16],
  ['battle_bow', '배틀 보우', 28, 37, 30, 90, 26],
  ['tiger_bow', '타이거 보우', 42, 52, 30, 130, 40],
  ['silver_bow', '실버 보우', 59, 71, 40, 170, 56],
  ['chaos_nature', '카오스 네이처 보우', 88, 106, 40, 190, 999],
  ['celestial_bow', '셀레스티얼 보우', 98, 120, 45, 240, 90]
].forEach(a => defItem(a[0], { name: a[1], kind: 'bow', dmin: a[2], dmax: a[3], spd: a[4], rStr: Math.round(a[5] * 0.3), rAgi: a[5], dl: a[6], w: 2, h: 3, cls: ['FE'], slot: 'weapon', twoHand: true }));

// --- Shields
[
  ['small_shield', '스몰 실드', 3, 1, ['DK', 'DW'], 20],
  ['horn_shield', '혼 실드', 9, 10, ['DK'], 60],
  ['kite_shield', '카이트 실드', 12, 16, ['DK'], 80],
  ['skull_shield', '스컬 실드', 15, 22, ['DK', 'DW'], 70],
  ['elven_shield', '엘븐 실드', 13, 20, ['DW'], 50],
  ['legend_shield', '레전드 실드', 24, 42, ['DW'], 90],
  ['dragon_slayer', '드래곤 슬레이어 실드', 32, 52, ['DK'], 160],
  ['grand_soul_shield', '그랜드 소울 실드', 38, 72, ['DW'], 110],
  ['spiked_shield', '스파이크 실드', 44, 82, ['DK'], 200]
].forEach(a => defItem(a[0], { name: a[1], kind: 'shield', def: a[2], dl: a[3], cls: a[4], rStr: a[5], w: 2, h: 2, slot: 'shield', block: Math.round(a[2] / 2) }));

// --- Armor sets
const ARMOR_SETS = [
  // id, name, class, dl, base def, req stat, colors(main, trim)
  ['leather', '가죽', 'DK', 2, 6, 20, '#7a5230', '#b88a5a'],
  ['bronze', '청동', 'DK', 12, 14, 70, '#9a6a3a', '#e0a060'],
  ['scale', '비늘', 'DK', 22, 21, 100, '#5a6a50', '#a8c090'],
  ['brass', '황동', 'DK', 32, 28, 130, '#b8902a', '#ffe070'],
  ['plate', '판금', 'DK', 44, 36, 160, '#8a8a9a', '#e0e0f0'],
  ['dragon', '드래곤', 'DK', 60, 46, 200, '#8a1a1a', '#ffb030'],
  ['black_dragon', '블랙 드래곤', 'DK', 80, 58, 250, '#1a1a1a', '#c02020'],
  ['pad', '패드', 'DW', 2, 3, 10, '#5a4a8a', '#b0a0e0'],
  ['bone', '본', 'DW', 18, 9, 30, '#d8d0b8', '#8a8070'],
  ['sphinx', '스핑크스', 'DW', 32, 16, 40, '#c8a030', '#3a6aaa'],
  ['legendary', '레전드', 'DW', 50, 24, 50, '#e8e8f0', '#d0a040'],
  ['grand_soul', '그랜드 소울', 'DW', 74, 34, 60, '#2a1a5a', '#a070ff'],
  ['vine', '덩굴', 'FE', 2, 4, 20, '#4a7a2a', '#a0d060'],
  ['silk', '실크', 'FE', 14, 10, 40, '#e0d0e8', '#c080c0'],
  ['wind', '바람', 'FE', 28, 17, 70, '#8ad0d0', '#ffffff'],
  ['spirit', '정령', 'FE', 46, 26, 100, '#ffd070', '#ffffff'],
  ['guardian', '가디언', 'FE', 70, 36, 140, '#e0e0e0', '#40c0ff']
];
const PIECES = [
  ['helm', '투구', 0.8, 2, 2], ['armor', '갑옷', 1.0, 2, 3], ['pants', '바지', 0.85, 2, 2],
  ['gloves', '장갑', 0.55, 2, 2], ['boots', '부츠', 0.6, 2, 2]
];
ARMOR_SETS.forEach(s => {
  PIECES.forEach(p => {
    if (p[0] === 'helm' && (s[0] === 'legendary' || s[0] === 'grand_soul')) return; // helmless sets
    const req = s[2] === 'FE' ? { rAgi: s[5], rStr: Math.round(s[5] * 0.3) } : s[2] === 'DW' ? { rStr: s[5], rEne: s[5] * 2 } : { rStr: s[5], rAgi: Math.round(s[5] * 0.25) };
    defItem(s[0] + '_' + p[0], Object.assign({
      name: s[1] + ' ' + p[1], kind: p[0], slot: p[0], set: s[0], setName: s[1],
      def: Math.max(1, Math.round(s[4] * p[2])), dl: s[3] + (p[0] === 'armor' ? 2 : p[0] === 'helm' ? 1 : 0),
      cls: [s[2]], w: p[3], h: p[4], color: s[6], trim: s[7]
    }, req));
  });
});

// --- Wings
[
  ['wings_satan', '사탄의 날개', ['DK'], 1, 12, 12, 20, '#3a0a0a', '#c02a2a'],
  ['wings_heaven', '천공의 날개', ['DW'], 1, 12, 12, 10, '#e8f0ff', '#90b0ff'],
  ['wings_elf', '요정의 날개', ['FE'], 1, 12, 12, 10, '#c0ffb0', '#60c060'],
  ['wings_dragon', '드래곤의 날개', ['DK'], 2, 32, 25, 45, '#1a1a1a', '#ff8a20'],
  ['wings_soul', '영혼의 날개', ['DW'], 2, 32, 25, 35, '#4a2a8a', '#c0a0ff'],
  ['wings_spirit', '정령의 날개', ['FE'], 2, 32, 25, 30, '#ffffff', '#ffd040']
].forEach(a => defItem(a[0], { name: a[1], kind: 'wings', slot: 'wings', cls: a[2], tier: a[3], dmgPct: a[4], absorb: a[5], def: a[6], color: a[7], trim: a[8], w: 3, h: 2, dl: 999 }));

// --- Jewelry
defItem('ring_ice', { name: '얼음의 반지', kind: 'ring', slot: 'ring', hp: 40, dl: 20, w: 1, h: 1, color: '#9cf' });
defItem('ring_poison', { name: '독의 반지', kind: 'ring', slot: 'ring', hp: 30, dl: 17, w: 1, h: 1, color: '#6f6' });
defItem('ring_fire', { name: '불의 반지', kind: 'ring', slot: 'ring', hp: 60, dl: 42, w: 1, h: 1, color: '#f84' });
defItem('pendant_lightning', { name: '번개의 목걸이', kind: 'pendant', slot: 'pendant', dmg: 6, dl: 21, w: 1, h: 1, color: '#ff8' });
defItem('pendant_fire', { name: '불꽃의 목걸이', kind: 'pendant', slot: 'pendant', dmg: 14, dl: 46, w: 1, h: 1, color: '#f84' });
defItem('ring_wizard', { name: '마법사의 반지', kind: 'ring', slot: 'ring', hp: 0, dmgPct: 10, dl: 60, w: 1, h: 1, color: '#c8f', rare: true });

// --- Consumables / jewels
defItem('apple', { name: '사과', kind: 'potion', heal: 0.10, price: 10, w: 1, h: 1, stack: 30, color: '#e33' });
defItem('hp_small', { name: '작은 치유 물약', kind: 'potion', heal: 0.2, price: 30, w: 1, h: 1, stack: 30, color: '#f44' });
defItem('hp_medium', { name: '치유 물약', kind: 'potion', heal: 0.35, price: 120, w: 1, h: 1, stack: 30, color: '#e22' });
defItem('hp_large', { name: '큰 치유 물약', kind: 'potion', heal: 0.55, price: 400, w: 1, h: 1, stack: 30, color: '#c00' });
defItem('mp_small', { name: '작은 마나 물약', kind: 'potion', mana: 0.2, price: 30, w: 1, h: 1, stack: 30, color: '#48f' });
defItem('mp_medium', { name: '마나 물약', kind: 'potion', mana: 0.35, price: 120, w: 1, h: 1, stack: 30, color: '#26e' });
defItem('mp_large', { name: '큰 마나 물약', kind: 'potion', mana: 0.55, price: 400, w: 1, h: 1, stack: 30, color: '#04c' });
defItem('town_portal', { name: '마을 귀환 문서', kind: 'scroll', price: 750, w: 1, h: 1, stack: 10, color: '#eed' });
defItem('jewel_bless', { name: '축복의 보석', kind: 'jewel', value: 120000, w: 1, h: 1, color: '#ffe36a', desc: '아이템을 +6까지 강화 (성공률 100%)' });
defItem('jewel_soul', { name: '영혼의 보석', kind: 'jewel', value: 90000, w: 1, h: 1, color: '#7af0ff', desc: '아이템을 +7~+9로 강화 (성공률 50%, 행운 +25%)' });
defItem('jewel_life', { name: '생명의 보석', kind: 'jewel', value: 150000, w: 1, h: 1, color: '#ff8ab0', desc: '아이템에 추가 옵션 부여 (성공률 50%)' });
defItem('jewel_chaos', { name: '혼돈의 보석', kind: 'jewel', value: 60000, w: 1, h: 1, color: '#ff9a3a', desc: '카오스 조합에 사용' });
defItem('feather_loch', { name: '로크의 깃털', kind: 'misc', value: 200000, w: 1, h: 2, color: '#fff', desc: '2차 날개 조합 재료' });

// ---------------------------------------------------------------------
// Excellent options
// ---------------------------------------------------------------------
const EXC_WEAPON = [
  { id: 'hpKill', text: '몬스터 사냥시 생명 증가 +생명/8' },
  { id: 'mpKill', text: '몬스터 사냥시 마나 증가 +마나/8' },
  { id: 'spd', text: '공격(마법)속도 증가 +7' },
  { id: 'dmgPct', text: '공격력(마력) 증가 +2%' },
  { id: 'dmgLv', text: '공격력(마력) 증가 +레벨/20' },
  { id: 'excRate', text: '엑설런트 데미지 확률 +10%' }
];
const EXC_ARMOR = [
  { id: 'zen', text: '몬스터 사냥시 젠 증가 +40%' },
  { id: 'dr', text: '방어 성공률 +10%' },
  { id: 'reflect', text: '데미지 반사 +5%' },
  { id: 'reduce', text: '데미지 감소 +4%' },
  { id: 'mpPct', text: '최대 마나 증가 +4%' },
  { id: 'hpPct', text: '최대 생명 증가 +4%' }
];

// Item level bonus table (damage/defense)
const LEVEL_BONUS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 31, 36, 42, 49, 57, 66];

// ---------------------------------------------------------------------
// Shops
// ---------------------------------------------------------------------
const SHOPS = {
  potions: { title: '포션 상점', items: ['apple', 'hp_small', 'hp_medium', 'hp_large', 'mp_small', 'mp_medium', 'mp_large', 'town_portal'] },
  weapons: { title: '무기 상점', items: ['short_sword', 'kris', 'rapier', 'katana', 'small_axe', 'double_axe', 'skull_staff', 'angelic_staff', 'short_bow', 'bow', 'elven_bow', 'small_shield', 'horn_shield', 'skull_shield'], gear: true },
  armors: { title: '방어구 상점', sets: ['leather', 'bronze', 'pad', 'bone', 'vine', 'silk'], gear: true },
  elfshop: { title: '요정 상점', items: ['short_bow', 'bow', 'elven_bow', 'battle_bow', 'hp_small', 'hp_medium', 'mp_small', 'mp_medium'], sets: ['vine', 'silk', 'wind'], gear: true },
  weapons2: { title: '데비아스 무기상', items: ['gladius', 'falchion', 'serpent_sword', 'blade', 'tomahawk', 'serpent_staff', 'thunder_staff', 'battle_bow', 'tiger_bow', 'kite_shield', 'elven_shield', 'legend_shield'], gear: true },
  armors2: { title: '데비아스 방어구상', sets: ['scale', 'brass', 'sphinx', 'wind'], gear: true }
};
