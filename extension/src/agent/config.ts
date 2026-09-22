import { workspace, type SecretStorage } from "vscode";

/** 配置缺失等用户可自行修复的问题；message 必须包含可操作指引 */
export class ConfigError extends Error {}

export interface LlmConfig {
  baseUrl: string;
  model: string;
  maxToolRounds: number;
  apiKey: string;
}

export const DEFAULT_MODEL = "deepseek-4";
export const DEFAULT_MAX_TOOL_ROUNDS = 10;
const SECRET_KEY_API_KEY = "eda-agent.llm.apiKey";

/**
 * 读取 LLM 配置。SecretStorage 由调用方注入（extension.ts 传 context.secrets），
 * apiKey 只从 SecretStorage 读取，settings.json 中的 `eda-agent.llm.apiKey` 一律忽略，
 * 防止密钥落明文。
 */
export async function loadLlmConfig(store: SecretStorage): Promise<LlmConfig> {
  const cfg = workspace.getConfiguration("eda-agent");

  const baseUrl = cfg.get<string>("llm.baseUrl");
  if (!baseUrl) {
    throw new ConfigError(
      "缺少配置 eda-agent.llm.baseUrl：请在 VSCode 设置中填写内部网关地址（例如 http://gateway.internal/v1）后重试",
    );
  }

  const apiKey = await store.get(SECRET_KEY_API_KEY);
  if (!apiKey) {
    throw new ConfigError(
      `缺少 apiKey：请将密钥存入 SecretStorage（键名 ${SECRET_KEY_API_KEY}），不要写入 settings.json`,
    );
  }

  return {
    baseUrl,
    apiKey,
    model: cfg.get<string>("llm.model") ?? DEFAULT_MODEL,
    maxToolRounds:
      cfg.get<number>("llm.maxToolRounds") ?? DEFAULT_MAX_TOOL_ROUNDS,
  };
}
