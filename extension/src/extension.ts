import type * as vscode from "vscode";

// 装配入口：后续任务在此挂载 config（Task 2）、Agent 循环（Task 5+）与 UI（vscode-extension spec）
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push({
    dispose: () => undefined,
  });
}

export function deactivate(): void {
  // 生命周期钩子：暂无需要清理的异步资源
}
