// v0.4.26 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① doodle 双方案色板（方案一活力#f58e3d/#6dfe59/#ffe800，方案二柔和#fba2ae/#79def7/#baf1b3）
//       含用户 6 色至少 5 个，且不含旧多巴胺荧光色 #ff006e/#8338ec/#3a86ff/#06d6a0（及旧 dopa 其余色）
//       ② 彩色阴影用新色板色系（非纯黑 rgba(0,0,0)）
//       ③ 背景非旧米黄 #fdf6e3（新浅粉底 #fff0f3 + 暖黑文字 #2d2a26）
//       ④ stripEmoji 不回归（v024 全 22 项）
//       ⑤ v025 与色板无关的项全回归（孟菲斯波点/波普符号/pill/零filter/手绘元素/三主题）
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
  console.log('== 1. doodle 双方案色板（用户 6 色 ≥5 个，旧荧光色已清除）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));
    const doodleVars = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 孟菲斯波点背景'));

    // 用户 6 色中至少命中 5 个（方案一活力 + 方案二柔和）
    const userColors = ['f58e3d', '6dfe59', 'ffe800', 'fba2ae', '79def7', 'baf1b3'];
    let hit = 0;
    for (const c of userColors) if (doodleAll.includes(c)) hit++;
    ok(hit >= 5, `doodle 块含用户 6 色中至少 5 个（${hit}/6：f58e3d/6dfe59/ffe800/fba2ae/79def7/baf1b3）`);

    // 每色单独断言（方案一活力系 + 方案二柔和系都在用）
    ok(doodleAll.includes('f58e3d'), '方案一 橙 #f58e3d 存在（强调/按钮/主色）');
    ok(doodleAll.includes('6dfe59'), '方案一 亮绿 #6dfe59 存在（强调/健康）');
    ok(doodleAll.includes('ffe800'), '方案一 亮黄 #ffe800 存在（强调/财运/徽标）');
    ok(doodleAll.includes('fba2ae'), '方案二 浅粉 #fba2ae 存在（卡片/边框）');
    ok(doodleAll.includes('79def7'), '方案二 浅蓝 #79def7 存在（输入框/学业/边框）');
    ok(doodleAll.includes('baf1b3'), '方案二 浅绿 #baf1b3 存在（签约/边框）');

    // 旧多巴胺荧光色全部清除
    ok(!doodleAll.includes('ff006e'), '荧光粉 #ff006e 已清除');
    ok(!doodleAll.includes('8338ec'), '亮紫 #8338ec 已清除');
    ok(!doodleAll.includes('3a86ff'), '宝蓝 #3a86ff 已清除');
    ok(!doodleAll.includes('06d6a0'), '湖水绿 #06d6a0 已清除');
    ok(!doodleAll.includes('fb5607'), '旧亮橙 #fb5607 已清除');
    ok(!doodleAll.includes('ffbe0b'), '旧明黄 #ffbe0b 已清除');

    // 旧 rgba 阴影形式同样清除
    ok(!doodleAll.includes('rgba(255, 0, 110,'), '旧荧光粉 rgba 阴影已清除');
    ok(!doodleAll.includes('rgba(131, 56, 236,'), '旧亮紫 rgba 阴影已清除');
    ok(!doodleAll.includes('rgba(58, 134, 255,'), '旧宝蓝 rgba 阴影已清除');
    ok(!doodleAll.includes('rgba(6, 214, 160,'), '旧湖水绿 rgba 阴影已清除');

    // 双方案色板变量命名
    ok(doodleVars.includes('--pop-orange'), '--pop-orange 活力橙变量存在');
    ok(doodleVars.includes('--pop-green'), '--pop-green 活力亮绿变量存在');
    ok(doodleVars.includes('--pop-yellow'), '--pop-yellow 活力亮黄变量存在');
    ok(doodleVars.includes('--soft-pink'), '--soft-pink 柔和浅粉变量存在');
    ok(doodleVars.includes('--soft-blue'), '--soft-blue 柔和浅蓝变量存在');
    ok(doodleVars.includes('--soft-green'), '--soft-green 柔和浅绿变量存在');

    // 运势 7 维度按双方案分工上色（财运亮黄/桃花浅粉/事业橙/学业浅蓝/健康亮绿/出行橙/签约浅绿）
    ok(doodleAll.includes('.fortune-dim:nth-child(1) { border-left: 4px solid #ffe800'), '财运=亮黄左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(2) { border-left: 4px solid #fba2ae'), '桃花=浅粉左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(3) { border-left: 4px solid #f58e3d'), '事业=橙左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(4) { border-left: 4px solid #79def7'), '学业=浅蓝左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(5) { border-left: 4px solid #6dfe59'), '健康=亮绿左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(7) { border-left: 4px solid #baf1b3'), '签约=浅绿左边框');
  }

  console.log('== 2. 彩色阴影用新色板色系（非纯黑）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    // 新色板各色的 rgba 阴影至少命中 4 种
    const shadowRgba = ['rgba(245, 142, 61,', 'rgba(251, 162, 174,', 'rgba(121, 222, 247,',
      'rgba(186, 241, 179,', 'rgba(255, 232, 0,', 'rgba(109, 254, 89,'];
    let shadowHit = 0;
    for (const r of shadowRgba) if (doodleAll.includes(r)) shadowHit++;
    ok(shadowHit >= 4, `box-shadow 含新色板彩色阴影（${shadowHit}/6 种 rgba）`);

    // 零纯黑阴影残留
    const blackShadowCount = (doodleAll.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/g) || []).length;
    ok(blackShadowCount === 0, `doodle 块零纯黑 rgba(0,0,0) 阴影（发现 ${blackShadowCount} 处）`);
  }

  console.log('== 3. 背景非旧米黄（新浅粉底 + 暖黑文字）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    ok(!doodleAll.includes('fdf6e3'), '米黄纸底 #fdf6e3 未出现');
    ok(!doodleAll.includes('fffef9'), '旧卡片色 #fffef9 未出现');
    ok(doodleAll.includes('fff0f3'), '新浅粉底 #fff0f3 存在（#fba2ae 淡化）');
    ok(doodleAll.includes('2d2a26'), '暖黑文字 #2d2a26 存在');
    ok(doodleAll.includes('fba2ae'), '方案二浅粉做卡片/边框底色');
  }

  console.log('== 4. stripEmoji 不回归（v024 全 22 项重跑）==');
  {
    const MsgCore = require('./src/renderer/msgCore.js');
    const s = MsgCore.stripEmoji;
    ok(typeof s === 'function', 'stripEmoji 是函数且已导出');

    // 基础 emoji 剥离（7 项）
    ok(s('😀 你好') === '你好', '基础 emoji 剥离 (😀)');
    ok(s('🎨 手绘涂鸦') === '手绘涂鸦', '基础 emoji 剥离 (🎨)');
    ok(s('🥰 蹭蹭~ 主人摸我啦') === '蹭蹭~ 主人摸我啦', '基础 emoji 剥离 (🥰)');
    ok(s('❤️ 喜欢') === '喜欢', '变体选择器剥离 (❤️ = ❤ + ️)');
    ok(s('⭐ 收藏') === '收藏', '基础 emoji 剥离 (⭐)');
    ok(s('🐲 十二生肖收藏家') === '十二生肖收藏家', '基础 emoji 剥离 (🐲)');

    // ZWJ 序列 / 旗帜（2 项）
    ok(s('👨‍👩‍👧 家庭') === '家庭', 'ZWJ 序列剥离 (👨‍👩‍👧)');
    ok(s('🇨🇳 中国') === '中国', '旗帜剥离 (🇨🇳)');

    // 保留中文/英文/数字/标点（5 项）
    ok(s('你好世界') === '你好世界', '中文保留');
    ok(s('Hello World') === 'Hello World', '英文保留');
    ok(s('12345') === '12345', '数字保留');
    ok(s('你好！2024年...') === '你好！2024年...', '中文+数字+标点保留');
    ok(s('小财帮你瞄了一眼：运势63分') === '小财帮你瞄了一眼：运势63分', '纯中文+数字+标点保留');

    // 多余空白压缩（3 项）
    ok(s('😀   你好  世界') === '你好 世界', '多余空白压缩为单空格');
    ok(s('  🎨  手绘  ') === '手绘', '首尾空白 trim');
    ok(s('🥰\n蹭蹭~\t主人') === '蹭蹭~ 主人', '换行/制表→空格压缩');

    // 复杂混合（1 项）
    ok(s('🐲 主人！🎉 今日运势 ⭐⭐⭐ 63分 🥰 加油~') === '主人！ 今日运势 63分 加油~', '复杂混合剥离');

    // 空/非字符串安全 + 全 emoji（4 项）
    ok(s('') === '', '空字符串 → 空字符串');
    ok(s(null) === '', 'null → 空字符串');
    ok(s(undefined) === '', 'undefined → 空字符串');
    ok(s('😀🎨🥰❤️⭐🐲') === '', '全 emoji → 空字符串');

    const petSrc = srcOf('src/renderer/pet.js');
    ok(petSrc.includes('MsgCore.stripEmoji'), 'pet.js TTS 剥离接入保留');
  }

  console.log('== 5. v025 与色板无关的项全回归 ==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    // 孟菲斯波点 + 波普符号
    ok(doodleAll.includes('radial-gradient(circle'), 'radial-gradient 波点图案存在');
    ok(css.includes('孟菲斯波点背景'), '孟菲斯波点注释存在');
    ok(doodleAll.includes("'✦ '") && doodleAll.includes("'★ '") && doodleAll.includes("'♥ '"),
      '波普符号装饰存在（✦/★/♥）');
    ok(doodleAll.includes("'◆ '") && doodleAll.includes("'● '"),
      '几何符号装饰存在（◆/●）');

    // pill 形状
    const pillCount = (doodleAll.match(/border-radius:\s*999px/g) || []).length;
    ok(pillCount >= 3, `pill 按钮形状存在 ≥3 处（实际 ${pillCount} 处）`);

    // 手绘元素：不对称边框/微旋转/字体/硬阴影
    ok(doodleAll.includes('255px 15px 225px'), '不对称手绘 border-radius 保留');
    ok(doodleAll.includes('transform: rotate(-0'), '微旋转保留');
    ok(css.includes('ZCOOL KuaiLe'), '站酷快乐体 @font-face 保留');
    ok(doodleAll.includes('var(--font-doodle)'), 'doodle 字体变量保留');
    ok(doodleAll.includes('3px 4px 0'), '硬阴影无模糊贴纸感保留（彩色版）');

    // 零裸 filter（全文件，排除注释与 backdrop-filter）
    const nonCommentCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const filterLines = nonCommentCss.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) return false;
      if (trimmed.includes('backdrop-filter') || trimmed.includes('-webkit-backdrop-filter')) return false;
      return /\bfilter\s*:/.test(trimmed);
    });
    ok(filterLines.length === 0, `零裸 filter（发现 ${filterLines.length} 处）`);

    // dark/light/teal 三主题回归无损
    ok(css.includes('body.theme-light {'), '浅色主题完整');
    ok(css.includes('body.theme-teal {'), '青涩主题完整');
    ok(css.includes(':root {') && css.includes('--bg: #141226;'), '深色主题完整');
    ok(css.includes('body.theme-doodle {'), 'doodle 主题完整');

    // 设置页 doodle 分支 / 切换 / 按钮保留
    const settingsJs = srcOf('src/renderer/settings.js');
    ok(settingsJs.includes("uiTheme === 'doodle'"), 'applyUiTheme doodle 分支');
    ok(settingsJs.includes('theme-doodle'), 'theme-doodle class toggle');
    const html = srcOf('src/renderer/index.html');
    ok(html.includes('data-ui-theme="doodle"'), 'doodle 按钮保留');
    ok(html.includes('🎨 手绘涂鸦'), 'doodle 按钮文本保留');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
