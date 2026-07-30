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
 * Panel.tsx settingsPort 独立 Port 测试（真实 render 版本）。
 *
 * 设计依据 SA-12：设置分支与 ChatProvider 分支互斥渲染。
 * Panel 组件在 isSettingsOpen=true 时建立独立 Port（设置专用，不走聊天流），
 * 传入 SettingsPanel，再下传给 TestConnectionButton。
 *
 * 参照 test/components/model-settings/SettingsPanel.test.tsx 的成熟模式：
 * render + fireEvent + createMockPort + test/setup.ts 全局 chrome mock。
 *
 * 测试点（与任务要求对齐）：
 * 1. 打开设置面板(isSettingsOpen=true)时 chrome.runtime.connect 被调用，
 *    name 含 "bili-agent-chat"
 * 2. SettingsPanel 收到非 null port（Panel 已建立 Port 并下传）
 * 3. 关闭设置面板(isSettingsOpen=false)后 port.disconnect 被调用
 * 4. chrome.runtime.connect 抛异常时渲染"加载设置中..."且不崩溃
 */

// ---- Mock chrome API ----
// test/setup.ts 已注入 globalThis.chrome（含 runtime.connect 默认实现）。
// 此处用 vi.fn 覆盖 runtime.connect，以便在每个用例中精确断言调用次数和参数。
const mockConnect = vi.fn();

// ---- Mock settings.js ----
// vi.mock() 会被 hoist 到文件顶部，内部不能引用外部变量；
// 因此在工厂函数内部直接创建 vi.fn()，不引用外部的 mockReadSettings。
const mockReadSettings = vi.fn();
vi.mock("../../src/config/settings.js", () => ({
	readBiliAgentSettings: (...args: unknown[]) => mockReadSettings(...args),
	saveBiliAgentSettings: vi.fn(async (s: BiliAgentSettings) => s),
	SETTINGS_STORAGE_KEY: "bili-agent-settings",
}));

// ---- Mock chat-context ----
// Panel 在非设置视图渲染 ChatProvider + PanelChatBody，真实 ChatProvider 会
// 触发 port 心跳/历史加载等副作用。此处用 stub 替换，避免污染 connect 调用断言。
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
// Panel 渲染 HistoryDropdown 会触发 HistorySync.start 和 getHistoryIndex；
// 替换为 noop 以避免在 jsdom 下触发 chrome.storage.onChanged 副作用。
vi.mock("../../src/lib/history/store.js", () => ({
	getHistoryIndex: vi.fn(async () => []),
	deleteConversation: vi.fn(async () => {}),
	updateTitle: vi.fn(async () => {}),
	clearAllHistory: vi.fn(async () => {}),
}));
// HistoryDropdown 用 `new HistorySync()` 构造实例后调 .start/.stop，
// 因此 mock 必须是构造函数而非对象字面量。
vi.mock("../../src/lib/history/sync.js", () => ({
	HistorySync: class {
		start = vi.fn();
		stop = vi.fn();
	},
}));

// ---- Mock SettingsPanel ----
// SettingsPanel 内部依赖较重（ProviderForm / TestConnectionButton / saveBiliAgentSettings），
// 本测试聚焦 Panel 的 settingsPort 建立与下传逻辑，用 data-testid 占位组件验证 port 被下传。
const settingsPanelMock = vi.fn();
vi.mock("../../src/components/model-settings/SettingsPanel.js", () => ({
	SettingsPanel: (props: unknown) => {
		settingsPanelMock(props);
		return <div data-testid="settings-panel-stub" />;
	},
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

/** 默认 mock Port（捕获 disconnect 以便用例 3 断言）。 */
function createMockPort() {
	const disconnect = vi.fn();
	const port = {
		name: "bili-agent-chat",
		postMessage: vi.fn(),
		onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
		onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
		disconnect,
	} as unknown as chrome.runtime.Port;
	return { port, disconnect };
}

describe("Panel - settingsPort 独立 Port 逻辑（真实 render）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// 默认 readBiliAgentSettings resolve 最小合法 settings
		mockReadSettings.mockResolvedValue(makeSettings());
		// 默认 connect 返回 mock Port
		mockConnect.mockImplementation(() => createMockPort().port);
		// 覆盖 test/setup.ts 注入的 globalThis.chrome.runtime.connect
		(globalThis.chrome as any).runtime.connect = mockConnect;
	});

	afterEach(() => {
		cleanup();
	});

	/**
	 * 用例 1：打开设置面板时 chrome.runtime.connect 被调用，name 含 bili-agent-chat。
	 *
	 * 渲染 Panel（默认 chat 视图），点击"Open settings"按钮切到 settings 视图，
	 * useEffect 触发 chrome.runtime.connect({name:"bili-agent-chat"})。
	 */
	it("1) 打开设置面板(isSettingsOpen=true)时 chrome.runtime.connect 被调用，name 含 bili-agent-chat", async () => {
		render(<Panel isOpen={true} />);

		// 初始 chat 视图不应调用 connect（connect 仅在 settings 视图触发）
		expect(mockConnect).not.toHaveBeenCalled();

		// 点击"Open settings"按钮切到 settings 视图
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

		// 等待 useEffect 触发 connect
		await waitFor(() => {
			expect(mockConnect).toHaveBeenCalledTimes(1);
		});

		// 验证调用参数的 name 含 "bili-agent-chat"（Panel.tsx 第 435 行硬编码）
		const callArg = mockConnect.mock.calls[0][0];
		expect(callArg).toEqual({ name: "bili-agent-chat" });
	});

	/**
	 * 用例 2：SettingsPanel 收到非 null port。
	 *
	 * 打开设置后 Panel 的 settingsPort state 非 null，作为 port prop 下传给 SettingsPanel。
	 * 通过 SettingsPanel mock 断言收到的 port 非 null 且具备 Port 接口形状。
	 */
	it("2) SettingsPanel 收到非 null port（Panel 已建立 Port 并下传）", async () => {
		render(<Panel isOpen={true} />);

		// 切到 settings 视图
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

		// 等待 SettingsPanel 被渲染（settingsPort + settingsSnapshot 就绪后）
		await waitFor(() => {
			expect(screen.getByTestId("settings-panel-stub")).toBeInTheDocument();
		});

		// 取最近一次 SettingsPanel 调用的 props，验证 port 非 null
		expect(settingsPanelMock).toHaveBeenCalledTimes(1);
		const lastProps = settingsPanelMock.mock.calls[0][0] as {
			port: chrome.runtime.Port;
		};
		expect(lastProps.port).not.toBeNull();
		// 验证 port 具备 Port 接口形状（postMessage / onMessage / disconnect）
		expect(typeof lastProps.port.postMessage).toBe("function");
		expect(lastProps.port.onMessage).toBeDefined();
		expect(typeof lastProps.port.disconnect).toBe("function");
	});

	/**
	 * 用例 3：关闭设置面板后 port.disconnect 被调用。
	 *
	 * 打开设置建立 Port -> 关闭设置（切回 chat 视图）触发 useEffect cleanup，
	 * cleanup 调用 port.disconnect() 释放资源。
	 */
	it("3) 关闭设置面板(isSettingsOpen=false)后 port.disconnect 被调用", async () => {
		// 用例 3 需要精确捕获 connect 返回的 port 的 disconnect 引用，
		// 因此用专门的 mock 实现替换默认 mockConnect
		const { port, disconnect } = createMockPort();
		mockConnect.mockImplementation(() => port);

		render(<Panel isOpen={true} />);

		// 切到 settings 视图（建立 Port）
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
		await waitFor(() => {
			expect(mockConnect).toHaveBeenCalledTimes(1);
		});

		// 切回 chat 视图（关闭设置），触发 cleanup -> port.disconnect()
		fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));

		await waitFor(() => {
			expect(disconnect).toHaveBeenCalledTimes(1);
		});
	});

	/**
	 * 用例 4：chrome.runtime.connect 抛异常时渲染"加载设置中..."且不崩溃。
	 *
	 * Panel.tsx 第 434-440 行：connect 抛异常时 catch 保持 settingsPort=null，
	 * 渲染层 settingsSnapshot || settingsPort 为假值时显示"加载设置中..."占位。
	 */
	it("4) chrome.runtime.connect 抛异常时渲染'加载设置中...'且不崩溃", async () => {
		// connect 抛异常
		mockConnect.mockImplementation(() => {
			throw new Error("chrome.runtime.connect failed");
		});

		render(<Panel isOpen={true} />);

		// 切到 settings 视图
		fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

		// 等待 connect 被调用
		await waitFor(() => {
			expect(mockConnect).toHaveBeenCalledTimes(1);
		});

		// 验证渲染"加载设置中..."占位（Panel.tsx 第 647-653 行）
		// 而非崩溃；SettingsPanel mock 不应被渲染
		expect(screen.getByText("加载设置中...")).toBeInTheDocument();
		expect(screen.queryByTestId("settings-panel-stub")).not.toBeInTheDocument();
	});
});
