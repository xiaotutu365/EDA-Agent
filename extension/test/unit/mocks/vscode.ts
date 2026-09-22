// 单测用的 vscode API 可注入替身：测试通过 setConfig/setSecret 预置状态，
// 生产代码按正常方式 import { workspace, Uri } 使用（vitest alias 到本文件）。
// 类型来自真实 @types/vscode（type-only 导入在运行时被擦除，不会自引用）。
import type { Disposable, SecretStorage } from "vscode";

type SectionValues = Record<string, unknown>;

const configSections = new Map<string, SectionValues>();
const secretStore = new Map<string, string>();
const fileStore = new Map<string, Uint8Array>();

const noopDisposable: Disposable = { dispose: () => undefined };

export function setConfig(section: string, values: SectionValues): void {
  configSections.set(section, values);
}

export function setSecret(key: string, value: string): void {
  secretStore.set(key, value);
}

/** 测试读取 mock 文件系统中的原始字节（校验落盘内容用） */
export function getFileBytes(fsPath: string): Uint8Array | undefined {
  return fileStore.get(fsPath);
}

export function resetVscodeMocks(): void {
  configSections.clear();
  secretStore.clear();
  fileStore.clear();
}

/** 完整模拟 vscode.Uri 的实例结构（静态成员 file/joinPath 覆盖 sessionStore 用法） */
export class Uri {
  static file(path: string): Uri {
    return new Uri("file", "", path, "", "");
  }

  static joinPath(uri: Uri, ...segments: string[]): Uri {
    const base = uri.path.replace(/\/$/, "");
    return new Uri(
      uri.scheme,
      uri.authority,
      [base, ...segments].join("/"),
      uri.query,
      uri.fragment,
    );
  }

  private constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string,
    readonly fragment: string,
  ) {}

  get fsPath(): string {
    return this.path;
  }

  with(change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  toString(): string {
    return this.path;
  }

  toJSON(): unknown {
    return { scheme: this.scheme, path: this.path };
  }
}

export const workspace = {
  getConfiguration: (section: string) => ({
    get: <T>(key: string): T | undefined =>
      configSections.get(section)?.[key] as T | undefined,
  }),
  fs: {
    createDirectory: (uri: Uri) => {
      fileStore.set(`${uri.fsPath}/`, new Uint8Array());
      return Promise.resolve();
    },
    writeFile: (uri: Uri, content: Uint8Array) => {
      fileStore.set(uri.fsPath, content);
      return Promise.resolve();
    },
    readFile: (uri: Uri) => {
      const content = fileStore.get(uri.fsPath);
      return content !== undefined
        ? Promise.resolve(content)
        : Promise.reject(new Error(`file not found: ${uri.fsPath}`));
    },
    delete: (uri: Uri) => {
      fileStore.delete(uri.fsPath);
      return Promise.resolve();
    },
  },
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
