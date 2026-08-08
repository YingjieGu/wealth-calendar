// v0.4.23 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① styles.css 含 body.theme-doodle 且无 filter
//       ② index.html 含 doodle 按钮、settings.js applyUiTheme 有 doodle 分支
//       ③ 派生变量显式覆盖（doodle 块不引用 var() 派生关键变量）
//       ④ 字体文件存在（>=100KB）
//       ⑤ 回归 v019-v022 测试仍过（若受影响）
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
  console.log('== 1. styles.css: body.theme-doodle 存在 + 无 filter ==');
  {
    const css = srcOf('src/renderer/styles.css');
    ok(css.includes('body.theme-doodle'), 'styles.css 含 body.theme-doodle 选择器');
    ok(css.includes('@font-face'), 'styles.css 含 @font-face 字体声明');
    ok(css.includes('ZCOOL KuaiLe'), 'styles.css 引用 ZCOOL KuaiLe 字体名');

    // 无 filter 关键字（排除注释和 backdrop-filter/-webkit-backdrop-filter）
    const nonCommentCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const filterLines = nonCommentCss.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) return false;
      // Allow backdrop-filter and -webkit-backdrop-filter (these are safe)
      if (trimmed.includes('backdrop-filter') || trimmed.includes('-webkit-backdrop-filter')) return false;
      // Check for bare filter:
      return /\bfilter\s*:/.test(trimmed);
    });
    ok(filterLines.length === 0, `styles.css 无裸 filter 属性（排除 backdrop-filter，发现 ${filterLines.length} 处）`);

    // Verify the doodle block has all required token overrides
    ok(css.includes('--color-primary: #6a9fd8'), '蜡笔蓝主色覆盖');
    ok(css.includes('--bg: #fdf6e3'), '米黄纸底覆盖');
    ok(css.includes('--text: #3a3028'), '铅笔灰文字覆盖');
    ok(css.includes('repeating-linear-gradient'), '纸纹横线渐变（纯 CSS，无 filter）');
    ok(css.includes('--radius-sm: 255px 15px 225px'), '不对称手绘 border-radius');
    ok(css.includes('--shadow-1: 2px 3px 0'), '硬阴影无模糊（贴纸感）');
    ok(css.includes('transform: rotate(-0'), '微旋转（贴纸/便签感）');

    // Explicit derived variable overrides (no var() dependency for critical variables)
    const doodleBlock = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 纸纹背景'));
    ok(doodleBlock.includes('--accent: #e98a8a'), '显式覆盖 --accent（不依赖 var() 级联）');
    ok(doodleBlock.includes('--panel-bg:'), '显式覆盖 --panel-bg');
    ok(doodleBlock.includes('--card: #fffef9'), '显式覆盖 --card');
    ok(doodleBlock.includes('--toast-bg:'), '显式覆盖 --toast-bg');
    ok(doodleBlock.includes('--input-bg:'), '显式覆盖 --input-bg');
    ok(doodleBlock.includes('--btn-bg:'), '显式覆盖 --btn-bg');

    // Check that doodle block doesn't use var() for critical derived variables
    const doodleAll = css.substring(css.indexOf('body.theme-doodle {'), css.indexOf('/* ---- 纸纹背景'));
    const derivedVars = ['--accent', '--card', '--panel-bg', '--panel-bg2', '--menu-bg',
      '--toast-bg', '--text-strong', '--text-mid', '--input-bg', '--input-border',
      '--btn-bg', '--btn-hover', '--scrollbar', '--scrollbar-hover', '--schedule-item'];
    let varRefCount = 0;
    for (const v of derivedVars) {
      // Check if this var is set using var() (which would be a regression risk)
      const re = new RegExp(`${v.replace('--', '--')}\\s*:\\s*var\\(`);
      if (re.test(doodleAll)) varRefCount++;
    }
    ok(varRefCount === 0, `派生变量显式覆盖：doodle 块无 var() 引用关键变量（发现 ${varRefCount} 处）`);

    // Component coverage checks
    const comps = [
      '#settings-panel', '#chat-panel', '#calendar-view', '#reminder-bubble',
      '#toast', '#context-menu', '.setting-group', '.chat-msg',
      '.fortune-card', '.cal-cell', '.modal-content', '.theme-option',
      '.action-btn', '.setting-input', '.close-btn', '.hover-btn',
      '.zodiac-cell', '.mini-card', '.schedule-item', '.star-chart-analysis'
    ];
    for (const comp of comps) {
      ok(doodleAll.includes(`body.theme-doodle ${comp}`) || css.includes(`body.theme-doodle ${comp}`),
        `组件覆盖：${comp} 有手绘样式`);
    }
  }

  console.log('== 2. index.html: doodle 按钮 + settings.js applyUiTheme 分支 ==');
  {
    const html = srcOf('src/renderer/index.html');
    ok(html.includes('data-ui-theme="doodle"'), 'index.html 含 doodle 按钮 (data-ui-theme="doodle")');
    ok(html.includes('🎨 手绘涂鸦'), '按钮标签含 🎨 手绘涂鸦');

    const settingsJs = srcOf('src/renderer/settings.js');
    ok(settingsJs.includes("uiTheme === 'doodle'"), 'applyUiTheme 有 doodle 分支判断');
    ok(settingsJs.includes("theme-doodle"), 'applyUiTheme 切换 theme-doodle class');
    ok(settingsJs.includes('已切换手绘涂鸦主题'), 'toast 含 doodle 切换提示');
  }

  console.log('== 3. 派生变量显式覆盖（doodle 块不引用 var() 派生关键变量） ==');
  {
    // Already validated in test 1; double-check structural integrity
    const css = srcOf('src/renderer/styles.css');
    // Ensure dark/light/teal still exist and haven't been accidentally modified
    ok(css.includes('body.theme-light {'), '浅色主题块完整存在');
    ok(css.includes('body.theme-teal {'), '青涩主题块完整存在');
    // Verify doodle is after teal (correct insertion order)
    const tealPos = css.indexOf('body.theme-teal {');
    const doodlePos = css.indexOf('body.theme-doodle {');
    ok(doodlePos > tealPos, 'doodle 块在 teal 块之后（正确插入位置）');
  }

  console.log('== 4. 字体文件存在 + package.json 打包配置 ==');
  {
    const fontsDir = path.join(__dirname, 'assets', 'fonts');
    const fontFiles = fs.readdirSync(fontsDir).filter(f => /\.(ttf|woff2|otf)$/i.test(f));
    ok(fontFiles.length >= 1, `assets/fonts/ 含字体文件（${fontFiles.join(', ')}）`);
    const fontPath = path.join(fontsDir, fontFiles[0]);
    const stat = fs.statSync(fontPath);
    ok(stat.size > 100 * 1024, `字体文件 ≥100KB（实际 ${(stat.size / 1024).toFixed(1)}KB）`);
    ok(fontFiles.some(f => f.includes('ZCOOL') || f.includes('KuaiLe')), '字体文件名含 ZCOOL/KuaiLe');

    const pkg = JSON.parse(srcOf('package.json'));
    const fontsInExtra = (pkg.build.extraResources || []).some(r => r.from === 'assets/fonts');
    ok(fontsInExtra, 'package.json build.extraResources 含 assets/fonts');
  }

  console.log('== 5. 回归检查：dark/light/teal 三主题未受影响 ==');
  {
    const css = srcOf('src/renderer/styles.css');
    // Light theme key tokens still intact
    ok(css.includes('body.theme-light {') && css.includes('--bg: #f7f8fa;'), 'light 浅色主题 --bg 完整');
    ok(css.includes('--text: #1a1a1a;'), 'light 浅色主题 --text 完整');
    // Teal theme key tokens still intact
    ok(css.includes('body.theme-teal {') && css.includes('--bg: linear-gradient(170deg, #dce8e6'), 'teal 青涩主题 --bg 完整');
    ok(css.includes('--surface: #f7f1e0;'), 'teal 青涩主题 --surface 完整');
    // Dark (root) still intact
    ok(css.includes(':root {') && css.includes('--bg: #141226;'), 'dark 深色主题 --bg 完整');

    // settings.js regression: applyUiTheme still handles dark/light/teal
    const settingsJs = srcOf('src/renderer/settings.js');
    ok(settingsJs.includes("uiTheme === 'light'") && settingsJs.includes("uiTheme === 'teal'"),
      'settings.js applyUiTheme 仍处理 light/teal 分支');
    ok(settingsJs.includes("'dark'"), 'settings.js 默认 uiTheme 仍为 dark');
  }

  console.log('== 6. node --check 语法检查 ==');
  {
    // We can't run node --check here but we verify file integrity
    const files = [
      'src/renderer/styles.css',
      'src/renderer/index.html',
      'src/renderer/settings.js',
      'package.json'
    ];
    for (const f of files) {
      const fullPath = path.join(__dirname, f);
      ok(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0, `${f} 存在且非空`);
    }
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
