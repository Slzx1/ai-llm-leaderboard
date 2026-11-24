# AI 大模型多维度排行榜 (ModelRank)

在线访问：**https://slzx1.github.io/ai-llm-leaderboard/**

一个直接展示排行榜、信息来源权威透明、定时自动同步更新的 AI 大模型多维度评测网站。

## 核心特性

- **开屏直达排行榜**：无冗余落地页，打开即看完整多维度排行。
- **权威公开数据源**：
  - **[LMArena (Chatbot Arena) 官方数据集](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset)**：涵盖综合文本（总体、复杂难题、编程、数学、中文、创意写作、指令遵循）、去风格控制（Style Control）、Web 开发（WebDev）、多模态视觉（Vision）、Agent 智能体（Agent Arena）、联网搜索（Search）、文生图与文生视频 8 大赛道。
  - **[LiveBench 客观无污染评测榜](https://livebench.ai/)**：ICLR 2025 Spotlight 抗数据污染客观基准，覆盖逻辑推理、代码生成、Agent 编程、数学竞赛、数据分析、语言理解与指令遵循。
  - **[OpenRouter Public API](https://openrouter.ai/api/v1/models)**：自动补充匹配模型的上下文窗口（Context Length）及参考 API 定价。
- **官方厂商图标（0 自绘）**：所有厂商图标均直接拉取自官方开源图标资产 `@lobehub/icons-static-svg`、`Simple Icons` 及对应厂商官方网站，并自动适配明/暗主题。
- **定时自动抓取更新**：通过 GitHub Actions（`.github/workflows/update-and-deploy.yml`）每 **6 小时**自动抓取最新官方数据并重新部署至 GitHub Pages，同时支持页面内手动一键检查更新。
- **丰富交互分析**：支持按任意维度列点击排序、开源/闭源筛选、按厂商图标快捷筛选、“仅看各厂商最强”旗舰视图、右侧模型跨赛道能力详情抽屉，以及最多 4 款模型的多维雷达图对比。
