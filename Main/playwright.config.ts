import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 当前模块的目录路径（ESM 等价 __dirname）
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 扩展构建产物路径（CRXJS vite-plugin 输出到 dist/）
const extensionPath = path.resolve(__dirname, 'dist');

export default defineConfig({
  // E2E 测试目录
  testDir: './e2e',
  // 扩展测试不可并行：Chrome MV3 扩展为单实例，多个 worker 会竞争同一个扩展加载路径
  fullyParallel: false,
  // 单 worker：扩展加载 + Chrome 用户数据目录不能多实例并发
  workers: 1,
  // 列表式报告（CI 友好，输出紧凑）
  reporter: 'list',
  use: {
    // 首次重试时记录 trace，便于事后调试失败用例
    trace: 'on-first-retry',
  },
  projects: [
    {
      // 加载已构建扩展的 Chromium 项目
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // 排除其他扩展，仅加载本项目 dist 产物
            `--disable-extensions-except=${extensionPath}`,
            // 加载本项目扩展
            `--load-extension=${extensionPath}`,
          ],
        },
      },
    },
  ],
});
