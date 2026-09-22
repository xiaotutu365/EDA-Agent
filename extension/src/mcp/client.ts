import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentTool, ToolResult } from "../agent/types";

/** 对应配置项 `eda-agent.mcp.servers` 的单个条目 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function textOfContent(
  content: Array<{ type: string; text?: string }> | undefined,
): string {
  return (content ?? [])
    .filter(
      (c): c is { type: "text"; text: string } =>
        c.type === "text" && typeof c.text === "string",
    )
    .map((c) => c.text)
    .join("\n");
}

/** 单个 MCP server（stdio 子进程）的客户端封装 */
export class McpClient {
  private constructor(
    private readonly client: Client,
    private readonly label: string,
  ) {}

  /** 启动子进程并完成初始化握手；连接失败抛错，由调用方决定如何提示 */
  static async connect(
    config: McpServerConfig,
    label = config.command,
  ): Promise<McpClient> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });
    const client = new Client({ name: "eda-agent", version: "0.1.0" });
    await client.connect(transport);
    return new McpClient(client, label);
  }

  /** 发现的 tools 适配为统一 AgentTool 视图（Task 3 契约） */
  async listAgentTools(): Promise<AgentTool[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema,
      execute: (args: Record<string, unknown>) => this.callTool(t.name, args),
    }));
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    // SDK 在未传 resultSchema 时返回宽类型，这里按协议收窄
    const result = (await this.client.callTool({ name, arguments: args })) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = textOfContent(result.content);
    // MCP isError 语义上就是失败：抛错让 Agent 循环统一回填「错误：…」
    if (result.isError) {
      throw new Error(text || `工具 ${name} 执行失败`);
    }
    return text;
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /** 日志/提示用标识 */
  get name(): string {
    return this.label;
  }
}

export interface McpConnectResult {
  /** 成功接入的客户端（extension.ts 应放入 context.subscriptions 以便停用时 close） */
  clients: McpClient[];
  /** 全部成功 server 的 tools（已适配为 AgentTool） */
  tools: AgentTool[];
  /** 每条失败 server 的可操作错误提示 */
  errors: string[];
}

/** 连接多个 MCP server：单个失败记入 errors 并继续其余，绝不因个别 server 崩掉整体 */
export async function connectMcpServers(
  configs: McpServerConfig[],
): Promise<McpConnectResult> {
  const clients: McpClient[] = [];
  const tools: AgentTool[] = [];
  const errors: string[] = [];
  for (const config of configs) {
    try {
      const mcp = await McpClient.connect(config);
      clients.push(mcp);
      tools.push(...(await mcp.listAgentTools()));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errors.push(`MCP server ${config.command} 连接失败：${reason}`);
    }
  }
  return { clients, tools, errors };
}
