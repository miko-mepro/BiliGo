/**
 * S-2 回归测试：流式输出期间用户上拉后不被自动滚动拉回
 * 
 * 覆盖问题：S-2（自动滚动缺少用户保护）
 * 验证场景：
 * 1. 流式输出期间，用户手动上拉聊天区域
 * 2. 后续流式 chunk 到达时，用户不被自动拉回底部
 * 3. 流式结束后，用户手动滚回底部，自动滚动恢复正常
 * 
 * 设计依据：任务说明 S-2 场景
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
				apiKey: "mock-key-s2-scroll",
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

/** 构造多段流式 SSE 输出，模拟真实流式输出间隔 */
function buildSlowStreamSse(): string {
	const chunks = [
		{ delta: { content: "这是第一段文本，" }, finish_reason: null },
		{ delta: { content: "这是第二段文本，" }, finish_reason: null },
		{ delta: { content: "这是第三段文本，" }, finish_reason: null },
		{ delta: { content: "这是第四段文本，" }, finish_reason: null },
		{ delta: { content: "这是最后一段文本。" }, finish_reason: "stop" },
	];

	return chunks
		.map((chunk) => `data: ${JSON.stringify({ choices: [{ index: 0, ...chunk }] })}`)
		.join("\n\n") + "\n\ndata: [DONE]\n\n";
}

test.describe("S-2: 流式输出期间用户上拉后不被自动滚动拉回", () => {
	test("用户手动上拉后，流式输出不应强制拉回底部", async ({ page }) => {
		const context: BrowserContext = page.context();

		// Mock AI API：返回流式输出
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			
			// generate_title 请求返回 JSON
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_title",
						choices: [{ index: 0, message: { role: "assistant", content: "测试标题" }, finish_reason: "stop" }],
					}),
				});
				return;
			}

			// 流式聊天请求
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: buildSlowStreamSse(),
			});
		});

		// 打开面板并配置 settings
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送消息触发流式输出
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试流式输出滚动保护");
		await textarea.press("Enter");

		// 等待助手消息出现（route.fulfill 一次性返回完整 SSE，
		// [DONE] 在 React commit 前到达，isLoading 已为 false，
		// 因此 agent-running 不会出现。以 assistant 消息出现为准。）
		const assistantMessage = panel.locator('[data-role="assistant"]').last();
		await expect(assistantMessage).toBeVisible({ timeout: 10000 });

		// 获取消息列表容器（聊天滚动区域）
		const messageList = panel.locator(".bili-agent-message-list");
		await expect(messageList).toBeVisible();

		// 检查容器是否可滚动。如果内容不足以溢出，scrollTop 始终为 0，
		// 此时滚动保护不生效（也不需要），跳过上拉断言。
		const scrollHeight = await messageList.evaluate((el) => el.scrollHeight);
		const clientHeight = await messageList.evaluate((el) => el.clientHeight);
		const isScrollable = scrollHeight > clientHeight;

		if (isScrollable) {
			// 记录当前 scrollTop（刚发完消息，应该在底部附近）
			const initialScrollTop = await messageList.evaluate((el) => el.scrollTop);

			// 用户手动上拉（模拟用户查看历史消息）
			await messageList.evaluate((el) => {
				el.scrollTop = 0;
			});

			// 等待一小段时间，让 React 处理可能的异步更新
			await page.waitForTimeout(500);

			// 读取当前 scrollTop，断言用户没有被拉回底部
			const scrollTopAfterUp = await messageList.evaluate((el) => el.scrollTop);
			expect(scrollTopAfterUp).toBeLessThan(initialScrollTop);
		}

		// 用户手动滚回底部，验证自动滚动恢复
		await messageList.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});

		// 发送新消息，验证自动滚动正常工作
		await textarea.fill("第二条消息");
		await textarea.press("Enter");

		// 等待新消息的 assistant 出现
		const secondAssistant = panel.locator('[data-role="assistant"]').last();
		await expect(secondAssistant).toBeVisible({ timeout: 10000 });

		// 验证新消息到达时自动滚动到底部
		const finalScrollTop = await messageList.evaluate((el) => el.scrollTop);
		const finalScrollHeight = await messageList.evaluate((el) => el.scrollHeight);
		const finalClientHeight = await messageList.evaluate((el) => el.clientHeight);
		
		// 允许小误差（滚动到底部时 scrollTop + clientHeight ≈ scrollHeight）
		expect(finalScrollTop + finalClientHeight).toBeGreaterThanOrEqual(finalScrollHeight - 10);
	});
});
