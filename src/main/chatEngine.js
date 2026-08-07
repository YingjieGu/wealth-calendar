// Chat engine: LLM chat with tool-calling via a JSON action protocol.
// 1) LLM replies; if the reply contains {"action":..., "params":...}, the tool
//    is executed and the LLM is asked to summarize the result for the user.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const userMemory = require('./userMemory');

const HISTORY_PATH = () => path.join(app.getPath('userData'), 'chat_history.json');
const MAX_HISTORY = 20;

function loadSettings() {
  try {
    const p = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { /* ignore */ }
  return {};
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH())) {
      const h = JSON.parse(fs.readFileSync(HISTORY_PATH(), 'utf-8'));
      if (Array.isArray(h)) return h;
    }
  } catch (e) { /* ignore */ }
  return [];
}
function saveHistory(h) {
  try {
    fs.writeFileSync(HISTORY_PATH(), JSON.stringify(h.slice(-MAX_HISTORY), null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const SYSTEM_PROMPT = `你是桌面应用"财神日历"里的财神小助手"小财"，一只可爱的小财神萌宠。
人设：说话活泼可爱、带点俏皮，自称"小财"，语气轻松友善，可以加 ~ 结尾。你懂一点命理黄历，也会帮用户打理日程。
今天是 ${todayStr()}（请用这个日期计算"今天/明天/后天"等相对时间）。

能力与规则：
1. 闲聊、运势话题：直接回复文本。
2. 用户要求"添加/记录/安排日程"：只输出一个 JSON（不要 markdown 代码块、不要其他文字）：
   {"action":"add_schedule","params":{"title":"日程标题","date":"YYYY-MM-DD","time":"HH:mm 或省略","remindBeforeMin":数字或省略,"note":"备注或省略"}}
   日期必须按今天=${todayStr()}推算成具体 YYYY-MM-DD。时间用 24 小时制。
3. 用户要求"查看/查询日程"：输出 {"action":"query_schedule","params":{"date":"YYYY-MM-DD"}}（省略 date 则查今天）。
4. 用户要求"删除日程"：输出 {"action":"delete_schedule","params":{"id":数字}}。若要删某天日程先查询，从查询结果里找 id。
5. 用户问"今日运势/财运/桃花运/运势"：输出 {"action":"query_fortune"}。
6. 回答要简洁，一般不超过 3 句话。`;

function buildSystemWithDate() {
  return SYSTEM_PROMPT;
}

async function callLLM(mc, messages) {
  const baseUrl = (mc.llmBaseUrl || 'https://api.deepseek.com').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mc.llmApiKey}` },
      body: JSON.stringify({
        model: mc.llmModel || 'deepseek-v4-flash',
        temperature: 0.8,
        // v4 series are reasoning models: reasoning_content consumes tokens too.
        max_tokens: 8000,
        messages,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (!content) throw new Error('LLM empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

// --- 伙伴模式 L2：选中文本/URL 总结 ---

// 简单抓取 URL 正文并去标签（无外链依赖，超时 15s；抓取失败返回 null）
async function fetchUrlText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (WealthCalendar) Chrome/120.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } finally {
    clearTimeout(timer);
  }
}

// 检测消息是否以 URL 开头（http/https）
function extractUrl(message) {
  const m = String(message || '').trim().match(/^https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

// URL 文章总结：fetch 正文 → LLM 总结 3 条要点
async function summarizeUrl(url, mc) {
  let text;
  try {
    text = await fetchUrlText(url);
  } catch (e) {
    return { reply: `🔗 链接抓取失败（${e.message}）。可能是网络不通或被反爬，换个链接试试？`, toolExecuted: false, url };
  }
  if (!text || text.length < 50) {
    return { reply: '🔗 这个页面正文太短或抓不到内容，换篇文章试试？', toolExecuted: false, url };
  }
  const messages = [
    { role: 'system', content: '你是桌面宠物小财。用户给了一段从网页提取的正文，请用中文总结成 3 条要点：每条一行、简短口语化、带「• 」前缀、小财口吻（可加 ~）。只输出要点，不要其他内容。' },
    { role: 'user', content: `链接: ${url}\n\n网页正文：\n${text}` },
  ];
  try {
    const reply = await callLLM(mc, messages);
    return { reply: `📄 ${url}\n${reply}`, toolExecuted: false, url };
  } catch (e) {
    return { reply: `🔗 总结失败：${e.message}`, toolExecuted: false, url };
  }
}

// 选中文本总结：LLM 总结成 3 条要点（剪贴板读取在主进程 main.js 完成）
async function summarize(text) {
  const settings = loadSettings();
  const mc = settings.modelConfig || {};
  if (!mc.llmApiKey) {
    return '小财的 AI 大脑还没接上呢～去 ⚙️设置 → AI 命理 填一下 API Key，我就能帮你总结选中内容啦！';
  }
  const messages = [
    { role: 'system', content: '你是桌面宠物小财。请把用户选中的内容总结成 3 条要点：每条一行、简短口语化、带「• 」前缀、小财口吻（可加 ~）。只输出要点，不要其他内容。' },
    { role: 'user', content: String(text).slice(0, 8000) },
  ];
  try {
    return await callLLM(mc, messages);
  } catch (e) {
    console.error('[partner] summarize failed:', e.message);
    return `总结失败：${e.message}`;
  }
}

// ============================================================
// 技能路由 L3-L4：计算器 / 天气 / 翻译 / 数字吉凶 / 邮件
// 在调用 LLM 前检测意图；开关受 settings.skills 控制（默认全开）；
// 不需 LLM 的技能（计算器/天气/数字吉凶/邮件）在无 API Key 下也可用
// ============================================================

const SKILL_DEFAULTS = { calculator: true, weather: true, translate: true, luckyNumber: true, mail: true };

function skillState(settings) {
  const s = settings.skills || {};
  return {
    calculator: s.calculator !== false,
    weather: s.weather !== false,
    translate: s.translate !== false,
    luckyNumber: s.luckyNumber !== false,
    mail: s.mail !== false,
  };
}

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1e6) / 1e6);
}

// --- 1) 计算器：本地求值，无需 LLM ---
const CALC_RE = /^\s*([0-9+\-*/%().\s]+)=\s*$/;
function tryCalculator(msg) {
  const m = String(msg).trim().match(CALC_RE);
  if (!m) return null;
  const expr = m[1].trim();
  if (!/\d/.test(expr)) return null;
  try {
    // 正则已白名单（仅数字/运算符/括号/空格），无注入风险
    const val = Function(`"use strict"; return (${expr});`)();
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    return `🧮 ${expr} = ${fmtNum(val)}`;
  } catch (e) { return null; }
}

// --- 2) 天气：wttr.in 简略天气，网络失败降级提示 ---
function tryWeather(msg) {
  const m = String(msg).trim().match(/^天气\s*([一-龥A-Za-z]+)$/);
  if (!m) return null;
  return m[1];
}
async function runWeather(city) {
  if (!city) return { reply: '🌤 告诉我城市名呀，比如「天气 北京」～', toolExecuted: false, skill: 'weather' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+%w&lang=zh`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'curl' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    if (!text || /unknown|not found/i.test(text)) {
      return { reply: `🌤 没查到「${city}」的天气，换个城市名试试？`, toolExecuted: false, skill: 'weather' };
    }
    return { reply: `🌤 ${city}天气：${text}`, toolExecuted: false, skill: 'weather' };
  } catch (e) {
    return { reply: '🌤 天气服务暂时连不上（网络不通），稍后再试试～', toolExecuted: false, skill: 'weather' };
  } finally {
    clearTimeout(timer);
  }
}

// --- 3) 翻译：调 LLM 翻译成目标语言 ---
function tryTranslate(msg) {
  const m = String(msg).trim().match(/^翻译\s+(.+)$/);
  if (!m || !m[1].trim()) return null;
  return m[1].trim();
}
const DIR_CN = { '翻译成英文': 'translate to English', '翻译成中文': 'translate to Chinese' };
async function runTranslate(text, mc) {
  if (!mc.llmApiKey) {
    return { reply: '翻译要接上小财的 AI 大脑才行～去 ⚙️设置 → AI 命理 填一下 API Key 就好啦！', toolExecuted: false, skill: 'translate' };
  }
  const cjkRatio = (text.match(/[一-龥]/g) || []).length / Math.max(1, text.length);
  const dir = cjkRatio > 0.3 ? '翻译成英文' : '翻译成中文';
  const messages = [
    { role: 'system', content: '你是桌面宠物小财的翻译助手。只输出翻译结果，不要解释，自然简洁。' },
    { role: 'user', content: `请${dir}（${DIR_CN[dir]}）：\n${text}` },
  ];
  try {
    const reply = await callLLM(mc, messages);
    return { reply: `🌐 ${reply.trim()}`, toolExecuted: false, skill: 'translate' };
  } catch (e) {
    return { reply: `🌐 翻译失败：${e.message}`, toolExecuted: false, skill: 'translate' };
  }
}

// --- 4) 数字吉凶：财神风格本地模板 ---
function tryLuckyNumber(msg) {
  const m = String(msg).trim().match(/^数字\s*([0-9]+)$/);
  return m ? m[1] : null;
}
function luckyNumberReading(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return `🔢 「${raw}」我没看懂呀，给个 0~99999 之间的数字？`;
  const digits = String(n);
  const sum = digits.split('').reduce((a, c) => a + parseInt(c, 10), 0);
  const isEven = n % 2 === 0;
  const luckyChar = { 6: '顺', 8: '发', 9: '久', 3: '生', 5: '我' };
  const riches = [...new Set(digits.split('').filter((d) => Object.prototype.hasOwnProperty.call(luckyChar, d)))];
  const parts = [];
  parts.push(`数字 ${n}，财神爷瞅了瞅：`);
  parts.push(isEven ? '偶数主静，宜守成理财，稳稳当当见真金～' : '奇数主动，宜进取布局，敢拼敢赢财运开～');
  if (sum % 3 === 0) parts.push('数位相加逢三，气数顺，正财偏财都容易入门～');
  else if (sum % 5 === 0) parts.push('数位相加逢五，五行土旺，适合置业存钱～');
  else if (sum % 7 === 0) parts.push('数位相加逢七，暗合玄机，近期或有机缘～');
  if (riches.length) parts.push(`含「${riches.map((d) => d + luckyChar[d]).join('、')}」之数，招财意象满满～`);
  if (digits.length >= 3 && n % 9 === 0) parts.push('整倍数逢九，贵人运抬头～');
  parts.push('小财建议：把这数用在记账、定价、投资金额上，添个好彩头～');
  return `🔢 ${parts.join(' ')}`;
}

// --- 5) 邮件：需设置面板配置，走 sidecar 标准库端点（imaplib/smtplib） ---
function mailConfig(settings) {
  const m = settings.mail || {};
  return {
    imapServer: (m.imapServer || '').trim(),
    imapPort: parseInt(m.imapPort || 993, 10) || 993,
    smtpServer: (m.smtpServer || '').trim(),
    smtpPort: parseInt(m.smtpPort || 465, 10) || 465,
    email: (m.email || '').trim(),
    password: (m.password || ''),
  };
}
function tryMail(msg) {
  const t = String(msg).trim();
  if (/^收邮件$/.test(t)) return { type: 'list' };
  const s = t.match(/^发邮件[:：]\s*(.+)$/);
  if (s) {
    const parts = s[1].split('|').map((p) => p.trim());
    if (parts.length >= 3) return { type: 'send', subject: parts[0], to: parts[1], body: parts.slice(2).join('|') };
    if (parts.length === 2) return { type: 'send', subject: parts[0], to: parts[1], body: '' };
    return { type: 'sendMalformed' };
  }
  return null;
}
async function runMail(cmd, deps, settings) {
  const cfg = mailConfig(settings);
  if (!cfg.email || !cfg.imapServer || !cfg.smtpServer) {
    return { reply: '📮 请先在 ⚙️设置 → 邮件服务 里配置邮箱，再让本财帮你收发邮件～', toolExecuted: false, skill: 'mail' };
  }
  const rs = deps && deps.requestSidecar;
  if (!rs) return { reply: '📮 邮件服务暂不可用，请稍后再试～', toolExecuted: false, skill: 'mail' };
  if (cmd.type === 'list') {
    const r = await rs('POST', '/mail/list', {
      imapServer: cfg.imapServer, imapPort: cfg.imapPort, email: cfg.email, password: cfg.password,
    });
    if (r.status >= 400 || (r.data && r.data.error)) {
      const msg = (r.data && r.data.error) || `HTTP ${r.status}`;
      return { reply: `📮 收件失败：${msg}`, toolExecuted: false, skill: 'mail' };
    }
    const emails = ((r.data && r.data.emails) || []).slice(0, 5);
    if (!emails.length) return { reply: '📮 收件箱空空的，一封邮件都没有～', toolExecuted: false, skill: 'mail' };
    const lines = emails.map((e, i) => `${i + 1}. 「${e.subject || '(无主题)'}」 来自 ${e.from || '?'} ｜ ${e.snippet || ''}`);
    return { reply: `📮 最近 ${emails.length} 封邮件：\n${lines.join('\n')}`, toolExecuted: false, skill: 'mail' };
  }
  if (cmd.type === 'send') {
    if (!cmd.to) return { reply: '📮 发件格式：发邮件: 主题|收件人|正文', toolExecuted: false, skill: 'mail' };
    const r = await rs('POST', '/mail/send', {
      smtpServer: cfg.smtpServer, smtpPort: cfg.smtpPort, email: cfg.email, password: cfg.password,
      to: cmd.to, subject: cmd.subject, body: cmd.body,
    });
    if (r.status >= 400 || (r.data && r.data.error)) {
      const msg = (r.data && r.data.error) || `HTTP ${r.status}`;
      return { reply: `📮 发送失败：${msg}`, toolExecuted: false, skill: 'mail' };
    }
    return { reply: `📮 已发给 ${cmd.to}：${cmd.subject || '(无主题)'}`, toolExecuted: false, skill: 'mail' };
  }
  return { reply: '📮 发件格式：发邮件: 主题|收件人|正文', toolExecuted: false, skill: 'mail' };
}

// 技能总路由：命中任一技能即返回结果；未命中返回 null 走正常 LLM 对话
async function runSkill(userMessage, deps) {
  const settings = loadSettings();
  const skills = skillState(settings);
  const mc = settings.modelConfig || {};

  if (skills.calculator) {
    const r = tryCalculator(userMessage);
    if (r) return { reply: r, skill: 'calculator', toolExecuted: false };
  }
  if (skills.weather) {
    const city = tryWeather(userMessage);
    if (city !== null) return await runWeather(city);
  }
  if (skills.translate) {
    const t = tryTranslate(userMessage);
    if (t !== null) return await runTranslate(t, mc);
  }
  if (skills.luckyNumber) {
    const n = tryLuckyNumber(userMessage);
    if (n !== null) return { reply: luckyNumberReading(n), skill: 'luckyNumber', toolExecuted: false };
  }
  // 邮件：技能开关开启才走（未配置走 runMail 提示）
  if (skills.mail) {
    const mail = tryMail(userMessage);
    if (mail) return await runMail(mail, deps, settings);
  }

  return null;
}

function parseAction(reply) {
  // Find the JSON object containing "action", using brace balancing so nested
  // objects (e.g. params:{...}) don't truncate the match.
  const idx = reply.indexOf('"action"');
  if (idx === -1) return null;
  const start = reply.lastIndexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < reply.length; i++) {
    if (reply[i] === '{') depth++;
    else if (reply[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(reply.slice(start, i + 1));
          if (obj && obj.action) return obj;
        } catch (e) { /* fall through */ }
        return null;
      }
    }
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {object} deps { executeTool(action, params) => Promise<result> }
 */
async function chatSend(userMessage, deps) {
  const settings = loadSettings();
  const mc = settings.modelConfig || {};
  const deps0 = deps || {};

  // v0.4.20 用户记忆体：入口统一采集聊天消息（话题分类 + 情绪分析）。
  // 放在技能路由之前，保证命中技能（runSkill）的请求也被记录。
  try { userMemory.trackChat(String(userMessage || '')); } catch (e) { /* ignore */ }

  // 技能路由 L3-L4：命中计算器/天气/翻译/数字吉凶/邮件时优先执行。
  // 在 LLM 调用前检测意图；不需 LLM 的技能在无 API Key 下也可用。
  const skillResult = await runSkill(userMessage, deps0);
  if (skillResult) {
    const h = loadHistory();
    h.push({ role: 'user', content: userMessage }, { role: 'assistant', content: skillResult.reply });
    saveHistory(h);
    return skillResult;
  }

  if (!mc.llmApiKey) {
    return {
      reply: '小财的 AI 大脑还没接上呢～去 ⚙️设置 → AI 命理 填一下 API Key，我就能陪你聊天、帮你记日程啦！',
      toolExecuted: false,
    };
  }

  // 伙伴模式 L2：URL 开头 → 抓正文 + LLM 总结（不走普通闲聊，直接返回摘要）
  const url = extractUrl(userMessage);
  if (url) {
    return summarizeUrl(url, mc);
  }

  const history = loadHistory();
  const messages = [
    { role: 'system', content: buildSystemWithDate() },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ];

  let finalReply = '';
  let toolExecuted = false;

  try {
    const reply1 = await callLLM(mc, messages);
    const action = parseAction(reply1);

    if (action && deps.executeTool) {
      toolExecuted = true;
      let result;
      try {
        result = await deps.executeTool(action.action, action.params || {});
      } catch (e) {
        result = { error: e.message };
      }
      messages.push({ role: 'assistant', content: reply1 });
      messages.push({
        role: 'user',
        content: `工具 ${action.action} 执行结果：${JSON.stringify(result)}。请用一句简短友好的话（小财口吻）告知用户结果，不要重复输出 JSON。`,
      });
      const reply2 = await callLLM(mc, messages);
      finalReply = reply2;
    } else {
      finalReply = reply1;
    }
  } catch (e) {
    console.error('[chat] failed:', e.message);
    finalReply = '小财刚才卡了一下…请稍后再试试～';
  }

  // Persist history (user + assistant turns)
  const h = loadHistory();
  h.push({ role: 'user', content: userMessage }, { role: 'assistant', content: finalReply });
  saveHistory(h);

  return { reply: finalReply, toolExecuted };
}

function clearHistory() {
  saveHistory([]);
}

module.exports = {
  chatSend, clearHistory, parseAction, summarize, summarizeUrl, extractUrl, fetchUrlText,
  runSkill, tryCalculator, tryWeather, tryTranslate, tryLuckyNumber, tryMail, luckyNumberReading,
  skillState, mailConfig,
  _internals: { SYSTEM_PROMPT, buildSystemWithDate },
};
