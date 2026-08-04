/**
 * R-2 回归测试：历史重命名
 *
 * 覆盖问题：R-2（历史重命名缺少请求代次保护）
 * 验证场景：
 * 1. 点击重命名按钮进入编辑态，输入新标题后回车确认，标题更新
 * 2. 点击重命名按钮进入编辑态，按 Escape 取消，标题恢复原样
 *
 * 设计依据：R-2 审查结论
 */

import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/extension-fixture.js";
import type { SeedSettings } from "../fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
} from "../fixtures/extension-harness.js";

/** 历史索引在 chrome.storage.local 中的键名 */
const HISTORY_INDEX_KEY = "bili-agent-history-index";

/** 历史记录条目结构 */
interface SeedHistoryRecord {
	id: string;
	title: unknown;
	titleFinal: boolean;
	createdAt: number;
	lastActiveAt: number;
	messageCount: number;
}

/** 最小种子设置 */
function minimalSeedSettings(): SeedSettings {
	return { providers: [], activeProviderId: null, themeMode: "auto" };
}

/** 在扩展 SW 上下文中播种历史索引 */
async function seedHistoryIndex(
	context: BrowserContext,
	records: SeedHistoryRecord[],
): Promise<void> {
	const workers = context.serviceWorkers();
	const worker =
		workers.find((w) => w.url().startsWith("chrome-extension://")) ??
		(await context.waitForEvent("serviceworker"));

	await worker.evaluate(
		({ key, data }: { key: string; data: SeedHistoryRecord[] }) =>
			chrome.storage.local.set({ [key]: data }),
		{ key: HISTORY_INDEX_KEY, data: records },
	);
}

test.describe("R-2: 历史重命名", () => {
	test("点击重命名按钮后回车确认标题更新", async ({ page }) => {
		const now = Date.now();
		const seedRecords: SeedHistoryRecord[] = [
			{
				id: "seed-rename-1",
				title: "原始标题",
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 2,
			},
		];

		await openBilibiliWithMockedExtension(page, { settings: minimalSeedSettings() });
		await seedHistoryIndex(page.context(), seedRecords);

		const panel = await openPanel(page);
		await panel.locator('[aria-label="展开历史记录"]').click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(1, { timeout: 5000 });

		// 点击重命名按钮（pencil 图标，aria-label="重命名对话"）
		await historyItems.nth(0).locator('[aria-label="重命名对话"]').click();

		// 等待编辑输入框出现
		const renameInput = historyItems.nth(0).locator(".bili-agent-history-item__rename-input");
		await expect(renameInput).toBeVisible({ timeout: 5000 });

		// 清空原有标题并输入新标题
		await renameInput.clear();
		await renameInput.fill("新标题");

		// 回车确认
		await renameInput.press("Enter");

		// 验证标题已更新
		await expect(historyItems.nth(0)).toContainText("新标题");
		await expect(historyItems.nth(0)).not.toContainText("原始标题");
	});

	test("重命名取消后标题恢复原样", async ({ page }) => {
		const now = Date.now();
		const seedRecords: SeedHistoryRecord[] = [
			{
				id: "seed-rename-2",
				title: "原始标题",
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 2,
			},
		];

		await openBilibiliWithMockedExtension(page, { settings: minimalSeedSettings() });
		await seedHistoryIndex(page.context(), seedRecords);

		const panel = await openPanel(page);
		await panel.locator('[aria-label="展开历史记录"]').click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(1, { timeout: 5000 });

		// 点击重命名按钮
		await historyItems.nth(0).locator('[aria-label="重命名对话"]').click();

		const renameInput = historyItems.nth(0).locator(".bili-agent-history-item__rename-input");
		await expect(renameInput).toBeVisible({ timeout: 5000 });

		// 修改标题
		await renameInput.clear();
		await renameInput.fill("将取消的标题");

		// 按 Escape 取消
		await renameInput.press("Escape");

		// 验证标题恢复原样
		await expect(historyItems.nth(0)).toContainText("原始标题");
		await expect(historyItems.nth(0)).not.toContainText("将取消的标题");
	});
});