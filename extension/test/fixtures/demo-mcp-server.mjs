// demo MCP server：提供一个 echo tool，用于 MCP 适配与 Agent 循环测试
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "demo-echo", version: "0.1.0" });

server.registerTool(
  "echo",
  {
    description: "回显输入文本",
    inputSchema: { text: z.string().describe("要回显的文本") },
  },
  async ({ text }) => ({
    content: [{ type: "text", text: `echo: ${text}` }],
  }),
);

server.registerTool(
  "fail",
  {
    description: "总是返回错误结果",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: "坏了" }],
    isError: true,
  }),
);

await server.connect(new StdioServerTransport());
