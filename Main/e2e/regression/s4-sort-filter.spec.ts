/**
 * S-4 回归测试：排序/筛选功能
 *
 * 覆盖问题：S-4（排序/筛选后视频顺序正确性）
 * 验证场景：
 * 1. 视频渲染后，排序/筛选控件可见
 * 2. 切换到"播放量"排序，视频卡片按播放量降序排列
 * 3. 切换到"智能排序"，视频保留后端原始顺序
 * 4. 时间筛选器切换后，筛选结果正确
 *
 * 设计依据：S-4 审查结论
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
				apiKey: "mock-key-s4-sort",
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

/** 构造 AI 第一轮 SSE 流：返回 tool_call 请求 bilibili_search */
function buildToolCallSseStream(): string {
	const toolCallChunk = {
		choices: [{
			delta: {
				content: "",
				tool_calls: [{
					index: 0,
					id: "call_search_s4",
					type: "function",
					function: {
						name: "bilibili_search",
						arguments: JSON.stringify({ keyword: "测试排序" }),
					},
				}],
			},
			finish_reason: "tool_calls",
			index: 0,
		}],
	};
	return `data: ${JSON.stringify(toolCallChunk)}\n\ndata: [DONE]\n\n`;
}

/** 构造 AI 第二轮 SSE 流：最终文本回复 */
function buildTextSseStream(): string {
	const chunks = [
		{ delta: { content: "已为你找到相关视频，" }, finish_reason: null },
		{ delta: { content: "看看这些推荐。" }, finish_reason: "stop" },
	];
	return chunks
		.map((chunk) => `data: ${JSON.stringify({ choices: [{ index: 0, ...chunk }] })}`)
		.join("\n\n") + "\n\ndata: [DONE]\n\n";
}

/** 构造 B站搜索 API mock 响应（多视频，播放量各不相同，便于排序验证） */
function buildBilibiliSearchResponse(): string {
	return JSON.stringify({
		code: 0,
		message: "0",
		data: {
			page: 1,
			pagesize: 20,
			result: [
				{
					bvid: "BV1sort001",
					aid: 300001,
					title: "高播放量视频",
					author: "UP主A",
					pic: "//example.com/s1.jpg",
					tag: "排序,测试",
					play: 99999,
					video_review: 500,
					favorites: 100,
					duration: "03:00",
					pubdate: Math.floor(Date.now() / 1000) - 86400,
					description: "播放量最高的视频",
				},
				{
					bvid: "BV1sort002",
					aid: 300002,
					title: "中等播放量视频",
					author: "UP主B",
					pic: "//example.com/s2.jpg",
					tag: "排序,测试",
					play: 50000,
					video_review: 300,
					favorites: 200,
					duration: "05:00",
					pubdate: Math.floor(Date.now() / 1000) - 7 * 86400,
					description: "播放量中等的视频",
				},
				{
					bvid: "BV1sort003",
					aid: 300003,
					title: "低播放量视频",
					author: "UP主C",
					pic: "//example.com/s3.jpg",
					tag: "排序,测试",
					play: 10000,
					video_review: 100,
					favorites: 50,
					duration: "10:00",
					pubdate: Math.floor(Date.now() / 1000) - 30 * 86400,
					description: "播放量最低的视频",
				},
			],
		},
	});
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

test.describe("S-4: 排序/筛选功能", () => {
	test("视频渲染后排序/筛选控件可见并可切换排序", async ({ page }) => {
		const context: BrowserContext = page.context();
		let aiRequestCount = 0;

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
						choices: [{ index: 0, message: { role: "assistant", content: "测试排序" }, finish_reason: "stop" }],
					}),
				});
				return;
			}
			aiRequestCount += 1;
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: aiRequestCount === 1 ? buildToolCallSseStream() : buildTextSseStream(),
			});
		});

		// Mock B站 API
		await context.route("**/api.bilibili.com/x/web-interface/nav", async (route) => {
			await route.fulfill({ status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" }, body: buildBilibiliNavResponse() });
		});
		await context.route("**/api.bilibili.com/x/web-interface/wbi/search/type**", async (route) => {
			await route.fulfill({ status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" }, body: buildBilibiliSearchResponse() });
		});

		await openBilibiliWithMockedExtension(page, { settings: configuredOpenAiSettings() });
		const panel = await openPanel(page);

		// 发送搜索请求
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("帮我搜索测试排序的视频");
		await textarea.press("Enter");

		// 等待视频卡片出现
		const videoCards = page.locator('[data-testid="video-card"]');
		await expect(videoCards).toHaveCount(3, { timeout: 15000 });

		// 验证排序/筛选控件可见
		const filterSort = panel.locator('[data-testid="filter-sort-controls"]');
		await expect(filterSort).toBeVisible();

		// 默认排序为"智能排序"，验证视频按后端顺序显示（高->中->低播放量）
		await expect(videoCards.nth(0)).toContainText("高播放量视频");
		await expect(videoCards.nth(1)).toContainText("中等播放量视频");
		await expect(videoCards.nth(2)).toContainText("低播放量视频");

		// 切换到"播放量"排序：验证仍为降序（高->中->低，与智能排序顺序一致）
		await filterSort.locator("#bili-agent-sort").selectOption("play");
		await page.waitForTimeout(500);
		await expect(videoCards.nth(0)).toContainText("高播放量视频");
		await expect(videoCards.nth(1)).toContainText("中等播放量视频");
		await expect(videoCards.nth(2)).toContainText("低播放量视频");

		// 切换回"智能排序"，验证顺序不变
		await filterSort.locator("#bili-agent-sort").selectOption("rerank");
		await page.waitForTimeout(500);
		await expect(videoCards.nth(0)).toContainText("高播放量视频");
		await expect(videoCards.nth(1)).toContainText("中等播放量视频");
		await expect(videoCards.nth(2)).toContainText("低播放量视频");
	});

	test("时间筛选器切换后筛选结果正确", async ({ page }) => {
		const context: BrowserContext = page.context();
		let aiRequestCount = 0;

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
						choices: [{ index: 0, message: { role: "assistant", content: "测试筛选" }, finish_reason: "stop" }],
					}),
				});
				return;
			}
			aiRequestCount += 1;
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body: aiRequestCount === 1 ? buildToolCallSseStream() : buildTextSseStream(),
			});
		});

		await context.route("**/api.bilibili.com/x/web-interface/nav", async (route) => {
			await route.fulfill({ status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" }, body: buildBilibiliNavResponse() });
		});
		await context.route("**/api.bilibili.com/x/web-interface/wbi/search/type**", async (route) => {
			await route.fulfill({ status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" }, body: buildBilibiliSearchResponse() });
		});

		await openBilibiliWithMockedExtension(page, { settings: configuredOpenAiSettings() });
		const panel = await openPanel(page);

		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("帮我搜索测试排序的视频");
		await textarea.press("Enter");

		const videoCards = page.locator('[data-testid="video-card"]');
		await expect(videoCards).toHaveCount(3, { timeout: 15000 });

		const filterSort = panel.locator('[data-testid="filter-sort-controls"]');
		await expect(filterSort).toBeVisible();

		// 设置时长筛选为"<5分钟"，应过滤掉时长>=5分钟的视频
		// 高播放量视频(03:00=180s) < 300s → 保留
		// 中等播放量视频(05:00=300s) >= 300s → 过滤
		// 低播放量视频(10:00=600s) >= 300s → 过滤
		await filterSort.locator("#bili-agent-duration-filter").selectOption("short");
		await page.waitForTimeout(500);
		// 只有1个视频（高播放量）通过筛选
		await expect(videoCards).toHaveCount(1);
		await expect(videoCards).toContainText("高播放量视频");

		// 重置时长筛选为"全部时长"
		await filterSort.locator("#bili-agent-duration-filter").selectOption("all");
		await page.waitForTimeout(500);
		await expect(videoCards).toHaveCount(3);
	});
});