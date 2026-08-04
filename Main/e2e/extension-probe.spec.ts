import { expect } from "@playwright/test";
import { test } from "./fixtures/extension-fixture.js";

test("extension startup probe verifies the MV3 runtime boundaries", async ({
	context,
	page,
}) => {
	// 页面必须命中 manifest 的 content_scripts.matches，扩展才会自动注入。
	await page.goto("https://www.bilibili.com", {
		waitUntil: "domcontentloaded",
	});

	// 后台 service worker 是扩展实际加载并启动的第一条运行时证据。
	await expect
		.poll(
			() =>
				context
					.serviceWorkers()
					.some((worker) => worker.url().startsWith("chrome-extension://")),
			{ timeout: 10_000 },
		)
		.toBe(true);

	// 宿主节点证明 content script 已经在页面中挂载。
	await expect(page.locator("#bili-agent-host")).toBeAttached();
	// 首屏控件证明 React 内容已经完成可见渲染。
	await expect(page.locator("[data-bili-agent-toggle]")).toBeVisible();
});
