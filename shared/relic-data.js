/* 具体筑基主材与寻物场景。配置只读，所有进度另存于角色。 */
export const SEEK_GRADES = {
  ren: { name: '人道', layer: 3, insight: 0 },
  di: { name: '地道', layer: 6, insight: 2 },
  tian: { name: '天道', layer: 7, insight: 6 },
};
export const SEEK_AFFINITIES = {
  jin: { name: '金', items: ['凝金灵砂','庚金石髓','太白金精'], host: '铁炉坊', sites: ['玄铁矿脉','断剑冢内府'], work: '辨矿修炉', guardian: '残剑傀儡', supply: { earth: 2, essence: 2 }, tool: '封金匣', prep: { earth: 4, essence: 6 }, clue: '剑痕从外向内渐深；先封外阵，再断内阵，最后收敛金煞。', choices: ['封住外阵','切断内阵','收敛金煞'] },
  mu: { name: '木', items: ['百年养气芝','千年青木心','先天乙木灵种'], host: '百草堂', sites: ['古树根窟','青木谷祖树'], work: '供药救治', guardian: '蚀木妖虫', supply: { herb_age: 6, herb: 8 }, tool: '引生灵液', prep: { herb: 6, herb_age: 3, essence: 4 }, clue: '树纹记载：先救根，再引流，取种时留下母根。', choices: ['温养受损根系','沿树纹引流','取种保留母根'] },
  shui: { name: '水', items: ['凝露灵珠','寒泉水髓','先天壬水真露'], host: '临溪水府', sites: ['寒泉水眼','归墟泉眼'], work: '疏渠净泉', guardian: '守泉妖蟒', supply: { essence: 6 }, tool: '定水器', prep: { essence: 8, earth: 2 }, clue: '水位刻痕指明：先封上游，再开旁渠，平流后收取真露。', choices: ['封住上游水口','开启旁渠导流','平流中收露'] },
  huo: { name: '火', items: ['赤阳火晶','地心火种','大日真火种'], host: '赤炉坊', sites: ['地火熔窟','赤阳古炉'], work: '送炭控温', guardian: '古炉火灵', supply: { earth: 2, essence: 4 }, tool: '隔火器', prep: { essence: 10, earth: 2 }, clue: '炉壁火候录写明：先开冷却槽，再合侧风门，火息低落时收种。', choices: ['开启冷却槽','合上侧风门','火息低落时收种'] },
  tu: { name: '土', items: ['厚土灵玉','地脉灵髓','先天戊土精'], host: '地师馆', sites: ['地脉灵穴','镇山台地宫'], work: '探路修堤', guardian: '守穴岩蟒', supply: { earth: 4 }, tool: '镇脉阵', prep: { earth: 6, essence: 8 }, clue: '脉图指出：先稳承重阵，再疏支脉，最后封存灵髓。', choices: ['稳住承重阵','疏通两侧支脉','封存灵髓'] },
  bing: { name: '冰', items: ['寒髓芝','千载冰魄','太阴玄冰髓'], host: '寒药庐', sites: ['霜华冰窟','太阴寒宫残府'], work: '采寒药运寒匣', guardian: '寒宫冰卫', supply: { herb_age: 3, herb: 6 }, tool: '温脉丹与寒匣', prep: { herb: 12, essence: 6 }, clue: '寒匣铭文提示：先温经脉，再解外层冰纹，最后以寒匣封髓。', choices: ['温养经脉','解开外层冰纹','用寒匣封髓'] },
  lei: { name: '雷', items: ['蕴雷石','雷击灵木心','先天雷胎'], host: '引雷台', sites: ['落雷谷','雷泽古坛'], work: '修导雷桩护阵', guardian: '雷灵残影', supply: { earth: 3, essence: 3 }, tool: '避雷符与导雷桩', prep: { earth: 6, herb: 6, essence: 4 }, clue: '导雷图标明：先接地，再立避雷符，雷息间隙引雷入器。', choices: ['连接接地阵','立起避雷符','雷息间隙引雷入器'] },
  feng: { name: '风', items: ['轻灵风羽','风眼灵珠','九霄罡风髓'], host: '御风驿', sites: ['回风峡风眼','罡风浮岛'], work: '修风标巡峡道', guardian: '守岛风隼', supply: { herb: 4, essence: 3 }, tool: '定风器', prep: { herb: 8, essence: 6, earth: 2 }, clue: '风标显示：先定外风，再循回流，风眼平稳时取髓。', choices: ['定住外层罡风','沿回流接近风眼','风眼平稳时取髓'] },
};
export const FIVE_NAMES = { ren: '五色合气莲', di: '五行地元髓', tian: '先天五行道胎' };
export const RELIC_ITEMS = Object.fromEntries([
  ...Object.entries(SEEK_AFFINITIES).flatMap(([element, a]) => Object.keys(SEEK_GRADES).map((grade, i) =>
    [`${grade}_${element}`, { name: a.items[i], grade, roots: [element], source: i ? a.sites[i - 1] : a.host }])),
  ...Object.entries(FIVE_NAMES).map(([grade, name]) => [`${grade}_five`, { name, grade, roots: ['jin','mu','shui','huo','tu'], whole: true, source: { ren: '五灵药圃', di: '五脉交汇处', tian: '五行古府' }[grade] }]),
]);
