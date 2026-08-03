/**
 * Agent Flow E2E - 完整 Agent 流程端到端测试（全 mock）
 *
 * 移植自旧仓库 Backend/BiliAgent/packages/extension/e2e/agent-flow.spec.ts
 * 旧仓库无此文件，按设计依据 4.5 SC-4 ② + 旧仓库参照全新编写。
 *
 * 验证完整 agent 工作流：
 * 1. 用户在输入框键入消息并发送
 * 2. SW 端 streamText 调用 AI API，AI SDK 解析 SSE 流
 * 3. AI 返回 tool_call 请求调用 bilibili_search 工具
 * 4. bilibili_search 工具调用 B站搜索 API（wbi 签名 + search/type 端点）
 * 5. 工具结果回传给 AI，AI 生成最终文本回复
 * 6. UI 渲染：助手消息出现、工具调用步骤出现、视频卡片出现
 *
 * Mock 策略：
 * - context.route 拦截 /chat/completions 路径，mock AI API 的 SSE 流
 *   第一段返回 tool_call 请求 bilibili_search
 *   第二段（tool_call 执行后 AI 二次请求）返回最终文本
 * - context.route 拦截 api.bilibili.com 域名，mock B站接口
 *   /x/web-interface/nav 返回 wbi 密钥
 *   /x/web-interface/wbi/search/type 返回搜索结果
 * - 不依赖真实网络/API Key
 *
 * 网络拦截架构说明（P5-2.3 reviewer CRITICAL 修复）：
 * AI API fetch（streamText -> createOpenAI -> fetch）与 B站 API fetch
 * （wbi.ts -> fetch）均在扩展 Service Worker 上下文执行。
 * page.route() 仅拦截页面级请求，无法拦截 SW 发起的请求
 * （SW 是独立的 CDP 目标）。
 * 改用 context.route() 在 BrowserContext 级别拦截，
 * 覆盖 context 下所有目标（page + service worker）发起的请求。
 *
 * 设计依据：4.5 SC-4 ② + 旧仓库参照
 * 参照 Main/src/background/stream.ts 的 streamText + tool 流转
 * 参照 Main/src/lib/bilibili-client/wbi.ts 的 wbi 密钥获取
 * 参照 Main/src/lib/bilibili-client/search.ts 的搜索结果映射
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./fixtures/extension-fixture.js";
import type { SeedSettings } from "./fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
} from "./fixtures/extension-harness.js";

// ESM 等价 __dirname（用于截图证据输出目录）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 截图证据目录（保留旧仓库的可选证据逻辑，失败不阻塞测试）
const evidenceDir = path.resolve(__dirname, "../.sisyphus/evidence");

/**
 * 构造一份已配置 OpenAI provider 的种子 settings（apiKey 为 mock 值）。
 * 发消息会走真实 fetch -> context.route 拦截，不依赖真实 API Key。
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
 * CORS 响应头：context.route mock 需要，否则浏览器 fetch 会被 CORS 拦截。
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

/**
 * 构造 AI 第一轮 SSE 流：返回 tool_call 请求 bilibili_search。
 *
 * AI SDK streamText 解析 OpenAI 兼容的 SSE 流，tool_calls 字段触发 tool-call 事件，
 * stream.ts 第 341-349 行将 tool-call 转为 {type:'tool_start'} 消息推送给 CS。
 *
 * 设计依据：任务说明 mock SSE 流示例
 */
function buildToolCallSseStream(): string {
	// 单段 tool_call delta：请求调用 bilibili_search，keyword 参数为"退退退"
	// finish_reason:"tool_calls" 表示本轮以工具调用结束，等待工具结果
	const toolCallChunk = {
		choices: [
			{
				delta: {
					content: "",
					tool_calls: [
						{
							id: "call_mock_search_1",
							type: "function",
							function: {
								name: "bilibili_search",
								arguments: JSON.stringify({ keyword: "退退退" }),
							},
						},
					],
				},
				finish_reason: "tool_calls",
				index: 0,
			},
		],
	};

	return [
		`data: ${JSON.stringify(toolCallChunk)}`,
		"",
		"data: [DONE]",
		"",
		"",
	].join("\n");
}

/**
 * 构造 AI 第二轮 SSE 流：工具结果回传后，AI 生成最终文本回复。
 *
 * stream.ts 第 335-337 行将 text-delta 转为 {type:'chunk'} 消息推送给 CS，
 * ChatContext 把 chunk 拼接到当前 streamingContent，渲染为助手消息文本。
 */
function buildTextSseStream(): string {
	const textChunk1 = {
		choices: [
			{
				delta: { content: "已为你找到退退退相关视频，" },
				finish_reason: null,
				index: 0,
			},
		],
	};
	const textChunk2 = {
		choices: [
			{
				delta: { content: "看看这几个推荐。" },
				finish_reason: "stop",
				index: 0,
			},
		],
	};

	return [
		`data: ${JSON.stringify(textChunk1)}`,
		"",
		`data: ${JSON.stringify(textChunk2)}`,
		"",
		"data: [DONE]",
		"",
		"",
	].join("\n");
}

/**
 * 构造 B站搜索 API mock 响应。
 *
 * 字段映射参照 Main/src/lib/bilibili-client/search.ts 的 mapVideoCard：
 * - bvid / title / author / pic / tag / duration / description 为 string
 * - aid / play / video_review / favorites / pubdate 为 number
 *
 * 设计依据：任务说明 mock B站搜索返回示例
 */
function buildBilibiliSearchResponse(): string {
	return JSON.stringify({
		code: 0,
		message: "0",
		data: {
			page: 1,
			pagesize: 20,
			result: [
				{
					bvid: "BV1xx000001",
					aid: 100001,
					title: "退退退原版鬼畜",
					author: "鬼畜UP主",
					pic: "//example.com/p1.jpg",
					tag: "鬼畜,退退退",
					play: 12345,
					video_review: 678,
					favorites: 901,
					duration: "03:21",
					pubdate: 1700000000,
					description: "退退退原版鬼畜视频",
				},
				{
					bvid: "BV1xx000002",
					aid: 100002,
					title: "退退退舞蹈版",
					author: "舞蹈UP主",
					pic: "//example.com/p2.jpg",
					tag: "舞蹈,退退退",
					play: 5432,
					video_review: 321,
					favorites: 456,
					duration: "02:15",
					pubdate: 1700100000,
					description: "退退退舞蹈改编",
				},
			],
		},
	});
}

/**
 * 构造 B站 nav API mock 响应（wbi 密钥来源）。
 *
 * wbi.ts 第 135-166 行从 data.wbi_img.img_url / sub_url 提取密钥，
 * 密钥取 URL 路径最后一段文件名（去扩展名）。
 *
 * 这里返回两个已知密钥值，使 wbiSign 能正常签名。
 */
function buildBilibiliNavResponse(): string {
	return JSON.stringify({
		code: 0,
		data: {
			wbi_img: {
				img_url:
					"https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
				sub_url:
					"https://i0.hdslb.com/bfs/wbi/4932caff0be7df4334585d05a35d0c4b.png",
			},
		},
	});
}

test.describe("BiliGo agent flow (mocked end-to-end)", () => {
	test("user sends message, AI calls bilibili_search, videos render", async ({
		page,
	}) => {
		// 获取 BrowserContext：context.route 在 context 级别拦截请求，
		// 覆盖 page 与扩展 service worker 两类 CDP 目标发起的 fetch。
		// 必须在 openBilibiliWithMockedExtension 之前注册路由，
		// 否则 SW 启动时发起的请求会绕过 mock。
		const context: BrowserContext = page.context();

		// 记录 AI API 请求次数（tool_call 一轮 + 文本回复一轮 = 2 轮）
		let aiRequestCount = 0;
		// 记录 B站搜索 API 调用次数（应为 1 次）
		let bilibiliSearchHits = 0;

		// ---------- Mock 1: AI API（/chat/completions）----------
		// 第一轮返回 tool_call 请求 bilibili_search，
		// 第二轮（工具结果回传后）返回最终文本。
		// 用 context.route 拦截：AI API fetch 在扩展 SW 上下文执行，
		// page.route 无法拦截 SW 发起的请求。
		await context.route("**/chat/completions", async (route) => {
			const request = route.request();
			if (request.method() === "OPTIONS") {
				await route.fulfill({ status: 204, headers: corsHeaders() });
				return;
			}

			aiRequestCount += 1;
			// 第一轮：返回 tool_call（AI SDK 解析后触发 tool-call 事件 -> tool_start 消息）
			// 第二轮：工具结果回传后 AI 生成最终文本（触发 text-delta -> chunk 消息）
			const body =
				aiRequestCount === 1 ? buildToolCallSseStream() : buildTextSseStream();

			await route.fulfill({
				status: 200,
				headers: {
					...corsHeaders(),
					"Content-Type": "text/event-stream",
				},
				body,
			});
		});

		// ---------- Mock 2: B站 nav API（wbi 密钥来源）----------
		// wbi.ts 在首次搜索前会请求 nav 端点获取 wbi_img 密钥用于签名。
		// 必须在 search/type 之前被拦截并返回有效密钥，否则 wbiSign 会抛错。
		// 用 context.route 拦截：B站 API fetch 同样在扩展 SW 上下文执行。
		await context.route(
			"**/api.bilibili.com/x/web-interface/nav",
			async (route) => {
				await route.fulfill({
					status: 200,
					headers: {
						...corsHeaders(),
						"Content-Type": "application/json",
					},
					body: buildBilibiliNavResponse(),
				});
			},
		);

		// ---------- Mock 3: B站搜索 API（search/type）----------
		// bilibili_search 工具内部调 searchVideo -> wbiFetch(search/type)。
		// 返回两条视频结果，stream.ts 第 184 行将结果转为 {type:'videos'} 消息推送，
		// ChatContext SET_VIDEOS 后 MessageList 渲染 VideoCard 组件。
		// 用 context.route 拦截：工具 fetch 在扩展 SW 上下文执行。
		await context.route(
			"**/api.bilibili.com/x/web-interface/wbi/search/type",
			async (route) => {
				bilibiliSearchHits += 1;
				await route.fulfill({
					status: 200,
					headers: {
						...corsHeaders(),
						"Content-Type": "application/json",
					},
					body: buildBilibiliSearchResponse(),
				});
			},
		);

		// ---------- 启动扩展并播种已配置 provider 的 settings ----------
		await openBilibiliWithMockedExtension(page, {
			settings: configuredOpenAiSettings(),
		});

		const panel = await openPanel(page);

		// ---------- 输入消息并发送 ----------
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();
		await textarea.fill("帮我搜退退退的视频");

		const sendButton = panel.locator(".bili-agent-chat-input__send");
		await expect(sendButton).toBeEnabled();
		await sendButton.click();

		// ---------- 断言 1: 工具调用步骤出现 ----------
		// ChatMessage.tsx 第 63-84 行渲染 .bili-agent-message__steps，
		// 每个步骤 step.summary 在 tool_start 时为空字符串，
		// tool_result 后由 COMPLETE_STEP 填充。
		// 这里仅断言步骤容器出现（工具已被调用）。
		const stepsContainer = panel.locator(".bili-agent-message__steps");
		await expect(stepsContainer).toBeVisible({ timeout: 10_000 });

		// 断言工具调用步骤含 bilibili_search（step.name 在 tool_start 时设置）
		// ChatMessage.tsx 第 80 行渲染 step.summary，但 summary 初始为空。
		// 改为断言步骤项存在且数量 >= 1。
		const stepItems = stepsContainer.locator(".bili-agent-message__step");
		await expect(stepItems.first()).toBeVisible({ timeout: 5000 });

		// ---------- 断言 2: 视频卡片出现 ----------
		// VideoCard.tsx 第 97-99 行：className="bili-agent-video-card" + data-testid="video-card"
		// MessageList.tsx 第 175 行渲染 <VideoCard key={video.bvid} video={video} />
		// mock 返回两条视频，应渲染两张视频卡片
		const videoCards = page.locator('[data-testid="video-card"]');
		await expect(videoCards).toHaveCount(2, { timeout: 10_000 });

		// 第一张视频卡片应含搜索结果标题
		await expect(videoCards.nth(0)).toContainText("退退退原版鬼畜");
		// 第二张视频卡片应含搜索结果作者
		await expect(videoCards.nth(1)).toContainText("舞蹈UP主");

		// ---------- 断言 3: AI 最终文本回复出现 ----------
		// 工具结果回传后 AI 二次请求，返回文本流，拼接为助手消息。
		// ChatMessage.tsx 第 87-89 行：.bili-agent-message__bubble > .bili-agent-message__text
		// 取最后一条助手消息（流式完成后 streamingContent 落入 message.content）
		const assistantText = panel
			.locator(".bili-agent-message--assistant .bili-agent-message__text")
			.last();
		await expect(assistantText).toContainText("退退退", { timeout: 10_000 });

		// ---------- 断言 4: mock 端点被正确调用 ----------
		// AI API 至少 2 轮（tool_call + 文本回复）
		expect(aiRequestCount).toBeGreaterThanOrEqual(2);
		// B站搜索 API 恰好 1 次（bilibili_search 工具执行一次）
		expect(bilibiliSearchHits).toBe(1);

		await optionalScreenshot(page, "task-p5-e2e-agent-flow.png");
	});
});
