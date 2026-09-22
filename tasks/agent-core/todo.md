# Task List: agent-core

> 依据 `docs/specs/SPEC-agent-core.md` 与 `tasks/agent-core/plan.md`。每个任务遵循 TDD（red-green-refactor），完成即勾选并验证。

## Phase 1: 工程基础

- [x] Task 1: 扩展工程骨架
  - Acceptance: `npm run compile` / `npm test` / `npm run lint` 可用；F5 后扩展激活无报错；`engines.vscode: ^1.90.0` 且 `@types/vscode` 锁 1.90.x
  - Verify: `npm test && npm run compile`；手动 F5 激活
  - Files: `extension/package.json`、`tsconfig.json`、`esbuild.js`、`src/extension.ts`、`test/unit/smoke.test.ts`
  - Dependencies: 无
  - Size: M

- [x] Task 2: 配置模块与 SecretStorage
  - Acceptance: `eda-agent.llm.*` 读取正确；baseUrl 缺失报可操作错误；apiKey 仅从 SecretStorage 读取
  - Verify: `npm test -- config`
  - Files: `src/agent/config.ts`、`test/unit/agent/config.test.ts`（含 VSCode API mock 工具）
  - Dependencies: Task 1
  - Size: S

## Checkpoint: 基础可用
- [ ] 测试/lint/构建全绿
- [ ] F5 激活验证通过

## Phase 2: Agent 核心

- [x] Task 3: 核心类型与 ToolRegistry
  - Acceptance: `AgentTool` / `Message` / `ToolCall` 类型定义；重复注册抛错
  - Verify: `npm test -- toolRegistry`
  - Files: `src/agent/types.ts`、`src/agent/toolRegistry.ts`、`test/unit/agent/toolRegistry.test.ts`
  - Dependencies: Task 2
  - Size: S

- [x] Task 4: llmClient 薄封装
  - Acceptance: openai SDK 封装为可注入接口，支持流式与 tool calls 参数透传
  - Verify: `npm test -- llmClient`
  - Files: `src/agent/llmClient.ts`、`test/unit/agent/llmClient.test.ts`
  - Dependencies: Task 3
  - Size: S

- [x] Task 5: Agent 循环——纯文本 + 单工具
  - Acceptance: 纯文本流式回调输出；单 tool call 执行并回填后产出最终回复
  - Verify: `npm test -- core`
  - Files: `src/agent/core.ts`、`test/unit/agent/core.test.ts`
  - Dependencies: Task 4
  - Size: M

- [x] Task 6: Agent 循环——多工具 / 异常 / 超限
  - Acceptance: 同轮多 tool call 正确处理；工具异常作为结果回填不中断；超 `maxToolRounds` 终止并明示原因
  - Verify: `npm test -- core`
  - Files: `src/agent/core.ts`、`test/unit/agent/core.test.ts`
  - Dependencies: Task 5
  - Size: M

## Checkpoint: 核心循环可用
- [ ] 四条循环路径 mock 测试通过
- [ ] 构建干净，人工 review 后继续

## Phase 3: 会话与 MCP

- [x] Task 7: MCP Client 与 AgentTool 适配
  - Acceptance: 按 `eda-agent.mcp.servers` 启动子进程；`listTools` 适配为 `AgentTool`；`callTool` 正确执行；连接失败不崩溃且可提示
  - Verify: `npm test -- mcp`
  - Files: `src/mcp/client.ts`、`test/unit/mcp/client.test.ts`、`test/fixtures/demo-mcp-server.mjs`
  - Dependencies: Task 3（可与 Task 5/6 并行）
  - Size: M

- [x] Task 8: 会话持久化与恢复
  - Acceptance: 会话 JSON 落盘 globalStorage；恢复后上下文连续；apiKey 等敏感信息不入盘
  - Verify: `npm test -- session`
  - Files: `src/agent/sessionStore.ts`、`test/unit/agent/sessionStore.test.ts`
  - Dependencies: Task 3
  - Size: S

## Checkpoint: 能力接入完成
- [ ] demo MCP tool 进入循环并调用成功
- [ ] 会话 round-trip 通过

## Phase 4: 集成与收尾

- [ ] Task 9: 真实网关集成冒烟
  - Acceptance: 环境变量开关默认跳过；开启后经真实网关完成带 demo tool 的多轮对话
  - Verify: `npm test -- integration`（设置 `EDA_IT_GATEWAY=1` 及网关变量后运行）
  - Files: `test/integration/gateway.test.ts`
  - Dependencies: Task 6, Task 7, Task 8
  - Size: S

- [ ] Task 10: 覆盖率与 lint 收尾
  - Acceptance: `src/agent`、`src/mcp` 覆盖率 ≥ 85%；eslint/prettier 零告警；脚本命令与 README 注释一致
  - Verify: `npm test -- --coverage && npm run lint`
  - Files: `vitest.config.ts`、`.eslintrc`、`package.json`
  - Dependencies: Task 9
  - Size: S

## Checkpoint: 完成
- [ ] SPEC-agent-core.md 验收标准全部满足
- [ ] Ready for review
