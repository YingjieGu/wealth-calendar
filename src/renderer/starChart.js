// v0.4.22 SVG 星盘生成（纯函数，Node/浏览器双模式）
// 浏览器：<script src="starChart.js"> 挂 window.StarChart；Node：require('./starChart.js')
// 软渲染安全：输出纯 SVG 字符串（矢量，Skia CPU 渲染），不碰 canvas/位图。
// 本命盘绘制约定：上升点(ASC) 固定在左侧(180°)，黄经从 ASC 逆时针排（第 1 宫起于 ASC，每 30° 一宫）；
// 行星/宫位/星座按「黄经差 = 画布角度差」映射，相对位置自洽。
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.StarChart = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CX = 180, CY = 180;            // 盘心
  const R_OUTER = 148;                 // 外圈（12 宫边界）
  const R_SIGN = 132;                  // 星座名环
  const R_INNER = 118;                 // 内圈（宫位线内端）
  const R_PLANET = 96;                 // 行星环

  // 12 星座（中文/符号，与 sidecar lon_to_zodiac 的 ZODIAC_SIGNS 顺序一致：白羊起 30° 一宫）
  const ZODIAC_SIGNS = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座',
    '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];
  const ZODIAC_SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  // 行星中文名（key 兼容小写/大写首字母两种来源）
  const PLANET_LABELS = {
    sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
    jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星',
  };

  // 黄经 → 画布角度：ASC 固定左侧 180°，黄经差直接叠加（ascLon 缺失时以 0° 为基准）
  function _lonToCanvasDeg(lon, ascLon) {
    const base = (typeof ascLon === 'number' && isFinite(ascLon)) ? ascLon : 0;
    const d = 180 + ((Number(lon) || 0) - base);
    return ((d % 360) + 360) % 360;
  }
  // 画布角度 → 圆上坐标（SVG y 轴向下：deg=0 右 / 90 下 / 180 左 / 270 上，视觉上角度增大为逆时针）
  function _pt(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: CX + r * Math.cos(rad),
      y: CY + r * Math.sin(rad),
    };
  }
  function _num(v) {
    const n = Number(v);
    return (isFinite(n) ? n : 0).toFixed(1);
  }

  // 行星中文名：优先后端 planetLabel，其次内置表（兼容 key 大小写），兜底原始 key
  function _planetLabel(key, p) {
    if (p && p.planetLabel) return String(p.planetLabel);
    return PLANET_LABELS[String(key || '').toLowerCase()] || String(key || '');
  }

  // 生成纯 SVG 字符串。chartData = sidecar /chart/natal 的 data（或整个响应，内部容错取 data）
  function buildNatalChartSVG(chartData) {
    const d = (chartData && chartData.data && !chartData.error) ? chartData.data : (chartData || {});
    const planets = (d && d.planets) || {};
    const asc = (d && d.ascendant) || null;
    const mc = (d && d.midheaven) || null;
    const ascLon = (asc && typeof asc.longitude === 'number') ? asc.longitude : 0;
    const entries = Object.entries(planets).filter(([, p]) => p && typeof p.longitude === 'number');

    const parts = [];
    parts.push('<svg class="star-chart-svg" viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="本命星盘">');
    // 外圈 + 内圈
    parts.push(`<circle class="star-chart-outer" cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="none"/>`);
    parts.push(`<circle class="star-chart-inner" cx="${CX}" cy="${CY}" r="${R_INNER}" fill="none"/>`);
    // 12 宫分界线：从内圈到外圈，第 k 宫起于 ASC+30°*(k-1)
    for (let k = 0; k < 12; k++) {
      const deg = _lonToCanvasDeg(ascLon + k * 30, ascLon);
      const a = _pt(deg, R_INNER);
      const b = _pt(deg, R_OUTER);
      parts.push(`<line class="star-chart-cusp" x1="${_num(a.x)}" y1="${_num(a.y)}" x2="${_num(b.x)}" y2="${_num(b.y)}"/>`);
    }
    // 12 星座标注（每星座黄经 m*30 起，取中点放置名字 + 符号）
    for (let m = 0; m < 12; m++) {
      const deg = _lonToCanvasDeg(ascLon + m * 30 + 15, ascLon);
      const p = _pt(deg, R_SIGN);
      parts.push(`<text class="star-chart-sign" x="${_num(p.x)}" y="${_num(p.y)}" text-anchor="middle">${ZODIAC_SIGNS[m]}</text>`);
      const s = _pt(deg, R_OUTER - 9);
      parts.push(`<text class="star-chart-symbol" x="${_num(s.x)}" y="${_num(s.y)}" text-anchor="middle">${ZODIAC_SYMBOLS[m]}</text>`);
    }
    // ASC / MC 轴线（从中心到外圈）
    const ascPt = _pt(180, R_OUTER);
    parts.push(`<line class="star-chart-axis asc" x1="${CX}" y1="${CY}" x2="${_num(ascPt.x)}" y2="${_num(ascPt.y)}"/>`);
    parts.push(`<text class="star-chart-axis-label asc" x="${_num(ascPt.x - 14)}" y="${_num(ascPt.y - 4)}">ASC</text>`);
    if (mc && typeof mc.longitude === 'number') {
      const mcDeg = _lonToCanvasDeg(mc.longitude, ascLon);
      const mcPt = _pt(mcDeg, R_OUTER);
      parts.push(`<line class="star-chart-axis mc" x1="${CX}" y1="${CY}" x2="${_num(mcPt.x)}" y2="${_num(mcPt.y)}"/>`);
      parts.push(`<text class="star-chart-axis-label mc" x="${_num(mcPt.x + 4)}" y="${_num(mcPt.y - 4)}">MC</text>`);
    }
    // 行星点：按 longitude 映射到行星环，标注中文名
    for (const [key, p] of entries) {
      const deg = _lonToCanvasDeg(p.longitude, ascLon);
      const pt = _pt(deg, R_PLANET);
      const label = _planetLabel(key, p);
      parts.push(`<circle class="star-chart-planet" cx="${_num(pt.x)}" cy="${_num(pt.y)}" r="3.5"/>`);
      const off = _pt(deg, R_PLANET - 16); // 标签内移一格避免叠在行星环
      parts.push(`<text class="star-chart-planet-label" x="${_num(off.x)}" y="${_num(off.y)}" text-anchor="middle">${label}</text>`);
    }
    // 中心标题
    parts.push(`<text class="star-chart-title" x="${CX}" y="${CY + 4}" text-anchor="middle">本命星盘</text>`);
    parts.push('</svg>');
    return parts.join('');
  }

  return {
    ZODIAC_SIGNS,
    ZODIAC_SYMBOLS,
    PLANET_LABELS,
    buildNatalChartSVG,
    _lonToCanvasDeg,
    _pt,
  };
});
