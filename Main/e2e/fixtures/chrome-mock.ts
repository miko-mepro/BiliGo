/**
 * Chrome Storage Seed Fixture - E2E 测试用真实 chrome.storage 播种工具
 *
 * 架构变更说明（P5-2.1 reviewer REJECTED 修复）：
 * 原方案用 page.addInitScript 注入 chrome API mock 到页面 main world，
 * 但 MV3 content script 运行在 isolated world，与 main world 不共享 window，
 * 导致 mock 对 content script 完全无效。
 *
 * 新方案（方案 B）：保留 playwright.config.ts 的 --load-extension，测试真实扩展加载。
 * content script 由 Chrome 扩展机制自动注入到 isolated world，使用真实 chrome API。
 * 本 fixture 不再 mock chrome API，而是通过 page.evaluate 调用真实 chrome.storage.local.set
 * 播种测试用 settings 数据到扩展的真实存储区。
 *
 * 设计依据：4.5 SC-4 + §0.1 E2E 默认使用可控 mock/fixture
 * 参照旧仓库 Backend/BiliAgent/packages/extension/e2e/smoke.spec.ts
 */

// 仅导入类型（用 import type 避免把值引入 e2e bundle，减少 e2e 依赖）
import type { ProviderConfig } from "../../src/lib/shared-types/provider.js";
// 从 settings.ts 导入真实的 SETTINGS_STORAGE_KEY，消除本地重复定义（reviewer LOW 修复）
// 同时重新导出，供 extension-harness 等消费方使用（保持 fixture 的公共 API 兼容）
import { SETTINGS_STORAGE_KEY } from "../../src/config/settings.js";
export { SETTINGS_STORAGE_KEY };

/** 存储区名称，对齐 chrome.storage.onChanged 的 AreaName 类型 */
export type StorageAreaName = "local" | "session" | "sync" | "managed";

/** chrome.storage.StorageChange 对应结构 */
export interface StorageChange {
	oldValue?: unknown;
	newValue?: unknown;
}

/** chrome.permissions.Permissions 对应结构 */
export interface ChromePermissions {
	origins?: string[];
	permissions?: string[];
}

/**
 * 种子 settings 类型，与 BiliAgentSettings 对齐但放宽为 fixture 友好形态。
 * 设计依据：Main/src/config/settings.ts BiliAgentSettings
 */
export interface SeedSettings {
	providers: ProviderConfig[];
	activeProviderId: string | null;
	themeMode?: "auto" | "light" | "dark";
}

/** 存储播种选项（精简后：方案 B 不再需要 permissionsGranted 等运行时 mock 选项） */
export interface StorageSeedOptions {
	/** 预置写入 chrome.storage.local 的 settings 键值 */
	settings?: SeedSettings | null;
	/** settings 在 storage.local 中的存储键名（默认 SETTINGS_STORAGE_KEY） */
	settingsKey?: string;
}

/**
 * 构造一份带 openrouter 内置 provider + 测试 apiKey 的种子 settings。
 * 设计依据：4.5 §0.1 E2E 默认使用可控 mock/fixture - 不依赖真实 API Key。
 */
export function seedSettings(): SeedSettings {
	const openrouter: ProviderConfig = {
		id: "openrouter",
		name: "OpenRouter",
		format: "openai",
		baseUrl: "https://openrouter.ai/api/v1",
		apiKey: "test-key",
		model: "openai/gpt-4o-mini",
		isBuiltIn: true,
		isCustom: false,
	};
	return {
		providers: [openrouter],
		activeProviderId: "openrouter",
		themeMode: "auto",
	};
}

/**
 * 构造一份空 settings（activeProviderId=null，用于触发"未配置 provider"错误路径）。
 */
export function emptySettings(): SeedSettings {
	return {
		providers: [],
		activeProviderId: null,
		themeMode: "auto",
	};
}

/**
 * 通过 page.evaluate 操纵真实 chrome.storage.local 播种 settings 数据。
 *
 * 方案 B 核心：--load-extension 加载的扩展可访问真实 chrome API，
 * content script 和 service worker 都在 isolated world / 扩展上下文中，
 * 因此 page.evaluate 执行的 chrome.storage.local.set 会写入扩展真实存储区，
 * 随后扩展代码读取 storage 时能拿到播种的数据。
 *
 * 注意：page.evaluate 默认在页面 main world 执行，但 chrome.storage API
 * 在 --load-extension 环境下对页面上下文可用（Chrome 扩展权限授予后）。
 * 若页面上下文无法访问 chrome.storage（部分 MV3 配置），调用方应改用
 * service worker 上下文执行（通过 chrome.runtime.sendMessage 中转）。
 *
 * @param page Playwright Page 对象（需已加载扩展）
 * @param settings 要播种的 settings 数据（若为 null 则清除存储）
 * @param settingsKey 存储键名（默认 SETTINGS_STORAGE_KEY）
 */
export async function seedSettingsToStorage(
	page: import("@playwright/test").Page,
	settings: SeedSettings | null,
	settingsKey: string = SETTINGS_STORAGE_KEY,
): Promise<void> {
	if (settings === null) {
		// 清除存储区中的 settings 键
		await page.evaluate(
			(key: string) => chrome.storage.local.remove(key),
			settingsKey,
		);
		return;
	}
	// 播种 settings 到真实 chrome.storage.local
	await page.evaluate(
		({ key, data }: { key: string; data: SeedSettings }) =>
			chrome.storage.local.set({ [key]: data }),
		{ key: settingsKey, data: settings },
	);
}

/**
 * 生成一段在 page.evaluate 中执行的存储播种脚本字符串。
 *
 * 与 seedSettingsToStorage 功能等价，但返回字符串形式，
 * 便于在需要批量初始化或嵌入 page.addScriptTag 的场景使用。
 * 脚本在页面上下文执行，调用真实 chrome.storage.local.set。
 *
 * @param options 播种选项
 * @returns 可在 page.evaluate 中执行的 JS 表达式字符串
 */
export function buildStorageSeedScript(options: StorageSeedOptions = {}): string {
	const settings = options.settings ?? null;
	const settingsKey = options.settingsKey ?? SETTINGS_STORAGE_KEY;

	if (settings === null) {
		// 清除存储
		return `chrome.storage.local.remove(${JSON.stringify(settingsKey)})`;
	}
	// 播种 settings：用 JSON.stringify 嵌入数据，避免闭包序列化问题
	return `chrome.storage.local.set({ ${JSON.stringify(settingsKey)}: ${JSON.stringify(settings)} })`;
}

// ===========================================================================
// Mock Port Pair - 用于单元测试或非浏览器场景的 Port 模拟
// ===========================================================================

/**
 * Port 监听器回调类型（对齐 chrome.runtime.Port 的事件接口）
 */
type PortListener = (...args: unknown[]) => void;

/**
 * 简易事件分发器：管理监听器列表，提供 addListener/removeListener/hasListener。
 * 模拟 chrome.runtime.Port 的事件对象接口。
 */
class SimpleEventEmitter {
	private readonly listeners: PortListener[] = [];

	addListener(cb: PortListener): void {
		this.listeners.push(cb);
	}

	removeListener(cb: PortListener): void {
		const idx = this.listeners.indexOf(cb);
		if (idx >= 0) {
			this.listeners.splice(idx, 1);
		}
	}

	hasListener(cb: PortListener): boolean {
		return this.listeners.indexOf(cb) >= 0;
	}

	/** 触发所有监听器（内部使用） */
	protected dispatch(...args: unknown[]): void {
		for (const listener of this.listeners) {
			listener(...args);
		}
	}

	/** 监听器数量（测试用） */
	get size(): number {
		return this.listeners.length;
	}
}

/**
 * 可触发的事件分发器：在 SimpleEventEmitter 基础上暴露 dispatch 方法，
 * 供互联 Port pair 中一端触发另一端的事件。
 */
class TriggerableEventEmitter extends SimpleEventEmitter {
	dispatch(...args: unknown[]): void {
		super.dispatch(...args);
	}
}

/**
 * Mock Port 接口：对齐 chrome.runtime.Port 的子集，用于单元测试。
 */
export interface MockPort {
	name: string;
	sender: unknown;
	onMessage: SimpleEventEmitter;
	onDisconnect: SimpleEventEmitter;
	postMessage: (msg: unknown) => void;
	disconnect: () => void;
}

/**
 * Mock Port Pair：一对互联的 Port，一端 postMessage 触发另一端 onMessage。
 *
 * 修复原 createMockPort 的语义错误：原实现中 postMessage 触发的是
 * 本端 onMessage（回环），正确语义应是触发对端 onMessage。
 *
 * 用途：
 * - 单元测试中模拟 CS <-> SW 双向通信
 * - 非 --load-extension 场景下的 Port 行为模拟
 *
 * @param name Port 名称（默认 'bili-agent-chat'）
 * @returns { client, service } 互联的 Port pair
 */
export function createMockPortPair(name = "bili-agent-chat"): {
	client: MockPort;
	service: MockPort;
} {
	// 客户端 -> 服务端的消息事件分发器（服务端监听，客户端触发）
	const clientToService = new TriggerableEventEmitter();
	// 服务端 -> 客户端的消息事件分发器（客户端监听，服务端触发）
	const serviceToClient = new TriggerableEventEmitter();
	// 客户端断开事件（服务端监听）
	const clientDisconnect = new TriggerableEventEmitter();
	// 服务端断开事件（客户端监听）
	const serviceDisconnect = new TriggerableEventEmitter();

	let clientDisconnected = false;
	let serviceDisconnected = false;

	const client: MockPort = {
		name,
		sender: undefined,
		// 客户端监听服务端发来的消息
		onMessage: serviceToClient,
		// 客户端监听服务端断开
		onDisconnect: serviceDisconnect,
		// 客户端发消息 -> 触发服务端 onMessage
		postMessage: (msg: unknown) => {
			if (clientDisconnected) return;
			clientToService.dispatch(msg, undefined);
		},
		disconnect: () => {
			if (clientDisconnected) return;
			clientDisconnected = true;
			clientDisconnect.dispatch(undefined);
		},
	};

	const service: MockPort = {
		name,
		sender: undefined,
		// 服务端监听客户端发来的消息
		onMessage: clientToService,
		// 服务端监听客户端断开
		onDisconnect: clientDisconnect,
		// 服务端发消息 -> 触发客户端 onMessage
		postMessage: (msg: unknown) => {
			if (serviceDisconnected) return;
			serviceToClient.dispatch(msg, undefined);
		},
		disconnect: () => {
			if (serviceDisconnected) return;
			serviceDisconnected = true;
			serviceDisconnect.dispatch(undefined);
		},
	};

	return { client, service };
}
