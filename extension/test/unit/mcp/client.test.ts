import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMcpServers, McpClient } from "../../../src/mcp/client";
import { ToolRegistry } from "../../../src/agent/toolRegistry";
import { Agent } from "../../../src/agent/core";
import type { ChatRequest, LlmClient } from "../../../src/agent/llmClient";

const fixture = "test/fixtures/demo-mcp-server.mjs";
const serverConfig = { command: process.execPath, args: [fixture] };

// 子进程生命周期：每个用例独立连接，结束后统一关闭
const openClients: McpClient[] = [];

afterEach(async () => {
  for (const c of openClients.splice(0)) {
    await c.close().catch(() => undefined);
  }
});

describe("McpClient", () => {
  it("连接 demo server：listTools 适配为 AgentTool，execute 正确调用", async () => {
    const mcp = await McpClient.connect(serverConfig);
    openClients.push(mcp);

    const tools = await mcp.listAgentTools();
    const echo = tools.find((t) => t.name === "echo");

    expect(echo).toBeDefined();
    expect(echo?.description).toBe("回显输入文本");
    expect(echo?.parameters).toMatchObject({ type: "object" });

    const result = await echo!.execute({ text: "hi" });
    expect(result).toBe("echo: hi");
  }, 15000);

  it("MCP isError 结果转为 execute 抛错（Agent 循环会回填为错误消息）", async () => {
    const mcp = await McpClient.connect(serverConfig);
    openClients.push(mcp);

    const fail = (await mcp.listAgentTools()).find((t) => t.name === "fail")!;

    await expect(fail.execute({})).rejects.toThrow("坏了");
  }, 15000);

  it("MCP tool 可进入 Agent 循环：mock LLM 请求调用 echo，真实执行后产出最终回复", async () => {
    const mcp = await McpClient.connect(serverConfig);
    openClients.push(mcp);
    const registry = new ToolRegistry();
    for (const t of await mcp.listAgentTools()) {
      registry.register(t);
    }

    const chatStream = vi
      .fn()
      .mockImplementationOnce(async () => ({
        content: "",
        toolCalls: [{ id: "call_1", name: "echo", args: { text: "循环里" } }],
      }))
      .mockImplementationOnce(async () => ({
        content: "echo 返回成功",
        toolCalls: [],
      }));
    const client: LlmClient = {
      chat: vi.fn(),
      chatStream: chatStream as unknown as LlmClient["chatStream"],
    };
    const agent = new Agent({ client, registry, maxToolRounds: 10 });

    const final = await agent.send("调 echo", () => undefined);

    expect(final).toBe("echo 返回成功");
    const secondReq = chatStream.mock.calls[1]?.[0] as ChatRequest;
    const toolMsg = secondReq.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toBe("echo: 循环里");
  }, 15000);

  it("connectMcpServers：单个 server 连接失败不崩溃，错误可提示，其余正常接入", async () => {
    const res = await connectMcpServers([
      { command: "no-such-command-xyz" },
      serverConfig,
    ]);
    openClients.push(...res.clients);

    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("no-such-command-xyz");
    expect(res.tools.map((t) => t.name)).toContain("echo");
  }, 15000);
});
