import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderList } from "../../../src/components/model-settings/ProviderList.tsx";
import type { ProviderConfig } from "../../../src/lib/shared-types/provider.js";

/**
 * ProviderList 组件测试
 *
 * 覆盖点：
 * a) 渲染触发按钮显示当前激活 provider 名称（或有"请选择提供商"占位）
 * b) 点击触发按钮展开下拉菜单，再次点击收起
 * c) 下拉菜单内置 provider 在上，自定义 provider 在下，中间有分隔线
 * d) 点击 provider 选项触发 onSelectActive 并收起下拉
 * e) 自定义 provider 有删除按钮（×），点击触发 onDelete 并收起
 * f) 内置 provider 没有删除按钮
 * g) 点击 + 按钮触发 onAddCustom
 * h) 点击下拉外部区域收起下拉（模拟 document mousedown）
 * i) 当前激活项有高亮样式（--active className）
 */

/** 内置 provider mock：OpenAI 官方 */
const builtInProviderOpenai: ProviderConfig = {
	id: "openai",
	name: "OpenAI 官方",
	format: "openai",
	baseUrl: "https://api.openai.com/v1",
	apiKey: "sk-test-key",
	model: "gpt-4",
	isBuiltIn: true,
	isCustom: false,
};

/** 内置 provider mock：Anthropic 官方 */
const builtInProviderAnthropic: ProviderConfig = {
	id: "anthropic",
	name: "Anthropic 官方",
	format: "anthropic",
	baseUrl: "https://api.anthropic.com/v1",
	apiKey: "sk-test-key-2",
	model: "claude-3",
	isBuiltIn: true,
	isCustom: false,
};

/** 自定义 provider mock 1 */
const customProvider1: ProviderConfig = {
	id: "custom-1",
	name: "我的自定义A",
	format: "openai",
	baseUrl: "https://api.example.com/v1",
	apiKey: "sk-custom-key",
	model: "gpt-4",
	isBuiltIn: false,
	isCustom: true,
};

/** 自定义 provider mock 2 */
const customProvider2: ProviderConfig = {
	id: "custom-2",
	name: "我的自定义B",
	format: "anthropic",
	baseUrl: "https://api.other.com/v1",
	apiKey: "sk-custom-key-2",
	model: "claude-3",
	isBuiltIn: false,
	isCustom: true,
};

describe("ProviderList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	describe("触发按钮渲染", () => {
		it("a) 有激活 provider 时，触发按钮显示该 provider 名称", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId="openai"
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 触发按钮应显示激活 provider 的名称
			const trigger = screen.getByTestId("provider-dropdown-trigger");
			expect(trigger).toHaveTextContent("OpenAI 官方");
		});

		it("a) 无激活 provider 时，触发按钮显示占位文案", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 无激活项时显示占位文案
			const trigger = screen.getByTestId("provider-dropdown-trigger");
			expect(trigger).toHaveTextContent("请选择提供商");
		});

		it('根元素含 data-testid="provider-list"', () => {
			render(
				<ProviderList
					providers={[]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			expect(screen.getByTestId("provider-list")).toBeInTheDocument();
		});
	});

	describe("下拉展开/收起", () => {
		it("b) 初始状态菜单不展开，点击触发按钮后展开，再次点击收起", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai, customProvider1]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			const trigger = screen.getByTestId("provider-dropdown-trigger");

			// 初始状态：aria-expanded 为 false，无菜单项
			expect(trigger).toHaveAttribute("aria-expanded", "false");
			expect(screen.queryAllByTestId("provider-option")).toHaveLength(0);

			// 第一次点击：展开
			fireEvent.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "true");
			expect(screen.getAllByTestId("provider-option")).toHaveLength(2);

			// 第二次点击：收起
			fireEvent.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "false");
			expect(screen.queryAllByTestId("provider-option")).toHaveLength(0);
		});
	});

	describe("下拉菜单分组与分隔线", () => {
		it("c) 内置 provider 在上，自定义 provider 在下，中间有分隔线", () => {
			render(
				<ProviderList
					providers={[
						customProvider1,
						builtInProviderOpenai,
						builtInProviderAnthropic,
						customProvider2,
					]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 应渲染 4 个选项 + 1 个分隔线
			const options = screen.getAllByTestId("provider-option");
			expect(options).toHaveLength(4);

			// 验证顺序：内置在前两个，自定义在后两个
			expect(options[0]).toHaveTextContent("OpenAI 官方");
			expect(options[1]).toHaveTextContent("Anthropic 官方");
			expect(options[2]).toHaveTextContent("我的自定义A");
			expect(options[3]).toHaveTextContent("我的自定义B");

			// 应存在一个分隔线（role=separator）
			const separator = screen.getByRole("separator");
			expect(separator).toBeInTheDocument();
		});

		it("c) 无自定义 provider 时不渲染分隔线", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 无自定义 provider 时不应有分隔线
			expect(screen.queryByRole("separator")).not.toBeInTheDocument();
		});
	});

	describe("选项选中", () => {
		it("d) 点击 provider 选项触发 onSelectActive 并收起下拉", () => {
			const onSelectActive = vi.fn();
			render(
				<ProviderList
					providers={[builtInProviderOpenai, customProvider1]}
					activeProviderId={null}
					onSelectActive={onSelectActive}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 点击第一个选项的名称按钮
			const nameButtons = screen.getAllByRole("button", {
				name: "选择 OpenAI 官方",
			});
			fireEvent.click(nameButtons[0]);

			// 应调用 onSelectActive 并传入对应 id
			expect(onSelectActive).toHaveBeenCalledTimes(1);
			expect(onSelectActive).toHaveBeenCalledWith("openai");

			// 下拉应收起
			expect(screen.getByTestId("provider-dropdown-trigger")).toHaveAttribute(
				"aria-expanded",
				"false",
			);
		});
	});

	describe("删除按钮", () => {
		it("e) 自定义 provider 有删除按钮（×），点击触发 onDelete 并收起下拉", () => {
			const onDelete = vi.fn();
			render(
				<ProviderList
					providers={[builtInProviderOpenai, customProvider1]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={onDelete}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 点击自定义 provider 的删除按钮
			const deleteBtn = screen.getByRole("button", {
				name: "删除 我的自定义A",
			});
			fireEvent.click(deleteBtn);

			// 应调用 onDelete 并传入对应 id
			expect(onDelete).toHaveBeenCalledTimes(1);
			expect(onDelete).toHaveBeenCalledWith("custom-1");

			// 下拉应收起
			expect(screen.getByTestId("provider-dropdown-trigger")).toHaveAttribute(
				"aria-expanded",
				"false",
			);
		});

		it("f) 内置 provider 没有删除按钮", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 内置 provider 不应有删除按钮
			expect(
				screen.queryByRole("button", { name: "删除 OpenAI 官方" }),
			).not.toBeInTheDocument();
		});
	});

	describe("添加按钮", () => {
		it("g) 点击 + 按钮触发 onAddCustom", () => {
			const onAddCustom = vi.fn();
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={onAddCustom}
				/>,
			);

			// 点击 + 按钮
			const addBtn = screen.getByRole("button", {
				name: "添加自定义提供商",
			});
			fireEvent.click(addBtn);

			// 应调用 onAddCustom
			expect(onAddCustom).toHaveBeenCalledTimes(1);
		});
	});

	describe("点击外部收起", () => {
		it("h) 点击下拉外部区域收起下拉（模拟 document mousedown）", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			const trigger = screen.getByTestId("provider-dropdown-trigger");

			// 先展开下拉
			fireEvent.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "true");

			// 在 document.body 上模拟点击外部（composedPath 不含容器）
			fireEvent.mouseDown(document.body);

			// 下拉应收起
			expect(trigger).toHaveAttribute("aria-expanded", "false");
		});

		it("h) 点击下拉内部区域不收起", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			const trigger = screen.getByTestId("provider-dropdown-trigger");

			// 先展开下拉
			fireEvent.click(trigger);
			expect(trigger).toHaveAttribute("aria-expanded", "true");

			// 点击菜单项名称按钮（属于容器内部），不应收起
			const optionBtn = screen.getByRole("button", {
				name: "选择 OpenAI 官方",
			});
			// 注意：点击选项会触发选中逻辑导致收起，此处用 mousedown 测试外部判定逻辑
			// 触发 mousedown 在选项按钮上（容器内部），不应因外部判定收起
			fireEvent.mouseDown(optionBtn);

			// 因 mousedown 在容器内部，不应收起（仍展开）
			expect(trigger).toHaveAttribute("aria-expanded", "true");
		});
	});

	describe("激活项高亮", () => {
		it("i) 当前激活项有高亮样式（--active className）", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai, customProvider1]}
					activeProviderId="openai"
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			// 找到激活项（role=option 且 aria-selected=true）
			const options = screen.getAllByRole("option");
			expect(options).toHaveLength(2);

			// 第一个（openai）应被选中
			expect(options[0]).toHaveAttribute("aria-selected", "true");
			expect(options[0].className).toContain(
				"bili-agent-model-settings__custom-dropdown-item--active",
			);

			// 第二个（custom-1）应未被选中
			expect(options[1]).toHaveAttribute("aria-selected", "false");
			expect(options[1].className).not.toContain(
				"bili-agent-model-settings__custom-dropdown-item--active",
			);
		});

		it("i) 无激活项时所有选项均不高亮", () => {
			render(
				<ProviderList
					providers={[builtInProviderOpenai]}
					activeProviderId={null}
					onSelectActive={vi.fn()}
					onDelete={vi.fn()}
					onAddCustom={vi.fn()}
				/>,
			);

			// 展开下拉
			fireEvent.click(screen.getByTestId("provider-dropdown-trigger"));

			const options = screen.getAllByRole("option");
			expect(options).toHaveLength(1);
			expect(options[0]).toHaveAttribute("aria-selected", "false");
			expect(options[0].className).not.toContain(
				"bili-agent-model-settings__custom-dropdown-item--active",
			);
		});
	});
});
