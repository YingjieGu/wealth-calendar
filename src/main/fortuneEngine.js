// Daily fortune pipeline: bazi + natal chart + almanac -> LLM (or template fallback) -> cache.
// Design: data paths injectable for testability; no side effects on require.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const userMemory = require('./userMemory');

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

  // v0.4.19 提醒语不再拼黄历宜忌原文（祭祀/塞穴/入殓等面向上班族/学生毫不相关），
  // 改为基于 7 维度（财运/事业/桃花/学业/出行/签约/健康）的差异化文案
  const wishLines = {
    wealth: [
      `小财发现，今日你财运${dims.wealth.score >= 75 ? '很不错' : '平稳'}（${dims.wealth.score}分），${dims.wealth.advice}~`,
      `偏财机会${dims.wealth.score >= 70 ? '在线' : '平平'}，${dims.wealth.advice}，重要求财之事安排在好时段~`,
    ],
    love: [
      `小财发现，今日你桃花运${dims.love.score >= 75 ? '旺盛' : '温温的'}（${dims.love.score}分），${dims.love.advice}~`,
      `${dims.love.summary}，主动一点会有意外惊喜哦~`,
    ],
    career: [
      `小财发现，今日你事业运${dims.career.score >= 75 ? '稳中有升' : '平稳'}（${dims.career.score}分），${dims.career.advice}~`,
      `${dims.career.summary}，重要工作安排在高效率时段~`,
    ],
    health: [
      `小财发现，今日你健康运势${dims.health.score}分，${dims.health.advice}，小财会提醒你按时休息的~`,
      `${dims.health.summary}，${dims.health.advice}，注意劳逸结合~`,
    ],
    study: [
      `小财发现，今日你学业运势${dims.study.score}分，${dims.study.advice}~`,
      `${dims.study.summary}，专注力不错的时段要抓住哦~`,
    ],
    peace: [
      `${dims.travel.summary}，出行留意安全，小财保佑你平平安安~`,
      `今日诸事${dims.travel.score >= 70 ? '顺遂' : '多留心'}，遇事不急，稳字当头~`,
    ],
  };
  const zText = zodiac ? `生肖${zodiac}的你，` : '';
  const lines = wish && wishLines[wish]
    ? wishLines[wish]
    : [
        `${zText}小财发现，今日整体运势 ${overall} 分，${dims.wealth.advice}，${dims.health.advice}~`,
        `${dims.career.summary}，${dims.study.summary}，小财会一直陪着你哦～`,
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

  // 推理性文案（模板降级也带推理链：日主五行强弱 + 当日干支生克关系 + 喜用神倾向）
  const relTexts = { shengWo: '当日五行生扶日主，运势有所加成', tongWo: '当日五行与日主同类，同气相扶较顺', woKe: '日主得势可克当日五行，主进取得财', keWo: '当日五行克制日主，宜守不宜攻', woSheng: '日主生泄当日五行，注意精力消耗' };
  const rel = dayMaster && dayGanWuXing ? relationOf(dayMaster, dayGanWuXing) : '';
  const relText = rel && relTexts[rel] ? relTexts[rel] : (dayGanWuXing ? `当日日干五行属${dayGanWuXing}` : '当日干支五行未明');
  const XIYONG = { 木: '水、木', 火: '木、火', 土: '火、土', 金: '土、金', 水: '金、水' };
  const briefReason = dayMaster
    ? `今日${dayGanZhi}（${dayGanWuXing}日），日主五行属${dayMaster}，${relText}；喜用神倾向${XIYONG[dayMaster] || dayMaster}，行事可多借相关五行之势。`
    : `今日${dayGanZhi}（${dayGanWuXing}日），${relText}，可依${dayGanWuXing}五行之势安排行事。`;

  return {
    date: dateStr,
    overall,
    dimensions: dims,
    briefReason,
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
                '你是资深命理师"财神小助手"，精通八字、星盘、黄历。根据用户命理数据输出当日运势，语气生动有趣（可爱萌宠口吻，称呼自己"小财"）。必须先做简短推理再给分数：把推理要点（日主五行强弱、当日干支与日主生克关系、喜用神倾向）用 1-2 句通俗话写入 briefReason 字段。必须只输出合法 JSON，不要 markdown 代码块，不要任何额外文字。全部文本字段（含 dimensions 各维度的 summary/advice）都只写 7 维度（财运/事业/桃花/学业/出行/签约/健康）相关的"好的或避忌"内容，一律禁止出现黄历宜忌词汇（祭祀/塞穴/入殓/安葬/移柩/破土/祈福/开光/斋醮/立券/栽种/牧养/纳畜/安床/作灶/伐木/开渠/穿井/扫舍等）。JSON 结构: {"overall":0-100,"briefReason":"1-2句简短推理：日主五行强弱/当日干支与日主生克/喜用神倾向","dimensions":{"wealth":{"score":0-100,"summary":"一句话","advice":"一句建议"},"career":{...},"love":{...},"health":{...},"study":{...},"travel":{...},"signing":{...}},"luckyTime":["HH:mm-HH:mm","HH:mm-HH:mm"],"directions":{"wealth":"方位","love":"方位"},"luckyNumber":[3个1-9的幸运数字],"luckyColor":"幸运色，如金色","luckyItem":"开运物/幸运饰品，如貔貅挂件","lotteryTip":"一句彩票/意外之财建议，娱乐向，鼓励量力而行","reminderLines":["2到3条生动提醒语，萌宠口吻，只围绕7维度（财运/事业/桃花/学业/出行/签约/健康）写"好的或避忌"内容，禁止出现黄历宜忌词汇（祭祀/塞穴/入殓/安葬/移柩/破土/祈福/开光/斋醮/立券/栽种/牧养/纳畜/安床/作灶/伐木/开渠/穿井/扫舍等），如小财发现你今天财运爆棚，可以去刮一张彩票~"],"disclaimer":"仅供参考娱乐"}。运势分数要合理分布，不要全是高分。',
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

  // v0.4.21 缓存自愈：命中但过期（无 schemaVersion/版本过低/含黄历宜忌词）→ 跳过重建
  if (!forceRefresh && cache.fortuneByDate[todayKey] && !isStaleFortuneEntry(cache.fortuneByDate[todayKey])) {
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
  // v0.4.20 用户记忆体：mainWish 为空时用记忆推断主求方向（聊天话题频率兜底）
  const mainWish = (settings.mainWish && settings.mainWish !== 'recommend') ? settings.mainWish : '';
  let wish = mainWish || '';
  try { if (!wish) wish = userMemory.inferredWish('') || ''; } catch (e) { /* ignore */ }
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

  // Cache（v0.4.21 写入 schemaVersion，供下次读取自愈判定）
  cache.fortuneByDate[todayKey] = { data: fortune, source, createdAt: Date.now(), schemaVersion: FORTUNE_CACHE_SCHEMA_VERSION };
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

// v0.4.19 黄历宜忌 STOPWORDS：提醒/播报文案过滤（面向上班族/学生，祭祀/塞穴/入殓等毫不相关）。
// 日历页完整黄历展示保留，此清洗只作用于提醒/播报输出文本；命中 STOPWORDS 的整句直接去掉。
const FORTUNE_STOPWORDS = [
  '祭祀', '塞穴', '入殓', '安葬', '移柩', '破土', '祈福', '开光', '斋醮',
  '立券', '栽种', '牧养', '纳畜', '安床', '作灶', '伐木', '开渠', '穿井',
  '扫舍', '上梁', '安门', '畋猎', '取渔', '断蚁', '结网',
];
function sanitizeFortuneText(text) {
  if (!text) return '';
  // 按标点切句（保留分隔符），命中 STOPWORDS 的整句去掉，避免残留"宜，忌"空洞
  const segs = String(text).split(/(?<=[，。；！？])/);
  const kept = segs.filter((s) => !FORTUNE_STOPWORDS.some((w) => s.includes(w)));
  return kept.join('').trim();
}

// v0.4.21 缓存 schema 版本：文案规则变化时 bump，旧缓存自动失效重建，无需删文件
const FORTUNE_CACHE_SCHEMA_VERSION = 2;

// 缓存自愈判定：条目无 schemaVersion / 版本过低，或任意被播报/提醒的文本字段
// （reminderLines/lotteryTip/briefReason + 各维度 summary/advice）含黄历宜忌词 → 视为过期。
// 命中则 getDailyFortune 跳过缓存重新生成（v0.4.19 修复前生成的旧缓存自动失效）。
function isStaleFortuneEntry(entry) {
  if (!entry || !entry.data) return true;
  if (entry.schemaVersion !== FORTUNE_CACHE_SCHEMA_VERSION) return true;
  const d = entry.data || {};
  const parts = [
    ...(Array.isArray(d.reminderLines) ? d.reminderLines : []),
    d.lotteryTip,
    d.briefReason,
  ];
  for (const dim of Object.values(d.dimensions || {})) {
    if (dim && typeof dim === 'object') {
      parts.push(dim.summary, dim.advice);
    }
  }
  const joined = parts.filter(Boolean).join(' ');
  return FORTUNE_STOPWORDS.some((w) => joined.includes(w));
}

function normalizeFortune(f, dateStr) {
  const dims = {};
  for (const key of ['wealth', 'career', 'love', 'health', 'study', 'travel', 'signing']) {
    const d = (f.dimensions && f.dimensions[key]) || {};
    // v0.4.21 全覆盖：summary/advice 也过黄历宜忌清洗；清洗后为空给通用兜底，避免空字段
    const summary = sanitizeFortuneText(d.summary || '') || '运势平稳';
    const advice = sanitizeFortuneText(d.advice || '') || '稳扎稳打';
    dims[key] = {
      score: clampScore(d.score),
      summary,
      advice,
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
    // v0.4.19 提醒/播报文本统一过黄历宜忌清洗（LLM 与模板输出都走 normalizeFortune）
    lotteryTip: sanitizeFortuneText(f.lotteryTip || ''),
    reminderLines: (Array.isArray(f.reminderLines) ? f.reminderLines.slice(0, 3) : [])
      .map(sanitizeFortuneText)
      .filter((l) => l),
    briefReason: sanitizeFortuneText(f.briefReason || ''),
    disclaimer: f.disclaimer || '仅供参考娱乐',
  };
}
function clampScore(n) {
  n = parseInt(n, 10);
  if (isNaN(n)) return 60;
  return Math.max(20, Math.min(100, n));
}

// ---------------------------------------------------------------------------
// v0.4.22 启动运势播报统一由渲染层 sayDailyFortune（启动后 30s 一条通道）负责，
// 不再主进程推送 fortune-reminder / 系统通知（避免启动时 2-3 条重复播报）。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 星盘分析（🔮 星盘分析按钮）：LLM 生成 4 段解读，无 key/失败 → 模板降级
// ---------------------------------------------------------------------------
// 12 星座顺序（与 sidecar lon_to_zodiac 的 ZODIAC_SIGNS 一致：白羊起 30° 一宫）
const ZODIAC_SIGNS = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
  '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];
// 12 星座 × 太阳性格 / 月亮情感 / 上升外在 各一句（顺序与 ZODIAC_SIGNS 一致：白羊起）
const ZODIAC_SUN_PERSONALITY = [
  '你骨子里有股冲劲，认定的事说干就干，天生敢闯敢试的开创者。',
  '你踏实又倔强，认准的理八头牛拉不回，稳定是你的底气。',
  '你脑子转得快、口才了得，好奇心和新鲜感是你的能量源。',
  '你外冷内热、念旧护短，家与安全感是你最柔软的核心。',
  '你自信有光芒，爱面子也讲义气，天然吸引别人追随。',
  '你细致认真、追求完美，靠谱到把每件小事都做到极致。',
  '你追求平衡与和谐，擅长沟通周旋，是人际场上的润滑剂。',
  '你洞察力强、敢爱敢恨，认准的东西会执着地挖到底。',
  '你乐观爱自由，说走就走，骨子里向往远方与冒险。',
  '你务实自律、目标感强，能把苦活累活默默扛成成绩。',
  '你思维跳脱、脑洞清奇，反传统是你的可爱与力量。',
  '你敏感温柔、共情力满格，天生的浪漫治愈系。',
];
const ZODIAC_MOON_EMOTION = [
  '情绪来得快也去得快，最需要的是被直接地回应和肯定。',
  '情感慢热但极长情，被安稳陪伴时最有安全感。',
  '心情像天气一样多变，聊聊天、换换环境就能被治愈。',
  '心思细腻又容易内耗，家人的一句软话就能暖到心里。',
  '表面大大咧咧，内心其实渴望被仰望和夸赞。',
  '习惯用行动表达爱，默默做好小事就是你最大的在乎。',
  '最怕冲突，情绪一上来就想要一个温和的台阶。',
  '情感浓烈而深沉，好的坏的都会记得很久。',
  '自由比黏腻更重要，恋爱里也渴望各自有空间。',
  '情绪管理一流，但独处时也会有想被懂得的瞬间。',
  '情感上需要新鲜感与精神共鸣，讨厌一成不变。',
  '共情力太强，容易被别人的情绪牵着走，要记得照顾自己。',
];
const ZODIAC_RISING_IMAGE = [
  '给人的第一印象是爽朗利落、精神头十足。',
  '显得沉稳可靠、慢条斯理，自带一种踏实气场。',
  '看起来机灵健谈，走到哪都像个话题中心。',
  '外表温和带着距离感，熟了之后才发现其实很暖。',
  '举手投足自带气场，走到哪都容易被注意到。',
  '给人的感觉是干净利落、做事有条理的样子。',
  '气质温和有礼貌，第一面就让人愿意亲近。',
  '眼神有穿透力，外表有种神秘又不好惹的气场。',
  '看起来阳光爱笑、自由洒脱，很好相处。',
  '穿着谈吐都偏成熟稳重，给人靠谱的老干部感。',
  '外形和谈吐都很有个性，一眼就觉得与众不同。',
  '气质柔和不具攻击性，让人觉得很容易接近。',
];
// 相位通用解读：合相/三合/六合 → 顺畅；刑 → 挑战；冲 → 平衡；其余 → 一般
function _aspectReadable(label, type) {
  const t = String(type || '').toLowerCase();
  if (t === 'conjunction' || t === 'trine') return '顺畅';
  if (t === 'square') return '有挑战';
  if (t === 'opposition') return '需要平衡';
  if (t === 'sextile') return '有助力';
  return '值得留意';
}
function zodiacIndexFromSign(sign) {
  const s = String(sign || '').trim();
  if (!s) return -1;
  const zhIdx = ZODIAC_SUN_PERSONALITY.findIndex((_, i) => ZODIAC_SIGNS[i] === s);
  if (zhIdx >= 0) return zhIdx;
  // 兼容 "Aries"/"Taurus" 英文（首字母大写）
  const en = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  const lo = s.toLowerCase();
  const enIdx = en.indexOf(lo);
  if (enIdx >= 0) return enIdx;
  return -1;
}
function _signOf(p) {
  return (p && (p.sign || p.signEn)) || '';
}

// LLM prompt：compact JSON（行星落座/上升/天顶/相位），要求 4 段中文解读
function buildNatalAnalysisPrompt(chartData) {
  const d = (chartData && chartData.data && !chartData.error) ? chartData.data : (chartData || {});
  const planets = d.planets || {};
  const compact = {
    planets: Object.fromEntries(
      Object.entries(planets).map(([k, v]) => [k, {
        sign: (v && v.sign) || '',
        degree: (v && v.degree) != null ? v.degree : null,
        label: (v && (v.label || v.planetLabel)) || k,
        longitude: (v && typeof v.longitude === 'number') ? v.longitude : null,
      }])
    ),
    ascendant: (d.ascendant && (d.ascendant.sign || d.ascendant.label)) ? { sign: d.ascendant.sign, label: d.ascendant.label } : null,
    midheaven: (d.midheaven && (d.midheaven.sign || d.midheaven.label)) ? { sign: d.midheaven.sign, label: d.midheaven.label } : null,
    aspects: (Array.isArray(d.aspects) ? d.aspects.slice(0, 8) : []).map((a) => ({
      label: (a && a.label) || '', p1: (a && a.planet1Label) || '', p2: (a && a.planet2Label) || '', angle: (a && a.angle) != null ? a.angle : null,
    })),
  };
  return `以下是本命星盘数据（JSON）：\n${JSON.stringify(compact, null, 2)}\n\n请按系统要求输出解读。`;
}

// 模板降级：太阳性格 + 月亮情感 + 上升外在 各一句 + 相位通用解读 + 免责
// 返回段落数组（每段一段）；chartData 为空时仍给出通用解读
function templateNatalAnalysis(chartData) {
  const d = (chartData && chartData.data && !chartData.error) ? chartData.data : (chartData || {});
  const planets = d.planets || {};
  const sun = planets.Sun || planets.sun;
  const moon = planets.Moon || planets.moon;
  const asc = d.ascendant || null;
  const sunIdx = zodiacIndexFromSign(_signOf(sun));
  const moonIdx = zodiacIndexFromSign(_signOf(moon));
  const ascIdx = zodiacIndexFromSign(asc && asc.sign);
  const segments = [];
  segments.push(`【核心性格】${sunIdx >= 0 ? ZODIAC_SUN_PERSONALITY[sunIdx] : '性格内外兼具，稳重中带点灵动，遇到大事能沉住气。'}`);
  segments.push(`【月亮情感】${moonIdx >= 0 ? ZODIAC_MOON_EMOTION[moonIdx] : '情绪细腻有韧性，在意的人被你放在心上就格外长久。'}`);
  segments.push(`【上升外在】${ascIdx >= 0 ? ZODIAC_RISING_IMAGE[ascIdx] : '外表随和好相处，越了解越觉得你丰富有内涵。'}`);
  // 相位通用解读（取前 3 个相位）
  const aspects = Array.isArray(d.aspects) ? d.aspects.filter((a) => a && (a.label || a.planet1Label)) : [];
  if (aspects.length) {
    const reads = aspects.slice(0, 3).map((a) => {
      const p1 = a.planet1Label || '一星';
      const p2 = a.planet2Label || '一星';
      const kind = (a.label || a.type || '相位');
      return `${p1}与${p2}${kind}，${_aspectReadable(kind, a.type)}`;
    });
    segments.push(`【相位提示】${reads.join('；')}。`);
  } else {
    segments.push('【相位提示】本命相位较为平稳，顺其自然便是最好的节奏。');
  }
  segments.push('以上内容仅供娱乐参考，人生的方向盘始终握在你自己手里~');
  return segments;
}

// 星盘分析主入口：有 LLM key 走 LLM（OpenAI 兼容），失败/无 key → 模板降级。
// deps.getSettings 可注入（测试用）；返回 { text, source }，text 为段落按空行拼接。
async function analyzeNatalChart(chartData, deps = {}) {
  let settings = {};
  try { settings = deps.getSettings ? deps.getSettings() : loadJson(settingsPath(), {}); } catch (e) { /* ignore */ }
  const modelConfig = settings.modelConfig || {};
  if (modelConfig.llmApiKey) {
    try {
      const text = await callLLMText(
        { apiKey: modelConfig.llmApiKey, baseUrl: modelConfig.llmBaseUrl, model: modelConfig.llmModel },
        '你是资深占星师"财神小助手"，擅长本命盘解读。根据用户星盘数据输出 4 段中文解读，萌宠口吻（自称"小财"），每段 1-2 句，简短口语化：① 核心性格（太阳星座为主，含月亮/上升补充）② 感情/事业倾向（金星/火星/水星落座）③ 相位提示（如日月三合→内外一致）④ 一句整体建议。只输出解读正文，不要 JSON、不要编号标题、不要任何额外说明。',
        buildNatalAnalysisPrompt(chartData)
      );
      const lines = String(text || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
      return { text: lines.length ? lines.join('\n') : templateNatalAnalysis(chartData).join('\n'), source: 'llm' };
    } catch (e) {
      console.error('[star] LLM analyze failed, fallback to template:', e.message);
      appendLLMDebug(`LLM 失败(模板降级): ${e.message}`);
    }
  }
  return { text: templateNatalAnalysis(chartData).join('\n'), source: 'template' };
}

// OpenAI 兼容文本补全（星盘分析/时辰批量用）：与 callLLM 同模式，直接返回 content 纯文本。
// opts.maxTokens 可调：星盘分析 1000 够用；v0.4.29 时辰批量 12 条需更多（reasoning 也占预算）。
async function callLLMText({ apiKey, baseUrl, model }, systemPrompt, userPrompt, opts = {}) {
  const url = `${(baseUrl || 'https://api.deepseek.com').replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'deepseek-v4-flash',
          temperature: 0.8,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: opts.maxTokens || 1000,
        }),
      });
    } catch (fetchErr) {
      appendLLMDebug(`LLM fetch 失败: ${fetchErr && fetchErr.message}`);
      throw new Error(`LLM fetch failed: ${fetchErr && fetchErr.message}`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      appendLLMDebug(`LLM HTTP ${res.status} ${errText.slice(0, 200)}`);
      throw new Error(`LLM HTTP ${res.status}`);
    }
    const json = await res.json();
    const content = json.choices && json.choices[0] && json.choices[0].message
      ? json.choices[0].message.content
      : '';
    if (!content) throw new Error('LLM empty response');
    return String(content);
  } catch (e) {
    appendLLMDebug(`LLM 调用失败: ${e.message}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  sanitizeFortuneText,
  FORTUNE_STOPWORDS,
  isStaleFortuneEntry,
  FORTUNE_CACHE_SCHEMA_VERSION,
  // v0.4.22 星盘分析
  analyzeNatalChart,
  templateNatalAnalysis,
  buildNatalAnalysisPrompt,
  // v0.4.29 时辰播报：批量生成 12 时辰文案复用
  callLLMText,
  ZODIAC_SUN_PERSONALITY,
  ZODIAC_MOON_EMOTION,
  ZODIAC_RISING_IMAGE,
  zodiacIndexFromSign,
  __setDataDir,
  _internals: { WUXING, relationOf, parseLLMJson },
};
