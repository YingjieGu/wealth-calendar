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
- **位图 (img/canvas/background-image/video) 在本机无法渲染** — 宠物改用**内联彩色 SVG**(纯矢量 path, 软渲染安全, 见 pet.js svgCat/svgFortune/svgBagua), 不再用 emoji/位图作主渲染; custom 主题 Linux 下也用 SVG 萌猫兜底
- **CSS 不能用 filter** (强制 GPU 合成, 会导致整层不渲染); 动画全用 transform/opacity keyframes (styles.css 宠物动画区)
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
- **全屏漫游(随机行为状态机驱动)**: 宠物固定在窗口中心, 移动完全靠窗口漫游(不再有窗口内 petX/petY 走动)。渲染进程 pet.js 行为状态机交替: 漫游阶段(roamStart→窗口 40ms/tick ~40px/s 随机方向+边缘反弹, 宠物 walk 动图 15-45s) ↔ 休息阶段(roamStop→窗口停下, 随机 sleep/play/happy/sad 动图 10-40s)。漫游由渲染进程经 `roam-start`/`roam-stop` IPC 驱动, 拖动用 roam-pause/resume 临时暂停; `pet-roam` 事件同步宠物走路视觉; `pet-resume` 事件在面板关闭后让行为机重排; 设置 `petRoam` 关闭时只做休息状态循环
- 气泡 #reminder-bubble 可点击 → 打开聊天

### 5. 其他约定
- LLM: deepseek-v4-flash, max_tokens ≥16000 (推理模型 reasoning 吃 token)
- 主求方向: settings.mainWish (wealth/love/career/health/study/peace)
- 内置宠物素材: assets/pets/*.png (Noto Emoji) + coin.gif/heart.gif (透明动图, Windows 用), 打包 extraResources → resources/pets; pets:list/pets:image 已支持 .gif; pet:load-image 支持 GIF 魔数检测
- **主题素材系统**: assets/themes/cat1/*.gif (8张猫咪动作) + assets/themes/caishen/*.webp (财神到/马上有钱, 动图), 打包 extraResources → resources/themes; 渲染进程按状态经 `themes:asset` IPC 取 data URL 渲染 `<img id=pet-action>` 动图 (Windows/macOS), 状态→文件名映射在 pet.js `THEME_ACTIONS`; Linux 软渲染位图全灭, cat1→svgCat/caishen→svgFortune 兜底; 设置页主题新增 "Q版猫咪-素材"(cat1) 与 "财神-素材"(caishen)
- settings.json 位置: ~/.config/wealth-calendar/ (Linux) / %APPDATA%/wealth-calendar (Win)
- 用户偏好中文沟通; 部署/安装类任务给"教程模式"(步骤让用户执行)

## 当前待办 (按优先级)
1. **[主] Windows 实机验证** — 装最新版确认: ①透明桌宠动图主题(Q版猫咪-素材/财神-素材) 素材动图是否正常显示/动画 ②真透明无边框 ③随机行为漫游↔休息 ④点击穿透。本机 Linux 已冒烟通过(SVG 兜底 + 行为状态机 + themes:asset IPC 全 PASS)
2. **即梦凭证验证** — 确认 secret 有效性, 跑通图生视频 (用户有 AK/SK)
3. 壁纸日历样式优化 (用户已看效果, 待反馈)
