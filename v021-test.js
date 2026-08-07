// v0.4.21 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① isStaleFortuneEntry（无版本/含黄历词/新版本干净）② normalizeFortune 清洗
//       dimensions.summary/advice（含黄历词→过滤/兜底）③ 模拟旧缓存 → getDailyFortune
//       重建路径（注入 fake sidecar 断言重新调用 + 新缓存写 schemaVersion）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('./src/main/fortuneEngine.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function noStopwords(text) {
  return !M.FORTUNE_STOPWORDS.some((w) => String(text || '').includes(w));
}
function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wc-v021-'));
}

(async () => {
  console.log('== 1. isStaleFortuneEntry（缓存自愈判定） ==');
  {
    ok(typeof M.isStaleFortuneEntry === 'function', 'isStaleFortuneEntry 已导出');
    ok(typeof M.FORTUNE_CACHE_SCHEMA_VERSION === 'number' && M.FORTUNE_CACHE_SCHEMA_VERSION === 2, '缓存 schema 版本 = 2');
    const clean = {
      schemaVersion: 2,
      data: {
        reminderLines: ['小财发现你今天财运不错'], lotteryTip: '偏财在线', briefReason: '日主偏旺',
        dimensions: { wealth: { summary: '财运尚可', advice: '稳扎稳打' } },
      },
    };
    ok(M.isStaleFortuneEntry(clean) === false, '新版本干净条目 → 有效（不过期）');
    ok(M.isStaleFortuneEntry({ data: clean.data }) === true, '无 schemaVersion 的旧条目 → 过期');
    ok(M.isStaleFortuneEntry({ schemaVersion: 1, data: clean.data }) === true, '版本低于当前 → 过期');
    ok(M.isStaleFortuneEntry(null) === true && M.isStaleFortuneEntry({}) === true && M.isStaleFortuneEntry({ data: null }) === true, '空/无数据 → 过期');
    const oldEntry = { data: { reminderLines: ['今日宜祭祀，注意休息'], lotteryTip: '', briefReason: '', dimensions: {} } };
    ok(M.isStaleFortuneEntry(oldEntry) === true, 'reminderLines 含「祭祀」→ 过期（v0.4.19 前旧缓存）');
    const dimEntry = {
      schemaVersion: 2,
      data: { reminderLines: [], lotteryTip: '', briefReason: '', dimensions: { wealth: { summary: '今日宜安葬', advice: '稳' } } },
    };
    ok(M.isStaleFortuneEntry(dimEntry) === true, 'dimensions.summary 含「安葬」→ 过期');
    const advEntry = {
      schemaVersion: 2,
      data: { reminderLines: [], lotteryTip: '', briefReason: '', dimensions: { wealth: { summary: '财运尚可', advice: '不宜塞穴入殓' } } },
    };
    ok(M.isStaleFortuneEntry(advEntry) === true, 'dimensions.advice 含「塞穴/入殓」→ 过期');
  }

  console.log('== 2. normalizeFortune 清洗 dimensions.summary/advice（含黄历词→过滤/兜底） ==');
  {
    const n = M.normalizeFortune({
      overall: 60,
      dimensions: {
        wealth: { score: 80, summary: '今日宜祭祀，财运尚可', advice: '不宜安葬，可大胆求财' },
        career: { score: 70, summary: '适合祈福，工作顺利', advice: '' },
        love: { score: 60, summary: '今日宜塞穴入殓', advice: '主动关心' },
      },
      reminderLines: [], lotteryTip: '', briefReason: '', disclaimer: '仅供参考娱乐',
    }, '2026-08-07');
    ok(n.dimensions.wealth.summary === '财运尚可', 'summary 含「祭祀」句被清洗，保留「财运尚可」');
    ok(n.dimensions.wealth.advice === '可大胆求财', 'advice 含「安葬」句被清洗，保留「可大胆求财」');
    ok(n.dimensions.career.summary === '工作顺利', 'summary 含「祈福」句被清洗，保留「工作顺利」');
    ok(n.dimensions.career.advice === '稳扎稳打', 'advice 为空 → 通用兜底「稳扎稳打」');
    ok(n.dimensions.love.summary === '运势平稳', 'summary 全被清洗（塞穴入殓）→ 兜底「运势平稳」');
    ok(n.dimensions.love.advice === '主动关心', '不含黄历词的 advice 原样保留');
    ok(Object.values(n.dimensions).every((d) => noStopwords(d.summary + d.advice)), '全部维度 summary/advice 无黄历宜忌词');
  }

  console.log('== 3. 模拟旧缓存 → getDailyFortune 重建路径（缓存自愈） ==');
  {
    const d = freshDir();
    M.__setDataDir(d);
    // 隔离环境：settings（出生信息）+ 旧格式 fortune.json（无 schemaVersion，含黄历宜忌词）
    fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ userInfo: { birth: '1990-05-15 10:30', gender: 'male' } }, null, 2));
    const today = '2026-08-07';
    const stale = {
      data: { overall: 55, dimensions: {}, reminderLines: ['今日宜祭祀，注意休息'], lotteryTip: '', briefReason: '' },
      source: 'template', createdAt: 1,
    };
    fs.writeFileSync(path.join(d, 'fortune.json'), JSON.stringify({ fortuneByDate: { [today]: stale } }, null, 2));
    let calls = 0;
    const fakeSidecar = async (method, url) => {
      calls += 1;
      if (String(url).includes('/bazi/paipan')) return { data: { pillars: [], dayMaster: { wuXing: '木' }, wuXingCount: {}, qiYunAge: 0, daYun: [] } };
      if (String(url).includes('/chart/natal')) return { data: { planets: {}, ascendant: { label: '上升 天蝎座' } } };
      if (String(url).includes('/almanac/today')) return { data: { yi: ['祭祀', '祈福'], ji: ['安葬'], direction: { caiShenDesc: '东南' }, lunar: { dayGanZhi: '甲子' } } };
      return { data: {} };
    };
    const r = await M.getDailyFortune(today, false, { requestSidecar: fakeSidecar });
    ok(r && r.data && r.cached !== true, '旧缓存过期 → 未命中缓存（走重建）');
    ok(calls === 3, `重建时重新调用了 sidecar（实际 ${calls}/3：排盘/星盘/黄历）`);
    const cache = JSON.parse(fs.readFileSync(path.join(d, 'fortune.json'), 'utf8'));
    const entry = cache.fortuneByDate[today];
    ok(entry && entry.schemaVersion === M.FORTUNE_CACHE_SCHEMA_VERSION, '新缓存写入 schemaVersion=2');
    const joined = [
      ...(entry.data.reminderLines || []),
      entry.data.lotteryTip, entry.data.briefReason,
      ...Object.values(entry.data.dimensions || {}).flatMap((dm) => [dm.summary, dm.advice]),
    ].join(' ');
    ok(noStopwords(joined), '重建后缓存数据无任何黄历宜忌词');
    ok(M.isStaleFortuneEntry(entry) === false, '新条目 isStaleFortuneEntry = false（干净有效）');
    // 第二次调用 → 命中新缓存，不再触发 sidecar
    const calls2 = calls;
    const r2 = await M.getDailyFortune(today, false, { requestSidecar: fakeSidecar });
    ok(r2.cached === true && calls === calls2, '干净新缓存 → 第二次直接命中（不再调 sidecar）');
    // 强制刷新路径仍可重建
    const calls3 = calls;
    const r3 = await M.getDailyFortune(today, true, { requestSidecar: fakeSidecar });
    ok(r3.cached !== true && calls > calls3, 'forceRefresh=true 强制重建');
  }

  console.log('== 4. LLM prompt / 缓存写入处断言 ==');
  {
    const src = fs.readFileSync(path.join(__dirname, 'src/main/fortuneEngine.js'), 'utf8');
    ok(src.includes('isStaleFortuneEntry'), '源码引用 isStaleFortuneEntry');
    ok(src.includes('schemaVersion: FORTUNE_CACHE_SCHEMA_VERSION'), '缓存写入处带 schemaVersion');
    ok(src.includes('含 dimensions 各维度的 summary/advice）都只写 7 维度'), 'LLM prompt 明确禁止 summary/advice 写黄历词');
    // 复用已有 STOPWORDS/sanitize，未重复定义
    ok((src.match(/FORTUNE_STOPWORDS\s*=/g) || []).length === 1, 'FORTUNE_STOPWORDS 仅定义一次（复用未重复）');
    ok((src.match(/function sanitizeFortuneText/g) || []).length === 1, 'sanitizeFortuneText 仅定义一次');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
