/**
 * agent-core 核心类型：对话消息、tool call、统一 tool 视图。
 * 这些类型是下游 MCP 适配与 approval-gate 的契约（spec Boundaries：修改需 Ask first）。
 */

/** JSON Schema 对象（tool 参数描述），不引入额外依赖，按需收紧 */
export type JsonSchema = Record<string, unknown>;

/** 工具执行结果；作为 tool 消息回填给 LLM */
export type ToolResult = string;

/** 统一 Tool 视图：内置 tool 直接实现，MCP tool 经适配层转换成此接口 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

/** LLM 发起的工具调用 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

/** 对话消息；tool 角色必须带 toolCallId，assistant 的 toolCalls 为 LLM 原样回传 */
export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}
