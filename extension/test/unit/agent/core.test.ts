import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatRequest,
  LlmClient,
  LlmResponse,
} from "../../../src/agent/llmClient";
import { ToolRegistry } from "../../../src/agent/toolRegistry";
import type { AgentTool } from "../../../src/agent/types";
import { Agent } from "../../../src/agent/core";

function textResponse(content: string): LlmResponse {
  return { content, toolCalls: [] };
}

function makeClient(): {
  client: LlmClient;
  chatStream: ReturnType<typeof vi.fn>;
} {
  const chatStream = vi.fn();
  const client: LlmClient = {
    chat: vi.fn(),
    chatStream: chatStream as unknown as LlmClient["chatStream"],
  };
  return { client, chatStream };
}

function makeTool(
  name: string,
  executeResult: string,
): { tool: AgentTool; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn().mockResolvedValue(executeResult);
  const tool: AgentTool = {
    name,
    description: `${name} tool`,
    parameters: { type: "object", properties: {} },
    execute: execute as unknown as AgentTool["execute"],
  };
  return { tool, execute };
}

describe("Agent 循环（Task 5：纯文本 + 单工具）", () => {
  let onDelta: ReturnType<typeof vi.fn>;
  let deltas: string[];

  beforeEach(() => {
    deltas = [];
    onDelta = vi.fn((d: string) => deltas.push(d));
  });

  it("纯文本：流式增量按序回调并返回完整回复，历史含 user/assistant", async () => {
    const { client, chatStream } = makeClient();
    chatStream.mockImplementation(
      async (_req: ChatRequest, cb: (d: string) => void) => {
        cb("你好");
        cb("，世界");
        return textResponse("你好，世界");
      },
    );
    const agent = new Agent({
      client,
      registry: new ToolRegistry(),
      maxToolRounds: 10,
    });

    const final = await agent.send("打招呼", onDelta);

    expect(final).toBe("你好，世界");
    expect(deltas).toEqual(["你好", "，世界"]);
    expect(chatStream).toHaveBeenCalledTimes(1);
    const req = chatStream.mock.calls[0]?.[0] as ChatRequest;
    expect(req.messages).toEqual([{ role: "user", content: "打招呼" }]);
    expect(agent.getHistory()).toEqual([
      { role: "user", content: "打招呼" },
      { role: "assistant", content: "你好，世界" },
    ]);
  });

  it("单工具：执行 tool → 结果回填 → 下一轮产出最终回复", async () => {
    const { client, chatStream } = makeClient();
    const { tool, execute } = makeTool("echo", "echo 结果");
    const registry = new ToolRegistry();
    registry.register(tool);
    chatStream
      .mockImplementationOnce(async () => ({
        content: "",
        toolCalls: [{ id: "call_1", name: "echo", args: { text: "hi" } }],
      }))
      .mockImplementationOnce(
        async (_req: ChatRequest, cb: (d: string) => void) => {
          cb("最终");
          cb("回复");
          return textResponse("最终回复");
        },
      );
    const agent = new Agent({ client, registry, maxToolRounds: 10 });

    const final = await agent.send("调用 echo", onDelta);

    expect(execute).toHaveBeenCalledWith({ text: "hi" });
    expect(final).toBe("最终回复");
    expect(chatStream).toHaveBeenCalledTimes(2);

    // 第二轮请求应包含 assistant(toolCalls) 与 tool 结果消息
    const secondReq = chatStream.mock.calls[1]?.[0] as ChatRequest;
    expect(secondReq.messages).toEqual([
      { role: "user", content: "调用 echo" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "echo", args: { text: "hi" } }],
      },
      { role: "tool", content: "echo 结果", toolCallId: "call_1" },
    ]);

    expect(agent.getHistory()).toEqual([
      { role: "user", content: "调用 echo" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "echo", args: { text: "hi" } }],
      },
      { role: "tool", content: "echo 结果", toolCallId: "call_1" },
      { role: "assistant", content: "最终回复" },
    ]);
    expect(deltas).toEqual(["最终", "回复"]);
  });
});
