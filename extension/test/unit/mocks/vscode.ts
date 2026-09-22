// 单测用的 vscode API 可注入替身：测试通过 setConfig/setSecret 预置状态，
// 生产代码按正常方式 import { workspace } 使用（vitest alias 到本文件）。
// 类型来自真实 @types/vscode（type-only 导入在运行时被擦除，不会自引用）。
import type { Disposable, SecretStorage } from "vscode";

type SectionValues = Record<string, unknown>;

const configSections = new Map<string, SectionValues>();
const secretStore = new Map<string, string>();

const noopDisposable: Disposable = { dispose: () => undefined };

export function setConfig(section: string, values: SectionValues): void {
  configSections.set(section, values);
}

export function setSecret(key: string, value: string): void {
  secretStore.set(key, value);
}

export function resetVscodeMocks(): void {
  configSections.clear();
  secretStore.clear();
}

export const workspace = {
  getConfiguration: (section: string) => ({
    get: <T>(key: string): T | undefined =>
      configSections.get(section)?.[key] as T | undefined,
  }),
};

export const secrets: SecretStorage = {
  get: (key: string) => Promise.resolve(secretStore.get(key)),
  store: (key: string, value: string) => {
    secretStore.set(key, value);
    return Promise.resolve();
  },
  delete: (key: string) => {
    secretStore.delete(key);
    return Promise.resolve();
  },
  onDidChange: () => noopDisposable,
};
