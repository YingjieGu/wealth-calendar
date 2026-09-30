# 财神日历 · Wealth Calendar 🧧

> 一款把 **日历 + AI 命理 + 桌面宠物** 融为一体的桌面应用 —— 桌面上的小财神，会陪你、会说话、会算你的今日运势。

<p align="center">
  <img src="icon.png" width="128" alt="财神日历">
</p>

<p align="center">
  <b>Electron 33</b> · <b>Python Sidecar</b> · <b>本地命理计算</b> · <b>LLM 运势解读</b> · <b>Windows / Linux</b>
</p>

---

## ✨ 这是什么

**财神日历**是一款桌面悬浮应用：一只会走动的透明小宠物（萌宠 / 财神 / 十二生肖），
它不只是一个摆件 —— 它会在合适的时间播报你今天的**财运、事业、桃花、学业、出行、签约、健康**，
还能陪聊、捣蛋、提醒日程、生成星盘。

- **有用** — 公历/农历/节气日历 + 日程提醒 + 每日个性化运势
- **有趣** — 桌面宠物陪伴式交互，气泡提醒 + 语音播报
- **个性化** — 基于生辰八字、星盘的深度命理分析，定制吉时与行动建议
- **隐私可控** — 命理计算全部本地完成，敏感数据本地存储，密钥由你自己填

---

## 🚀 功能一览

### 🐾 桌面宠物
- **真·透明镂空**：Windows 上悬浮窗即宠物本身，无边框、透明区域点击穿透
- **位置-阶段行为模型**：宠物在右下角据点 / 活跃窗口上沿 / 任务栏 / 桌面随机位置之间**瞬移**停靠，动作 30–90 秒独立切换
- **三种模式**：安静（只待右下角）、粘人（趴在你正在用的窗口上）、活跃（满桌面溜达）
- **互动玩法**：单击反应、连击彩蛋、右键摇签、拖拽吸附、全局快捷键 `Ctrl+Alt+W` 召唤
- **养成系统**：亲密度 Lv.1–Lv.10、心情状态、每日任务、元宝收集

### 🀄 AI 命理引擎
- **两段式**：本地确定性计算（八字四柱 / 五行十神 / 大运流年 / 星盘 / 黄历）→ LLM 深度解读 → 结构化 JSON 缓存
- **7 维运势**：财运、事业、桃花、健康、学业、出行、签约 + 总分
- **推理链**：先分析日主强弱与当日干支生克，再给分（附「🔍 推理依据」）
- **星盘可视化**：SVG 圆形本命盘（12 宫 + 行星 + ASC/MC 轴线）+ AI 星盘性格解读
- **主求方向**：求财 / 求姻缘 / 求事业 / 求健康 / 求学业 / 求平安，或「✨推荐」按当日运势动态侧重
- **无 Key 降级**：没有配置大模型时自动走本地模板（五行生克 + 河图洛书），功能不中断

### 🕐 十二时辰播报体系
- 一天 **12 个时辰**各一条吉凶宜忌（辰开会 / 巳洽谈 / 午忌冲动 / 未学习 / 申出行 / 酉复盘 / 戌陪伴 / 亥休 / 子安眠…）
- 每条含**五行生克评分 + 宜做池建议**，整天轮转播报
- 22:00–07:00 静音，不打扰休息

### 💬 对话与技能
- 文本 / 语音双通道对话（ASR: faster-whisper，TTS: edge-tts）
- 唤醒口令：喊两遍宠物名字
- **内置技能**：🧮 计算器 · 🌤 天气 · 🌐 翻译 · 🔢 数字吉凶 · 📮 邮件收发（零额外依赖，走 Python 标准库）

### 🎨 主题系统
- 萌宠 / 财神 / 十二生肖收集（元宝解锁）
- **界面主题**：暗色 / 浅色 / 青涩 / 🎨手绘涂鸦（马卡龙柔和系，离线打包手写字体）
- 用户自定义素材上传（GIF / WebP / 透明 PNG）

### 🤝 陪伴模式
- **捣蛋模式**：抢键盘打字吐槽、窗口标题甜系吐槽、桌面图标大乱斗（Windows）
- **伙伴模式**：活跃窗口感知、选中文本总结（`Ctrl+Alt+S`）、URL 内容解析
- **用户记忆体**：记录活跃时段、常见话题、情绪趋势，生成 `MEMORY.md` 并据此调整提醒

---

## 🏗 技术架构

```
┌─────────────────────────────────────────────────────┐
│  Electron 主进程 (src/main)                          │
│  ├── 窗口/托盘/快捷键   ├── 运势引擎 fortuneEngine    │
│  ├── 日程/提醒          ├── 捣蛋·伙伴·记忆体          │
│  └── sidecar 进程管理 ──┐                            │
├─────────────────────────┼───────────────────────────┤
│  渲染进程 (src/renderer) │   Python Sidecar           │
│  ├── pet.js    宠物状态机 │  (python/server.py)        │
│  ├── calendar  日历/星盘  │  ├── lunar-python  农历八字 │
│  ├── chat      对话面板   │  ├── pyswisseph    星盘    │
│  ├── msgCore   消息队列   │  ├── faster-whisper ASR   │
│  └── styles.css 主题      │  └── edge-tts       TTS    │
└─────────────────────────┴───────────────────────────┘
                    ↓
         云端 LLM（OpenAI 兼容 API，默认 DeepSeek）
```

**设计要点**
- 命理计算（八字/星盘/黄历）**完全本地**，不上传生辰数据
- Sidecar 通过 HTTP 与主进程通信，可独立测试：`python3 python/server.py --port 47821`
- 消息按优先级排队（日程 > 运势 > 日常 > 主题），高优先级可打断气泡但不丢消息
- 软渲染环境下全部动画只用 `transform/opacity`（禁用 `filter`），矢量 SVG 保证渲染兼容

---

## 📁 目录结构

```
.
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── main.js            # 窗口/生命周期/IPC
│   │   ├── fortuneEngine.js   # 运势生成与缓存
│   │   ├── timeSlotEngine.js  # 十二时辰播报
│   │   ├── sidecar.js         # Python 进程管理
│   │   ├── prank.js           # 捣蛋模式
│   │   ├── windowInfo.js      # 伙伴模式（窗口感知）
│   │   ├── userMemory.js      # 用户记忆体
│   │   ├── calendarStore.js   # 日程存储
│   │   ├── multimodal.js      # 多模态动图生成
│   │   ├── tray.js            # 托盘
│   │   └── wallpaper.js       # 桌面背景日历
│   ├── renderer/              # 渲染进程
│   │   ├── pet.js             # 宠物状态机 + 气泡队列
│   │   ├── msgCore.js         # 消息池与优先级队列（纯函数，可单测）
│   │   ├── calendar.js        # 日历 / 运势 / 星盘
│   │   ├── starChart.js       # SVG 星盘绘制
│   │   ├── chat.js            # 聊天面板
│   │   ├── settings.js        # 设置面板
│   │   └── styles.css         # 全部主题样式
│   └── preload/preload.js     # IPC 桥接
├── python/
│   └── server.py              # Python sidecar（命理 / ASR / TTS / 邮件）
├── assets/
│   ├── pets/                  # 内置宠物素材
│   ├── themes/                # 主题素材（萌宠/财神/十二生肖）
│   └── fonts/                 # 离线手写字体
├── docs/WINDOWS_DEPLOY.md     # Windows 部署说明
├── 财神日历-设计文档.md        # 产品设计文档
└── v0xx-test.js               # 各版本回归测试脚本
```

---

## 🛠 快速开始

### 前置要求
- **Node.js** ≥ 18
- **Python** 3.10 – 3.12（用于命理引擎与语音）
  ```bash
  pip install lunar-python pyswisseph faster-whisper edge-tts -i https://pypi.tuna.tsinghua.edu.cn/simple
  ```

### 开发运行

```bash
git clone https://github.com/YingjieGu/wealth-calendar.git
cd wealth-calendar
npm install
npm start
```

单独调试命理引擎（可选）：

```bash
python3 python/server.py --port 47821
curl http://127.0.0.1:47821/health
curl -X POST http://127.0.0.1:47821/bazi/paipan -d '{"birth":"1990-05-15 10:30","gender":"男"}'
```

### 打包

```bash
npm run dist:win     # Windows NSIS 安装包
npm run dist:linux   # Linux AppImage
```

> Windows 版已内置 Python 3.11 embeddable 运行时（`assets/python-win/`，需自行放置，不入库），
> 用户机器无需安装 Python 即可运行命理引擎。

---

## ⚙️ 首次配置

启动后 **右键宠物 → 设置**：

1. **用户信息** — 出生年月日时（精确到分钟）+ 性别（用于八字/星盘）
2. **AI 命理** — 填入兼容 OpenAI 模式的 API Key
   - Base URL：`https://api.deepseek.com`
   - Model：`deepseek-chat`
   - 留空则自动降级为本地模板运势
3. **主求方向** — 求财 / 求姻缘 / … / 或「✨推荐」
4. **语音对话** — 点 💬 → 🎤（首次识别会下载 whisper 模型 ~75MB）

本地数据与缓存位置：
- Windows：`%APPDATA%/wealth-calendar/`
- Linux：`~/.config/wealth-calendar/`

（含 `fortune.json` 运势缓存、`userMemory.json` 记忆体、`settings.json` 配置）

---

## 🧪 测试

项目自带逐版本回归测试脚本（纯 Node，无需 GUI）：

```bash
node msg17-test.js        # 消息优先级队列
node zodiac18-test.js     # 主题目录 / 十二生肖
node v028-test.js         # 主题色板
node v031-test.js         # 最新版本断言
```

建议提交前执行 `node --check` 做语法校验。

---

## 📌 版本与里程碑

| 里程碑 | 内容 |
|---|---|
| M0–M6 | 宠物原型 → 日历/日程/提醒 → 命理 Sidecar → 运势流水线 → 对话 → 本地语音 → 主题 → 桌面背景日历 |
| 0.3.x | 豆包式透明桌宠、主题素材系统、位置-阶段行为模型 |
| 0.4.x | 养成情绪价值、捣蛋/伙伴模式、UI 设计系统、技能路由、六类消息优先级队列、十二生肖收集、星盘可视化、用户记忆体、十二时辰播报、多套界面主题 |

当前版本见 [`package.json`](package.json)。

---

## ⚠️ 免责声明

本应用所有运势、命理、星盘内容均由算法与 AI 生成，**仅供娱乐参考，不构成任何决策依据**。
请理性看待，切勿迷信。

---

## 📄 License

暂未指定开源许可证。如需转载或二次使用，请联系作者。
