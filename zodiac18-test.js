// v0.4.18 生肖主题收集系统单元测试（node 直接跑，不启动 GUI）
// 覆盖：目录完整性 / 随机解锁池 / 扣币逻辑 / 集齐彩蛋 / THEME_ACTIONS 文件引用防 typo / 宫格渲染状态
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./src/renderer/msgCore.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}

console.log('== 1. 主题目录完整性：12 生肖全量预注册 ==');
{
  const entries = M.zodiacEntries();
  ok(entries.length === 12, `zodiacEntries() 返回 12 个（实际 ${entries.length}）`);
  const ids = entries.map((e) => e.id);
  ok(JSON.stringify(ids) === JSON.stringify(['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig']),
    '12 生肖固定顺序 鼠牛虎兔龙蛇马羊猴鸡狗猪');
  ok(entries.every((e, i) => e.zodiacIndex === i), 'zodiacIndex 0-11 与顺序一致');
  ok(entries.every((e) => e.kind === 'material' && e.unlock === 'zodiac'), '生肖条目 kind=material, unlock=zodiac');
  const ready = entries.filter((e) => e.assetsReady).map((e) => e.id);
  ok(JSON.stringify(ready) === JSON.stringify(['rat', 'ox', 'tiger', 'rabbit']), '仅前 4 个 assetsReady=true，后 8 个为占位');
  ok(M.catalogEntry('rat').name === '生肖鼠' && M.catalogEntry('cat1').unlock === 'free' && M.catalogEntry('gold').unlock === 'coins' && M.catalogEntry('gold').cost === 10,
    'free/coins/zodiac 三种解锁模式齐备（cat1 free / gold coins / rat zodiac）');
  ok(M.catalogKind('rat') === 'material' && M.catalogKind('gold') === 'svg' && M.catalogKind('cat') === null,
    'catalogKind 正确（未知主题返回 null）');
  ok(M.zodiacEmoji(0) === '🐭' && M.zodiacEmoji(11) === '🐷' && M.zodiacEmoji(4) === '🐲', 'zodiacEmoji 按下标映射');
}

console.log('== 2. 随机解锁池：只含 assetsReady 且未解锁，解锁后不重复 ==');
{
  const pool0 = M.zodiacPool([]);
  ok(pool0.length === 4, `空解锁时池 = 4 个素材已到生肖（实际 ${pool0.length}）`);
  ok(pool0.every((e) => e.assetsReady === true), '池内全部 assetsReady');
  // 模拟连续随机解锁：每次从池抽，不重复，池逐步清空
  const unlocked = [];
  let coins = 99;
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const pool = M.zodiacPool(unlocked);
    const picked = M.randomZodiacFromPool(pool);
    ok(picked && picked.assetsReady, `第 ${i + 1} 抽从池中抽到已就绪生肖`);
    ok(!seen.has(picked.id), `第 ${i + 1} 抽不重复（抽到 ${picked.id}）`);
    seen.add(picked.id);
    unlocked.push(picked.id);
    if (i === 3) prev = picked;
  }
  ok(M.zodiacPool(unlocked).length === 0, '4 个素材已到生肖全部解锁后池为空');
  ok(M.randomZodiacFromPool([]) === null, '空池 randomZodiacFromPool 返回 null');
  // 后 8 个占位永不进池
  ok(!M.zodiacPool([]).some((e) => !e.assetsReady), '占位（素材未到）不参与随机池');
}

console.log('== 3. 扣币逻辑：元宝不足拒绝，够 3 元宝可解锁 ==');
{
  const pool = M.zodiacPool([]);
  ok(M.canUnlockZodiac(2, pool) === false, '2 元宝不足 → 拒绝');
  ok(M.canUnlockZodiac(3, pool) === true, '3 元宝 → 可解锁');
  ok(M.canUnlockZodiac(3, []) === false, '池空即使元宝够也拒绝（素材筹备中）');
  ok(M.canUnlockZodiac(0, pool) === false, '0 元宝 → 拒绝');
  ok(M.ZODIAC_COST === 3, 'ZODIAC_COST = 3');
  // 模拟完整消耗序列：每抽扣 3，钱不够时拒绝
  const unlocked = [];
  let coins = 3;
  for (let i = 0; i < 10; i++) {
    const p = M.zodiacPool(unlocked);
    if (!M.canUnlockZodiac(coins, p)) break;
    const picked = M.randomZodiacFromPool(p);
    coins -= M.ZODIAC_COST;
    unlocked.push(picked.id);
  }
  ok(unlocked.length <= 4 && coins >= 0, `连抽钱不够即停，最多 4 个（解锁 ${unlocked.length} 个，余 ${coins} 元宝）`);
  ok(M.canUnlockZodiac(coins, M.zodiacPool(unlocked)) === false, '余额不足以继续时拒绝');
}

console.log('== 4. 集齐彩蛋：进度 + 完成判定 ==');
{
  const all12 = M.zodiacEntries().map((e) => e.id);
  ok(M.zodiacProgress([]).collected === 0 && M.zodiacProgress([]).total === 12, '初始进度 0/12');
  ok(M.zodiacProgress(['rat', 'ox', 'tiger', 'rabbit']).collected === 4, '解锁前 4 → 4/12');
  ok(M.isCollectionComplete(['rat', 'ox', 'tiger', 'rabbit']) === false, '未集齐 → false');
  ok(M.isCollectionComplete(all12) === true, '12 个全解锁 → 集齐');
  ok(M.zodiacProgress(all12).collected === 12, '全解锁进度 12/12');
}

console.log('== 5. THEME_ACTIONS 文件引用 vs 实际素材（防 typo） ==');
{
  const src = fs.readFileSync(path.join(__dirname, 'src/renderer/pet.js'), 'utf8');
  const start = src.indexOf('THEME_ACTIONS:');
  ok(start >= 0, 'pet.js 中找到 THEME_ACTIONS');
  // 括号平衡提取 THEME_ACTIONS 对象字面量
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const objStr = src.slice(src.indexOf('{', start), i);
  let actions;
  try { actions = new Function('return (' + objStr + ')')(); } catch (e) { actions = null; }
  ok(actions && actions.rat, 'THEME_ACTIONS 可解析');
  for (const theme of ['rat', 'ox', 'tiger', 'rabbit']) {
    const map = actions[theme];
    ok(map && typeof map === 'object', `${theme} 有状态映射`);
    const dir = path.join(__dirname, 'assets/themes', theme);
    const real = fs.readdirSync(dir);
    let refs = 0;
    for (const state of ['walk', 'sleep', 'happy', 'sad', 'play', 'sit']) {
      const files = (map && map[state]) || [];
      refs += files.length;
      for (const f of files) {
        ok(real.includes(f), `${theme}/${state} 引用 "${f}" 实际存在于素材目录`);
      }
    }
    ok(refs > 0, `${theme} 引用 ${refs} 个素材文件`);
  }
  // 引用文件集合 ⊆ 实际文件（未引用的素材不算错，但引用的必须存在——上面已逐个校验）
}

console.log('== 6. 宫格状态渲染逻辑（纯函数 zodiacCellState） ==');
{
  const rat = M.catalogEntry('rat');
  const dragon = M.catalogEntry('dragon');
  let s = M.zodiacCellState(rat, ['rat']);
  ok(s.cls === 'unlocked' && s.emoji === '🐭' && s.label === '鼠' && s.isUnlocked, '已解锁 rat → unlocked/🐭/鼠');
  s = M.zodiacCellState(rat, []);
  ok(s.cls === 'locked' && s.emoji === '🔒' && s.label === '鼠' && !s.isUnlocked, '未解锁 rat → locked/🔒/鼠');
  s = M.zodiacCellState(dragon, []);
  ok(s.cls === 'coming' && s.emoji === '🔒' && s.label === '敬请期待' && !s.isUnlocked, '素材未到 dragon → coming/🔒/敬请期待');
  ok(M.zodiacCellState(dragon, ['dragon']).cls === 'unlocked', '即使 assetsReady:false 已解锁仍可点（收集进度计入）');
}

console.log('== 7. 主题互动：生肖走 zodiac 通用组 ==');
{
  ok(M.themePool('rat') === M.THEME_INTERACT.zodiac, 'themePool(rat) → zodiac 通用组');
  ok(M.themePool('ox') === M.THEME_INTERACT.zodiac && M.themePool('rabbit') === M.THEME_INTERACT.zodiac, '其他生肖同组');
  const z = M.THEME_INTERACT.zodiac;
  ok(z.interact.length > 0 && z.comfort.length > 0 && z.roast.length > 0, 'zodiac 组含 interact/comfort/roast');
  ok(M.themePool('cat1') !== M.THEME_INTERACT.zodiac, '非生肖主题不误入 zodiac 组');
}

console.log(`\n结果：${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
