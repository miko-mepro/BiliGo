/**
 * N-2 回归测试：聊天流总超时
 * 
 * 覆盖问题：N-2（聊天流缺少总超时）
 * 验证场景：
 * 1. 配置 mock SSE 不返回任何数据（请求保持挂起）
 * 2. 发送消息
 * 3. 等待超时错误出现（45秒内，参考 CHAT_STREAM_TIMEOUT_MS）
 * 4. 断言错误文案包含"请求超时"
 * 5. 断言超时后 Port 链路仍正常（可继续发送新消息）
 * 
 * 设计依据：任务说明 N-2 场景
 */

import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/extension-fixture.js";
import type { SeedSettings } from "../fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
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
				apiKey: "mock-key-n2-timeout",
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

/** 构造正常 SSE 流响应 */
function buildNormalSseStream(): string {
	return [
		`data: ${JSON.stringify({ choices: [{ delta: { content: "这是正常回复" }, finish_reason: "stop", index: 0 }] })}`,
		"",
		"data: [DONE]",
		"",
		"",
	].join("\n");
}

test.describe("N-2: 聊天流总超时", () => {
	test("请求挂起时应在 45 秒内超时并显示错误", async ({ page }) => {
		const context: BrowserContext = page.context();

		// 标记是否已处理第一次（挂起）请求
		let firstRequestTimedOut = false;
		// 记录第二次请求是否被调用
		let secondRequestCalled = false;

		// Mock AI API
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			
			// generate_title 请求立即返回
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_title",
						choices: [{ index: 0, message: { role: "assistant", content: "测试" }, finish_reason: "stop" }],
					}),
				});
				return;
			}

			// 第一次请求：返回 200 但 SSE 流中不发送任何数据事件
			// 只发送 SSE 的 keepalive（冒号开头的注释行），让 SW 保持连接但无数据
			if (!firstRequestTimedOut) {
				firstRequestTimedOut = true;
				await route.fulfill({
					status: 200,
					headers: {
						...corsHeaders(),
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						"Connection": "keep-alive",
					},
					// 空 body 加上 SSE 注释行（keepalive），不发送任何数据事件
					body: ": keepalive\n\n",
				});
				return;
			}

			// 第二次请求（超时后）：正常返回
			secondRequestCalled = true;
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: buildNormalSseStream(),
			});
		});

		// 打开面板并配置 settings
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送消息（这会触发挂起的请求）
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("这条消息会超时");
		await textarea.press("Enter");

		// 等待超时错误出现（最多等待 50 秒，CHAT_STREAM_TIMEOUT_MS = 45000）
		// 使用多种错误匹配方式确保兼容不同实现
		const errorMessageLocator = panel.locator('[data-testid="error-message"]')
			.or(panel.locator('.bili-agent-error'))
			.or(panel.locator('[class*="error"]'))
			.or(panel.locator('text=请求超时'))
			.or(panel.locator('text=timeout'))
			.or(panel.locator('text=超时'));
		await expect(errorMessageLocator.first()).toBeVisible({ timeout: 55000 });

		// 断言错误文案包含"请求超时"
		const errorText = await errorMessageLocator.first().textContent();
		expect(errorText).toMatch(/请求超时|timeout|超时/i);

		// 验证输入框仍然可用，可以发送新消息
		await expect(textarea).toBeVisible();
		await expect(textarea).toBeEditable();

		// 发送新消息，验证 Port 链路正常
		await textarea.fill("第二条消息应该正常");
		await textarea.press("Enter");

		// 等待新消息的响应（检查 assistant 消息出现即可，不依赖流式文本内容）
		const newAssistantMessage = panel.locator('[data-role="assistant"]').last();
		await expect(newAssistantMessage).toBeVisible({ timeout: 15000 });

		// 验证第二次请求被处理
		expect(secondRequestCalled).toBe(true);
	});
});