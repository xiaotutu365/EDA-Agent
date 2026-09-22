import { describe, expect, it } from "vitest";
import * as ext from "../../src/extension";

describe("extension 入口", () => {
  it("导出 activate 与 deactivate 函数", () => {
    expect(typeof ext.activate).toBe("function");
    expect(typeof ext.deactivate).toBe("function");
  });
});
