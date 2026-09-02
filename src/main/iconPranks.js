// v0.4.30 捣蛋模式-桌面图标大乱斗（Windows 专属，娱乐互动）
// ============================================================================
// 仿 TheIconBattles：萌宠在桌面图标间捣蛋 —— 吓退/叼走/拍飞/群架，图标动完恢复原位。
//
// 原理（PowerShell P/Invoke + 桌面 ListView）：
//   FindWindow("Progman") → FindWindowEx(SHELLDLL_DefView) → SysListView32
//   LVM_GETITEMCOUNT / LVM_GETITEMPOSITION / LVM_GETITEMTEXT 枚举图标
//   LVM_SETITEMPOSITION(0x100F, MAKELPARAM(x,y)) 移动图标
//
// 本文件 = 纯函数（帧序列/脚本字符串/判定）可直接 node 单测；
// Windows 实机执行入口（probe/move）标注需实机验证（本仓库在 Linux 软渲染盒上开发，
// 不做真实图标移动）。分层约定：
//   - build*Script()：纯脚本字符串生成（可单测常量与结构）
//   - plan*/buildIconAnimation：纯帧序列生成（可单测）
//   - tryIconPrank：win32 实机流程（probe 同步探测 → 判定 → 帧合成 → 异步播放）
//
// 安全：动画前记录全部图标原位置；动画末尾统一发一组"回原位"帧（恢复逻辑）。
// 自动排列探测：先试移 icon0 +10px，等 300ms 读回；被系统拉回/纹丝不动 → 判定
// 自动排列或对齐网格开启 → 不执行（判断缓存 10 分钟）。
'use strict';
const child = require('child_process');

// ---------------------------------------------------------------------------
// ListView 消息常量（LVM_ 前缀 = ListView 消息）
// ---------------------------------------------------------------------------
const LVM = {
  GETITEMCOUNT: 0x1004,    // LVM_GETITEMCOUNT
  SETITEMPOSITION: 0x100F, // LVM_SETITEMPOSITION
  GETITEMPOSITION: 0x1010, // LVM_GETITEMPOSITION
  GETITEMTEXT: 0x1073,     // LVM_GETITEMTEXT (LVM_FIRST + 115)
};
const LVIF_TEXT = 0x0001;
const MAKELPARAM_EXPR = '(($y -band 0xFFFF) -shl 16) -bor ($x -band 0xFFFF)'; // x 低16位,y 高16位
// PowerShell 脚本里使用的十六进制字面量（可读性 + 供单测断言 '0x1004' 等常量）
const LVM_HEX = {
  GETITEMCOUNT: '0x1004',
  SETITEMPOSITION: '0x100F',
  GETITEMPOSITION: '0x1010',
  GETITEMTEXT: '0x1073',
};

const AUTO_ARRANGE_CACHE_MS = 10 * 60 * 1000; // 自动排列判定缓存 10 分钟

const ICON_TEXT = {
  scare: '看招！桌面图标被小财吓得弹了一下~ 😱',
  carry: '小财叼走一个图标兜一圈又放回去，嘿嘿~ 🐾',
  whack: '图标大乱斗·拍飞！biu~ 图标自己飞了一圈~ 💥',
  battle: '看招! 图标大乱斗! 图标们自己打起来啦~ ⚔️',
};

// ---------------------------------------------------------------------------
// 纯工具
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rnd(v) { return Math.round(v); }
function toMap(icons) {
  const m = {};
  for (const ic of icons || []) m[ic.index] = { x: Math.round(ic.x || 0), y: Math.round(ic.y || 0) };
  return m;
}
function normOpts(opts) {
  const o = opts || {};
  const out = Object.assign({}, o); // 保留自定义参数（mode/count/targetIndex/amp/sourceX…）
  if (!(Number(o.intervalMs) > 0)) out.intervalMs = 25;
  if (!(Number(o.width) > 0)) out.width = 1920;
  if (!(Number(o.height) > 0)) out.height = 1080;
  if (!(Number(o.iconSize) > 0)) out.iconSize = 80;
  if (!(Number(o.durationMs) > 0)) out.durationMs = 0;
  if (typeof o.rng !== 'function') out.rng = Math.random;
  return out;
}
function stepCount(durationMs, intervalMs) {
  return Math.max(2, Math.round(durationMs / Math.max(1, intervalMs)));
}
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
// 在 n 步内以 posAt(t∈[0,1]) 采样每帧 moves（active=需发送的 index 列表）
function posFrames(n, active, posAt) {
  const frames = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = posAt(t);
    frames.push(active.map((idx) => ({ index: Number(idx), x: rnd(p[idx].x), y: rnd(p[idx].y) })));
  }
  return frames;
}
// 从一批图标里按 rng 取 count 个不重复的 index（确定性测试可注入常量 rng）
function pickIndexes(icons, count, rng) {
  const arr = (icons || []).map((ic) => ic.index);
  if (count >= arr.length) return arr;
  const keyed = arr.map((idx, i) => ({ idx, k: rng() * 1000000 + i / 1000 })); // 打破并列稳定
  keyed.sort((a, b) => a.k - b.k);
  return keyed.slice(0, count).map((x) => x.idx);
}
function interpolate(p0, p1, tt) {
  const e = easeInOut(tt);
  return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
}

// ---------------------------------------------------------------------------
// 玩法帧序列（纯函数）：全部以 icons（{index,x,y,name}）的"原位"为基准
// ---------------------------------------------------------------------------

// ① 吓退：图标从吓人源径向弹开再回弹到原位（正弦单摆，首尾=原位）
function planScare(icons, opts) {
  const o = normOpts(opts);
  const active = (icons || []).map((ic) => ic.index);
  if (!active.length) return { type: 'scare', frames: [], intervalMs: o.intervalMs, final: {}, durationMs: 0 };
  const durationMs = o.durationMs || 1500;
  const n = stepCount(durationMs, o.intervalMs);
  const cx = o.sourceX != null ? o.sourceX : o.width / 2;
  const cy = o.sourceY != null ? o.sourceY : o.height / 2;
  const per = {};
  for (const ic of icons) {
    const dx = (ic.x || 0) - cx;
    const dy = (ic.y || 0) - cy;
    const len = Math.hypot(dx, dy) || 1;
    const amp = (Number(o.amp) > 0 ? o.amp : 42) * (0.6 + 0.8 * o.rng());
    per[ic.index] = { ux: dx / len, uy: dy / len, amp };
  }
  const posAt = (t) => {
    const s = Math.sin(Math.PI * t); // 0→峰值→0
    const out = {};
    for (const ic of icons) {
      const a = per[ic.index];
      out[ic.index] = {
        x: clamp(ic.x + a.ux * a.amp * s, 0, o.width - o.iconSize),
        y: clamp(ic.y + a.uy * a.amp * s, 0, o.height - o.iconSize),
      };
    }
    return out;
  };
  return { type: 'scare', frames: posFrames(n, active, posAt), intervalMs: o.intervalMs, final: toMap(icons), durationMs };
}

// ② 叼走：选 1 个图标沿「提起 → 平移 → 放下」路径拖动
function planCarry(icons, opts) {
  const o = normOpts(opts);
  const orig = toMap(icons);
  if (!(icons || []).length) return { type: 'carry', frames: [], intervalMs: o.intervalMs, final: {}, durationMs: 0 };
  const targetIdx = o.targetIndex != null
    ? (icons.some((ic) => ic.index === o.targetIndex) ? o.targetIndex : icons[0].index)
    : icons[0].index;
  const idx = targetIdx;
  const durationMs = o.durationMs || 2600;
  const n = stepCount(durationMs, o.intervalMs);
  const P0 = orig[idx];
  const lift = Number(o.lift) > 0 ? o.lift : 70;
  const travel = Number(o.travel) > 0 ? o.travel : 150;
  const x2 = clamp(P0.x + travel, 0, o.width - o.iconSize);
  const P1 = { x: P0.x, y: clamp(P0.y - lift, 0, o.height - o.iconSize) };
  const P2 = { x: x2, y: P1.y };
  const P3 = { x: x2, y: clamp(P0.y, 0, o.height - o.iconSize) };
  const segN = Math.max(1, Math.round(n / 3));
  const frames = [];
  const keys = [{ a: P0, b: P1 }, { a: P1, b: P2 }, { a: P2, b: P3 }];
  for (let s = 0; s < 3; s++) {
    const { a, b } = keys[s];
    for (let i = 0; i < segN; i++) {
      const tt = segN === 1 ? 1 : i / (segN - 1);
      frames.push([{ index: idx, ...interpolate(a, b, tt) }]);
    }
  }
  // 补齐/截断到与原时长一致的行数，并保证末帧正好落在"放下位" P3（恢复起点可对齐）
  const trimmed = frames.slice(0, n + 1);
  while (trimmed.length < n + 1) trimmed.push([{ index: idx, x: P3.x, y: P3.y }]);
  if (trimmed.length) trimmed[trimmed.length - 1] = [{ index: idx, x: P3.x, y: P3.y }];
  return { type: 'carry', frames: trimmed, intervalMs: o.intervalMs, final: { [idx]: { x: P3.x, y: P3.y } }, durationMs };
}

// ③ 拍飞：选数个图标抛物线抛起落到附近落地（bounds 内），末帧=落地位
function planWhack(icons, opts) {
  const o = normOpts(opts);
  const orig = toMap(icons);
  const arr = icons || [];
  if (!arr.length) return { type: 'whack', frames: [], intervalMs: o.intervalMs, final: {}, durationMs: 0 };
  const count = Math.max(1, Math.min(Number(o.count) > 0 ? o.count : 3, arr.length));
  const targets = pickIndexes(arr, count, o.rng);
  const durationMs = o.durationMs || 1800;
  const n = stepCount(durationMs, o.intervalMs);
  const per = {};
  for (const idx of targets) {
    const p = orig[idx];
    const dx = (o.rng() - 0.5) * (Number(o.spread) > 0 ? o.spread : 300);
    const dy = 40 + o.rng() * (Number(o.drop) > 0 ? o.drop : 160);
    const landX = clamp(p.x + dx, 0, o.width - o.iconSize);
    const landY = clamp(p.y + dy, 0, o.height - o.iconSize);
    const apex = Number(o.apex) > 0 ? o.apex : 60 + o.rng() * 60; // 相对线性基线再上抛的高度
    per[idx] = { p, landX, landY, apex };
  }
  const posAt = (t) => {
    const out = {};
    for (const idx of targets) {
      const q = per[idx];
      const x = q.p.x + (q.landX - q.p.x) * easeInOut(t);
      const baseY = q.p.y + (q.landY - q.p.y) * t;           // 线性基线
      const arc = q.apex * 4 * t * (1 - t);                   // 0..apex..0 的弧
      out[idx] = { x, y: clamp(baseY - arc, 0, o.height - o.iconSize) };
    }
    return out;
  };
  const frames = posFrames(n, targets, posAt);
  const final = {};
  for (const idx of targets) final[idx] = { x: per[idx].landX, y: per[idx].landY };
  return { type: 'whack', frames, intervalMs: o.intervalMs, final, durationMs };
}

// ④ 群架：选 4-6 个图标互相弹性碰撞 + 随机扰动（框内不越界）
function planBattle(icons, opts) {
  const o = normOpts(opts);
  const orig = toMap(icons);
  const arr = icons || [];
  if (arr.length < 2) return { type: 'battle', frames: [], intervalMs: o.intervalMs, final: {}, durationMs: 0 };
  const want = clamp(Number(o.count) > 0 ? o.count : 5, 2, 6);
  const targets = pickIndexes(arr, Math.min(want, arr.length), o.rng);
  const durationMs = o.durationMs || 3000;
  const n = stepCount(durationMs, o.intervalMs);
  // 质心 → 初速朝中间聚（保证"打起来"）+ 随机扰动
  let cxm = 0, cym = 0;
  for (const idx of targets) { cxm += orig[idx].x; cym += orig[idx].y; }
  cxm /= targets.length; cym /= targets.length;
  const r = Math.max(16, o.iconSize * 0.35);
  const state = {};
  for (const idx of targets) {
    const p = orig[idx];
    const dx = cxm - p.x, dy = cym - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 4 + o.rng() * 4;
    state[idx] = { x: p.x, y: p.y, vx: (dx / len) * speed + (o.rng() - 0.5) * 3, vy: (dy / len) * speed + (o.rng() - 0.5) * 3 };
  }
  const maxX = Math.max(0, o.width - o.iconSize);
  const maxY = Math.max(0, o.height - o.iconSize);
  const frames = [];
  const idxs = targets.slice();
  for (let k = 0; k <= n; k++) {
    if (k > 0) {
      for (const idx of idxs) {
        const s = state[idx];
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0) { s.x = 0; s.vx = Math.abs(s.vx); }
        if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx); }
        if (s.y < 0) { s.y = 0; s.vy = Math.abs(s.vy); }
        if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy); }
        s.vx = clamp(s.vx + (o.rng() - 0.5) * 0.6, -9, 9);
        s.vy = clamp(s.vy + (o.rng() - 0.5) * 0.6, -9, 9);
      }
      // 两两弹性碰撞（简易：沿连心线交换法向分量 + 推开到不相交）
      for (let i = 0; i < idxs.length; i++) {
        for (let j = i + 1; j < idxs.length; j++) {
          const A = state[idxs[i]], B = state[idxs[j]];
          const dx = B.x - A.x, dy = B.y - A.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.0001 && d2 < (2 * r) * (2 * r)) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const overlap = (2 * r - d) / 2;
            A.x -= nx * overlap; A.y -= ny * overlap;
            B.x += nx * overlap; B.y += ny * overlap;
            // 相对法向速度 → 交换（近似弹性）
            const rvx = A.vx - B.vx, rvy = A.vy - B.vy;
            const vn = rvx * nx + rvy * ny;
            if (vn > 0) {
              A.vx -= vn * nx; A.vy -= vn * ny;
              B.vx += vn * nx; B.vy += vn * ny;
            }
          }
        }
      }
    }
    frames.push(idxs.map((idx) => {
      const s = state[idx];
      return { index: idx, x: rnd(clamp(s.x, 0, maxX)), y: rnd(clamp(s.y, 0, maxY)) };
    }));
  }
  const final = {};
  for (const idx of idxs) final[idx] = { x: state[idx].x, y: state[idx].y };
  return { type: 'battle', frames, intervalMs: o.intervalMs, final, durationMs };
}

// 恢复：从 final(动画后) 回到 orig(原位)，每图标线性回位（首=final 末=orig）
function planRestore(finalMap, origMap, opts) {
  const o = normOpts(opts);
  const durationMs = o.durationMs || 900;
  const n = stepCount(durationMs, o.intervalMs);
  const orig = origMap || {};
  const fin = finalMap || {};
  const keys = Object.keys(orig).filter((k) => fin[k] !== undefined).map(Number);
  if (!keys.length) return { frames: [], intervalMs: o.intervalMs };
  const start = {};
  for (const k of keys) start[k] = { x: fin[k].x || 0, y: fin[k].y || 0 };
  let moved = false;
  for (const k of keys) {
    if (Math.abs(start[k].x - orig[k].x) > 0.5 || Math.abs(start[k].y - orig[k].y) > 0.5) { moved = true; break; }
  }
  if (!moved) return { frames: [], intervalMs: o.intervalMs };
  const posAt = (t) => {
    const e = easeInOut(t);
    const out = {};
    for (const k of keys) out[k] = { x: start[k].x + (orig[k].x - start[k].x) * e, y: start[k].y + (orig[k].y - start[k].y) * e };
    return out;
  };
  return { frames: posFrames(n, keys, posAt), intervalMs: o.intervalMs };
}

// 组合：玩法帧 + 保持 + 恢复帧，得到最终可直接播放的完整帧序列
function buildIconAnimation(icons, opts) {
  const o = normOpts(opts);
  if (!(icons || []).length) return { ok: false, reason: 'no-icons' };
  const mode = o.mode || ['scare', 'carry', 'whack', 'battle'][Math.floor(o.rng() * 4)];
  const fn = mode === 'scare' ? planScare : mode === 'carry' ? planCarry : mode === 'whack' ? planWhack : planBattle;
  const play = fn(icons, o);
  if (!play.frames.length) return { ok: false, reason: 'no-frames' };
  const orig = toMap(icons);
  const hold = [];
  if (o.holdMs > 0) {
    const holdN = Math.max(1, Math.round(o.holdMs / play.intervalMs));
    const last = play.frames[play.frames.length - 1];
    for (let i = 0; i < holdN; i++) hold.push(last);
  }
  const rest = planRestore(play.final, orig, o);
  const frames = [].concat(play.frames, hold, rest.frames);
  return {
    ok: true,
    type: play.type,
    mode,
    text: o.text || ICON_TEXT[play.type] || '看招! 图标大乱斗!',
    frames,
    intervalMs: play.intervalMs,
    iconCount: (icons || []).length,
    movedCount: Object.keys(play.final || {}).length,
    durationMs: Math.round((play.frames.length + hold.length + rest.frames.length) * play.intervalMs),
  };
}

function platformAllowed(p) { return p === 'win32'; }

// ---------------------------------------------------------------------------
// PowerShell P/Invoke 脚本（Add-Type user32.dll）—— Windows 实机执行
// 所有常量与 MAKELPARAM 组装在此，可被单测字符串断言
// ---------------------------------------------------------------------------
function dTopClassSnippet() {
  return [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
    'public struct LVITEM { public uint mask; public int iItem; public int iSubItem; public uint state;',
    '  public uint stateMask; public IntPtr pszText; public int cchTextMax; public int iImage;',
    '  public IntPtr lParam; public int iIndent; public int iGroupId; public uint cColumns;',
    '  public IntPtr puColumns; public IntPtr piColFmt; public int iGroup; }',
    'public class DTop {',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string win);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);',
    '  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
    '}',
    '"@',
  ].join('\n');
}

function findListViewSnippet() {
  // 标准：Progman → SHELLDLL_DefView → SysListView32；找不到再搜 WorkerW 兜底
  return [
    '$hwndListView = [IntPtr]::Zero',
    '$progman = [DTop]::FindWindow("Progman", $null)',
    'if ($progman -ne [IntPtr]::Zero) {',
    '  $defView = [DTop]::FindWindowEx($progman, [IntPtr]::Zero, "SHELLDLL_DefView", $null)',
    '  if ($defView -ne [IntPtr]::Zero) { $hwndListView = [DTop]::FindWindowEx($defView, [IntPtr]::Zero, "SysListView32", $null) }',
    '}',
    'if ($hwndListView -eq [IntPtr]::Zero) {',
    '  # WorkerW 兜底（Progman 常被桌面壁纸占用时列表在 WorkerW 下）',
    '  $shell = [DTop]::FindWindowEx([IntPtr]::Zero, [IntPtr]::Zero, "SHELLDLL_DefView", $null)',
    '  if ($shell -ne [IntPtr]::Zero) { $hwndListView = [DTop]::FindWindowEx($shell, [IntPtr]::Zero, "SysListView32", $null) }',
    '}',
    'if ($hwndListView -eq [IntPtr]::Zero) { [Console]::Out.WriteLine("{`"ok`":false,`"error`":`"no-listview`"}"); exit 1 }',
  ].join('\n');
}

// 移动图标：单条命令片段（x 低16位 y 高16位 → MAKELPARAM）
function lvmSetPosCmd(listVar, indexVar, xVar, yVar) {
  return `[DTop]::SendMessage(${listVar}, ${LVM_HEX.SETITEMPOSITION}, [IntPtr]${indexVar}, [IntPtr](((${yVar} -band 0xFFFF) -shl 16) -bor (${xVar} -band 0xFFFF))) | Out-Null`;
}

// 枚举桌面图标脚本：输出 JSON {"ok":true,"count":N,"icons":[{index,x,y,name}...]}
function buildEnumScript() {
  const readOne = [
    'function Read-DeskIcon($index) {',
    '  $hb = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(8)',
    '  try {',
    '    [DTop]::SendMessage($hwndListView, ' + LVM_HEX.GETITEMPOSITION + ', [IntPtr]$index, $hb) | Out-Null',
    '    $x = [System.Runtime.InteropServices.Marshal]::ReadInt32($hb, 0)',
    '    $y = [System.Runtime.InteropServices.Marshal]::ReadInt32($hb, 4)',
    '    $name = ""',
    '    $ht = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(512)',
    '    $hItem = [System.Runtime.InteropServices.Marshal]::AllocHGlobal([System.Runtime.InteropServices.Marshal]::SizeOf([LVITEM]))',
    '    try {',
    '      $item = New-Object LVITEM',
    '      $item.mask = ' + LVIF_TEXT,
    '      $item.iItem = $index; $item.iSubItem = 0',
    '      $item.cchTextMax = 256; $item.pszText = $ht',
    '      [System.Runtime.InteropServices.Marshal]::StructureToPtr($item, $hItem, $false) | Out-Null',
    '      [DTop]::SendMessage($hwndListView, ' + LVM_HEX.GETITEMTEXT + ', [IntPtr]$index, $hItem) | Out-Null',
    '      $name = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($ht)',
    '    } finally {',
    '      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ht)',
    '      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($hItem)',
    '    }',
    '    if ($x -eq $null) { $x = 0 }; if ($y -eq $null) { $y = 0 }',
    '    return @{ index = $index; x = $x; y = $y; name = [string]$name }',
    '  } finally {',
    '    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($hb)',
    '  }',
    '}',
  ].join('\n');
  return [
    dTopClassSnippet(),
    findListViewSnippet(),
    readOne,
    '$count = [DTop]::SendMessage($hwndListView, ' + LVM_HEX.GETITEMCOUNT + ', [IntPtr]::Zero, [IntPtr]::Zero).ToInt64()',
    '$icons = @()',
    'for ($i = 0; $i -lt $count; $i++) { $icons += Read-DeskIcon $i }',
    '$obj = @{ ok = $true; count = $count; icons = $icons }',
    '[Console]::Out.WriteLine($obj | ConvertTo-Json -Compress -Depth 5)',
  ].join('\n');
}

// 探测脚本：先枚举全量图标原位，再试移 icon0 +10px，等 300ms 读回 → 输出
//   {"ok":true,"count":N,"icons":[...], "icon0":{"index":0,"pre":{"x","y"},"moved":{"x","y"},"after":{"x","y"}}}
function buildProbeScript() {
  return [
    dTopClassSnippet(),
    findListViewSnippet(),
    'function Read-At($index) {',
    '  $hb = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(8)',
    '  try {',
    '    [DTop]::SendMessage($hwndListView, ' + LVM_HEX.GETITEMPOSITION + ', [IntPtr]$index, $hb) | Out-Null',
    '    return @{ x = [System.Runtime.InteropServices.Marshal]::ReadInt32($hb, 0); y = [System.Runtime.InteropServices.Marshal]::ReadInt32($hb, 4) }',
    '  } finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($hb) }',
    '}',
    '$count = [DTop]::SendMessage($hwndListView, ' + LVM_HEX.GETITEMCOUNT + ', [IntPtr]::Zero, [IntPtr]::Zero).ToInt64()',
    'if ($count -le 0) { [Console]::Out.WriteLine("{`"ok`":false,`"error`":`"no-icons`"}"); exit 1 }',
    '$icons = @()',
    'for ($i = 0; $i -lt $count; $i++) { $icons += @{ index = $i; x = (Read-At $i).x; y = (Read-At $i).y; name = "" } }',
    '$pre = Read-At 0',
    '$moved = @{ x = $pre.x + 10; y = $pre.y }',
    '[DTop]::SendMessage($hwndListView, ' + LVM_HEX.SETITEMPOSITION + ', [IntPtr]0, [IntPtr]((($moved.y -band 0xFFFF) -shl 16) -bor ($moved.x -band 0xFFFF))) | Out-Null',
    'Start-Sleep -Milliseconds 300',
    '$after = Read-At 0',
    '$out = @{ ok = $true; count = $count; icons = $icons; icon0 = @{ index = 0; pre = $pre; moved = $moved; after = $after } }',
    '[Console]::Out.WriteLine($out | ConvertTo-Json -Compress -Depth 5)',
  ].join('\n');
}

// 播放脚本：把完整帧序列（frames 二维数组，元素={index,x,y}）逐帧逐图标 LVM_SETITEMPOSITION
function buildMoveScript(frames, opts) {
  const intervalMs = opts && opts.intervalMs ? opts.intervalMs : 25;
  const json = JSON.stringify(frames || []);
  const psJson = json.replace(/'/g, "''"); // 单引号转义（用 here-string 避免 JSON 引号地狱）
  return [
    dTopClassSnippet(),
    findListViewSnippet(),
    `$framesJson = @'\n${psJson}\n'@`,
    '$frames = $framesJson | ConvertFrom-Json',
    'foreach ($frame in $frames) {',
    '  foreach ($mv in $frame) {',
    `    ${lvmSetPosCmd('$hwndListView', '$mv.index', '$mv.x', '$mv.y')}`,
    '  }',
    `  Start-Sleep -Milliseconds ${intervalMs}`,
    '}',
  ].join('\n');
}

// 解析枚举输出（纯）
function parseEnumOutput(text) {
  try {
    const obj = JSON.parse(String(text || '').trim());
    if (!obj || obj.ok !== true) return { ok: false, error: (obj && obj.error) || 'bad-json' };
    const icons = Array.isArray(obj.icons) ? obj.icons.map((ic) => ({
      index: Number(ic.index), x: Math.round(Number(ic.x) || 0), y: Math.round(Number(ic.y) || 0), name: String(ic.name || ''),
    })).filter((ic) => Number.isFinite(ic.index)) : [];
    return { ok: true, count: icons.length, icons };
  } catch (e) {
    return { ok: false, error: 'bad-json' };
  }
}

// 解析探测输出（纯）
function parseProbeOutput(text) {
  try {
    const obj = JSON.parse(String(text || '').trim());
    if (!obj || obj.ok !== true) return { ok: false, error: (obj && obj.error) || 'bad-json' };
    const icons = Array.isArray(obj.icons) ? obj.icons.map((ic) => ({
      index: Number(ic.index), x: Math.round(Number(ic.x) || 0), y: Math.round(Number(ic.y) || 0), name: String(ic.name || ''),
    })).filter((ic) => Number.isFinite(ic.index)) : [];
    const i0 = obj.icon0 || {};
    return {
      ok: true,
      count: icons.length,
      icons,
      icon0: {
        index: Number(i0.index || 0),
        pre: i0.pre ? { x: Math.round(Number(i0.pre.x) || 0), y: Math.round(Number(i0.pre.y) || 0) } : null,
        moved: i0.moved ? { x: Math.round(Number(i0.moved.x) || 0), y: Math.round(Number(i0.moved.y) || 0) } : null,
        after: i0.after ? { x: Math.round(Number(i0.after.x) || 0), y: Math.round(Number(i0.after.y) || 0) } : null,
      },
    };
  } catch (e) {
    return { ok: false, error: 'bad-json' };
  }
}

// 自动排列/对齐网格判定（纯）：
//   试移后读回 == 试移位（tolerance 内）→ 图标能挪，未开启自动排列（autoArrange=false）
//   读回被拉回/纹丝不动 → autoArrange=true（系统接管位置，禁止动画）
function detectAutoArrange({ pre, setPos, readPos, tolerance }) {
  const tol = Number.isFinite(tolerance) ? tolerance : 4;
  if (!pre || !setPos || !readPos) return { autoArrange: true, reason: 'no-data' };
  const movedOK = Math.abs(readPos.x - setPos.x) <= tol && Math.abs(readPos.y - setPos.y) <= tol;
  return { autoArrange: !movedOK, reason: movedOK ? 'ok' : 'pulled-back' };
}

// ---------------------------------------------------------------------------
// Windows 实机执行（同步探测 + 异步播放）—— 仅 win32 调用
// ---------------------------------------------------------------------------
let autoCache = { disabled: false, at: 0 };

function psExecSync(script, timeoutMs) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return child.execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
    { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

function cacheHit(now) {
  return autoCache.disabled && (now - autoCache.at) < AUTO_ARRANGE_CACHE_MS;
}

// 完整 Windows 流程：探测 → 判定自动排列 → 挑玩法 → 帧合成 → 异步播放。
// 返回 { ok, type, text } 或 { ok:false, reason }（reason 见设计：platform/autoArrange/no-icons/exec/no-frames）
function tryIconPrank(deps = {}) {
  const platform = deps.platform || process.platform;
  const log = typeof deps.log === 'function' ? deps.log : (() => {});
  if (!platformAllowed(platform)) {
    log('[prank] 桌面图标大乱斗仅支持 Windows，当前平台 ' + platform + '，跳过');
    return { ok: false, reason: 'platform' };
  }
  const now = deps.now != null ? deps.now : Date.now();
  if (cacheHit(now)) return { ok: false, reason: 'autoArrange' };

  // 1) 同步探测（枚举全量 + icon0 试移读回）
  let probe;
  try {
    const out = psExecSync(buildProbeScript(), 8000);
    probe = parseProbeOutput(out);
  } catch (e) {
    log('[prank] icon probe failed: ' + (e && e.message));
    return { ok: false, reason: 'exec' };
  }
  if (!probe.ok) return { ok: false, reason: probe.error || 'probe' };
  if (!probe.icons || !probe.icons.length || !probe.icon0 || !probe.icon0.pre) return { ok: false, reason: 'no-icons' };

  // 2) 自动排列判定（读回被拉回/纹丝不动 → 禁用并缓存 10 分钟）
  const dec = detectAutoArrange({ pre: probe.icon0.pre, setPos: probe.icon0.moved, readPos: probe.icon0.after });
  if (dec.autoArrange) {
    autoCache = { disabled: true, at: now };
    log('[prank] 桌面图标为自动排列/对齐网格，禁用图标大乱斗');
    return { ok: false, reason: 'autoArrange' };
  }
  autoCache = { disabled: false, at: 0 }; // 可移动 → 不缓存禁用

  // 3) 挑玩法 → 帧合成（玩法帧+保持+恢复帧）
  const opts = Object.assign({}, deps.animOpts || {}, { intervalMs: deps.intervalMs || 25 });
  const anim = buildIconAnimation(probe.icons, opts);
  if (!anim.ok || !anim.frames.length) return { ok: false, reason: anim.reason || 'no-frames' };

  // 4) 异步播放（超时由 execFile 自动 kill，兜底 40s）
  try {
    const script = buildMoveScript(anim.frames, { intervalMs: anim.intervalMs });
    const childProc = child.execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { timeout: Math.max(30000, anim.durationMs + 10000), windowsHide: true }, // 超时 30s kill（动画最长 ~6s，留足余量）
      (err) => { if (err && log) log('[prank] icon anim exec: ' + (err && err.message)); });
    if (childProc) childProc.unref();
  } catch (e) {
    log('[prank] icon anim spawn failed: ' + (e && e.message));
    return { ok: false, reason: 'exec' };
  }
  return { ok: true, type: anim.type, mode: anim.mode, text: anim.text, iconCount: anim.iconCount, movedCount: anim.movedCount };
}

// 测试钩子：重置自动排列缓存 & 注入 powershell 执行器
function __reset() { autoCache = { disabled: false, at: 0 }; }
function __setAutoCache(disabled, at) { autoCache = { disabled: !!disabled, at: Number(at) || 0 }; }
function __getAutoCache() { return Object.assign({}, autoCache); }

module.exports = {
  LVM,
  LVIF_TEXT,
  MAKELPARAM_EXPR,
  ICON_TEXT,
  platformAllowed,
  // 纯帧序列
  planScare,
  planCarry,
  planWhack,
  planBattle,
  planRestore,
  buildIconAnimation,
  // 判定/解析
  detectAutoArrange,
  parseEnumOutput,
  parseProbeOutput,
  // 脚本字符串
  dTopClassSnippet,
  findListViewSnippet,
  buildEnumScript,
  buildProbeScript,
  buildMoveScript,
  // Windows 执行入口
  tryIconPrank,
  AUTO_ARRANGE_CACHE_MS,
  __reset,
  __setAutoCache,
  __getAutoCache,
};
