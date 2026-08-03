import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderConfig } from "../../lib/shared-types/provider.js";

/**
 * 连接测试的四种状态。
 * - idle：初始空闲态，可点击发起测试
 * - testing：测试进行中，按钮禁用防重复触发
 * - ok：测试成功
 * - fail：测试失败（含 SW 返回失败或前端超时兜底）
 */
type TestStatus = "idle" | "testing" | "ok" | "fail";

/**
 * 前端超时兜底时间（毫秒）。
 * 略大于 SW 端 10s 超时，确保 SW 优先回结果，
 * 前端兜底仅防 Port 静默断连导致前端无限等待。
 */
const FRONTEND_TIMEOUT_MS = 12_000;

/**
 * SW 回复的连接测试结果载荷。
 * 对应 port-protocol.ts 中 SWMessage 的 connection_result 分支。
 */
interface ConnectionResult {
	ok: boolean;
	error?: string;
	/** 仅供组件内部取消旧请求，取消结果不能更新当前 UI。 */
	cancelled?: boolean;
}

/**
 * 一次连接测试持有的全部异步资源。
 * 将资源绑定到请求对象，避免旧请求完成时清理新请求的 listener/timer。
 */
interface PendingConnection {
	port: chrome.runtime.Port;
	onMessage: (msg: unknown) => void;
	onDisconnect: () => void;
	timer: ReturnType<typeof setTimeout> | null;
	settled: boolean;
	settle: (result: ConnectionResult) => void;
}

/** TestConnectionButton 组件的 props 定义 */
export interface TestConnectionButtonProps {
	/** 待测试的 provider 配置，经 Port 发给 SW 执行实际连接测试 */
	provider: ProviderConfig;
	/**
	 * 与 SW 的单 Port 连接。
	 * 必选 prop（非可选），设计依据 SA-12 硬性契约：经单 Port 发起连接测试。
	 * 旧仓库用 chrome.runtime.sendMessage，P5 改为经单 Port 发送。
	 */
	port: chrome.runtime.Port;
}

/**
 * TestConnectionButton -- 连接测试按钮组件。
 *
 * P5 核心架构差异：旧仓库用 chrome.runtime.sendMessage({type:'testProviderConnection', provider})，
 * 新项目改为经单 Port 发送（设计依据 SA-12 硬性契约经单 Port）。
 *
 * 行为流程：
 * 1. 点击按钮 -> setStatus("testing")
 * 2. port.postMessage({ type: "test_connection", provider }) 经单 Port 发送
 * 3. 监听 port.onMessage 等待 { type: "connection_result" } 回复
 * 4. Promise.race：SW 回复 vs 12s 前端超时兜底，哪个先到用哪个
 * 5. ok=true -> setStatus("ok")；ok=false -> setStatus("fail") + 显示 error
 * 6. 超时 -> setStatus("fail") + 显示"连接超时"
 * 7. 组件卸载时移除 onMessage listener，防止内存泄漏
 *
 * testing 期间按钮禁用，防止重复触发。
 */
export function TestConnectionButton({
	provider,
	port,
}: TestConnectionButtonProps): React.ReactElement {
	// 当前测试状态（四态机）
	const [status, setStatus] = useState<TestStatus>("idle");
	// 失败时的错误信息（SW 返回的 error 或超时文案）
	const [errorMessage, setErrorMessage] = useState<string>("");
	// 是否为前端超时兜底触发的失败（用于区分显示文案）
	const [isTimeout, setIsTimeout] = useState<boolean>(false);

	// 保存当前请求，统一管理 onMessage、onDisconnect 和超时 timer。
	const activeRequestRef = useRef<PendingConnection | null>(null);
	// 每次新测试、Provider 变化或卸载都推进代次，旧闭包返回后必须被忽略。
	const generationRef = useRef(0);

	/**
	 * 清理指定请求持有的监听器与定时器。
	 * 请求完成后的 cleanup 只能清理自身，避免旧 Promise 误删新请求资源。
	 */
	const cleanupRequest = useCallback((request: PendingConnection | null): void => {
		if (!request) return;
		request.port.onMessage.removeListener(request.onMessage);
		request.port.onDisconnect.removeListener(request.onDisconnect);
		if (request.timer !== null) {
			clearTimeout(request.timer);
			request.timer = null;
		}
		if (activeRequestRef.current === request) {
			activeRequestRef.current = null;
		}
	}, []);

	/**
	 * 使当前请求过期并主动结束等待，覆盖 Provider 变化、卸载和重新测试。
	 * generation 先递增，保证取消 Promise 的微任务恢复时也不会写入旧状态。
	 */
	const invalidateRequest = useCallback((): void => {
		generationRef.current += 1;
		const request = activeRequestRef.current;
		if (!request) return;
		request.settle({ ok: false, cancelled: true });
		cleanupRequest(request);
	}, [cleanupRequest]);

	// Provider/Port 变化时取消旧请求；Provider 身份变化由上层 key 触发组件重挂载并重置展示状态。
	useEffect(() => {
		return () => {
			invalidateRequest();
		};
	}, [provider, port, invalidateRequest]);

	/**
	 * 点击按钮触发连接测试。
	 *
	 * 使用 Promise.race 实现 SW 回复与前端 12s 超时兜底的竞速：
	 * - SW 回复 connection_result 先到 -> 按结果更新状态
	 * - 12s 超时先到 -> 显示"连接超时"
	 *
	 * testing 期间禁用按钮，防止重复触发。
	 */
	const handleClick = useCallback(async () => {
		// 已在测试中，防重复触发
		if (status === "testing") {
			return;
		}

		// 新测试使旧请求失效，并记录本次请求的代次。
		invalidateRequest();
		const currentGeneration = generationRef.current;

		setStatus("testing");
		setErrorMessage("");
		setIsTimeout(false);

		let request!: PendingConnection;
		let resolveConnection!: (result: ConnectionResult) => void;

		/**
		 * SW 回复 Promise：监听 port.onMessage，
		 * 收到 connection_result 类型消息时 resolve。
		 */
		const connectionPromise = new Promise<ConnectionResult>((resolve) => {
			resolveConnection = resolve;
			request = {
				port,
				onMessage: () => undefined,
				onDisconnect: () => undefined,
				timer: null,
				settled: false,
				settle: (result: ConnectionResult) => {
					if (request.settled) return;
					request.settled = true;
					resolveConnection(result);
				},
			};

			request.onMessage = (msg: unknown) => {
				// 仅处理 connection_result 类型消息，其他类型忽略
				if (
					typeof msg === "object" &&
					msg !== null &&
					(msg as Record<string, unknown>).type === "connection_result"
				) {
					const result = msg as {
						type: "connection_result";
					} & ConnectionResult;
					request.settle({ ok: result.ok, error: result.error });
				}
			};
			// Port 断开时立即结束等待，不再依赖 12 秒超时兜底。
			request.onDisconnect = () => {
				request.settle({ ok: false, error: "连接已断开" });
			};
			activeRequestRef.current = request;
			port.onMessage.addListener(request.onMessage);
			port.onDisconnect.addListener(request.onDisconnect);
		});

		/**
		 * 12s 超时兜底 Promise：
		 * 略大于 SW 端 10s 超时，确保 SW 优先回结果，
		 * 前端兜底仅防 Port 静默断连导致前端无限等待。
		 */
		const timeoutPromise = new Promise<ConnectionResult>((resolve) => {
			request.timer = setTimeout(() => {
				const result = { ok: false, error: "连接超时" };
				request.settle(result);
				resolve(result);
			}, FRONTEND_TIMEOUT_MS);
		});

		// 经单 Port 发送连接测试请求（P5 核心架构差异：经单 Port 而非 sendMessage）
		// TODO-15：postMessage 可能因 Port 已断开而同步抛错，此处 try/catch 兜底，
		// 防止抛出未捕获异常导致 listener/timer 残留。
		try {
			port.postMessage({ type: "test_connection", provider });
		} catch {
			// 连接已断开：置失败态 + 错误信息 + 清理 listener/timer + 提前返回
			if (generationRef.current === currentGeneration) {
				setStatus("fail");
				setErrorMessage("连接已断开");
				setIsTimeout(false);
			}
			cleanupRequest(request);
			return;
		}

		// Promise.race：SW 回复与超时哪个先到用哪个
		const result = await Promise.race([connectionPromise, timeoutPromise]);
		// Provider 变化、组件卸载或新测试会推进代次，旧结果不得再写入状态。
		if (generationRef.current !== currentGeneration || result.cancelled) {
			cleanupRequest(request);
			return;
		}

		// 根据竞速结果更新状态
		if (result.ok) {
			setStatus("ok");
		} else {
			setStatus("fail");
			setErrorMessage(result.error ?? "未知错误");
			// 超时兜底触发的失败标记，用于区分显示文案
			setIsTimeout(result.error === "连接超时");
		}

		// 测试结束，清理监听器与定时器
		cleanupRequest(request);
	}, [provider, port, status, invalidateRequest, cleanupRequest]);

	return (
		<div>
			<button
				type="button"
				className="bili-agent-model-settings__test-btn"
				data-testid="test-connection-button"
				onClick={handleClick}
				disabled={status === "testing"}
				aria-label="测试连接"
				aria-busy={status === "testing"}
			>
				{status === "testing" ? "测试中..." : "测试连接"}
			</button>
			{/* 测试成功结果显示 */}
			{status === "ok" && (
				<span
					className="bili-agent-model-settings__test-result--ok"
					data-testid="test-connection-result"
					role="status"
				>
					✓ 连接成功
				</span>
			)}
			{/* 测试失败结果显示：超时与普通失败文案区分 */}
			{status === "fail" && (
				<span
					className="bili-agent-model-settings__test-result--fail"
					data-testid="test-connection-result"
					role="alert"
				>
					{isTimeout ? "连接超时" : `✕ 连接失败：${errorMessage}`}
				</span>
			)}
		</div>
	);
}
