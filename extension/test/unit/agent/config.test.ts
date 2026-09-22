import { beforeEach, describe, expect, it } from "vitest";
import {
  resetVscodeMocks,
  secrets,
  setConfig,
  setSecret,
} from "../mocks/vscode";
import { ConfigError, loadLlmConfig } from "../../../src/agent/config";

// loadLlmConfig 通过参数注入 SecretStorage，测试里传 mock 的 secrets
describe("loadLlmConfig", () => {
  beforeEach(() => {
    resetVscodeMocks();
  });

  it("读取 eda-agent.llm.* 配置项", async () => {
    setConfig("eda-agent", {
      "llm.baseUrl": "http://gateway.internal/v1",
      "llm.model": "qwen3.8",
      "llm.maxToolRounds": 5,
    });
    setSecret("eda-agent.llm.apiKey", "sk-test");

    const cfg = await loadLlmConfig(secrets);

    expect(cfg.baseUrl).toBe("http://gateway.internal/v1");
    expect(cfg.model).toBe("qwen3.8");
    expect(cfg.maxToolRounds).toBe(5);
    expect(cfg.apiKey).toBe("sk-test");
  });

  it("model 与 maxToolRounds 使用默认值", async () => {
    setConfig("eda-agent", { "llm.baseUrl": "http://gateway.internal/v1" });
    setSecret("eda-agent.llm.apiKey", "sk-test");

    const cfg = await loadLlmConfig(secrets);

    expect(cfg.model).toBe("deepseek-4");
    expect(cfg.maxToolRounds).toBe(10);
  });

  it("baseUrl 缺失时抛出可操作的 ConfigError", async () => {
    setConfig("eda-agent", {});
    setSecret("eda-agent.llm.apiKey", "sk-test");

    const err = await loadLlmConfig(secrets).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConfigError);
    expect((err as Error).message).toContain("eda-agent.llm.baseUrl");
  });

  it("apiKey 只从 SecretStorage 读取，settings 中的值不生效", async () => {
    setConfig("eda-agent", {
      "llm.baseUrl": "http://gateway.internal/v1",
      "llm.apiKey": "settings 里泄漏的 key",
    });
    setSecret("eda-agent.llm.apiKey", "secret-key");

    const cfg = await loadLlmConfig(secrets);

    expect(cfg.apiKey).toBe("secret-key");
  });

  it("SecretStorage 无 apiKey 时抛出可操作的 ConfigError（即使 settings 有值）", async () => {
    setConfig("eda-agent", {
      "llm.baseUrl": "http://gateway.internal/v1",
      "llm.apiKey": "settings 里泄漏的 key",
    });

    const err = await loadLlmConfig(secrets).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConfigError);
    expect((err as Error).message).toContain("SecretStorage");
  });
});
