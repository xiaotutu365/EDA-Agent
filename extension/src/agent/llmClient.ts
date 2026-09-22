import OpenAI from "openai";
import type { AgentTool, Message, ToolCall } from "./types";

export interface ChatRequest {
  messages: Message[];
  /** 传给 LLM 的可用工具（来自 ToolRegistry.list()）；为空时不携带 tools 参数 */
  tools?: AgentTool[];
}

/** LLM 单次回复：要么有 content，要么有 toolCalls（也可能同时给出说明文本） */
export interface LlmResponse {
  content: string;
  toolCalls: ToolCall[];
}

/** Agent 循环唯一依赖的 LLM 接口；测试与 UI 层都面向此接口注入 */
export interface LlmClient {
  /** 非流式对话；网关不支持流式 tool calls 时的回退路径 */
  chat(req: ChatRequest): Promise<LlmResponse>;
  /** 流式对话：文本增量经 onDelta 逐段回调，最终返回完整结果 */
  chatStream(
    req: ChatRequest,
    onDelta: (delta: string) => void,
  ): Promise<LlmResponse>;
}

export interface OpenAiClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function toOpenAiTools(tools: AgentTool[] | undefined) {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toOpenAiMessages(messages: Message[]) {
  return messages.map((m) => {
    switch (m.role) {
      case "system":
      case "user":
        return { role: m.role, content: m.content };
      case "tool":
        return {
          role: "tool" as const,
          content: m.content,
          tool_call_id: m.toolCallId ?? "",
        };
      case "assistant": {
        if (!m.toolCalls || m.toolCalls.length === 0) {
          return { role: "assistant" as const, content: m.content };
        }
        return {
          role: "assistant" as const,
          content: m.content,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        };
      }
    }
  });
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("not an object");
  } catch {
    throw new Error(`tool call arguments 不是合法 JSON 对象: ${raw}`);
  }
}

function fromOpenAiToolCalls(
  raw:
    | undefined
    | Array<{ id?: string; function?: { name?: string; arguments?: string } }>,
): ToolCall[] {
  return (raw ?? []).map((tc) => ({
    id: tc.id ?? "",
    name: tc.function?.name ?? "",
    args: parseArgs(tc.function?.arguments ?? ""),
  }));
}

/** openai SDK 薄封装（ADR-001）：只做参数转换与流式聚合，不含业务逻辑 */
export class OpenAiLlmClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: OpenAiClientConfig) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
    });
    this.model = config.model;
  }

  async chat(req: ChatRequest): Promise<LlmResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAiMessages(req.messages),
      ...(toOpenAiTools(req.tools) ? { tools: toOpenAiTools(req.tools) } : {}),
    });
    const message = res.choices[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: fromOpenAiToolCalls(message?.tool_calls),
    };
  }

  async chatStream(
    req: ChatRequest,
    onDelta: (delta: string) => void,
  ): Promise<LlmResponse> {
    const tools = toOpenAiTools(req.tools);
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: toOpenAiMessages(req.messages),
      ...(tools ? { tools } : {}),
      stream: true,
    });

    let content = "";
    // tool call 分片累积：id/name 在首个分片，arguments 跨分片拼接
    const acc = new Map<number, { id: string; name: string; args: string }>();
    for await (const chunk of stream) {
      // 网关可能发出无 choices 的 keep-alive/空 chunk，安全跳过
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }
      if (delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? 0;
        const cur = acc.get(index) ?? { id: "", name: "", args: "" };
        cur.id = tc.id ?? cur.id;
        cur.name = tc.function?.name ?? cur.name;
        cur.args += tc.function?.arguments ?? "";
        acc.set(index, cur);
      }
    }

    const toolCalls = [...acc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => ({ id: v.id, name: v.name, args: parseArgs(v.args) }));
    return { content, toolCalls };
  }
}
