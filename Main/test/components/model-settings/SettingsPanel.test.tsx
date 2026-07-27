import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BiliAgentSettings } from "../../../src/config/settings.js";

/**
 * mock saveBiliAgentSettings：在文件顶部 hoist，确保被测模块 import 时拿到 mock 版本。
 *
 * 默认实现：resolve 入参 next 并返回（模拟规范化后的回写）。
 * 单个用例可通过 mockSave.mockResolvedValueOnce / mockRejectedValueOnce 覆盖。
 */
const mockSave = vi.fn(async (next: BiliAgentSettings) => next);

vi.mock("../../../src/config/settings.js", () => ({
	saveBiliAgentSettings: (next: BiliAgentSettings) => mockSave(next),
	// 提供给被测组件 import 的类型/常量不需要运行时实现，但需导出以保持形状一致
	SETTINGS_STORAGE_KEY: "bili-agent-settings",
}));

import { SettingsPanel } from "../../../src/components/model-settings/SettingsPanel.tsx";
import type { ProviderConfig } from "../../../src/lib/shared-types/provider.js";

/**
 * SettingsPanel 组件测试
 *
 * 覆盖点（与任务要求对齐）：
 * 1. Tab 切换：默认显示通用 Tab，点击切到模型 Tab 显示 ProviderList
 * 2. 通用 Tab：主题下拉改变更新内部 state，保存时写入 settings.themeMode
 * 3. 模型 Tab：选中 provider 显示 ProviderForm + TestConnectionButton
 * 4. port 下传验证：TestConnectionButton 收到的 port === SettingsPanel props.port（SA-12）
 * 5. 保存流程：点击保存 -> saving 态 -> 调 saveBiliAgentSettings -> onSaved -> saved 态
 * 6. 保存失败：mock saveBiliAgentSettings reject -> error 态 + 错误信息
 * 7. 添加自定义 provider：点 "+" -> providers 增加 -> 新项被选中
 * 8. 删除自定义 provider：ProviderList onDelete -> providers 减少
 */

/** 内置 provider mock（OpenAI 官方） */
const builtInOpenai: ProviderConfig = {
	id: "openai",
	name: "OpenAI 官方",
	format: "openai",
	baseUrl: "https://api.openai.com/v1",
	apiKey: "sk-test-key",
	model: "gpt-4",
	isBuiltIn: true,
	isCustom: false,
};

/** 自定义 provider mock */
const customProvider: ProviderConfig = {
	id: "custom-1",
	name: "我的自定义",
	format: "openai",
	baseUrl: "https://api.example.com/v1",
	apiKey: "sk-custom-key",
	model: "gpt-4",
	isBuiltIn: false,
	isCustom: true,
};

/** 默认初始 settings 快照 */
function makeInitialSettings(
	overrides: Partial<BiliAgentSettings> = {},
): BiliAgentSettings {
	return {
		providers: [builtInOpenai, customProvider],
		activeProviderId: "openai",
		themeMode: "auto",
		...overrides,
	};
}

/**
 * 创建 mock Port（参考 TestConnectionButton.test.tsx 的模式）。
 *
 * 捕获 onMessage listener 以便测试手动触发 SW 回复；同时暴露 postMessageSpy
 * 引用，让 port 下传验证（SA-12）能直接断言 mock 调用，无需类型断言。
 *
 * @returns port 对象 + triggerMessage 手动触发函数 + postMessageSpy 引用
 */
function createMockPort() {
	let messageListener: ((msg: unknown) => void) | null = null;

	const postMessageSpy = vi.fn();
	const port = {
		postMessage: postMessageSpy,
		onMessage: {
			addListener: vi.fn((listener: (msg: unknown) => void) => {
				messageListener = listener;
			}),
			removeListener: vi.fn(),
		},
		onDisconnect: {
			addListener: vi.fn(),
			removeListener: vi.fn(),
		},
		disconnect: vi.fn(),
	};

	const triggerMessage = (msg: unknown) => {
		if (messageListener !== null) {
			messageListener(msg);
		}
	};

	return {
		port: port as unknown as chrome.runtime.Port,
		triggerMessage,
		postMessageSpy,
	};
}

describe("SettingsPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// 默认 mockSave 行为：resolve 入参并返回
		mockSave.mockImplementation(async (next: BiliAgentSettings) => next);
	});

	afterEach(() => {
		cleanup();
	});

	describe("Tab 切换", () => {
		it("1) 默认显示通用 Tab，含主题模式下拉", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings()}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 通用 Tab 应被激活
			const generalTab = screen.getByTestId("tab-general");
			expect(generalTab).toHaveAttribute("aria-selected", "true");
			// 通用 Tab 内容应渲染（主题模式下拉）
			expect(screen.getByTestId("general-tab-content")).toBeInTheDocument();
			expect(screen.getByTestId("theme-mode-select")).toBeInTheDocument();
			// 模型 Tab 内容不应渲染
			expect(screen.queryByTestId("model-tab-content")).not.toBeInTheDocument();
		});

		it("1) 点击模型 Tab 切换显示 ProviderList", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings()}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 模型 Tab 应被激活
			expect(screen.getByTestId("tab-model")).toHaveAttribute(
				"aria-selected",
				"true",
			);
			// 模型 Tab 内容应渲染（ProviderList）
			expect(screen.getByTestId("model-tab-content")).toBeInTheDocument();
			expect(screen.getByTestId("provider-list")).toBeInTheDocument();
			// 通用 Tab 内容应收起
			expect(
				screen.queryByTestId("general-tab-content"),
			).not.toBeInTheDocument();
		});
	});

	describe("通用 Tab - 主题模式", () => {
		it("2) 主题下拉改变更新内部 state，保存时写入 settings.themeMode", async () => {
			const onSaved = vi.fn();
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({ themeMode: "auto" })}
					onClose={vi.fn()}
					onSaved={onSaved}
					port={port}
				/>,
			);

			// 改变主题模式为 dark
			fireEvent.change(screen.getByTestId("theme-mode-select"), {
				target: { value: "dark" },
			});

			// 点击保存
			fireEvent.click(screen.getByTestId("save-button"));

			// 等待保存完成（mock saveBiliAgentSettings resolve）
			await waitFor(() => {
				expect(onSaved).toHaveBeenCalledTimes(1);
			});

			// 验证 onSaved 收到的 settings.themeMode 为 dark（证明内部 state 已更新并写入）
			const savedSettings = onSaved.mock.calls[0][0] as BiliAgentSettings;
			expect(savedSettings.themeMode).toBe("dark");
		});

		it("2) 主题下拉初始值取自 props.settings.themeMode", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({ themeMode: "light" })}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 下拉初始值应为 light（取自 props）
			expect(screen.getByTestId("theme-mode-select")).toHaveValue("light");
		});
	});

	describe("模型 Tab - ProviderForm 与 TestConnectionButton", () => {
		it("3) 初始有激活 provider 时显示 ProviderForm + TestConnectionButton", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({ activeProviderId: "openai" })}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 有激活 provider 时应渲染 ProviderForm 与 TestConnectionButton
			expect(screen.getByTestId("provider-form")).toBeInTheDocument();
			expect(screen.getByTestId("test-connection-button")).toBeInTheDocument();
		});

		it("3) 无激活 provider 时不显示 ProviderForm 与 TestConnectionButton", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({ activeProviderId: null })}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 无激活 provider 时不应渲染 ProviderForm 与 TestConnectionButton
			expect(screen.queryByTestId("provider-form")).not.toBeInTheDocument();
			expect(
				screen.queryByTestId("test-connection-button"),
			).not.toBeInTheDocument();
		});

		it("4) TestConnectionButton 收到的 port === SettingsPanel props.port（SA-12 经单 Port 契约）", async () => {
			const { port, postMessageSpy } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({ activeProviderId: "openai" })}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 点击测试连接按钮触发 postMessage
			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 验证经单 Port 发送了消息（证明 TestConnectionButton 拿到的是 SettingsPanel 的 port）
			// postMessageSpy 被调用即证明 port 引用被下传且可用
			expect(postMessageSpy).toHaveBeenCalledTimes(1);
			expect(postMessageSpy).toHaveBeenCalledWith({
				type: "test_connection",
				provider: expect.objectContaining({ id: "openai" }),
			});
		});
	});

	describe("保存流程", () => {
		it("5) 点击保存 -> saving 态 -> 调 saveBiliAgentSettings -> onSaved -> saved 态", async () => {
			const onSaved = vi.fn();
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings()}
					onClose={vi.fn()}
					onSaved={onSaved}
					port={port}
				/>,
			);

			// 点击保存
			fireEvent.click(screen.getByTestId("save-button"));

			// saving 态：按钮禁用 + 文案变"⟳ 保存中..."
			// （验证 saveBiliAgentSettings 被调用，证明进入 saving 流程）
			const saveBtn = screen.getByTestId("save-button");
			// 验证 saveBiliAgentSettings 被调用
			expect(mockSave).toHaveBeenCalledTimes(1);

			// 等待异步保存完成，进入 saved 态
			await waitFor(() => {
				expect(onSaved).toHaveBeenCalledTimes(1);
			});

			// saved 态：按钮文案变"✓ 已保存"
			await waitFor(() => {
				expect(saveBtn).toHaveTextContent("✓ 已保存");
			});
			// 成功提示出现
			expect(screen.getByTestId("save-success-hint")).toHaveTextContent(
				"已保存",
			);
		});

		it("6) 保存失败 -> error 态 + 显示错误信息", async () => {
			// mock saveBiliAgentSettings reject
			mockSave.mockRejectedValueOnce(new Error("存储写入失败"));
			const onSaved = vi.fn();
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings()}
					onClose={vi.fn()}
					onSaved={onSaved}
					port={port}
				/>,
			);

			// 点击保存
			fireEvent.click(screen.getByTestId("save-button"));

			// 等待错误态出现
			await waitFor(() => {
				expect(screen.getByTestId("save-error-hint")).toBeInTheDocument();
			});

			// 错误提示应显示错误信息
			expect(screen.getByTestId("save-error-hint")).toHaveTextContent(
				"存储写入失败",
			);
			// 按钮文案变"✕ 错误"
			expect(screen.getByTestId("save-button")).toHaveTextContent("✕ 错误");
			// onSaved 不应被调用（保存失败）
			expect(onSaved).not.toHaveBeenCalled();
		});
	});

	describe("添加自定义 provider", () => {
		it("7) 点 '+' -> providers 增加 -> 新项被选中", () => {
			const { port } = createMockPort();
			const initial = makeInitialSettings({
				providers: [builtInOpenai],
				activeProviderId: null,
			});
			render(
				<SettingsPanel
					settings={initial}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 展开下拉验证初始只有 1 个内置 provider
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));
			expect(screen.getAllByTestId("provider-option")).toHaveLength(1);

			// 点击 + 添加自定义 provider（菜单仍保持展开，ProviderList 内部 isOpen 不受 onAddCustom 影响）
			fireEvent.click(screen.getByRole("button", { name: "添加自定义提供商" }));

			// 菜单仍展开，应增加 1 个自定义 provider（共 2 个）
			expect(screen.getAllByTestId("provider-option")).toHaveLength(2);

			// 新建项应被自动选中：触发按钮显示空名称（因新建 name 为空），
			// 且 ProviderForm 应渲染（有激活 provider 才渲染）
			expect(screen.getByTestId("provider-form")).toBeInTheDocument();
			expect(screen.getByTestId("test-connection-button")).toBeInTheDocument();
		});
	});

	describe("删除自定义 provider", () => {
		it("8) ProviderList onDelete -> providers 减少", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({
						providers: [builtInOpenai, customProvider],
						activeProviderId: "openai",
					})}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab
			fireEvent.click(screen.getByTestId("tab-model"));

			// 展开下拉，初始 2 个 provider
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));
			expect(screen.getAllByTestId("provider-option")).toHaveLength(2);

			// 点击自定义 provider 的删除按钮
			fireEvent.click(screen.getByRole("button", { name: "删除 我的自定义" }));

			// 再次展开下拉，应只剩 1 个 provider
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));
			expect(screen.getAllByTestId("provider-option")).toHaveLength(1);
			// 剩下的应是内置 OpenAI
			expect(screen.getAllByTestId("provider-option")[0]).toHaveTextContent(
				"OpenAI 官方",
			);
		});

		it("8) 删除当前激活的自定义 provider 后清空激活选择", () => {
			const { port } = createMockPort();
			render(
				<SettingsPanel
					settings={makeInitialSettings({
						providers: [builtInOpenai, customProvider],
						activeProviderId: "custom-1",
					})}
					onClose={vi.fn()}
					onSaved={vi.fn()}
					port={port}
				/>,
			);

			// 切到模型 Tab，初始有激活 provider -> 渲染 ProviderForm
			fireEvent.click(screen.getByTestId("tab-model"));
			expect(screen.getByTestId("provider-form")).toBeInTheDocument();

			// 展开下拉并删除当前激活的自定义 provider
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));
			fireEvent.click(screen.getByRole("button", { name: "删除 我的自定义" }));

			// 删除激活项后应清空激活选择：ProviderForm 不再渲染
			expect(screen.queryByTestId("provider-form")).not.toBeInTheDocument();
			expect(
				screen.queryByTestId("test-connection-button"),
			).not.toBeInTheDocument();
		});
	});
});
