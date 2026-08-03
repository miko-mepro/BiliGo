import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page, Worker } from "@playwright/test";

/** 运行时证据中的单条网络摘要，不保存 query、header 或 body。 */
interface NetworkEvidence {
	at: string;
	method?: string;
	resourceType?: string;
	status?: number;
	url: string;
}

/** 只记录非敏感 DOM 结构状态，避免把页面文本写入证据文件。 */
export interface DomSnapshot {
	at: string;
	hostExists: boolean;
	label: string;
	panelExists: boolean;
	shadowExists: boolean;
	scrollIntoViewCount: number;
	toggleExists: boolean;
	toggleVisible: boolean;
}

/** 每个测试用例最终落盘的运行时证据结构。 */
interface RuntimeEvidence {
	browserDisconnectedAt: string[];
	domSnapshots: DomSnapshot[];
	finishedAt: string | null;
	pageConsole: Array<{ at: string; type: string; text: string }>;
	pageErrors: Array<{ at: string; text: string }>;
	requests: NetworkEvidence[];
	responses: NetworkEvidence[];
	serviceWorkerConsole: Array<{ at: string; type: string; text: string }>;
	serviceWorkers: string[];
	startedAt: string;
	requestFailures: Array<{ at: string; error: string; url: string }>;
}

/** 供 fixture 与 harness 共享的运行时证据操作。 */
export interface RuntimeEvidenceCollector {
	flush(page: Page, outputPath: string): Promise<void>;
	recordDomSnapshot(page: Page, label: string): Promise<void>;
}

const collectors = new WeakMap<Page, RuntimeEvidenceCollector>();
const SENSITIVE_TEXT =
	/api[-_ ]?key|authorization|cookie|token|bearer|secret|sk-[a-z0-9]/i;
const MAX_TEXT_LENGTH = 200;

/** 用时间戳统一标记跨页面、service worker 和网络事件。 */
function timestamp(): string {
	return new Date().toISOString();
}

/** URL 只保留 origin 与 pathname，避免 query 参数泄漏凭据。 */
function redactUrl(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		if (url.origin === "null") return `${url.protocol}//${url.host}${url.pathname}`.slice(0, MAX_TEXT_LENGTH);
		return `${url.origin}${url.pathname}`.slice(0, MAX_TEXT_LENGTH);
	} catch {
		return rawUrl.split(/[?#]/, 1)[0].slice(0, MAX_TEXT_LENGTH);
	}
}

/** 控制台错误命中敏感词时整条替换，而不是尝试逐字段猜测凭据边界。 */
function redactText(rawText: string): string {
	const text = rawText.slice(0, MAX_TEXT_LENGTH);
	return SENSITIVE_TEXT.test(text) ? "[REDACTED SENSITIVE MESSAGE]" : text;
}

/** 采集页面与扩展 service worker 的非敏感运行时边界证据。 */
export async function attachRuntimeEvidence(
	context: BrowserContext,
	page: Page,
): Promise<RuntimeEvidenceCollector> {
	const evidence: RuntimeEvidence = {
		browserDisconnectedAt: [],
		domSnapshots: [],
		finishedAt: null,
		pageConsole: [],
		pageErrors: [],
		requests: [],
		responses: [],
		serviceWorkerConsole: [],
		serviceWorkers: [],
		startedAt: timestamp(),
		requestFailures: [],
	};
	const observedWorkers = new WeakSet<Worker>();

	const observeWorker = (worker: Worker): void => {
		const workerUrl = redactUrl(worker.url());
		if (!evidence.serviceWorkers.includes(workerUrl)) {
			evidence.serviceWorkers.push(workerUrl);
		}
		if (observedWorkers.has(worker)) return;
		observedWorkers.add(worker);
		worker.on("console", (message) => {
			evidence.serviceWorkerConsole.push({
				at: timestamp(),
				text: redactText(message.text()),
				type: message.type(),
			});
		});
	};

	// 已启动和后续启动的扩展 SW 都要监听，覆盖 MV3 回收后重启的情况。
	for (const worker of context.serviceWorkers()) observeWorker(worker);
	context.on("serviceworker", observeWorker);

	// BrowserContext 级别事件覆盖页面与 service worker 发出的请求。
	context.on("request", (request) => {
		evidence.requests.push({
			at: timestamp(),
			method: request.method(),
			resourceType: request.resourceType(),
			url: redactUrl(request.url()),
		});
	});
	context.on("response", (response) => {
		evidence.responses.push({
			at: timestamp(),
			status: response.status(),
			url: redactUrl(response.url()),
		});
	});
	context.on("requestfailed", (request) => {
		evidence.requestFailures.push({
			at: timestamp(),
			error: redactText(request.failure()?.errorText ?? "unknown"),
			url: redactUrl(request.url()),
		});
	});

	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") {
			evidence.pageConsole.push({
				at: timestamp(),
				text: redactText(message.text()),
				type: message.type(),
			});
		}
	});
	page.on("pageerror", (error) => {
		evidence.pageErrors.push({ at: timestamp(), text: redactText(error.message) });
	});
	context.browser()?.on("disconnected", () => {
		evidence.browserDisconnectedAt.push(timestamp());
	});

	// 在页面脚本最早阶段安装计数器，供后续滚动行为验证读取。
	await page.addInitScript(() => {
		const key = "__biliGoScrollIntoViewCount";
		const state = window as unknown as Record<string, number>;
		state[key] = 0;
		const original = Element.prototype.scrollIntoView;
		Element.prototype.scrollIntoView = function (...args) {
			state[key] += 1;
			return original.apply(this, args);
		};
	});

	const collector: RuntimeEvidenceCollector = {
		async recordDomSnapshot(targetPage, label) {
			const snapshot = await targetPage.evaluate<DomSnapshot>((snapshotLabel) => {
				const host = document.getElementById("bili-agent-host");
				const shadow = host?.shadowRoot;
				const toggle = shadow?.querySelector<HTMLElement>(
					"[data-bili-agent-toggle]",
				);
				const panel = shadow?.querySelector("[data-bili-agent-panel]");
				const toggleStyle = toggle ? getComputedStyle(toggle) : null;
				const state = window as unknown as Record<string, number>;
				return {
					at: new Date().toISOString(),
					hostExists: host !== null,
					label: snapshotLabel,
					panelExists: panel !== null,
					shadowExists: shadow !== undefined,
					scrollIntoViewCount: state.__biliGoScrollIntoViewCount ?? 0,
					toggleExists: toggle !== null,
					toggleVisible:
						toggle !== null &&
						toggleStyle?.display !== "none" &&
						toggleStyle?.visibility !== "hidden",
				};
			}, label);
			evidence.domSnapshots.push(snapshot);
		},
		async flush(targetPage, outputPath) {
			try {
				await this.recordDomSnapshot(targetPage, "teardown");
			} catch (error) {
				evidence.pageErrors.push({
					at: timestamp(),
					text: `DOM snapshot failed: ${redactText(String(error))}`,
				});
			}
			evidence.finishedAt = timestamp();
			await fs.mkdir(path.dirname(outputPath), { recursive: true });
			await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
		},
	};

	collectors.set(page, collector);
	return collector;
}

/** 让 harness 在导航、挂载和首渲染三个阶段写入 DOM 时间线。 */
export async function recordDomSnapshot(
	page: Page,
	label: string,
): Promise<void> {
	await collectors.get(page)?.recordDomSnapshot(page, label);
}
