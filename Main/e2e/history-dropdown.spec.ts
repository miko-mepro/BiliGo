/**
 * History Dropdown E2E - 历史下拉功能端到端测试
 *
 * 移植自旧仓库 Backend/BiliAgent/packages/extension/e2e/history-dropdown.spec.ts
 * 旧仓库无此文件，按设计依据 4.5 SC-4 ② + 旧仓库参照全新编写。
 *
 * 验证四类核心交互：
 * 1. 点击 heading 区域展开历史下拉容器
 * 2. 历史列表渲染播种的历史记录项
 * 3. 点击删除按钮删除单条历史，该项从列表消失
 * 4. 点击清空按钮清空所有历史，列表变空
 *
 * 关键架构说明：
 * - 历史索引存储在 chrome.storage.local，键名 'bili-agent-history-index'，
 *   对应 Main/src/lib/history/store.ts 的 INDEX_KEY 常量。
 * - 任务说明中提到的 'bili-agent-conversations'（复数）在本仓库不存在；
 *   正确的索引键名是 'bili-agent-history-index'，当前活动会话缓存键是
 *   'bili-agent-conversation'（单数，仅缓存当前会话，非历史索引）。
 * - 历史索引通过 service worker 上下文播种（参考 seedSettingsToStorage 模式），
 *   因为 main world 无 chrome 全局对象。
 * - 历史下拉渲染在 Shadow DOM 内，Playwright 默认穿透 open Shadow DOM，
 *   直接用类名选择器即可。
 *
 * 设计依据：4.5 SC-4 ② + 旧仓库参照 + Main/src/components/HistoryDropdown.tsx 选择器
 */

import type { BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./fixtures/extension-fixture.js";
import type { SeedSettings } from "./fixtures/chrome-mock.js";
import {
	openBilibiliWithMockedExtension,
	openPanel,
} from "./fixtures/extension-harness.js";

/**
 * 历史索引在 chrome.storage.local 中的键名。
 * 必须与 Main/src/lib/history/store.ts 的 INDEX_KEY 常量逐字一致。
 */
const HISTORY_INDEX_KEY = "bili-agent-history-index";

/**
 * 历史索引条目结构（与 Main/src/lib/shared-types/index.ts ConversationRecord 对齐）。
 * 仅声明测试用到的字段，便于在 SW 上下文构造种子数据。
 */
interface SeedHistoryRecord {
	id: string;
	title: unknown;
	titleFinal: boolean;
	createdAt: number;
	lastActiveAt: number;
	messageCount: number;
}

/**
 * 播种一个带已配置 provider 的最小 settings。
 * 历史下拉功能不依赖 provider，但 seed 一份可避免打开面板后渲染设置提示等噪声。
 */
function minimalSeedSettings(): SeedSettings {
	return {
		providers: [],
		activeProviderId: null,
		themeMode: "auto",
	};
}

/**
 * 在扩展 service worker 上下文中将历史索引数组写入 chrome.storage.local。
 *
 * 复用 seedSettingsToStorage 的 SW 选择模式（context.serviceWorkers() 过滤 chrome-extension://），
 * 但写入任意键而非固定 settings 键，以便播种历史索引。
 *
 * @param context Playwright BrowserContext（需已加载扩展）
 * @param records 历史索引条目列表
 */
async function seedHistoryIndex(
	context: BrowserContext,
	records: SeedHistoryRecord[],
): Promise<void> {
	// 优先选择扩展 SW（URL 以 chrome-extension:// 开头），避免误选页面注册的 web SW
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

/**
 * 在扩展 service worker 上下文中读取历史索引。
 * 用于断言删除/清空后存储层的实际状态。
 *
 * @param context Playwright BrowserContext
 * @returns 当前历史索引数组（解析失败返回 null）
 */
async function readHistoryIndex(
	context: BrowserContext,
): Promise<SeedHistoryRecord[] | null> {
	const workers = context.serviceWorkers();
	const worker =
		workers.find((w) => w.url().startsWith("chrome-extension://")) ??
		(await context.waitForEvent("serviceworker"));

	return worker.evaluate(async (key: string) => {
		const result = await chrome.storage.local.get(key);
		const value = result[key];
		return Array.isArray(value) ? (value as SeedHistoryRecord[]) : null;
	}, HISTORY_INDEX_KEY);
}

test.describe("BiliGo history dropdown", () => {
	test("opens dropdown by clicking heading area", async ({ page }) => {
		// 打开扩展面板（不播种 settings，使用默认）
		await openBilibiliWithMockedExtension(page);
		const panel = await openPanel(page);

		// heading 区域带 aria-label="展开历史记录"（收起态），
		// 点击后切换为 aria-label="收起历史记录"（展开态）
		// 参照 Panel.tsx 第 478-484 行的 aria-label 逻辑
		const headingToggle = panel.locator('[aria-label="展开历史记录"]');
		await expect(headingToggle).toBeVisible();

		// 点击 heading 展开历史下拉
		await headingToggle.click();

		// aria-label 应切换为"收起历史记录"（展开态）
		await expect(panel.locator('[aria-label="收起历史记录"]')).toBeVisible();

		// 历史下拉容器应可见（HistoryDropdown.tsx 第 222 行：className="bili-agent-history-dropdown"）
		const dropdown = panel.locator(".bili-agent-history-dropdown");
		await expect(dropdown).toBeVisible();

		// 无历史时应显示空状态提示
		await expect(dropdown.locator(".bili-agent-history-empty")).toContainText(
			"暂无历史记录",
		);
	});

	test("lists seeded history records", async ({ page }) => {
		// 播种两份历史索引到 storage.local（在打开扩展前播种，
		// 这样首次展开历史下拉时 getIndex() 能直接读到）
		const now = Date.now();
		const seedRecords: SeedHistoryRecord[] = [
			{
				id: "seed-conv-1",
				title: "测试对话一",
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 2,
			},
			{
				id: "seed-conv-2",
				title: "测试对话二",
				titleFinal: true,
				createdAt: now - 120_000,
				lastActiveAt: now - 90_000,
				messageCount: 4,
			},
		];

		await openBilibiliWithMockedExtension(page, {
			settings: minimalSeedSettings(),
		});

		// 在打开面板前播种历史索引，避免与 getIndex 首次读取竞态
		await seedHistoryIndex(page.context(), seedRecords);

		const panel = await openPanel(page);

		// 点击 heading 展开历史下拉
		const headingToggle = panel.locator('[aria-label="展开历史记录"]');
		await expect(headingToggle).toBeVisible();
		await headingToggle.click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		await expect(dropdown).toBeVisible();

		// 历史项容器（HistoryDropdown.tsx 第 242 行：className="bili-agent-history-item"）
		// 应渲染两条播种记录
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(2, { timeout: 5000 });

		// 验证标题文本按 lastActiveAt 降序展示（store.ts 第 97 行排序逻辑）
		// seed-conv-1 的 lastActiveAt 更晚（now-30_000），应排在第一位
		await expect(historyItems.nth(0)).toContainText("测试对话一");
		await expect(historyItems.nth(1)).toContainText("测试对话二");
	});

	test("does not render an error boundary for a non-string history title", async ({
		page,
	}) => {
		const now = Date.now();
		await openBilibiliWithMockedExtension(page, {
			settings: minimalSeedSettings(),
		});

		// 写入真实 storage 的异常标题，覆盖 R-1 的遗留数据入口。
		await seedHistoryIndex(page.context(), [
			{
				id: "seed-conv-dirty-title",
				title: {},
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 1,
			},
		]);

		const panel = await openPanel(page);
		await panel.locator('[aria-label="展开历史记录"]').click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(1, { timeout: 5000 });

		// 输入搜索词，覆盖原先 r.title.toLowerCase() 的崩溃分支。
		await dropdown.getByRole("textbox", { name: "搜索历史记录" }).fill("脏数据");
		await expect(dropdown.locator(".bili-agent-history-empty")).toContainText(
			"暂无历史记录",
		);
		await expect(page.getByText("BiliAgent 渲染异常")).toHaveCount(0);
	});

	test("deletes a single record when delete button clicked", async ({
		page,
	}) => {
		// 播种两条历史，删除第一条后验证列表仅剩一条
		const now = Date.now();
		const seedRecords: SeedHistoryRecord[] = [
			{
				id: "seed-conv-del-1",
				title: "待删除对话",
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 2,
			},
			{
				id: "seed-conv-del-2",
				title: "保留对话",
				titleFinal: true,
				createdAt: now - 120_000,
				lastActiveAt: now - 90_000,
				messageCount: 3,
			},
		];

		await openBilibiliWithMockedExtension(page, {
			settings: minimalSeedSettings(),
		});
		await seedHistoryIndex(page.context(), seedRecords);

		const panel = await openPanel(page);
		await panel.locator('[aria-label="展开历史记录"]').click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(2, { timeout: 5000 });

		// 第一条历史项的删除按钮（HistoryDropdown.tsx 第 313-319 行）：
		// aria-label="删除此对话"
		const firstDeleteButton = historyItems
			.nth(0)
			.locator('[aria-label="删除此对话"]');
		await expect(firstDeleteButton).toBeVisible();
		await firstDeleteButton.click();

		// 删除后列表应只剩一条
		await expect(historyItems).toHaveCount(1, { timeout: 5000 });

		// 剩余项应为"保留对话"
		await expect(historyItems.nth(0)).toContainText("保留对话");

		// 存储层应只剩 seed-conv-del-2（store.ts deleteConversation 从索引移除并删除数据 key）
		const stored = await readHistoryIndex(page.context());
		expect(stored).not.toBeNull();
		if (stored) {
			expect(stored.length).toBe(1);
			expect(stored[0].id).toBe("seed-conv-del-2");
		}
	});

	test("clears all records when clear-all button clicked", async ({ page }) => {
		// 播种两条历史，点击"清空全部历史"按钮后列表应为空
		const now = Date.now();
		const seedRecords: SeedHistoryRecord[] = [
			{
				id: "seed-conv-clear-1",
				title: "待清空对话一",
				titleFinal: true,
				createdAt: now - 60_000,
				lastActiveAt: now - 30_000,
				messageCount: 2,
			},
			{
				id: "seed-conv-clear-2",
				title: "待清空对话二",
				titleFinal: true,
				createdAt: now - 120_000,
				lastActiveAt: now - 90_000,
				messageCount: 3,
			},
		];

		await openBilibiliWithMockedExtension(page, {
			settings: minimalSeedSettings(),
		});
		await seedHistoryIndex(page.context(), seedRecords);

		const panel = await openPanel(page);
		await panel.locator('[aria-label="展开历史记录"]').click();

		const dropdown = panel.locator(".bili-agent-history-dropdown");
		const historyItems = dropdown.locator(".bili-agent-history-item");
		await expect(historyItems).toHaveCount(2, { timeout: 5000 });

		// 清空全部按钮（HistoryDropdown.tsx 第 343-349 行）：
		// className="bili-agent-history-clear-all"，文案"清空全部历史"
		// 仅当 records.length > 0 时渲染
		const clearAllButton = dropdown.locator(".bili-agent-history-clear-all");
		await expect(clearAllButton).toBeVisible();
		await expect(clearAllButton).toContainText("清空全部历史");
		await clearAllButton.click();

		// 历史项应全部消失
		await expect(historyItems).toHaveCount(0, { timeout: 5000 });

		// 应显示空状态提示
		await expect(dropdown.locator(".bili-agent-history-empty")).toContainText(
			"暂无历史记录",
		);

		// 清空全部按钮在 records.length===0 时不再渲染
		await expect(clearAllButton).toHaveCount(0);

		// 存储层索引 key 应被移除（store.ts clearAllHistory 删除 INDEX_KEY + 所有数据 key）
		const stored = await readHistoryIndex(page.context());
		// chrome.storage.local.get 对不存在的 key 返回 {}，value 为 undefined
		// readHistoryIndex 对非数组返回 null
		expect(stored).toBeNull();
	});
});
