# HANDOVER — v0.4.17 消息系统重构 + 亲密度每日清零 + 系统提示音

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
