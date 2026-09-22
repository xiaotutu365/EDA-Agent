# SPEC: agent-core

> 模块归属见 `docs/specs/CAPABILITY-MAP.md`；架构依据见 `docs/adr/ADR-002-plugin-architecture.md`，LLM 选型依据见 `docs/adr/ADR-001-llm-selection.md`。
> 本 spec 只覆盖 `agent-core` 模块（TypeScript，插件内）。UI 面板属 `vscode-extension` spec，MCP servers 属各自 spec。

## Objective

Agent 大脑，作为 TypeScript 模块内置于 VSCode 扩展（不独立成进程）：

- 维护多轮对话上下文，调用内部 LLM 网关（OpenAI 兼容接口，原生 tool calls），流式输出
- 驱动「LLM ↔ Tool」循环：LLM 决定调用工具 → 执行 → 结果回填 → 继续，直到产出最终回复
- 工具统一来自两类来源：插件内置 tool 与 MCP Client 发现的 MCP server tools；本模块定义统一的 Tool 视图
- 会话管理：历史持久化、跨窗口恢复
- 长任务不阻塞：tool 可异步返回，提交类任务交由轮询/通知机制（与 `slurm-mcp` 配合）

**用户故事（本模块交付时）**：工程师在插件聊天面板用自然语言对话；Agent 经内部网关推理并调用工具（本模块用一个内置 demo tool 验证循环；真实 EDA 工具由 MCP servers 提供）；关闭重开窗口后会话可恢复。

**验收标准**：
- 经配置的内部网关（DeepSeek-4 / Qwen3.8）正常对话，聊天面板流式渲染
- tool call 循环完整：单工具 / 多工具 / 工具异常 / 循环超限四条路径行为正确
- `baseUrl` / `apiKey` / `model` 仅来自配置，代码中无写死端点；apiKey 存于 SecretStorage，不落明文
- 会话历史持久化（globalStorage），重载窗口后 `resume` 可继续上下文
- 作为库可脱离 UI 被测试驱动（UI 层依赖注入）

## Tech Stack

- TypeScript（扩展宿主运行时，对应 `engines.vscode: ^1.90.0` 即内置 Node 20.9+；开发工具链系统 Node ≥ 20）
- `openai` npm SDK（OpenAI 兼容端点，遵循 ADR-001 的协议决策）
- `@modelcontextprotocol/sdk`（MCP Client）
- 构建：esbuild（`vscode` 扩展标准脚手架）；测试：`vitest`；lint：`eslint` + `prettier`

**明确不引入**：LangChain.js 等 agent 框架（ADR-001/002）。

## Configuration（VSCode settings）

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `eda-agent.llm.baseUrl` | 内部网关地址 | 无（缺失时报错引导） |
| `eda-agent.llm.model` | 模型名 | `deepseek-4`（备选 `qwen3.8`） |
| `eda-agent.llm.maxToolRounds` | 单轮对话 tool 循环上限 | `10` |
| `eda-agent.mcp.servers` | MCP server 启动配置（command/args/env） | `[]` |
| `eda-agent.llm.apiKey` | **仅存 SecretStorage**，不出现在 settings.json 文档示例中 | 无（缺失时报错引导） |

## Project Structure

```
extension/
  package.json             # 扩展清单（contributes: 配置项、命令、视图）
  src/
    agent/
      core.ts              # Agent 循环：messages ↔ tool calls ↔ tool results
      llmClient.ts         # openai SDK 薄封装（依赖注入点，可 mock）
      toolRegistry.ts      # 内置 tool + MCP tools 的统一视图
      sessionStore.ts      # 会话持久化（globalStorage JSON）
      types.ts             # Message / ToolCall / Session 等核心类型
    mcp/
      client.ts            # MCP Client 封装：启动 server、listTools、callTool
    extension.ts           # 激活入口（组装 agent-core 与 UI，UI 属 vscode-extension spec）
  test/
    unit/                  # vitest，mock llmClient 与 MCP client
    integration/           # 真实网关冒烟（环境变量开关，默认跳过）
```

## 核心设计

### Agent 循环（单轮对话内）

```
user message → LLM（tools = toolRegistry 列表）
  ├─ 返回文本 → 流式输出到面板，结束
  └─ 返回 tool_calls →（提交类先过 approval-gate）→ 执行 → 结果作为 tool 消息回填 → 再调 LLM
```

- 超过 `maxToolRounds` 未产出最终回复：终止并明示原因
- Tool 执行异常：错误信息作为 tool 结果回填，对话不中断

### Tool 统一视图

```typescript
interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

- 内置 tool 直接实现；MCP tools 由 `mcp/client.ts` 做 `listTools` → 适配为 `AgentTool`
- `approval-gate` 以装饰器方式包装 `AgentTool`（标记为需审批的 tool 在执行前触发 UI 确认），本模块只提供包装点

### 会话与长任务

- 会话以 JSON 持久化到 `globalStorage`，含消息历史与进行中任务引用
- 长任务：提交类 tool 立即返回任务句柄；完成通知经 MCP 消息驱动 Agent 主动汇报（与 `slurm-mcp` spec 联合定义）

## Code Style

```typescript
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }
}
```

- 严格模式，`any` 禁用；公开 API 带完整类型与简短 docstring
- 注释只写「为什么」；中文注释，英文标识符
- `prettier` 默认格式化，`eslint` 推荐 + 规则集

## Testing Strategy

- 框架：`vitest`；单测 `test/unit/`（mock `llmClient`、MCP client、VSCode storage API），集成测试 `test/integration/`（真实网关冒烟，默认跳过）
- **TDD**：先写失败测试再实现（用户工作流约定）
- 覆盖重点：Agent 循环四条路径、toolRegistry 冲突注册、MCP→AgentTool 适配、会话持久化 round-trip、配置缺失报错
- 覆盖率目标：`src/agent` 与 `src/mcp` ≥ 85%

## Boundaries

- **Always**: 提交前 `npm test` 与 lint 全绿；端点/密钥只从配置与 SecretStorage 读取；工具异常转为对话内消息
- **Ask first**: 修改 `AgentTool` 接口（下游 MCP 适配与审批都依赖）；新增依赖；修改配置项 key（用户可见接口）
- **Never**: 硬编码网关地址/密钥/模型名；在本模块写 UI 代码（属 `vscode-extension`）或具体 EDA 工具逻辑（属 MCP servers）；把 apiKey 写入日志/会话文件

## Success Criteria

1. 插件聊天面板经真实内部网关完成多轮流式对话（集成测试 + 手动 F5 验证）
2. Mock 测试覆盖：纯文本回复 / 单工具 / 工具异常 / 循环超限 四条路径全部通过
3. `eda-agent.llm.baseUrl` 未配置时，首次对话给出可操作的错误提示
4. 会话保存后重载窗口可继续上下文
5. MCP demo server 的 tool 能出现在 tool 列表并被循环调用
6. 覆盖率 ≥ 85%，lint 无告警

## Open Questions

1. ~~聊天 UI 形态~~ **已决策（2026-09-21）**：自定义 Webview 面板——不依赖 Copilot Chat 扩展，审批弹窗与任务状态展示可完全自定义；细节进 `vscode-extension` spec
2. 长任务完成通知的具体机制（MCP 消息推送 vs 插件定时轮询）——与 `slurm-mcp` spec 联合决策
3. 网关流式 tool calls 是否可用——实现时验证，不支持则 tool call 阶段退化为非流式
