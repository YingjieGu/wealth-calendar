// v0.4.22 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① buildNatalChartSVG（SVG 合法/12宫/行星/ASC/MC/asc起点映射/无NaN）
//       ② 星盘分析模板降级（12星座模板命中、无 key → 4 段+免责）
//       ③ LLM prompt 结构（行星/上升/天顶/相位）
//       ④ enqueueMsg dedupe（fortune 同文本去重、user 交互不去重）
//       ⑤ 启动不再发 fortune-reminder（源码断言）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('./src/main/fortuneEngine.js');
const SC = require('./src/renderer/starChart.js');
const MsgCore = require('./src/renderer/msgCore.js');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function srcOf(p) {
  return fs.readFileSync(path.join(__dirname, p), 'utf8');
}

// 与 sidecar /chart/natal 一致结构的 mock 数据（含行星/上升/天顶/相位）
const MOCK_CHART = {
  planets: {
    Sun: { sign: '金牛座', signEn: 'Taurus', degree: 24, minute: 10, second: 5, longitude: 54.5, label: '金牛座 24°10′05″', planetLabel: '太阳' },
    Moon: { sign: '天秤座', longitude: 195.2, planetLabel: '月亮' },
    Venus: { sign: '双子座', longitude: 63.0, planetLabel: '金星' },
  },
  ascendant: { sign: '天蝎座', longitude: 210.0, label: '上升 天蝎座 0°12′30″' },
  midheaven: { sign: '狮子座', longitude: 135.0, label: '天顶 狮子座 15°20′00″' },
  aspects: [
    { planet1: 'Sun', planet1Label: '太阳', planet2: 'Moon', planet2Label: '月亮', type: 'trine', label: '三合', angle: 120.3, orb: 0.3 },
    { planet1: 'Sun', planet1Label: '太阳', planet2: 'Venus', planet2Label: '金星', type: 'sextile', label: '六合', angle: 8.5, orb: 0.5 },
    { planet1: 'Moon', planet1Label: '月亮', planet2: 'Venus', planet2Label: '金星', type: 'square', label: '刑', angle: 91.8, orb: 1.8 },
  ],
};

(async () => {
  console.log('== 1. buildNatalChartSVG（SVG 圆形星盘） ==');
  {
    const svg = SC.buildNatalChartSVG(MOCK_CHART);
    ok(typeof svg === 'string' && svg.length > 100, '返回非空 SVG 字符串');
    ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'SVG 合法闭合（<svg … </svg>）');
    ok(svg.includes('class="star-chart-outer"'), '含外圈元素');
    ok((svg.match(/class="star-chart-cusp"/g) || []).length === 12, '12 宫分界线（12 条 cusp）');
    ok((svg.match(/class="star-chart-sign"/g) || []).length === 12, '12 星座名标注');
    ok((svg.match(/class="star-chart-planet"/g) || []).length === 3, `行星点数量 = 输入行星数（3，实际 ${(svg.match(/class="star-chart-planet"/g) || []).length}）`);
    ok(svg.includes('class="star-chart-axis asc"'), '含 ASC 轴线');
    ok(svg.includes('class="star-chart-axis mc"'), '含 MC 轴线');
    ok(svg.includes('本命星盘'), '中心含「本命星盘」字样');
    ok(svg.includes('太阳') && svg.includes('月亮') && svg.includes('金星'), '行星中文名标注齐全');
    ok(!svg.includes('NaN'), 'SVG 无 NaN（所有坐标有效）');
    // asc 起点映射：上升点黄经 → 画布 180°（左侧），黄经差 → 角度差
    ok(SC._lonToCanvasDeg(210, 210) === 180, 'asc 起点映射：ASC 黄经 → 画布 180°（左侧）');
    ok(SC._lonToCanvasDeg(54.5, 210) === 24.5, '行星黄经差映射正确（54.5-210 → 画布 24.5°）');
    ok(SC._lonToCanvasDeg(30, undefined) === 210, '无 ascLon 时以 0° 为基准（30 → 210°）');
    const pt = SC._pt(180, 100);
    ok(Math.abs(pt.x - 80) < 0.01 && Math.abs(pt.y - 180) < 0.01, '_pt 极坐标：180° → 正左（x=cx-r）');
    // 无 asc/mc 容错
    const bare = SC.buildNatalChartSVG({ planets: { Mars: { longitude: 10, planetLabel: '火星' } } });
    ok(bare.includes('star-chart-axis asc') && !bare.includes('star-chart-axis mc'), '无天顶时仍画 ASC、不画 MC（容错）');
    ok(!bare.includes('NaN'), '无 asc/mc 容错下无 NaN');
  }

  console.log('== 2. 星盘分析模板降级（无 key → 本地模板） ==');
  {
    const segs = F.templateNatalAnalysis(MOCK_CHART);
    ok(Array.isArray(segs) && segs.length >= 4, `模板输出 ≥4 段（实际 ${segs.length}）`);
    ok(segs[0].includes(F.ZODIAC_SUN_PERSONALITY[1]), '太阳金牛座 → 金牛性格句命中');
    ok(segs[0].includes('核心性格'), '第 1 段为核心性格');
    ok(segs[1].includes(F.ZODIAC_MOON_EMOTION[6]), '月亮天秤座 → 天秤情感句命中');
    ok(segs[2].includes(F.ZODIAC_RISING_IMAGE[7]), '上升天蝎座 → 天蝎外在句命中');
    ok(segs.some((s) => s.includes('相位')), '含相位解读段');
    ok(segs.some((s) => s.includes('仅供娱乐参考')), '含免责声明');
    ok(segs.join('').includes('太阳与月亮'), '相位解读含行星名（太阳与月亮三合→顺畅）');
    // 无行星/星座 → 通用兜底
    const fallback = F.templateNatalAnalysis({ planets: {}, ascendant: null, aspects: [] });
    ok(fallback.length === 5, `空数据模板仍输出 5 段（实际 ${fallback.length}）`);
    ok(fallback.every((s) => s), '空数据各段非空（通用兜底）');
    // analyzeNatalChart 无 key → source=template
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-v022-'));
    F.__setDataDir(d);
    fs.writeFileSync(path.join(d, 'settings.json'), JSON.stringify({ modelConfig: {} }, null, 2));
    const r = await F.analyzeNatalChart(MOCK_CHART);
    ok(r && r.source === 'template', '无 LLM key → source=template（模板降级）');
    ok(String(r.text).split(/\n+/).filter(Boolean).length >= 4, '降级文本 ≥4 段');
    ok(String(r.text).includes('仅供娱乐参考'), '降级文本含免责');
  }

  console.log('== 3. LLM prompt 结构（buildNatalAnalysisPrompt） ==');
  {
    const prompt = F.buildNatalAnalysisPrompt(MOCK_CHART);
    ok(prompt.includes('本命星盘数据'), 'prompt 标注星盘数据');
    ok(prompt.includes('"Sun"') && prompt.includes('"Moon"'), 'prompt 含行星落座');
    ok(prompt.includes('"ascendant"'), 'prompt 含上升');
    ok(prompt.includes('"midheaven"'), 'prompt 含天顶');
    ok(prompt.includes('"aspects"'), 'prompt 含相位');
    ok(prompt.includes('天蝎座') && prompt.includes('金牛座'), 'prompt 含星座中文');
    const src = srcOf('src/main/fortuneEngine.js');
    ok(src.includes('4 段中文解读') && src.includes('萌宠口吻'), 'LLM 系统 prompt 要求 4 段 + 萌宠口吻');
    ok(src.includes('核心性格（太阳星座为主') && src.includes('④ 一句整体建议'), '系统 prompt 含性格/建议段要求');
    const mainSrc = srcOf('src/main/main.js');
    const preloadSrc = srcOf('src/preload/preload.js');
    ok(mainSrc.includes('star:analyze'), '主进程注册 star:analyze IPC');
    ok(preloadSrc.includes('starAnalyze'), 'preload 暴露 starAnalyze 桥');
    ok(src.includes('callLLMText'), '星盘分析 LLM 复用 OpenAI 兼容模式（callLLMText）');
  }

  console.log('== 4. enqueueMsg dedupe（fortune 默认去重、user 不去重） ==');
  {
    ok(MsgCore.dedupeDefault('fortune') === true, 'fortune 类默认 dedupe=true');
    ok(MsgCore.dedupeDefault('user') === false, 'user 类默认 dedupe=false（交互不受影响）');
    ok(MsgCore.dedupeDefault('daily') === false, 'daily 类默认 dedupe=false');
    ok(MsgCore.dedupeDefault(undefined) === false, '无类别默认 dedupe=false');
    ok(MsgCore.isTextPending([{ text: 'A' }, { text: 'B' }], 'C', 'A') === true, '同文本已在队列 → 判定 pending');
    ok(MsgCore.isTextPending([], 'A', 'A') === true, '同文本正在显示 → 判定 pending');
    ok(MsgCore.isTextPending([{ text: 'A' }], 'B', 'C') === false, '不同文本 → 不入队判定 false');
    ok(MsgCore.isTextPending([], '', '') === false, '空文本 → 不判定 pending');
    ok(MsgCore.isTextPending([{ text: 'A' }], 'B', 'A') === true, '队列中同文本（混合显示）→ true');
    // pet.js 源码接线断言
    const petSrc = srcOf('src/renderer/pet.js');
    ok(petSrc.includes('MsgCore.dedupeDefault') && petSrc.includes('MsgCore.isTextPending'), 'pet.js enqueueMsg 接入 dedupe 判定');
    ok(petSrc.includes('fortune 类（category===\'fortune\'）默认 dedupe=true'), 'pet.js 注释说明 fortune 默认去重');
    const msgSrc = srcOf('src/renderer/msgCore.js');
    ok(msgSrc.includes('function dedupeDefault') && msgSrc.includes('function isTextPending'), 'msgCore.js 定义 dedupe 纯函数');
  }

  console.log('== 5. 启动不再发 fortune-reminder（主进程推送移除） ==');
  {
    const fe = srcOf('src/main/fortuneEngine.js');
    const main = srcOf('src/main/main.js');
    const preload = srcOf('src/preload/preload.js');
    const renderer = srcOf('src/renderer/renderer.js');
    ok(!fe.includes('sendFortuneReminder'), 'fortuneEngine 已删除 sendFortuneReminder');
    ok(!fe.includes('maybeSendStartupFortune'), 'fortuneEngine 已删除 maybeSendStartupFortune');
    ok(!fe.includes("'fortune-reminder'") && !fe.includes('"fortune-reminder"'), 'fortuneEngine 不再 send fortune-reminder');
    ok(!fe.includes('Notification'), 'fortuneEngine 不再用系统 Notification（import 已去）');
    ok(!main.includes('maybeSendStartupFortune'), 'main.js 调用点已删除');
    ok(!preload.includes('onFortuneReminder'), 'preload 已删除 onFortuneReminder 桥');
    ok(!renderer.includes('onFortuneReminder'), 'renderer.js 已删除 onFortuneReminder 监听');
    ok(!renderer.includes("'fortune-reminder'"), 'renderer.js 无 fortune-reminder 残留');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
