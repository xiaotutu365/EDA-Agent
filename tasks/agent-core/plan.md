# Implementation Plan: agent-core（SPEC-agent-core.md）

## Overview

把 agent-core（VSCode 插件内的 Agent 大脑，TypeScript）拆为 TDD 任务：从扩展工程骨架起步，先打通「对话 + tool call 循环」，再补会话持久化与 MCP 工具接入，最后用真实网关做集成冒烟。每个任务遵循 red-green-refactor，完成即可验证。

## Architecture Decisions

- 插件一体化架构，无独立引擎进程（ADR-002）
- LLM 走 OpenAI 兼容端点 + 原生 tool calls，模型可配置（ADR-001）；`llmClient.ts` 为唯一依赖注入点
- 工具统一视图 `AgentTool`：内置 tool 直接实现，MCP tool 经适配层接入；approval-gate 以装饰器挂入（后续模块消费此接口，契约变更需 Ask first）
- apiKey 只存 SecretStorage；配置缺失必须给出可操作错误

## 依赖图

```
Task 1 扩展工程骨架
  └─ Task 2 配置模块（config + SecretStorage）
       └─ Task 3 类型与 ToolRegistry（AgentTool 契约）
            ├─ Task 4 llmClient 封装
            │    └─ Task 5 Agent 循环：纯文本 + 单工具
            │         └─ Task 6 Agent 循环：多工具 + 异常 + 超限
            ├─ Task 7 MCP Client 与 AgentTool 适配
            └─ Task 8 会话持久化 sessionStore
                 └─ Task 9 组装与集成冒烟（真实网关）
                      └─ Task 10 覆盖率与质量收尾
```

Task 7 与 Task 5/6 可并行（都只依赖 Task 3/4）；其余按序。

## Task List

### Phase 1: 工程基础
- [ ] Task 1: 扩展工程骨架（esbuild + vitest + eslint + F5 空壳）
- [ ] Task 2: 配置模块与 SecretStorage

### Checkpoint: 基础可用
- [ ] `npm test`、`npm run lint`、`npm run compile` 全绿
- [ ] F5 可激活扩展，缺配置时报可操作错误

### Phase 2: Agent 核心
- [ ] Task 3: 核心类型与 ToolRegistry（AgentTool 契约）
- [ ] Task 4: llmClient 薄封装
- [ ] Task 5: Agent 循环——纯文本 + 单工具路径
- [ ] Task 6: Agent 循环——多工具 / 异常回填 / 循环超限

### Checkpoint: 核心循环可用
- [ ] 四条循环路径 mock 测试全部通过
- [ ] 构建干净， review 后继续

### Phase 3: 会话与 MCP
- [ ] Task 7: MCP Client 与 AgentTool 适配
- [ ] Task 8: 会话持久化与恢复

### Checkpoint: 能力接入完成
- [ ] demo MCP server 的 tool 可进入循环并被调用
- [ ] 会话 round-trip 测试通过

### Phase 4: 集成与收尾
- [ ] Task 9: 真实网关集成冒烟（环境变量开关）
- [ ] Task 10: 覆盖率达标与 lint 收尾

### Checkpoint: 完成
- [ ] SPEC-agent-core.md 验收标准全部满足
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 内部网关 tool calls 兼容性与预期不符 | High | Task 9 前置冒烟；不支持流式 tool calls 则该阶段退化为非流式（spec 已预留回退） |
| `@modelcontextprotocol/sdk` API 记忆偏差 | Medium | 实现时对照官方文档（source-driven-development），不凭记忆写 |
| VSCode 测试 API（mock SecretStorage/globalStorage）繁琐 | Medium | Task 2 即建立可复用的 mock 工具函数 |
| esbuild 脚手架与 vitest 配置冲突 | Low | Task 1 一次调通并锁定版本 |

## Open Questions

- 无阻塞项；网关流式 tool calls 能力在 Task 9 验证
