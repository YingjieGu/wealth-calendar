// v0.4.25 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① doodle 多巴胺高饱和色板（≥5 色，旧色 #6a9fd8/#e98a8a 不作为主色变量）
//       ② 彩色阴影（doodle 块 box-shadow 含彩色色值，非纯 rgba(0,0,0)）
//       ③ 无大面积灰色/米黄做主背景（bg 非 #fdf6e3）
//       ④ 孟菲斯波点装饰（radial-gradient）
//       ⑤ stripEmoji 不回归（v024 的 22 项）
//       ⑥ v023/v024 测试全回归
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
  console.log('== 1. doodle 多巴胺高饱和色板（≥5 种高饱和色，旧低饱和色已移除）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleBlock = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 孟菲斯波点背景'));

    // 6 种多巴胺高饱和色至少命中 5 个
    const dopaColors = ['ff006e', '8338ec', 'ffbe0b', '3a86ff', '06d6a0', 'fb5607'];
    let dopaCount = 0;
    for (const c of dopaColors) {
      if (doodleBlock.includes(c)) dopaCount++;
    }
    ok(dopaCount >= 5, `doodle 块含 ≥5 种多巴胺高饱和色（${dopaCount}/6：ff006e/8338ec/ffbe0b/3a86ff/06d6a0/fb5607）`);

    // 每个色单独断言
    ok(doodleBlock.includes('ff006e'), '荧光粉 #ff006e 存在');
    ok(doodleBlock.includes('8338ec'), '亮紫 #8338ec 存在');
    ok(doodleBlock.includes('ffbe0b'), '明黄 #ffbe0b 存在');
    ok(doodleBlock.includes('3a86ff'), '宝蓝 #3a86ff 存在');
    ok(doodleBlock.includes('06d6a0'), '湖水绿 #06d6a0 存在');
    ok(doodleBlock.includes('fb5607'), '亮橙 #fb5607 存在');

    // 旧低饱和色不作为主色变量存在
    ok(!doodleBlock.includes('#6a9fd8'), '旧蜡笔蓝 #6a9fd8 已移除（不作为主色变量）');
    ok(!doodleBlock.includes('#e98a8a'), '旧蜡笔红 #e98a8a 已移除（不作为主色变量）');

    // 新色板变量命名
    ok(doodleBlock.includes('--dopa-pink'), '--dopa-pink 多巴胺变量存在');
    ok(doodleBlock.includes('--dopa-purple'), '--dopa-purple 多巴胺变量存在');
    ok(doodleBlock.includes('--dopa-yellow'), '--dopa-yellow 多巴胺变量存在');
    ok(doodleBlock.includes('--dopa-blue'), '--dopa-blue 多巴胺变量存在');
    ok(doodleBlock.includes('--dopa-green'), '--dopa-green 多巴胺变量存在');
    ok(doodleBlock.includes('--dopa-orange'), '--dopa-orange 多巴胺变量存在');
  }

  console.log('== 2. 彩色阴影（doodle 块 box-shadow 含彩色色值，非纯 rgba(0,0,0)）==');
  {
    const css = srcOf('src/renderer/styles.css');
    // Extract all doodle block box-shadow values
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    // Must have colored shadows
    ok(doodleAll.includes('rgba(255, 0, 110,'), 'box-shadow 含荧光粉色值');
    ok(doodleAll.includes('rgba(131, 56, 236,'), 'box-shadow 含亮紫色值');
    ok(doodleAll.includes('rgba(58, 134, 255,'), 'box-shadow 含宝蓝色值');

    // No pure black shadows remaining in doodle
    const blackShadowCount = (doodleAll.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/g) || []).length;
    ok(blackShadowCount === 0, `doodle 块零纯黑 rgba(0,0,0) 阴影（发现 ${blackShadowCount} 处）`);
  }

  console.log('== 3. 无大面积灰色/米黄做主背景（bg 非 #fdf6e3）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleBlock = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 孟菲斯波点背景'));

    ok(!doodleBlock.includes('#fdf6e3'), '米黄纸底 #fdf6e3 已移除');
    ok(!doodleBlock.includes('#fffef9'), '旧卡片色 #fffef9 已移除');
    ok(doodleBlock.includes('#fff0f5') || doodleBlock.includes('fff0f5'), '浅粉底色 #fff0f5 为新背景');
    ok(doodleBlock.includes('#1a1a2e'), '深蓝黑文字 #1a1a2e 为文字主色');
  }

  console.log('== 4. 孟菲斯波点装饰（radial-gradient + 波普符号）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle'));

    // Polka dot: radial-gradient circle patterns
    ok(doodleAll.includes('radial-gradient(circle'), 'radial-gradient 波点图案存在');
    ok(doodleAll.includes('孟菲斯波点背景'), '孟菲斯波点注释存在');

    // Pop symbols in CSS content
    ok(doodleAll.includes("'✦ '") || doodleAll.includes("'★ '") || doodleAll.includes("'♥ '"),
      '波普符号装饰存在（✦/★/♥）');
    ok(doodleAll.includes("'◆ '") || doodleAll.includes("'● '"),
      '几何符号装饰存在（◆/●）');

    // Pill shapes (border-radius: 999px)
    const pillCount = (doodleAll.match(/border-radius:\s*999px/g) || []).length;
    ok(pillCount >= 3, `pill 按钮形状存在 ≥3 处（实际 ${pillCount} 处）`);

    // Still zero filter
    const nonCommentCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const filterLines = nonCommentCss.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) return false;
      if (trimmed.includes('backdrop-filter') || trimmed.includes('-webkit-backdrop-filter')) return false;
      return /\bfilter\s*:/.test(trimmed);
    });
    ok(filterLines.length === 0, `零裸 filter（发现 ${filterLines.length} 处）`);
  }

  console.log('== 5. stripEmoji 不回归（v024 关键项重跑）==');
  {
    const MsgCore = require('./src/renderer/msgCore.js');
    const s = MsgCore.stripEmoji;
    ok(typeof s === 'function', 'stripEmoji 仍是函数');
    ok(s('😀 你好') === '你好', '基础 emoji 剥离');
    ok(s('🥰 蹭蹭~ 主人摸我啦') === '蹭蹭~ 主人摸我啦', 'emoji 剥离');
    ok(s('❤️ 喜欢') === '喜欢', '变体选择器剥离');
    ok(s('🇨🇳 中国') === '中国', '旗帜剥离（Regional_Indicator）');
    ok(s('👨‍👩‍👧 家庭') === '家庭', 'ZWJ 序列剥离');
    ok(s('') === '', '空字符串');

    const petSrc = srcOf('src/renderer/pet.js');
    ok(petSrc.includes('MsgCore.stripEmoji'), 'pet.js TTS 剥离接入保留');
  }

  console.log('== 6. dark/light/teal 三主题回归无损 ==');
  {
    const css = srcOf('src/renderer/styles.css');
    ok(css.includes('body.theme-light {'), '浅色主题完整');
    ok(css.includes('body.theme-teal {'), '青涩主题完整');
    ok(css.includes(':root {') && css.includes('--bg: #141226;'), '深色主题完整');
    ok(css.includes('body.theme-doodle {'), 'doodle 主题完整');

    const settingsJs = srcOf('src/renderer/settings.js');
    ok(settingsJs.includes("uiTheme === 'doodle'"), 'applyUiTheme doodle 分支');
    ok(settingsJs.includes("theme-doodle"), 'theme-doodle class toggle');

    const html = srcOf('src/renderer/index.html');
    ok(html.includes('data-ui-theme="doodle"'), 'doodle 按钮保留');
    ok(html.includes('🎨 手绘涂鸦'), 'doodle 按钮文本保留');
  }

  console.log('== 7. 手绘元素保留（不对称边框+微旋转+手写字体）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle'));

    ok(doodleAll.includes('255px 15px 225px'), '不对称手绘 border-radius 保留');
    ok(doodleAll.includes('transform: rotate(-0'), '微旋转保留');
    ok(css.includes('ZCOOL KuaiLe'), '站酷快乐体 @font-face 保留');
    ok(css.includes('var(--font-doodle)'), 'doodle 字体变量保留');
    ok(doodleAll.includes('3px 4px 0'), '硬阴影无模糊贴纸感保留（彩色版）');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
