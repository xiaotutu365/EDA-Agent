# EDA-Agent

面向数字后端设计的 EDA Agent：以 VSCode 插件为载体，通过自然语言对话驱动 LLM 编排工具——TCL 代码生成、EDA 工具执行、报告解析与解读。团队工具链为 Synopsys / Cadence，任务提交至 Slurm 调度集群，LLM 走内部网关（OpenAI 兼容接口，DeepSeek-4 / Qwen3.8）。

## 架构

插件一体化架构（[ADR-002](docs/adr/ADR-002-plugin-architecture.md)）：Agent 大脑以 TypeScript 内置于插件，EDA 能力以 MCP server 形式挂载，Agent 是主体，MCP/Tool 只是部件。

| 模块 | 职责 | 状态 |
|---|---|---|
| `agent-core` | 对话编排、LLM 调用（原生 tool calls）、tool 循环、会话管理 | ✅ 已完成 |
| `vscode-extension` | 聊天面板、审批 UI、任务状态展示、组装层 | 规划中 |
| `approval-gate` | 提交类 tool call 审批（批准 / 拒绝 / 编辑后批准） | 规划中 |
| `slurm-mcp` | `sbatch` / `squeue` / `scancel` / 任务状态轮询 | 规划中 |
| `report-parser-mcp` | 报告/log → 结构化结果（WNS/TNS/面积/告警） | 规划中 |
| `tcl-knowledge` | DC/Genus 方言模板与少样本知识 | 规划中 |

构建顺序与模块依赖见 [CAPABILITY-MAP.md](docs/specs/CAPABILITY-MAP.md)。

## 快速开始

```bash
cd extension
npm install
```

VSCode 中按 `F5` 启动 Extension Development Host 验证激活。

### 配置

在 VSCode 设置（`settings.json`）中填写：

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `eda-agent.llm.baseUrl` | 内部网关地址（必填，缺失时报错引导） | 无 |
| `eda-agent.llm.model` | 模型名 | `deepseek-4` |
| `eda-agent.llm.maxToolRounds` | 单轮对话 tool 循环上限 | `10` |
| `eda-agent.mcp.servers` | MCP server 启动配置（command/args/env） | `[]` |

> **apiKey 不进 settings.json**：密钥仅存 VSCode SecretStorage（键名 `eda-agent.llm.apiKey`），settings 中同名配置会被忽略。

## 开发命令（extension/）

| 命令 | 说明 |
|---|---|
| `npm run compile` | tsc 类型检查 + esbuild 打包到 `out/` |
| `npm run watch` | 监听构建 |
| `npm test` | vitest 单测（`test/unit/`） |
| `npm run test:watch` | vitest 监听模式 |
| `npm run lint` | eslint + prettier 检查 |

覆盖率（阈值 85%，`src/agent` 与 `src/mcp`）：

```bash
npm test -- --coverage
```

真实网关集成冒烟（默认跳过，需网关凭据）：

```bash
EDA_IT_GATEWAY=1 EDA_IT_BASE_URL=<网关地址> EDA_IT_API_KEY=<密钥> [EDA_IT_MODEL=<模型>] npm test -- integration
```

调试：VSCode 中 `F5` 启动 Extension Development Host。

## 目录结构

```
EDA-Agent/
├── AGENTS.md            # AI agent 工作流约定（spec 驱动 + TDD）
├── docs/
│   ├── adr/             # 架构决策记录（LLM 选型、插件架构）
│   ├── intent/          # 需求意图声明
│   └── specs/           # 能力地图与各模块 spec（唯一事实来源）
├── tasks/               # 按功能隔离的任务目录（plan.md + todo.md）
└── extension/           # VSCode 扩展工程
    ├── src/agent/       # agent-core：core / llmClient / toolRegistry / sessionStore / config
    ├── src/mcp/         # MCP Client：stdio 子进程管理与 AgentTool 适配
    └── test/            # unit（vitest）+ integration（真实网关）+ fixtures（demo MCP server）
```

## 文档

- **意图**：[docs/intent/eda-agent.md](docs/intent/eda-agent.md)
- **能力地图**：[docs/specs/CAPABILITY-MAP.md](docs/specs/CAPABILITY-MAP.md)
- **模块 spec**：[SPEC-agent-core.md](docs/specs/SPEC-agent-core.md)、[SPEC-vscode-extension.md](docs/specs/SPEC-vscode-extension.md)
- **ADR**：[ADR-001 LLM 选型](docs/adr/ADR-001-llm-selection.md)、[ADR-002 插件架构](docs/adr/ADR-002-plugin-architecture.md)
- **任务进度**：[tasks/agent-core/todo.md](tasks/agent-core/todo.md)

## 当前状态

- [x] agent-core：Agent 循环（纯文本 / 单工具 / 多工具 / 异常回填 / 超限）、配置与 SecretStorage、MCP Client、会话持久化、覆盖率与 lint 达标
- [ ] 待人工验证：F5 激活、真实网关集成冒烟
- [ ] 下一步：`vscode-extension`（聊天面板 + 审批 UI + 组装层）→ MCP Client 接入 `slurm-mcp`
