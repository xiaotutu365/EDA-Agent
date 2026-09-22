# EDA Agent — 意图确认文档

> 经 interview-me 流程确认，用户明确同意（2026-09-21）

## Outcome（产出）
一个 **VSCode 插件形态的 EDA Agent**，工程师用自然语言完成逻辑综合闭环：

1. Agent 编写 TCL（Synopsys DC / Cadence Genus）
2. 经用户确认后，通过 Tool 提交任务到 **Slurm** 集群
3. 轮询任务状态（长任务不阻塞对话）
4. 解析生成的报告（timing / QoR 等）
5. 给出总结与修改建议

## User（用户）
团队内的数字后端工程师。VSCode 运行在个人提交机器上，EDA 工具跑在 Slurm 调度集群上，通过 Agent 的 Tool 功能提交。

## Why now（为什么现在做）
综合流程中写 TCL、盯任务、翻报告重复耗时，希望用自然语言驱动的 Agent 把这条链路自动化。

## Success（成功标准）
工程师能用一句自然语言（如"帮我综合这个 block"）走完整个闭环，并拿到可读的报告解读。

## Constraint（约束）
- LLM 走**内部部署**的 OpenAI 兼容接口（DeepSeek / Qwen 系列），端点可配置，不写死云端 API
- **提交类动作必须人工审批**（权限管控）：Agent 展示 TCL → 用户同意 → 才提交 Slurm
- 长任务（数小时）不阻塞对话，提交后人可离开，之后回来看结果
- 通用 Agent 能力（对话、多轮上下文、Tool 调用）作为基础框架

## Out of scope（明确不做）
- 后端 P&R / 物理实现阶段（后续扩展方向，第一版聚焦逻辑综合）
- 非 OpenAI 兼容的模型接口
- 默认自动重跑 / 无人值守模式
- RTL 前端代码生成

## 技术背景（来自用户画像）
- Python（≥3.11）、uv、hatchling、typer
- 开发方式：垂直切片，尽早交付可用产品；TDD
