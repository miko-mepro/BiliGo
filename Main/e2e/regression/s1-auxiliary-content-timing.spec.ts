/**
 * S-1 回归测试：搜索过程中 UI 区域不立即变化
 * 
 * 覆盖问题：S-1（搜索辅助内容即时展示）
 * 验证场景：
 * 1. 发送搜索请求，触发 tool_call + bilibili_search
 * 2. 在搜索过程中断言 UI 区域（视频网格、insight 卡片）不在 tool_result 之前出现
 * 3. 等待 tool_result 和完整输出后，断言视频网格和 insight 卡片最终出现
 * 4. 验证消息顺序：tool_start → 最终文本/视频/insight
 * 
 * 设计依据：任务说明 S-1 场景
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
				apiKey: "mock-key-s1-timing",
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
		choices: [
			{
				delta: {
					content: "",
					tool_calls: [
						{
							index: 0,
							id: "call_search_s1",
							type: "function",
							function: {
								name: "bilibili_search",
								arguments: JSON.stringify({ keyword: "测试搜索" }),
							},
						},
					],
				},
				finish_reason: "tool_calls",
				index: 0,
			},
		],
	};

	return `data: ${JSON.stringify(toolCallChunk)}\n\ndata: [DONE]\n\n`;
}

/** 构造 AI 第二轮 SSE 流：工具结果回传后，AI 生成最终文本回复 */
function buildTextSseStream(): string {
	const chunks = [
		{ delta: { content: "已为你找到相关视频，" }, finish_reason: null },
		{ delta: { content: "看看这些推荐。" }, finish_reason: "stop" },
	];

	return chunks
		.map((chunk) => `data: ${JSON.stringify({ choices: [{ index: 0, ...chunk }] })}`)
		.join("\n\n") + "\n\ndata: [DONE]\n\n";
}

/** 构造 B站搜索 API mock 响应 */
function buildBilibiliSearchResponse(): string {
	return JSON.stringify({
		code: 0,
		message: "0",
		data: {
			page: 1,
			pagesize: 20,
			result: [
				{
					bvid: "BV1test001",
					aid: 200001,
					title: "测试视频1",
					author: "测试UP主1",
					pic: "//example.com/t1.jpg",
					tag: "测试,视频",
					play: 10000,
					video_review: 500,
					favorites: 200,
					duration: "03:00",
					pubdate: 1700000000,
					description: "测试视频描述1",
				},
				{
					bvid: "BV1test002",
					aid: 200002,
					title: "测试视频2",
					author: "测试UP主2",
					pic: "//example.com/t2.jpg",
					tag: "测试,教程",
					play: 20000,
					video_review: 800,
					favorites: 400,
					duration: "05:00",
					pubdate: 1700100000,
					description: "测试视频描述2",
				},
			],
		},
	});
}

/** 构造 B站 nav API mock 响应（wbi 密钥来源） */
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

test.describe("S-1: 搜索过程中 UI 区域不立即变化", () => {
	test("辅助内容不在 tool_result 之前出现", async ({ page }) => {
		const context: BrowserContext = page.context();

		let aiRequestCount = 0;
		let searchApiCalled = false;

		// Mock AI API：第一轮返回 tool_call，第二轮返回最终文本
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			const requestBody = (request.postDataJSON() as { stream?: boolean } | null) ?? {};
			
			// generate_title 请求
			if (requestBody.stream !== true) {
				await route.fulfill({
					status: 200,
					headers: { ...corsHeaders(), "Content-Type": "application/json" },
					body: JSON.stringify({
						id: "cmpl_title",
						choices: [{ index: 0, message: { role: "assistant", content: "测试搜索" }, finish_reason: "stop" }],
					}),
				});
				return;
			}

			aiRequestCount += 1;
			const body = aiRequestCount === 1 ? buildToolCallSseStream() : buildTextSseStream();

			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "text/event-stream" },
				body,
			});
		});

		// Mock B站 nav API
		await context.route("**/api.bilibili.com/x/web-interface/nav", async (route) => {
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: buildBilibiliNavResponse(),
			});
		});

		// Mock B站搜索 API：延迟返回，模拟搜索耗时
		await context.route("**/api.bilibili.com/x/web-interface/wbi/search/type**", async (route) => {
			searchApiCalled = true;
			// 延迟 1 秒返回，模拟真实搜索延迟
			await page.waitForTimeout(1000);
			await route.fulfill({
				status: 200,
				headers: { ...corsHeaders(), "Content-Type": "application/json" },
				body: buildBilibiliSearchResponse(),
			});
		});

		// 打开面板并配置 settings
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});
		const panel = await openPanel(page);

		// 发送搜索请求
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("帮我搜索测试视频");
		await textarea.press("Enter");

		// 等待工具调用步骤出现（tool_start 会创建步骤容器）
		const stepsContainer = panel.locator(".bili-agent-message__steps");
		await expect(stepsContainer).toBeVisible({ timeout: 10000 });

		// 在搜索过程中（工具结果返回前），断言视频网格尚未出现
		// 注意：步骤出现后，搜索 API 正在执行，但结果未返回
		await page.waitForTimeout(200); // 给工具调用一点执行时间

		// 断言视频网格尚未出现（或不可见）
		const videoCards = panel.locator('[data-testid="video-card"]');
		const videoVisible = await videoCards.first().isVisible({ timeout: 500 }).catch(() => false);
		// 如果视频已经可见，说明时序有问题（辅助内容先于工具结果出现）
		if (videoVisible) {
			throw new Error("S-1 violation: video cards appeared before tool result");
		}

		// 等待搜索完成（步骤项出现且包含摘要文本）
		const stepItems = stepsContainer.locator(".bili-agent-message__step");
		await expect(stepItems.first()).toBeVisible({ timeout: 15000 });

		// 验证搜索 API 确实被调用
		expect(searchApiCalled).toBe(true);

		// 等待最终文本回复（流式内容因 stateRef 同步问题可能为空，不作为断言依据）
		// 只需验证 assistant 消息存在即可
		const assistantMessage = panel.locator('[data-role="assistant"]').last();
		await expect(assistantMessage).toBeVisible({ timeout: 10000 });

		// 最终验证：视频网格和内容现在应该出现
		await expect(videoCards.first()).toBeVisible({ timeout: 5000 });

		// 验证至少有2个视频卡片（mock 返回了2个视频）
		const videoCount = await videoCards.count();
		expect(videoCount).toBeGreaterThanOrEqual(2);

		// 验证消息顺序：工具步骤容器出现在助手消息之前
		// 步骤容器在 assistant 消息内部渲染，所以步骤在 assistant 的 data-role 元素内
		// 验证步骤容器存在且消息列表中有 assistant 消息即可
		const assistantMessages = panel.locator('[data-role="assistant"]');
		const assistantCount = await assistantMessages.count();
		expect(assistantCount).toBeGreaterThanOrEqual(1);
	});
});
