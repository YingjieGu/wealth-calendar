# 财神日历 Windows 部署说明

## 一、安装 Python 环境（Sidecar 依赖）

财神日历的命理引擎（八字/星盘/黄历）和语音识别需要 Python 3.10-3.12。

1. 下载安装 Python：https://www.python.org/downloads/windows/
   - 安装时**务必勾选 "Add Python to PATH"**
   - 版本选 3.10 或 3.12（64 位）

2. 打开 PowerShell 或 CMD，安装依赖：
```powershell
pip install lunar-python pyswisseph faster-whisper edge-tts -i https://pypi.tuna.tsinghua.edu.cn/simple
```

## 二、安装财神日历

1. 运行 `财神日历 Setup 0.2.0.exe` 安装
2. 安装完成后从桌面/开始菜单启动"财神日历"

## 三、首次使用配置

1. **右键宠物 → 设置**：
   - 用户信息：填写出生年月日时（精确到分钟）+ 性别
   - AI 命理：粘贴 DeepSeek API Key（https://platform.deepseek.com 申请），Base URL 填 `https://api.deepseek.com`，Model 填 `deepseek-v4-flash` 或 `deepseek-chat`
   - 主求方向：选求财/求姻缘等（可选）
2. **AI 运势**：打开日历视图会自动生成今日运势（首次约 30-60 秒，AI 推理中）
3. **语音对话**：点 💬 → 🎤 说话（首次语音识别会下载 whisper 模型 ~75MB，走国内镜像）

## 四、已知说明

- **透明宠物效果**：Windows 上窗口为真·镂空（悬浮框即宠物动图，无边界框），鼠标移到宠物上可交互，透明区域点击穿透
- **多模态动图生成**：设置里填即梦（火山引擎）或可灵 API Key 后，上传图片可 AI 生成动画宠物
- 模型缓存位置：`%APPDATA%/wealth-calendar/`（fortune.json 运势缓存、pet-custom.png 自定义宠物、pet-animation.mp4 动画宠物）

## 五、卸载

控制面板 → 卸载程序 → 财神日历

---

> 后续优化：可将 sidecar 用 PyInstaller 打包为 server.exe 免 Python 环境，正在规划中。
