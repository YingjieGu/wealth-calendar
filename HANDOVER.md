# 财神日历 (Wealth Calendar) — Claude Code 交接文档

## 项目概览
- 位置: `/home/Admin/myprojects/Wealth Calendar`
- 技术栈: Electron 33 (主壳) + Python sidecar (命理引擎, 端口 47821) + DeepSeek LLM
- 功能: 桌面宠物 (豆包式) + AI 命理运势 + 日历/日程/提醒 + 桌面壁纸日历 + 语音对话
- 版本: 0.3.2, 已 git 提交, 工作区干净

## 启动与验证
```bash
cd "/home/Admin/myprojects/Wealth Calendar"
npm start                      # 开发启动 (Linux, DISPLAY=:0)
node --check src/main/*.js src/renderer/*.js   # 语法检查
# 打包 Windows (需 wine, 已装):
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npx electron-builder --win nsis
```
- 产物: `release/财神日历 Setup 0.2.x.exe`
- 镜像: npm 走 npmmirror; pip 清华; HF hf-mirror + HF_HUB_DISABLE_XET=1
- git 提交: `git -c user.name=Admin -c user.email=admin@local commit ...`

## 架构
- `src/main/main.js` — 窗口(200x250 宠物/420x560 面板双模式)、全部 IPC、sidecar/fortune/chat/reminder/wallpaper 生命周期、托盘、全局快捷键 Ctrl+Alt+W
- `src/main/sidecar.js` — Python sidecar 管理 (spawn python3 python/server.py, 健康检查/重启)
- `src/main/fortuneEngine.js` — 运势流水线: 八字/星盘/黄历 (sidecar) → DeepSeek LLM (max_tokens 16000) → 模板降级; 支持主求方向 (mainWish)
- `src/main/chatEngine.js` — LLM 对话 + JSON 动作协议 (日程增删查/运势)
- `src/main/multimodal.js` — 即梦(火山 V4 签名 AK/SK)/可灵 图生视频
- `src/main/wallpaper.js` — 壁纸日历 (offscreen 渲染→PNG→gsettings; Linux 先 deepin schema 再 gnome)
- `src/renderer/` — pet.js (状态机/主动互动/气泡), settings.js, chat.js, calendar.js, renderer.js (穿透管理/拖拽/右键菜单), styles.css (v2 设计)
- `python/server.py` — sidecar: /bazi/paipan /chart/natal /almanac/today /asr /tts /models/status

## 关键约束与已知问题 (务必阅读!)

### 1. 本机 Linux 渲染限制 (环境级, 不要花时间修)
- GPU 进程初始化失败, `disableHardwareAcceleration()` + 软件合成开关已启用
- **注意 (2026-08 环境变化)**: 本机现带 `--use-angle=swiftshader`(KVM box), SwiftShader 使**位图 (img/GIF/WebP/canvas) 在本机软渲染也能绘制** — 提交 c5f1fb5 已移除素材主题的 Linux SVG 兜底, 素材主题(win32 及本机)统一加载动作动图。内联 SVG(cat/fortune/bagua 内置主题) 仍保留为矢量兜底; custom 主题 Linux 下仍用 SVG 萌猫兜底
- 历史背景: 此前软渲染位图全灭, 宠物用内联 SVG 作主渲染; **CSS 不能用 filter** (强制 GPU 合成整层不渲染); 动画全用 transform/opacity keyframes (styles.css 宠物动画区)
- 窗口必须 `transparent: false` + 不透明 backgroundColor (透明窗口本机显示异常)
- **屏幕截图必须用 KWin API**: `qdbus org.kde.KWin /Screenshot screenshotArea x y w h` (xwd/ffmpeg 抓 root 读不到 KWin 合成的窗口层, 会误判为黑/透明)
- 窗口位置: 1058,487 (200x250)
- **布局陷阱(曾致宠物不可见)**: `#pet-view` 必须是纵向 flex 撑满窗口, `#pet-stage` 的 flex:1 才生效; 否则舞台高度塌陷为 0, 宠物被顶出视口。`#hover-buttons` 已绝对定位底部(脱离 flow), 勿改回 flow 布局

### 2. Windows 悬浮框显示问题 (主任务, 用户反复反馈)
- 用户 win11 64位: 0.2.2 之前 "部署完启动后没报错, 但悬浮框没有出来"
- 0.2.8 已做 (待用户装最新版验证):
  a) 恢复软件合成开关 `disable-gpu-compositing` + `UseSoftwareCompositor` (此前在 2da9e08 被误删, 该提交仅基于 Linux 测量误判)
  b) **保存位置屏幕外校验**: 若 settings.json 的 windowX/Y 不在任何显示器 workArea 内 (显示器热插拔/DPI/分辨率变化导致), 回中处理 — 这是"无报错但悬浮框不出现"的最常见根因
  c) 窗口 load 后显式 show() + 重新 setAlwaysOnTop + win32 focus(), 并处理 did-fail-load
- **启动诊断 (0.2.8+ 新增, 远程排查用)**: 自动写 `<userData>/debug/startup.log` (平台/版本/显示器布局/窗口 bounds/可见性/sidecar/被吞的 uncaughtException) + 窗口加载后自动截图 `debug/window-loaded.png` `window-settled.png`
  - Windows 用户 userData = `%APPDATA%/wealth-calendar/`
  - 若用户仍报不显示: 让用户把整个 `debug/` 目录发回, 先看 startup.log 有无 `off-screen` / `EMPTY` 截图 / uncaughtException, 再看截图内容
- 注意: 用户机器需装 Python 3.10-3.12 + `pip install lunar-python pyswisseph faster-whisper edge-tts` (sidecar 依赖)

### 3. 即梦多模态凭证 (用户有 AK/SK, 未验证通)
- settings.json multimodalConfig: provider=jimeng, authType=aksk, accessKeyId=AKLT..., secretAccessKey=60字符 (火山标准40, 可疑)
- multimodal.js 已实现火山 V4 签名 (HMAC-SHA256); 可灵用 Bearer
- 测试: `node /tmp/jimeng-test.js` (曾 401); 用户需要确认 secret 完整
- 若 secret 不完整, 可提示用户重新从火山控制台复制, 或改用可灵 API Key

### 4. 拖拽/交互 / 透明桌宠 (豆包式)
- 拖拽: #pet-stage mousedown → moveWindow IPC; **不要加 window blur 重置** (会导致拖不动); 拖动时 roamPause 暂停漫游, 松手 roamResume
- **win32 真透明桌宠**: 窗口 `transparent:true` + `backgroundColor` 透明; CSS `body.platform-win32 #app` 透明/无边框/无阴影/去光晕; 点击穿透 = 主进程光标轮询(120ms)发窗口内相对坐标 → 渲染进程 `elementFromPoint` 命中测试(交互元素: pet/按钮/气泡/面板) → `set-click-through` → `setIgnoreMouseEvents(value, {forward:true})`; **Linux 软渲染透明不上屏, 保持不透明调试模式**
- **位置-阶段模型(猫咪生活作息, settings.activity 三模式)** (宠物固定在窗口中心, 移动靠「阶段瞬移」, **旧的全屏漫游 40ms tick 平滑移动已删除**):
  - **位置池(主进程定义)**: homeBase(workArea 右下角留 20px) / workEdge(活跃窗口上沿居中 y=工作窗y-宠物高+10, 顶部空间不足贴下沿, 检测不到活跃窗口回退 homeBase) / taskbar(屏幕底部任务栏上方≈workArea 底部, 水平随机) / random(桌面随机避开边缘)
  - **模式权重**: quiet homeBase 100%; clingy homeBase 75%+workEdge 25%; active homeBase 55%+workEdge 15%+taskbar 15%+random 15%
  - **阶段调度(渲染进程 pet.js 计时)**: 每阶段停留 10-20 分钟随机(600-1200s), 到点按权重瞬移到下一位置(setPosition 直接跳, 无动画); 拖动/面板打开暂停阶段计时, 松手/关闭从当前位置继续(拖动位置作临时停靠, 下个阶段瞬移走)
  - **动作子状态机(动作与位置时长解耦)**: 位置阶段内独立动作计时器每 30-90s 随机切换动作(与 10-20min 阶段计时器分离), 按 `_currentPosType` 从动作池随机切并换动作图(素材主题播对应 GIF, 内置主题切 SVG 动画): homeBase→sleep/idle/sad(睡觉发呆为主, 偶尔心情差), workEdge→play/happy, taskbar→play(搞怪), random→idle/play; 多元素池保证切换后与当前不同, 单元素池(play)重进重roll GIF; 单击立即切动作(play/happy/idle 与当前不同)并重置动作计时器, 双击/连击/摇签/空闲感知保留; `_armActionTimer`/`_switchAction` 实现, 阶段瞬移/唤醒/点击均重置动作计时器, 暂停(面板/拖动/空闲)同时清阶段+动作双计时器
  - **位置→状态动作映射**: homeBase→sleep/idle(睡觉发呆), workEdge→play/happy(趴窗玩耍), taskbar→play/idle(挖沙捣蛋), random→idle/play
  - **粘人**: 进入先在 homeBase 睡一轮(60s)再开始阶段循环, 避免瞬间跳位置; 跟鼠标保留(鼠标在工作窗口内快速移动概率 35%+冷却 15s → `pet-follow-mouse` 挪到鼠标上方~100px, 8s 后恢复当前阶段)
  - **点击唤醒(睡梦互动)**: 单击 sleep 状态宠物 → 唤醒切 idle/play 动作(素材主题播玩耍/清醒图, 内置主题切对应SVG动画) + 互动气泡 + 重置阶段计时器(重新 10-20 分钟); 唤醒后 1-2s 模式位置联动: clingy→phase-go 强制 workEdge 趴窗玩, active→按权重瞬移, quiet→原地; 非 sleep 单击保留随机小反应不换位置; 双击/连击彩蛋/摇签保留; `_phaseGen` 阶段代数计数器防止异步 `_beginPhase` 覆盖唤醒状态
- **主进程行为支撑**: `getActiveWindowRect()` 平台适配器(Linux xdotool→xprop+xwininfo 退化, Win PowerShell GetForegroundWindow, macOS osascript; 全 try/catch 失败返 null; 自动排除宠物窗口自身); IPC: `phase-go`(按模式权重选位置→解析→setPosition 瞬移, 返回 {type,x,y}) / `pet-sit` / `pet-snap` / `pet-corner` / `pet-follow-mouse` / `get-active-window-rect` / `pet-panel`(面板打开暂停) / `pet-resume`(面板关闭恢复); 渲染进程 `_beginPhase`/`_rearmPhase`/`_setStateForPosition`/`_wakeUp`/`_teleportAndPlay`/`_handleMouseFast`/`onDragStart`/`onDragRelease` 驱动; `isPhaseTeleport` 标志让 move 处理器不保存瞬移位置
- **面板打开/关闭屏幕适配**: `clampWindowInWorkArea(win,w,h,anchor)` — 以宠物当前位置为锚 clamp 到 `getDisplayNearestPoint` 的显示器 workArea(优先左上角可见, 窗口比 workArea 大则居中); setWindowMode(panel) 放大 420x560 后 clamp, setWindowMode(pet) 恢复 200x250 后 clamp, 防止右下角停靠时面板超出桌面
- **悬浮窗无边框(全平台)**: `#app` 无 border/outline/box-shadow; 各主题背景也去边框; `body.theme-light #app.theme-*` 不再设边框(曾因 specificity 高于 `body.platform-win32 #app` 在 win32+浅色下残留 1px 边框); win32 透明规则全部 `!important`
- 气泡 #reminder-bubble 可点击 → 打开聊天

### 5. 界面主题 (浅色)
- styles.css 用 CSS 变量实现界面主题: `:root` 深色默认(--panel-bg/--text/--card/--input-border/--accent 等), `body.theme-light` 覆盖为浅色(白色/米色背景+深色文字+暗金点缀); 面板/日历/聊天/设置/右键菜单/提示 toast/输入框(含 color-scheme)全部适配; 宠物悬浮窗背景随浅色转浅(win32 透明模式不受影响); 金色按钮(#ffd700 渐变)两主题通用保持亮金
- 设置页「界面主题」深/浅切换, settings.json 存 `uiTheme`, 重启保持; body class 由 settings.js `applyUiTheme` 控制

### 5. 其他功能
- **托盘图标**: main.js `ensureTrayIcon()` — 用 assets/themes/cat1/睡觉.gif 首帧, python PIL 转 64x64 RGBA PNG 存 `userData/tray-icon.png`(缓存), nativeImage 加载传给 tray.js `createTray(mainWindow, onQuit, icon)`; 转换失败退回金色硬币占位图
- **每日运势分段播报**: pet.js `startFortuneSlots` — 上午9/中午12/下午15/晚上19 四时段(每时段 2-3 条, 间隔 65-95 分钟, 按日期做变化, 每天 8-12 条), 复用 say 气泡; `_buildFortuneLine` 约一半播主求方向(主求文案池 _wishTips), 一半播最强两维度(从 fortune.dimensions 排序取前2); 调度按当前时间算未来时间点, 重启自动续播
- **生肖配置**: 设置页用户信息加生肖下拉(12生肖+自动), settings.userInfo.zodiac; 默认按出生年份自动算(getChineseZodiac, (year-4)%12), 可手动改; fortuneEngine 读 zodiac 注入 LLM prompt 与模板 reminderLines("生肖X的你")
- **今日运势雷达图**: calendar.js `buildRadarSVG(dims)` — 纯 SVG 7 维(财运/事业/桃花/健康/学业/出行/签约)七边形雷达图, 同心网格+数据多边形(金色线性渐变 url(#radarGold))+7 顶点+7 标签(颜色 var(--accent)); 插入 #fortune-body 的 `.fortune-radar`; 无维度数据时显示占位文案
- **内置宠物素材板块已移除**: 设置页 pets-grid UI 与 settings.js loadPets/EMOJI_FOR 删除(与主题功能冲突); 素材主题(cat1/cat2/caishen)仍保留在主题选择中

### 5. win 问题排查与调参
- **win 托盘图标**: ensureTrayIcon 同时生成 tray-icon.png(64) 与 tray-icon-16.png(16, win 托盘用), PIL 转 睡觉.gif 首帧; Tray 创建时 setImage, 图标缺失 console.error + appendStartupLog 记录(`tray-icon: ok/failed`)
- **win LLM 连不上诊断**: callLLM 失败写 `debug/llm-error.log`(错误类型/状态码/响应体前300字符/是否超时/代理 env HTTP_PROXY/HTTPS_PROXY/NO_PROXY/baseUrl/key 尾4位); Electron 主进程 fetch 走 Chromium 网络栈, win 默认受系统代理影响; LLM 失败自动降级 buildTemplateFortune 保证运势/播报/雷达图有数据
- **默认设置**: activity 默认 clingy(粘人), uiTheme 默认 light(浅色)
- **阶段时长**: 10-20 分钟 → **5-10 分钟**(300000-600000ms)
- **位置权重**: active homeBase30+workEdge20+taskbar25+random25(出去溜达70%); clingy homeBase50+workEdge50(出去50%); quiet homeBase100
- **右键菜单**: 紧凑样式(font 12px / padding 6px 10px) + max-height calc(100%-8px) 滚动, 200x250 内 6 项全可见; 定位 clamp 改 rect.height-196
- **全局细滚动条**: `*::-webkit-scrollbar` 宽 4px 圆角半透明, hover 用 --scrollbar-hover 变亮, 对话/日历/设置统一
- **日历布局**: 关闭按钮移到右上角(参照对话/设置面板); 月历/运势/雷达图/日程详情合并到 `.cal-scroll` 单滚动容器(移除各板块独立滚动, 同设置页)

### 5. 其他约定
- LLM: deepseek-v4-flash, max_tokens ≥16000 (推理模型 reasoning 吃 token)
- 主求方向: settings.mainWish (wealth/love/career/health/study/peace)
- 内置宠物素材: assets/pets/*.png (Noto Emoji) + coin.gif/heart.gif (透明动图, Windows 用), 打包 extraResources → resources/pets; pets:list/pets:image 已支持 .gif; pet:load-image 支持 GIF 魔数检测
- **主题素材系统**: assets/themes/{cat1,cat2,caishen}, 打包 extraResources → resources/themes; 渲染进程按状态经 `themes:asset` IPC 取 data URL 渲染 `<img id=pet-action>` 动图 (全平台, 见上 SwiftShader), 状态→文件名映射在 pet.js `THEME_ACTIONS` (每主题 walk/sleep/happy/sad/play/sit 六状态池, 随机取图)
  - cat1 (萌宠1, 20 个 GIF): 新增 安抚你/别哭别哭/捣蛋踢倒水杯/负"鱼"请罪(注意文件名为**全角引号** U+201C/201D)/好冷/哭了/瞄准准备攻击/欧耶/听音乐/哇羡慕/挖沙/心疼你 + 原 8 个
  - cat2 (萌宠2, 9 个: 8 GIF + 1 WebP `放屁给你吃.webp`): 哈哈哈/哼生气/户外野餐/困了/欧耶/太厉害了/躺着舒服/拖地/放屁给你吃
  - caishen (财神, 2 个 WebP 动图): 财神到/马上有钱
  - 状态语义分类: sleep(睡觉/困了/躺着舒服), happy(爱了爱了/哇我真好看/欧耶/听音乐/哇羡慕/哈哈哈/太厉害了/户外野餐), sad(伤心/哭了/好冷/心疼你/别哭别哭/安抚你/哼生气/放屁给你吃), play(抓你哦/打屁股/抬头看看/偷看/捣蛋踢倒水杯/挖沙/瞄准准备攻击/负"鱼"请罪/拖地), walk(复用 play: 抬头看看/哈哈哈), sit(偷看/挖沙/躺着舒服/户外野餐)
  - 设置页主题: 内置三主题(cat/fortune/bagua) + 素材三主题(cat1 "Q版猫咪-素材" / cat2 "萌宠2-猫咪" / caishen "财神-素材") + custom
- settings.json 位置: ~/.config/wealth-calendar/ (Linux) / %APPDATA%/wealth-calendar (Win)
- 用户偏好中文沟通; 部署/安装类任务给"教程模式"(步骤让用户执行)

## 当前待办 (按优先级)
1. **[主] Windows 实机验证** — 装最新版确认: ①透明桌宠动图主题(Q版猫咪-素材/财神-素材) 素材动图是否正常显示/动画 ②真透明无边框 ③随机行为漫游↔休息 ④点击穿透 ⑤粘人模式(趴窗口/拖动吸附, 依赖 PowerShell 活跃窗口检测) ⑥浅色主题。本机 Linux 已冒烟通过(浅色切换持久化 / 粘人 sit+随机降级 / petSit 居中定位 / 启动默认深色先休息 全 PASS)
2. **即梦凭证验证** — 确认 secret 有效性, 跑通图生视频 (用户有 AK/SK)
3. 壁纸日历样式优化 (用户已看效果, 待反馈)
