export const COMBAT_VERSION = 2;
export const ROUND_SECONDS = 1.6;
const spell = (name, root, cost, cooldown, effect, power = 0, level = 1, extra = {}) => ({ name, root, cost, cooldown, effect, power, level, ...extra });
export const SPELLS = {
  shield: spell('凝盾术', null, 20, 3, 'shield', .25, 3, { priority: 0 }),
  heal: spell('灵息术', null, 25, 3, 'heal', .20, 3, { priority: 1 }),
  interrupt: spell('截脉指', null, 20, 3, 'interrupt', .6, 6, { priority: 1 }),
  jin: spell('穿云剑诀', 'jin', 15, 1, 'break', 1.25),
  mu: spell('缚灵藤', 'mu', 15, 2, 'bind', .8),
  shui: spell('回澜术', 'shui', 25, 3, 'cleanHeal', .2, 1, { priority: 1 }),
  huo: spell('赤焰诀', 'huo', 15, 1, 'burn', 1.1),
  tu: spell('厚土障', 'tu', 20, 3, 'shield', .35, 1, { priority: 0 }),
  bing: spell('凝霜指', 'bing', 15, 1, 'chill', 1),
  lei: spell('引雷诀', 'lei', 20, 3, 'charge', 2.8),
  feng: spell('流风步', 'feng', 15, 3, 'wind', 0, 1, { priority: 0 }),
  jin2: spell('断金斩', 'jin', 25, 3, 'pierce', 1.8, 4),
  mu2: spell('生息诀', 'mu', 25, 3, 'regen', .1, 4, { priority: 1 }),
  shui2: spell('逐浪击', 'shui', 15, 1, 'wave', 1.2, 4),
  huo2: spell('燎原引', 'huo', 25, 3, 'ignite', 1.5, 4),
  tu2: spell('镇岳击', 'tu', 25, 3, 'quake', 1.3, 4),
  bing2: spell('寒镜护身', 'bing', 20, 3, 'mirror', .25, 4, { priority: 0 }),
  lei2: spell('奔雷闪', 'lei', 25, 3, 'hit', 1.4, 4, { priority: 1 }),
  feng2: spell('风刃连', 'feng', 20, 2, 'hit', 1.4, 4),
};
export const SPELL_DESCRIPTIONS = {
  shield: '护盾吸收伤害，持续两回合。', heal: '恢复气血，不恢复寿元。',
  interrupt: '伤害并打断已经开始的蓄力，定心期间无效。',
  break: '造成伤害后破甲25%，持续两回合。', bind: '缠绕减速，并将当前蓄力延迟一次。',
  cleanHeal: '恢复气血并移除一项负面。', burn: '附加三跳灼烧，最多两层。',
  chill: '叠加寒意，三次触发冰封；头目改为减速。', charge: '蓄雷后下回合释放，也可改为截雷打断。',
  wind: '本回合首次直接受击减伤30%，下一回合速度+20。',
  pierce: '一半伤害穿过护盾。', regen: '立即回复10%，随后两回合各回复8%。',
  wave: '缠绕或寒意目标受到额外伤害。', ignite: '消耗灼烧，每层增加0.4倍攻击。',
  quake: '消耗一半自身护盾换取额外伤害。', mirror: '护盾持续两回合，首次受击附加寒意。', hit: '造成直接伤害。',
};
export const STRATEGIES = { cautious: '谨慎', balanced: '均衡', aggressive: '进取' };
export const MODES = { semi: '关键介入', auto: '全自动', manual: '逐回合手动' };
export const COMBAT_ITEMS = ['huichun', 'huiyuan', 'huti', 'pozhang', 'qingxin', 'dun'];
export const ENEMIES = [
  { hp: 100, atk: 12, armor: 10, speed: 95, level: 1, spirit: 25, cult: 100 },
  { hp: 170, atk: 18, armor: 20, speed: 108, level: 3, spirit: 35, cult: 160 },
  { hp: 270, atk: 24, armor: 55, speed: 95, level: 5, spirit: 50, cult: 240, reflect: true },
  { hp: 360, atk: 31, armor: 35, speed: 118, level: 7, spirit: 70, cult: 360 },
  { hp: 650, atk: 34, armor: 60, speed: 110, level: 9, spirit: 100, cult: 500, boss: true },
];
export const ARTIFACTS = {
  wu: { name: '护体法印', effect: 'shield', power: .3, cost: 20, cooldown: 4, priority: 0 },
  ju: { name: '聚灵塔', effect: 'mana', power: 25, cost: 0, cooldown: 4, priority: 1 },
  yuan: { name: '镇魂缘钟', effect: 'interrupt', power: .5, cost: 20, cooldown: 4, priority: 1 },
  sword: { name: '青锋剑', effect: 'pierce', power: 1.8, cost: 20, cooldown: 3 },
  gourd: { name: '回春葫', effect: 'cleanHeal', power: .25, cost: 25, cooldown: 4, priority: 1 },
  banner: { name: '引雷幡', effect: 'hit', power: 2.0, cost: 25, cooldown: 4 },
};
