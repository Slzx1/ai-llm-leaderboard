# AI 大模型多维度排行榜 (ModelRank)

在线访问：**https://slzx1.github.io/ai-llm-leaderboard/**

以 **Artificial Analysis Intelligence Index v5** 为核心数据源、**LMArena 人类盲测榜** 为补充的多维度 AI 大模型排行榜网站，第一时间覆盖 Claude Fable 5.2、GPT-6.2 Astra / Sol、Gemini 4、Kimi K3.1 Pro、Qwen4 Max、DeepSeek V4.1、Grok 4.7 等最新前沿模型。

## 核心特性

- **开屏直达排行榜**：无冗余介绍页，打开即看完整多维度排行表，默认开启「同模型仅保留最优」（同名模型的不同推理深度如 `max/xhigh/high/medium/low` 仅保留当前排序下最优的一项），取消勾选即可展开全部推理深度。
- **权威数据源（实时多维度，所有列头均带指标悬停说明）**：
  - **[Artificial Analysis](https://artificialanalysis.ai/leaderboards/models)**（默认核心数据源）：
    - `综合智力总榜`：Intelligence Index v5 + 前沿编程（FrontierCode 2.0）、终端 Agent（Terminal-Bench 4.0）、前沿学术难题（HLE Diamond）、科研推理（CritPt v2 Hard）、办公实战（AA-Briefcase）、自主自动化（AutomationBench）、输出速度与综合 API 价格；同步标注「帕累托最优」徽标与一键筛选开关。
    - `帕累托性价比`：交互式帕累托前沿散点图 + 官方厂商图标前沿节点 + 支配模型对比提示，支持「综合价 $/1M」「单任务成本 $/Task」「输出速度 tok/s」与「对数 / 线性」坐标一键切换，随筛选条件动态重算前沿。
    - `编程与 Agent`：前沿编程 2.0、终端工程 4.0、科学终端、自主自动化、长程代码推理。
    - `推理与科研`：前沿学术难题（HLE Diamond）、前沿科研推理（CritPt v2 Hard）、科学计算、办公实战 Elo、复杂文档解析。
    - `知识与抗幻觉`：Omniscience 全知指数、知识准确率、抗幻觉率、长文本推理（AA-LCR）、专业医疗问答。
    - `速度与价格`：实测吞吐速度（tok/s）、首字延迟（TTFT）、每百万 Token 输入/输出价与单任务平均成本。
  - **[LMArena (Chatbot Arena)](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset)**（互补人类盲测视角）：涵盖 Agent 实战、综合文本盲测、Web 开发与多模态视觉 4 大赛道。
- **100% 官方厂商图标（0 自绘）**：全部来自开源官方图标库 `@lobehub/icons-static-svg`、`Simple Icons` 与 Artificial Analysis 官方厂商 Logo 库。
- **SWR（Stale-While-Revalidate）刷新机制**：
  - **前端 SWR**：打开页面先从 `localStorage` 缓存毫秒级秒开，随后后台静默向 Fastly/GitHub CDN（或自定义 Cloudflare Worker 边缘节点）校验数据指纹（`contentHash`）；切换回标签页或网络恢复时自动静默保鲜。
  - **后端每小时变更探测**：GitHub Actions 每小时运行一次轻探针，基于 `contentHash` 仅在榜单数据确实变动时才提交快照并重新部署，无变化零构建。
  - **可选边缘 Worker（15 分钟 Edge SWR）**：仓库内置 [`worker/swr-worker.js`](worker/swr-worker.js)，执行 `cd worker && npx wrangler deploy` 即可部署免费 Cloudflare Worker，并通过 `?api=https://<your-worker>.workers.dev` 接入前端。
