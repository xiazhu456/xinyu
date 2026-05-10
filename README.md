# 🏝️ 心屿 · AI 情感树洞

> **每个人都是独一无二的。你的情绪、性格、你看世界的方式——都值得被真正看见。**

心屿是一个 AI 情感陪伴与成长顾问。它不只是聊天，而是在倾听中了解你的人格类型和情绪模式，给出真正适合你的建议。

## ✨ 产品亮点

### 💬 智能倾诉
基于 DeepSeek API 的流式对话，AI 以温暖共情的方式倾听，并在了解你的过程中逐渐给出个性化回应。

### 🧠 人格分析
结合 **MBTI + 九型人格** 理论，基于多次对话记录分析用户情绪模式，生成专属人格画像。

### 🌱 情绪追踪
自动记录每次对话的情绪状态，生成情绪变化图表，帮助用户看见自己的情绪轨迹。

### 🔧 智能工具推荐
不同于传统工具箱需要用户主动寻找，心屿会根据对话中识别到的情绪状态，**主动推荐** 合适的调节工具（呼吸法、Grounding 练习等）。

## 🛠️ 技术栈

| 层 | 技术 |
|---|------|
| 前端 | HTML + CSS + Vanilla JS |
| 后端 | Node.js + Express |
| AI | DeepSeek API（流式输出） |
| 数据 | localStorage（浏览器本地存储） |
| 部署 | Railway |

## 🏗️ 项目结构

```
xinyu/
├── server.js          # Express 后端 + DeepSeek API 集成
├── package.json       # 项目配置
├── .env               # API Key 配置
├── .gitignore
└── public/
    ├── index.html     # 主页面
    ├── styles.css     # 温暖治愈风格样式
    └── app.js         # 前端交互逻辑
```

## 🚀 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
# 在 .env 文件中填写你的 DeepSeek API Key

# 3. 启动
node server.js

# 4. 打开浏览器访问
# http://localhost:3000
```

## 📦 线上地址

[https://sweet-upliftment-production-780f.up.railway.app](https://sweet-upliftment-production-780f.up.railway.app)

## 🧭 产品设计思路

> 详见 [docs/product-thinking.md](docs/product-thinking.md)

核心设计原则：
1. **先倾听，再建议** —— 让用户感到被真正理解，而不是被分析
2. **因人而异** —— 同样的问题，不同性格的人需要不同的应对方式
3. **主动性** —— 好的工具不需要用户自己找，而是在需要时自然出现
