// v0.4.30 单元测试（node 直接跑，不启动 GUI；真实桌面图标动画需 Windows 实机验证）
// 覆盖：① PowerShell 枚举/探测/移动脚本含正确 API 常量与 MAKELPARAM
//       ② 4 玩法帧序列生成：吓退(弹回原位)、叼走(仅目标图标拖动路径)、
//          拍飞(抛物线不越界)、群架(弹性碰撞不越界)
//       ③ 恢复逻辑 = 回到记录原位（planRestore & 合成动画末帧=原位）
//       ④ 自动排列探测判定（拉回→禁用 / 纹丝不动→禁用 / 可移动→放行）
//       ⑤ win32 条件与降级（platform/autoArrange 缓存/无 powershell exec 降级）
'use strict';

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ FAIL: ' + name); }
}

(async () => {
  const fs = require('fs');
  const path = require('path');
  const t = require('./src/main/iconPranks.js');

  const W = 400, H = 300, IC = 80;
  const MAX_X = W - IC, MAX_Y = H - IC;
  const rng = () => 0.5; // 确定性
  const icons = [0, 1, 2, 3, 4, 5].map((i) => ({
    index: i,
    x: 20 + (i % 3) * 110,
    y: 20 + Math.floor(i / 3) * 120,
    name: '图标' + i,
  }));
  const orig = {}; icons.forEach((i) => { orig[i.index] = { x: i.x, y: i.y }; });
  const opts = { intervalMs: 25, width: W, height: H, iconSize: IC, rng };
  const inBounds = (frames) => frames.every((fl) => fl.every((mv) =>
    mv.x >= 0 && mv.x <= MAX_X && mv.y >= 0 && mv.y <= MAX_Y));
  const frameMap = (fl) => { const m = {}; fl.forEach((mv) => { m[mv.index] = { x: mv.x, y: mv.y }; }); return m; };

  console.log('== 1. PowerShell 脚本含正确常量（0x1004/100F/1010/1073 + MAKELPARAM + 句柄链）==');
  {
    const enumS = t.buildEnumScript();
    ok(enumS.includes('0x1004'), '枚举脚本含 LVM_GETITEMCOUNT 0x1004');
    ok(enumS.includes('0x1010'), '枚举脚本含 LVM_GETITEMPOSITION 0x1010');
    ok(enumS.includes('0x1073'), '枚举脚本含 LVM_GETITEMTEXT 0x1073');
    ok(enumS.includes('Progman') && enumS.includes('SHELLDLL_DefView') && enumS.includes('SysListView32'), '枚举脚本含 Progman→SHELLDLL_DefView→SysListView32 句柄链');
    ok(enumS.includes('FindWindowEx') && enumS.includes('Add-Type'), '含 FindWindowEx 与 Add-Type(P/Invoke user32)');
    ok(enumS.includes('ConvertTo-Json'), '枚举输出转 JSON');

    const probeS = t.buildProbeScript();
    ok(probeS.includes('0x100F'), '探测脚本含 LVM_SETITEMPOSITION 0x100F');
    ok(probeS.includes('Start-Sleep -Milliseconds 300'), '探测含 300ms 等待');
    ok(probeS.includes('icon0') && probeS.includes('pre') && probeS.includes('moved') && probeS.includes('after'), '探测输出含 pre/moved/after 结构');

    const moveS = t.buildMoveScript([[{ index: 0, x: 10, y: 20 }]], { intervalMs: 30 });
    ok(moveS.includes('0x100F') && moveS.includes('-shl 16') && moveS.includes('-band 0xFFFF'), '移动脚本含 SETITEMPOSITION + MAKELPARAM(高16位 y / 低16位 x)');
    ok(moveS.includes('Start-Sleep -Milliseconds 30') && moveS.includes('ConvertFrom-Json'), '移动脚本逐帧循环 + 间隔');
    ok(t.MAKELPARAM_EXPR.includes('-shl 16') && t.LVM.SETITEMPOSITION === 0x100F, 'MAKELPARAM_EXPR 常量正确');
    ok(fs.readFileSync(path.join(__dirname, 'src/main/prank.js'), 'utf8').includes("mode: 'icons'"), 'prank.js 已接 icons 玩法');
  }

  console.log('== 2. 4 玩法帧序列 ==');
  {
    // 吓退：正弦弹开并回到原位
    const scare = t.planScare(icons, opts);
    ok(scare.frames.length >= 3, 'scare 有帧序列');
    ok(inBounds(scare.frames), 'scare 全程不越界');
    const first0 = frameMap(scare.frames[0])[0], last0 = frameMap(scare.frames[scare.frames.length - 1])[0];
    ok(first0.x === icons[0].x && first0.y === icons[0].y, 'scare 首帧=原位');
    ok(last0.x === icons[0].x && last0.y === icons[0].y, 'scare 末帧=原位（吓退后回弹）');
    const dev = scare.frames.some((fl) => fl.some((mv) => Math.abs(mv.x - orig[mv.index].x) + Math.abs(mv.y - orig[mv.index].y) > 2));
    ok(dev, 'scare 中间帧确有位移（弹开）');

    // 叼走：仅目标图标沿提起→平移→放下
    const carry = t.planCarry(icons, Object.assign({}, opts, { targetIndex: 2, travel: 150 }));
    const movedIds = new Set();
    carry.frames.forEach((fl) => fl.forEach((mv) => movedIds.add(mv.index)));
    ok(movedIds.size === 1 && movedIds.has(2), 'carry 只移动目标图标 index=2');
    ok(inBounds(carry.frames), 'carry 全程不越界');
    const end = frameMap(carry.frames[carry.frames.length - 1])[2];
    ok(end.x !== icons[2].x || end.y !== icons[2].y, 'carry 把图标叼到新位置（放下≠原位）');
    ok(end.x === carry.final[2].x && end.y === carry.final[2].y, 'carry 末帧=final 放下位');
    // 中途帧呈"提起"路径：存在 y < orig.y（lifted）
    const lifted = carry.frames.some((fl) => fl[0] && fl[0].y < icons[2].y - 2);
    ok(lifted, 'carry 路径含提起(更高)阶段');

    // 拍飞：抛物线不越界，末帧=落地位(≠原位)
    const whack = t.planWhack(icons, Object.assign({}, opts, { count: 3 }));
    ok(whack.frames.length >= 3 && inBounds(whack.frames), 'whack 有帧且全程不越界');
    const lastMap = frameMap(whack.frames[whack.frames.length - 1]);
    const differ = Object.keys(whack.final).some((k) => lastMap[k].x !== orig[k].x || lastMap[k].y !== orig[k].y);
    ok(differ, 'whack 落地≠原位（被拍飞）');
    ok(Object.keys(whack.final).length === 3 && Object.values(whack.final).every((p) => p.x <= MAX_X && p.y <= MAX_Y), 'whack 选 3 个且落地位越界前已收敛');

    // 群架：选 4-6，全程不越界
    const battle = t.planBattle(icons, Object.assign({}, opts, { count: 4 }));
    ok(battle.frames.length >= 3 && inBounds(battle.frames), 'battle 有帧且全程不越界（群架碰撞）');
    ok(Object.keys(battle.final).length === 4, 'battle 恰好动 4 个图标');
  }

  console.log('== 3. 恢复逻辑 = 回到记录原位 ==');
  {
    const whack = t.planWhack(icons, Object.assign({}, opts, { count: 3 }));
    const rest = t.planRestore(whack.final, orig, Object.assign({}, opts, { durationMs: 300 }));
    ok(rest.frames.length >= 2, 'restore 有帧序列');
    const lastMap = frameMap(rest.frames[rest.frames.length - 1]);
    const backOk = Object.keys(whack.final).every((k) => lastMap[Number(k)] && lastMap[Number(k)].x === orig[k].x && lastMap[Number(k)].y === orig[k].y);
    ok(backOk, 'restore 末帧回到被移图标原位');
    // 未参与动画的图标不在 restore 帧里（不会误动）
    const ids = new Set();
    rest.frames.forEach((fl) => fl.forEach((mv) => ids.add(mv.index)));
    ok([...ids].every((id) => whack.final[id] !== undefined), 'restore 只恢复被移动过的图标');

    // 合成动画：玩法帧 + 保持 + 恢复帧，最终整帧 == 全部原位
    const anim = t.buildIconAnimation(icons, Object.assign({}, opts, { mode: 'whack', count: 3 }));
    ok(anim.ok && anim.frames.length > 0 && anim.movedCount === 3, 'buildIconAnimation 合成完整帧序列');
    const animLast = frameMap(anim.frames[anim.frames.length - 1]);
    const fullBack = Object.keys(animLast).every((k) => animLast[k].x === orig[k].x && animLast[k].y === orig[k].y);
    ok(fullBack, '合成动画末帧=全部原位（含恢复段）');
  }

  console.log('== 4. 自动排列/对齐网格判定 ==');
  {
    const pulled = t.detectAutoArrange({ pre: { x: 10, y: 10 }, setPos: { x: 20, y: 10 }, readPos: { x: 11, y: 10 } });
    ok(pulled.autoArrange === true, '试移后读回被拉回(≈原位) → autoArrange=true');
    const still = t.detectAutoArrange({ pre: { x: 10, y: 10 }, setPos: { x: 20, y: 10 }, readPos: { x: 10, y: 10 } });
    ok(still.autoArrange === true, '纹丝不动(读回=原位) → autoArrange=true（移动无效也禁用）');
    const moved = t.detectAutoArrange({ pre: { x: 10, y: 10 }, setPos: { x: 20, y: 10 }, readPos: { x: 20, y: 10 } });
    ok(moved.autoArrange === false && moved.reason === 'ok', '读回=试移位 → 可移动 autoArrange=false');
    ok(t.detectAutoArrange({ readPos: null }).autoArrange === true, '缺数据 → 保守判定 autoArrange=true');
  }

  console.log('== 5. win32 条件与降级 ==');
  {
    ok(t.platformAllowed('win32') === true && t.platformAllowed('linux') === false && t.platformAllowed('darwin') === false, 'platformAllowed 仅 win32');
    const linux = t.tryIconPrank({ platform: 'linux', log: () => {} });
    ok(linux.ok === false && linux.reason === 'platform', '非 win32 → {ok:false, reason:platform}（不执行）');

    // 自动排列缓存（10 分钟）：命中直接禁用，无需 exec
    t.__reset();
    const now = Date.now();
    t.__setAutoCache(true, now);
    const cached = t.tryIconPrank({ platform: 'win32', log: () => {}, now });
    ok(cached.ok === false && cached.reason === 'autoArrange', '自动排列缓存命中 → reason=autoArrange');
    // 缓存过期（>10min）→ 不再命中，进入实机探测；Linux 无 powershell.exe → 优雅降级 exec
    t.__setAutoCache(true, now - 11 * 60 * 1000);
    const expired = t.tryIconPrank({ platform: 'win32', log: () => {}, now });
    ok(expired.ok === false && expired.reason === 'exec', '缓存过期且无 powershell → 优雅降级 reason=exec');
    t.__reset();

    // parse 探测/枚举 JSON（契约）
    const probe = t.parseProbeOutput(JSON.stringify({
      ok: true, count: 2,
      icons: [{ index: 0, x: 10, y: 20, name: 'A' }, { index: 1, x: 99, y: 88, name: 'B' }],
      icon0: { index: 0, pre: { x: 10, y: 20 }, moved: { x: 20, y: 20 }, after: { x: 20, y: 20 } },
    }));
    ok(probe.ok && probe.icons.length === 2 && probe.icon0.after.x === 20, 'parseProbeOutput 解析探测结果');
    ok(t.parseProbeOutput('not json').ok === false, '坏 JSON → ok:false（降级安全）');
  }

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试执行异常:', e); process.exit(1); });
