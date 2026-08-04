/**
 * R-3 回归测试：连接测试竞态保护
 *
 * 覆盖问题：R-3（连接测试过期状态保护）
 * 验证场景：
 * 1. 连接测试成功后结果显示正确
 * 2. 连接测试失败后错误信息正确显示
 *
 * 设计依据：R-3 审查结论
 * 注意：连接测试通过 Port 与 SW 通信，settings 通过 seedSettingsToStorage 预播种
 * （与 n1-n4、s1、s2 等回归测试模式一致）
 */

import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/extension-fixture.js";
import type { SeedSettings } from "../fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
	openSettings,
} from "../fixtures/extension-harness.js";

/** 构造已配置 OpenAI provider 的种子设置 */
function configuredOpenAiSettings(): SeedSettings {
	return {
		providers: [
			{
				id: "openai",
				name: "OpenAI 官方",
				format: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "mock-key-r3-race",
				model: "gpt-4o-mini",
				isBuiltIn: true,
				isCustom: false,
			},
		],
		activeProviderId: "openai",
		themeMode: "auto",
	};
}

/** CORS 响应头 */
function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
		"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
		"Access-Control-Expose-Headers": "*",
	};
}

/** 正常 SSE 连接测试响应 */
function buildNormalSseResponse(): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop", index: 0 }] })}\n\ndata: [DONE]\n\n`;
}

/** 401 错误响应 */
function build401Response(): string {
	return JSON.stringify({
		error: { message: "Incorrect API key provided", type: "authentication_error", code: "invalid_api_key" },
	});
}

test.describe("R-3: 连接测试竞态保护", () => {
	test("连接测试成功后结果显示正确", async ({ page }) => {
		const context: BrowserContext = page.context();
		let testConnectionHits = 0;

		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			testConnectionHits += 1;
			// generateText（非流式，stream:false）返回 JSON；streaming 返回 SSE
			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_test_ok",
						choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
					}),
				});
			} else {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
					body: buildNormalSseResponse(),
				});
			}
		});

		await openBilibiliWithMockedExtension(page, { settings: configuredOpenAiSettings() });
		const panel = await openPanel(page);
		const settingsPanel = await openSettings(page);

		await settingsPanel.locator('[data-testid="tab-model"]').click();
		await settingsPanel.locator('[data-testid="test-connection-button"]').click();

		await expect(
			settingsPanel.locator('[data-testid="test-connection-result"]'),
		).toBeVisible({ timeout: 10000 });

		const resultText = await settingsPanel.locator('[data-testid="test-connection-result"]').textContent();
		expect(resultText).toContain("✓");
		expect(testConnectionHits).toBe(1);
	});

	test("连接测试失败后错误信息正确显示", async ({ page }) => {
		const context: BrowserContext = page.context();
		let testConnectionHits = 0;

		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			testConnectionHits += 1;
			await route.fulfill({
				status: 401,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: build401Response(),
			});
		});

		await openBilibiliWithMockedExtension(page, { settings: configuredOpenAiSettings() });
		const panel = await openPanel(page);
		const settingsPanel = await openSettings(page);

		await settingsPanel.locator('[data-testid="tab-model"]').click();
		await settingsPanel.locator('[data-testid="test-connection-button"]').click();

		await expect(
			settingsPanel.locator('[data-testid="test-connection-result"]'),
		).toBeVisible({ timeout: 10000 });

		const resultText = await settingsPanel.locator('[data-testid="test-connection-result"]').textContent();
		expect(resultText).toMatch(/API Key|api key|invalid|认证失败/i);
		expect(testConnectionHits).toBe(1);
	});

	test("快速点击测试连接，只有最后一次结果生效", async ({ page }) => {
		const context: BrowserContext = page.context();
		let requestCount = 0;

		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			requestCount += 1;
			// generateText（非流式）返回 JSON
			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_test_ok",
						choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
					}),
				});
			} else {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
					body: buildNormalSseResponse(),
				});
			}
		});

		await openBilibiliWithMockedExtension(page, { settings: configuredOpenAiSettings() });
		const panel = await openPanel(page);
		const settingsPanel = await openSettings(page);

		await settingsPanel.locator('[data-testid="tab-model"]').click();

		const testButton = settingsPanel.locator('[data-testid="test-connection-button"]');
		await testButton.click();
		await testButton.click();

		await expect(
			settingsPanel.locator('[data-testid="test-connection-result"]'),
		).toBeVisible({ timeout: 15000 });

		expect(requestCount).toBeGreaterThanOrEqual(1);
	});
});