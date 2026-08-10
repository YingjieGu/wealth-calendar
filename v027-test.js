// v0.4.27 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① doodle 纯方案一色板：含 3 色（f58e3d/6dfe59/ffe800）
//       且不含方案二色（fba2ae/79def7/baf1b3）与旧荧光色（ff006e/8338ec/3a86ff/06d6a0/ffbe0b/fb5607）
//       ② 背景为白/浅橙系（非纯米黄 #fdf6e3、非粉/蓝/绿底）
//       ③ 彩色阴影仅橙/绿/黄系
//       ④ stripEmoji 不回归（v024 全 22 项）
//       ⑤ 相关旧测试回归（v025/v026 与色板无关项：孟菲斯波点/波普符号/pill/零filter/手绘元素/三主题）
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
  console.log('== 1. doodle 纯方案一色板（橙/绿/黄，无方案二无旧荧光）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));
    const doodleVars = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 孟菲斯波点背景'));

    // 方案一 3 色全部存在
    ok(doodleAll.includes('f58e3d'), '橙 #f58e3d 存在（主色/主按钮/运势主打）');
    ok(doodleAll.includes('6dfe59'), '亮绿 #6dfe59 存在（辅助色/健康/标签）');
    ok(doodleAll.includes('ffe800'), '亮黄 #ffe800 存在（辅助色/高亮/徽标）');

    // 方案二 3 色全部移除
    ok(!doodleAll.includes('fba2ae'), '方案二 浅粉 #fba2ae 已移除');
    ok(!doodleAll.includes('79def7'), '方案二 浅蓝 #79def7 已移除');
    ok(!doodleAll.includes('baf1b3'), '方案二 浅绿 #baf1b3 已移除');

    // 旧荧光色全部移除
    ok(!doodleAll.includes('ff006e'), '荧光粉 #ff006e 已移除');
    ok(!doodleAll.includes('8338ec'), '亮紫 #8338ec 已移除');
    ok(!doodleAll.includes('3a86ff'), '宝蓝 #3a86ff 已移除');
    ok(!doodleAll.includes('06d6a0'), '湖水绿 #06d6a0 已移除');
    ok(!doodleAll.includes('ffbe0b'), '旧明黄 #ffbe0b 已移除');
    ok(!doodleAll.includes('fb5607'), '旧亮橙 #fb5607 已移除');

    // 深粉/深蓝变体（v0.4.26 引入的非方案一色）一并移除
    ok(!doodleAll.includes('d4657a'), '深粉变体 #d4657a 已移除');
    ok(!doodleAll.includes('2f97bd'), '深蓝变体 #2f97bd 已移除');

    // 方案一色板变量命名
    ok(doodleVars.includes('--pop-orange'), '--pop-orange 橙变量存在');
    ok(doodleVars.includes('--pop-green'), '--pop-green 亮绿变量存在');
    ok(doodleVars.includes('--pop-yellow'), '--pop-yellow 亮黄变量存在');
    ok(!doodleVars.includes('--soft-pink') && !doodleVars.includes('--soft-blue') && !doodleVars.includes('--soft-green'),
      '方案二 --soft-* 变量已移除');

    // 运势 7 维度只在橙/绿/黄三色相内分配（财运橙/桃花亮黄/事业浅橙/学业亮绿/健康深绿/出行橙/签约深黄）
    ok(doodleAll.includes('.fortune-dim:nth-child(1) { border-left: 4px solid #f58e3d'), '财运=橙左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(2) { border-left: 4px solid #ffe800'), '桃花=亮黄左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(4) { border-left: 4px solid #6dfe59'), '学业=亮绿左边框');
    ok(doodleAll.includes('.fortune-dim:nth-child(7) { border-left: 4px solid #a89100'), '签约=深黄左边框');
  }

  console.log('== 2. 背景为白/浅橙系（非米黄、非粉/蓝/绿底）==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    ok(!doodleAll.includes('fdf6e3'), '米黄纸底 #fdf6e3 未出现');
    ok(!doodleAll.includes('fffef9'), '旧卡片色 #fffef9 未出现');

    // v0.4.26 的粉/蓝/绿底色全部移除
    ok(!doodleAll.includes('fff0f3'), '浅粉底 #fff0f3 已移除');
    ok(!doodleAll.includes('fdf0f2'), '浅粉底 #fdf0f2 已移除');
    ok(!doodleAll.includes('eef8fc'), '浅蓝底 #eef8fc 已移除');
    ok(!doodleAll.includes('f6fbf2'), '浅绿底 #f6fbf2 已移除');
    ok(!doodleAll.includes('f2faf1'), '浅绿底 #f2faf1 已移除');

    // 新背景为白/浅橙系
    ok(doodleAll.includes('ffffff'), '白色卡片/背景存在');
    ok(doodleAll.includes('fff7ef'), '浅橙底 #fff7ef 存在（#f58e3d 淡化）');
    ok(doodleAll.includes('fff3e6'), '浅橙底 #fff3e6 存在');
    ok(doodleAll.includes('2d2a26'), '暖黑文字 #2d2a26 存在');
  }

  console.log('== 3. 彩色阴影仅橙/绿/黄系 ==');
  {
    const css = srcOf('src/renderer/styles.css');
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---------- 全局细滚动条'));

    // 橙/绿/黄系 rgba 阴影存在
    ok(doodleAll.includes('rgba(245, 142, 61,'), '橙色 rgba 阴影存在');
    ok(doodleAll.includes('rgba(255, 232, 0,'), '亮黄 rgba 阴影存在');
    ok(doodleAll.includes('rgba(109, 254, 89,'), '亮绿 rgba 阴影存在');

    // 方案二 rgba 阴影不存在
    ok(!doodleAll.includes('rgba(251, 162, 174,'), '浅粉 rgba 阴影已移除');
    ok(!doodleAll.includes('rgba(121, 222, 247,'), '浅蓝 rgba 阴影已移除');
    ok(!doodleAll.includes('rgba(186, 241, 179,'), '浅绿 rgba 阴影已移除');

    // 零纯黑阴影
    const blackShadowCount = (doodleAll.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/g) || []).length;
    ok(blackShadowCount === 0, `doodle 块零纯黑 rgba(0,0,0) 阴影（发现 ${blackShadowCount} 处）`);
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

  console.log('== 5. 相关旧测试回归（非色板项 + 三主题 + 手绘元素）==');
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
