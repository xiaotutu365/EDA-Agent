# SPEC: vscode-extension

> 模块归属见 `docs/specs/CAPABILITY-MAP.md`；架构依据见 `docs/adr/ADR-002-plugin-architecture.md`。
> 本 spec 覆盖插件壳：Webview 聊天面板、审批 UI、任务状态展示、组装层（extension.ts）。Agent 逻辑见 `SPEC-agent-core.md`。

## Objective

插件的 UI 与组装层，对应构建顺序第 1 步「第一个可用产品」：

- **聊天面板**：自定义 Webview（Activity Bar 侧边栏视图），支持多轮流式对话、Markdown 渲染、tool call 状态展示
- **审批 UI**：提交类 tool call 在面板内渲染为审批卡片（批准 / 拒绝 / 编辑后批准），批准前不执行
- **任务状态**：长任务以状态栏指示器 + 面板内任务条展示，完成时通知并驱动 Agent 汇报结果
- **组装层**：`extension.ts` 激活时读取配置、装配 agent-core / MCP Client / approval-gate / Webview，处理生命周期

**用户故事**：工程师安装插件 → 配置网关地址与密钥 → 打开侧边栏聊天面板 → 用自然语言对话，看到流式回复；Agent 要调用提交类工具时先弹出审批卡片；Slurm 任务运行中状态栏有指示，完成后结果自动出现在对话里。

**验收标准**：
- F5 启动扩展后，面板可对话、流式渲染、Markdown 正常显示
- 需审批的 tool call 触发审批卡片；拒绝则不执行并把拒绝原因回传 Agent
- 关闭面板重开，会话历史恢复显示
- 配置缺失（baseUrl/apiKey）时面板内给出可操作的引导提示
- Webview↔宿主消息协议有类型定义，宿主逻辑单测覆盖

## Tech Stack

- TypeScript + VSCode Extension API（`@types/vscode`）
- **版本兼容**：`engines.vscode: ^1.90.0`（扩展宿主内置 Node 20.9+，与系统 Node 无关）；`@types/vscode` 锁定 1.90.x；开发工具链要求系统 Node ≥ 20；不使用高于该下限的 API
- Webview：**vanilla TS**（无前端框架），Markdown 渲染用 `marked`，代码高亮用 VSCode 内置 `vscode-webview` 主题或 `highlight.js`
- Webview↔宿主通信：`postMessage` JSON 消息（协议见下）
- 测试：`vitest`（宿主逻辑 + 协议）+ `@vscode/test-electron`（激活冒烟）

**明确不引入**：React/Vue 等前端框架（面板交互简单，vanilla 足够；引入时机留给 `tcl-knowledge` 之后的评估）、Copilot Chat API（ADR-002）。

## Commands

```bash
cd extension
npm install                # 安装依赖
npm run compile            # esbuild 构建
npm run watch              # 监听构建
npm test                   # vitest 单测
npm run test:e2e           # @vscode/test-electron 激活冒烟（需 VSCode 下载，CI 可跳过）
npm run lint               # eslint + prettier
```

调试：VSCode 中 F5 启动 Extension Development Host。

## Configuration（contributes.configuration）

配置项定义在 `SPEC-agent-core.md`，本模块负责：

- 配置变更监听：`llm.*` 变更后重建 LLM client；`mcp.servers` 变更后重启 MCP 连接
- 首次使用引导：缺失配置时在面板渲染「去设置」按钮，点击跳转对应 settings

## Project Structure

```
extension/
  package.json             # 清单：viewsContainers、views、commands、configuration
  src/
    agent/                 # agent-core（见 SPEC-agent-core.md）
    mcp/                   # MCP Client（见 SPEC-agent-core.md）
    approval/
      gate.ts              # approval-gate：包装需审批的 AgentTool
    ui/
      chatPanel.ts         # WebviewView 注册、宿主侧消息处理
      statusbar.ts         # 状态栏任务指示器
      webview/
        main.ts            # Webview 侧脚本（打包注入）
        protocol.ts        # ★ Webview↔宿主消息协议（唯一事实来源，双侧共用）
        style.css
    extension.ts           # 激活入口：装配与生命周期
  media/                   # 图标等静态资源
  test/
    unit/
    e2e/                   # 激活冒烟
```

## 核心设计

### Webview↔宿主消息协议（`ui/webview/protocol.ts`，双侧共用类型）

```typescript
// webview → host
type ToHost =
  | { type: 'user-message'; text: string }
  | { type: 'approval-response'; callId: string; decision: 'approve' | 'reject' | 'edit'; editedTcl?: string }
  | { type: 'resume-session' };

// host → webview
type ToWebview =
  | { type: 'assistant-delta'; text: string }
  | { type: 'assistant-completed' }
  | { type: 'tool-status'; callId: string; tool: string; state: 'pending-approval' | 'running' | 'done' | 'failed'; summary?: string }
  | { type: 'history-restored'; messages: ChatMessage[] }
  | { type: 'config-error'; message: string };
```

- 协议消息只增不改（新增带 type 判别）；宿主对未知 type 忽略并 log

### 审批流（approval-gate 装配）

1. LLM 返回提交类 tool call → `gate.ts` 拦截，先向面板发 `tool-status(pending-approval)`
2. 用户点「批准 / 拒绝 / 编辑后批准」（编辑仅针对 TCL 文本参数）→ 回传宿主
3. 批准/编辑 → 执行 tool；拒绝 → 把「用户已拒绝及原因」作为 tool 结果回填，Agent 可调整方案
4. 审批状态随会话持久化，重载后可追溯

### 长任务与状态展示

- 提交类 tool 立即返回任务句柄，面板显示运行中任务条，状态栏显示汇总指示（如 `⏳ 2 tasks`）
- 任务完成 → 宿主收到 MCP 通知/轮询结果 → 注入一条系统消息触发 Agent 汇报 → 流式渲染到面板
- Webview 隐藏时宿主照常收发，重开面板时补发增量（`history-restored` + 未完成任务状态）

### 安全

- Webview CSP：`default-src 'none'; script-src 'nonce-xxx'; style-src 'nonce-xxx'`，资源仅本地
- Webview 侧不持有 apiKey，一切 LLM 调用在宿主侧

## Code Style

```typescript
panel.webview.onDidReceiveMessage(async (msg: ToHost) => {
  switch (msg.type) {
    case 'user-message':
      await agent.send(msg.text, (delta) => post({ type: 'assistant-delta', text: delta }));
      break;
    default:
      logger.warn(`unknown message type: ${(msg as { type: string }).type}`);
  }
});
```

- 沿用 agent-core 的风格约定（严格模式、禁 any、中文注释英文标识符）
- 宿主侧禁止直接操作 DOM；Webview 侧禁止访问 vscode API（只能 postMessage）

## Testing Strategy

- **宿主逻辑单测**（vitest，mock webview 与 agent）：消息分发、审批流三态、配置缺失引导、状态栏更新
- **协议测试**：`ToHost`/`ToWebview` 的序列化 round-trip、未知 type 容错
- **激活冒烟**（@vscode/test-electron）：扩展激活、面板打开、无未捕获异常
- UI 视觉与流式渲染手动 F5 验证（TDD 覆盖逻辑层，DOM 不强求自动化）
- 覆盖率目标：`src/approval` 与 `src/ui`（不含 webview/main.ts）≥ 80%

## Boundaries

- **Always**: 消息协议变更同步 `protocol.ts` 单测；提交类 tool 必须经 approval-gate，不允许绕过；CSP 不放宽
- **Ask first**: 引入前端框架或新 UI 依赖；修改协议既有消息；改动 agent-core 公共接口
- **Never**: 在 Webview 中执行远端加载的脚本；在 UI 层写 Agent/EDA 业务逻辑；把 apiKey 传入 Webview

## Success Criteria

1. F5 后完成一轮含流式输出与 Markdown 代码块的多轮对话
2. demo 审批 tool 触发审批卡片，三态（批准/拒绝/编辑后批准）行为正确且拒绝原因回传 Agent
3. 面板重开/窗口重载后会话恢复，任务条与状态栏状态一致
4. 缺失配置时面板内有「去设置」引导，配置后无需重载即可对话
5. 协议与宿主逻辑单测通过，覆盖率达标，lint 无告警

## Open Questions

1. 长任务完成通知机制（MCP 推送 vs 轮询）——与 `slurm-mcp` spec 联合决策，接口已在本 spec 预留
2. 编辑后批准（edit）的交互粒度：v1 仅允许编辑 TCL 文本参数，是否需要更通用——实现后按体验反馈定
