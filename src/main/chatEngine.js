// Chat engine: LLM chat with tool-calling via a JSON action protocol.
// 1) LLM replies; if the reply contains {"action":..., "params":...}, the tool
//    is executed and the LLM is asked to summarize the result for the user.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

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
  _internals: { SYSTEM_PROMPT, buildSystemWithDate },
};
