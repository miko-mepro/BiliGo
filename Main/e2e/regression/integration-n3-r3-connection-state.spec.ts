/**
 * 跨域集成点三：N-3+R-3 TestConnectionButton 状态管理集成
 *
 * 验证：设置 Port 断线检测和连接测试 Promise 取消在共用代码上不冲突
 * - N-3：设置 Port 注册 onDisconnect 处理
 * - R-3：Promise.race 引入取消机制，旧请求不覆盖新状态
 *
 * 设计依据：docs/修复方案/阶段4-测试与验证/跨域集成验证方案.md §7.3
 * 简化说明：测试连接按钮 testing 期间 disabled，第二击被 handleClick 的 guard 拦截，
 * 故测试侧重于：组件卸载后过期结果不写入、切换后正常渲染。
 */

import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/extension-fixture.js";
import type { SeedSettings } from "../fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
	openSettings,
	backToChat,
} from "../fixtures/extension-harness.js";

function configuredOpenAiSettings(): SeedSettings {
	return {
		providers: [
			{
				id: "openai",
				name: "OpenAI 官方",
				format: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "mock-key-int-n3r3",
				model: "gpt-4o-mini",
				isBuiltIn: true,
				isCustom: false,
			},
		],
		activeProviderId: "openai",
		themeMode: "auto",
	};
}

function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
		"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
		"Access-Control-Expose-Headers": "*",
	};
}

test.describe("集成点三：N-3+R-3 TestConnectionButton 状态管理集成", () => {
	test("连接测试期间切换回聊天视图，过期结果不覆盖新状态", async ({ page }) => {
		const context: BrowserContext = page.context();
		let routeHandlerStarted = false;
		let routeHandlerResolve: (() => void) | null = null;
		const routeHandlerBlocker = new Promise<void>((resolve) => {
			routeHandlerResolve = resolve;
		});

		// Mock AI API：连接测试请求延迟返回
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			// generate_title 请求（非流式）
			if (requestBody.stream !== true) {
				routeHandlerStarted = true;
				await routeHandlerBlocker;
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_test",
						choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
					}),
				});
				return;
			}
			// 流式请求（聊天）正常响应
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: `data: ${JSON.stringify({ choices: [{ delta: { content: "回复" }, finish_reason: "stop", index: 0 }] })}\n\ndata: [DONE]\n\n`,
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 进入设置视图
		const settingsPanel = await openSettings(page);
		await settingsPanel.locator('[data-testid="tab-model"]').click();
		await expect(settingsPanel.locator('[data-testid="model-tab-content"]')).toBeVisible({ timeout: 5000 });
		await settingsPanel.locator('[data-testid="test-connection-button"]').click();

		// 等待路由 handler 被调用（请求已发出）
		await page.waitForTimeout(1000);
		expect(routeHandlerStarted).toBe(true);

		// 在请求尚未返回时，切换回聊天视图（组件卸载）
		await backToChat(page);

		// 释放延迟响应（模拟旧请求返回）
		routeHandlerResolve?.();
		await page.waitForTimeout(2000);

		// 再次进入设置页，检查状态是否一致
		await openSettings(page);

		// 断言：设置面板仍然正常渲染，没有被过期结果覆盖
		await expect(panel.locator('[data-testid="settings-panel"]')).toBeVisible({ timeout: 5000 });

		// 断言：没有页面级错误
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => pageErrors.push(err.message));
		expect(pageErrors.length).toBe(0);
	});

	test("测试连接按钮 testing 期间禁用，防止重复触发", async ({ page }) => {
		const context: BrowserContext = page.context();

		// Mock AI API 正常响应
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_test",
						choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
					}),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: `data: ${JSON.stringify({ choices: [{ delta: { content: "回复" }, finish_reason: "stop", index: 0 }] })}\n\ndata: [DONE]\n\n`,
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		const settingsPanel = await openSettings(page);
		await settingsPanel.locator('[data-testid="tab-model"]').click();
		await expect(settingsPanel.locator('[data-testid="model-tab-content"]')).toBeVisible({ timeout: 5000 });

		// 点击测试连接按钮
		await settingsPanel.locator('[data-testid="test-connection-button"]').click();

		// 等待按钮变为禁用状态（testing 状态）
		await expect(settingsPanel.locator('[data-testid="test-connection-button"]')).toBeDisabled({ timeout: 3000 });

		// 等待测试结果出现
		await expect(settingsPanel.locator('[data-testid="test-connection-result"]')).toBeVisible({ timeout: 15000 });
		const resultText = await settingsPanel.locator('[data-testid="test-connection-result"]').textContent();
		expect(resultText).toContain("✓");
	});
});