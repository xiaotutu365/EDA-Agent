import type { LlmClient, LlmResponse } from "./llmClient";
import type { ToolRegistry } from "./toolRegistry";
import type { Message, ToolCall, ToolResult } from "./types";

export interface AgentOptions {
  client: LlmClient;
  registry: ToolRegistry;
  /** 单次 send 内 tool 循环上限 */
  maxToolRounds: number;
}

async function executeToolCall(
  registry: ToolRegistry,
  call: ToolCall,
): Promise<ToolResult> {
  try {
    const tool = registry.get(call.name);
    if (!tool) {
      return `错误：未知工具 ${call.name}`;
    }
    return await tool.execute(call.args);
  } catch (e) {
    // 工具异常转为结果回填，对话不中断（spec 核心设计）
    return `错误：工具 ${call.name} 执行失败：${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Agent 大脑：维护多轮历史，驱动「LLM ↔ Tool」循环直到产出最终回复 */
export class Agent {
  private readonly client: LlmClient;
  private readonly registry: ToolRegistry;
  private readonly maxToolRounds: number;
  private history: Message[] = [];

  constructor(options: AgentOptions) {
    this.client = options.client;
    this.registry = options.registry;
    this.maxToolRounds = options.maxToolRounds;
  }

  /**
   * 发送用户消息并流式产出回复。
   * 文本增量经 onDelta 逐段回调（跨多个 tool 轮次持续回调），返回最终 assistant 文本。
   */
  async send(text: string, onDelta: (delta: string) => void): Promise<string> {
    this.history.push({ role: "user", content: text });
    const tools = this.registry.list();

    for (let round = 0; round < this.maxToolRounds; round++) {
      // 传快照而非 history 引用：后续轮次 append 不应影响已发出的请求
      const res: LlmResponse = await this.client.chatStream(
        { messages: [...this.history], tools },
        onDelta,
      );

      if (res.toolCalls.length === 0) {
        this.history.push({ role: "assistant", content: res.content });
        return res.content;
      }

      this.history.push({
        role: "assistant",
        content: res.content,
        toolCalls: res.toolCalls,
      });
      for (const call of res.toolCalls) {
        const result = await executeToolCall(this.registry, call);
        this.history.push({
          role: "tool",
          content: result,
          toolCallId: call.id,
        });
      }
    }

    // Task 6 细化超限行为；此处先给出明确错误
    throw new Error(
      `已达 tool 循环上限（${this.maxToolRounds} 轮）仍未产出最终回复`,
    );
  }

  /** 当前完整对话历史（sessionStore 持久化用） */
  getHistory(): Message[] {
    return this.history;
  }
}
