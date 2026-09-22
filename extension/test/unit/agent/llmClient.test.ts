import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentTool, Message } from "../../../src/agent/types";

// 拦截 openai SDK 默认导出，捕获构造参数与 create 调用
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  ctorConfig: undefined as unknown,
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mocks.create } };
    constructor(config: unknown) {
      mocks.ctorConfig = config;
    }
  }
  return { default: MockOpenAI };
});

import { OpenAiLlmClient } from "../../../src/agent/llmClient";

const demoTool: AgentTool = {
  name: "submit_synthesis",
  description: "提交综合任务",
  parameters: { type: "object", properties: { tcl: { type: "string" } } },
  execute: async () => "ok",
};

const cfg = {
  baseUrl: "http://gateway.internal/v1",
  apiKey: "sk-test",
  model: "deepseek-4",
};

describe("OpenAiLlmClient", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });

  it("构造时用配置创建 SDK 客户端", () => {
    new OpenAiLlmClient(cfg);

    expect(mocks.ctorConfig).toEqual({
      baseURL: cfg.baseUrl,
      apiKey: cfg.apiKey,
    });
  });

  it("chat：透传 model/messages，AgentTool 转为 OpenAI tool 格式，结果映射回 ToolCall", async () => {
    mocks.create.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "submit_synthesis",
                  arguments: '{"tcl":"compile"}',
                },
              },
            ],
          },
        },
      ],
    });
    const client = new OpenAiLlmClient(cfg);
    const messages: Message[] = [{ role: "user", content: "综合这个设计" }];

    const res = await client.chat({ messages, tools: [demoTool] });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "deepseek-4",
        messages: [{ role: "user", content: "综合这个设计" }],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_synthesis",
              description: "提交综合任务",
              parameters: demoTool.parameters,
            },
          },
        ],
      }),
    );
    expect(res.content).toBe("");
    expect(res.toolCalls).toEqual([
      { id: "call_1", name: "submit_synthesis", args: { tcl: "compile" } },
    ]);
  });

  it("chat：tools 为空时不携带 tools 参数", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "你好" } }],
    });
    const client = new OpenAiLlmClient(cfg);

    const res = await client.chat({
      messages: [{ role: "user", content: "hi" }],
    });

    const req = mocks.create.mock.calls[0]?.[0] as
      Record<string, unknown> | undefined;
    expect(req).not.toHaveProperty("tools");
    expect(res.content).toBe("你好");
    expect(res.toolCalls).toEqual([]);
  });

  it("chat：消息角色映射（assistant.toolCalls 序列化、tool 带 tool_call_id）", async () => {
    mocks.create.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "done" } }],
    });
    const client = new OpenAiLlmClient(cfg);
    const messages: Message[] = [
      { role: "system", content: "你是 EDA 助手" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_9", name: "demo", args: { a: 1 } }],
      },
      { role: "tool", content: "tool 输出", toolCallId: "call_9" },
    ];

    await client.chat({ messages });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "你是 EDA 助手" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_9",
                type: "function",
                function: { name: "demo", arguments: '{"a":1}' },
              },
            ],
          },
          { role: "tool", content: "tool 输出", tool_call_id: "call_9" },
        ],
      }),
    );
  });

  it("chatStream：文本增量按序回调，最终返回完整内容", async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: "你" } }] };
        yield { choices: [{ delta: { content: "好" } }] };
      })(),
    );
    const client = new OpenAiLlmClient(cfg);
    const deltas: string[] = [];

    const res = await client.chatStream(
      { messages: [{ role: "user", content: "hi" }] },
      (d) => deltas.push(d),
    );

    expect(deltas).toEqual(["你", "好"]);
    expect(res.content).toBe("你好");
    expect(res.toolCalls).toEqual([]);
    const req = mocks.create.mock.calls[0]?.[0] as
      Record<string, unknown> | undefined;
    expect(req).toMatchObject({ model: "deepseek-4", stream: true });
  });

  it("chat：arguments 非法 JSON 或非对象时抛错", async () => {
    for (const bad of ["{bad", '"just-a-string"', "[1,2]"]) {
      mocks.create.mockResolvedValue({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_bad",
                  type: "function",
                  function: { name: "x", arguments: bad },
                },
              ],
            },
          },
        ],
      });
      const client = new OpenAiLlmClient(cfg);

      await expect(
        client.chat({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("不是合法 JSON");
    }
  });

  it("chatStream：空 arguments 与无 delta 的 chunk 均安全处理", async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield {};
        yield { choices: [] };
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_e",
                    type: "function",
                    function: { name: "x", arguments: "" },
                  },
                ],
              },
            },
          ],
        };
      })(),
    );
    const client = new OpenAiLlmClient(cfg);

    const res = await client.chatStream(
      { messages: [{ role: "user", content: "hi" }] },
      () => undefined,
    );

    expect(res.content).toBe("");
    expect(res.toolCalls).toEqual([{ id: "call_e", name: "x", args: {} }]);
  });

  it("chatStream：tool calls 跨分片累积（id/name 首片，arguments 拼接）", async () => {
    mocks.create.mockResolvedValue(
      (async function* () {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "submit_synthesis", arguments: '{"tc' },
                  },
                ],
              },
            },
          ],
        };
        yield { choices: [{ delta: { content: "正在提交" } }] };
        yield {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: 'l":"x"}' } }],
              },
            },
          ],
        };
      })(),
    );
    const client = new OpenAiLlmClient(cfg);
    const deltas: string[] = [];

    const res = await client.chatStream(
      { messages: [{ role: "user", content: "go" }] },
      (d) => deltas.push(d),
    );

    expect(deltas).toEqual(["正在提交"]);
    expect(res.toolCalls).toEqual([
      { id: "call_1", name: "submit_synthesis", args: { tcl: "x" } },
    ]);
  });
});
