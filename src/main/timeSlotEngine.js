// v0.4.29 十二时辰播报体系 — 核心逻辑
// -----------------------------------------------------------------------------
// 每个自然日按 12 时辰（子23-1/丑1-3/寅3-5/卯5-7/辰7-9/巳9-11/午11-13/未13-15/
// 申15-17/酉17-19/戌19-21/亥21-23，即奇数钟点为边界、每 2h 一换）各生成一条吉凶
// 播报，12 条各不相同。
//
// 数据来源：
//   1. python/server.py /almanac/today 返回 timeSlots[12]：{index,name,hourRange,
//      ganZhi(时柱干支, 五鼠遁), gan, zhi, zhiWuXing(时支五行)}
//   2. 日柱（almanac.lunar.dayGanZhi）→ 日主五行；当日 7 维运势 dimensions
//
// 推算：五行生克（时支五行 vs 日主：生我+ / 比和+小 / 我生我克耗平 / 克我-）
//       + 时干与日干阴阳细化 + 传统时辰宜做池 + 当日财神方位微调
//       + dimensions 联动（旺的维度在对应五行时辰补提示）
// 文案：LLM key 可用则一次批量生成当天 12 条（萌宠口吻一句式），否则模板降级；
//       按日缓存（timeslots.json）。
//
// 纯函数全部无副作用、可直接 node 单测；IO 仅走 getTimeSlotsForDate。
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const fortuneEngine = require('./fortuneEngine');

let _dataDir = null; // 测试可注入
function dataDir() { if (_dataDir) return _dataDir; return app.getPath('userData'); }
function timeSlotPath() { return path.join(dataDir(), 'timeslots.json'); }
function settingsPath() { return path.join(dataDir(), 'settings.json'); }
function loadJson(p, fallback) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { /* ignore */ }
  return fallback;
}
function saveJson(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8'); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 常量表
// ---------------------------------------------------------------------------
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const GANS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const YANG_GANS = ['甲', '丙', '戊', '庚', '壬'];
const WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
// 地支 → 八方（财神方位匹配用）
const ZHI_DIR = { 子: '北', 丑: '东北', 寅: '东北', 卯: '东', 辰: '东南', 巳: '东南', 午: '南', 未: '西南', 申: '西南', 酉: '西', 戌: '西北', 亥: '西北' };
// 五行 → 相关联的运势维度（dimensions 联动：旺的维度在对应五行时辰补提示）
const ELEM_DIM = { 木: 'study', 火: 'career', 土: 'wealth', 金: 'signing', 水: 'wealth' };
const DIM_LABELS = { wealth: '财运', career: '事业', love: '桃花', health: '健康', study: '学业', travel: '出行', signing: '签约' };

// 传统时辰宜做池：good(顺遂/平) / quiet(凶/小凶的保守做法) / avoid
const SLOT_POOL = [
  { good: ['安心入睡', '养精蓄锐'], quiet: ['放下手机静养', '闭目养神'], avoid: ['熬夜刷屏', '深夜冲动做决定'] },
  { good: ['保证深度睡眠', '养肝藏血'], quiet: ['安稳休息', '别惊扰睡眠'], avoid: ['剧烈运动', '睡前进食'] },
  { good: ['早起晨练', '规划一天', '静心冥想'], quiet: ['继续补觉', '别操劳过度'], avoid: ['赖床焦虑', '起床过猛'] },
  { good: ['晨间锻炼', '晨读学习', '清爽处理要事'], quiet: ['喝杯温水', '缓步启动'], avoid: ['空腹喝浓茶', '一早猛干活'] },
  { good: ['开会决策', '签约洽谈', '攻克重要事务'], quiet: ['整理手头资料', '低调推进'], avoid: ['拖延磨蹭', '仓促拍板'] },
  { good: ['拜访洽谈', '学习充电', '拓展人脉'], quiet: ['斟酌方案', '稳步求成'], avoid: ['急躁冒进', '轻信口头承诺'] },
  { good: ['社交会友', '午间小憩', '谈合作'], quiet: ['安静吃饭', '小憩回神'], avoid: ['冲动消费', '争执上头'] },
  { good: ['学习整理', '复盘总结', '处理杂务'], quiet: ['慢节奏理一理', '给生活做减法'], avoid: ['多线分心', '仓促做大决定'] },
  { good: ['出行办事', '运动锻炼', '推进谈判'], quiet: ['起身活动', '梳理待办'], avoid: ['久坐不动', '仓促定论'] },
  { good: ['复盘放松', '整理明日计划', '应酬叙旧'], quiet: ['安静收尾', '早点收工'], avoid: ['钻牛角尖', '情绪化较真'] },
  { good: ['家庭陪伴', '饭后散步', '轻松娱乐'], quiet: ['放松休息', '聊点轻松的'], avoid: ['熬夜加班', '情绪上头'] },
  { good: ['放松身心', '静心冥想', '准备入睡'], quiet: ['洗个热水澡', '放空自己'], avoid: ['焦虑内耗', '通宵玩乐'] },
];
SLOT_POOL.forEach((p, i) => { p.index = i; p.name = SHICHEN[i]; p.dir = ZHI_DIR[SHICHEN[i]] || ''; });

// 五行生克：SHENG 相生链，KE 相克链；relationOf(me=日主, other=时支)
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
function relationOf(me, other) {
  if (me === other) return 'tongWo';
  if (SHENG[other] === me) return 'shengWo'; // 生我
  if (SHENG[me] === other) return 'woSheng'; // 我生
  if (KE[me] === other) return 'woKe';       // 我克
  return 'keWo';                             // 克我
}

// 五行断语（模板降级用，保留推理味；LLM 会用萌宠口吻重写）
const REL_TEXT = {
  shengWo: '时支五行生扶日主，此段气场顺、诸事顺遂',
  tongWo: '时支五行与日主同气，时辰平稳顺遂',
  woKe: '时支五行受日主所克，可掌控局面、稍费心力',
  woSheng: '日主生时支五行，此段略耗精神，宜劳逸结合',
  keWo: '时支五行克制日主，此段易受阻，宜守不宜攻',
};

const TS_CACHE_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// 纯工具：时间/时柱/分数/文案
// ---------------------------------------------------------------------------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
// 奇数钟点边界的 2h 一换：小时 → 时辰索引（0=子 23-1, 1=丑 1-3, … 11=亥 21-23）
function slotIndexAt(hour) { return Math.floor(((hour + 1) % 24) / 2); }
function rangeOf(index) {
  const start = (2 * index - 1 + 24) % 24;
  const end = (2 * index + 1) % 24;
  return `${pad2(start)}:00-${pad2(end)}:00`;
}

// 当前所在时辰（按本地时间）
function activeSlot(nowMs) {
  const d = new Date(nowMs || Date.now());
  const index = slotIndexAt(d.getHours());
  return { index, name: SHICHEN[index], hourRange: rangeOf(index), dateStr: fmtDate(d) };
}

// 下一时辰边界（奇数钟点 1/3/…/23，跨越 0 点后为次日 01:00）
function nextBoundary(nowMs) {
  const now = new Date(nowMs || Date.now());
  const curMin = now.getHours() * 60 + now.getMinutes();
  let b = -1;
  for (let h = 1; h <= 23; h += 2) {
    if (h * 60 > curMin) { b = h; break; }
  }
  if (b < 0) { // 今天边界已过 → 次日 01:00（丑）
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(1, 0, 0, 0);
    const index = slotIndexAt(1);
    return { ok: true, boundaryTs: d.getTime(), index, name: SHICHEN[index], dateStr: fmtDate(d) };
  }
  const d = new Date(now); d.setHours(b, 0, 0, 0);
  const index = slotIndexAt(b);
  return { ok: true, boundaryTs: d.getTime(), index, name: SHICHEN[index], dateStr: fmtDate(d) };
}

// 分数 → 吉凶级别
function levelOf(score) {
  if (score >= 80) return '大吉';
  if (score >= 68) return '吉';
  if (score >= 52) return '平';
  if (score >= 40) return '小凶';
  return '凶';
}

// 无 sidecar 时的兜底：由日干 + 五鼠遁公式推出 12 个时柱（与 python 表一致，
// 采样偶数钟点作为时辰中点；己日→甲子起）——python 已带 timeSlots，仅防旧服兜底。
function buildRawSlotsFallback(dayGanZhi) {
  const dayGan = dayGanZhi && dayGanZhi.length ? dayGanZhi[0] : '';
  const g0 = dayGan ? GANS.indexOf(dayGan) : -1;
  const startStem = g0 < 0 ? 0 : (g0 % 5) * 2; // 子时天干序（甲己起甲、乙庚起丙…）
  const slots = [];
  for (let i = 0; i < 12; i++) {
    const zhi = SHICHEN[i];
    const gan = GANS[(startStem + i) % 10];
    slots.push({ index: i, name: zhi, hourRange: rangeOf(i), ganZhi: gan + zhi, gan, zhi, zhiWuXing: ZHI_WUXING[zhi] });
  }
  return slots;
}

// 时干与日干阴阳细化
function yinYangRefine(dayGan, gan) {
  if (!dayGan || !gan) return 0;
  if (dayGan === gan) return 4; // 天干伏吟，助身
  const dY = YANG_GANS.includes(dayGan);
  const gY = YANG_GANS.includes(gan);
  return dY === gY ? 2 : 1;     // 同阴阳比助略强 / 阴阳相济略和
}

// 财神方位 → 归一化（去掉"正"字），用于与时支方位匹配
function normalizeDir(s) { return s ? String(s).replace(/正/g, '').trim() : ''; }

// dimensions 联动：五行对应的旺维度（≥70）补一句"为XX加把劲"
function dimensionLinkTip(dimensions, elem) {
  if (!dimensions || !elem) return '';
  const dim = ELEM_DIM[elem];
  if (!dim) return '';
  const d = dimensions[dim];
  const sc = d && typeof d.score === 'number' ? d.score : 0;
  if (sc >= 70) return `今天${DIM_LABELS[dim]}${sc}分正旺，这个时辰可以为${DIM_LABELS[dim]}添把火`;
  return '';
}

// tip 组装：凶/小凶 → 提醒避让；深夜(子丑 23-3)恒回归养神；白天按
// 得生扶 > 财神方位 > 维度联动 取最贴切一句
function composeTip({ index, level, rel, dimTip, caiFlag, caiFull }) {
  const bad = level === '凶' || level === '小凶';
  if (bad) {
    return rel === 'keWo' ? '要紧的事最好换个时辰，别硬碰' : '把大事往后放一放，先求稳';
  }
  if (index <= 1) {
    if (dimTip) return dimTip;
    return '深夜养神最划算，睡个安稳觉，好运都攒进梦里';
  }
  if (rel === 'shengWo') {
    if (dimTip) return dimTip;
    if (caiFlag && caiFull) return `财神方位在${caiFull}，这个时辰沾点财气，求财的小打算也顺`;
    return '要紧的、难啃的安排在这个时辰更省力';
  }
  if (caiFlag && caiFull) return `财神方位在${caiFull}，适合做点求财相关的小事`;
  if (dimTip) return dimTip;
  if (rel === 'tongWo') return '平常心推进就行，不必赶';
  if (rel === 'woKe') return '做自己拿得稳的事，别贪多';
  return '节奏放慢一点，稳字当头';
}

// 五行断语文案
function relTextOf(rel) {
  if (!rel) return '五行之气平平，按部就班即可';
  return REL_TEXT[rel] || '按部就班即可';
}

// 核心纯函数：12 时柱 → 吉凶分数/级别/宜忌/tip/五行断语
function computeSlots({ rawSlots, dayGanZhi, caiShenDesc, dimensions }) {
  const dayGan = dayGanZhi && dayGanZhi.length ? dayGanZhi[0] : '';
  const dayMaster = WUXING[dayGan] || '';
  const caiNorm = normalizeDir(caiShenDesc);
  const byIndex = {};
  (Array.isArray(rawSlots) ? rawSlots : []).forEach((rs) => {
    if (rs && typeof rs.index === 'number') byIndex[rs.index] = rs;
  });
  const out = [];
  for (let i = 0; i < 12; i++) {
    const rs = byIndex[i];
    const zhi = rs && rs.zhi ? rs.zhi : SHICHEN[i];
    const gan = (rs && rs.gan) || '';
    const elem = (rs && rs.zhiWuXing) || ZHI_WUXING[zhi] || '';
    const pool = SLOT_POOL[i] || SLOT_POOL[0];
    const rel = dayMaster && elem ? relationOf(dayMaster, elem) : '';

    let score = 58;
    if (rel === 'shengWo') score += 22;
    else if (rel === 'tongWo') score += 12;
    else if (rel === 'woKe') score += 2;
    else if (rel === 'woSheng') score += 0;
    else if (rel === 'keWo') score -= 20;
    score += yinYangRefine(dayGan, gan);
    const caiFlag = !!(caiNorm && pool.dir && caiNorm === pool.dir);
    if (caiFlag) score += 4;
    score = Math.max(5, Math.min(98, Math.round(score)));
    const level = levelOf(score);

    let doList;
    if (level === '小凶' || level === '凶') doList = pool.quiet.slice(0, 2);
    else doList = pool.good.slice(0, level === '大吉' ? 3 : 2);
    if (!doList.length) doList = ['从容行事'];

    const dimTip = dimensionLinkTip(dimensions, elem);
    const tip = composeTip({ index: i, level, rel, dimTip, caiFlag, caiFull: caiShenDesc });

    out.push({
      index: i,
      name: SHICHEN[i],
      hourRange: rs && rs.hourRange ? rs.hourRange : rangeOf(i),
      ganZhi: (rs && rs.ganZhi) || gan + zhi,
      gan,
      zhi,
      zhiWuXing: elem,
      dayMaster,
      rel,
      score,
      level,
      doList,
      avoidList: (pool.avoid || []).slice(0, 2),
      tip,
      relText: relTextOf(rel),
    });
  }
  return out;
}

// 模板一句式播报文案
function formatTemplate(s) {
  const doStr = (s.doList || []).join('、');
  const avoidStr = (s.avoidList || []).join('、');
  return `🕐 ${s.name}时(${s.hourRange}) · ${s.level}: 时柱${s.ganZhi}，${s.relText}。宜${doStr}，忌${avoidStr}。${s.tip || '好好把握~'}`;
}

// ---------------------------------------------------------------------------
// LLM 批量生成（一次调用 12 条），失败/解析不全则整批回退模板
// ---------------------------------------------------------------------------
function parseLinesJson(text) {
  if (!text) return null;
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (Array.isArray(arr)) return arr.map((x) => String(x == null ? '' : x).trim());
  } catch (e) { /* ignore */ }
  return null;
}

function tsLLMUserPrompt(dateStr, dayGanZhi, stats) {
  const lines = stats.map((s) =>
    `${s.name}时(${s.hourRange}) ${s.level}${s.score}分 | 时柱${s.ganZhi} ${s.relText} | 宜:${(s.doList || []).join('/')} 忌:${(s.avoidList || []).join('/')}`
  ).join('\n');
  return `今天日期：${dateStr}，日柱：${dayGanZhi || '未知'}。\n各时辰推算如下（按序）：\n${lines}\n\n请严格按上面的顺序，给 12 个时辰各写一句中文吉凶播报（萌宠口吻、一句话 40 字内、口语自然、12 条各不相同），直接输出 12 个字符串组成的 JSON 数组。`;
}

const TS_LLM_SYSTEM =
  '你是精通黄历与十二时辰吉凶的命理助手"财神小助手"，宠物自称"小财"。' +
  '为一天12个时辰各写一句播报：萌宠口吻、通俗口语、简短（40字内），' +
  '每条结合给定的吉凶级别与五行断语、宜忌，自然点出该时段适合做什么/注意什么，12 条各不相同。' +
  '严禁出现祭祀/塞穴/入殓/安葬/移柩/破土/祈福/开光/斋醮/立券/栽种/扫舍/上梁/安门等黄历殡葬类词汇。' +
  '只输出 JSON 数组（12 个字符串），不要序号、不要 markdown 代码块、不要任何额外文字。';

// ---------------------------------------------------------------------------
// 对外主入口：取某日 12 时辰播报（含完整文案），按日缓存
// ---------------------------------------------------------------------------
async function getTimeSlotsForDate(dateStr, deps = {}) {
  const requestSidecar = deps.requestSidecar;
  const today = dateStr || fmtDate(new Date());
  const cache = loadJson(timeSlotPath(), { version: 1, byDate: {} });
  const hit = cache.byDate && cache.byDate[today];
  if (hit && hit.schemaVersion === TS_CACHE_SCHEMA_VERSION && Array.isArray(hit.slots) && hit.slots.length === 12) {
    return { ok: true, date: today, dayGanZhi: hit.dayGanZhi || '', source: hit.source || 'template', cached: true, slots: hit.slots };
  }

  // 1) 黄历（含 timeSlots）—— sidecar 不可用时用五鼠遁公式兜底
  let almanac = null;
  if (requestSidecar) {
    try {
      const r = await requestSidecar('GET', `/almanac/today?date=${encodeURIComponent(today)}`);
      if (r && r.data && !r.data.error) almanac = r.data;
    } catch (e) { /* sidecar 挂了走兜底 */ }
  }
  const dayGanZhi = (almanac && almanac.lunar && almanac.lunar.dayGanZhi) || (deps.dayGanZhi || '');
  let rawSlots = almanac && Array.isArray(almanac.timeSlots) ? almanac.timeSlots : [];
  if (rawSlots.length !== 12) rawSlots = buildRawSlotsFallback(dayGanZhi);
  const caiShenDesc = (almanac && almanac.direction && almanac.direction.caiShenDesc) || '';

  // 2) 当日 7 维运势（dimensions 联动用；失败/未填出生信息不阻断）
  let dimensions = null;
  try {
    const f = await fortuneEngine.getFortuneByDate(today, false, { requestSidecar });
    if (f && f.data && f.data.dimensions) dimensions = f.data.dimensions;
  } catch (e) { /* ignore */ }

  // 3) 吉凶/宜忌/tip 统计（纯函数）
  const stats = computeSlots({ rawSlots, dayGanZhi, caiShenDesc, dimensions });

  // 4) 文案：LLM key 可用 → 批量生成；否则模板
  let source = 'template';
  let texts = null;
  const settings = loadJson(settingsPath(), {});
  const mc = settings.modelConfig || {};
  if (mc.llmApiKey) {
    try {
      const text = await fortuneEngine.callLLMText(
        { apiKey: mc.llmApiKey, baseUrl: mc.llmBaseUrl, model: mc.llmModel },
        TS_LLM_SYSTEM,
        tsLLMUserPrompt(today, dayGanZhi, stats),
        { maxTokens: 4000 }
      );
      const arr = parseLinesJson(text);
      if (arr && arr.length === 12) { texts = arr; source = 'llm'; }
    } catch (e) { /* LLM 失败 → 模板 */ }
  }

  const slots = stats.map((s, i) => {
    let text = null;
    if (texts && texts[i] && !fortuneEngine.FORTUNE_STOPWORDS.some((w) => texts[i].includes(w))) {
      text = texts[i];
    }
    return { ...s, text: text || formatTemplate(s) };
  });

  cache.byDate[today] = {
    date: today,
    dayGanZhi,
    source,
    slots,
    createdAt: Date.now(),
    schemaVersion: TS_CACHE_SCHEMA_VERSION,
  };
  saveJson(timeSlotPath(), cache);

  return { ok: true, date: today, dayGanZhi, source, cached: false, slots };
}

async function getTimeSlotsToday(deps = {}) {
  return getTimeSlotsForDate(null, deps);
}

// 测试钩子
function __setDataDir(dir) { _dataDir = dir; }

module.exports = {
  getTimeSlotsForDate,
  getTimeSlotsToday,
  activeSlot,
  nextBoundary,
  computeSlots,
  formatTemplate,
  levelOf,
  relationOf,
  slotIndexAt,
  rangeOf,
  buildRawSlotsFallback,
  parseLinesJson,
  tsLLMUserPrompt,
  SHICHEN,
  WUXING,
  ZHI_WUXING,
  SLOT_POOL,
  ELEM_DIM,
  DIM_LABELS,
  TS_CACHE_SCHEMA_VERSION,
  __setDataDir,
};
