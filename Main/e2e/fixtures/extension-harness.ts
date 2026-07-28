/**
 * Extension Harness - E2E 扩展加载与面板操作辅助工具
 *
 * 设计依据：4.5 SC-4 + §0.1 E2E 默认使用可控 mock/fixture
 * 参照旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts 中的 openBilibiliWithMockedExtension
 *
 * 关键差异（旧仓库 vs 新仓库）：
 * - 旧仓库：page.goto -> page.evaluate(installChromeApiMock) -> page.addScriptTag(contentScript)
 *   （因为旧仓库 e2e 不加载真实扩展，而是手动注入 content script 脚本标签）
 * - 新仓库：page.addInitScript(mockScript) -> page.goto(bilibili)
 *   （新仓库通过 --load-extension 加载真实扩展 dist，content script 由 Chrome 自动注入，
 *    因此 mock 必须用 addInitScript 在任何脚本之前覆盖 window.chrome）
 *
 * 注意：content script 匹配 *://*.bilibili.com/*，所以必须导航到 bilibili.com 域名
 * 才会触发扩展自动注入。若需纯 UI 测试（不依赖 bilibili 网络），可使用 about:blank
 * 但需手动注入 content script（见 openWithInjectedContentScript）。
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  buildChromeMockScript,
  type ChromeMockOptions,
} from './chrome-mock.js';

/** 扩展辅助选项 */
export interface HarnessOptions extends ChromeMockOptions {
  /** 导航目标 URL（默认 https://www.bilibili.com） */
  url?: string;
  /** 导航超时（毫秒，默认 60000） */
  navigationTimeoutMs?: number;
  /** 等待 content script 注入的超时（毫秒，默认 10000） */
  contentScriptTimeoutMs?: number;
}

/** 默认导航 URL：bilibili 首页（匹配 manifest content_scripts.matches） */
const DEFAULT_URL = 'https://www.bilibili.com';
const DEFAULT_NAV_TIMEOUT = 60_000;
const DEFAULT_CS_TIMEOUT = 10_000;

/**
 * 在带 mock 的扩展环境下打开 bilibili 页面。
 *
 * 流程：
 * 1. 用 addInitScript 在任何页面脚本之前注入 Chrome API Mock（覆盖 window.chrome）
 * 2. 导航到 bilibili（content script 由 Chrome 扩展机制自动注入）
 * 3. 等待 [data-bili-agent-toggle] 出现，确认 content script 已挂载
 *
 * @param page Playwright Page 对象
 * @param options 可选 mock 配置与导航参数
 * @returns 注入 mock 后的 Page（原对象，便于链式调用）
 */
export async function openBilibiliWithMockedExtension(
  page: Page,
  options: HarnessOptions = {},
): Promise<Page> {
  const url = options.url ?? DEFAULT_URL;
  const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT;
  const csTimeout = options.contentScriptTimeoutMs ?? DEFAULT_CS_TIMEOUT;

  // 1. 在任何页面脚本之前注入 Chrome Mock（addInitScript 会在每次导航的页面初始化时执行）
  const mockScript = buildChromeMockScript(options);
  await page.addInitScript({ content: mockScript });

  // 2. 导航到 bilibili（content script 会由扩展自动注入）
  await page.goto(url, {
    timeout: navTimeout,
    waitUntil: 'domcontentloaded',
  });

  // 3. 等待 toggle 按钮出现，确认 content script 已挂载
  //    toggle 按钮带 data-bili-agent-toggle 属性，在 Shadow DOM 内
  //    Playwright 默认穿透 open Shadow DOM，直接用属性选择器即可
  await page
    .locator('[data-bili-agent-toggle]')
    .waitFor({ state: 'visible', timeout: csTimeout });

  return page;
}

/**
 * 点击 toggle 按钮打开面板，并等待面板可见。
 *
 * @param page 已通过 openBilibiliWithMockedExtension 初始化的 Page
 * @returns 面板 Locator
 */
export async function openPanel(page: Page): Promise<Locator> {
  const toggle = page.locator('[data-bili-agent-toggle]');
  await expect(toggle).toBeVisible();
  await toggle.click();

  // 面板容器带 data-bili-agent-panel 属性，在 Shadow DOM 内
  const panel = page.locator('[data-bili-agent-panel]');
  await expect(panel).toBeVisible({ timeout: 5000 });
  return panel;
}

/**
 * 获取面板 Locator（假设面板已打开）。
 * 不触发点击，仅等待面板可见。
 *
 * @param page 已打开面板的 Page
 * @returns 面板 Locator
 */
export async function getPanel(page: Page): Promise<Locator> {
  const panel = page.locator('[data-bili-agent-panel]');
  await expect(panel).toBeVisible({ timeout: 5000 });
  return panel;
}

/**
 * 关闭面板：点击面板内的"关闭面板"按钮（aria-label="关闭面板"）。
 *
 * @param page 已打开面板的 Page
 */
export async function closePanel(page: Page): Promise<void> {
  const closeButton = page.locator('[aria-label="关闭面板"]');
  await expect(closeButton).toBeVisible();
  await closeButton.click();
  // 等待面板隐藏
  await expect(page.locator('[data-bili-agent-panel]')).toBeHidden({
    timeout: 5000,
  });
}

/**
 * 从聊天界面进入设置面板。
 * 点击 aria-label="Open settings" 按钮，等待设置面板可见。
 *
 * @param page 已打开聊天面板的 Page
 * @returns 设置面板 Locator
 */
export async function openSettings(page: Page): Promise<Locator> {
  const panel = await getPanel(page);
  const openSettingsButton = panel.locator('[aria-label="Open settings"]');
  await expect(openSettingsButton).toBeVisible();
  await openSettingsButton.click();
  // 等待设置面板内 .bili-agent-settings 出现
  const settingsPanel = panel.locator('.bili-agent-settings');
  await expect(settingsPanel).toBeVisible({ timeout: 5000 });
  return settingsPanel;
}

/**
 * 从设置面板返回聊天界面。
 * 点击 aria-label="Back to chat" 按钮。
 *
 * @param page 已打开设置的 Page
 */
export async function backToChat(page: Page): Promise<void> {
  const panel = page.locator('[data-bili-agent-panel]');
  const backButton = panel.locator('[aria-label="Back to chat"]');
  await expect(backButton).toBeVisible();
  await backButton.click();
  // 等待聊天输入区出现
  await expect(panel.locator('.bili-agent-chat-input__textarea')).toBeVisible({
    timeout: 5000,
  });
}
