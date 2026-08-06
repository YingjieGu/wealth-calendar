// 活跃窗口信息获取（平台适配，公共模块）
// 供捣蛋模式(prank)与伙伴模式(partner)复用。
// 获取失败 / 平台工具缺失时一律返回 null，由调用方降级。
const { execFileSync } = require('child_process');

// --- 活跃窗口标题 ---
function getActiveWindowTitle() {
  try {
    if (process.platform === 'win32') {
      const script = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        'using System.Text;',
        'public class WcWinTitle {',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
        '}',
        '"@',
        '$h = [WcWinTitle]::GetForegroundWindow()',
        '$sb = New-Object System.Text.StringBuilder 512',
        '[WcWinTitle]::GetWindowText($h, $sb, $sb.Capacity) | Out-Null',
        '$sb.ToString()',
      ].join('\n');
      const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 4000 });
      const t = String(out).trim();
      return t ? t : null;
    }
    if (process.platform === 'linux') {
      try {
        const out = execFileSync('xdotool', ['getactivewindow', 'getwindowname'], { encoding: 'utf8', timeout: 3000 });
        const t = String(out).trim();
        return t ? t : null;
      } catch (e) {
        return null; // xdotool 不可用 → 无法获取标题
      }
    }
    // darwin / 其他平台暂不实现
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { getActiveWindowTitle };
