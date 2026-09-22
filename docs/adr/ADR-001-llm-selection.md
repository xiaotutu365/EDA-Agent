# ADR-001: agent-core 的 LLM 选型与接入方式

## Status
Accepted（部分被 ADR-002 取代：客户端实现由 Python `openai` SDK 改为 TS 侧等价方案；端点可配置、原生 tool calls、模型选型结论继续有效）

## Date
2026-09-21

## Context
`agent-core` 是 EDA-Agent 的对话编排中枢，需要选定 LLM 及其接入方式。关键约束：

- **数据合规**：RTL 代码与综合报告不得出公司，必须走**内部部署的 LLM 网关**，禁止直连云端 API
- **接口协议**：内部网关提供 **OpenAI Chat Completions 兼容接口**，且支持 **tool calls（function calling）透传** —— 已与平台方确认
- **可用模型**：DeepSeek-4 与 Qwen3.8（网关可切换）
- **Agent 形态**：核心循环依赖 tool calling（生成 TCL、提交 Slurm、解析报告均为 Tool 调用），模型必须可靠地产生结构化 tool call
- **技术栈**：Python ≥3.11，团队偏好轻量直接依赖，避免重框架

## Decision
1. **接入方式**：使用官方 `openai` Python SDK，`base_url` / `api_key` / `model` 全部通过配置注入（环境变量 + 配置文件），不写死任何端点
2. **Tool 调用方式**：使用网关的**原生 tool calls**，不做 ReAct 式文本解析
3. **模型策略**：`model` 为可配置项，默认 `deepseek-4`；`qwen3.8` 作为备选，通过配置切换，代码层不感知模型差异（同一 OpenAI 兼容协议）

```python
from openai import OpenAI

client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
resp = client.chat.completions.create(
    model=settings.llm_model,          # "deepseek-4" / "qwen3.8"
    messages=messages,
    tools=tool_schemas,                # 原生 tool calls
)
```

## Alternatives Considered

### ReAct 式提示词解析（模型文本输出中解析工具调用）
- Pros: 不依赖网关的 tool calls 支持，任何文本模型都能跑
- Cons: 解析脆弱（格式漂移即失败）、多一轮提示词开销、与已确认的网关能力不匹配
- Rejected: 网关已支持原生 tool calls，没有理由自建解析层

### Agent 框架（LangChain / LangGraph 等）
- Pros: 现成的 agent loop、记忆、工具注册
- Cons: 重抽象，调试困难；内部网关兼容性踩坑成本高；本项目的核心价值在 EDA 领域层（TCL/Slurm/报告），agent loop 本身很薄
- Rejected: 核心循环自研（预计几百行），依赖只保留 `openai` SDK

### 直接用 httpx 手写 Chat Completions 调用
- Pros: 零依赖
- Cons: 流式输出、tool calls 协议细节、错误重试都要自己实现，`openai` SDK 已全部覆盖且是事实标准
- Rejected: 无收益

### 云端 API（OpenAI / DeepSeek 官方云）
- Pros: 免运维、模型最新
- Cons: 违反数据合规约束（设计数据不得出公司）
- Rejected: 硬性红线

## Consequences
- `agent-core` 对模型的全部假设收敛为「OpenAI 兼容 + 原生 tool calls」一个协议边界，网关换模型/推理引擎无需改代码
- 需要在配置层定义 `llm_base_url` / `llm_api_key` / `llm_model`（含默认值），并在 SPEC-agent-core 中明确
- 若未来网关 tool calls 透传出现兼容性问题，回退方案是 ReAct 解析层（届时写新 ADR 取代本条）
- 模型能力差异（DeepSeek-4 vs Qwen3.8 的 tool call 质量）需在集成测试中用真实网关验证，单测用 mock
