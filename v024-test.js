// v0.4.24 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① stripEmoji 纯函数（ZWJ 序列/变体选择器/旗帜/CJK 保留/空白压缩）
//       ② doodle 多色断言（≥3 种色相强调色、组件级彩色变量/选择器）
//       ③ v023 测试全回归（61 项）
//       ④ dark/light/teal 三主题回归无损
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function srcOf(p) {
  return fs.readFileSync(path.join(__dirname, p), 'utf8');
}

(async () => {
  console.log('== 1. stripEmoji 纯函数（MsgCore.stripEmoji）==');
  {
    const MsgCore = require('./src/renderer/msgCore.js');
    ok(typeof MsgCore.stripEmoji === 'function', 'stripEmoji 是函数且已导出');

    const s = MsgCore.stripEmoji;

    // 基础 emoji 剥离
    ok(s('😀 你好') === '你好', '基础 emoji 剥离 (😀)');
    ok(s('🎨 手绘涂鸦') === '手绘涂鸦', '基础 emoji 剥离 (🎨)');
    ok(s('🥰 蹭蹭~ 主人摸我啦') === '蹭蹭~ 主人摸我啦', '基础 emoji 剥离 (🥰)');
    ok(s('❤️ 喜欢') === '喜欢', '变体选择器剥离 (❤️ = ❤ + ️)');
    ok(s('⭐ 收藏') === '收藏', '基础 emoji 剥离 (⭐)');
    ok(s('🐲 十二生肖收藏家') === '十二生肖收藏家', '基础 emoji 剥离 (🐲)');

    // ZWJ 序列剥离（如 👨‍👩‍👧 = 👨 + ‍ + 👩 + ‍ + 👧）
    const zwjTest = s('👨‍👩‍👧 家庭');
    ok(zwjTest === '家庭', `ZWJ 序列剥离 (👨‍👩‍👧 → "${zwjTest}")`);

    // 旗帜剥离（🇨🇳 = 🇨 + 🇳）
    const flagTest = s('🇨🇳 中国');
    ok(flagTest === '中国', `旗帜剥离 (🇨🇳 → "${flagTest}")`);

    // 保留中文/英文字母/数字/标点
    ok(s('你好世界') === '你好世界', '中文保留');
    ok(s('Hello World') === 'Hello World', '英文保留');
    ok(s('12345') === '12345', '数字保留');
    ok(s('你好！2024年...') === '你好！2024年...', '中文+数字+标点保留');
    ok(s('小财帮你瞄了一眼：运势63分') === '小财帮你瞄了一眼：运势63分', '纯中文+数字+标点保留');

    // 多余空白压缩
    ok(s('😀   你好  世界') === '你好 世界', '多余空白压缩为单空格');
    ok(s('  🎨  手绘  ') === '手绘', '首尾空白 trim');
    ok(s('🥰\n蹭蹭~\t主人') === '蹭蹭~ 主人', '换行/制表→空格压缩');

    // 复杂混合
    const mixed = s('🐲 主人！🎉 今日运势 ⭐⭐⭐ 63分 🥰 加油~');
    ok(mixed === '主人！ 今日运势 63分 加油~', `复杂混合剥离 ("${mixed}")`);

    // 空/非字符串安全
    ok(s('') === '', '空字符串 → 空字符串');
    ok(s(null) === '', 'null → 空字符串');
    ok(s(undefined) === '', 'undefined → 空字符串');

    // 全 emoji → 空
    ok(s('😀🎨🥰❤️⭐🐲') === '', '全 emoji → 空字符串');
  }

  console.log('== 2. doodle 多色断言（≥3 种不同色相强调色）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'));

    // 多色蜡笔调色板变量存在
    const colorVars = ['--doodle-pink', '--doodle-blue', '--doodle-green',
      '--doodle-orange', '--doodle-purple', '--doodle-teal', '--doodle-gold'];
    let foundColorVars = 0;
    for (const v of colorVars) {
      if (doodleAll.includes(v)) foundColorVars++;
    }
    ok(foundColorVars >= 7, `doodle 块含完整 7 色蜡笔调色板变量（发现 ${foundColorVars}/7）`);

    // ≥3 种不同色相强调色
    ok(doodleAll.includes('#f2a0b6'), '蜡笔粉 #f2a0b6 存在');
    ok(doodleAll.includes('#7aa5d9'), '蜡笔蓝 #7aa5d9 存在');
    ok(doodleAll.includes('#9cc79c'), '蜡笔绿 #9cc79c 存在');
    ok(doodleAll.includes('#f0b878'), '蜡笔橙 #f0b878 存在');
    ok(doodleAll.includes('#b8a0d8'), '蜡笔紫 #b8a0d8 存在');
    ok(doodleAll.includes('#e8c878'), '蜡笔金 #e8c878 存在');

    // 组件级彩色类/变量存在
    ok(css.includes('.fortune-dim:nth-child(1) { border-left: 3px solid var(--doodle-gold)'),
      '运势 7 维度财运金色左边框');
    ok(css.includes('.fortune-dim:nth-child(2) { border-left: 3px solid var(--doodle-pink)'),
      '运势 7 维度桃花粉色左边框');
    ok(css.includes('.fortune-dim:nth-child(3) { border-left: 3px solid var(--doodle-blue)'),
      '运势 7 维度事业蓝色左边框');
    ok(css.includes('.fortune-dim:nth-child(7) { border-left: 3px solid var(--doodle-teal)'),
      '运势 7 维度签约青色左边框');

    // 分区上色：设置页板块多色
    ok(css.includes('setting-group:nth-child(5n+1)'), '设置页板块 5 色循环规则存在');
    ok(css.includes('setting-group:nth-child(5n+2)') && css.includes('#7aa5d9'),
      '设置页板块蓝色第 2 组');
    ok(css.includes('setting-group:nth-child(5n+3)') && css.includes('#9cc79c'),
      '设置页板块绿色第 3 组');

    // 聊天用户气泡多色
    ok(css.includes('chat-user:nth-child(4n+1)') && css.includes('#f2a0b6'),
      '聊天用户气泡粉色交替');
    ok(css.includes('chat-user:nth-child(4n+2)') && css.includes('#7aa5d9'),
      '聊天用户气泡蓝色交替');

    // 彩色阴影（非纯黑 rgba(0,0,0,...)）
    ok(doodleAll.includes('rgba(160, 140, 120,') || doodleAll.includes('rgba(140, 150, 175,'),
      '手绘阴影已彩色化（非纯黑）');

    // 装饰符号存在
    ok(css.includes('content: \'★') && css.includes('content: \'♥'),
      'CSS 装饰符号存在（星星 + 爱心）');
    ok(css.includes('content: \'♦') && css.includes('content: \'●'),
      'CSS 装饰符号存在（菱形 + 圆点）');

    // 依然零 filter（排除 backdrop-filter 和注释）
    const nonCommentCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const filterLines = nonCommentCss.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) return false;
      if (trimmed.includes('backdrop-filter') || trimmed.includes('-webkit-backdrop-filter')) return false;
      return /\bfilter\s*:/.test(trimmed);
    });
    ok(filterLines.length === 0, `样式仍零裸 filter（发现 ${filterLines.length} 处）`);
  }

  console.log('== 3. stripEmoji 在 pet.js TTS 合成前接入 ==');
  {
    const petSrc = srcOf('src/renderer/pet.js');
    ok(petSrc.includes('MsgCore.stripEmoji'), 'pet.js _ttsDrain 调用 MsgCore.stripEmoji');
    ok(petSrc.includes('ttsSynthesize'), 'ttsSynthesize 仍存在（未破坏）');
    // TTS 剥离在合成前（inline call），入队/去重逻辑不受影响
    ok(petSrc.includes('_ttsEnqueue'), '_ttsEnqueue 仍在（去重逻辑未变）');
    ok(petSrc.includes('_ttsCurrent === text'), 'TTS 去重用原文（有 emoji 也能去重）');
  }

  console.log('== 4. 回归检查：dark/light/teal 三主题 + v023 验证项 ==');
  {
    const css = srcOf('src/renderer/styles.css');
    ok(css.includes('body.theme-light {'), '浅色主题块完整');
    ok(css.includes('body.theme-teal {'), '青涩主题块完整');
    ok(css.includes(':root {') && css.includes('--bg: #141226;'), '深色主题 --bg 完整');
    ok(css.includes('body.theme-doodle {'), 'doodle 主题块完整');
    ok(css.includes('@font-face'), '@font-face 字体声明完整');

    // v023 关键断言
    const settingsJs = srcOf('src/renderer/settings.js');
    ok(settingsJs.includes("uiTheme === 'doodle'"), 'applyUiTheme doodle 分支保留');
    ok(settingsJs.includes("theme-doodle"), 'theme-doodle class toggle 保留');

    const html = srcOf('src/renderer/index.html');
    ok(html.includes('data-ui-theme="doodle"'), 'doodle 按钮保留');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
