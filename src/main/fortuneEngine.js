// Daily fortune pipeline: bazi + natal chart + almanac -> LLM (or template fallback) -> cache.
// Design: data paths injectable for testability; no side effects on require.
const { app, Notification } = require('electron');
const fs = require('fs');
const path = require('path');

let _dataDir = null; // injectable for tests
function dataDir() {
  if (_dataDir) return _dataDir;
  return app.getPath('userData');
}
function fortunePath() {
  return path.join(dataDir(), 'fortune.json');
}
function settingsPath() {
  return path.join(dataDir(), 'settings.json');
}

// LLM 调用详细诊断日志（win 连不上命理模型排查用）: debug/llm-error.log
function llmDebugPath() {
  return path.join(dataDir(), 'debug', 'llm-error.log');
}
function appendLLMDebug(msg) {
  try {
    const p = llmDebugPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) { /* 日志失败不影响主流程 */ }
}

function loadJson(p, fallback) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    console.error('[fortune] failed to load', p, e);
  }
  return fallback;
}
function saveJson(p, data) {
  try {
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[fortune] failed to save', p, e);
  }
}

const WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };

const WISH_LABELS = {
  wealth: '求财（提醒侧重财运：赚钱机会、偏财、投资、财神方位）',
  love: '求姻缘（提醒侧重姻缘：桃花、人缘、约会吉时）',
  career: '求事业（提醒侧重事业：工作、晋升、贵人、签约）',
  health: '求健康（提醒侧重健康：作息、运动、养生）',
  study: '求学业（提醒侧重学业：考试、学习、记忆）',
  peace: '求平安（提醒侧重平安：出行安全、避凶、是非）',
};

// ---------------------------------------------------------------------------
// Template fallback (pure, testable)
// ---------------------------------------------------------------------------
function buildTemplateFortune(paipan, almanac, dateStr, wish, zodiac) {
  const almanacYi = (almanac && almanac.yi) || [];
  const almanacJi = (almanac && almanac.ji) || [];
  const caiShen = (almanac && almanac.direction && almanac.direction.caiShenDesc) || '';
  const dayGanZhi = (almanac && almanac.lunar && almanac.lunar.dayGanZhi) || '';
  const dayGan = dayGanZhi ? dayGanZhi[0] : '';
  const dayGanWuXing = WUXING[dayGan] || '';
  const dayMaster = (paipan && paipan.dayMaster && paipan.dayMaster.wuXing) || '';

  // Simple 生克 score modifier: 生我者 +, 同我者 +, 我克者 +, 克我者 -, 我生者 -
  let mod = 0;
  if (dayMaster && dayGanWuXing) {
    const rel = relationOf(dayMaster, dayGanWuXing);
    if (rel === 'shengWo') mod += 8;       // 生我
    else if (rel === 'tongWo') mod += 5;   // 同我
    else if (rel === 'woKe') mod += 3;     // 我克
    else if (rel === 'keWo') mod -= 4;     // 克我
    else if (rel === 'woSheng') mod -= 2;  // 我生
  }
  const jiShenBonus = Math.min((almanac && almanac.jiShen ? almanac.jiShen.length : 0) * 2, 8);
  const yiBonus = Math.min(almanacYi.length * 1, 4);

  const base = (n) => Math.max(35, Math.min(95, Math.round(58 + mod + jiShenBonus + n)));

  const dims = {
    wealth: { score: base(yiBonus), summary: '', advice: '' },
    career: { score: base(0), summary: '', advice: '' },
    love: { score: base(0), summary: '', advice: '' },
    health: { score: base(0), summary: '', advice: '' },
    study: { score: base(0), summary: '', advice: '' },
    travel: { score: base(0), summary: '', advice: '' },
    signing: { score: base(yiBonus), summary: '', advice: '' },
  };

  const wealthAdvice = caiShen ? `今日财神方位在${caiShen}，可朝此方位安排重要事务` : '财运宜稳，忌冲动消费';
  dims.wealth.summary = caiShen ? `财神在${caiShen}，偏财运较平日活跃` : '财运平稳';
  dims.wealth.advice = wealthAdvice;
  dims.career.summary = '事业宜按部就班，稳中求进';
  dims.career.advice = '重要决策前多征询他人意见';
  dims.love.summary = '人际缘分温和，适合沟通交流';
  dims.love.advice = '主动关心身边人，会有意外收获';
  dims.health.summary = '精力尚可，注意作息规律';
  dims.health.advice = '适当运动，避免熬夜';
  dims.study.summary = '学习吸收力不错';
  dims.study.advice = '适合整理笔记、温故知新';
  dims.travel.summary = '出行顺利，留意交通细节';
  dims.travel.advice = '出门前检查随身物品';
  dims.signing.summary = '文书合约宜仔细核对';
  dims.signing.advice = '签约前看清条款，不急于落笔';

  const scores = Object.values(dims).map((d) => d.score);
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const yiText = almanacYi.length ? almanacYi.slice(0, 3).join('、') : '诸事顺遂';
  const jiText = almanacJi.length ? almanacJi.slice(0, 3).join('、') : '无';

  // 主求方向侧重提醒语
  const wishLines = {
    wealth: [
      `小财发现，今日你财运${dims.wealth.score >= 75 ? '很不错' : '平稳'}（${dims.wealth.score}分），${dims.wealth.advice}~`,
      `今日宜${yiText}，财神在${caiShen || '吉位'}，重要求财之事可安排在这个方位~`,
    ],
    love: [
      `小财发现，今日你桃花运${dims.love.score >= 75 ? '旺盛' : '温温的'}（${dims.love.score}分），${dims.love.advice}~`,
      `今日宜${yiText}，${dims.love.summary}，主动一点会有意外惊喜哦~`,
    ],
    career: [
      `小财发现，今日你事业运${dims.career.score >= 75 ? '稳中有升' : '平稳'}（${dims.career.score}分），${dims.career.advice}~`,
      `今日宜${yiText}，重要工作安排在这个时段效率更高~`,
    ],
    health: [
      `小财发现，今日你健康运势${dims.health.score}分，${dims.health.advice}，小财会提醒你按时休息的~`,
      `今日宜${yiText}，忌${jiText}，注意劳逸结合~`,
    ],
    study: [
      `小财发现，今日你学业运势${dims.study.score}分，${dims.study.advice}~`,
      `今日宜${yiText}，专注力不错的时段要抓住哦~`,
    ],
    peace: [
      `小财发现，今日宜${yiText}，忌${jiText}，出行留意安全，小财保佑你平平安安~`,
      `今日诸事${dims.travel.score >= 70 ? '顺遂' : '多留心'}，遇事不急，稳字当头~`,
    ],
  };
  const zText = zodiac ? `生肖${zodiac}的你，` : '';
  const lines = wish && wishLines[wish]
    ? wishLines[wish]
    : [
        `${zText}小财发现，今日宜${yiText}，整体运势 ${overall} 分，${dims.wealth.advice}~`,
        `今日忌${jiText}，${dims.career.advice}，小财会一直陪着你哦～`,
      ];
  const reminderLines = lines;

  // 幸运数字：从日期 + 日干五行推导（河图洛书五行数：木3/8 火2/7 土5/10 金4/9 水1/6）
  const WUXING_NUM = { 木: [3, 8], 火: [2, 7], 土: [5, 10], 金: [4, 9], 水: [1, 6] };
  const wxNums = WUXING_NUM[dayGanWuXing] || WUXING_NUM['土'];
  const dateParts = (dateStr || '').split('-');
  const monthNum = parseInt(dateParts[1] || '0', 10) || 1;
  const dayNum = parseInt(dateParts[2] || '0', 10) || 1;
  const luckySeed = [dayNum % 10 === 0 ? 10 : dayNum % 10, wxNums[(dayNum + monthNum) % 2], ((monthNum * 7 + dayNum) % 9) + 1];
  const luckyNumber = [...new Set(luckySeed)];
  let fill = 1;
  while (luckyNumber.length < 3) { luckyNumber.push(((dayNum + fill * 3) % 9) + 1); fill++; }
  luckyNumber.length = 3;

  // 幸运色/开运物：从日干五行推导（木=绿/木质手串 火=红/红绳 土=黄褐/黄水晶 金=金/貔貅 水=黑/黑曜石）
  const WUXING_COLOR = { 木: '绿色', 火: '红色', 土: '黄褐色', 金: '金色', 水: '黑色' };
  const WUXING_ITEM = { 木: '木质手串', 火: '红绳手链', 土: '黄水晶摆件', 金: '貔貅挂件', 水: '黑曜石吊坠' };
  const luckyColor = WUXING_COLOR[dayGanWuXing] || '金色';
  const luckyItem = WUXING_ITEM[dayGanWuXing] || '貔貅挂件';

  // 彩票/意外之财建议：从黄历宜忌生成（娱乐向，鼓励量力而行）
  const wealthYiWords = ['求财', '交易', '开市', '纳财', '招财'];
  const wealthJiWords = ['破财', '耗财'];
  const yiJoined = almanacYi.join('、');
  const jiJoined = almanacJi.join('、');
  const hasWealthYi = wealthYiWords.some((w) => yiJoined.includes(w));
  const hasWealthJi = wealthJiWords.some((w) => jiJoined.includes(w));
  let lotteryTip;
  if (hasWealthYi) {
    lotteryTip = '今日宜求财，偏财机会在线，可小试手气（彩票娱乐，量力而行）~';
  } else if (hasWealthJi) {
    lotteryTip = '今日忌破财，小财提醒偏财宜守不宜搏，娱乐为主~';
  } else if (caiShen) {
    lotteryTip = `今日财神方位在${caiShen}，意外之财可遇不可求，顺其自然就好~`;
  } else {
    lotteryTip = '小财建议量力而行，娱乐为主，开心就好～';
  }

  return {
    date: dateStr,
    overall,
    dimensions: dims,
    luckyTime: ['09:00-11:00', '15:00-17:00'],
    directions: { wealth: caiShen || '—', love: '西南' },
    luckyNumber,
    luckyColor,
    luckyItem,
    lotteryTip,
    reminderLines,
    disclaimer: '仅供参考娱乐',
  };
}

// 五行生克关系: 木→火→土→金→水→木 (相生); 木克土, 土克水, 水克火, 火克金, 金克木
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
function relationOf(me, other) {
  if (me === other) return 'tongWo';
  if (SHENG[me] === other) return 'woSheng'; // 我生
  if (SHENG[other] === me) return 'shengWo'; // 生我
  // 相克: 我克 = 我克制的; 克我 = 克制我的
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
  if (KE[me] === other) return 'woKe';
  return 'keWo';
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------
async function callLLM({ apiKey, baseUrl, model }, userPrompt) {
  const url = `${(baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  // 代理环境信息（Electron 主进程 fetch 走 Chromium 网络栈，win 上默认受系统代理影响）
  const proxyInfo = {
    HTTP_PROXY: process.env.HTTP_PROXY || '',
    HTTPS_PROXY: process.env.HTTPS_PROXY || '',
    NO_PROXY: process.env.NO_PROXY || '',
  };
  try {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'deepseek-v4-flash',
          temperature: 0.8,
          // v4 series are reasoning models: reasoning_content also consumes tokens,
          // so keep a generous budget or content may come back empty/truncated.
          max_tokens: 16000,
          messages: [
            {
              role: 'system',
              content:
                '你是资深命理师"财神小助手"，精通八字、星盘、黄历。根据用户命理数据输出当日运势，语气生动有趣（可爱萌宠口吻，称呼自己"小财"）。必须只输出合法 JSON，不要 markdown 代码块，不要任何额外文字。JSON 结构: {"overall":0-100,"dimensions":{"wealth":{"score":0-100,"summary":"一句话","advice":"一句建议"},"career":{...},"love":{...},"health":{...},"study":{...},"travel":{...},"signing":{...}},"luckyTime":["HH:mm-HH:mm","HH:mm-HH:mm"],"directions":{"wealth":"方位","love":"方位"},"luckyNumber":[3个1-9的幸运数字],"luckyColor":"幸运色，如金色","luckyItem":"开运物/幸运饰品，如貔貅挂件","lotteryTip":"一句彩票/意外之财建议，娱乐向，鼓励量力而行","reminderLines":["2到3条生动提醒语，萌宠口吻，如小财发现你今天财运爆棚，可以去刮一张彩票~"],"disclaimer":"仅供参考娱乐"}。运势分数要合理分布，不要全是高分。',
            },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2000,
        }),
      });
    } catch (fetchErr) {
      // 记录完整诊断：错误类型 / 是否超时 / 代理信息 / baseUrl
      const detail = {
        type: 'fetch_failed',
        errorName: fetchErr && fetchErr.name,
        errorMessage: String((fetchErr && fetchErr.message) || fetchErr),
        cause: fetchErr && fetchErr.cause ? String(fetchErr.cause) : undefined,
        timedOut: !!(fetchErr && fetchErr.name === 'AbortError'),
        url,
        apiKeyTail: (apiKey || '').slice(-4),
        baseUrl,
        model,
        proxyEnv: proxyInfo,
      };
      appendLLMDebug(`LLM fetch 失败:\n${JSON.stringify(detail, null, 2)}`);
      throw new Error(`LLM fetch failed: ${fetchErr && fetchErr.message}`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      appendLLMDebug(`LLM HTTP ${res.status} url=${url} keyTail=${(apiKey || '').slice(-4)} body=${errText.slice(0, 300)}`);
      console.error(`[fortune] LLM HTTP ${res.status} url=${url} keyTail=${(apiKey || '').slice(-4)} err=${errText.slice(0, 200)}`);
      throw new Error(`LLM HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (!content) {
      appendLLMDebug(`LLM 空响应 url=${url}`);
      throw new Error('LLM empty response');
    }
    return parseLLMJson(content);
  } catch (e) {
    // 降级保证：由 getDailyFortune 的 catch 回退到 buildTemplateFortune
    appendLLMDebug(`LLM 调用失败(将降级模板): ${e.message}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseLLMJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object in LLM response');
  return JSON.parse(text.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function getDailyFortune(dateStr, forceRefresh, deps = {}) {
  const requestSidecar = deps.requestSidecar;

  const cache = loadJson(fortunePath(), { fortuneByDate: {} });
  const todayKey = dateStr || new Date().toISOString().slice(0, 10);

  if (!forceRefresh && cache.fortuneByDate[todayKey]) {
    return { data: cache.fortuneByDate[todayKey].data, source: cache.fortuneByDate[todayKey].source || 'cache', cached: true };
  }

  const settings = loadJson(settingsPath(), {});
  const userInfo = settings.userInfo || {};
  if (!userInfo.birth) {
    return { error: 'noUserInfo', message: '请先在设置中填写出生信息' };
  }
  const gender = userInfo.gender || 'male';
  const zodiac = userInfo.zodiac || ''; // 生肖：用户可手动设置（默认按出生年份自动算）

  // Parallel sidecar calls
  const [paipan, chart, almanac] = await Promise.all([
    requestSidecar('POST', '/bazi/paipan', { birth: userInfo.birth, gender }),
    requestSidecar('POST', '/chart/natal', { birth: userInfo.birth }),
    requestSidecar('GET', `/almanac/today?date=${encodeURIComponent(todayKey)}`),
  ]);
  if (paipan.error || chart.error || almanac.error) {
    return { error: 'sidecar', message: '命理服务不可用，请稍后重试' };
  }
  const paipanData = paipan.data && paipan.data.error ? paipan : paipan;
  const paipanOk = paipanData.data && !paipanData.data.error;
  const almanacOk = almanac.data && !almanac.data.error;

  // LLM prompt: 主求方向侧重提醒
  const wish = settings.mainWish || '';
  const wishPrompt = wish && WISH_LABELS[wish]
    ? `\n用户主求方向：${WISH_LABELS[wish]}。提醒语(reminderLines)和吉时应侧重此方向，其他维度仍全量输出。`
    : '\n用户未设主求方向，提醒语全面覆盖各维度。';

  // Try LLM
  const modelConfig = settings.modelConfig || {};
  let fortune = null;
  let source = 'template';
  if (modelConfig.llmApiKey && paipanOk && almanacOk) {
    try {
      // Compact prompt: keep essential bazi/chart fields to limit reasoning cost
      const compactPaipan = paipanData.data ? {
        pillars: paipanData.data.pillars,
        dayMaster: paipanData.data.dayMaster,
        wuXingCount: paipanData.data.wuXingCount,
        qiYunAge: paipanData.data.qiYunAge,
        daYun: (paipanData.data.daYun || []).slice(0, 5),
      } : {};
      const chartData = chart.data || {};
      const compactChart = {
        planets: Object.fromEntries(
          Object.entries(chartData.planets || {}).map(([k, v]) => [k, { sign: v.sign, degree: v.degree, label: v.label, planetLabel: v.planetLabel }])
        ),
        ascendant: chartData.ascendant,
        aspects: chartData.aspects,
      };
      const userPrompt =
        `日期：${todayKey}\n` +
        `用户八字排盘：\n${JSON.stringify(compactPaipan, null, 2)}\n` +
        `用户星盘：\n${JSON.stringify(compactChart, null, 2)}\n` +
        `当日黄历：\n${JSON.stringify(almanac.data, null, 2)}\n` +
        `用户生肖（手动设置优先）：${zodiac || '未设置，按出生年份推算'}\n` +
        wishPrompt +
        `请按系统要求输出当日运势 JSON。`;
      fortune = await callLLM({
        apiKey: modelConfig.llmApiKey,
        baseUrl: modelConfig.llmBaseUrl,
        model: modelConfig.llmModel,
      }, userPrompt);
      source = 'llm';
      fortune = normalizeFortune(fortune, todayKey);
    } catch (e) {
      console.error('[fortune] LLM failed, falling back to template:', e.message);
      fortune = null;
    }
  }

  if (!fortune) {
    fortune = buildTemplateFortune(paipanData.data || {}, almanac.data || {}, todayKey, wish, zodiac);
    source = 'template';
  }

  // Cache
  cache.fortuneByDate[todayKey] = { data: fortune, source, createdAt: Date.now() };
  saveJson(fortunePath(), cache);

  return { data: fortune, source };
}

// 按日期查询运势：八字/星盘按出生信息（固定），黄历按目标日期；缓存 key 按日期。
// 日历点击任意日期调用；getDailyFortune(dateStr) 已支持任意 dateStr（almanac?date= 任意日期），
// 这里做明确语义的薄封装并导出。
async function getFortuneByDate(dateStr, forceRefresh, deps = {}) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  return getDailyFortune(date, !!forceRefresh, deps);
}

function normalizeFortune(f, dateStr) {
  const dims = {};
  for (const key of ['wealth', 'career', 'love', 'health', 'study', 'travel', 'signing']) {
    const d = (f.dimensions && f.dimensions[key]) || {};
    dims[key] = {
      score: clampScore(d.score),
      summary: d.summary || '',
      advice: d.advice || '',
    };
  }
  const overall = clampScore(f.overall ?? Math.round(Object.values(dims).reduce((a, b) => a + b.score, 0) / 7));
  return {
    date: dateStr,
    overall,
    dimensions: dims,
    luckyTime: Array.isArray(f.luckyTime) ? f.luckyTime.slice(0, 3) : [],
    directions: f.directions || {},
    luckyNumber: Array.isArray(f.luckyNumber) ? f.luckyNumber.slice(0, 3) : [],
    luckyColor: f.luckyColor || '',
    luckyItem: f.luckyItem || '',
    lotteryTip: f.lotteryTip || '',
    reminderLines: Array.isArray(f.reminderLines) ? f.reminderLines.slice(0, 3) : [],
    disclaimer: f.disclaimer || '仅供参考娱乐',
  };
}
function clampScore(n) {
  n = parseInt(n, 10);
  if (isNaN(n)) return 60;
  return Math.max(20, Math.min(100, n));
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------
function sendFortuneReminder(win, fortune) {
  const line = fortune.reminderLines && fortune.reminderLines[0]
    ? fortune.reminderLines[0]
    : `今日运势 ${fortune.overall} 分，${fortune.dimensions.wealth.summary}`;
  try {
    if (Notification.isSupported()) {
      new Notification({ title: '财神日历 · 今日运势', body: line }).show();
    }
  } catch (e) { /* ignore */ }
  if (win && !win.isDestroyed()) {
    win.webContents.send('fortune-reminder', { line, overall: fortune.overall, date: fortune.date });
  }
}

function maybeSendStartupFortune(win, getDailyFortuneFn) {
  try {
    const settings = loadJson(settingsPath(), {});
    if (settings.fortuneReminderEnabled === false) return;
    const today = new Date().toISOString().slice(0, 10);
    getDailyFortuneFn(today, false)
      .then((r) => {
        if (r && r.data) {
          setTimeout(() => sendFortuneReminder(win, r.data), 5000);
        }
      })
      .catch((e) => console.error('[fortune] startup reminder failed:', e.message));
  } catch (e) { /* ignore */ }
}

// test hook
function __setDataDir(dir) {
  _dataDir = dir;
}

module.exports = {
  getDailyFortune,
  getFortuneByDate,
  buildTemplateFortune,
  normalizeFortune,
  sendFortuneReminder,
  maybeSendStartupFortune,
  __setDataDir,
  _internals: { WUXING, relationOf, parseLLMJson },
};
