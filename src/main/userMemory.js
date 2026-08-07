// 用户记忆体（v0.4.20）
// 采集用户使用习惯（活跃时段/话题分类/情绪分析/所求方向），持久化到
//   userData/userMemory.json —— 结构化原始数据（interactions 列表带时间戳/类型/话题/情绪、
//                                dailyStats、lastUpdated），容量上限最近 1000 条
//   userData/MEMORY.md      —— 人类可读总结，每次应用退出时刷新（before-quit），agent 记忆体风格
// 全部隐私本地化：不联网、不上传任何内容。
//
// 纯函数（classifyTopic/analyzeSentiment/hourHistogram/inferMainWish/summarizeMemory 等）
// 可直接单测；dataDir 可注入（setDataDir）以便 node 环境下测持久化，无需 electron 主进程。
'use strict';
const fs = require('fs');
const path = require('path');
// electron 主进程才存在 app.getPath；node 单测下 require('electron') 返回路径字符串，
// dataDir() 在未注入时会抛错（测试请先 setDataDir），避免解构崩溃
const { app } = require('electron');

// 容量上限：最多保留最近 1000 条交互
const MAX_INTERACTIONS = 1000;
// 聊天文本截断长度（隐私友好，同时足够生成"最近一次低落"引用）
const MAX_TEXT_LEN = 60;

// ---- 话题关键词分类（TOPIC_KEYWORDS，命中次数最多者胜，无命中→other） ----
const TOPIC_KEYWORDS = {
  wealth: ['钱', '财', '赚钱', '工资', '股票', '彩票', '理财', '基金', '投资', '涨了', '亏了', '发财', '偏财', '横财', '中奖', '收入'],
  career: ['工作', '老板', '加班', '项目', '升职', '跳槽', '面试', '职场', '同事', '上班', '裁员', '业绩', 'kpi', '汇报'],
  love: ['恋爱', '对象', '相亲', '喜欢', '分手', '表白', '桃花', '暧昧', '女友', '男友', '单身', '心动', '约会', 'crush'],
  health: ['累', '困', '病', '睡', '健身', '熬夜', '失眠', '头疼', '感冒', '腰', '胃', '体检', '运动', '减肥', '养生', '喝药'],
  study: ['考试', '学习', '论文', '上课', '复习', '考研', '考公', '成绩', '作业', '读书', '背', '单词', '毕业'],
  travel: ['旅游', '出差', '车', '机票', '高铁', '出行', '堵车', '酒店', '行李', '签证', '路上'],
  signing: ['合同', '签', '客户', '单子', '报价', '谈判', '订单', '尾款', '合作', '签约'],
};

// ---- 情绪分析 SENTIMENT（积极/消极词 + 表情符号，多数派胜，平局→中性） ----
// 刻意不含单字"好"，避免"好累/好吧"误判为积极
const POSITIVE_WORDS = ['开心', '哈哈', '嘿嘿', '好呀', '不错', '喜欢', '顺利', '满意', '赚了', '太棒', '幸运', '成功', '真好', '太好了', '舒服', '高兴', '期待', '惊喜', '棒', 'nice', 'good', '好玩', '可爱', '爱'];
const NEGATIVE_WORDS = ['烦', '累', '难过', 'emo', '唉', '伤心', '崩溃', '压力', '失眠', '焦虑', '讨厌', '糟糕', '痛苦', '郁闷', '纠结', '无语', '气死', '失望', '担心', '难受', '好累', '哭', '不爽', '头疼', '倒霉', '心烦', 'bad', 'sad'];
const POSITIVE_EMOJI = ['😊', '🥰', '🎉', '😄', '😃', '🤩', '😍', '🥳', '👍', '❤️', '✨', '😋'];
const NEGATIVE_EMOJI = ['😭', '😤', '😞', '😔', '😢', '😫', '🤬', '💔', '😩', '😖', '🥺'];

// ---- 展示/映射 ----
const TYPE_LABELS = { pet: '单击互动', chat: '聊天', fortune: '看运势', stick: '摇签', startup: '启动', shutdown: '退出', wish: '设主求' };
const TOPIC_LABELS = { wealth: '财运', career: '事业', love: '桃花', health: '健康', study: '学业', travel: '出行', signing: '签约', other: '其他' };
// 主求方向（与 settings.mainWish / fortuneEngine.WISH_LABELS 的 id 对齐）
const WISH_LABELS = { wealth: '求财', love: '求姻缘', career: '求事业', health: '求健康', study: '求学业', peace: '求平安' };
// 话题 → 主求方向（推断用）：出行→求平安（出行平安）、签约→求事业（合作签约）
const TOPIC_TO_WISH = { wealth: 'wealth', career: 'career', love: 'love', health: 'health', study: 'study', travel: 'peace', signing: 'career' };

// ---- 内部状态 ----
let _dir = null;        // 测试可注入（setDataDir）
let _enabled = true;    // 开关（settings.userMemoryEnabled，默认开；关掉停止采集）
let _memory = null;     // { interactions: [], dailyStats: {}, lastUpdated }
let _lastWish = null;   // 最近一次记录的 mainWish（避免重复记录）

function dataDir() {
  if (_dir) return _dir;
  if (app && app.getPath) return app.getPath('userData');
  return null; // node 单测无 electron 且未注入目录 → 只读纯函数/应用判定，持久化跳过
}
function memoryPath() {
  const d = dataDir();
  return d ? path.join(d, 'userMemory.json') : null;
}
function memoryMdPath() {
  const d = dataDir();
  return d ? path.join(d, 'MEMORY.md') : null;
}

function setDataDir(dir) { _dir = dir; }
function setEnabled(v) { _enabled = !!v; }
function isEnabled() { return _enabled; }

// ---------------------------------------------------------------------------
// 纯函数分析（可单测）
// ---------------------------------------------------------------------------

// 话题分类：命中关键词最多的分类胜；全无命中 → other
function classifyTopic(text) {
  const t = String(text || '').toLowerCase();
  let best = 'other';
  let bestScore = 0;
  for (const [topic, kws] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of kws) {
      if (t.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = topic; }
  }
  return best;
}

// 情绪分析：积极/消极词 + 表情符号计数，多数派胜，平局 → neutral
function analyzeSentiment(text) {
  const t = String(text || '').toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE_WORDS) { if (t.includes(w.toLowerCase())) pos += 1; }
  for (const w of NEGATIVE_WORDS) { if (t.includes(w.toLowerCase())) neg += 1; }
  for (const e of POSITIVE_EMOJI) { if (t.includes(e)) pos += 1; }
  for (const e of NEGATIVE_EMOJI) { if (t.includes(e)) neg += 1; }
  if (pos === neg) return 'neutral';
  return pos > neg ? 'positive' : 'negative';
}

// 活跃时段直方图：interactions 按本地 hour（0-23）计数
function hourHistogram(interactions) {
  const counts = new Array(24).fill(0);
  for (const it of (interactions || [])) {
    const h = it && it.hour;
    if (Number.isInteger(h) && h >= 0 && h <= 23) counts[h] += 1;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

// 高频活跃时段：直方图 count>0 中取 topN 个小时（降序）
function activeHours(interactions, topN = 3) {
  return hourHistogram(interactions)
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map((h) => h.hour);
}

// 低谷时段：深夜 23-5 点（减少打扰）
function isLowActivityHour(hour) {
  const h = hour == null ? new Date().getHours() : hour;
  return h >= 23 || h < 5;
}

// 近 n 条聊天情绪序列（按时间先后，只统计带 sentiment 的 chat 交互）
function recentChatSentiments(interactions, n = 30) {
  return (interactions || [])
    .filter((it) => it && it.type === 'chat' && it.sentiment)
    .slice(-n)
    .map((it) => it.sentiment);
}

// 近 n 条消极占比（无聊天数据 → null）
function recentNegativeRatio(interactions, n = 30) {
  const list = recentChatSentiments(interactions, n);
  if (!list.length) return null;
  return list.filter((s) => s === 'negative').length / list.length;
}

// 情绪倾向：近 30 条消极占比 >40% → low，<20% → high，否则 mid；无数据 → unknown
function moodLevel(interactions, n = 30) {
  const r = recentNegativeRatio(interactions, n);
  if (r === null) return 'unknown';
  if (r > 0.4) return 'low';
  if (r < 0.2) return 'high';
  return 'mid';
}

// 情绪感知安慰：最近 n 条聊天消息中消极 >= 2 条 → 低落（默认近 3 条含 2+）
function isFeelingDown(interactions, n = 3) {
  const list = (interactions || []).filter((it) => it && it.type === 'chat' && it.sentiment).slice(-n);
  return list.filter((it) => it.sentiment === 'negative').length >= 2;
}

// 话题频率统计（近 n 条含 topic 的交互，剔除 other）
function topicFrequency(interactions, n = 50) {
  const list = (interactions || []).filter((it) => it && it.topic && it.topic !== 'other').slice(-n);
  const counts = {};
  for (const it of list) counts[it.topic] = (counts[it.topic] || 0) + 1;
  return { counts, total: list.length };
}

function topicToWish(topic) { return TOPIC_TO_WISH[topic] || null; }

// 主求方向推断：explicit（settings.mainWish，'recommend'/'' 视为空）优先；
// 为空时用近 30 条话题频率最高者映射到主求方向，无数据 → null
function inferMainWish(explicitWish, interactions) {
  if (explicitWish && explicitWish !== 'recommend') return explicitWish;
  const { counts } = topicFrequency(interactions || getInteractions(), 30);
  let best = null, bestCount = 0;
  for (const [topic, c] of Object.entries(counts)) {
    if (c > bestCount) { bestCount = c; best = topic; }
  }
  return best ? topicToWish(best) : null;
}

// ---- MEMORY.md 生成辅助 ----
const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function describeHour(hour) {
  const p = hour < 5 ? '凌晨' : hour < 12 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜';
  return `${p} ${hour}-${hour + 1} 点`;
}

function fmtDateTime(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 消极消息按「星期+时段」聚类，取前 2 个（低谷时段描述）
function negativeClusters(interactions) {
  const buckets = {};
  for (const it of (interactions || [])) {
    if (!it || it.type !== 'chat' || it.sentiment !== 'negative') continue;
    if (!Number.isInteger(it.hour) || !(it.weekday >= 0 && it.weekday <= 6)) continue;
    const h = it.hour;
    const period = h < 5 ? '深夜' : h < 12 ? '上午' : h < 18 ? '下午' : '晚上';
    const key = `${WEEKDAY_CN[it.weekday]}${period}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
}

function daysAccompanied(interactions) {
  if (!interactions || !interactions.length) return 0;
  const first = new Date(interactions[0].ts);
  if (Number.isNaN(first.getTime())) return 0; // 无有效时间戳
  const diff = Date.now() - first.getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

function pct(r) { return `${Math.round((r || 0) * 100)}%`; }

// 常聊话题 topN：`财运（40%）、事业（25%）…`（近 50 条含 topic 的交互）
function topTopicsTxt(interactions, topN = 3) {
  const { counts, total } = topicFrequency(interactions, 50);
  if (!total) return '暂无数据';
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([t, c]) => `${TOPIC_LABELS[t] || t}（${pct(c / total)}）`)
    .join('、');
}

// MEMORY.md 生成器（含时间/占比/服务经验模板，输出合法 markdown）
// opts = { now?: Date, mainWish?: string }
function summarizeMemory(memory, opts = {}) {
  const now = opts.now || new Date();
  const interactions = (memory && memory.interactions) || [];
  const chatList = interactions.filter((it) => it.type === 'chat');
  const sent30 = recentChatSentiments(interactions, 30);
  const negRatio = sent30.length ? sent30.filter((s) => s === 'negative').length / sent30.length : 0;
  const posRatio = sent30.length ? sent30.filter((s) => s === 'positive').length / sent30.length : 0;
  const moodTxt = posRatio > negRatio ? '积极为主' : (negRatio > posRatio ? '消极偏多' : '平稳');

  // 使用习惯
  const topHours = hourHistogram(interactions).filter((h) => h.count > 0).sort((a, b) => b.count - a.count).slice(0, 2);
  const activeTxt = topHours.length ? `${topHours.map((h) => describeHour(h.hour)).join('、')}（互动最频繁）` : '暂无数据';
  const typeCounts = {};
  for (const it of interactions) {
    if (!it.type) continue;
    typeCounts[it.type] = (typeCounts[it.type] || 0) + 1;
  }
  const featTxt = Object.entries(typeCounts)
    .filter(([t]) => t !== 'startup' && t !== 'shutdown' && t !== 'wish')
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${TYPE_LABELS[t] || t}(${c}次)`)
    .join(' > ') || '暂无数据';
  const days = daysAccompanied(interactions);
  const dailyAvg = days ? Math.round(interactions.length / days) : 0;

  // 所求方向
  const explicit = (opts.mainWish && opts.mainWish !== 'recommend') ? opts.mainWish : '';
  const resolvedWish = inferMainWish(explicit, interactions);
  const mainTxt = resolvedWish ? `${WISH_LABELS[resolvedWish] || resolvedWish}（${explicit ? '设置指定' : '记忆推断'}）` : '未设置';
  // 推断候选（话题频率最高的前 2 个主求）
  const { counts } = topicFrequency(interactions, 30);
  const inferList = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([t]) => topicToWish(t)).filter(Boolean).map((w) => WISH_LABELS[w] || w);
  const inferTxt = inferList.length ? inferList.join('、') : '暂无';

  // 对话情绪
  const clusters = negativeClusters(interactions);
  const lastDown = [...chatList].reverse().find((it) => it.sentiment === 'negative' && it.text);

  // 服务经验（规则模板 + 从数据抽的结论）
  const serviceTips = ['- 喜欢简短的运势提醒，讨厌长篇播报'];
  if (clusters.length) serviceTips.push(`- ${clusters[0]} 消极消息偏多，适合安慰式语气，白天适合鼓励式`);
  serviceTips.push('- 财运话题回复要具体（数字/方位/吉时），不要空泛');
  if (resolvedWish) serviceTips.push(`- 主求侧重「${WISH_LABELS[resolvedWish]}」，运势提醒可优先围绕该方向给建议`);

  const lines = [
    '# 🧠 用户记忆体',
    `> 由财神日历自动生成 · 最后更新：${fmtDateTime(now)} · 已陪伴 ${days} 天`,
    '',
    '## 📊 使用习惯',
    `- 活跃时段：${activeTxt}`,
    `- 常用功能：${featTxt}`,
    `- 平均每天互动：约 ${dailyAvg} 次`,
    '',
    '## 🎯 所求方向',
    `- 主求：${mainTxt}｜推断：${inferTxt}`,
    `- 常聊话题：${topTopicsTxt(interactions, 3)}`,
    '',
    '## 💬 对话情绪',
    `- 整体情绪：${moodTxt}（近 30 条积极 ${pct(posRatio)} / 消极 ${pct(negRatio)}）`,
    `- 低谷时段：${clusters.length ? clusters.join('、') : '暂无数据'}（消极消息偏多）`,
    `- 最近一次低落：${lastDown ? `${fmtDateTime(new Date(lastDown.ts))} "${lastDown.text}"` : '暂无'}`,
    '',
    '## 🤝 服务经验',
    ...serviceTips,
    '',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 采集与持久化
// ---------------------------------------------------------------------------

function nowParts() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return {
    ts: d.toISOString(),
    hour: d.getHours(),
    weekday: d.getDay(),
    dateKey: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
  };
}

function load() {
  try {
    const p = memoryPath();
    if (p && fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (parsed && Array.isArray(parsed.interactions)) {
        if (!parsed.dailyStats) parsed.dailyStats = {};
        return parsed;
      }
    }
  } catch (e) {
    console.error('[userMemory] 读取 userMemory.json 失败:', e.message);
  }
  return { interactions: [], dailyStats: {}, lastUpdated: null };
}

function getMemory() {
  if (!_memory) _memory = load();
  return _memory;
}

function getInteractions() { return getMemory().interactions; }

function save() {
  try {
    const d = dataDir();
    if (!d) return; // 无法确定目录（node 单测未注入）→ 跳过写盘
    const mem = getMemory();
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(memoryPath(), JSON.stringify(mem, null, 2), 'utf-8');
  } catch (e) {
    console.error('[userMemory] 写入 userMemory.json 失败:', e.message);
  }
}

// 通用采集：type ∈ pet/chat/fortune/stick/startup/shutdown/wish；
// text/topic/sentiment/wish 可选。返回写入的条目（关闭/不可用时返回 null）
function trackInteraction({ type, text, topic, sentiment, wish }) {
  if (!_enabled) return null;
  const mem = getMemory();
  const p = nowParts();
  const item = { ts: p.ts, hour: p.hour, weekday: p.weekday, type: type || 'other' };
  if (topic) item.topic = topic;
  if (sentiment) item.sentiment = sentiment;
  if (text) item.text = String(text).slice(0, MAX_TEXT_LEN);
  if (wish) item.wish = wish;
  mem.interactions.push(item);
  mem.dailyStats[p.dateKey] = (mem.dailyStats[p.dateKey] || 0) + 1;
  if (mem.interactions.length > MAX_INTERACTIONS) {
    mem.interactions = mem.interactions.slice(-MAX_INTERACTIONS); // 容量上限
  }
  mem.lastUpdated = p.ts;
  save();
  return item;
}

function trackStartup() { return trackInteraction({ type: 'startup' }); }
function trackShutdown() { return trackInteraction({ type: 'shutdown' }); }

// 聊天消息：统一入口采集（话题分类 + 情绪分析）
function trackChat(text) {
  const t = String(text || '');
  if (!t.trim()) return null;
  const item = trackInteraction({ type: 'chat', text: t, topic: classifyTopic(t), sentiment: analyzeSentiment(t) });
  return item ? { topic: item.topic, sentiment: item.sentiment } : null;
}

// 主求方向：记录 mainWish 变化（'recommend'/'' 跳过，同一值不重复记）
function trackWish(wish) {
  const w = (wish || '').trim();
  if (!w || w === 'recommend' || w === _lastWish) return null;
  _lastWish = w;
  return trackInteraction({ type: 'wish', wish: w });
}

// 应用退出时刷新 MEMORY.md（agent 记忆体风格人类可读总结）
function refreshMemoryMd(opts = {}) {
  if (!_enabled) return null;
  const md = summarizeMemory(getMemory(), { now: new Date(), mainWish: opts.mainWish || '' });
  try {
    const d = dataDir();
    if (!d) return md; // 目录不可用 → 只返回不写盘
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(memoryMdPath(), md, 'utf-8');
  } catch (e) {
    console.error('[userMemory] 写入 MEMORY.md 失败:', e.message);
  }
  return md;
}

// 「📖 查看记忆」：读取 MEMORY.md 内容（未生成过 → 尝试实时生成）
function readMemoryMd(mainWish) {
  try {
    const p = memoryMdPath();
    if (p && fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  } catch (e) { /* ignore */ }
  return refreshMemoryMd({ mainWish: mainWish || '' });
}

// ---- 三处应用的判定（主进程可直接调用） ----
// ① 活跃时段感知：当前是否高峰（top3 小时）
function isHighActivityHour(hour) {
  const h = hour == null ? new Date().getHours() : hour;
  return activeHours(getInteractions(), 3).includes(h);
}
// ② 情绪感知安慰：近 3 条聊天消息含 2+ 消极 → 安慰气泡（深夜 + 低落 → 加强版）
function comfortPayload() {
  if (!isFeelingDown(getInteractions(), 3)) return null;
  const deep = isLowActivityHour();
  return {
    deep,
    text: deep
      ? '深夜了还在忙吗？小财知道主人心里压着事，慢慢说出来，小财都听着~ 🌙'
      : '主人是不是遇到烦心事了？小财在呢，说出来会好受些~',
  };
}
// ③ 主求侧重：mainWish 空时用记忆推断（内部读自己加载的记忆）
function inferredWish(explicitWish) {
  return inferMainWish(explicitWish, getInteractions());
}

function init(opts = {}) {
  if (opts.dir) _dir = opts.dir;
  if (typeof opts.enabled === 'boolean') _enabled = opts.enabled;
  _memory = load();
  return getMemory();
}

module.exports = {
  // 配置
  setDataDir, setEnabled, isEnabled, init,
  // 纯函数
  classifyTopic, analyzeSentiment, hourHistogram, activeHours, isLowActivityHour,
  recentChatSentiments, recentNegativeRatio, moodLevel, isFeelingDown,
  topicFrequency, topicToWish, inferMainWish, summarizeMemory,
  negativeClusters, daysAccompanied,
  // 采集
  trackStartup, trackShutdown, trackInteraction, trackChat, trackWish,
  // 持久化
  load, save, getMemory, getInteractions, refreshMemoryMd, readMemoryMd,
  // 应用判定
  isHighActivityHour, comfortPayload, inferredWish,
  // 常量（测试/展示用）
  MAX_INTERACTIONS, TOPIC_KEYWORDS, POSITIVE_WORDS, NEGATIVE_WORDS,
  POSITIVE_EMOJI, NEGATIVE_EMOJI, TOPIC_LABELS, WISH_LABELS, TOPIC_TO_WISH,
};
