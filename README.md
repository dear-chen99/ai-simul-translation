
---

# 🎧 AI 同声传译助手

> 基于 Web Speech API、多源翻译引擎、TTS 语音播报的实时同声传译工具。

## 📖 项目简介

本项目是一个基于 Web 的 AI 同声传译助手，利用浏览器麦克风实时采集语音，通过 Web Speech API 进行语音识别，并调用多个翻译源（MyMemory、LibreTranslate、Google 镜像）将识别结果翻译为中文，最终以字幕形式呈现，并支持 TTS 语音播报。

适用于外语演讲、技术分享、国际会议、网课等场景。

## ✨ 主要功能

| 功能模块 | 描述 |
| :--- | :--- |
| **语音识别** | 使用浏览器原生 Web Speech API，支持连续识别和中间结果输出，自动重试机制。 |
| **多语言支持** | 支持 10 种语言（英语、日语、法语、德语、西班牙语、韩语、俄语、意大利语、葡萄牙语、荷兰语）。 |
| **实时翻译** | 集成 3 个翻译源（MyMemory、LibreTranslate、Google 镜像），自动轮询备用，保障翻译可用性。 |
| **TTS 语音播报** | 使用 Web Speech Synthesis API 朗读中文译文，可自由开关。 |
| **历史记录** | 每次停止传译时自动保存原文及译文，支持手动修正译文，并自动记录修正次数。 |
| **音量可视化** | 实时显示麦克风输入音量，提供视觉反馈。 |
| **兼容性处理** | 自动检测浏览器是否支持 Web Speech API，不支持时自动引导至备用录音模式或演示模式。 |
| **备用录音模式** | 基于 WebRTC 录制音频，在不支持语音识别的浏览器中保证基本可用性。 |
| **演示模式** | 模拟语音识别与翻译流程，用于展示和测试。 |
| **玻璃态 UI** | 深色背景、玻璃态半透明面板、动态光晕，视觉精致。 |

## 🛠️ 技术栈与依赖

| 依赖 | 用途 |
| :--- | :--- |
| React 19 | 构建用户界面 |
| Web Speech API (SpeechRecognition) | 语音识别 |
| Web Speech Synthesis API | TTS 语音播报 |
| WebRTC (MediaRecorder) | 备用录音模式 |
| MyMemory API | 翻译服务（源1） |
| LibreTranslate API | 翻译服务（源2） |
| Google Translate 镜像 | 翻译服务（源3） |
| CSS 自定义属性 | 主题与样式管理 |

> **依赖清单**：`react`, `react-dom`, `react-scripts`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `web-vitals`（详见 `package.json`）。

## 💡 原创功能声明

本项目**核心逻辑**（语音识别流水线、多源翻译引擎、TTS 播报控制、历史记录管理、备用录音与演示模式、音量可视化）均为本人独立开发，未直接复制开源项目代码。

部分 UI 样式（如玻璃态效果、按钮样式）参考了开源设计示例，但根据本项目需求进行了自定义修改。

## 📦 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/dear-chen99/ai-simul-translation.git

# 2. 进入项目目录
cd ai-simul-translation

# 3. 安装依赖
npm install

# 4. 启动开发服务器
npm start
```

> 浏览器将自动打开 `http://localhost:3000`。

## 🚀 使用说明

1. **选择识别语言**：从下拉菜单中选取目标语言。
2. **开始传译**：点击「开始同声传译」按钮，允许浏览器访问麦克风。
3. **说话**：对着麦克风朗读外语或中文。
4. **查看结果**：原文面板显示识别文本，译文面板显示翻译结果。
5. **语音播报**：开启「语音播报」开关，译文将自动朗读。
6. **手动修正**：点击译文面板的「修正」按钮，可手动修改译文。
7. **清空历史**：点击「清空」按钮，清除所有历史记录和修正计数。
8. **停止传译**：点击「停止传译」按钮，释放麦克风资源。

> **提示**：推荐使用 Google Chrome 或 Microsoft Edge 浏览器获得最佳体验。

## 📁 项目结构

```
ai-simul-translation/
├── public/
│   ├── index.html
│   └── ...
├── src/
│   ├── App.js          # 主组件（包含全部功能逻辑）
│   ├── App.css         # 全局样式
│   ├── index.js        # 入口文件
│   └── ...
├── package.json        # 依赖与脚本配置
├── package-lock.json
└── README.md
```

## 🎬 演示视频

[点击观看演示视频]（https://www.bilibili.com/video/BV19nEs66EJe?vd_source=6660a7a5e178e8c4810cb91084bedd42）

## ⚠️ 注意事项

- **浏览器兼容性**：Web Speech API 仅支持 Chrome 和 Edge，其他浏览器将自动切换至备用录音模式或演示模式。
- **网络要求**：部分翻译源需要联网调用，若网络不稳定将自动轮询其他源。
- **隐私提醒**：本项目使用本地浏览器 API 处理语音与翻译，数据不会上传至作者服务器。

---
