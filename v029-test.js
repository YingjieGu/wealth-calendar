// v0.4.29 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① timeSlots 结构（12 时辰干支表与 python /almanac/today 契约一致）
//       ② computeSlots：12 时辰吉凶各不同/分数分级正确/五行断语正确
//       ③ 宜忌 doList/avoidList 与吉凶级别自洽、文案 12 条唯一且无黄历殡葬词
//       ④ dimensions 联动（旺的维度补提示）+ 财神方位微调
//       ⑤ 下一时辰边界/当前时辰计算（纯函数）
'use strict';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}

(async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const t = require('./src/main/timeSlotEngine.js');
  const fortuneEngine = require('./src/main/fortuneEngine.js');
  const STOPWORDS = fortuneEngine.FORTUNE_STOPWORDS || [];
  // 隔离 dataDir，避免触及真实 userData
  t.__setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'ts029-')));

  const LVLS = ['大吉', '吉', '平', '小凶', '凶'];

  console.log('== 1. timeSlots 结构：12 时辰干支表（己卯日，与 python 契约一致）==');
  {
    const raw = t.buildRawSlotsFallback('己卯');
    const expect = [
      [0, '子', '23:00-01:00', '甲子', '水'], [1, '丑', '01:00-03:00', '乙丑', '土'],
      [2, '寅', '03:00-05:00', '丙寅', '木'], [3, '卯', '05:00-07:00', '丁卯', '木'],
      [4, '辰', '07:00-09:00', '戊辰', '土'], [5, '巳', '09:00-11:00', '己巳', '火'],
      [6, '午', '11:00-13:00', '庚午', '火'], [7, '未', '13:00-15:00', '辛未', '土'],
      [8, '申', '15:00-17:00', '壬申', '金'], [9, '酉', '17:00-19:00', '癸酉', '金'],
      [10, '戌', '19:00-21:00', '甲戌', '土'], [11, '亥', '21:00-23:00', '乙亥', '水'],
    ];
    ok(raw.length === 12, 'fallback 生成 12 时辰');
    ok(expect.every(([idx, name, range, gz, wx], i) =>
      raw[i].index === idx && raw[i].name === name && raw[i].hourRange === range
      && raw[i].ganZhi === gz && raw[i].zhiWuXing === wx
    ), '12 时辰 干支/时刻/五行 与 python 契约一致（己卯日）');
    ok(new Set(raw.map((s) => s.ganZhi)).size === 12, '12 个时柱干支各不相同');
  }

  console.log('== 2. computeSlots：吉凶分级与五行断语正确（己卯=土日 vs 甲寅=木日）==');
  {
    const rawTu = t.buildRawSlotsFallback('己卯');       // 日主土
    const rawMu = t.buildRawSlotsFallback('甲寅');       // 日主木
    const tu = t.computeSlots({ rawSlots: rawTu, dayGanZhi: '己卯', caiShenDesc: '', dimensions: null });
    const mu = t.computeSlots({ rawSlots: rawMu, dayGanZhi: '甲寅', caiShenDesc: '', dimensions: null });

    ok(tu.length === 12 && mu.length === 12, '各返回 12 时辰条目');
    const nameSeqOk = (list) => list.every((s, i) => s.name === t.SHICHEN[i] && s.index === i);
    ok(nameSeqOk(tu) && nameSeqOk(mu), '索引/名称按 子丑寅卯辰巳午未申酉戌亥 顺序');

    // 五行断语：土日 火(巳午)=生我(吉高) 木(寅卯)=克我(凶低)
    const relOf = (list, name) => list.find((s) => s.name === name).rel;
    ok(relOf(tu, '巳') === 'shengWo' && relOf(tu, '午') === 'shengWo', '土日 巳午火生土 → shengWo');
    ok(relOf(tu, '寅') === 'keWo' && relOf(tu, '卯') === 'keWo', '土日 寅卯木克土 → keWo');
    ok(relOf(tu, '丑') === 'tongWo' && relOf(tu, '申') === 'woSheng' && relOf(tu, '子') === 'woKe', '土日 土同气/金我生/水我克');
    ok(relOf(mu, '子') === 'shengWo' && relOf(mu, '寅') === 'tongWo', '木日 子亥水生木 shengWo / 寅卯同气');
    ok(relOf(mu, '申') === 'keWo' && relOf(mu, '丑') === 'woKe', '木日 申酉金克木 keWo / 土我克');

    // 断语文案含对应关键词
    const txt = (list, name) => list.find((s) => s.name === name).relText;
    ok(txt(tu, '巳').includes('生扶'), 'shengWo 断语含"生扶"');
    ok(txt(tu, '寅').includes('克') && txt(tu, '寅').includes('日主'), 'keWo 断语含"克…日主"');
    ok(txt(tu, '丑').includes('同气'), 'tongWo 断语含"同气"');
    ok(txt(tu, '申').includes('日主生'), 'woSheng 断语含"日主生"');
    ok(txt(tu, '子').includes('所克'), 'woKe 断语含"所克"');

    // 吉凶分数排序：凡 shengWo 都高于凡 keWo
    const highTu = tu.filter((s) => s.rel === 'shengWo').map((s) => s.score);
    const lowTu = tu.filter((s) => s.rel === 'keWo').map((s) => s.score);
    ok(Math.min(...highTu) > Math.max(...lowTu), `土日 shengWo(>${highTu.join(',')}) 全部高于 keWo(<${lowTu.join(',')})`);
    const highMu = mu.filter((s) => s.rel === 'shengWo').map((s) => s.score);
    const lowMu = mu.filter((s) => s.rel === 'keWo').map((s) => s.score);
    ok(Math.min(...highMu) > Math.max(...lowMu), `木日 shengWo(>${highMu.join(',')}) 全部高于 keWo(<${lowMu.join(',')})`);

    // 级别自洽：shengWo 为吉级，keWo 为凶级
    const lvOf = (list, rel, allow) => list.filter((s) => s.rel === rel).every((s) => allow.includes(s.level));
    ok(lvOf(tu, 'shengWo', ['大吉', '吉']) && lvOf(tu, 'keWo', ['凶', '小凶']), '土日 生我=吉级、克我=凶级');
    ok(lvOf(mu, 'shengWo', ['大吉', '吉']) && lvOf(mu, 'keWo', ['凶', '小凶']), '木日 生我=吉级、克我=凶级');

    // 吉凶各不同：级别不全是同一种；分数区间有效
    ok(new Set(tu.map((s) => s.level)).size >= 3, `土日 吉凶级别 ≥3 种（${[...new Set(tu.map((s) => s.level))].join('/')}）`);
    ok(new Set(mu.map((s) => s.level)).size >= 3, `木日 吉凶级别 ≥3 种`);
    ok(tu.every((s) => LVLS.includes(s.level) && s.score >= 0 && s.score <= 100), '分数 0-100 且级别合法');
  }

  console.log('== 3. 宜忌自洽 & 文案唯一 & 无殡葬词 ==');
  {
    const run = (dayGanZhi) => {
      const list = t.computeSlots({ rawSlots: t.buildRawSlotsFallback(dayGanZhi), dayGanZhi, caiShenDesc: '', dimensions: null });
      const okAll = list.every((s, i) => {
        const pool = t.SLOT_POOL[i];
        const bad = s.level === '凶' || s.level === '小凶';
        const validItems = (bad ? pool.quiet : pool.good).concat([]);
        return Array.isArray(s.doList) && s.doList.length >= 1 && s.doList.every((d) => validItems.includes(d))
          && Array.isArray(s.avoidList) && s.avoidList.length >= 1 && s.tip && s.tip.length > 0
          && s.doList.join('、') !== s.avoidList.join('、');
      });
      const texts = list.map((s) => t.formatTemplate(s));
      return { okAll, texts, list };
    };
    const tu = run('己卯'); const mu = run('甲寅');
    ok(tu.okAll && mu.okAll, '两日 12 时辰 doList/avoidList 与吉凶级别自洽、tip 非空、宜≠忌');
    ok(tu.texts.length === 12 && new Set(tu.texts).size === 12, '己卯日 12 条模板文案全唯一');
    ok(mu.texts.length === 12 && new Set(mu.texts).size === 12, '甲寅日 12 条模板文案全唯一');
    const noStop = (texts) => texts.every((txt) => !STOPWORDS.some((w) => txt.includes(w)));
    ok(noStop(tu.texts) && noStop(mu.texts), '文案不含黄历殡葬类 STOPWORDS');
    ok(tu.texts[4].includes('辰时(07:00-09:00)') && tu.texts[4].includes('宜') && tu.texts[4].includes('忌'),
      '模板含 🕐时辰(区间)·级别 结构 + 宜/忌');
  }

  console.log('== 4. dimensions 联动 + 财神方位微调 ==');
  {
    // 财富旺(85)：土日(己卯) 土元素时辰(丑辰未戌) 的 tip 应带财运提示
    const tu = t.computeSlots({
      rawSlots: t.buildRawSlotsFallback('己卯'), dayGanZhi: '己卯',
      caiShenDesc: '', dimensions: { wealth: { score: 85 }, career: { score: 90 } },
    });
    ok(tu.filter((s) => ['丑', '辰', '未', '戌'].includes(s.name)).some((s) => s.tip.includes('财运')),
      '今日财运旺(85) → 土时辰 tip 带财运提示（dimensions 联动）');
    ok(tu.find((s) => s.name === '巳').tip.includes('事业'), '今日事业旺(90) → 火时辰 tip 带事业提示');
    ok(!tu.find((s) => s.name === '巳').tip.includes('财运'), '火时辰 tip 不含财运（按映射仅事业）');

    // 财神正南微调：午(南) +4 → 比不加财神的午更高
    const a = t.computeSlots({ rawSlots: t.buildRawSlotsFallback('己卯'), dayGanZhi: '己卯', caiShenDesc: '', dimensions: null });
    const b = t.computeSlots({ rawSlots: t.buildRawSlotsFallback('己卯'), dayGanZhi: '己卯', caiShenDesc: '正南', dimensions: null });
    const noon = (l) => l.find((s) => s.name === '午').score;
    ok(noon(b) === noon(a) + 4, `财神正南 → 午时 +4（${noon(a)}→${noon(b)}）`);
    ok(b.find((s) => s.name === '午').tip.includes('财神方位在正南'), '午时 tip 提及财神方位');
    // 深夜(子) 命中财神不应出现求财文案（23-3 回归养神）
    ok(!b.find((s) => s.name === '子').tip.includes('财神'), '子时 tip 不含财神求财（深夜养神）');
  }

  console.log('== 5. 时辰边界/当前时辰计算 ==');
  {
    const A = (h, m) => new Date(2026, 8, 2, h, m, 0, 0); // 2026-09-02
    ok(t.slotIndexAt(0) === 0 && t.slotIndexAt(23) === 0 && t.slotIndexAt(1) === 1 && t.slotIndexAt(22) === 11,
      'slotIndexAt：0/23→子、1→丑、22→亥');
    const act = t.activeSlot(A(9, 30));
    ok(act.index === 5 && act.name === '巳' && act.dateStr === '2026-09-02' && act.hourRange === '09:00-11:00', '9:30 落在巳时(09-11)');
    const n1 = t.nextBoundary(A(10, 30));
    ok(n1.ok && n1.index === 6 && n1.name === '午' && n1.dateStr === '2026-09-02' && n1.boundaryTs === A(11, 0).getTime(),
      '10:30 → 下一时辰 11:00 午');
    const n2 = t.nextBoundary(A(8, 59, ));
    ok(n2.boundaryTs === A(9, 0).getTime() && n2.index === 5, '08:59 → 09:00 巳');
    const n3 = t.nextBoundary(A(23, 30));
    ok(n3.index === 1 && n3.name === '丑' && n3.dateStr === '2026-09-03', '23:30 → 次日 01:00 丑（跨日）');
    const n4 = t.nextBoundary(A(0, 30));
    ok(n4.index === 1 && n4.dateStr === '2026-09-02' && n4.boundaryTs === A(1, 0).getTime(), '00:30 → 当日 01:00 丑');
    const n5 = t.nextBoundary(A(22, 59));
    ok(n5.boundaryTs === A(23, 0).getTime() && n5.index === 0, '22:59 → 23:00 子（本日循环尾）');
    // 覆盖全天 0..23 每钟点都能归到 12 时辰且边界都在奇数钟点
    let badPartition = false;
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 7) {
        const nb = t.nextBoundary(A(h, m));
        if (!nb.ok || nb.boundaryTs <= A(h, m).getTime()) badPartition = true;
      }
    }
    ok(!badPartition, '全天每钟点 nextBoundary 都指向更晚的有效边界');
  }

  console.log('== 6. python sidecar 契约可解析（结构字段齐全）==');
  {
    // 主进程 getTimeSlotsForDate 期望的 almanac.timeSlots 结构，与 python 返回一致
    const raw = t.buildRawSlotsFallback('己卯');
    ok(raw.every((s) => ['index', 'name', 'hourRange', 'ganZhi', 'gan', 'zhi', 'zhiWuXing'].every((k) => k in s)),
      'raw timeSlots 条目字段齐全（index/name/hourRange/ganZhi/gan/zhi/zhiWuXing）');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
