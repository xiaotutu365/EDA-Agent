import { describe, expect, it } from "vitest";
import { OpenAiLlmClient } from "../../src/agent/llmClient";
import { Agent } from "../../src/agent/core";
import { ToolRegistry } from "../../src/agent/toolRegistry";
import type { AgentTool } from "../../src/agent/types";

// 真实网关冒烟：默认跳过；EDA_IT_GATEWAY=1 并提供网关变量后运行
//   EDA_IT_GATEWAY=1 EDA_IT_BASE_URL=... EDA_IT_API_KEY=... [EDA_IT_MODEL=deepseek-4] npm test -- integration
const ENABLED = process.env.EDA_IT_GATEWAY === "1";
const BASE_URL = process.env.EDA_IT_BASE_URL;
const API_KEY = process.env.EDA_IT_API_KEY;
const MODEL = process.env.EDA_IT_MODEL ?? "deepseek-4";

const describeIf = ENABLED ? describe : describe.skip;

const nowTool: AgentTool = {
  name: "get_now",
  description: "获取当前时间，返回固定测试值",
  parameters: { type: "object", properties: {} },
  execute: async () => "2026-09-22 08:00:00",
};

describeIf("真实网关集成冒烟", () => {
  it(
    "经真实网关完成带 demo tool 的多轮流式对话",
    { timeout: 120_000 },
    async () => {
      if (!BASE_URL || !API_KEY) {
        throw new Error(
          "EDA_IT_GATEWAY=1 时必须设置 EDA_IT_BASE_URL 与 EDA_IT_API_KEY",
        );
      }
      const client = new OpenAiLlmClient({
        baseUrl: BASE_URL,
        apiKey: API_KEY,
        model: MODEL,
      });
      const registry = new ToolRegistry();
      registry.register(nowTool);
      const agent = new Agent({ client, registry, maxToolRounds: 10 });

      // 第一轮：驱动 tool call → 执行 → 最终回复（流式增量非空）
      const deltas: string[] = [];
      const first = await agent.send(
        "调用 get_now 工具，把工具返回的时间告诉我",
        (d) => deltas.push(d),
      );
      expect(first).toBeTruthy();
      expect(deltas.length).toBeGreaterThan(0);

      // 第二轮：验证上下文连续（记得上一轮调用的工具）
      const second = await agent.send(
        "我刚才让你调用的工具叫什么名字？只回答名字。",
        () => undefined,
      );
      expect(second).toContain("get_now");
    },
  );
});
