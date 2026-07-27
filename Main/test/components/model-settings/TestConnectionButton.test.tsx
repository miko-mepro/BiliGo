import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestConnectionButton } from "../../../src/components/model-settings/TestConnectionButton.tsx";
import type { ProviderConfig } from "../../../src/lib/shared-types/provider.js";

/**
 * TestConnectionButton 组件测试
 *
 * P5 核心架构差异：经单 Port 发起连接测试（旧仓库用 chrome.runtime.sendMessage）。
 * 测试需 mock chrome.runtime.Port，捕获 onMessage listener 以手动模拟 SW 回复。
 *
 * 覆盖点：
 * a) 初始状态显示"测试连接"按钮
 * b) 点击后状态变 testing，按钮禁用，显示"测试中..."
 * c) 收到 connection_result ok=true 后显示"✓ 连接成功"
 * d) 收到 connection_result ok=false 后显示"✕ 连接失败：{error}"
 * e) 12s 超时后显示"连接超时"（用 vi.useFakeTimers）
 * f) testing 期间再次点击不重复触发
 * g) 组件卸载后移除 onMessage listener（防泄漏）
 */

/** 自定义 provider mock 数据 */
const mockProvider: ProviderConfig = {
	id: "custom-1",
	name: "我的自定义",
	format: "openai",
	baseUrl: "https://api.example.com/v1",
	apiKey: "sk-custom-key",
	model: "gpt-4",
	isBuiltIn: false,
	isCustom: true,
};

/**
 * 创建 mock Port，捕获 onMessage listener 以便测试手动触发 SW 回复。
 *
 * @returns port mock 对象 + triggerMessage 手动触发函数
 */
function createMockPort() {
	let messageListener: ((msg: unknown) => void) | null = null;

	const port = {
		postMessage: vi.fn(),
		onMessage: {
			addListener: vi.fn((listener: (msg: unknown) => void) => {
				// 捕获最新注册的 listener，测试中手动触发以模拟 SW 回复
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

	/** 手动触发 captured listener，模拟 SW 回复 connection_result */
	const triggerMessage = (msg: unknown) => {
		if (messageListener !== null) {
			messageListener(msg);
		}
	};

	return { port: port as unknown as chrome.runtime.Port, triggerMessage };
}

describe("TestConnectionButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	describe("初始状态与渲染", () => {
		it(`初始状态显示"测试连接"按钮`, () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 初始状态按钮文字为"测试连接"
			const button = screen.getByTestId("test-connection-button");
			expect(button).toBeInTheDocument();
			expect(button).toHaveTextContent("测试连接");
			// 初始未禁用
			expect(button).not.toBeDisabled();
		});

		it('根元素含 data-testid="test-connection-button"', () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			expect(screen.getByTestId("test-connection-button")).toBeInTheDocument();
		});

		it("初始状态不显示任何结果文案", () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// idle 态无结果文案
			expect(
				screen.queryByTestId("test-connection-result"),
			).not.toBeInTheDocument();
		});
	});

	describe("点击触发测试", () => {
		it(`点击后状态变 testing，按钮禁用，显示"测试中..."`, () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 点击按钮触发测试
			const button = screen.getByTestId("test-connection-button");
			fireEvent.click(button);

			// testing 态：按钮禁用 + 文字变"测试中..."
			expect(button).toBeDisabled();
			expect(button).toHaveTextContent("测试中...");
			// aria-busy 标记为 true
			expect(button).toHaveAttribute("aria-busy", "true");
		});

		it("点击后经 Port 发送 test_connection 消息", () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 验证经单 Port 发送了正确的消息（P5 核心架构差异）
			expect(port.postMessage).toHaveBeenCalledTimes(1);
			expect(port.postMessage).toHaveBeenCalledWith({
				type: "test_connection",
				provider: mockProvider,
			});
		});

		it("点击后注册 onMessage listener 监听 SW 回复", () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 验证注册了 onMessage listener
			expect(port.onMessage.addListener).toHaveBeenCalledTimes(1);
		});
	});

	describe("收到 connection_result 回复", () => {
		it(`收到 ok=true 后显示"✓ 连接成功"`, async () => {
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 点击触发测试
			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 模拟 SW 回复成功
			triggerMessage({ type: "connection_result", ok: true });

			// 等待 React 处理 async 状态更新
			const result = await screen.findByTestId("test-connection-result");
			expect(result).toHaveTextContent("✓ 连接成功");
			// 结果元素带 ok 样式类
			expect(result).toHaveClass("bili-agent-model-settings__test-result--ok");
			// 按钮恢复可用，文字恢复"测试连接"
			const button = screen.getByTestId("test-connection-button");
			expect(button).not.toBeDisabled();
			expect(button).toHaveTextContent("测试连接");
		});

		it(`收到 ok=false 后显示"✕ 连接失败：{error}"`, async () => {
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 点击触发测试
			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 模拟 SW 回复失败，带错误信息
			triggerMessage({
				type: "connection_result",
				ok: false,
				error: "API Key 无效",
			});

			// 等待 React 处理 async 状态更新
			const result = await screen.findByTestId("test-connection-result");
			expect(result).toHaveTextContent("✕ 连接失败：API Key 无效");
			// 结果元素带 fail 样式类
			expect(result).toHaveClass(
				"bili-agent-model-settings__test-result--fail",
			);
			// 失败结果带 role="alert" 供无障碍读屏
			expect(result).toHaveAttribute("role", "alert");
		});

		it(`收到 ok=false 无 error 字段时显示"未知错误"`, async () => {
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 模拟 SW 回复失败但无 error 字段
			triggerMessage({ type: "connection_result", ok: false });

			const result = await screen.findByTestId("test-connection-result");
			expect(result).toHaveTextContent("✕ 连接失败：未知错误");
		});

		it("收到非 connection_result 类型消息时忽略", () => {
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 模拟收到其他类型消息（如 chunk），不应影响状态
			triggerMessage({ type: "chunk", delta: "hello" });

			// 仍在 testing 态，未显示结果
			expect(
				screen.queryByTestId("test-connection-result"),
			).not.toBeInTheDocument();
			expect(screen.getByTestId("test-connection-button")).toHaveTextContent(
				"测试中...",
			);
		});
	});

	describe("前端 12s 超时兜底", () => {
		it(`12s 超时后显示"连接超时"`, async () => {
			vi.useFakeTimers();
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 点击触发测试（不模拟 SW 回复，让超时兜底触发）
			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 推进假时钟 12 秒，触发前端超时兜底
			// 需要用 act 包裹确保 React 状态更新被 flush
			await act(async () => {
				await vi.advanceTimersByTimeAsync(12_000);
			});

			// 超时后应同步渲染出结果（用 getByTestId 而非 findByTestId，
			// 因为 findByTestId 依赖 setTimeout 轮询，与 fakeTimers 冲突）
			const result = screen.getByTestId("test-connection-result");
			expect(result).toHaveTextContent("连接超时");
			expect(result).toHaveClass(
				"bili-agent-model-settings__test-result--fail",
			);

			vi.useRealTimers();
		});

		it("12s 内收到 SW 回复则不触发超时", async () => {
			vi.useFakeTimers();
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));

			// 在超时前模拟 SW 回复成功
			triggerMessage({ type: "connection_result", ok: true });

			// flush microtask 队列，让 async handleClick 完成并更新 React 状态
			await act(async () => {});

			// 用 getByTestId 而非 findByTestId（fakeTimers 下 findBy 轮询永不触发）
			const result = screen.getByTestId("test-connection-result");
			expect(result).toHaveTextContent("✓ 连接成功");

			// 继续推进假时钟超过 12s，不应再触发超时覆盖结果
			await act(async () => {
				await vi.advanceTimersByTimeAsync(13_000);
			});
			expect(result).toHaveTextContent("✓ 连接成功");

			vi.useRealTimers();
		});
	});

	describe("防重复触发", () => {
		it("testing 期间再次点击不重复触发 postMessage", () => {
			const { port } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			// 第一次点击触发测试
			const button = screen.getByTestId("test-connection-button");
			fireEvent.click(button);
			expect(port.postMessage).toHaveBeenCalledTimes(1);

			// testing 期间再次点击，按钮已禁用，不重复触发
			fireEvent.click(button);
			expect(port.postMessage).toHaveBeenCalledTimes(1);
		});
	});

	describe("卸载清理防泄漏", () => {
		it("组件卸载后移除 onMessage listener", () => {
			const { port } = createMockPort();
			const { unmount } = render(
				<TestConnectionButton provider={mockProvider} port={port} />,
			);

			// 点击触发 listener 注册
			fireEvent.click(screen.getByTestId("test-connection-button"));
			expect(port.onMessage.addListener).toHaveBeenCalledTimes(1);

			// 卸载组件
			unmount();

			// 验证卸载时移除了 onMessage listener，防止内存泄漏
			expect(port.onMessage.removeListener).toHaveBeenCalledTimes(1);
		});

		it("测试完成后也清理 listener（无需卸载）", async () => {
			const { port, triggerMessage } = createMockPort();
			render(<TestConnectionButton provider={mockProvider} port={port} />);

			fireEvent.click(screen.getByTestId("test-connection-button"));
			expect(port.onMessage.addListener).toHaveBeenCalledTimes(1);

			// 模拟 SW 回复，测试完成后应清理 listener
			triggerMessage({ type: "connection_result", ok: true });

			// 用 act 刷新微任务队列，让异步 handleClick 完成
			await act(async () => {});

			// 等待 React 渲染出结果
			expect(screen.getByTestId("test-connection-result")).toHaveTextContent(
				"✓ 连接成功",
			);

			// 测试完成后应已移除 listener
			expect(port.onMessage.removeListener).toHaveBeenCalledTimes(1);
		});
	});
});
