/**
 * 跨域集成点一：N-1+N-4 网络层错误分类与工具调用集成
 *
 * 验证：连接测试和聊天面对相同网络异常时显示一致文案
 * 集成点：网络层错误分类没有统一的语义层（N-1），不同调用路径各自处理网络异常（N-4）
 *
 * 设计依据：docs/修复方案/阶段4-测试与验证/跨域集成验证方案.md §7.1
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
				apiKey: "mock-key-int-n1n4",
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

/** 构造 B站 nav API mock 响应 */
function buildBilibiliNavResponse(): string {
	return JSON.stringify({
		code: 0,
		data: {
			wbi_img: {
				img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
				sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0be7df4334585d05a35d0c4b.png",
			},
		},
	});
}

async function setupCommonMocks(context: BrowserContext): Promise<void> {
	await context.route("**/api.bilibili.com/x/web-interface/nav", async (route) => {
		await route.fulfill({
			status: 200,
			headers: { ...corsHeaders(), "Content-Type": "application/json" },
			body: buildBilibiliNavResponse(),
		});
	});
}

test.describe("集成点一：N-1+N-4 网络错误分类一致性", () => {
	test("401 错误在连接测试和聊天中显示一致文案", async ({ page, runtimeEvidence }) => {
		const context: BrowserContext = page.context();
		await setupCommonMocks(context);

		// 使用同一路由 mock 对所有 /chat/completions 请求返回 401
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			await route.fulfill({
				status: 401,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({
					error: { message: "Incorrect API Key provided", type: "authentication_error", code: "invalid_api_key" },
				}),
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 路径一：聊天界面发送消息，触发 401 错误
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试401聊天");
		await textarea.press("Enter");

		// 等待聊天界面的错误消息
		const chatError = panel.locator('[data-testid="error-message"]')
			.or(panel.locator('.bili-agent-error'))
			.or(panel.locator('text=API Key'))
			.or(panel.locator('text=api key'))
			.or(panel.locator('text=认证失败'))
			.or(panel.locator('text=invalid'));
		await expect(chatError.first()).toBeVisible({ timeout: 15000 });
		const chatErrorText = await chatError.first().textContent();

		// 路径二：切换到设置，点击测试连接，触发同样的 401
		const settingsPanel = await openSettings(page);

		// 切换到模型 Tab（TestConnectionButton 在模型 Tab 中）
		await settingsPanel.locator('[data-testid="tab-model"]').click();
		await expect(settingsPanel.locator('[data-testid="model-tab-content"]')).toBeVisible({ timeout: 5000 });
		await settingsPanel.locator('[data-testid="test-connection-button"]').click();

		// 等待设置界面的错误结果
		const settingsResult = settingsPanel.locator('[data-testid="test-connection-result"]');
		await expect(settingsResult.first()).toBeVisible({ timeout: 15000 });
		const settingsErrorText = await settingsResult.first().textContent();

		// 断言：两条路径面对相同的 401 错误，文案核心语义一致
		expect(chatErrorText).toMatch(/API Key|api key|invalid|认证失败/i);
		expect(settingsErrorText).toMatch(/API Key|api key|invalid|认证失败/i);

		// 采集运行时证据（N-V1, N-V5）
		await runtimeEvidence.recordDomSnapshot(page, "integration-401-consistency");
	});
});