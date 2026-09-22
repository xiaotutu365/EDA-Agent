import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../../src/agent/toolRegistry";
import type { AgentTool } from "../../../src/agent/types";

function makeTool(name: string): AgentTool {
  return {
    name,
    description: `test tool ${name}`,
    parameters: { type: "object", properties: {} },
    execute: async () => `ran ${name}`,
  };
}

describe("ToolRegistry", () => {
  it("注册后可按名获取", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("submit_synthesis");

    registry.register(tool);

    expect(registry.get("submit_synthesis")).toBe(tool);
  });

  it("重复注册同名 tool 抛错", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("dup"));

    expect(() => registry.register(makeTool("dup"))).toThrowError(
      "tool already registered: dup",
    );
  });

  it("list 返回全部已注册 tool", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));

    const names = registry.list().map((t) => t.name);

    expect(names).toEqual(["a", "b"]);
  });

  it("get 不存在的 tool 返回 undefined", () => {
    const registry = new ToolRegistry();

    expect(registry.get("nope")).toBeUndefined();
  });
});
