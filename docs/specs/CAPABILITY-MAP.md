# Capability Map: EDA-Agent

> 经用户确认（2026-09-21，架构随 ADR-002 修订）。意图来源见 `docs/intent/eda-agent.md`。
> 架构：插件一体化（ADR-002）——agent-core 内置于 VSCode 插件（TypeScript），EDA 能力以 MCP server 形式挂载，Agent 是主体，MCP/Tool 只是部件。

| Module id | Responsibility | Depends on |
|---|---|---|
| `agent-core` | Agent 大脑（TS，插件内）：对话编排、LLM 调用（OpenAI 兼容端点，原生 tool calls）、tool call 循环、会话管理 | — |
| `approval-gate` | 提交类 tool call 的审批拦截（插件内弹窗：批准 / 拒绝 / 编辑后批准） | agent-core |
| `vscode-extension` | 插件壳：聊天面板、审批 UI、任务状态展示；承载 agent-core 与 MCP Client | agent-core, approval-gate |
| `slurm-mcp` | MCP server：`sbatch` 提交、`squeue` 查询、`scancel` 取消、任务状态轮询 | agent-core（经 MCP 协议） |
| `report-parser-mcp` | MCP server：综合报告/log → 结构化结果（WNS/TNS/面积/告警等） | agent-core（经 MCP 协议） |
| `tcl-knowledge` | DC/Genus 方言模板、少样本，Agent 生成 TCL 的知识来源（随插件内置的 prompt 资源） | agent-core |

## Build order（垂直切片，每层结束都有可用产品；所有用户交互都在插件端）

1. `vscode-extension` + `agent-core` — 插件内聊天面板连通 LLM，可多轮对话（第一个可用产品）
2. MCP Client + `approval-gate` + `slurm-mcp` — 插件内确认后提交综合任务、查询状态
3. `report-parser-mcp` — 任务结束后自动解析报告并解读（闭环打通）
4. `tcl-knowledge` — TCL 生成质量提升（模板/方言支持）

各模块 spec：`docs/specs/SPEC-<module-id>.md`（按构建顺序陆续产出）。
