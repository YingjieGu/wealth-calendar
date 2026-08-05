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
- **三种宠物模式(settings.activity)与行为状态机** (宠物固定在窗口中心, 移动靠窗口位置管理):
  - **active 活跃**: 全屏漫游(roamStart→窗口 40ms/tick ~40px/s 随机方向+边缘反弹, 宠物 walk 动图 15-45s) ↔ 休息(roamStop→窗口停下, 随机 sleep/play/happy/sad 10-40s), 随机动或不动
  - **quiet 安静**: 只在屏幕右下角据点(workArea 右下角留 20px, `pet-corner` IPC), 不漫游, 状态只 sleep/idle; 拖动后停在新位置不再回角(本阶段不重复 dock)
  - **clingy 粘人**: 默认右下角据点休息(sleep/sad 等, 切粘人先强制在角落睡一轮); 抽到 happy/play → 趴到当前活跃窗口上沿居中(`sitWindowOn`: y=工作窗y-宠物高+10, 顶部空间不足贴下沿 y=工作窗y+高+10), 玩耍 20-60s 后回右下角; 鼠标在工作窗口内快速移动时概率性跟过去(`pet-follow-mouse` 挪到鼠标上方~100px, `pet-mouse-fast` 事件限流, 渲染概率 35%+冷却 15s)
  - 漫游仅 active 模式启用; 拖动 roam-pause/resume 临时暂停; `pet-roam` 事件同步走路视觉; `pet-resume` 事件面板关闭后重排; `petRoam` 关闭时 active 只休息循环
- **主进程行为支撑**: `getActiveWindowRect()` 平台适配器(Linux xdotool→xprop+xwininfo 退化, Win PowerShell GetForegroundWindow, macOS osascript; 全 try/catch 失败返 null; 自动排除宠物窗口自身); IPC: `pet-sit`(趴窗定位) / `pet-snap`(拖动松手吸附) / `pet-corner`(右下角停靠) / `pet-follow-mouse`(跟鼠标) / `get-active-window-rect`; 渲染进程 `_beginQuietPhase`/`_beginClingyRest`/`_beginSitPhase`/`_handleMouseFast`/`onDragRelease` 驱动
- **悬浮窗无边框(全平台)**: `#app` 无 border/outline/box-shadow; 各主题背景也去边框; `body.theme-light #app.theme-*` 不再设边框(曾因 specificity 高于 `body.platform-win32 #app` 在 win32+浅色下残留 1px 边框); win32 透明规则全部 `!important`
- 气泡 #reminder-bubble 可点击 → 打开聊天

### 5. 界面主题 (浅色)
- styles.css 用 CSS 变量实现界面主题: `:root` 深色默认(--panel-bg/--text/--card/--input-border/--accent 等), `body.theme-light` 覆盖为浅色(白色/米色背景+深色文字+暗金点缀); 面板/日历/聊天/设置/右键菜单/提示 toast/输入框(含 color-scheme)全部适配; 宠物悬浮窗背景随浅色转浅(win32 透明模式不受影响); 金色按钮(#ffd700 渐变)两主题通用保持亮金
- 设置页「界面主题」深/浅切换, settings.json 存 `uiTheme`, 重启保持; body class 由 settings.js `applyUiTheme` 控制

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
