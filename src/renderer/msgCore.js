// MsgCore: 六类主题化气泡消息文案池 + 优先级队列 + 亲密度每日清零（纯函数，Node/浏览器双模式）
// 浏览器：<script src="msgCore.js"> 挂 window.MsgCore；Node：require('./msgCore.js')
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.MsgCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ==================== 优先级（数值越大越优先）====================
  // 用户交互即时反馈 say() 最高；日程 > 运势/即时通讯 > 工作 > 日常 > 主题互动
  const PRIORITY = { schedule: 5, fortune: 4, im: 4, work: 3, daily: 2, theme: 1, user: 10 };

  // 优先队列插入：按优先级降序，同级保持 FIFO（后进同级排到后面）
  function priorityInsert(queue, item) {
    let i = 0;
    while (i < queue.length && queue[i].priority >= item.priority) i++;
    queue.splice(i, 0, item);
    return queue;
  }
  // 高优先级插队：新消息优先级高于当前展示气泡 → 打断
  function shouldPreempt(current, incoming) {
    return !!current && !!incoming && incoming.priority > current.priority;
  }

  // ==================== 亲密度每日清零 ====================
  // 同一天保留原值；跨天归零重新计算（等级称号函数保留，元宝每日满100+1保留）
  function affinityForDay(savedAffinity, savedDate, todayStr) {
    if (String(savedDate || '') === String(todayStr)) {
      return Math.min(100, Math.max(0, Number(savedAffinity) || 0));
    }
    return 0;
  }

  // ==================== ① 主题互动消息池（随主题文案不同）====================
  // cat1/cat2 萌宠；caishen 财神；gold 财神金主。三类：interact 交互 / comfort 安抚 / roast 吐槽
  const THEME_INTERACT = {
    cat1: {
      interact: ['蹭蹭~ 主人摸我啦，好开心！', '喵呜~ 再来一下嘛！', '咕噜咕噜~ 被摸好舒服~', '主人最好了，小财蹭蹭~', '喵～小财在呢，主人想要啥？'],
      comfort: ['别难过啦，小财陪着你呢~', '摸摸头，一切都会好起来的~', '主人不开心吗？小财给你个抱抱~'],
      roast: ['喵？主人又偷懒啦！', '再不动一动，小鱼干要被吃光啦~', '主人，你的爪子离小财远点~'],
    },
    cat2: {
      interact: ['咪咪~ 主人摸我啦，好开心！', '喵喵，再来一下嘛！', '呼噜呼噜~ 好舒服~', '主人最疼小财了~', '喵~ 小财想主人啦！'],
      comfort: ['主人别伤心，小财喵喵哄你~', '别怕，小财在呢，摸摸头~', '难过的话就靠在小财身上吧~'],
      roast: ['喵呜！主人是不是又乱丢小鱼干啦！', '主人懒洋洋的，小财都看不下去了~', '喵~ 主人别逗小财啦！'],
    },
    caishen: {
      interact: ['招财进宝！主人摸我一下，财运旺旺~', '财神爷吉祥！主人今年发大财~', '摸摸金元宝，财气冲天~', '财源广进，主人福气满满~'],
      comfort: ['财运有起有落，别急，福气在后头~', '破财消灾，主人放宽心，财神爷罩着你~', '主人别慌，风水轮流转，好运就来~'],
      roast: ['主人又在乱花钱！财神爷记账了~', '这单亏了吧？财神爷都看不下去了~', '主人，钱要省着花，金元宝会生气的~'],
    },
    gold: {
      interact: ['金主大人驾到！财运加身~', '金库满满，主人福气满满~', '主人摸我，沾沾金气，财源滚滚~', '金主出手，必然大赚~'],
      comfort: ['金主别慌，这点小风浪算什么~', '您财大气粗，福气自然来，放宽心~', '金主大人，财运是您的，跑不掉~'],
      roast: ['金主大人，这个月账单有点多哦~', '小金库要见底啦，主人悠着点~', '金主，这波行情您又踏空了吧？~'],
    },
    default: {
      interact: ['蹭蹭~ 主人摸我啦，好开心！', '主人戳我，小财来啦~', '嘿嘿，主人真会疼人~', '喵～陪主人玩会儿~'],
      comfort: ['别难过啦，小财陪着你~', '摸摸头，好运会来的~'],
      roast: ['主人又调皮啦！', '喵，别闹啦~'],
    },
    // v0.4.18 生肖收集主题共用互动文案（12 生肖共用一组，文案里带各生肖 emoji 风格）
    zodiac: {
      interact: ['吱吱~ 主人摸我啦，好开心！', '嘿嘿，主人来陪我玩啦~', '主人戳我，蹭蹭你手心~', '昂昂，陪主人打会儿盹~'],
      comfort: ['别难过啦，主人，我陪着你呢~', '摸摸头，好运马上就来找你~', '主人累了吧？靠着我休息会儿~'],
      roast: ['主人又在偷懒啦，我都看不下去了~', '哼，主人是不是忘了给我加鸡腿~', '主人，你这运气还得再攒攒哦~'],
    },
  };
  function themePool(theme) {
    if (THEME_INTERACT[theme]) return THEME_INTERACT[theme];
    if (zodiacIndexOf(theme) >= 0) return THEME_INTERACT.zodiac; // 12 生肖共用通用互动组
    return THEME_INTERACT.default;
  }
  function pickThemeLine(theme, category) {
    const pool = themePool(theme);
    const arr = pool[category] || THEME_INTERACT.default.interact;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ==================== 主题目录（THEME_CATALOG：集中元数据，可扩展） ====================
  // 每项 { id, name, kind: 'material'|'svg'|'custom', unlock: 'free'|'coins'|'zodiac', cost?, zodiacIndex?, assetsReady? }
  // free：默认可用；coins：元宝兑换（gold 10 元宝，保留现有逻辑）；zodiac：元宝随机解锁收集
  // 12 生肖全量预注册，后 8 个（龙蛇马羊猴鸡狗猪）素材未到 → assetsReady:false，不参与随机池，
  // 素材到位只需补目录 + 改 assetsReady，其余代码零改动；未来其他主题加一个条目即可。
  const ZODIAC_EMOJI = ['🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'];
  const ZODIAC_COST = 3; // 随机解锁一个生肖的花费（元宝）
  const THEME_CATALOG = [
    { id: 'cat1', name: 'Q版猫咪', kind: 'material', unlock: 'free' },
    { id: 'cat2', name: '萌宠2', kind: 'material', unlock: 'free' },
    { id: 'caishen', name: '财神', kind: 'material', unlock: 'free' },
    { id: 'custom', name: '自定义', kind: 'custom', unlock: 'free' },
    { id: 'gold', name: '财神金主', kind: 'svg', unlock: 'coins', cost: 10 },
    // ---- 12 生肖收集主题（全量预注册）----
    { id: 'rat', name: '生肖鼠', kind: 'material', unlock: 'zodiac', zodiacIndex: 0, assetsReady: true },
    { id: 'ox', name: '生肖牛', kind: 'material', unlock: 'zodiac', zodiacIndex: 1, assetsReady: true },
    { id: 'tiger', name: '生肖虎', kind: 'material', unlock: 'zodiac', zodiacIndex: 2, assetsReady: true },
    { id: 'rabbit', name: '生肖兔', kind: 'material', unlock: 'zodiac', zodiacIndex: 3, assetsReady: true },
    { id: 'dragon', name: '生肖龙', kind: 'material', unlock: 'zodiac', zodiacIndex: 4, assetsReady: false },
    { id: 'snake', name: '生肖蛇', kind: 'material', unlock: 'zodiac', zodiacIndex: 5, assetsReady: false },
    { id: 'horse', name: '生肖马', kind: 'material', unlock: 'zodiac', zodiacIndex: 6, assetsReady: false },
    { id: 'goat', name: '生肖羊', kind: 'material', unlock: 'zodiac', zodiacIndex: 7, assetsReady: false },
    { id: 'monkey', name: '生肖猴', kind: 'material', unlock: 'zodiac', zodiacIndex: 8, assetsReady: false },
    { id: 'rooster', name: '生肖鸡', kind: 'material', unlock: 'zodiac', zodiacIndex: 9, assetsReady: false },
    { id: 'dog', name: '生肖狗', kind: 'material', unlock: 'zodiac', zodiacIndex: 10, assetsReady: false },
    { id: 'pig', name: '生肖猪', kind: 'material', unlock: 'zodiac', zodiacIndex: 11, assetsReady: false },
  ];
  // 查目录条目 / 类型（未知主题返回 null / undefined，内置 svg 主题 cat/fortune/bagua 不在目录）
  function catalogEntry(id) {
    return THEME_CATALOG.find((t) => t.id === id) || null;
  }
  function catalogKind(id) {
    const e = catalogEntry(id);
    return e ? e.kind : null;
  }
  // 生肖 id → 在 12 生肖中的下标（非生肖返回 -1）
  function zodiacIndexOf(id) {
    const e = catalogEntry(id);
    return (e && e.unlock === 'zodiac' && typeof e.zodiacIndex === 'number') ? e.zodiacIndex : -1;
  }
  function isZodiac(id) {
    return zodiacIndexOf(id) >= 0;
  }
  // 12 生肖条目（固定鼠牛虎兔龙蛇马羊猴鸡狗猪顺序）
  function zodiacEntries() {
    return THEME_CATALOG.filter((t) => t.unlock === 'zodiac').sort((a, b) => a.zodiacIndex - b.zodiacIndex);
  }
  function zodiacEmoji(zodiacIndex) {
    return ZODIAC_EMOJI[zodiacIndex] || '❓';
  }
  // 随机解锁池：已解锁排除 + 素材未到排除（后 8 个不参与随机抽）
  function zodiacPool(unlockedIds) {
    const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
    return zodiacEntries().filter((t) => t.assetsReady === true && !unlocked.has(t.id));
  }
  function randomZodiacFromPool(pool) {
    if (!pool || !pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function zodiacProgress(unlockedIds) {
    const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
    const collected = zodiacEntries().filter((t) => unlocked.has(t.id)).length;
    return { collected, total: zodiacEntries().length };
  }
  function isCollectionComplete(unlockedIds) {
    return zodiacProgress(unlockedIds).collected >= zodiacEntries().length;
  }
  // 随机解锁校验（纯函数）：元宝足够 + 池非空 → 可解锁
  function canUnlockZodiac(coins, pool) {
    return (Number(coins) || 0) >= ZODIAC_COST && Array.isArray(pool) && pool.length > 0;
  }
  // 宫格单格渲染状态（v0.4.18）：已解锁亮色可点 / 未解锁 assetsReady 灰锁 / 素材未到「敬请期待」
  function zodiacCellState(t, unlockedIds) {
    const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
    const isUnlocked = unlocked.has(t.id);
    const cls = isUnlocked ? 'unlocked' : (t.assetsReady ? 'locked' : 'coming');
    const emoji = isUnlocked ? ZODIAC_EMOJI[t.zodiacIndex] : '🔒';
    const label = t.assetsReady ? (t.name || '').replace('生肖', '') : '敬请期待';
    return { cls, emoji, label, isUnlocked };
  }

  // ==================== ② 日常互动类（通用）====================
  const DAILY_LINES = [
    '今天天气不错，吃完饭可以去溜达溜达~',
    '工作辛苦啦，给你捶捶肩膀',
    '你效率太慢了，实在不行给我发工资，我来帮你做',
    '又在看视频，眼睛休息一下嘛~',
    '记得喝水哦，小财盯着呢~',
    '坐久了，起来活动活动~',
    '要听听今天的小财悄悄话吗？',
  ];

  // ==================== ③ 运势提醒类（通用，按天生成一批，次日替换）====================
  const FORTUNE_TEMPLATES = [
    '今天偏财运不错，中午散步路过彩票店，买一个',
    '宜稳中求进，别被小聪明带偏~',
    '多留意身边贵人，说不定就是财神爷派来的~',
    '今天适合把重要的事往前排，运气旺~',
  ];
  function buildFortuneMsgPool(fortune, dateStr) {
    const f = fortune || {};
    const dims = f.dimensions || {};
    const w = dims.wealth || {};
    const dir = (f.directions && f.directions.wealth) || '';
    const lines = [];
    // 总运势（含推理依据 + 财神方位）
    let seg0 = `📅 今日运势 ${f.overall} 分`;
    if (f.briefReason) seg0 += `。${f.briefReason}`;
    if (dir) seg0 += `。财神方位${dir}`;
    lines.push(seg0);
    // 财运细节
    lines.push(`💰 财运：${w.summary || '财运平稳'}。${w.advice || '忌冲动消费'}`);
    // 避忌提醒
    let seg2 = `⚠️ 小财提醒：${(f.reminderLines && f.reminderLines[0]) || '今日宜稳扎稳打'}`;
    if (f.lotteryTip) seg2 += `。${f.lotteryTip}`;
    lines.push(seg2);
    // 幸运元素
    let seg3 = `🍀 今日幸运数字 ${(f.luckyNumber || []).join(' ') || '—'}`;
    if (f.luckyColor || f.luckyItem) seg3 += `，幸运色：${f.luckyColor || '—'}，开运物：${f.luckyItem || '—'}（仅供参考）`;
    if (f.luckyTime && f.luckyTime.length) seg3 += `。吉时：${f.luckyTime.join('、')}`;
    lines.push(seg3);
    // 通用模板：按日期+分数稳定挑选，保证同一天批次稳定、次日随运势刷新
    const seed = String(dateStr || '').length + (Number(f.overall) || 0);
    const t1 = FORTUNE_TEMPLATES[seed % FORTUNE_TEMPLATES.length];
    const t2 = FORTUNE_TEMPLATES[(seed + 1) % FORTUNE_TEMPLATES.length];
    lines.push(`💡 ${t1}`);
    if (dir) lines.push(`🧭 财神在${dir}方位，中午不妨往那边走走，沾沾财气~`);
    // 周五彩蛋（时间感知）
    try {
      const d = new Date(dateStr + 'T12:00:00');
      if (d.getDay() === 5) lines.push('今天周五啦，终于结束一周牛马生活，晚上可以去走走哦，说不定有桃花哦~');
    } catch (e) { /* ignore */ }
    lines.push(`✨ 小财看好你，今天也要元气满满！`);
    lines.push(`📝 ${t2}，放心交给小财把关~`);
    return lines;
  }

  // ==================== ④ 工作协助类（通用 + 周一/周五/月末时间感知）====================
  function workLinesForDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay(); // 0=周日
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const lines = [];
    if (day === 1) lines.push('今天周一，可以规划下这周目标~');
    if (day === 5) lines.push('今天是周五了，记得提交周报哦~');
    if (d.getDate() === lastDay) lines.push('今天是月末，把工作整理整理~');
    lines.push('你当前处理的工作有点难度，需不需要我帮忙呀~');
    lines.push('需要我帮你整理个待办清单吗？');
    lines.push('要不要一起看看今天的工作安排？');
    return lines;
  }

  // ==================== ⑤ 日程/节日提醒（情人节 + 法定节假日）====================
  const HOLIDAY_LINES = {
    '01-01': '🎉 元旦快乐! 新一年财源广进~',
    '02-14': '💘 今天是情人节，记得给喜欢的人一个惊喜哦~',
    '05-01': '🎉 劳动节快乐! 主人好好休息一下~',
    '10-01': '🎉 国庆节快乐! 主人趁着假期放松放松~',
  };
  function holidayLine(mmdd, lunarData) {
    if (HOLIDAY_LINES[mmdd]) return HOLIDAY_LINES[mmdd];
    const fests = (lunarData && lunarData.festivals) || [];
    for (const name of fests) {
      const s = String(name || '');
      if (/春节/.test(s)) return '🎉 春节快乐! 恭喜发财，财神驾到~';
      if (/中秋/.test(s)) return '🎉 中秋快乐! 人月两团圆，财气满堂~';
      if (/端午/.test(s)) return '🎉 端午安康! 小财祝主人平安顺遂~';
      if (/清明/.test(s)) return '🕯️ 清明时节，宜怀故人，也宜静心~';
    }
    return '';
  }

  // ==================== ⑥ 即时通讯类（邮件未读；有配置才启用，预留未来渠道）====================
  function mailLine(count) {
    return `📮 主人有 ${count} 封未读邮件，记得查收哦~`;
  }

  // ==================== 系统提示音：内置短"叮" WAV（base64，零外部依赖）====================
  // 0.22s 双音 (880Hz+1760Hz) 指数衰减，44100Hz 16bit 单声道，RIFF/WAVE
  const SYSTEM_CHIME_B64 = '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'
    + 'AKYAZAA1ABcABgAAAAAAAAD5/+n/y/8=';

  return {
    PRIORITY,
    priorityInsert,
    shouldPreempt,
    affinityForDay,
    THEME_INTERACT,
    themePool,
    pickThemeLine,
    DAILY_LINES,
    FORTUNE_TEMPLATES,
    buildFortuneMsgPool,
    workLinesForDate,
    HOLIDAY_LINES,
    holidayLine,
    mailLine,
    SYSTEM_CHIME_B64,
    // v0.4.18 主题目录 + 生肖收集
    THEME_CATALOG,
    ZODIAC_EMOJI,
    ZODIAC_COST,
    catalogEntry,
    catalogKind,
    zodiacIndexOf,
    isZodiac,
    zodiacEntries,
    zodiacEmoji,
    zodiacPool,
    randomZodiacFromPool,
    zodiacProgress,
    isCollectionComplete,
    canUnlockZodiac,
    zodiacCellState,
  };
});
