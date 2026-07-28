/**
 * Smoke E2E - 扩展加载与核心交互流程冒烟测试
 *
 * 移植自旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts
 *
 * 主要适配点：
 * 1. 不再用 installChromeApiMock / page.addScriptTag 手动注入 content script，
 *    改用 fixture 的 openBilibiliWithMockedExtension（--load-extension 加载真实扩展）
 * 2. 不再用 page.evaluate 播种 storage（main world 无 chrome 对象），
 *    改用 seedSettingsToStorage（service worker 上下文播种）
 * 3. 选择器优先 data-testid / aria-label（新仓库组件已有）
 * 4. 截图证据保留为可选（写入 .sisyphus/evidence，失败不阻塞测试）
 *
 * 设计依据：4.5 SC-4 ② + 旧仓库参照
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { emptySettings, type SeedSettings } from "./fixtures/chrome-mock.js";
import {
	backToChat,
	openBilibiliWithMockedExtension,
	openPanel,
	openSettings,
} from "./fixtures/extension-harness.js";

// ESM 等价 __dirname（用于截图证据输出目录）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 截图证据目录（保留旧仓库的可选证据逻辑，失败不阻塞测试）
const evidenceDir = path.resolve(__dirname, "../.sisyphus/evidence");

/**
 * 构造一份已配置 OpenAI provider 的种子 settings（apiKey 为 mock 值）。
 * 用于 429 错误用例：provider 已配置，发消息会走真实 fetch -> page.route 拦截。
 */
function configuredOpenAiSettings(): SeedSettings {
	return {
		providers: [
			{
				id: "openai",
				name: "OpenAI 官方",
				format: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "mock-key-not-real",
				model: "gpt-4o-mini",
				isBuiltIn: true,
				isCustom: false,
			},
		],
		activeProviderId: "openai",
		themeMode: "auto",
	};
}

/**
 * CORS 响应头：page.route mock 需要，否则浏览器 fetch 会被 CORS 拦截。
 * 与旧仓库 smoke.spec.ts corsHeaders() 对齐。
 */
function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers":
			"authorization, content-type, x-api-key, anthropic-version",
		"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
		"Access-Control-Expose-Headers": "*",
	};
}

/**
 * 可选截图：失败时静默忽略，不阻塞测试流程。
 */
async function optionalScreenshot(
	page: import("@playwright/test").Page,
	filename: string,
): Promise<void> {
	try {
		const fs = await import("node:fs/promises");
		await fs.mkdir(evidenceDir, { recursive: true });
		await page.screenshot({
			path: path.join(evidenceDir, filename),
			fullPage: false,
		});
	} catch {
		// 截图失败不影响测试断言
	}
}

test.describe("BiliGo panel UX (no backend)", () => {
	test("side toggle peeks from the page edge and expands on hover", async ({
		page,
	}) => {
		// 导航到 bilibili 并等待 content script 挂载（toggle 可见）
		await openBilibiliWithMockedExtension(page);

		const viewport = page.viewportSize();
		if (!viewport) {
			throw new Error("Viewport is required for side toggle smoke test");
		}

		// 旧仓库 toggle 默认位置 right: -16px（部分隐藏在屏幕右边缘），opacity: 0.95
		// 新仓库 styles.ts 同样用 right: -16px + opacity: 0.95
		const toggleButton = page.locator("[data-bili-agent-toggle]");
		const initial = await toggleButton.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				opacity: Number(getComputedStyle(element).opacity),
			};
		});

		// toggle 应部分隐藏在视口右边缘之外
		expect(initial.left).toBeLessThan(viewport.width);
		expect(initial.right).toBeGreaterThan(viewport.width);
		// 初始 opacity 应小于 1（peek 半透明态）
		expect(initial.opacity).toBeLessThan(1.0);

		// 悬停后 opacity 应升高到接近 1
		await toggleButton.hover();
		await expect
			.poll(async () => {
				return toggleButton.evaluate((element) =>
					Number(getComputedStyle(element).opacity),
				);
			})
			.toBeGreaterThan(0.95);

		// 点击 toggle 打开面板
		await toggleButton.click();

		const panel = page.locator("[data-bili-agent-panel]");
		await expect(panel).toBeVisible();
		// 面板打开后 toggle 隐藏（App.tsx: isOpen 时不渲染 ToggleButton）
		await expect(toggleButton).toBeHidden();

		// 点击面板外部关闭面板
		await page.mouse.click(20, 20);
		await expect(panel).toBeHidden();
		await expect(toggleButton).toBeVisible();
	});

	test("panel SPA navigation switches between chat and settings without reload", async ({
		page,
	}) => {
		await openBilibiliWithMockedExtension(page);

		// 打开面板
		const panel = await openPanel(page);

		// 聊天态：不应有 Settings badge
		await expect(panel.locator(".bili-agent-panel__badge")).toHaveCount(0);

		// 进入设置：点击 aria-label="Open settings" 按钮
		// openSettings 会等待 data-testid="settings-panel" 可见
		const settingsPanel = await openSettings(page);
		await expect(settingsPanel).toBeVisible();
		// 设置态应显示 Settings badge
		await expect(panel.locator(".bili-agent-panel__badge")).toHaveText(
			"Settings",
		);

		// 返回聊天：点击 aria-label="Back to chat" 按钮
		await backToChat(page);
		// 聊天态：不应有 Settings badge，聊天输入框可见
		await expect(panel.locator(".bili-agent-panel__badge")).toHaveCount(0);
		await expect(
			panel.locator(".bili-agent-chat-input__textarea"),
		).toBeVisible();
	});
});

test.describe("BiliGo LLM provider flow (mocked)", () => {
	test("shows provider configuration error when no active provider", async ({
		page,
	}) => {
		// 播种空 settings（activeProviderId=null），触发 PROVIDER_NOT_CONFIGURED 错误路径
		await openBilibiliWithMockedExtension(page, {
			settings: emptySettings(),
		});

		const panel = await openPanel(page);

		// 输入消息并发送
		await panel.locator(".bili-agent-chat-input__textarea").fill("hello");
		await panel.locator(".bili-agent-chat-input__send").click();

		// 等待错误提示出现
		// ErrorDisplay 对 PROVIDER_NOT_CONFIGURED 渲染 title="AI 提供商配置错误"
		// message 来自 friendlyMessage('PROVIDER_NOT_CONFIGURED') = '请到设置配置 AI 提供商'
		const error = page.locator(".bili-agent-error");
		await expect(error).toBeVisible({ timeout: 5000 });
		await expect(error.locator(".bili-agent-error__title")).toContainText(
			"AI 提供商配置错误",
		);
		await expect(error.locator(".bili-agent-error__message")).toContainText(
			"设置",
		);
	});

	test("configure OpenAI provider, test connection, send chat with mocked SSE", async ({
		page,
	}) => {
		let testConnectionHits = 0;
		let chatHits = 0;

		// mock SSE 端点：test_connection 用 stream:false，聊天用 stream:true
		// 新仓库连接测试走 generateText（stream:false），聊天走 streamText（stream:true）
		await page.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			const body =
				(request.postDataJSON() as { stream?: boolean } | null) ?? {};
			// stream:false -> 连接测试请求（generateText）
			if (body.stream === false) {
				testConnectionHits += 1;
				await route.fulfill({
					status: 200,
					headers: {
						...corsHeaders(),
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						id: "cmpl-test",
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: "pong" },
								finish_reason: "stop",
							},
						],
					}),
				});
				return;
			}

			// stream:true -> 聊天流（streamText）
			chatHits += 1;
			await route.fulfill({
				status: 200,
				headers: {
					...corsHeaders(),
					"Content-Type": "text/event-stream",
				},
				body: [
					'data: {"choices":[{"delta":{"content":"Hello "}}]}',
					"",
					'data: {"choices":[{"delta":{"content":"world"}}]}',
					"",
					"data: [DONE]",
					"",
					"",
				].join("\n"),
			});
		});

		await openBilibiliWithMockedExtension(page);

		const panel = await openPanel(page);

		// 进入设置面板
		const settingsPanel = await openSettings(page);

		// 切换到"模型"Tab（默认在"通用"Tab）
		await settingsPanel.locator('[data-testid="tab-model"]').click();

		// 打开 provider 下拉，选择 OpenAI 官方
		// ProviderList trigger 按钮 data-testid="provider-dropdown-trigger"
		const dropdownTrigger = settingsPanel.locator(
			'[data-testid="provider-dropdown-trigger"]',
		);
		await dropdownTrigger.click();
		// 选择 aria-label="选择 OpenAI 官方" 的选项按钮
		await settingsPanel
			.locator('[data-testid="provider-option"]')
			.filter({ hasText: "OpenAI 官方" })
			.getByRole("button", { name: "选择 OpenAI 官方" })
			.click();

		// 填写 API Key（ProviderForm aria-label="API Key"）
		const apiKeyInput = settingsPanel.getByLabel("API Key");
		await apiKeyInput.fill("mock-key-not-real");

		// 填写模型（ProviderForm aria-label="模型"）
		// 注意：旧仓库用"默认模型 ID"标签，新仓库标签为"模型"，aria-label="模型"
		const modelInput = settingsPanel.getByLabel("模型");
		await modelInput.fill("gpt-4o-mini");

		// 保存设置（data-testid="save-button"）
		await settingsPanel.locator('[data-testid="save-button"]').click();
		// 等待保存成功提示出现（data-testid="save-success-hint" 文案"已保存"）
		await expect(
			settingsPanel.locator('[data-testid="save-success-hint"]'),
		).toBeVisible({ timeout: 5000 });

		// 测试连接（TestConnectionButton data-testid="test-connection-button"）
		await settingsPanel
			.locator('[data-testid="test-connection-button"]')
			.click();
		// 等待连接成功结果（data-testid="test-connection-result" + .--ok class）
		await expect(
			settingsPanel.locator(".bili-agent-model-settings__test-result--ok"),
		).toBeVisible({ timeout: 5000 });
		expect(testConnectionHits).toBe(1);

		// 返回聊天界面
		await backToChat(page);

		// 发送消息，等待助手回复
		await panel.locator(".bili-agent-chat-input__textarea").fill("你好");
		await panel.locator(".bili-agent-chat-input__send").click();

		// 等待助手消息文本出现"Hello world"
		// ChatMessage 组件：.bili-agent-message--assistant .bili-agent-message__text
		const assistantText = panel
			.locator(".bili-agent-message--assistant .bili-agent-message__text")
			.last();
		await expect(assistantText).toContainText("Hello world", {
			timeout: 5000,
		});
		expect(chatHits).toBeGreaterThanOrEqual(1);

		await optionalScreenshot(page, "task-p5-e2e-happy.png");
	});

	test("rate limit (429) shows friendly quota message", async ({ page }) => {
		// mock 429 响应
		await page.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			await route.fulfill({
				status: 429,
				headers: {
					...corsHeaders(),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					error: { message: "rate limit exceeded" },
				}),
			});
		});

		// 播种已配置的 OpenAI provider（发消息会走真实 fetch -> page.route 拦截）
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});

		const panel = await openPanel(page);
		await panel.locator(".bili-agent-chat-input__textarea").fill("hello");
		await panel.locator(".bili-agent-chat-input__send").click();

		// ErrorDisplay 对 429 渲染 .bili-agent-error--rate-limit
		const error = page.locator(".bili-agent-error--rate-limit");
		await expect(error).toBeVisible({ timeout: 5000 });
		// title 非空（应为"请求太频繁"）
		await expect(error.locator(".bili-agent-error__title")).not.toBeEmpty();
		// message 非空（应为"请求太频繁，请稍后重试。"）
		await expect(error.locator(".bili-agent-error__message")).not.toBeEmpty();

		await optionalScreenshot(page, "task-p5-e2e-429.png");
	});
});
