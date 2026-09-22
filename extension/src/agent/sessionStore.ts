import { Uri, workspace } from "vscode";
import type { Message } from "./types";

const SESSION_FILE = "session.json";
const SESSION_FORMAT_VERSION = 1;

/** 会话持久化：消息历史以 JSON 存 globalStorage；只写白名单字段防敏感信息入盘 */
export class SessionStore {
  constructor(private readonly globalStorageUri: Uri) {}

  private get fileUri(): Uri {
    return Uri.joinPath(this.globalStorageUri, SESSION_FILE);
  }

  async save(messages: Message[]): Promise<void> {
    // 白名单重建对象：Message 未来若新增字段，默认不落盘，需显式放行
    const safe = messages.map((m) => {
      const entry: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };
      if (m.toolCallId !== undefined) {
        entry.toolCallId = m.toolCallId;
      }
      if (m.toolCalls !== undefined) {
        entry.toolCalls = m.toolCalls;
      }
      return entry;
    });
    await workspace.fs.createDirectory(this.globalStorageUri);
    const payload = JSON.stringify({
      version: SESSION_FORMAT_VERSION,
      messages: safe,
    });
    await workspace.fs.writeFile(
      this.fileUri,
      new TextEncoder().encode(payload),
    );
  }

  /** 首次使用或文件损坏时返回空历史，从新会话开始 */
  async load(): Promise<Message[]> {
    try {
      const raw = new TextDecoder().decode(
        await workspace.fs.readFile(this.fileUri),
      );
      const parsed: unknown = JSON.parse(raw);
      const messages = (parsed as { messages?: unknown } | null)?.messages;
      if (!Array.isArray(messages)) {
        return [];
      }
      // 只读回白名单字段，格式异常的条目跳过
      const restored: Message[] = [];
      for (const item of messages) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const m = item as Record<string, unknown>;
        if (typeof m.role !== "string" || typeof m.content !== "string") {
          continue;
        }
        if (!["system", "user", "assistant", "tool"].includes(m.role)) {
          continue;
        }
        restored.push({
          role: m.role as Message["role"],
          content: m.content,
          ...(typeof m.toolCallId === "string"
            ? { toolCallId: m.toolCallId }
            : {}),
          ...(Array.isArray(m.toolCalls)
            ? { toolCalls: m.toolCalls as Message["toolCalls"] }
            : {}),
        });
      }
      return restored;
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    await workspace.fs.delete(this.fileUri);
  }
}
