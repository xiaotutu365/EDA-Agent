import { defineConfig } from "vitest/config";
import path from "node:path";

// 单测中把 'vscode' 替换为可注入的 mock 模块（真实 vscode API 只在扩展宿主可用）
export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "test/unit/mocks/vscode.ts"),
    },
  },
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
  },
});
