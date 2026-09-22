import { beforeEach, describe, expect, it } from "vitest";
import {
  getFileBytes,
  resetVscodeMocks,
  Uri,
  workspace,
} from "../mocks/vscode";
import { SessionStore } from "../../../src/agent/sessionStore";
import type { Message } from "../../../src/agent/types";

const storageUri = Uri.file("/mock/globalStorage/eda-agent");
const sessionPath = "/mock/globalStorage/eda-agent/session.json";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    resetVscodeMocks();
    store = new SessionStore(storageUri);
  });

  it("save → load round-trip：多轮含 toolCalls 的历史完整恢复", async () => {
    const history: Message[] = [
      { role: "user", content: "综合这个设计" },
      {
        role: "assistant",
        content: "需要提交",
        toolCalls: [
          {
            id: "call_1",
            name: "submit_synthesis",
            args: { tcl: "compile_dc" },
          },
        ],
      },
      { role: "tool", content: "任务已提交 job#42", toolCallId: "call_1" },
      { role: "assistant", content: "任务 job#42 运行中" },
    ];

    await store.save(history);
    const loaded = await store.load();

    expect(loaded).toEqual(history);
  });

  it("落盘 JSON 只含白名单字段，杜绝敏感信息意外入盘", async () => {
    const history: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "ok" },
    ];

    await store.save(history);

    const raw = new TextDecoder().decode(getFileBytes(sessionPath));
    const parsed = JSON.parse(raw) as {
      messages: Array<Record<string, unknown>>;
    };
    const allowed = new Set(["role", "content", "toolCallId", "toolCalls"]);
    for (const msg of parsed.messages) {
      for (const key of Object.keys(msg)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it("文件不存在时 load 返回空历史", async () => {
    const loaded = await store.load();

    expect(loaded).toEqual([]);
  });

  it("clear 后 load 返回空历史", async () => {
    await store.save([{ role: "user", content: "hi" }]);

    await store.clear();
    const loaded = await store.load();

    expect(loaded).toEqual([]);
  });

  it("落盘文件损坏时 load 回退为空历史", async () => {
    await store.save([{ role: "user", content: "hi" }]);

    // 模拟外部写入破坏 JSON
    await workspace.fs.writeFile(
      Uri.file(sessionPath),
      new TextEncoder().encode("{not-json"),
    );

    const loaded = await store.load();

    expect(loaded).toEqual([]);
  });

  it("load 跳过格式异常的条目（角色未知/缺 content）", async () => {
    await store.save([{ role: "user", content: "正常条目" }]);
    const raw = new TextDecoder().decode(getFileBytes(sessionPath));
    const parsed = JSON.parse(raw) as { messages: unknown[] };
    parsed.messages.splice(
      1,
      0,
      { role: "bot", content: "未知角色" },
      { role: "user" },
      null,
      "字符串",
    );
    await workspace.fs.writeFile(
      Uri.file(sessionPath),
      new TextEncoder().encode(JSON.stringify(parsed)),
    );

    const loaded = await store.load();

    expect(loaded).toEqual([{ role: "user", content: "正常条目" }]);
  });
});
