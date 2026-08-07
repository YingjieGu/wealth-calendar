// 捣蛋模式引擎（娱乐互动，主进程）
// - getActiveWindowTitle()：平台适配获取活跃窗口标题（获取失败/工具缺失返回 null）
// - v0.4.19 单通道定时触发：每 5-10 分钟到点随机触发「吐槽（标题甜话）或捣蛋操作
//   （打字/窗口抖动）」二选一；触发概率 100%（定时到点即触发）；无每日上限
// - 抢键盘打字：Windows SendKeys / Linux xdotool type；平台工具不可用时跳过该玩法
// - 窗口抖动：小幅位移 2-3 次后回原位（互动小动作）
// - 窗口标题吐槽：按活跃窗口标题关键词匹配甜系吐槽池，通用兜底「主人辛苦啦~」
// - 分寸控制：吐槽池全部卖萌甜系，禁止攻击性
// - 触发的吐槽通过 webContents.send('pet-prank') 广播，渲染进程走 PetState._broadcast
//   进气泡 + 聊天对话框（吐槽时气泡带表情动效）
const { execFileSync } = require('child_process');
const { getActiveWindowTitle } = require('./windowInfo');

let prankTimer = null;
let mainWindow = null;
let getSettings = () => ({});
// typeText 可注入（测试用假实现；生产默认走真实平台实现）
let typeTextImpl = null;

// v0.4.19 单通道：每 5-10 分钟到点随机触发（吐槽或捣蛋二选一）；触发概率 100%；无每日上限
const PRANK_INTERVAL_MIN = 5;
const PRANK_INTERVAL_MAX = 10;
const TRIGGER_CHANCE = 1;

// --- 甜系吐槽池（按窗口标题关键词匹配，全卖萌甜系） ---
const PRANK_POOL = [
  {
    keywords: ['代码', 'code', 'vscode', 'idea', 'clion', 'pycharm', 'terminal', 'git', 'npm', '编译', '开发', '编程'],
    lines: [
      '又在写代码? 喵喵觉得你敲键盘的样子很帅✨',
      '盯代码好认真呀，小财偷偷给你加个油~ 🐾',
      'debug 半天了吧? 歇会儿，小财给你踩踩背~',
      '这个 bug 肯定快被主人打败啦，喵喵先点个赞!',
    ],
  },
  {
    keywords: ['word', 'doc', '文档', 'office', 'ppt', 'excel', '报表'],
    lines: [
      '在写文档呀? 主人认真的样子最迷人啦~',
      '报表改来改去辛苦了，小财给你按按头~ 🐾',
    ],
  },
  {
    keywords: ['chrome', 'edge', 'firefox', '浏览器', '搜索'],
    lines: [
      '上网冲浪呢? 带小财一起看看嘛~',
      '又在搜什么好东西，小财也好奇~',
    ],
  },
  {
    keywords: ['视频', '播放', 'movie', 'potplayer', 'bilibili', '爱奇艺', '优酷', '腾讯视频'],
    lines: [
      '看视频呢~ 主人记得要喝水呀!',
      '有什么好剧，小财也想看! 🎬',
    ],
  },
  {
    keywords: ['游戏', 'game', 'steam', '启动器', 'lol', '王者'],
    lines: [
      '打游戏带上小财呗，我负责喊 666~',
      '游戏输了也别气馁，小财给你顺顺毛~ 🐾',
    ],
  },
  {
    keywords: ['微信', 'wechat', 'qq', '钉钉', 'slack', '飞书', '聊天'],
    lines: [
      '在和人聊天呀，小财不偷看哦~ 🙈',
      '聊得开心嘛? 别忘了小财也在等你~',
    ],
  },
];

// 通用兜底（标题获取失败 / 无关键词命中）
const FALLBACK_LINES = [
  '主人辛苦啦~ 小财给你敲敲肩🐾',
  '喵～ 小财路过，顺便给主人捏捏肩~',
  '专心工作的主人最好看，小财默默陪着~ ✨',
];

// 抢键盘打字内容（不按回车、不发送，纯卖萌；SendKeys 特殊字符需避开）
const TYPING_LINES = ['meow', 'owo', 'nya', 'purr', 'cute', 'zZz', 'hello', 'hi']; // 不含 SendKeys 特殊字符
// 打字吐槽随机插入的表情符号（约 70% 概率追加一个，互动性增强）
const PRANK_EMOJI = ['🐾', '✨', '🌸', '💗', '🐱', '🫶', '😝', '⭐', '🍀', '🎀'];

// --- 玩法实现 ---

// 抢键盘打字：向当前聚焦输入框敲一行卖萌（不回车不发送）。
// Windows: [System.Windows.Forms.SendKeys]::SendWait；Linux: xdotool type。
// 平台工具不可用 → 返回 false 跳过该玩法。
function typeText(text) {
  if (typeTextImpl) return typeTextImpl(text);
  return realTypeText(text);
}

function realTypeText(text) {
  try {
    if (process.platform === 'win32') {
      // SendKeys 特殊字符 +^%~(){}[] 会导致误触发快捷键/回车，全部剔除
      const safe = String(text).replace(/[+^%~(){}\[\]]/g, '');
      if (!safe) return false;
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `[System.Windows.Forms.SendKeys]::SendWait("${safe}")`,
      ].join('\n');
      execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 4000 });
      return true;
    }
    if (process.platform === 'linux') {
      try {
        execFileSync('xdotool', ['type', '--delay', '120', String(text)], { encoding: 'utf8', timeout: 4000 });
        return true;
      } catch (e) {
        return false; // xdotool 不可用 → 跳过该玩法
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// 当前活跃窗口是否就是自家宠物/面板窗口（避免往自家输入框里捣蛋）
function isOwnWindow(title) {
  if (!title) return false;
  return /财神日历|Wealth Calendar|财富日历/.test(title);
}

// 标题关键词匹配（纯函数，便于确定性测试）：title → 模板池命中/兜底
function matchTitleRoast(title) {
  const t = (title || '').toLowerCase();
  let pool = FALLBACK_LINES;
  let matched = false;
  for (const group of PRANK_POOL) {
    if (group.keywords.some((kw) => t.includes(kw.toLowerCase()))) {
      pool = group.lines;
      matched = true;
      break;
    }
  }
  const text = pool[Math.floor(Math.random() * pool.length)];
  return { text, title: title || null, matched };
}

// 标题吐槽：取活跃窗口标题 → 关键词匹配模板池 → 通用兜底
function titleRoast() {
  const title = getActiveWindowTitle();
  return { type: 'title', ...matchTitleRoast(title) };
}

// 窗口抖动：小幅位移 2-3 次后回原位（互动小动作）。自家窗口聚焦时不抖（避免挪自己）。
function wiggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    const [x, y] = mainWindow.getPosition();
    const steps = 2 + Math.floor(Math.random() * 2); // 2-3 次
    let i = 0;
    const step = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      i += 1;
      const dx = Math.round((Math.random() - 0.5) * 18); // ±9px 小幅抖动
      const dy = Math.round((Math.random() - 0.5) * 18);
      mainWindow.setPosition(x + dx, y + dy);
      if (i < steps) setTimeout(step, 70);
      else mainWindow.setPosition(x, y); // 回原位
    };
    step();
    return true;
  } catch (e) {
    return false;
  }
}

// 纯吐槽（标题甜话/兜底）：v0.4.19 无每日上限
function doRoast() {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no-window' };
  const s = getSettings() || {};
  if (s.prankMode !== true) return { ok: false, reason: 'disabled' };
  const result = titleRoast();
  broadcast(result);
  return result;
}

// 执行一次完整捣蛋（占名额 → 挑玩法），返回描述供诊断/测试。
// opts.mode：'typed' 强制打字 / 'wiggle' 强制窗口抖动 / 'title' 强制标题吐槽 /
// null 随机（打字/窗口抖动二选一，工具不可用自动降级标题吐槽）
function doPrank(opts = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no-window' };
  const s = getSettings() || {};
  if (s.prankMode !== true) return { ok: false, reason: 'disabled' };

  const title = getActiveWindowTitle();
  // 自家窗口聚焦时只做标题吐槽，不抢键盘/不抖自己窗口（避免往宠物聊天框里乱打字）
  const canType = title === null || !isOwnWindow(title);

  // 玩法选择：显式 mode / 随机（打字或窗口抖动）
  let mode = opts.mode;
  if (!mode) {
    mode = (process.platform === 'win32' || process.platform === 'linux')
      ? (Math.random() < 0.6 ? 'typed' : 'wiggle')
      : 'title';
  }

  // 打字玩法（随机插入表情符号；工具不可用时自动降级到标题吐槽）
  if (mode === 'typed' && canType) {
    let text = TYPING_LINES[Math.floor(Math.random() * TYPING_LINES.length)];
    if (Math.random() < 0.7) text += ' ' + PRANK_EMOJI[Math.floor(Math.random() * PRANK_EMOJI.length)];
    if (typeText(text)) {
      const result = { type: 'typed', text: `喵（敲了一行 "${text}" 然后溜走~）`, typedText: text };
      broadcast(result);
      return result;
    }
  }

  // 窗口抖动玩法（小幅位移 2-3 次后回原位）
  if (mode === 'wiggle' && canType) {
    if (wiggleWindow()) {
      const result = { type: 'wiggle', text: '咦？小财把窗口晃了两下就跑啦~ 😝' };
      broadcast(result);
      return result;
    }
  }

  const result = titleRoast();
  broadcast(result);
  return result;
}

function broadcast(result) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send('pet-prank', {
      type: result.type,
      text: result.text,
      title: result.title || null,
      matched: !!result.matched,
    });
  } catch (e) { /* ignore */ }
}

// --- 调度：v0.4.19 单通道（5-10 分钟），到点随机吐槽或捣蛋二选一，无每日上限 ---
function scheduleNext() {
  stopTimers();
  const s = getSettings() || {};
  if (s.prankMode !== true) return; // 未开启 → 不排程
  schedulePrank();
}

function schedulePrank() {
  if (prankTimer) { clearTimeout(prankTimer); prankTimer = null; }
  const s = getSettings() || {};
  if (s.prankMode !== true) return;
  const delayMs = (PRANK_INTERVAL_MIN + Math.floor(Math.random() * (PRANK_INTERVAL_MAX - PRANK_INTERVAL_MIN + 1))) * 60000;
  prankTimer = setTimeout(() => {
    prankTimer = null;
    try {
      const cur = getSettings() || {};
      if (cur.prankMode === true && Math.random() < TRIGGER_CHANCE) {
        // 到点随机二选一：吐槽（标题甜话）或捣蛋操作（打字/窗口抖动）
        if (Math.random() < 0.5) doRoast();
        else doPrank();
      }
    } catch (e) { /* ignore */ }
    schedulePrank(); // 到点触发后续排
  }, delayMs);
}

function stopTimers() {
  if (prankTimer) { clearTimeout(prankTimer); prankTimer = null; }
}

function startPrank(window, deps = {}) {
  mainWindow = window;
  if (typeof deps.getSettings === 'function') getSettings = deps.getSettings;
  if (typeof deps.typeText === 'function') typeTextImpl = deps.typeText;
  scheduleNext();
}

function stopPrank() {
  stopTimers();
}

// 设置变化（捣蛋开关切换）后重排：开启→续排；关闭→停表
function onSettingsChanged() {
  const s = getSettings() || {};
  if (s.prankMode !== true) {
    stopPrank();
  } else {
    scheduleNext();
  }
}

// 手动触发一次（测试/诊断）：force=true 跳过概率骰；mode 透传给 doPrank
function doTick({ force, mode } = {}) {
  const s = getSettings() || {};
  if (s.prankMode !== true) return { ok: false, reason: 'disabled' };
  if (force) return doPrank({ mode });
  if (Math.random() < TRIGGER_CHANCE) return doPrank({ mode });
  return { ok: false, reason: 'roll-miss' };
}

module.exports = {
  startPrank, stopPrank, onSettingsChanged, doTick, doPrank, doRoast, wiggleWindow, getActiveWindowTitle, matchTitleRoast,
};
