import type React from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BiliAgentSettings } from "../../src/config/settings.js";

/**
 * Panel heading 历史下拉交互回归测试。
 *
 * 覆盖场景（与任务要求逐条对齐）：
 * 1. 鼠标点击聊天视图 heading 展开/收起 HistoryDropdown
 * 2. 键盘 Enter/Space 切换、Escape 关闭已展开的下拉
 * 3. 切到设置再返回聊天后历史下拉不会自动以 isOpen=true 重现
 * 4. 设置视图 heading 不具有 button 语义和 tab 停止点
 * 5. heading 上 data-no-drag 属性存在（拖拽/点击冲突回归保护）
 *
 * Mock 策略与 Panel-settings.test.tsx 对齐：
 * - mock chrome API（test/setup.ts 全局注入，含 runtime.connect 默认实现）
 * - mock chat-context（避免真实 ChatProvider 的 Port 心跳/历史加载副作用）
 * - mock history/store + history/sync（避免 chrome.storage.onChanged 副作用）
 * - mock SettingsPanel（用 stub 隔离设置面板内部逻辑）
 * - mock HistoryDropdown（用 stub 捕获 isOpen prop，精确断言展开/收起状态）
 */

// ---- Mock HistoryDropdown ----
// 用 stub 捕获 isOpen prop，避免真实 HistoryDropdown 的 getIndex/HistorySync 副作用，
// 同时让断言聚焦于 Panel 传递的 isOpen 状态而非下拉内部行为。
const historyDropdownMock = vi.fn();
vi.mock("../../src/components/HistoryDropdown.js", () => ({
	HistoryDropdown: (props: unknown) => {
		historyDropdownMock(props);
		return <div data-testid="history-dropdown-stub" />;
	},
}));

// ---- Mock settings.js ----
// vi.mock() 会被 hoist 到文件顶部，工厂内部不能直接引用外部变量；
// 用 (...args) => mockReadSettings(...args) 延迟引用，调用时变量已初始化。
const mockReadSettings = vi.fn();
vi.mock("../../src/config/settings.js", () => ({
	readBiliAgentSettings: (...args: unknown[]) => mockReadSettings(...args),
	saveBiliAgentSettings: vi.fn(async (s: BiliAgentSettings) => s),
	SETTINGS_STORAGE_KEY: "bili-agent-settings",
}));

// ---- Mock chat-context ----
// Panel 在非设置视图渲染 ChatProvider + PanelChatBody，真实 ChatProvider 会
// 触发 Port 心跳/历史加载等副作用。此处用 stub 替换，避免污染 heading 断言。
vi.mock("../../src/content/chat-context.js", () => ({
	ChatProvider: ({ children }: { children: React.ReactNode }) => children,
	useChat: () => ({
		state: { messages: [], videos: [], isLoading: false, error: null, streamingContent: "", conversationId: "test" },
		dispatch: vi.fn(),
		send: vi.fn(),
		stop: vi.fn(),
		sendMessage: vi.fn(),
		stopGeneration: vi.fn(),
		clearChat: vi.fn(),
		connection: null,
	}),
	useAgentInsights: () => ({
		understandings: [],
		expansions: [],
		reranks: [],
		clarification: null,
	}),
}));

// ---- Mock history/store + history/sync ----
// HistoryDropdown（虽已 mock）在 import 阶段仍可能触发 store/sync 引用，
// 替换为 noop 以避免在 jsdom 下触发 chrome.storage.onChanged 副作用。
vi.mock("../../src/lib/history/store.js", () => ({
	getHistoryIndex: vi.fn(async () => []),
	deleteConversation: vi.fn(async () => {}),
	updateTitle: vi.fn(async () => {}),
	clearAllHistory: vi.fn(async () => {}),
}));
// HistorySync 用 `new HistorySync()` 构造实例后调 .start/.stop，
// 因此 mock 必须是构造函数而非对象字面量。
vi.mock("../../src/lib/history/sync.js", () => ({
	HistorySync: class {
		start = vi.fn();
		stop = vi.fn();
	},
}));

// ---- Mock SettingsPanel ----
// 本测试聚焦 Panel heading 交互，不验证 SettingsPanel 内部行为，用 stub 隔离。
vi.mock("../../src/components/model-settings/SettingsPanel.js", () => ({
	SettingsPanel: () => <div data-testid="settings-panel-stub" />,
}));

import { Panel } from "../../src/components/Panel.js";

/** 默认初始 settings 快照（满足 SettingsPanel 接口要求的最小结构）。 */
function makeSettings(): BiliAgentSettings {
	return {
		providers: [],
		activeProviderId: null,
		themeMode: "auto",
	};
}

/** 取 HistoryDropdown mock 最近一次收到的 props，用于断言 isOpen 状态。 */
function getLastHistoryProps(): { isOpen: boolean } | undefined {
	const calls = historyDropdownMock.mock.calls;
	return calls[calls.length - 1]?.[0] as { isOpen: boolean } | undefined;
}

describe("Panel - heading 历史下拉交互回归", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// 默认 readBiliAgentSettings resolve 最小合法 settings
		mockReadSettings.mockResolvedValue(makeSettings());
	});

	afterEach(() => {
		cleanup();
	});

	// ---------------------------------------------------------------
	// 1. 鼠标展开/收起
	// ---------------------------------------------------------------
	describe("鼠标展开/收起", () => {
		/**
		 * 点击聊天视图 heading（role=button, aria-label=展开历史记录）后，
		 * toggleHistory 将 isHistoryOpen 设为 true，HistoryDropdown 收到 isOpen=true。
		 */
		it("点击聊天视图 heading 后 HistoryDropdown 收到 isOpen=true", () => {
			render(<Panel isOpen={true} />);

			// 初始状态：HistoryDropdown 收到 isOpen=false
			expect(getLastHistoryProps()?.isOpen).toBe(false);

			// 点击 heading
			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.click(heading);

			// HistoryDropdown 收到 isOpen=true
			expect(getLastHistoryProps()?.isOpen).toBe(true);
		});

		/**
		 * 再次点击 heading 切换 toggleHistory，isHistoryOpen 设回 false，
		 * HistoryDropdown 收到 isOpen=false。
		 */
		it("再次点击 heading 可收起（isOpen 切回 false）", () => {
			render(<Panel isOpen={true} />);

			// 第一次点击展开
			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.click(heading);
			expect(getLastHistoryProps()?.isOpen).toBe(true);

			// 展开后 aria-label 变为"收起历史记录"，需重新定位 heading
			const headingOpen = screen.getByRole("button", { name: "收起历史记录" });
			fireEvent.click(headingOpen);

			// HistoryDropdown 收到 isOpen=false
			expect(getLastHistoryProps()?.isOpen).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// 2. 键盘交互
	// ---------------------------------------------------------------
	describe("键盘交互", () => {
		/**
		 * heading 的 onKeyDown 处理 Enter：e.preventDefault() + toggleHistory()。
		 */
		it("Enter 键切换历史下拉展开", () => {
			render(<Panel isOpen={true} />);

			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.keyDown(heading, { key: "Enter" });

			expect(getLastHistoryProps()?.isOpen).toBe(true);
		});

		/**
		 * heading 的 onKeyDown 处理 Space（e.key === " "）：同 Enter 逻辑。
		 */
		it("Space 键切换历史下拉", () => {
			render(<Panel isOpen={true} />);

			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.keyDown(heading, { key: " " });

			expect(getLastHistoryProps()?.isOpen).toBe(true);
		});

		/**
		 * 展开后按 Escape：isHistoryOpen 已为 true 时，Escape 关闭下拉。
		 */
		it("Escape 键关闭已展开的历史下拉", () => {
			render(<Panel isOpen={true} />);

			// 先展开
			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.click(heading);
			expect(getLastHistoryProps()?.isOpen).toBe(true);

			// Escape 关闭（展开后 aria-label 变为"收起历史记录"）
			const headingOpen = screen.getByRole("button", { name: "收起历史记录" });
			fireEvent.keyDown(headingOpen, { key: "Escape" });

			expect(getLastHistoryProps()?.isOpen).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// 3. 设置切换状态重置
	// ---------------------------------------------------------------
	describe("设置切换状态重置", () => {
		/**
		 * Panel.tsx 第 343-347 行：切到设置视图时 useEffect 收起历史下拉。
		 * 切回聊天后 isHistoryOpen 保持 false，HistoryDropdown 不会自动重现 isOpen=true。
		 */
		it("展开历史后切到设置再返回聊天，HistoryDropdown 不会自动 isOpen=true 重现", async () => {
			render(<Panel isOpen={true} />);

			// 展开历史
			const heading = screen.getByRole("button", { name: "展开历史记录" });
			fireEvent.click(heading);
			expect(getLastHistoryProps()?.isOpen).toBe(true);

			// 切到设置视图
			fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Back to chat" })).toBeInTheDocument();
			});

			// 设置视图不渲染 HistoryDropdown（!isSettingsOpen 为 false）
			expect(screen.queryByTestId("history-dropdown-stub")).not.toBeInTheDocument();

			// 切回聊天视图
			fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
			await waitFor(() => {
				expect(screen.getByTestId("history-dropdown-stub")).toBeInTheDocument();
			});

			// HistoryDropdown 重新渲染，但 isOpen 应为 false（被设置切换时 useEffect 重置）
			expect(getLastHistoryProps()?.isOpen).toBe(false);
		});
	});

	// ---------------------------------------------------------------
	// 4. 设置视图 heading 可访问性
	// ---------------------------------------------------------------
	describe("设置视图 heading 可访问性", () => {
		/**
		 * Panel.tsx 第 469 行：role={isSettingsOpen ? undefined : "button"}。
		 * 设置视图 heading 不渲染 role=button，不应被 getByRole("button") 查到。
		 */
		it("设置视图 heading 不具有 button 语义", async () => {
			render(<Panel isOpen={true} />);

			// 切到设置视图
			fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Back to chat" })).toBeInTheDocument();
			});

			// heading 不应是 button role
			expect(screen.queryByRole("button", { name: "展开历史记录" })).not.toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "收起历史记录" })).not.toBeInTheDocument();
		});

		/**
		 * Panel.tsx 第 470 行：tabIndex={isSettingsOpen ? -1 : 0}。
		 * 设置视图 heading tabIndex=-1，不可被键盘 Tab 聚焦。
		 */
		it("设置视图 heading 无 tab 停止点（tabIndex=-1）且无 role 属性", async () => {
			const { container } = render(<Panel isOpen={true} />);

			// 切到设置视图
			fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Back to chat" })).toBeInTheDocument();
			});

			// 通过类名定位 heading 元素（设置视图无 button role，无法用 getByRole 定位）
			const heading = container.querySelector(".bili-agent-panel__heading");
			expect(heading).not.toBeNull();
			// 设置视图 heading tabIndex=-1（不可 tab 聚焦）
			expect(heading?.getAttribute("tabindex")).toBe("-1");
			// 设置视图 heading 无 role 属性
			expect(heading?.getAttribute("role")).toBeNull();
		});
	});

	// ---------------------------------------------------------------
	// 5. data-no-drag 回归保护
	// ---------------------------------------------------------------
	describe("data-no-drag 回归保护", () => {
		/**
		 * Panel.tsx 第 471 行：heading 上始终有 data-no-drag 属性。
		 * handleHeaderPointerDown 第 249 行检查 target.closest("[data-no-drag]")，
		 * 若命中则跳过拖拽，保证 heading 点击不被拖拽逻辑拦截。
		 */
		it("聊天视图 heading 具有 data-no-drag 属性", () => {
			render(<Panel isOpen={true} />);

			const heading = screen.getByRole("button", { name: "展开历史记录" });
			expect(heading.hasAttribute("data-no-drag")).toBe(true);
		});

		it("设置视图 heading 仍具有 data-no-drag 属性", async () => {
			const { container } = render(<Panel isOpen={true} />);

			fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Back to chat" })).toBeInTheDocument();
			});

			const heading = container.querySelector(".bili-agent-panel__heading");
			expect(heading?.hasAttribute("data-no-drag")).toBe(true);
		});
	});
});
