/**
 * QA Visual E2E - 基本视觉元素验证
 *
 * 移植自旧仓库 Backend/BiliAgent/packages/extension/e2e/qa-visual.spec.ts
 *
 * 与旧仓库差异：
 * - 不再验证固定像素的渐变色（旧仓库断言具体 RGB 值，过度耦合实现细节），
 *   新仓库改为验证视觉元素存在性与基本布局约束（更稳健的视觉冒烟）
 * - 面板布局验证：尺寸合理（非 0、小于视口）、圆角存在、position: fixed
 * - 用 fixture 的 openBilibiliWithMockedExtension + openPanel 加载真实扩展
 *
 * 设计依据：4.5 SC-4 ② + 旧仓库参照
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
	openBilibiliWithMockedExtension,
	openPanel,
} from "./fixtures/extension-harness.js";

// ESM 等价 __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(__dirname, "../.sisyphus/evidence/final-qa");

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

test.describe("BiliGo QA - Visual & Interaction", () => {
	test("toggle button visible and peeking from page edge", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);

		const toggle = page.locator("[data-bili-agent-toggle]");
		await expect(toggle).toBeVisible();

		// toggle 应部分隐藏在视口右边缘（peek 效果）
		const rect = await toggle.boundingBox();
		expect(rect).not.toBeNull();
		if (rect) {
			// toggle 应位于视口右边缘附近
			expect(rect.x + rect.width).toBeGreaterThan(page.viewportSize()?.width);
		}

		await optionalScreenshot(page, "qa-01-toggle-visible.png");
	});

	test("panel opens with reasonable dimensions and rounded corners", async ({
		page,
	}) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		const styles = await panel.evaluate((el) => {
			const computed = getComputedStyle(el);
			const rect = el.getBoundingClientRect();
			return {
				borderRadius: computed.borderRadius,
				position: computed.position,
				width: rect.width,
				height: rect.height,
			};
		});

		// 面板应有圆角（新仓库 styles.ts: border-radius: 16px）
		expect(styles.borderRadius).toBe("16px");
		// position 应为 fixed（新仓库 styles.ts: position: fixed）
		expect(styles.position).toBe("fixed");
		// 宽高应合理：非 0，且高度小于视口高度
		expect(styles.width).toBeGreaterThan(0);
		expect(styles.height).toBeGreaterThan(0);

		const viewport = page.viewportSize()!;
		expect(styles.height).toBeLessThan(viewport.height);

		await optionalScreenshot(page, "qa-02-panel-open.png");
	});

	test("BiliGo title present in panel header", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// Panel.tsx: header 内有 h2.bili-agent-panel__title，内含 SVG 文本 "BiliGo"
		// aria-label="BiliGo" 标记在 SVG 上
		const titleSvg = panel.locator('svg[aria-label="BiliGo"]');
		await expect(titleSvg).toBeVisible();

		// header 文本应包含 BiliGo（SVG text 元素）
		const headerText = await panel
			.locator(".bili-agent-panel__title")
			.textContent();
		expect(headerText).toContain("BiliGo");

		await optionalScreenshot(page, "qa-03-biligo-title.png");
	});

	test("chat input and send button present when panel open", async ({
		page,
	}) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// 聊天输入框可见
		const textarea = panel.locator(".bili-agent-chat-input__textarea");
		await expect(textarea).toBeVisible();

		// 发送按钮存在（空输入时 disabled，但仍存在于 DOM）
		const sendBtn = panel.locator(".bili-agent-chat-input__send");
		await expect(sendBtn).toHaveCount(1);

		// 填入文本后发送按钮应启用
		await textarea.fill("test");
		await expect(sendBtn).toBeEnabled();

		await optionalScreenshot(page, "qa-04-input-send.png");
	});

	test("settings button present and opens settings panel", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// 设置按钮（aria-label="Open settings"）可见
		const settingsBtn = panel.locator('[aria-label="Open settings"]');
		await expect(settingsBtn).toBeVisible();

		// 点击进入设置
		await settingsBtn.click();

		// 设置面板 root 可见（data-testid="settings-panel"）
		const settingsPanel = panel.locator('[data-testid="settings-panel"]');
		await expect(settingsPanel).toBeVisible({ timeout: 5000 });

		// Tab 按钮存在：通用 + 模型
		await expect(
			settingsPanel.locator('[data-testid="tab-general"]'),
		).toBeVisible();
		await expect(
			settingsPanel.locator('[data-testid="tab-model"]'),
		).toBeVisible();

		await optionalScreenshot(page, "qa-05-settings-open.png");
	});

	test("close button present and closes panel", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// 关闭面板按钮（aria-label="关闭面板"）可见
		const closeBtn = panel.locator('[aria-label="关闭面板"]');
		await expect(closeBtn).toBeVisible();

		// 点击关闭面板
		await closeBtn.click();
		await expect(page.locator("[data-bili-agent-panel]")).toBeHidden({
			timeout: 5000,
		});

		// toggle 重新可见
		await expect(page.locator("[data-bili-agent-toggle]")).toBeVisible();

		await optionalScreenshot(page, "qa-06-close-panel.png");
	});

	test("new chat button present in panel header", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// 新建对话按钮（aria-label="新建对话"）可见
		const newChatBtn = panel.locator('[aria-label="新建对话"]');
		await expect(newChatBtn).toBeVisible();

		await optionalScreenshot(page, "qa-07-new-chat.png");
	});

	test("outside click closes panel and restores toggle", async ({ page }) => {
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);
		await expect(panel).toBeVisible();

		// 点击面板外部
		await page.mouse.click(20, 20);

		// 面板应隐藏，toggle 重新可见
		await expect(panel).toBeHidden({ timeout: 5000 });
		await expect(page.locator("[data-bili-agent-toggle]")).toBeVisible();

		await optionalScreenshot(page, "qa-08-outside-click.png");
	});
});
