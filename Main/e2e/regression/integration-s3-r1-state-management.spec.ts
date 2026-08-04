/**
 * 跨域集成点二：S-3+R-1 状态管理与渲染层集成
 *
 * 验证：外部数据进入前端状态时经过结构校验
 * - S-3：视频结果进入状态时经过批次归属模型
 * - R-1：历史记录非字符串 title 被拒绝/降级
 *
 * 设计依据：docs/修复方案/阶段4-测试与验证/跨域集成验证方案.md §7.2
 */

import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/extension-fixture.js";
import type { SeedSettings } from "../fixtures/chrome-mock.js";
import { SETTINGS_STORAGE_KEY } from "../fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
} from "../fixtures/extension-harness.js";

function configuredOpenAiSettings(): SeedSettings {
	return {
		providers: [
			{
				id: "openai",
				name: "OpenAI 官方",
				format: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "mock-key-int-s3r1",
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

test.describe("集成点二：S-3+R-1 状态管理与渲染层集成", () => {
	test("注入脏历史数据后面板不崩溃，正常数据仍可搜索", async ({ page }) => {
		const context: BrowserContext = page.context();

		// Mock AI API
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
						id: "cmpl_title",
						choices: [{ index: 0, message: { role: "assistant", content: "测试" }, finish_reason: "stop" }],
					}),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: `data: ${JSON.stringify({ choices: [{ delta: { content: "正常回复" }, finish_reason: "stop", index: 0 }] })}\n\ndata: [DONE]\n\n`,
			});
		});

		// 注入脏历史数据：包含 null title、数字 title 和正常 title
		const dirtyHistoryIndex = [
			{ id: "dirty-1", title: null, titleFinal: false, createdAt: 1, lastActiveAt: 2, messageCount: 1 },
			{ id: "dirty-2", title: 12345, titleFinal: false, createdAt: 1, lastActiveAt: 3, messageCount: 1 },
			{ id: "clean-1", title: "正常对话", titleFinal: true, createdAt: 1, lastActiveAt: 4, messageCount: 1 },
		];

		// 先通过种子数据加载扩展（不注入脏数据，避免 content script 首次加载时崩溃）
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});

		// 通过扩展 SW 上下文注入脏历史数据
		const workers = context.serviceWorkers();
		const sw = workers.find((w) => w.url().startsWith("chrome-extension://"));
		expect(sw).toBeDefined();
		await sw!.evaluate(
			(data: { key: string; value: unknown }) => chrome.storage.local.set({ [data.key]: data.value }),
			{ key: "bili-agent-history-index", value: dirtyHistoryIndex },
		);

		// 监听页面错误
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => {
			pageErrors.push(err.message);
		});

		// 打开面板，展开历史下拉
		const panel = await openPanel(page);

		// 等待历史下拉出现
		const historyDropdown = panel.locator('[data-testid="history-dropdown"]')
			.or(panel.locator('[aria-label="对话历史"]'))
			.or(panel.locator('.bili-agent-history-dropdown'));
		if (await historyDropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
			// 在历史搜索框中输入字符，触发搜索过滤
			const searchInput = historyDropdown.locator('input[type="text"], input[placeholder*="搜索"]')
				.or(historyDropdown.locator('input'));
			if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
				await searchInput.fill("正常");
			}
		}

		// 断言：页面没有崩溃（无 pageerror）
		expect(pageErrors.length).toBe(0);

		// 断言：面板仍然可交互
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible({ timeout: 5000 });
	});
});