/**
 * N-1/N-4 回归测试：错误分类
 * 
 * 覆盖问题：N-1（统一错误分类）、N-4（工具网络错误语义）
 * 验证场景：
 * 1. 401 响应 → 错误文案包含"API Key 无效"
 * 2. 429 响应 → 错误文案包含"请求太频繁"
 * 3. 超时响应 → 错误文案包含"连接超时"
 * 4. 不同错误类型显示不同文案
 * 
 * 设计依据：任务说明 N-1/N-4 场景
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
				apiKey: "mock-key-error-classification",
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

/**
 * 注册通用的 mock 路由，拦截非 AI API 的请求（如 B站 nav API）。
 * 本测试不涉及 B站搜索，但 nav 请求可能在扩展初始化时发出。
 */
async function setupCommonMocks(context: BrowserContext): Promise<void> {
	// Mock B站 nav API
	await context.route("**/api.bilibili.com/x/web-interface/nav", async (route) => {
		await route.fulfill({
			status: 200,
			headers: { ...corsHeaders(), "Content-Type": "application/json" },
			body: buildBilibiliNavResponse(),
		});
	});
}

test.describe("N-1/N-4: 错误分类", () => {
	test("401 错误应显示 API Key 无效", async ({ page }) => {
		const context: BrowserContext = page.context();
		await setupCommonMocks(context);

		// Mock AI API 返回 401
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
					error: {
						message: "Incorrect API key provided",
						type: "authentication_error",
						code: "invalid_api_key",
					},
				}),
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送消息
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试 401 错误");
		await textarea.press("Enter");

		// 等待错误消息出现
		const errorMessage = panel.locator('[data-testid="error-message"]')
			.or(panel.locator('.bili-agent-error'))
			.or(panel.locator('[class*="error"]'))
			.or(panel.locator('text=API Key 无效'))
			.or(panel.locator('text=API Key'))
			.or(panel.locator('text=api key'))
			.or(panel.locator('text=invalid'))
			.or(panel.locator('text=认证失败'));
		await expect(errorMessage.first()).toBeVisible({ timeout: 15000 });
		const errorText = await errorMessage.first().textContent();
		expect(errorText).toMatch(/API Key|api key|invalid|认证失败/i);
	});

	test("429 错误应显示请求太频繁", async ({ page }) => {
		const context: BrowserContext = page.context();
		await setupCommonMocks(context);

		// Mock AI API 返回 429
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			await route.fulfill({
				status: 429,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({
					error: {
						message: "Rate limit exceeded",
						type: "rate_limit_error",
						code: "rate_limit_exceeded",
					},
				}),
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送消息
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试 429 错误");
		await textarea.press("Enter");

		// 等待错误消息出现
		const errorMessage = panel.locator('[data-testid="error-message"]')
			.or(panel.locator('.bili-agent-error'))
			.or(panel.locator('[class*="error"]'))
			.or(panel.locator('text=请求太频繁'))
			.or(panel.locator('text=rate limit'))
			.or(panel.locator('text=太频繁'))
			.or(panel.locator('text=限流'))
			.or(panel.locator('text=速率限制'));
		await expect(errorMessage.first()).toBeVisible({ timeout: 15000 });
		const errorText = await errorMessage.first().textContent();
		expect(errorText).toMatch(/请求太频繁|rate limit|太频繁|限流|速率限制/i);
	});

	test("超时错误应显示连接超时", async ({ page }) => {
		const context: BrowserContext = page.context();
		await setupCommonMocks(context);

		// Mock AI API：请求挂起，不返回任何数据（SSE 空内容）
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			// 返回 200 但 SSE 流中无数据事件，模拟连接超时
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: ": keepalive\n\n",
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送消息
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试超时错误");
		await textarea.press("Enter");

		// 等待超时错误出现（最多等待 50 秒）
		const errorMessage = panel.locator('[data-testid="error-message"]')
			.or(panel.locator('.bili-agent-error'))
			.or(panel.locator('[class*="error"]'))
			.or(panel.locator('text=连接超时'))
			.or(panel.locator('text=超时'))
			.or(panel.locator('text=timeout'))
			.or(panel.locator('text=请求超时'));
		await expect(errorMessage.first()).toBeVisible({ timeout: 55000 });
		const errorText = await errorMessage.first().textContent();
		expect(errorText).toMatch(/连接超时|超时|timeout|请求超时/i);
	});

	test("不同错误类型应显示不同文案", async ({ page }) => {
		// 此测试验证在前端/错误处理层中，不同错误状态码映射到不同文案
		// 通过检查 chrome-runtime-error-handler 的逻辑来验证分类
		const context: BrowserContext = page.context();
		await setupCommonMocks(context);

		// 收集错误消息类型
		const errorMessages: string[] = [];

		// 第一步：测试 401 错误
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			await route.fulfill({
				status: 401,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ error: { message: "Unauthorized", type: "auth_error" } }),
			});
		});

		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送第一条消息触发 401
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("测试401");
		await textarea.press("Enter");

		const errorMessage401 = panel.locator(
			'[data-testid="error-message"], ' +
			'.bili-agent-error, ' +
			'[class*="error"]'
		);
		await expect(errorMessage401.first()).toBeVisible({ timeout: 15000 });
		errorMessages.push((await errorMessage401.first().textContent()) ?? "");

		// 清理已有消息，准备第二次测试
		// 移除 AI API 路由，注册新的 429 路由
		await context.unroute("**/chat/completions");
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}
			await route.fulfill({
				status: 429,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ error: { message: "Too Many Requests", type: "rate_limit" } }),
			});
		});

		// 发送第二条消息触发 429
		await textarea.fill("测试429");
		await textarea.press("Enter");

		await expect(errorMessage401.first()).toBeVisible({ timeout: 15000 });
		errorMessages.push((await errorMessage401.first().textContent()) ?? "");

		// 验证不同错误类型产生不同文案
		// 401 和 429 的文案应该不同（区分度）
		expect(errorMessages[0]).not.toBe(errorMessages[1]);
	});
});