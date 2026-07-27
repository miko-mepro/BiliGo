import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderForm } from "../../../src/components/model-settings/ProviderForm.tsx";
import type { ProviderConfig } from "../../../src/lib/shared-types/provider.js";

/**
 * ProviderForm 组件测试
 *
 * 覆盖点：
 * a) 内置 provider 不渲染 name/format/baseUrl 字段
 * b) 自定义 provider 渲染全部 5 字段
 * c) apiKey 为空且非 ollama + touched 后显示错误
 * d) ollama 即使 apiKey 为空也不报错（例外）
 * e) baseUrl 非法格式 + touched 后显示 URL 错误
 * f) model 为空 + touched 后显示错误
 * g) onChange 回调在字段变更时被调用且传入正确的 next provider
 */

/** 内置 provider 基础 mock 数据（OpenAI 官方） */
const builtInProvider: ProviderConfig = {
	id: "openai",
	name: "OpenAI 官方",
	format: "openai",
	baseUrl: "https://api.openai.com/v1",
	apiKey: "sk-test-key",
	model: "gpt-4",
	isBuiltIn: true,
	isCustom: false,
};

/** 自定义 provider 基础 mock 数据 */
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

/** ollama 内置 provider mock 数据（apiKey 例外场景） */
const ollamaProvider: ProviderConfig = {
	id: "ollama",
	name: "Ollama 本地",
	format: "openai",
	baseUrl: "http://localhost:11434/v1",
	apiKey: "",
	model: "llama3",
	isBuiltIn: true,
	isCustom: false,
};

describe("ProviderForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	describe("字段渲染", () => {
		it("内置 provider（isCustom:false）不渲染 name/format/baseUrl，只渲染 apiKey + model", () => {
			render(<ProviderForm provider={builtInProvider} onChange={vi.fn()} />);

			// 内置 provider 不应渲染名称、API 格式、Base URL 三个字段
			expect(screen.queryByLabelText("名称")).not.toBeInTheDocument();
			expect(screen.queryByLabelText("API 格式")).not.toBeInTheDocument();
			expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();

			// 内置 provider 仍渲染 API Key 与模型字段
			expect(screen.getByLabelText("API Key")).toBeInTheDocument();
			expect(screen.getByLabelText("模型")).toBeInTheDocument();
		});

		it("自定义 provider（isCustom:true）渲染全部 5 字段", () => {
			render(<ProviderForm provider={customProvider} onChange={vi.fn()} />);

			// 自定义 provider 应渲染全部 5 个字段
			expect(screen.getByLabelText("名称")).toBeInTheDocument();
			expect(screen.getByLabelText("API 格式")).toBeInTheDocument();
			expect(screen.getByLabelText("Base URL")).toBeInTheDocument();
			expect(screen.getByLabelText("API Key")).toBeInTheDocument();
			expect(screen.getByLabelText("模型")).toBeInTheDocument();
		});

		it('根元素含 data-testid="provider-form"', () => {
			render(<ProviderForm provider={builtInProvider} onChange={vi.fn()} />);

			expect(screen.getByTestId("provider-form")).toBeInTheDocument();
		});
	});

	describe("apiKey 校验", () => {
		it("apiKey 为空且非 ollama + touched 后显示错误提示", () => {
			const emptyKeyProvider: ProviderConfig = {
				...customProvider,
				apiKey: "",
			};
			render(<ProviderForm provider={emptyKeyProvider} onChange={vi.fn()} />);

			// 触发 apiKey 字段失焦，标记为 touched
			const apiKeyInput = screen.getByLabelText("API Key");
			fireEvent.blur(apiKeyInput);

			// 应显示"API Key 不能为空"错误提示
			expect(screen.getByText("API Key 不能为空")).toBeInTheDocument();
		});

		it("ollama 即使 apiKey 为空也不报错（例外）", () => {
			render(<ProviderForm provider={ollamaProvider} onChange={vi.fn()} />);

			// 触发 apiKey 字段失焦，标记为 touched
			const apiKeyInput = screen.getByLabelText("API Key");
			fireEvent.blur(apiKeyInput);

			// ollama 不应显示 apiKey 必填错误
			expect(screen.queryByText("API Key 不能为空")).not.toBeInTheDocument();
		});

		it("apiKey 非空时不显示错误提示", () => {
			render(<ProviderForm provider={builtInProvider} onChange={vi.fn()} />);

			// 触发 apiKey 字段失焦
			fireEvent.blur(screen.getByLabelText("API Key"));

			// 有值时不应显示错误
			expect(screen.queryByText("API Key 不能为空")).not.toBeInTheDocument();
		});

		it("apiKey 为空但未 touched 时不显示错误提示", () => {
			const emptyKeyProvider: ProviderConfig = {
				...customProvider,
				apiKey: "",
			};
			render(<ProviderForm provider={emptyKeyProvider} onChange={vi.fn()} />);

			// 未触发失焦前不应显示错误
			expect(screen.queryByText("API Key 不能为空")).not.toBeInTheDocument();
		});
	});

	describe("baseUrl 校验", () => {
		it("baseUrl 非法格式 + touched 后显示 URL 错误提示", () => {
			const invalidUrlProvider: ProviderConfig = {
				...customProvider,
				baseUrl: "not-a-valid-url",
			};
			render(<ProviderForm provider={invalidUrlProvider} onChange={vi.fn()} />);

			// 触发 baseUrl 字段失焦，标记为 touched
			const baseUrlInput = screen.getByLabelText("Base URL");
			fireEvent.blur(baseUrlInput);

			// 应显示 Base URL 格式错误提示
			expect(screen.getByText("Base URL 格式不合法")).toBeInTheDocument();
		});

		it("baseUrl 合法格式 + touched 后不显示错误", () => {
			render(<ProviderForm provider={customProvider} onChange={vi.fn()} />);

			// 触发 baseUrl 字段失焦
			fireEvent.blur(screen.getByLabelText("Base URL"));

			// 合法 URL 不应显示错误
			expect(screen.queryByText("Base URL 格式不合法")).not.toBeInTheDocument();
		});

		it("baseUrl 非法格式但未 touched 时不显示错误", () => {
			const invalidUrlProvider: ProviderConfig = {
				...customProvider,
				baseUrl: "not-a-valid-url",
			};
			render(<ProviderForm provider={invalidUrlProvider} onChange={vi.fn()} />);

			// 未触发失焦前不应显示错误
			expect(screen.queryByText("Base URL 格式不合法")).not.toBeInTheDocument();
		});
	});

	describe("model 校验", () => {
		it("model 为空 + touched 后显示错误提示", () => {
			const emptyModelProvider: ProviderConfig = {
				...builtInProvider,
				model: "",
			};
			render(<ProviderForm provider={emptyModelProvider} onChange={vi.fn()} />);

			// 触发 model 字段失焦，标记为 touched
			const modelInput = screen.getByLabelText("模型");
			fireEvent.blur(modelInput);

			// 应显示"模型不能为空"错误提示
			expect(screen.getByText("模型不能为空")).toBeInTheDocument();
		});

		it("model 非空时不显示错误提示", () => {
			render(<ProviderForm provider={builtInProvider} onChange={vi.fn()} />);

			// 触发 model 字段失焦
			fireEvent.blur(screen.getByLabelText("模型"));

			// 有值时不应显示错误
			expect(screen.queryByText("模型不能为空")).not.toBeInTheDocument();
		});

		it("model 为空但未 touched 时不显示错误", () => {
			const emptyModelProvider: ProviderConfig = {
				...builtInProvider,
				model: "",
			};
			render(<ProviderForm provider={emptyModelProvider} onChange={vi.fn()} />);

			// 未触发失焦前不应显示错误
			expect(screen.queryByText("模型不能为空")).not.toBeInTheDocument();
		});
	});

	describe("name 校验", () => {
		it("name 为空 + touched 后显示错误提示", () => {
			const emptyNameProvider: ProviderConfig = {
				...customProvider,
				name: "",
			};
			render(<ProviderForm provider={emptyNameProvider} onChange={vi.fn()} />);

			// 触发 name 字段失焦，标记为 touched
			const nameInput = screen.getByLabelText("名称");
			fireEvent.blur(nameInput);

			// 应显示"名称不能为空"错误提示
			expect(screen.getByText("名称不能为空")).toBeInTheDocument();
		});

		it("name 非空时不显示错误提示", () => {
			render(<ProviderForm provider={customProvider} onChange={vi.fn()} />);

			// 触发 name 字段失焦
			fireEvent.blur(screen.getByLabelText("名称"));

			// 有值时不应显示错误
			expect(screen.queryByText("名称不能为空")).not.toBeInTheDocument();
		});

		it("name 为空但未 touched 时不显示错误", () => {
			const emptyNameProvider: ProviderConfig = {
				...customProvider,
				name: "",
			};
			render(<ProviderForm provider={emptyNameProvider} onChange={vi.fn()} />);

			// 未触发失焦前不应显示错误
			expect(screen.queryByText("名称不能为空")).not.toBeInTheDocument();
		});
	});

	describe("onChange 回调", () => {
		it("name 字段变更时调用 onChange 并传入正确的 next provider", () => {
			const onChange = vi.fn();
			render(<ProviderForm provider={customProvider} onChange={onChange} />);

			// 修改 name 字段
			const nameInput = screen.getByLabelText("名称");
			fireEvent.change(nameInput, { target: { value: "新名称" } });

			// 验证 onChange 被调用且传入正确的 next provider
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({
				...customProvider,
				name: "新名称",
			});
		});

		it("format 字段变更时调用 onChange 并传入正确的 next provider", () => {
			const onChange = vi.fn();
			render(<ProviderForm provider={customProvider} onChange={onChange} />);

			// 修改 format 字段
			const formatSelect = screen.getByLabelText("API 格式");
			fireEvent.change(formatSelect, { target: { value: "anthropic" } });

			// 验证 onChange 被调用且传入正确的 next provider
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({
				...customProvider,
				format: "anthropic",
			});
		});

		it("baseUrl 字段变更时调用 onChange 并传入正确的 next provider", () => {
			const onChange = vi.fn();
			render(<ProviderForm provider={customProvider} onChange={onChange} />);

			// 修改 baseUrl 字段
			const baseUrlInput = screen.getByLabelText("Base URL");
			fireEvent.change(baseUrlInput, {
				target: { value: "https://new.url/v1" },
			});

			// 验证 onChange 被调用且传入正确的 next provider
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({
				...customProvider,
				baseUrl: "https://new.url/v1",
			});
		});

		it("apiKey 字段变更时调用 onChange 并传入正确的 next provider", () => {
			const onChange = vi.fn();
			render(<ProviderForm provider={builtInProvider} onChange={onChange} />);

			// 修改 apiKey 字段
			const apiKeyInput = screen.getByLabelText("API Key");
			fireEvent.change(apiKeyInput, { target: { value: "sk-new-key" } });

			// 验证 onChange 被调用且传入正确的 next provider
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({
				...builtInProvider,
				apiKey: "sk-new-key",
			});
		});

		it("model 字段变更时调用 onChange 并传入正确的 next provider", () => {
			const onChange = vi.fn();
			render(<ProviderForm provider={builtInProvider} onChange={onChange} />);

			// 修改 model 字段
			const modelInput = screen.getByLabelText("模型");
			fireEvent.change(modelInput, { target: { value: "gpt-4-turbo" } });

			// 验证 onChange 被调用且传入正确的 next provider
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({
				...builtInProvider,
				model: "gpt-4-turbo",
			});
		});
	});
});
