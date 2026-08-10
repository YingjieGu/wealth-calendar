# HANDOVER — v0.4.26 doodle 主题配色重调（用户指定双方案色板）

## 本次任务（v0.4.26，用户反馈：v0.4.25 多巴胺重设计后"依然还是太难看了"，用户亲自指定两个配色方案参考）

**核心判断**：v0.4.25 用了 StyleKit 的荧光粉 #ff006e + 亮紫 #8338ec，饱和度过高、刺眼，用户不满意。用户现在**亲自给出两个配色方案**作为参考，要求重调配色。这两个方案的气质：
- **方案一**（#f58e3d 橙 / #6dfe59 亮绿 / #ffe800 亮黄）——明快活力的暖色多巴胺
- **方案二**（#fba2ae 粉 / #79def7 浅蓝 / #baf1b3 浅绿）——柔和可爱的马卡龙系

**配色策略（融合双方案）**：
- **大面积/背景/卡片**：走方案二柔和系——浅粉底（#fba2ae 淡化为背景如 #fff0f3 或低透明度 #fba2ae33）、浅蓝 #79def7、浅绿 #baf1b3 用于卡片/分区底色与边框
- **强调/按钮/标签/主色**：走方案一活力系——橙 #f58e3d、亮绿 #6dfe59、亮黄 #ffe800 用于按钮、运势高亮、贴纸、装饰
- 全主题**禁止再出现** v0.4.25 的荧光粉 #ff006e、亮紫 #8338ec、宝蓝 #3a86ff、湖水绿 #06d6a0（替换为新色板）
- 文字：深色（如 #2d2a26 暖黑或 #1a1a2e）保证对比度；亮黄底配深字、橙底配白字或深字按对比度取舍
- 保留：手绘不对称边框、贴纸微旋转、站酷快乐体、孟菲斯波点/波普符号（SVG/CSS 安全）、彩色硬阴影（换成新色板色系）

**可选微调**（设计师自主判断，保持可爱协调）：两方案色可按组件职责分配（如运势 7 维度：财运→亮黄 #ffe800、桃花→粉 #fba2ae、事业→橙 #f58e3d、学业→浅蓝 #79def7、健康→亮绿 #6dfe59、出行→橙、签约→浅绿），保证 6 色都用上、撞色协调不杂乱。

**硬约束（不变）**：零 filter（仅保留既有 backdrop-filter）；动画只用 transform/opacity；SVG/CSS 安全；dark/light/teal 三主题回归无损；doodle 独立 body class；显式覆盖派生变量勿依赖 var() 级联；字体复用站酷快乐体；测试前备份 settings.json 测后恢复；不跑 GUI 启动测试（node --check + 单元测试即可，**截图验证由 Hermes 负责**）；中文 commit；bump 0.4.26；**本轮开发完由 Hermes 打包 exe**（用户已要求）。

**验证**：node --check 全过；单元测试（v026-test.js 或扩展 v025-test.js）——① doodle 色板断言：含用户 6 色中至少 5 个（f58e3d/6dfe59/ffe800/fba2ae/79def7/baf1b3），**且不含** ff006e/8338ec/3a86ff/06d6a0（旧多巴胺色已清除）② 彩色阴影用新色板色系 ③ 背景非旧米黄 #fdf6e3 ④ stripEmoji 不回归（v024 22 项）⑤ v025 测试中与色板无关的项回归通过；bump 0.4.26 + 中文 commit；不打包 exe（Hermes 打包）。

---

# HANDOVER — v0.4.25 doodle 主题全面重设计（多巴胺高饱和撞色风格）（已完成，归档）

## 本次任务（v0.4.25，用户反馈：v0.4.24 后"依然还是太丑了，颜色一点都没多巴胺，参考行业手绘涂鸦设计重新设计"，已完成）

**核心判断**：v0.4.23/0.4.24 的 doodle 用的是**低饱和柔和蜡笔色**（#6a9fd8 蜡笔蓝、#e98a8a 蜡笔红）+ 大面积米黄纸底，视觉素净平淡——这是用户说"不丑但没多巴胺"的根因。**行业多巴胺设计（Dopamine Design / Dopamine Decor，2025-2026 年度设计趋势）的核心理念是高饱和、高明度、大胆撞色（Color Blocking）、彩色阴影、孟菲斯几何与波普符号**。本轮把 doodle 主题**全面重设计**为「高饱和多巴胺 × 手绘涂鸦」融合风格：保留手绘质感（不对称边框/微旋转/手写字体/贴纸感），配色与装饰全面多巴胺化。

## 行业参考（StyleKit 多巴胺设计规范，已实测提取）

**核心色板（高饱和，直接采用）**：
| 角色 | 色值 | 用途 |
|---|---|---|
| 荧光粉 Primary | `#ff006e` | 主按钮/主强调/标题装饰 |
| 亮紫 Secondary | `#8338ec` | 副按钮/板块背景/装饰 |
| 明黄 Accent1 | `#ffbe0b` | 财运/高亮/贴纸 |
| 宝蓝 Accent2 | `#3a86ff` | 事业/链接/标签 |
| 湖水绿 Accent3 | `#06d6a0` | 健康/成功/开关 |
| 亮橙 Accent4 | `#fb5607` | 出行/提醒/点缀 |
| 深蓝黑文字 | `#1a1a2e` | 主文字（对比度 17:1） |
| 浅粉底 | `#fff0f5` 或 `#f8f0ff` | 页面/面板底色（替代米黄纸底） |

**设计原则（必须遵守）**：
1. **高饱和撞色**：5-6 种高饱和色并存，大胆搭配（粉×蓝、黄×紫、绿×橙），拒绝灰暗低调；**禁止大面积低饱和/马卡龙色**；**禁止大面积灰色**（灰色全用彩色替代）
2. **彩色阴影**：按钮/卡片用彩色光晕硬阴影（如 `box-shadow: 3px 4px 0 #ff006e66`、`0 8px 30px rgba(255,0,110,0.4)` 类），替代纯黑/纯棕阴影
3. **孟菲斯几何**：圆点（polka dot）、波浪线、条纹、格纹装饰（纯 CSS repeating-linear-gradient / radial-gradient / conic-gradient 实现，**勿用 filter**）；背景可用浅粉底 + 彩色波点/圆点阵
4. **波普符号**：☀️⭐⚡💖🌙 等符号装饰（**用内联 SVG 或 CSS 形状实现，勿用 emoji 字体直渲**——软渲染下 emoji 灰色剪影，参照 v0.4.18 教训）
5. **大圆角 + pill 形状**：按钮 pill（全圆角）、卡片大圆角（rounded-3xl 级），与手绘不对称边框**融合**（卡片/面板保留手绘不对称圆角，小按钮/标签用 pill）
6. **活泼动效**：hover 上浮/缩放（`transform: translateY(-2px) scale(1.03)`）、active 下压（scale(0.96)）——**只用 transform/opacity**（硬约束）
7. **文字对比度**：深蓝黑 `#1a1a2e` 为主文字；彩色底上用白色或深色文字保证可读（如荧光粉底配白字、明黄底配深字）

**保留的手绘元素**（v0.4.23 已建立，继续保留）：不对称 border-radius 手绘边框、卡片微旋转贴纸感（rotate(-0.5deg~0.8deg) 交错）、站酷快乐体手写字体、硬阴影贴纸感（换成**彩色**硬阴影）。

**各区域具体设计**：
- **面板/设置页背景**：浅粉底 `#fff0f5`→浅紫 `#f8f0ff` 渐变，叠彩色圆点阵（孟菲斯波点，CSS radial-gradient，低透明度）
- **设置板块卡片**：白底 `#ffffff` + 高饱和色粗边框（各板块循环 粉/紫/蓝/绿/橙）+ 同色系彩色硬阴影 + 板块标题带波普符号（SVG ★/☀/♡）
- **按钮**：主按钮荧光粉底白字 pill 形状；次按钮宝蓝/湖水绿/亮黄底（循环多色）；hover 上浮、active 下压；彩色阴影
- **运势 7 维度卡**：每维度一个高饱和主题色（财运亮黄 `#ffbe0b`/桃花荧光粉 `#ff006e`/事业宝蓝 `#3a86ff`/学业亮紫 `#8338ec`/健康湖水绿 `#06d6a0`/出行亮橙 `#fb5607`/签约青蓝），维度名彩色 + 左边彩色粗条或彩色小贴纸
- **聊天气泡**：用户/宠物气泡多色交替（粉/蓝/绿/紫），白字或深字按底色
- **开关/输入框/标签**：高饱和描边 + 彩色焦点；开关开态湖水绿/荧光粉
- **宠物窗口背景**：浅粉渐变底 + 彩色波点/小星星装饰（SVG/CSS），非纯米黄
- **toast/右键菜单**：彩色底（紫/粉）或白底彩色边框 + 彩色阴影

**硬约束（不变）**：零 filter（仅保留既有 backdrop-filter）；动画只用 transform/opacity；SVG/CSS 安全；dark/light/teal 三主题回归无损；doodle 独立 body class；显式覆盖派生变量勿依赖 var() 级联；字体复用站酷快乐体；测试前备份 settings.json 测后恢复；不跑 GUI 启动测试（node --check + 单元测试即可，**截图验证由 Hermes 负责**——本机会 npm start + KWin 截图发用户）；中文 commit；bump 0.4.25；不打包 exe。

**验证**：node --check 全过；单元测试（v025-test.js 或扩展 v024-test.js）——① doodle 色板多巴胺化断言（styles.css doodle 块含 ≥5 种高饱和色：ff006e/8338ec/ffbe0b/3a86ff/06d6a0/fb5607 至少 5 个，且**不含**旧低饱和主色 #6a9fd8/#e98a8a 作为主色变量）② 彩色阴影断言（doodle 块 box-shadow 含彩色色值，非纯 rgba(0,0,0)）③ 无大面积灰色/米黄做主背景（doodle 背景变量非 #fdf6e3）④ 波普/孟菲斯装饰存在（radial-gradient 波点或 SVG 符号）⑤ stripEmoji 不回归（v024 的 22 项）⑥ v023/v024 测试全回归；bump 0.4.25 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.24 doodle 主题颜色丰富化 + 语音播报剥离 emoji（已完成，归档）

## 本次任务（v0.4.24，用户反馈 2 项，已完成）

**① 🎨 doodle 手绘涂鸦主题「颜色太单一」→ 更丰富更可爱、更具设计感**
- 现状（styles.css `body.theme-doodle` 块，179-221 行）：色板单一——大面积米黄纸底 #fdf6e3 + 微暖白卡片 #fffef9 + 唯一主色蜡笔蓝 #6a9fd8 + 点缀蜡笔红 #e98a8a，全组件基本只有蓝/红两色点缀，视觉平淡。
- 方向（设计感放开做，但保持可爱协调不杂乱）：
  1. **多色蜡笔组件**：按钮/标签/开关/图标用多色系（粉/蓝/绿/橙/紫）交错搭配，别全用同一蓝色；各板块卡片可用不同色系贴纸底色区分
  2. **分区上色**：设置页不同板块、运势 7 维度卡片各自代表色（财运金/桃花粉/事业蓝/学业紫/健康绿/出行橙/签约青，柔和的蜡笔色调）
  3. **彩色手绘细节**：手绘边框/标题下划线/贴纸硬阴影可带色（浅粉/浅蓝/浅绿硬阴影替代纯黑阴影）；贴纸微旋转保持
  4. **小装饰**：星星/波点/爱心/小三角等点缀（纯 CSS/SVG 实现，**勿用位图/勿加 filter**），点缀分布克制，可爱但别花哨
  5. **可读性**：文字仍用深色铅笔灰系，彩色用于背景/边框/装饰，保证对比度
- 硬约束（不变）：零 filter（仅保留既有 backdrop-filter）；动画只 transform/opacity；SVG/CSS 安全；dark/light/teal 三主题回归无损；doodle 用独立 body class 隔离；显式覆盖派生变量勿依赖 var() 级联；字体复用已内置的站酷快乐体，勿引外部 CDN

**② 🔊 语音播报时 emoji 不播报**
- 现状：`speakFortune`/`speak`（pet.js:1313-1319）把含 emoji 的文本直接送 TTS，如"🥰 蹭蹭~ 主人摸我啦"会念出 emoji 名称；气泡/聊天/运势文本普遍带 emoji 前缀。
- 修法：**只在 TTS 合成前剥离 emoji，气泡显示保留原文**。最佳位置：`_ttsDrain`（pet.js:1292-1310）调用 `ttsSynthesize(item.text)` 前，对文本做 emoji 剥离（新增纯函数如 `stripEmoji(text)`：移除 Unicode emoji，含变体选择器 \uFE0F 与 ZWJ \u200D 序列，用 `[\p{Extended_Pictographic}\uFE0F\u200D]` 全局正则 + `/u` flag，剥离后压缩多余空白）；入队/去重逻辑用原文本（不动）。
- 注意：只影响语音，气泡、消息队列、聊天界面全部照旧显示 emoji。

**通用**：保留全部现有功能；勿动软渲染配置；测试前备份 settings.json 测后恢复；不跑 GUI 启动测试（node --check + 单元测试即可，截图验证由 Hermes 负责）；中文 commit；bump 0.4.24；不打包 exe。

**验证**：node --check 全过；单元测试（v024-test.js 或扩展 v023-test.js）——① `stripEmoji` 纯函数：去 emoji（含 ZWJ 序列如 👨👩👧、变体选择器如 ❤️、旗帜如 🇨🇳）、保留中文/字母/数字/标点、多余空白压缩 ② doodle 多色断言（styles.css doodle 块含 ≥3 种以上不同色相强调色、组件级彩色类/变量存在）③ v023 测试全回归（61 项）④ dark/light/teal 不回归；bump 0.4.24 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.23 手绘涂鸦风格界面模式（doodle theme）（已完成，归档）

## 本次任务（v0.4.23，用户需求：新增手绘涂鸦风格界面模式，要有设计感，改完运行截图验证，已完成）

**目标**：设置页「界面模式」新增第 4 种：**🎨 手绘涂鸦（doodle）**——目前已有 深色 dark（默认）/ 浅色 light / 青涩 teal（body.theme-light / body.theme-teal，CSS 变量覆盖体系在 styles.css）。doodle 同样走 `body.theme-doodle` CSS 变量覆盖 + 组件级手绘细节。用户明确要"有设计感"，本轮可放开做 UI 质感（但遵守软渲染硬约束）。

**手绘涂鸦设计要点（全部 CSS/SVG 实现，软渲染安全）**：
1. **手绘边框**：经典不对称 border-radius 技法，如 `border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px`（卡片/按钮/输入框/气泡/面板随机微调数值，避免全部相同），配合 2px 实线描边（铅笔感）
2. **蜡笔色板 + 纸纹**：米黄纸底 `#fdf6e3` 系；强调色用柔和蜡笔（如蜡笔蓝 #7aa5d9 / 蜡笔红 #e98a8a / 蜡笔绿 #9cc79c / 铅笔灰 #4a4a4a）；纸纹用纯 CSS 渐变模拟（如细横线笔记本纸 `linear-gradient` 或点状），**勿用 filter（feTurbulence/noise）**（软渲染风险）
3. **贴纸感**：硬阴影无模糊 `box-shadow: 2px 3px 0 rgba(0,0,0,.25)`；卡片/标签微旋转 `transform: rotate(-1deg / 0.8deg)` 交错（贴纸/便签感，transform 安全）；hover 时旋转归零或加大
4. **手写字体**：尝试下载开源手写体 **站酷快乐体（ZCOOL KuaiLe）** woff2（约 1-3MB）放入 `assets/fonts/`，`@font-face` 加载，正文/标题用；**下载源先试**：npm 包 `zcool-kuaile`（npmmirror 有镜像）或 gitee/GitHub raw（如 `https://gitee.com/...` / `https://cdn.jsdelivr.net/npm/zcool-kuaile`）；下载失败则纯 CSS 手绘手法（微旋转+手绘边框已足够有设计感），字体降级系统 sans。**字体文件必须能离线打包**（进 build 资源，勿引用外部 CDN 运行时加载——国内网络不稳）；如引入字体，package.json 打包配置要带上 assets/fonts
5. **组件覆盖范围**：面板（#panel）、设置页卡片/按钮/输入框/开关、聊天面板、日历面板、宠物气泡（#reminder-bubble）、右键菜单、运势卡片、星盘卡片、toast——全部手绘化（边框/阴影/字体/微旋转）；标题下划线可用 SVG 波浪线或 border-bottom 双线
6. **与其他主题隔离**：`body.theme-doodle` 显式重写全部派生变量（参照 0.4.13 浅色"文字看不清"坑：**勿依赖 var() 派生级联，显式覆盖**）；切换逻辑复用现有 applyUiTheme（settings.js），加 'doodle' 分支；设置页「界面模式」按钮组加 `🎨 手绘涂鸦`（data-ui-theme="doodle"）
7. **保留全部现有功能**：dark/light/teal 三个主题不可回归（CSS 变量体系别破坏，doodle 用独立 body class 隔离）

**硬约束**：勿加 filter（软渲染）；动画只用 transform/opacity；勿动软渲染配置（swiftshader 等）；测试前备份 settings.json 测后恢复；不跑 GUI 启动测试（node --check + 单元测试即可，**截图验证由 Hermes 负责**——本机会 npm start + KWin 截图发用户）；样式可以放开做（本轮用户明确要设计感）；中文 commit；bump 0.4.23；不打包 exe。

**验证**：node --check 全过；单元测试——① styles.css 含 `body.theme-doodle` 且无 filter 关键字 ② 设置页 index.html 含 doodle 按钮、settings.js applyUiTheme 有 doodle 分支 ③ 派生变量显式覆盖（doodle 块不引用 var() 派生关键变量）④ 字体文件存在（若下载成功，断言 assets/fonts/*.woff2 存在且 >100KB）⑤ 回归 v019-v022 测试仍过（若受影响）；bump 0.4.23 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.22 星盘可视化+分析 + 启动重复播报修复（已完成，归档）（已完成，归档）

## 本次任务（v0.4.22，用户原始需求 2 项，已完成）

**① 星盘要"画出来" + 有分析（不只是数据列表）**
- 现状：日历页「🔮 点击查看星盘」→ `_renderStarChart`（src/renderer/calendar.js）只渲染**行星落座文本列表**（太阳：金牛座 24°…）+ 上升/天顶行 + 相位摘要。用户要：**图形化星盘（画出来）** + **星座/行星/相位分析**。
- 数据（sidecar `/chart/natal` 已返回，实测齐全）：`planets`（10 颗行星，每颗含 `sign/signEn/degree/minute/longitude` 黄经）、`ascendant`（含 longitude）、`midheaven`、`aspects`（19 个，含 planet1Label/planet2Label/label/angle/orb）。
- **画图方案（SVG，软渲染安全——矢量 Skia CPU 渲染，勿用 canvas/位图）**：
  - 圆形星盘：外圈 12 宫等分（每 30° 一格，标注星座名/符号，可用现有 ZODIAC_SIGNS 顺序），**以上升点 longitude 为第一宫起始**（传统星盘 asc 在左，宫位从 asc 逆时针排）；内圈画行星点（按 longitude 映射角度，标注行星中文名：太阳/月亮/水星/金星/火星/木星/土星/天王/海王/冥王）；画上升(ASC)/天顶(MC)轴线；中心可放"本命星盘"字样。
  - 纯 SVG 字符串生成（函数如 `buildNatalChartSVG(chartData)`，纯函数便于单测），插入星盘区；`styles.css` 加 `.star-chart-svg` 基础样式（从简，深色/浅色主题适配用现有 CSS 变量）。
  - 图在顶部，下方保留现有数据列表 + 相位摘要。
- **分析（新增「🔮 星盘分析」按钮，图下方）**：
  - 点击 → 调 LLM 生成解读（复用 fortuneEngine 的 LLM 调用模式：OpenAI 兼容 chat/completions、settings.modelConfig 的 llmApiKey/llmBaseUrl/llmModel、无 key/失败→模板降级）：
    - LLM prompt：输入星盘紧凑 JSON（行星落座/上升/天顶/相位），输出 3-4 段中文解读——① 核心性格（太阳星座为主，含月亮/上升补充）② 感情/事业倾向（金星/火星/水星落座）③ 相位提示（如日月三合→内外一致）④ 一句整体建议。萌宠口吻"小财"，简短（每段 1-2 句）。
    - **模板降级（无 key/LLM 失败）**：本地星座性格模板（12 星座 × 太阳星座核心性格一句 + 月亮情感 + 上升外在形象各一句，共 3 句）+ 相位通用解读（三合→顺利、刑→挑战、冲→平衡、六合→机会，取前 3 个相位）+ 免责"仅供娱乐参考"。
  - 分析结果渲染在星盘区下方（`.star-chart-analysis` 卡片，样式从简）；加载中转圈/按钮文案变化；失败提示可重试。
  - 新增 IPC：主进程 `star:analyze`（接收 birth 或 natal 数据，返回分析文本）——**注意 LLM 调用放主进程**（渲染层无 key 环境）；模板降级在主进程或渲染层都行（建议主进程统一，便于单测）。

**② 启动后重复运势播报（"属马的你，运势整体63分…"出现 2-3 次）**
- 根因（已定位，3 条通道同时播 reminderLines[0] 附近内容）：
  1. 主进程 `maybeSendStartupFortune`（src/main/fortuneEngine.js:513，启动后 5s）→ `sendFortuneReminder`（:499）→ `webContents.send('fortune-reminder')` → 渲染层 renderer.js:212 `onFortuneReminder` → 气泡 + `speakFortune`（reminderLines[0]，带"属马的你"前缀即模板降级 zText）
  2. 渲染层 `sayDailyFortune`（pet.js:1154，启动后 30s）→ `_broadcast(line, {speech:true})` → 气泡 + speakFortune（segments[0]）
  3. 渲染层 `_doFortuneBroadcast`（时段播报，档期可能正好在启动附近）→ `_broadcast` 同源内容
- 修复（两层）：
  1. **统一启动通道**：主进程 `maybeSendStartupFortune` 的 IPC 推送去掉（不再 `webContents.send('fortune-reminder')`；`sendFortuneReminder` 里系统 Notification 可保留或一并去掉——用户抱怨的是"提醒播报队列"，气泡+语音统一由渲染层 `sayDailyFortune`（30s）负责即可；系统通知保留不影响气泡队列，但为观感一致建议把系统通知也去掉，启动运势播报完全交给渲染层一条通道）。`maybeSendStartupFortune` 若不再被调用，连同调用点一起删掉（检查 main.js 调用处）。
  2. **队列同文本去重（兜底）**：`enqueueMsg`（pet.js）加 `opts.dedupe`——true 时若同文本已在消息队列中或正在显示（`_msgShowing.text`），**不再入队**；**fortune 类（category==='fortune'）默认 dedupe=true**；其他类默认 false（用户交互 say() 不受影响）。防止未来任何路径重复。
- 验证：启动后 60s 内只播报一次总运势（TTS 队列只有一条 speakFortune 入队、气泡一条）；可注入两条相同文本 enqueueMsg 断言第二条被丢弃。

**硬约束**：保留全部现有功能；勿动软渲染配置（SVG 可用，canvas/位图避免）；勿加 filter；测试前备份 settings.json 测后恢复；不跑 GUI 测试（node --check + 单元测试 + curl sidecar 验证星盘数据）；样式从简；中文 commit；bump 0.4.22；不打包 exe。

**验证**：node --check 全过；单元测试——① buildNatalChartSVG：SVG 合法（含 12 宫/行星/ASC/MC 元素）、asc 起点映射正确、无 NaN ② 星盘分析模板降级（12 星座模板命中、无 key 时输出 3 段+免责）③ LLM prompt 结构 ④ enqueueMsg dedupe：fortune 同文本去重、user 交互不去重 ⑤ 主进程启动不再发 fortune-reminder（源码断言）；回归 v019/v020/v021 全过；bump 0.4.22 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.21 运势黄历彻底清除（已完成，归档）（已完成，归档）

## 本次任务（v0.4.21，用户反馈：v0.4.19 修过但仍出现"今日宜祭祀、塞穴、入殓…"，已完成）

**根因（已定位，两层）**：
1. **旧缓存未失效（主因）**：`fortune.json` 按日期缓存（`fortuneByDate[todayKey] = {data, source, createdAt}`），用户机器上 **v0.4.19 修复前生成的当天数据**仍含"今日宜祭祀、塞穴、入殓…"（旧模板 reminderLines），`getDailyFortune`（src/main/fortuneEngine.js:321）命中缓存直接返回——**同一天内不会重建**，要等第二天新代码生成才消失。用户当天看到的就是这份旧缓存。
2. **sanitize 覆盖面不全（次因）**：`normalizeFortune`（src/main/fortuneEngine.js:429+）只清洗 `reminderLines/lotteryTip/briefReason`，**未清洗 `dimensions[].summary/advice`**——LLM 或模板可能在 summary/advice 里写黄历宜忌词。

**修复（三管齐下）**：
1. **缓存版本化 + 自愈**：
   - 缓存条目写 `schemaVersion: 2`（写入处 src/main/fortuneEngine.js:404 `cache.fortuneByDate[todayKey] = { data, source, createdAt }` 补字段）
   - `getDailyFortune` 读取缓存处（:321）加过期判断：**条目无 schemaVersion 或 < 当前版本，或条目文本含 FORTUNE_STOPWORDS 黄历词 → 视为过期，跳过缓存重新生成**（新函数如 `isStaleFortuneEntry(entry)`，用 sanitizeFortuneText 的 STOPWORDS 列表做检查——可对 reminderLines/lotteryTip/briefReason + 各 dimension 的 summary/advice 拼接文本查词）
   - 效果：用户机器旧缓存自动失效重建，**无需手动删文件**；以后文案规则再变也能自愈
2. **sanitize 全覆盖**：`normalizeFortune` 对 `dimensions[].summary` 和 `dimensions[].advice` 也过 `sanitizeFortuneText`；清洗后为空时给通用兜底（如 summary 空→`运势平稳`、advice 空→`稳扎稳打`），避免出现空字段
3. **LLM prompt 补强**（src/main/fortuneEngine.js:257 prompt）：明确 `dimensions[].summary/advice` 同样**禁止黄历宜忌词汇**，只写 7 维度相关建议

**注意**：
- `FORTUNE_STOPWORDS`/`sanitizeFortuneText` 已有（v0.4.19），直接复用，勿重复定义
- 日历页黄历区（calendar.js 独立展示）不动
- 用户本机 `~/.config/wealth-calendar/fortune.json` 含 2026-08-04/05/07 旧缓存——修复后跑一次 getDailyFortune 验证 2026-08-07 自动重建且无黄历词（可用 v021-test.js 模拟旧缓存条目 → 断言 isStaleFortuneEntry 判定过期 → 重建路径）
- 注意 v0.4.20 修复过 pet.js `delayMin` 作用域 bug——**不要在 pet.js 动这段主动台词逻辑**

**硬约束**：保留全部现有功能；勿动软渲染配置；勿加 filter；测试前备份 settings.json 测后恢复；不跑 GUI 测试（node --check + 单元测试 + 可 node 直接调 fortuneEngine 验证缓存自愈）；样式从简；中文 commit；bump 0.4.21；不打包 exe。

**验证**：node --check 全过；单元测试——① isStaleFortuneEntry：无 schemaVersion 的旧条目→过期、含"祭祀/塞穴/入殓"→过期、新版本干净条目→有效 ② normalizeFortune 清洗 dimensions.summary/advice（含黄历词→过滤/兜底）③ 模拟旧缓存 → getDailyFortune 重建路径（可注入 fake requestSidecar 断言重新调用）④ 回归 v019/v020 测试仍过；bump 0.4.21 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.20 用户记忆体（已完成，归档）（已完成，归档）

## 本次任务（v0.4.20，用户原始需求，已完成）

**目标**：把用户的使用习惯、爱问的问题、互动时间、所求方向、对话情绪等记录到 **MEMORY.md**（类似 agent 记忆体），积累服务用户的经验，后续用于消息提醒等场景，给用户带来使用价值和情绪价值。**用户本轮先不逐项验证，完成打包后一起验证。**

**核心设计**：
1. **新增 `src/main/userMemory.js`**（主进程模块）：
   - **数据采集**：
     - 应用启动/退出时间（app.whenReady / before-quit 挂钩，`src/main/main.js` 已有点位）
     - 互动事件：渲染层 `onInteract(type)`（pet 单击/双击、stick 摇签、fortune 看运势、chat 聊天）——新增 IPC `memory:track`（renderer→main），在 pet.js/calendar.js/chat.js 的 onInteract 调用处附带 type 上报
     - 聊天消息：`chatEngine.chatSend` 的用户消息（userMessage）→ 话题关键词分类 + 情绪分析（聊天可能无 key 也走技能，务必在入口处统一采集）
     - 主求方向：从 settings.mainWish 读取（求财/求姻缘/求事业/求健康/求学业/求平安）
     - 主题使用：主题切换记录（可选，简单记）
   - **分析函数（纯函数，便于单测）**：
     - 活跃时段：按小时直方图（0-23），统计最近 N 天每次互动的 hour
     - 话题分类 TOPIC_KEYWORDS：财运（钱/财/赚钱/工资/股票/彩票…）、事业（工作/老板/加班/项目/升职…）、桃花（恋爱/对象/相亲/喜欢/分手…）、健康（累/困/病/睡/健身…）、学业（考试/学习/论文/上课…）、出行（旅游/出差/车/机票…）、签约（合同/签/客户…）、其他兜底
     - 情绪分析 SENTIMENT：积极词（开心/哈哈/好/棒/不错/爱/喜欢/顺利…）、消极词（烦/累/难过/emo/唉/伤心/崩溃/压力/失眠…）、中性；含表情符号简单判断（😊🥰🎉 积极 / 😭😤😞 消极）；单条消息取多数派，可加"情绪倾向"汇总（最近 30 条内消极占比 >40% 记 low，<20% 记 high）
     - 所求方向推断：mainWish 为主，聊天话题频率为辅（如 mainWish 空但话题全是财运 → 推断"求财"）
   - **持久化**：
     - `userData/userMemory.json`：结构化原始数据（interactions 列表带时间戳/type/话题/情绪、dailyStats、lastUpdated），持续累积，容量控制（最多保留最近 1000 条交互）
     - `userData/MEMORY.md`：**人类可读总结**，每次应用退出时刷新（before-quit），格式类似 agent memory，示例：
       ```markdown
       # 🧠 用户记忆体
       > 由财神日历自动生成 · 最后更新：2026-08-07 18:30 · 已陪伴 12 天
       
       ## 📊 使用习惯
       - 活跃时段：上午 9-11 点、晚上 20-23 点（互动最频繁）
       - 常用功能：看运势 > 聊天 > 摇签 > 单击互动
       - 平均每天互动：约 15 次
       
       ## 🎯 所求方向
       - 主求：求财（设置指定）｜推断：求财、求事业
       - 常聊话题：财运（40%）、工作（25%）、健康（15%）
       
       ## 💬 对话情绪
       - 整体情绪：积极为主（近 30 条积极 60% / 消极 15%）
       - 低谷时段：周三晚上、周五下午（消极消息偏多）
       - 最近一次低落：2026-08-06 22:14 "好累啊"
       
       ## 🤝 服务经验
       - 喜欢简短的运势提醒，讨厌长篇播报
       - 晚上 22 点后适合安慰式语气，白天适合鼓励式
       - 财运话题回复要具体（数字/方位/吉时），不要空泛
       ```
       （服务经验部分先放规则模板 + 从数据里抽的结论，如活跃时段/低谷时段/话题占比）
2. **应用（基础版，能体现"经验积累 → 更好服务"）**：
   - **活跃时段感知提醒**：用户记忆里的高频活跃时段内，日常互动/运势播报频率略增；低谷时段（如深夜 23-5 点）减少打扰（捣蛋不触发、日常台词降频）
   - **情绪感知安慰**：检测到用户最近聊天情绪低落（如近 3 条消息含 2+ 消极词）→ 主动弹安慰气泡（复用 enqueueMsg 优先级 user，文案温柔："主人是不是遇到烦心事了？小财在呢，说出来会好受些~"）；深夜 + 低落双条件时触发深夜安慰加强版
   - **主求侧重**：运势播报 reminderLines 组装时结合记忆推断的主求方向（已有 mainWish 机制，补充"记忆推断"作为 mainWish 为空时的来源）
   - 全部走现有消息队列（enqueueMsg + PRIORITY），不另起通道
3. **设置页**：模式板块下新增「🧠 用户记忆体」小板块：开关（默认开，关掉停止采集）、说明文案（"记录你的使用习惯与情绪，让提醒更贴心 · 仅存本机不上传"）、「📖 查看记忆」按钮（IPC 读取 MEMORY.md 内容显示在设置页内预览框，样式从简）

**硬约束**：保留全部现有功能；勿动软渲染配置；勿加 filter；测试前备份 settings.json 测后恢复；不跑 GUI 测试（node --check + 单元测试）；样式从简；隐私本地化（不联网不上传）；中文 commit；bump 0.4.20；不打包 exe。

**验证**：node --check 全过；单元测试——① 话题分类/情绪分析纯函数（财运句→wealth、消极句→low）② 活跃时段直方图 ③ MEMORY.md 生成器（含时间/占比/服务经验模板，输出为合法 markdown）④ 容量上限（>1000 条裁剪）⑤ 应用逻辑（低落→安慰文案、低谷时段→降频）⑥ 设置页开关/查看 IPC 存在；bump 0.4.20 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.19 星盘修复 + 运势过滤 + 捣蛋频率 + 文案（已完成，归档）（已完成，归档）

## 本次任务（v0.4.19，用户原始需求，5 项，已完成）

**① 星盘 bug：上升星座显示 "[object Object]" + 星盘没显示**
- 根因（已定位）：`python/server.py` `lon_to_zodiac()` 返回**对象** `{sign, signEn, degree, minute, second, longitude, label}`；ascendant 对象里 `label` 已拼好"上升 X X°…"。但 `src/renderer/calendar.js` `_renderStarChart` 里 `const ascendant = d.ascendant || ''` 拿到的是对象，`String(ascendant)` → `[object Object]`。
- 修法：前端改为取 `ascendant.label`（如 `const asc = d.ascendant; const ascLabel = (asc && asc.label) || ''`），渲染 `上升 ${ascLabel}`；**注意 label 里已含"上升 "前缀，避免"上升 上升 X"重复**（选一种：后端 label 去前缀或前端只拼一次，输出最终为 `上升 白羊 12°34′56″` 一行）。同时排查"星盘没显示"：检查 `_renderStarChart` 整段（planets 循环正常、空数据分支、`star-chart-body` 显隐），确保有出生信息时点"查看星盘"能渲染出行星落座列表 + 上升/天顶（midheaven 前端可选渲染，样式从简）。可先 `curl -X POST 127.0.0.1:47821/chart/natal -d '{"birth":"1990-05-15 10:30"}'` 验证后端返回结构。

**② 运势提醒/播报过滤黄历宜忌（重点）**
- 问题：气泡消息和对话消息里的运势提醒，会出现"今日宜祭祀、塞穴、入殓…"等黄历宜忌内容（来自 `src/main/fortuneEngine.js` `buildTemplateFortune` 的 `almanacYi/almanacJi` 拼进 reminderLines/播报文案）。用户明确：**面向上班族/学生，提醒和播报不要说这些毫不相关的内容**；黄历宜忌可以在日历页面正常展示（calendar.js 日历页不动）。
- 修法（三管齐下）：
  1. `buildTemplateFortune`：reminderLines 与播报文案**不再直接拼 almanac.yi/ji 原文**，改为基于 7 维度（财运/事业/桃花/学业/出行/签约/健康）的差异化文案（如财运好→"偏财在线"、桃花好→"主动一点有惊喜"、健康维度低→"注意劳逸结合"等，现有 dims 文案可复用改造）；黄历数据仍可用于计算分数/吉时/财神方位，只是不把"祭祀塞穴入殓"这类词进提醒文本。
  2. LLM prompt：明确要求 reminderLines 只围绕 7 维度（财运/事业/桃花/学业/出行/签约/健康）写"好的或避忌"内容，**禁止出现黄历宜忌词汇（祭祀/塞穴/入殓/安葬/祈福/开光/破土/作灶等）**。
  3. 加后置清洗函数（如 `sanitizeFortuneText(text)`，在 fortuneEngine.js 或 msgCore.js）：过滤已知祭祀/丧葬/农耕类黄历词（维护一个 STOPWORDS 列表：祭祀/塞穴/入殓/安葬/移柩/破土/祈福/开光/斋醮/立券/栽种/牧养/纳畜/安床/作灶/伐木/开渠/穿井/扫舍 等），命中则用通用维度文案替换或去掉该句；应用到 reminderLines/lotteryTip/运势播报所有输出文本。
- 日历页（calendar.js 黄历区）保留完整宜忌展示，不动。

**③ 捣蛋模式频率：5~10 分钟随机吐槽或捣蛋，每日上限不设限**
- 现状（`src/main/prank.js`）：双通道——吐槽 5-8 分钟（ROAST_INTERVAL_MIN/MAX=5/8）+ 捣蛋操作 10-15 分钟（ACTION_INTERVAL_MIN/MAX=10/15），各自独立排程；DAILY_LIMIT=20 每日上限（remainingSlots/takeSlot 限流）。
- 改法：合并为**单通道**——每 5-10 分钟（一个间隔常量组，如 PRANK_INTERVAL_MIN/MAX=5/10）到点随机触发 **吐槽或捣蛋操作二选一**（50/50 或按权重，可复用现有 doRoast/doAction）；**移除每日上限**（DAILY_LIMIT/remainingSlots/takeSlot 逻辑去掉或恒放行，prankCount 记录可保留但不阻塞）；TRIGGER_CHANCE=1 保持（到点即触发）。开关 prankMode、自家窗口禁止打字、PRANK_POOL 等其余逻辑不动。

**④ 设置页文案（`src/renderer/index.html`）**
- `AI 命理（DeepSeek 兼容 API）` → `AI 命理（兼容 OpenAI 模式 API、本地模式 API）`
- 多模态模型部分去掉个性化提示：
  - `即梦 Seedance（火山引擎，有免费额度）` → `即梦 Seedance`
  - `AK/SK 签名（火山引擎 AccessKey）` → `AK/SK 签名`
  - placeholder `AccessKeyId（即梦/火山引擎控制台）` → `AccessKeyId`
- **AccessKeyId/SecretAccessKey 默认空**：`src/main/main.js` DEFAULT_MODEL_CONFIG 已不含 multimodal 凭证字段（首次启动预填只有 llmBaseUrl/llmModel/llmApiKey），确认 settings.js `applyMultimodal` 的 `mc.accessKeyId || ''` 兜底正确即可；顺带检查是否有其他预填路径（如旧 settings 迁移/默认值对象）会写入非空凭证，有则清掉。用户当前 settings 的 modelConfig 无这两字段，符合预期。

**硬约束**：保留全部现有功能；勿动软渲染配置；勿加 filter；测试前备份 settings.json 测后恢复；不跑 GUI 测试（node --check + 单元测试；星盘可 curl sidecar 验证后端）；样式从简；中文 commit；bump 0.4.19。

**验证**：node --check 全过；单元测试——① 星盘渲染函数对 ascendant 对象/空值正确处理（不再 [object Object]）② sanitizeFortuneText 过滤 STOPWORDS（祭祀/塞穴/入殓等不出现）且保留 7 维度文案 ③ buildTemplateFortune 的 reminderLines 不含黄历宜忌原文 ④ 捣蛋排程单通道间隔在 5-10 分钟区间、无每日上限 ⑤ 文案字符串断言；bump 0.4.19 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.18 生肖主题收集系统（已完成，归档）

## 本次任务（v0.4.18，用户原始需求，已完成）

**背景**：项目 `主题素材/生肖1-鼠/ 生肖2-牛/ 生肖3-虎/ 生肖4-兔/` 已由用户提供素材，**已复制入库** `assets/themes/{rat,ox,tiger,rabbit}/`（rat 8 文件、ox 6、tiger 4、rabbit 17，GIF+WebP）。12 生肖全部作为**元宝解锁的收集主题**，剩余 8 个（龙蛇马羊猴鸡狗猪）素材后续补充，但**代码必须现在就把完整 12 生肖 + 可扩展模式预留好**。

**核心设计（用户拍板方向，实现细节可自由发挥）**：
1. **THEME_CATALOG 主题目录（关键：可扩展模式）**：在 msgCore.js 或新建 themeCatalog.js 集中定义全部主题元数据，每项 = `{ id, name, kind: 'material'|'svg'|'custom', unlock: 'free'|'coins'|'zodiac', cost?, zodiacIndex? }`：
   - free：cat1/cat2/caishen/custom（现有素材+自定义，默认可用）
   - coins：gold（财神金主，10 元宝，现有逻辑保留）
   - zodiac：**12 生肖全量预注册** rat/ox/tiger/rabbit + dragon/snake/horse/goat/monkey/rooster/dog/pig（后 8 个素材未到：注册但 `assetsReady:false`，UI 显示"敬请期待"锁态，不参与随机池；素材到位只需补目录+改 assetsReady，**其余代码零改动**）
   - 未来其他主题：加一个 catalog 条目即可，解锁模式沿用三种之一
2. **生肖随机解锁机制**：`settings.zodiacUnlocked` 数组存已解锁生肖 id。新按钮「🎲 随机解锁生肖（3 元宝）」→ 扣 3 元宝 → 从"未解锁且 assetsReady"的池中**随机抽 1 个** → 写入 zodiacUnlocked → 气泡+toast 展示抽到谁（如"🐭 解锁了生肖鼠！"）；池空（全解锁）时按钮置灰提示"已集齐"。
3. **收集 UI**：设置页主题板块下新增「🐲 生肖收集」子区：**4×3 十二宫格**（鼠牛虎兔龙蛇马羊猴鸡狗猪固定顺序），每格 = 生肖 emoji + 名字；已解锁亮色可点（切换主题），未解锁 🔒 灰锁；素材未到的显示"敬请期待"。宫格下方：元宝余额 + 随机解锁按钮 + 进度提示（"已收集 4/12"）。
4. **集齐彩蛋**：12 个全部解锁 → 气泡庆祝 + 特殊称号（如"🐲 十二生肖收藏家"，可仿 gold 称号徽标机制，样式从简）。
5. **THEME_ACTIONS 状态映射**（pet.js 现有结构）：为 rat/ox/tiger/rabbit 加 4 组映射，把素材文件名归入 sleep/happy/sad/play/sit/walk（walk 无专门图可复用 play/sit；素材少的状态用其他状态复用）。参考文件名语义：
   - rat（吃麦乐鸡/喝酒开心/哭唧唧/拉粑粑没纸了/晴天霹雳/刷牙/摘玫瑰花瓣-它喜欢我它不喜欢我/转呼啦圈）：happy→喝酒开心/吃麦乐鸡，sad→哭唧唧/晴天霹雳，play→转呼啦圈/摘玫瑰花瓣，sit→吃麦乐鸡/刷牙
   - ox（摆烂/福到/恭喜发财/害羞/加油加油/新年快乐）：sleep→摆烂，happy→恭喜发财/福到/新年快乐，play→加油加油，sad→害羞
   - tiger（发大财/傻乐/睡大觉/送你花花）：sleep→睡大觉，happy→发大财/傻乐，play→送你花花，sad→傻乐
   - rabbit（比心/啵一个/蹭蹭/吃吃吃/大声唱歌/带你去溜达/哼/哭唧唧/黏住你/抛个媚眼/丘比特之箭/伤心/生气/哇哦/想你了）：happy→比心/啵一个/哇哦/抛个媚眼，sad→伤心/哭唧唧/生气/哼，play→蹭蹭/黏住你/丘比特之箭/大声唱歌，sit→吃吃吃/带你去溜达，sleep→想你了
6. **setTheme 适配**（pet.js）：素材主题判断从写死 `cat1/cat2/caishen` 改为「kind==='material'」（含生肖）；素材主题 CSS class 兜底给 theme-cat；`svgPet` 对生肖主题兜底（素材加载失败时显示对应生肖 emoji 或复用萌猫 SVG，样式从简）。
7. **msgCore THEME_INTERACT**：加 `zodiac` 组（生肖通用互动文案，如"🐭 吱吱~ 主人摸我啦！"风格，interact/comfort/roast 三类；不同生肖可在文案里带各自 emoji，但一组通用文案即可，不要 12 份）。
8. **主题板块 UI（index.html/settings.js）**：生肖主题按钮不在原 `#theme-options` 硬编码列表里重复加 12 个——主题板块改为「现有主题（cat1/cat2/caishen/custom/gold）」+「生肖收集宫格」两个区；点已解锁宫格 = 切主题（写 settings.theme=rat 等，pet.js setTheme 生效）。

**硬约束**：保留全部现有功能；勿动软渲染配置；勿加 filter；测试前备份 settings.json 测后恢复；不跑 GUI 测试（node --check + 单元测试即可）；样式从简（收集系统功能优先，美观后续）；素材目录已就位勿再复制；git 跟踪 assets/themes/{rat,ox,tiger,rabbit}（中文名素材文件全角引号等照原样保留，参考 cat1 先例）。

**验证**：node --check 全过；单元测试覆盖——目录完整性（12 生肖全注册）、随机解锁不重复且从 assetsReady 池抽、扣币逻辑（元宝不足拒绝）、集齐彩蛋、THEME_ACTIONS 文件引用与实际素材文件匹配（防 typo）、宫格状态渲染逻辑；bump 0.4.18 + 中文 commit；不打包 exe。

---

# HANDOVER — v0.4.17 消息系统重构 + 亲密度每日清零 + 系统提示音（已完成，归档）

项目根目录：`/home/Admin/myprojects/Wealth Calendar`（git 仓库，当前 HEAD `cee38af`，工作区干净，v0.4.16）
开发模式：Claude Code 交互式（本会话已开，直接发任务即可）。提交身份：`git -c user.name=Admin -c user.email=admin@local commit`

## 架构地图（文件 → 职责）

- `src/main/main.js`（1631 行）— 主进程：窗口管理（setWindowMode pet/panel 220×260↔420×560）、IPC 注册、cursor 120ms 轮询、positionVisible 防屏幕外、`schedule-reminder`/`fortune-reminder` 事件发送
- `src/main/reminder.js`（81 行）— 日程提醒巡检（30s 间隔，[remindTime, 事件开始+1h] 窗口，过期静默 markReminded），`fireReminder` 发系统通知 + `schedule-reminder` IPC
- `src/main/fortuneEngine.js`（494 行）— 运势生成（LLM 推理链 + 模板降级），返回 `{overall, briefReason, dimensions{7}, luckyTime, directions, luckyNumber, luckyColor, luckyItem, lotteryTip, reminderLines[2-3], disclaimer}`；`getFortuneByDate(dateStr)` 按日期缓存
- `src/renderer/pet.js`（1473 行）— 宠物状态机 + **气泡** `say(text)`（`#reminder-bubble`，8s 自动隐藏，即时覆盖）+ **TTS FIFO 队列** `_ttsQueue`（`_ttsEnqueue` 去重、`_ttsDrain` 依次播、chime=true 先播"叮～"）+ 运势分段队列 `_fortuneSegmentsQueue`（`_fortuneSegments` 拆分 总/财/避忌/幸运元素）+ 亲密度 `_petAffinity`（addAffinity / _maybeDailyCoin 每日满100+1元宝）/ 心情 / 每日任务 / 主题 THEME_ACTIONS（cat1/cat2/caishen 素材主题；gold 财神金主限定）
- `src/renderer/renderer.js`（281 行）— 入口：`onScheduleReminder` → `showBubble("🔔 ...")`（纯气泡）；`onFortuneReminder` → `showBubble` + `PetState.speakFortune`
- `src/renderer/settings.js` — 设置面板 9 板块（主题板块含 cat1/cat2/caishen/gold 可选）
- `src/renderer/calendar.js` / `chat.js` / `index.html` / `styles.css` — 日历面板/聊天面板/结构/样式（CSS 变量主题 dark/light/teal）
- `src/preload/preload.js` — IPC 桥（`loadSettings/saveSettings/getDailyFortune/ttsSynthesize/themeAsset/onScheduleReminder/onFortuneReminder` 等）
- `src/main/sidecar.js` + `python/server.py` — Python sidecar（命理/ASR/TTS/邮件 IMAP-SMTP，端口 47821）；`requestSidecar` 返回 `{status, data}`，失败判 `r.status>=400 || r.data?.error`，成功字段在 `r.data.*` 下
- `src/main/prank.js` / `windowInfo.js` / `chatEngine.js` — 捣蛋模式 / 窗口感知 L1+L2 / 聊天引擎（含邮件技能）

## 硬环境约束（勿碰）

- 本机 Linux KVM 软渲染：**必须保留** `use-angle=swiftshader`；窗口 `transparent:false` + 不透明背景，**不要再试透明窗口**；位图渲染正常（SwiftShader），SVG/GIF/PNG 都可用；动画只用 transform/opacity，**勿加 filter**（软渲染风险）
- 渲染层全局单例判断一律 `typeof X !== 'undefined'`，**勿用 `window.PetState`**（恒 undefined 陷阱）
- 不要跑 GUI 启动测试（会挂）；验证用 `node --check` + 纯函数单元测试（node 直接跑，可注入 fake 依赖）
- **测试前备份 `~/.config/wealth-calendar/settings.json`，测后恢复，绝不覆盖用户 API key**
- 保留全部现有功能（亲密度/心情/每日任务/元宝/捣蛋/伙伴/运势/摇签/日历/聊天/设置/主题素材）
- 样式从简、功能可用即可（用户明确"功能优先、样式后置"）；改动别动 design token 体系

## 本次任务（v0.4.17，用户原始需求）

1. **六类主题化气泡消息**（文案"拟人化"，站在宠物角度说话；**主题互动类随主题不同**，其余通用）：
   - ① 主题互动消息（cat1/cat2 萌宠 vs caishen 财神 vs gold 财神金主 文案不同）：交互/安抚/吐槽，如萌宠"蹭蹭，主人摸我啦，好开心~"、"喵~再来一下嘛！"
   - ② 日常互动类（通用）：如"今天天气不错，吃完饭可以去溜达溜达~"、"工作辛苦啦，给你捶捶肩膀"、"你效率太慢了，实在不行给我发工资，我来帮你做"、"又在看视频"
   - ③ 运势提醒类（通用）：当天运势出来后**生成一批消息保存**，直到第二天新运势替换。如"今天偏财运不错，中午散步路过彩票店，买一个"、"今天周五啦，终于结束一周牛马生活，晚上可以去走走哦，说不定有桃花哦~"
   - ④ 工作协助类（通用）："你当前处理的工作有点难度，需不需要我帮忙呀~"、"今天是周五了，记得提交周报哦"、"今天是月末，把工作整理整理"、"今天周一，可以规划下这周目标"（含时间感知：周一/周五/月末）
   - ⑤ 日程提醒类：用户设定日程 + 生日 + 法定节假日 + 情人节等节日提醒
   - ⑥ 即时通讯类：邮件未读提醒（复用现有 IMAP 配置能力，有配置才启用）、预留未来渠道
2. **优先级队列**：消息不能同时弹出/播报。日程提醒优先级最高；建议优先级 日程(5) > 运势/即时通讯(4) > 工作协助(3) > 日常互动(2) > 主题互动(1)。气泡串行显示（一条显示完再下一条），语音走已有 TTS FIFO；高优先级可插队（用户交互即时反馈 say() 视为最高优先级，可打断/覆盖当前气泡）
3. **亲密度每天清零**：新的一天从 0 重新计算（保留等级称号函数，数值归零；元宝每日满100+1逻辑保留——清零后每天重新涨，涨满再得元宝）
4. **"叮~"换系统消息提醒音**：不再用 TTS 合成"叮～"，改用内置短提示音（如 base64 小 wav/mp3 走 HTML5 Audio 或主进程播放，零外部依赖）

## 验证要求

- `node --check src/**/*.js` 全过
- 单元测试：队列优先级排序/插队逻辑、亲密度跨天清零、消息池按日期替换
- 测试脚本放 `test/` 或仓库根（如 `msg17-test.js`），跑完可留
- 完成后 bump `package.json` version → 0.4.17 并提交（两个 commit：chore: bump + feat 主体，中文消息）
- 不要打包 exe（打包由 Hermes 负责）

## 验收标准（用户视角）

- 不同主题（萌宠/财神/财神金主）互动气泡文案不同
- 六类消息都会出现，日程提醒不被其他消息淹没
- 不会有两条气泡同时挤在一起；语音播报不重叠
- 跨天后亲密度从 0 开始
- 提示音是清脆的系统"叮"而非 TTS 念"叮"
