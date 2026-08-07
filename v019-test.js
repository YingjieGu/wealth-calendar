// v0.4.19 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① 星盘 ascendant 对象渲染（不再 [object Object]）② sanitizeFortuneText 过滤黄历宜忌
// ③ buildTemplateFortune reminderLines 不含黄历宜忌原文 ④ 捣蛋单通道 5-10 分钟无每日上限
// ⑤ 设置页文案字符串断言
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./src/main/fortuneEngine.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function noStopwords(text) {
  return !M.FORTUNE_STOPWORDS.some((w) => (text || '').includes(w));
}

console.log('== 1. 星盘：ascendant 对象/空值正确处理（不再 [object Object]） ==');
{
  const src = fs.readFileSync(path.join(__dirname, 'src/renderer/calendar.js'), 'utf8');
  // 从 calendar.js 源码提取 _zodiacLabel 纯函数并测试其真实逻辑
  const m = src.match(/_zodiacLabel\(obj\)\s*\{([\s\S]*?)\n\s*\},/);
  ok(m !== null, 'calendar.js 中存在 _zodiacLabel 方法');
  let fn = null;
  if (m) {
    try { fn = new Function('return function _zodiacLabel(obj) {' + m[1] + '};')(); } catch (e) { fn = null; }
  }
  ok(typeof fn === 'function', '_zodiacLabel 可解析为函数');
  ok(fn({ label: '上升 天蝎座 15°03′22″' }) === '天蝎座 15°03′22″', '后端对象 label(含"上升 "前缀) → 去前缀返回落座文案');
  ok(fn({ label: '天顶 狮子座 24°29′46″' }) === '狮子座 24°29′46″', 'midheaven label(含"天顶 "前缀) → 去前缀');
  ok(fn({ label: '白羊座 12°34′56″' }) === '白羊座 12°34′56″', 'label 无前缀 → 原样');
  ok(fn({ sign: '金牛座', degree: 12 }) === '金牛座', 'label 缺失 → 回退 sign');
  ok(fn('金牛座 10°20′') === '金牛座 10°20′', '字符串兜底（旧结构）原样返回');
  ok(fn(null) === '' && fn(undefined) === '' && fn({}) === '', '空/未知 → 空串');
  ok(!src.includes('String(ascendant)'), '_renderStarChart 不再 String(ascendant)（[object Object] 根因已除）');
  ok(src.includes('ascLabel') && src.includes('mcLabel'), '渲染使用 ascLabel/mcLabel（上升+天顶）');
}

console.log('== 2. sanitizeFortuneText：过滤黄历宜忌 STOPWORDS，保留 7 维度文案 ==');
{
  ok(typeof M.sanitizeFortuneText === 'function', 'sanitizeFortuneText 已导出');
  const key = ['祭祀', '塞穴', '入殓', '安葬', '移柩', '破土', '祈福', '开光', '斋醮', '立券', '栽种', '牧养', '纳畜', '安床', '作灶', '伐木', '开渠', '穿井', '扫舍'];
  for (const w of key) {
    ok(M.FORTUNE_STOPWORDS.includes(w), `STOPWORDS 含「${w}」`);
    ok(noStopwords(M.sanitizeFortuneText(`今日宜${w}，注意休息`)), `含「${w}」的句子被清洗`);
  }
  ok(M.sanitizeFortuneText('今日宜祭祀、祈福，注意休息') === '注意休息', '祭祀祈福句整句去掉，其余保留');
  ok(M.sanitizeFortuneText('今日诸事顺遂，开心就好') === '今日诸事顺遂，开心就好', '无 STOPWORDS 文案原样保留');
  ok(M.sanitizeFortuneText('今日宜塞穴入殓') === '', '纯宜忌句清洗后为空');
  ok(M.sanitizeFortuneText('') === '' && M.sanitizeFortuneText(null) === '', '空输入 → 空串');
  ok(noStopwords(M.sanitizeFortuneText('小财发现财运不错，主动一点有惊喜')), '7 维度文案不受影响');
}

console.log('== 3. normalizeFortune + buildTemplateFortune：reminderLines 不含黄历宜忌原文 ==');
{
  const baseDims = { wealth: { score: 80, summary: '财运不错', advice: '偏财在线' }, career: { score: 70, summary: '稳中求进', advice: '多征询意见' }, love: { score: 60, summary: '缘分温和', advice: '主动关心' }, health: { score: 50, summary: '精力尚可', advice: '避免熬夜' }, study: { score: 60, summary: '吸收力不错', advice: '温故知新' }, travel: { score: 60, summary: '出行顺利', advice: '检查随身物品' }, signing: { score: 60, summary: '仔细核对', advice: '看清条款' } };
  const n = M.normalizeFortune({
    overall: 62,
    dimensions: baseDims,
    reminderLines: ['今日宜祭祀，注意休息', '小财发现今天财运不错', '今日忌塞穴入殓'],
    lotteryTip: '今日宜祈福开光，求财顺遂',
    briefReason: '安葬移柩不宜，日主偏旺',
  }, '2026-08-07');
  ok(Array.isArray(n.reminderLines) && n.reminderLines.every(noStopwords), 'normalizeFortune 的 reminderLines 全无宜忌词');
  ok(noStopwords(n.lotteryTip) && noStopwords(n.briefReason), 'lotteryTip/briefReason 也被清洗');
  ok(n.reminderLines.includes('小财发现今天财运不错'), '7 维度文案保留');
  // 模板降级路径：黄历有大量宜忌词，reminderLines 不得拼原文
  const t = M.buildTemplateFortune(
    { dayMaster: { wuXing: '木' } },
    { yi: ['祭祀', '祈福', '安葬', '开光'], ji: ['塞穴', '入殓', '破土'], direction: { caiShenDesc: '东南' }, lunar: { dayGanZhi: '甲子' } },
    '2026-08-07', null, null
  );
  const joined = (t.reminderLines || []).join(' ');
  ok(t.reminderLines.length >= 2, '模板 reminderLines 至少 2 条');
  ok(noStopwords(joined), '模板 reminderLines 不含 祭祀/塞穴/入殓 等黄历原文');
  ok(/财运|事业|健康|运势/.test(joined), '模板提醒语围绕 7 维度（出现财运/事业/健康等词）');
  // 主求方向 wealth：提醒语侧重财运维度
  const tw = M.buildTemplateFortune(
    { dayMaster: { wuXing: '木' } },
    { yi: ['祭祀', '祈福'], ji: ['入殓'], direction: { caiShenDesc: '东南' }, lunar: { dayGanZhi: '甲子' } },
    '2026-08-07', 'wealth', null
  );
  ok((tw.reminderLines || []).join(' ').includes('财运'), 'wish=wealth 时提醒语含财运维度文案');
  ok(noStopwords(tw.reminderLines.join(' ')), 'wish=wealth 提醒语同样无宜忌词');
}

console.log('== 4. 捣蛋模式：单通道 5-10 分钟、无每日上限 ==');
{
  // 先 stub windowInfo.getActiveWindowTitle 再 require prank.js（Linux 下 xdotool 会挂起）
  require('./src/main/windowInfo').getActiveWindowTitle = () => null;
  const prank = require('./src/main/prank.js');
  const src = fs.readFileSync(path.join(__dirname, 'src/main/prank.js'), 'utf8');
  ok(src.includes('PRANK_INTERVAL_MIN') && src.includes('PRANK_INTERVAL_MAX'), '单通道间隔常量 PRANK_INTERVAL_MIN/MAX');
  ok(!src.includes('ROAST_INTERVAL') && !src.includes('ACTION_INTERVAL'), '双通道常量已移除');
  ok(!src.includes('DAILY_LIMIT') && !src.includes('remainingSlots') && !src.includes('takeSlot'), '每日上限逻辑已移除');
  ok((src.match(/prankTimer/g) || []).length >= 1 && !src.includes('roastTimer') && !src.includes('actionTimer'), '单定时器 prankTimer，无双通道定时器');
  // 校验间隔区间 5-10 分钟
  const minM = src.match(/PRANK_INTERVAL_MIN\s*=\s*(\d+)/);
  const maxM = src.match(/PRANK_INTERVAL_MAX\s*=\s*(\d+)/);
  ok(minM && maxM && Number(minM[1]) === 5 && Number(maxM[1]) === 10, '间隔区间 = 5-10 分钟');
  // doRoast/doPrank 不受每日上限阻塞：连续 25 次全部成功
  const sent = [];
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: { send: (ch, data) => sent.push(data) },
  };
  prank.startPrank(fakeWindow, { getSettings: () => ({ prankMode: true }) });
  let okCount = 0;
  for (let i = 0; i < 25; i++) {
    const r = prank.doRoast();
    if (r && r.type) okCount++;
  }
  ok(okCount === 25, `doRoast 连续 25 次全部触发（无每日上限，实际 ${okCount}/25）`);
  const p = prank.doPrank({ mode: 'title' });
  ok(p && p.type === 'title', 'doPrank(mode:title) 正常返回标题吐槽');
  ok(!('daily-limit' in (prank.doRoast() || {})), '无 daily-limit 拒绝路径');
  // 打字通道：typeText 可注入
  const sent2 = [];
  prank.startPrank(fakeWindow, { getSettings: () => ({ prankMode: true }), typeText: () => true });
  const pt = prank.doPrank({ mode: 'typed' });
  ok(pt && pt.type === 'typed', 'doPrank(mode:typed) 走打字玩法（typeText 注入成功）');
  prank.stopPrank();
  console.log('   (定时器已清理)');
}

console.log('== 5. 设置页文案断言 ==');
{
  const html = fs.readFileSync(path.join(__dirname, 'src/renderer/index.html'), 'utf8');
  ok(html.includes('AI 命理（兼容 OpenAI 模式 API、本地模式 API）'), 'AI 命理标题已改');
  ok(!html.includes('AI 命理（DeepSeek 兼容 API）'), '旧 AI 命理标题已移除');
  ok(html.includes('<option value="jimeng">即梦 Seedance</option>'), '即梦 Seedance 已去火/免费提示');
  ok(!html.includes('火山引擎') && !html.includes('有免费额度'), '多模态区不再含 火山引擎/免费额度 提示');
  ok(html.includes('<option value="aksk">AK/SK 签名</option>'), 'AK/SK 签名已去（火山引擎 AccessKey）后缀');
  ok(html.includes('placeholder="AccessKeyId">'), 'AccessKeyId 占位已去控制台提示');
  ok(!html.includes('即梦/火山引擎控制台'), '无控制台提示残留');
}

console.log(`\n结果：${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
