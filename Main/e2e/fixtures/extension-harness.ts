/**
 * Extension Harness - E2E 扩展加载与面板操作辅助工具
 *
 * 架构变更说明（P5-2.1 reviewer REJECTED 修复）：
 * 原方案用 page.addInitScript 注入 chrome API mock 到 main world，
 * 但 MV3 content script 在 isolated world，mock 无效。
 *
 * 新方案（方案 B）：
 * - 不再 addInitScript 注入 chrome mock
 * - 直接 page.goto(bilibili)，content script 由 Chrome 扩展机制自动注入
 *   到 isolated world，使用真实 chrome API
 * - 用 seedSettingsToStorage 播种设置到真实 chrome.storage
 *   （通过 service worker 上下文执行，普通网页 main world 无 chrome 全局对象）
 * - 等待 [data-bili-agent-toggle] 出现确认 content script 已挂载
 * - 网络层 mock 用 page.route（不在 fixture 实现，留给 2.2/2.3 的 spec 文件）
 *
 * 设计依据：4.5 SC-4 + §0.1 E2E 默认使用可控 mock/fixture
 * 参照旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts
 *
 * 注意：content script 匹配 *://*.bilibili.com/*，所以必须导航到 bilibili.com 域名
 * 才会触发扩展自动注入。
 */

import type { BrowserContext, Locator, Page, Worker } from "@playwright/test";
import { expect } from "@playwright/test";
import {
	SETTINGS_STORAGE_KEY,
	type StorageSeedOptions,
	seedSettingsToStorage,
} from "./chrome-mock.js";
import { recordDomSnapshot } from "./runtime-evidence.js";

/** 扩展辅助选项 */
export interface HarnessOptions extends StorageSeedOptions {
	/** 导航目标 URL（默认 https://www.bilibili.com） */
	url?: string;
	/** 导航超时（毫秒，默认 60000） */
	navigationTimeoutMs?: number;
	/** 等待 content script 注入的超时（毫秒，默认 10000） */
	contentScriptTimeoutMs?: number;
}

/** 默认导航 URL：bilibili 首页（匹配 manifest content_scripts.matches） */
const DEFAULT_URL = "https://www.bilibili.com";
const DEFAULT_NAV_TIMEOUT = 60_000;
const DEFAULT_CS_TIMEOUT = 10_000;

/**
 * 在加载真实扩展的环境下打开 bilibili 页面。
 *
 * 方案 B 流程：
 * 1. 导航到 bilibili（content script 由 Chrome 扩展机制自动注入到 isolated world）
 * 2. 等待 [data-bili-agent-toggle] 出现，确认 content script 已挂载
 * 3. 若提供了 settings 选项，用 seedSettingsToStorage 播种到真实 chrome.storage
 *    （通过 service worker 上下文执行 chrome.storage.local.set）
 *
 * seed 时序说明（INFO 文档化）：
 * seed 在 content script 挂载后才执行（步骤 3 依赖步骤 2 的 toggle 可见）。
 * 此时 content script 已完成首次初始化（可能用默认 settings 渲染了首界面），
 * seed 写入 storage 后，扩展通过 chrome.storage.onChanged 监听器被动感知变更
 * 并同步到 UI。因此测试断言应等待面板内 provider 列表渲染完成，
 * 而非断言首挂载瞬间的快照状态（首挂载可能仍是默认值）。
 *
 * @param page Playwright Page 对象
 * @param options 可选播种配置与导航参数
 * @returns 初始化后的 Page（原对象，便于链式调用）
 */
export async function openBilibiliWithMockedExtension(
	page: Page,
	options: HarnessOptions = {},
): Promise<Page> {
	const url = options.url ?? DEFAULT_URL;
	const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAV_TIMEOUT;
	const csTimeout = options.contentScriptTimeoutMs ?? DEFAULT_CS_TIMEOUT;
	const settingsKey = options.settingsKey ?? SETTINGS_STORAGE_KEY;

	const context = page.context();
	const browser = context.browser();
	const disconnectErrors: string[] = [];
	const pageConsoleErrors: string[] = [];
	if (browser) {
		browser.on("disconnected", () => {
			disconnectErrors.push(`browser disconnected at ${new Date().toISOString()}`);
		});
	}
	page.on("console", (message) => {
		if (message.type() === "error") pageConsoleErrors.push(message.text());
	});

	try {
		// 1. 导航到 bilibili，content script 会由扩展自动注入 isolated world。
		await page.goto(url, {
			timeout: navTimeout,
			waitUntil: "domcontentloaded",
		});
	} catch (error) {
		throw new Error(
			`page.goto 失败 (url=${url}): ${formatError(error)}\n` +
			`浏览器断开记录: ${formatList(disconnectErrors)}\n` +
			`页面控制台错误: ${formatList(pageConsoleErrors)}`,
			{ cause: error },
		);
	}

	await recordDomSnapshot(page, "after-navigation");


	// 2a. 先确认扩展 SW，区分扩展未加载与页面脚本未注入。
	const serviceWorker = await waitForExtensionServiceWorker(
		context,
		Math.max(1_000, Math.floor(csTimeout / 2)),
	);

	// 2b. host 创建不依赖 storage 返回，能准确定位 content script 注入边界。
	try {
		await page.locator("#bili-agent-host").waitFor({
			state: "attached",
			timeout: Math.max(1_000, Math.floor(csTimeout / 2)),
		});
	} catch (error) {
		const swState = await serviceWorker
			.evaluate(() => ({ url: self.location.href }))
			.catch(() => ({ url: "SW evaluate failed" }));
		throw new Error(
			`content script 未注入: host 元素 #bili-agent-host 未出现\n` +
			`SW 状态: ${JSON.stringify(swState)}\n` +
			`浏览器断开记录: ${formatList(disconnectErrors)}\n` +
			`页面控制台错误: ${formatList(pageConsoleErrors)}\n` +
			`原始错误: ${formatError(error)}`,
			{ cause: error },
		);
	}
	await recordDomSnapshot(page, "content-script-mounted");

	// 2c. toggle 依赖 storage.get 完成，单独延长等待并报告 DOM 状态。
	try {
		await page.locator("[data-bili-agent-toggle]").waitFor({
			state: "visible",
			timeout: csTimeout * 2,
		});
	} catch (error) {
		const readyState = await readDomState(page);
		throw new Error(
			`toggle 按钮未出现: content script 已注入但 isReady 未就绪\n` +
			`DOM 状态: ${JSON.stringify(readyState)}\n` +
			`浏览器断开记录: ${formatList(disconnectErrors)}\n` +
			`页面控制台错误: ${formatList(pageConsoleErrors)}\n` +
			`原始错误: ${formatError(error)}`,
			{ cause: error },
		);
	}
	await recordDomSnapshot(page, "first-render-ready");

	// 3. 若提供 settings，继续通过扩展 SW 操纵真实 chrome.storage.local。
	if (options.settings !== undefined) {
		const settings = options.settings ?? null;
		await seedSettingsToStorage(context, settings, settingsKey);
	}

	return page;
}

/** 轮询扩展 service worker，过滤页面自身可能注册的 web worker。 */
async function waitForExtensionServiceWorker(
	context: BrowserContext,
	timeoutMs: number,
): Promise<Worker> {
	const existing = context
		.serviceWorkers()
		.find((worker) => worker.url().startsWith("chrome-extension://"));
	if (existing) return existing;

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const remaining = deadline - Date.now();
		try {
			const worker = await context.waitForEvent("serviceworker", {
				timeout: remaining,
			});
			if (worker.url().startsWith("chrome-extension://")) return worker;
		} catch {
			break;
		}
	}

	throw new Error(
		`扩展 service worker 未在 ${timeoutMs}ms 内启动\n` +
		`当前 context 中的 SW: ${formatList(context.serviceWorkers().map((worker) => worker.url()))}`,
	);
}

/** 读取失败时的最小 DOM 状态，避免错误信息只能显示一个通用超时。 */
async function readDomState(page: Page): Promise<Record<string, boolean>> {
	return page.evaluate(() => {
		const host = document.getElementById("bili-agent-host");
		const shadow = host?.shadowRoot;
		const toggle = shadow?.querySelector<HTMLElement>("[data-bili-agent-toggle]");
		return {
			hostExists: host !== null,
			shadowExists: shadow !== undefined,
			toggleExists: toggle !== null,
			toggleVisible: toggle
				? getComputedStyle(toggle).display !== "none" &&
					getComputedStyle(toggle).visibility !== "hidden"
				: false,
		};
	});
}

/** 限制诊断数组长度，避免网络/控制台错误把失败报告刷屏。 */
function formatList(values: string[]): string {
	return values.length > 0 ? values.slice(0, 5).join("; ") : "无";
}

/** 将未知异常转换成稳定的错误文本。 */
function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * 点击 toggle 按钮打开面板，并等待面板可见。
 *
 * @param page 已通过 openBilibiliWithMockedExtension 初始化的 Page
 * @returns 面板 Locator
 */
export async function openPanel(page: Page): Promise<Locator> {
	const toggle = page.locator("[data-bili-agent-toggle]");
	await expect(toggle).toBeVisible();
	await toggle.click();

	// 面板容器带 data-bili-agent-panel 属性，在 Shadow DOM 内
	const panel = page.locator("[data-bili-agent-panel]");
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
	const panel = page.locator("[data-bili-agent-panel]");
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
	await expect(page.locator("[data-bili-agent-panel]")).toBeHidden({
		timeout: 5000,
	});
}

/**
 * 从聊天界面进入设置面板。
 * 点击 aria-label="Open settings" 按钮，等待设置面板可见。
 *
 * 选择器精确化（reviewer MEDIUM 修复）：
 * 原方案用 .bili-agent-settings 类名（CSS 类，可能匹配多个元素且不精确）。
 * 改用 data-testid="settings-panel"（SettingsPanel root 元素的唯一标识），
 * 并降级等待 data-testid="theme-mode-select"（通用 Tab 元素，确保面板已渲染）。
 *
 * @param page 已打开聊天面板的 Page
 * @returns 设置面板 Locator
 */
export async function openSettings(page: Page): Promise<Locator> {
	const panel = await getPanel(page);
	const openSettingsButton = panel.locator('[aria-label="Open settings"]');
	await expect(openSettingsButton).toBeVisible();
	await openSettingsButton.click();

	// 等待设置面板 root 出现（data-testid="settings-panel" 是 SettingsPanel 的唯一标识）
	const settingsPanel = panel.locator('[data-testid="settings-panel"]');
	await expect(settingsPanel).toBeVisible({ timeout: 5000 });
	// 进一步确认通用 Tab 内容已渲染（theme-mode-select 在通用 Tab 默认显示时存在）
	await expect(
		settingsPanel.locator('[data-testid="theme-mode-select"]'),
	).toBeVisible({ timeout: 5000 });
	return settingsPanel;
}

/**
 * 从设置面板返回聊天界面。
 * 点击 aria-label="Back to chat" 按钮。
 *
 * @param page 已打开设置的 Page
 */
export async function backToChat(page: Page): Promise<void> {
	const panel = page.locator("[data-bili-agent-panel]");
	const backButton = panel.locator('[aria-label="Back to chat"]');
	await expect(backButton).toBeVisible();
	await backButton.click();
	// 等待聊天输入区出现
	await expect(panel.locator(".bili-agent-chat-input__textarea")).toBeVisible({
		timeout: 5000,
	});
}
