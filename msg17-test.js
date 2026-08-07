// v0.4.17 单元测试：优先级队列排序/插队、亲密度跨天清零、消息池按日期替换、工作时间感知、
// 主题互动文案差异、节日/邮件文案、系统提示音 WAV 合法性
// 运行：node msg17-test.js
const assert = require('assert');
const M = require('./src/renderer/msgCore.js');

let passed = 0;
const ok = (name) => { passed += 1; console.log('  ✓', name); };

// ---- 1) 优先级队列：按优先级降序，同级 FIFO ----
{
  const q = [];
  M.priorityInsert(q, { text: 'daily', priority: 2 });
  M.priorityInsert(q, { text: 'schedule', priority: 5 });
  M.priorityInsert(q, { text: 'work', priority: 3 });
  M.priorityInsert(q, { text: 'fortune', priority: 4 });
  M.priorityInsert(q, { text: 'theme', priority: 1 });
  M.priorityInsert(q, { text: 'im', priority: 4 });
  M.priorityInsert(q, { text: 'user', priority: 10 });
  const order = q.map((x) => x.text);
  assert.deepStrictEqual(order, ['user', 'schedule', 'fortune', 'im', 'work', 'daily', 'theme'],
    `优先级排序错误: ${order.join('>')}`);
  ok('优先级队列降序 + 同级FIFO(运势/即时通讯同为4按入队序)');
}

// ---- 2) 插队逻辑：新消息优先级高于当前展示 → 打断 ----
{
  assert.strictEqual(M.shouldPreempt({ priority: 2 }, { priority: 5 }), true, '日程可打断日常');
  assert.strictEqual(M.shouldPreempt({ priority: 5 }, { priority: 2 }), false, '日常不打断日程');
  assert.strictEqual(M.shouldPreempt({ priority: 5 }, { priority: 10 }), true, '用户交互say()最高，可打断日程');
  assert.strictEqual(M.shouldPreempt({ priority: 10 }, { priority: 10 }), false, '同级不打断（FIFO排队）');
  assert.strictEqual(M.shouldPreempt(null, { priority: 5 }), false, '无当前气泡不打断');
  ok('插队判断：say()最高优先级可打断当前气泡，同级FIFO不打断');
}

// ---- 3) 亲密度跨天清零：同天保留、跨天归零、封顶100 ----
{
  assert.strictEqual(M.affinityForDay(80, '2026-08-06', '2026-08-06'), 80, '同天保留');
  assert.strictEqual(M.affinityForDay(80, '2026-08-06', '2026-08-07'), 0, '跨天归零');
  assert.strictEqual(M.affinityForDay(120, '2026-08-06', '2026-08-06'), 100, '封顶100');
  assert.strictEqual(M.affinityForDay(-5, '2026-08-06', '2026-08-06'), 0, '下限0');
  assert.strictEqual(M.affinityForDay(42, null, '2026-08-07'), 0, '无日期记录视为跨天归零');
  ok('亲密度每日清零（元宝每日满100+1逻辑不受影响，见 pet.js _maybeDailyCoin）');
}

// ---- 4) 运势消息池：按天生成一批、同天稳定、次日替换 ----
{
  const f = {
    overall: 80, briefReason: '庚', dimensions: { wealth: { summary: '旺', advice: '稳' } },
    luckyNumber: [3, 8], luckyColor: '金', luckyItem: '貔貅', luckyTime: ['09:00-11:00'],
    reminderLines: ['稳'], directions: { wealth: '东北' },
  };
  const poolA = M.buildFortuneMsgPool(f, '2026-08-06');
  const poolB = M.buildFortuneMsgPool(f, '2026-08-07');
  assert.ok(poolA.length >= 6, `批次应≥6条，实际${poolA.length}`);
  assert.deepStrictEqual(poolA, M.buildFortuneMsgPool(f, '2026-08-06'), '同天批次稳定');
  assert.notDeepStrictEqual(poolA, poolB, '次日批次不同（替换）');
  assert.ok(poolA.some((l) => /运势/.test(l)), '含总运势');
  assert.ok(poolA.some((l) => /财运/.test(l)), '含财运');
  ok('运势消息池按日期生成/替换');
  // 周五彩蛋（时间感知）
  const fri = M.buildFortuneMsgPool(f, '2026-08-07');
  assert.ok(fri.some((l) => /周五/.test(l)), '周五彩蛋');
  ok('运势池含周五时间感知彩蛋');
}

// ---- 5) 工作协助：周一/周五/月末时间感知 ----
{
  assert.ok(M.workLinesForDate('2026-08-03').some((l) => /周一/.test(l)), '2026-08-03 是周一');
  assert.ok(M.workLinesForDate('2026-08-07').some((l) => /周五/.test(l)), '2026-08-07 是周五');
  assert.ok(M.workLinesForDate('2026-08-31').some((l) => /月末/.test(l)), '8月31日是月末');
  assert.ok(!M.workLinesForDate('2026-08-11').some((l) => /周一|周五|月末/.test(l)), '2026-08-11 周二无时间感知线');
  assert.ok(M.workLinesForDate('2026-08-11').some((l) => /帮忙/.test(l)), '通用工作线存在');
  ok('工作协助类时间感知（周一/周五/月末）+ 通用线');
}

// ---- 6) 主题互动：不同主题文案不同，三类齐全 ----
{
  const ids = ['cat1', 'cat2', 'caishen', 'gold'];
  const interacts = ids.map((t) => M.themePool(t).interact);
  for (let i = 0; i < interacts.length; i++) {
    for (let j = i + 1; j < interacts.length; j++) {
      assert.notDeepStrictEqual(interacts[i], interacts[j], `主题 ${ids[i]} 与 ${ids[j]} 互动文案应不同`);
    }
    assert.ok(M.themePool(ids[i]).comfort.length >= 2, `${ids[i]} 安抚池`);
    assert.ok(M.themePool(ids[i]).roast.length >= 2, `${ids[i]} 吐槽池`);
  }
  const picked = M.pickThemeLine('caishen', 'interact');
  assert.ok(M.themePool('caishen').interact.includes(picked), 'pickThemeLine 从对应主题池取值');
  ok('主题互动消息随主题（萌宠/财神/财神金主）文案不同，含交互/安抚/吐槽');
}

// ---- 7) 节日：情人节/法定节假日/农历节日 ----
{
  assert.ok(M.holidayLine('02-14', {}).includes('情人'), '情人节');
  assert.ok(M.holidayLine('01-01', {}).includes('元旦'), '元旦');
  assert.ok(M.holidayLine('05-01', {}).includes('劳动'), '劳动节');
  assert.ok(M.holidayLine('10-01', {}).includes('国庆'), '国庆节');
  assert.ok(M.holidayLine('06-01', { festivals: ['端午节'] }).includes('端午'), '农历端午');
  assert.ok(M.holidayLine('06-01', { festivals: ['中秋节'] }).includes('中秋'), '农历中秋');
  assert.strictEqual(M.holidayLine('06-01', { festivals: [] }), '', '普通日无节日');
  ok('日程提醒：情人节 + 法定节假日 + 农历节日');
}

// ---- 8) 即时通讯：邮件未读文案 ----
{
  assert.ok(M.mailLine(3).includes('3'), '未读数透传');
  ok('邮件未读提醒文案');
}

// ---- 9) 系统提示音：内置 WAV 合法（RIFF/WAVE）----
{
  const buf = Buffer.from(M.SYSTEM_CHIME_B64, 'base64');
  assert.strictEqual(buf.slice(0, 4).toString(), 'RIFF', 'RIFF 头');
  assert.strictEqual(buf.slice(8, 12).toString(), 'WAVE', 'WAVE 标记');
  assert.ok(buf.length > 10000, `WAV 体积 ${buf.length}`);
  ok(`系统提示音 base64 WAV 合法（${buf.length} bytes，0.22s 880+1760Hz）`);
}

console.log(`\n全部通过：${passed} 项`);
process.exit(0);
