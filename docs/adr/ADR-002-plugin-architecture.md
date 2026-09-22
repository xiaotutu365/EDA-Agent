# ADR-002: 插件一体化架构 —— agent-core 内置于插件，能力通过 MCP 挂载

## Status
Accepted

## Date
2026-09-21

## Context
最初方案是「VSCode 插件（UI）+ Python 引擎进程（agent-core）」，通过 JSON-RPC over stdio 通信。用户在评审中明确提出两个约束：

1. **所有用户交互都在插件端**，不需要独立的服务端入口
2. **Agent 是主体，MCP/Tool 只是它挂载的能力部件**——Slurm 提交、报告解析等用 MCP server 实现，边界必须清晰：挂上即用、拔掉不影响 Agent 对话

由此重新审视架构：独立的 Python 引擎进程 + 自研 RPC 协议层，在「引擎只服务一个插件客户端」的场景下是不必要的复杂度（两个运行时、IPC 契约维护、双份部署）。

## Decision
采用**插件一体化架构**：

```
VSCode 插件（TypeScript，一个扩展包）
├── agent-core        # Agent 大脑：对话编排、LLM 调用、tool call 循环、会话管理
├── approval-gate     # 提交类 tool 的审批拦截（插件内弹窗确认）
└── MCP Client        # 插件内置 MCP 客户端

MCP Servers（独立进程，按需挂载，语言不限，可用 Python/uv/typer）
├── slurm-mcp         # sbatch / squeue / scancel / 状态轮询
├── report-parser-mcp # 综合报告/log → 结构化结果
└── tcl-knowledge     # DC/Genus 方言模板与少样本（prompt 资源，随插件内置或 MCP 提供）
```

- `agent-core` 用 **TypeScript 实现于插件内**，不再有独立引擎进程与 JSON-RPC 契约
- EDA 能力一律以 **MCP server** 形式外部挂载，插件只含 MCP Client；agent-core 对工具的视角统一为「MCP 提供的 tool 列表」
- 审批控制实现在插件 UI 层：提交类 tool call 发出前必须人工确认（沿用意图文档的权限约束）

## Alternatives Considered

### Python 引擎进程 + JSON-RPC over stdio（原方案）
- Pros: 沿用团队 Python 栈；引擎可脱离 VSCode 独立运行/测试
- Cons: 双运行时与 IPC 契约维护成本；唯一消费者就是插件，独立进程无实际收益
- Rejected: 与「交互全在插件端」「Agent 为主体」的约束不符，复杂度不划算

### 把编排逻辑也放进 MCP（一切皆 MCP）
- Pros: 单一协议
- Cons: MCP 定位是工具协议，对话编排、会话、审批流放在工具侧会颠倒主体与部件的关系，UI 状态同步反而更绕
- Rejected: 违反「MCP 只是 Agent 的一个部分」的划分原则

### 基于现成 Agent 框架（LangChain.js 等）
- Pros: 现成 agent loop
- Cons: 重抽象难调试；核心循环很薄，自研成本低于学习与规避框架的成本（同 ADR-001 结论）
- Rejected: 维持轻依赖策略

## Consequences
- 仓库为 TS 插件 + 若干 MCP server 的 monorepo；Python 退到 MCP server 侧（uv/typer 栈继续使用）
- ADR-001 的模型选型结论**继续有效**（OpenAI 兼容端点、原生 tool calls、DeepSeek-4/Qwen3.8 可配置），仅客户端实现从 Python `openai` SDK 改为 TS 侧等价方案
- 原 `SPEC-agent-core.md`（Python 版，含 JSON-RPC 契约）作废重写；`approval-gate` 不再是独立 Python 模块，改为插件内组件
- 长任务不阻塞对话的需求由「MCP tool 异步返回 + 插件轮询/通知」承接，具体在 SPEC 中定义
- MCP server 与插件通过标准 MCP 协议（stdio）连接，协议由 MCP SDK 保证，无需自研契约文档
