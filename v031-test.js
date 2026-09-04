// v0.4.31 单元测试（node 直接跑，不启动 GUI）
// 覆盖：① 图标玩法触发率 30%→50% ② 立即捣蛋：IPC/preload/设置按钮(30s 冷却)/immediatePrank
//       平台不符→吐槽并气泡告知原因、disabled 不广播 ③ 星盘分析虚框：hidden 规则补上
//       ④ 播报文案：去"瞄了一眼"前缀(stripPhrase) + emoji 不读(stripEmoji/speechText)
'use strict';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}
function srcOf(p) { return require('fs').readFileSync(require('path').join(__dirname, p), 'utf8'); }

(async () => {
  const MsgCore = require('./src/renderer/msgCore.js');

  console.log('== 1. 图标玩法触发率 30%→50% + doPrank icons 分支接线 ==');
  {
    const prankSrc = srcOf('src/main/prank.js');
    ok(prankSrc.includes("process.platform === 'win32' && Math.random() < 0.5) doPrank({ mode: 'icons' })"),
      'win32 调度图标玩法概率 = 50%');
    ok(!prankSrc.includes("process.platform === 'win32' && Math.random() < 0.3) doPrank"), '旧 30% 概率已移除');
    ok(prankSrc.includes("mode === 'icons'") && prankSrc.includes('iconPranks.tryIconPrank'), 'doPrank 含 icons 分支并调用 tryIconPrank');
    // 审计：icons 分支失败须落到普通玩法/标题吐槽，不得静默 return
    const seg = prankSrc.slice(prankSrc.indexOf("if (mode === 'icons')"), prankSrc.indexOf('// 打字玩法'));
    ok(seg.includes('if (ir && ir.ok)') && seg.includes('return result;') && !/^\s*return\s*$/.test(seg), 'icons 失败不会提前静默 return（落到降级路径）');
  }

  console.log('== 2. 立即捣蛋：IPC / preload / 设置按钮(30s 冷却) ==');
  {
    ok(srcOf('src/main/main.js').includes("ipcMain.handle('prank:immediate'") && srcOf('src/main/prank.js').includes('function immediatePrank()'),
      'main.js 注册 prank:immediate → prank.immediatePrank');
    ok(srcOf('src/preload/preload.js').includes("prankImmediate: () => ipcRenderer.invoke('prank:immediate')"), 'preload 暴露 prankImmediate');
    const html = srcOf('src/renderer/index.html');
    ok(html.includes('id="btn-prank-now"') && html.includes('😼 立即捣蛋一次'), '设置页含"😼 立即捣蛋一次"按钮');
    const st = srcOf('src/renderer/settings.js');
    ok(st.includes('btn-prank-now') && st.includes('prankImmediate'), 'settings.js 绑定按钮并调 prankImmediate');
    ok(st.includes('let remain = 30') && st.includes('setInterval(tick, 1000)'), '按钮带 30s 冷却倒计时');
  }

  console.log('== 3. immediatePrank：disabled 不广播 / 非 win32 → 吐槽并在气泡告知原因 ==');
  {
    // 先 stub getActiveWindowTitle 再 require prank（Linux xdotool 会挂起，须在 require 前替换）
    require('./src/main/windowInfo').getActiveWindowTitle = () => null;
    const prank = require('./src/main/prank.js');
    const sent = [];
    const fakeWindow = { isDestroyed: () => false, webContents: { send: (ch, data) => sent.push(data) } };

    // 未开启捣蛋模式 → disabled，不广播
    prank.startPrank(fakeWindow, { getSettings: () => ({ prankMode: false }) });
    sent.length = 0;
    const dis = prank.immediatePrank();
    ok(dis && dis.ok === false && dis.reason === 'disabled' && sent.length === 0, 'prankMode 关 → disabled 且不广播');
    ok((dis.text || '').includes('开启'), 'disabled 提示引导开启');

    // 非 win32（Linux 本机）→ 吐槽并在气泡告知"仅 Windows"，走广播
    prank.startPrank(fakeWindow, { getSettings: () => ({ prankMode: true }) });
    sent.length = 0;
    const lp = prank.immediatePrank();
    ok(lp && lp.ok === false && lp.reason === 'platform' && lp.type === 'title', '非 win32 → 走标题吐槽(type:title, reason:platform)');
    ok((lp.text || '').includes('Windows'), '气泡文案告知"仅 Windows 支持图标玩法"');
    ok(sent.length === 1 && sent[0].type === 'title' && String(sent[0].text).includes('Windows'), '已广播到 pet（气泡含原因）');
    ok(prank.ICON_BLOCK_NOTE && prank.ICON_BLOCK_NOTE.platform && prank.ICON_BLOCK_NOTE.autoArrange, '原因文案表含 platform/autoArrange');
    prank.stopPrank();
  }

  console.log('== 4. 星盘分析虚框隐藏（补 .hidden 规则）==');
  {
    const css = srcOf('src/renderer/styles.css');
    ok(css.includes('#star-chart-body.hidden') && css.includes('#star-chart-analysis.hidden'), '补 #star-chart-body/#star-chart-analysis 的 .hidden 规则');
    const rule = css.slice(css.indexOf('#star-chart-analysis.hidden'), css.indexOf('#star-chart-analysis.hidden') + 80);
    ok(/display\s*:\s*none/.test(rule), '星盘分析占位 hidden 时 display:none（分析前不显示空虚线框）');
    const cal = srcOf('src/renderer/calendar.js');
    ok(cal.includes('class="star-chart-analysis hidden"'), '分析结果卡初始带 hidden（点击并返回内容后才显示）');
    ok(cal.includes("out.classList.remove('hidden')"), '分析结果渲染后才解除 hidden');
  }

  console.log('== 5. 播报文案与语音：去"瞄了一眼" + emoji 不读 ==');
  {
    ok(typeof MsgCore.stripPhrase === 'function' && typeof MsgCore.speechText === 'function', 'msgCore 导出 stripPhrase/speechText');
    ok(MsgCore.stripPhrase('小财帮你瞄了一眼：今日运势 63 分') === '今日运势 63 分', 'stripPhrase 去掉"小财帮你瞄了一眼："');
    ok(MsgCore.stripPhrase('小财帮你瞄了一眼: 加油') === '加油', 'stripPhrase 兼容英文冒号变体');
    ok(MsgCore.stripPhrase('小财帮你瞄了一眼') === '', 'stripPhrase 去掉无冒号前缀');
    ok(MsgCore.stripPhrase('普通文案不受伤') === '普通文案不受伤', 'stripPhrase 不误伤普通文案');
    ok(MsgCore.stripEmoji('🕐 巳时(09:00-11:00) 大吉') === '巳时(09:00-11:00) 大吉', 'stripEmoji 去掉 🕐（不会读成"时钟"）');
    ok(MsgCore.speechText('小财帮你瞄了一眼：🕐 巳时 吉。宜开会') === '巳时 吉。宜开会', 'speechText = 去前缀 + 剥 emoji');
    ok(MsgCore.speechText('今日运势 63 分') === '今日运势 63 分', 'speechText 保留中文+数字+标点');
    const petSrc = srcOf('src/renderer/pet.js');
    ok(!petSrc.includes('帮你瞄了一眼'), 'pet.js 不再生成"帮你瞄了一眼"前缀');
    ok(petSrc.includes('MsgCore.speechText'), 'pet.js TTS/运势口播统一走 speechText');
    ok(srcOf('src/renderer/chat.js').includes('MsgCore.speechText'), 'chat.js 兜底直连合成也走 speechText');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
