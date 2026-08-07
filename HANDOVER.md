# HANDOVER — v0.4.18 生肖主题收集系统（元宝随机解锁 + 主题目录化可扩展，已完成，归档）

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
