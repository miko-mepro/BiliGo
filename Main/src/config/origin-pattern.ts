import { BUILT_IN_PROVIDERS } from '../lib/shared-types/provider.js'

/**
 * IPv4 地址正则：匹配 0-255.0-255.0-255.0-255 形式。
 * 仅用于区分 IP 与域名，不校验字段范围（如 999.999.999.999 也能匹配，但不影响判定逻辑）。
 */
const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/

/**
 * 判断 hostname 是否为 loopback 地址。
 *
 * loopback 包括：
 * - localhost（DNS 名称）
 * - 127.0.0.1（IPv4 loopback）
 * - [::1]（IPv6 loopback，WHATWG URL.hostname 对 IPv6 带方括号）
 *
 * @param hostname - URL.hostname 返回值（端口已剥离）
 * @returns 是否为 loopback
 */
function isLoopback(hostname: string): boolean {
	const normalized = hostname.toLowerCase()
	return (
		normalized === 'localhost' ||
		normalized === '127.0.0.1' ||
		normalized === '[::1]'
	)
}

/**
 * 判断 hostname 是否为 IP 地址。
 *
 * 支持 IPv4 与 IPv6（IPv6 在 URL.hostname 中带方括号，如 [::1]）。
 * loopback 的 IP 形式同样会被判为 IP。
 *
 * @param hostname - URL.hostname 返回值
 * @returns 是否为 IP 地址
 */
function isIpAddress(hostname: string): boolean {
	// IPv6 在 URL.hostname 中带方括号
	if (hostname.startsWith('[') && hostname.endsWith(']')) {
		return true
	}
	return IPV4_PATTERN.test(hostname)
}

/**
 * 解析 baseUrl 的最小 origin 通配模式，供 chrome.permissions.request({origins:[pattern]}) 使用。
 *
 * 规则：
 * 1. 协议必须为 http 或 https，否则返回空字符串（不可申请）
 * 2. loopback（localhost / 127.0.0.1 / ::1）：http(s)://host/*（不含通配，已是最小单位）
 * 3. IP 地址：http(s)://ip/*（不含通配，IP 已是最小单位）
 * 4. 普通域名：http(s)://*.hostname/*（用 *. 前缀通配所有子域）
 * 5. 端口不写入 pattern（用协议默认端口；URL.hostname 已剥离端口）
 * 6. 路径统一用 /* 通配
 *
 * 示例：
 * - https://api.example.com/v1 -> https://*.api.example.com/*
 * - http://localhost:11434/v1 -> http://localhost/*
 * - http://127.0.0.1:8080 -> http://127.0.0.1/*
 * - https://api.deepseek.com -> https://*.api.deepseek.com/*
 *
 * @param baseUrl - 待解析的 baseUrl（可能含端口和路径）
 * @returns origin 通配模式字符串；解析失败返回空字符串（不可申请）
 */
export function resolveOriginPattern(baseUrl: string): string {
	// 防御非字符串或空输入
	if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
		return ''
	}

	let parsed: URL
	try {
		parsed = new URL(baseUrl)
	} catch {
		// 无效 URL -> 不可申请
		return ''
	}

	// 协议必须是 http 或 https
	const protocol = parsed.protocol
	if (protocol !== 'http:' && protocol !== 'https:') {
		return ''
	}
	const scheme = protocol.slice(0, -1) // 去掉冒号：'http' / 'https'

	const hostname = parsed.hostname
	if (hostname === '') {
		return ''
	}

	// loopback / IP -> 不含通配，已是最小单位
	if (isLoopback(hostname) || isIpAddress(hostname)) {
		return `${scheme}://${hostname}/*`
	}

	// 普通域名 -> *.hostname 通配所有子域
	return `${scheme}://*.${hostname}/*`
}

/**
 * 收集内置 provider 的 hostname 列表。
 *
 * 遍历 BUILT_IN_PROVIDERS 的 baseUrl，用 URL 解析出 hostname（忽略端口与路径）。
 * 内置 baseUrl 解析失败（不应发生）会被跳过。
 *
 * @returns 内置 provider hostname 数组（已转小写）
 */
function collectBuiltInHostnames(): string[] {
	const hosts: string[] = []
	for (const info of Object.values(BUILT_IN_PROVIDERS)) {
		try {
			const u = new URL(info.baseUrl)
			const host = u.hostname.toLowerCase()
			if (host !== '') {
				hosts.push(host)
			}
		} catch {
			// 内置 provider baseUrl 应总是合法；跳过异常保证健壮性
		}
	}
	return hosts
}

/**
 * 模块级缓存：内置 provider 的 hostname 列表。
 *
 * 在模块首次加载时通过 IIFE 一次性收集，避免每次 isBuiltInProviderOrigin
 * 调用都重复遍历 BUILT_IN_PROVIDERS（origin 校验处于请求热路径）。
 * BUILT_IN_PROVIDERS 在编译期固化，运行期不可变，故缓存安全。
 */
const BUILT_IN_HOSTNAMES = collectBuiltInHostnames()

/**
 * 判断给定 baseUrl 是否为内置 provider 的 origin。
 *
 * 通过比较 URL hostname 判定（忽略端口、路径、协议）。
 * 采用 hostname 严格相等比较，天然防御域名欺骗：
 * - `api.openai.com.evil.com` 的 hostname 是 `api.openai.com.evil.com`，
 *   不等于 `api.openai.com`，返回 false。
 *
 * @param baseUrl - 待判定的 baseUrl
 * @returns true 表示该 origin 属于内置 provider
 */
export function isBuiltInProviderOrigin(baseUrl: string): boolean {
	if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
		return false
	}

	let parsed: URL
	try {
		parsed = new URL(baseUrl)
	} catch {
		return false
	}

	const hostname = parsed.hostname.toLowerCase()
	if (hostname === '') {
		return false
	}

	// 严格 hostname 相等比较，防御前缀/后缀欺骗
	return BUILT_IN_HOSTNAMES.includes(hostname)
}
