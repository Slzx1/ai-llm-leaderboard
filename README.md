# AI 大模型多维度排行榜 (ModelRank)

在线访问：**https://slzx1.github.io/ai-llm-leaderboard/**

以 **Artificial Analysis Intelligence Index v5** 为核心数据源、**LMArena 人类盲测榜** 为补充的多维度 AI 大模型排行榜网站，第一时间覆盖 Claude Fable 5.2、GPT-6.2 Astra / Sol、Gemini 4、Kimi K3.1 Pro、Qwen4 Max、DeepSeek V4.1、Grok 4.7 等最新前沿模型。

## 核心特性

- **开屏直达排行榜**：无冗余介绍页，打开即看完整多维度排行表，默认自动合并同模型的多个思考档位（`max/xhigh/high/medium/low`），一键取消勾选即可展开全部档位。
- **权威数据源（实时多维度）**：
  - **[Artificial Analysis](https://artificialanalysis.ai/leaderboards/models)**（默认核心数据源）：
    - `综合智力总榜`：Intelligence Index v5 + FrontierCode 2.0、Terminal-Bench 4.0、HLE Diamond、CritPt v2 Hard、AA-Briefcase、AutomationBench、输出速度与综合 API 价格。
    - `编程与 Agent`：前沿编程 2.0、终端工程 4.0、科学终端、自主自动化、长程代码推理。
    - `推理与科研`：人类终极考（HLE Diamond）、前沿科研推理（CritPt v2 Hard）、科学计算、办公实战 Elo、复杂文档解析。
    - `知识与抗幻觉`：Omniscience 全知指数、知识准确率、抗幻觉率、长文本推理（AA-LCR）、专业医疗问答。
    - `速度与价格`：实测吞吐速度（tok/s）、首字延迟（TTFT）、每百万 Token 输入/输出价与单任务平均成本。
  - **[LMArena (Chatbot Arena)](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset)**（互补人类盲测视角）：涵盖 Agent 实战、综合文本盲测、Web 开发与多模态视觉 4 大赛道。
- **100% 官方厂商图标（0 自绘）**：全部来自开源官方图标库 `@lobehub/icons-static-svg`、`Simple Icons` 与 Artificial Analysis 官方厂商 Logo 库，定时同步新厂商时自动拉取官方图标。
- **定时自动更新与部署**：由 GitHub Actions（`.github/workflows/update-and-deploy.yml`）每 **6 小时**自动拉取最新官方榜单并重新部署至 GitHub Pages。
