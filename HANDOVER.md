# HANDOVER — v0.4.20 用户记忆体（MEMORY.md 经验积累）（已完成，归档）

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
